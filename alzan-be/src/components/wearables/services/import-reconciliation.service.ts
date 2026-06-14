import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { Json } from '../../../types/database.types';
import { Insert, Row, Update } from '../../../types/requests.types';
import { SupabaseAdminService } from '../../../core/supabase/supabase.service';
import {
  buildActivityTotals,
  buildTemplateTotals,
  deriveActivityStructure,
  deriveTemplateStructure,
  EnduranceStepLike,
  POSSIBLE_MATCH,
  scoreStructuralMatch,
  scoreTotalsMatch,
  STRONG_MATCH,
} from '../../activity-import/matching/endurance-template-match';
import {
  isSameLocalDay,
  planEnduranceReconciliation,
  planStrengthReconciliation,
  splitStrengthMetrics,
  StrengthMetricSplit,
  StrengthReconciliationPlan,
  StrengthSessionLite,
  WatchStrengthMetrics,
} from '../../activity-import/matching/reconciliation-plan';
import { CanonicalActivity } from '../../activity-import/parsers/activity-import-canonical.types';

type ActivitySessionRow = Row<'activity_sessions'>;
type ActivitySessionInsert = Insert<'activity_sessions'>;
type ActivitySessionUpdate = Update<'activity_sessions'>;
type EnduranceTemplateRow = Row<'endurance_workout_templates'>;
type EnduranceStepRow = Row<'endurance_workout_steps'>;
type WorkoutPlanRow = Row<'workout_plans'>;
type ActivityLapRow = Row<'activity_laps'>;
type MatchMethod = 'structural' | 'totals';

export type StrengthWriteDirective =
  | { kind: 'insert'; extraFields: Partial<ActivitySessionInsert> }
  | { kind: 'associate'; targetSessionId: string; payload: ActivitySessionUpdate };

interface TemplateMatchResult {
  templateId: string;
  templateName: string;
  score: number;
  method: MatchMethod;
  plannedPlanId: string | null;
}

@Injectable()
export class ImportReconciliationService {
  private readonly logger = new Logger(ImportReconciliationService.name);

  constructor(private readonly supabaseAdminService: SupabaseAdminService) {}

  /**
   * Decides how an incoming external strength activity must be written:
   * either associated to an existing session of the same day (the watch never
   * creates sets, Alzan structure is preserved) or inserted as a new session
   * with the relevant review flags. Falls back to a plain insert on errors so
   * the import is never blocked.
   */
  public async resolveStrengthDirective(userId: string, activity: CanonicalActivity): Promise<StrengthWriteDirective> {
    try {
      const watch = this.toWatchMetrics(activity);
      // Legacy gym sessions may still use sport_type 'gym'.
      const todaysSessions = await this.findTodaysSessions(userId, ['strength', 'gym'], activity);
      const plan = planStrengthReconciliation(todaysSessions.map(this.toStrengthLite), watch);
      return this.directiveFromPlan(plan, watch);
    } catch (error) {
      this.logger.error(
        `Strength reconciliation failed for user ${userId}; importing as plain session`,
        error as Error,
      );
      return { kind: 'insert', extraFields: {} };
    }
  }

  /**
   * Endurance (non-strength) reconciliation, executed after the imported
   * session and its laps are persisted: duplicate detection against the same
   * sport on the same day, then template matching unless a strong duplicate
   * is pending. Never throws (the session must survive regardless).
   */
  public async reconcileEnduranceAfterInsert(userId: string, sessionId: string): Promise<void> {
    try {
      const session = await this.getSession(userId, sessionId);
      if (!session) return;
      const candidates = (await this.findTodaysSessions(userId, [session.sport_type], session, sessionId)).filter(
        candidate => candidate.status === 'completed',
      );
      const plan = planEnduranceReconciliation(
        candidates.map(candidate => ({
          id: candidate.id,
          distanceM: candidate.distance_m,
          durationS: candidate.duration_s,
          startTime: candidate.start_time,
          endTime: candidate.end_time,
        })),
        {
          distanceM: session.distance_m,
          durationS: session.duration_s,
          startTime: session.start_time,
          endTime: session.end_time,
        },
      );

      if (plan.duplicateOfSessionId != null) {
        await this.updateSession(sessionId, {
          duplicate_of_session_id: plan.duplicateOfSessionId,
          duplicate_score: plan.duplicateScore,
          duplicate_resolution: 'pending',
        });
      }
      if (plan.runTemplateMatch) {
        await this.runEnduranceTemplateMatch(userId, sessionId);
      }
    } catch (error) {
      this.logger.error(`Endurance reconciliation failed for session ${sessionId}`, error as Error);
    }
  }

  /**
   * Template matching for an imported endurance session. Candidates: today's
   * planned templates first; if none reaches a possible match, all user
   * templates of the same sport. >= 80 auto-associates (and completes the
   * matching workout plan), 60-79 stores a suggestion, below stays generic.
   * Also used by the review endpoint when the user keeps both duplicates.
   */
  public async runEnduranceTemplateMatch(userId: string, sessionId: string): Promise<void> {
    const session = await this.getSession(userId, sessionId);
    if (!session || session.sport_type === 'strength') return;
    if (session.endurance_template_id != null) return;

    const localDate = (session.started_at_local ?? session.start_time).slice(0, 10);
    const plannedPlans = await this.findPlannedPlans(userId, localDate);
    const laps = await this.getSessionLaps(sessionId);

    let best: TemplateMatchResult | null = null;
    if (plannedPlans.length > 0) {
      const plannedTemplateIds = plannedPlans
        .map(plan => plan.endurance_template_id)
        .filter((value): value is string => value != null);
      best = await this.scoreTemplates(session, laps, plannedTemplateIds, plannedPlans);
    }
    if (best == null || best.score < POSSIBLE_MATCH) {
      const allTemplates = await this.findTemplatesBySport(userId, session.sport_type);
      const fallback = await this.scoreTemplates(
        session,
        laps,
        allTemplates.map(template => template.id),
        plannedPlans,
        allTemplates,
      );
      if (fallback != null && (best == null || fallback.score > best.score)) best = fallback;
    }
    if (best == null || best.score < POSSIBLE_MATCH) return;

    if (best.score >= STRONG_MATCH) {
      await this.updateSession(sessionId, {
        endurance_template_id: best.templateId,
        suggested_endurance_template_id: null,
        template_match_score: best.score,
        template_match_method: best.method,
        ...(session.name == null ? { name: best.templateName } : {}),
      });
      if (best.plannedPlanId != null) {
        await this.completePlan(best.plannedPlanId, sessionId);
      }
      return;
    }
    await this.updateSession(sessionId, {
      suggested_endurance_template_id: best.templateId,
      template_match_score: best.score,
      template_match_method: best.method,
    });
  }

  /** Splits watch metrics vs an existing session into applicable/conflicting. */
  public splitMetricsAgainstSession(session: ActivitySessionRow, activity: CanonicalActivity): StrengthMetricSplit {
    return splitStrengthMetrics(this.toStrengthLite(session), this.toWatchMetrics(activity));
  }

  public buildPendingWatchMetrics(split: StrengthMetricSplit, endTime: string | null): Json | null {
    if (Object.keys(split.conflicting).length === 0) return null;
    return {
      metrics: split.conflicting,
      end_time: endTime,
      received_at: new Date().toISOString(),
    } as unknown as Json;
  }

  private directiveFromPlan(plan: StrengthReconciliationPlan, watch: WatchStrengthMetrics): StrengthWriteDirective {
    switch (plan.kind) {
      case 'create_generic':
        return { kind: 'insert', extraFields: {} };
      case 'create_needs_review':
        return { kind: 'insert', extraFields: { needs_strength_review: true } };
      case 'create_duplicate_pending':
        return {
          kind: 'insert',
          extraFields: {
            duplicate_of_session_id: plan.ofSessionId,
            duplicate_score: plan.score,
            duplicate_resolution: 'pending',
          },
        };
      case 'associate': {
        const payload: ActivitySessionUpdate = {
          ...plan.metrics.applicable,
          pending_watch_metrics: this.buildPendingWatchMetrics(plan.metrics, watch.endTime),
          epoc: watch.epoc,
          pte: watch.pte,
          tss_hr: watch.tssHr,
        };
        return { kind: 'associate', targetSessionId: plan.targetSessionId, payload };
      }
      case 'associate_finish': {
        const payload: ActivitySessionUpdate = {
          status: 'completed',
          duration_s: watch.durationS,
          end_time: watch.endTime,
          calories_kcal: watch.caloriesKcal,
          avg_heart_rate: watch.avgHeartRate,
          max_heart_rate: watch.maxHeartRate,
          min_heart_rate: watch.minHeartRate,
          recovery_time_s: watch.recoveryTimeS,
          epoc: watch.epoc,
          pte: watch.pte,
          tss_hr: watch.tssHr,
        };
        return { kind: 'associate', targetSessionId: plan.targetSessionId, payload };
      }
    }
  }

  private async scoreTemplates(
    session: ActivitySessionRow,
    laps: ActivityLapRow[],
    templateIds: string[],
    plannedPlans: WorkoutPlanRow[],
    preloadedTemplates?: EnduranceTemplateRow[],
  ): Promise<TemplateMatchResult | null> {
    if (templateIds.length === 0) return null;
    const templates = (preloadedTemplates ?? (await this.findTemplatesByIds(templateIds))).filter(
      template => template.sport_type === session.sport_type,
    );
    if (templates.length === 0) return null;
    const stepsByTemplate = await this.findStepsByTemplateIds(templates.map(template => template.id));

    const activityStructure = deriveActivityStructure(
      laps.map(lap => ({
        distanceM: lap.distance_m,
        durationSeconds: lap.duration_s,
        avgPaceSecondsPerKm: lap.avg_pace_s_per_km,
      })),
    );
    const activityTotals = buildActivityTotals({ distanceM: session.distance_m, durationS: session.duration_s });

    let best: TemplateMatchResult | null = null;
    for (const template of templates) {
      const steps = (stepsByTemplate.get(template.id) ?? []).map(this.toStepLike);
      let score: number;
      let method: MatchMethod;
      const templateStructure = activityStructure != null ? deriveTemplateStructure(steps) : null;
      if (activityStructure != null && templateStructure != null) {
        score = scoreStructuralMatch(activityStructure, templateStructure);
        method = 'structural';
      } else {
        const templateTotals = buildTemplateTotals(
          { totalDistanceM: template.total_distance_m, totalDurationS: template.total_duration_s },
          steps,
        );
        score = scoreTotalsMatch(activityTotals, templateTotals);
        method = 'totals';
      }
      if (best == null || score > best.score) {
        const plannedPlan = plannedPlans.find(plan => plan.endurance_template_id === template.id) ?? null;
        best = {
          templateId: template.id,
          templateName: template.base_name,
          score,
          method,
          plannedPlanId: plannedPlan?.id ?? null,
        };
      }
    }
    return best;
  }

  private toStepLike(step: EnduranceStepRow): EnduranceStepLike {
    return {
      id: step.id,
      parentStepId: step.parent_step_id,
      isGroup: step.is_group ?? false,
      repetitions: step.repetitions,
      orderIndex: step.order_index,
      phaseType: step.phase_type,
      durationType: step.duration_type,
      durationS: step.duration_s,
      distanceM: step.distance_m,
      targetType: step.target_type,
      targetMin: step.target_min,
      targetMax: step.target_max,
    };
  }

  private toStrengthLite(session: ActivitySessionRow): StrengthSessionLite {
    return {
      id: session.id,
      status: session.status,
      durationS: session.duration_s,
      caloriesKcal: session.calories_kcal,
      avgHeartRate: session.avg_heart_rate,
      maxHeartRate: session.max_heart_rate,
      minHeartRate: session.min_heart_rate,
      recoveryTimeS: session.recovery_time_s,
      hasExternalData:
        session.imported_at != null || session.provider_activity_id != null || session.source_record_id != null,
    };
  }

  private toWatchMetrics(activity: CanonicalActivity): WatchStrengthMetrics {
    const summary = activity.summary;
    return {
      durationS: summary.durationSeconds,
      endTime: summary.endedAt,
      caloriesKcal: summary.caloriesKcal,
      avgHeartRate: summary.avgHeartRate,
      maxHeartRate: summary.maxHeartRate,
      minHeartRate: summary.minHeartRate,
      recoveryTimeS: summary.recoveryTimeSeconds,
      epoc: summary.epoc,
      pte: summary.pte,
      tssHr: summary.tss,
    };
  }

  private async findTodaysSessions(
    userId: string,
    sportTypes: Array<ActivitySessionRow['sport_type']>,
    reference:
      | { startedAt?: string | null }
      | Pick<ActivitySessionRow, 'start_time' | 'started_at_local'>
      | CanonicalActivity,
    excludeSessionId?: string,
  ): Promise<ActivitySessionRow[]> {
    const referenceStart = this.referenceStart(reference);
    if (!referenceStart.startTime) return [];
    const windowStart = new Date(Date.parse(referenceStart.startTime) - 36 * 3600 * 1000).toISOString();
    const windowEnd = new Date(Date.parse(referenceStart.startTime) + 36 * 3600 * 1000).toISOString();

    let query = this.supabaseAdminService.client
      .from('activity_sessions')
      .select('*')
      .eq('user_id', userId)
      .in('sport_type', sportTypes)
      .gte('start_time', windowStart)
      .lte('start_time', windowEnd);
    if (excludeSessionId) query = query.neq('id', excludeSessionId);
    const { data, error } = await query;
    if (error) throw new InternalServerErrorException('IMPORT_RECONCILIATION_LOOKUP_FAILED');
    return (data ?? []).filter(candidate =>
      isSameLocalDay(
        { startedAtLocal: referenceStart.startedAtLocal, startTime: referenceStart.startTime },
        { startedAtLocal: candidate.started_at_local, startTime: candidate.start_time },
      ),
    );
  }

  private referenceStart(
    reference:
      | { startedAt?: string | null }
      | Pick<ActivitySessionRow, 'start_time' | 'started_at_local'>
      | CanonicalActivity,
  ): { startTime: string | null; startedAtLocal: string | null } {
    if ('summary' in reference) {
      return { startTime: reference.summary.startedAt, startedAtLocal: null };
    }
    if ('start_time' in reference) {
      return { startTime: reference.start_time, startedAtLocal: reference.started_at_local ?? null };
    }
    return { startTime: reference.startedAt ?? null, startedAtLocal: null };
  }

  private async getSession(userId: string, sessionId: string): Promise<ActivitySessionRow | null> {
    const { data, error } = await this.supabaseAdminService.client
      .from('activity_sessions')
      .select('*')
      .eq('id', sessionId)
      .eq('user_id', userId)
      .maybeSingle();
    if (error) throw new InternalServerErrorException('IMPORT_RECONCILIATION_SESSION_READ_FAILED');
    return data;
  }

  private async getSessionLaps(sessionId: string): Promise<ActivityLapRow[]> {
    const { data, error } = await this.supabaseAdminService.client
      .from('activity_laps')
      .select('*')
      .eq('session_id', sessionId)
      .order('lap_index', { ascending: true });
    if (error) throw new InternalServerErrorException('IMPORT_RECONCILIATION_LAPS_READ_FAILED');
    return data ?? [];
  }

  private async findPlannedPlans(userId: string, localDate: string): Promise<WorkoutPlanRow[]> {
    const { data, error } = await this.supabaseAdminService.client
      .from('workout_plans')
      .select('*')
      .eq('user_id', userId)
      .eq('planned_date', localDate)
      .eq('status', 'planned')
      .not('endurance_template_id', 'is', null);
    if (error) throw new InternalServerErrorException('IMPORT_RECONCILIATION_PLANS_READ_FAILED');
    return data ?? [];
  }

  private async findTemplatesByIds(templateIds: string[]): Promise<EnduranceTemplateRow[]> {
    if (templateIds.length === 0) return [];
    const { data, error } = await this.supabaseAdminService.client
      .from('endurance_workout_templates')
      .select('*')
      .in('id', templateIds);
    if (error) throw new InternalServerErrorException('IMPORT_RECONCILIATION_TEMPLATES_READ_FAILED');
    return data ?? [];
  }

  private async findTemplatesBySport(
    userId: string,
    sportType: ActivitySessionRow['sport_type'],
  ): Promise<EnduranceTemplateRow[]> {
    const { data, error } = await this.supabaseAdminService.client
      .from('endurance_workout_templates')
      .select('*')
      .eq('user_id', userId)
      .eq('sport_type', sportType);
    if (error) throw new InternalServerErrorException('IMPORT_RECONCILIATION_TEMPLATES_READ_FAILED');
    return data ?? [];
  }

  private async findStepsByTemplateIds(templateIds: string[]): Promise<Map<string, EnduranceStepRow[]>> {
    const result = new Map<string, EnduranceStepRow[]>();
    if (templateIds.length === 0) return result;
    const { data, error } = await this.supabaseAdminService.client
      .from('endurance_workout_steps')
      .select('*')
      .in('template_id', templateIds)
      .order('order_index', { ascending: true });
    if (error) throw new InternalServerErrorException('IMPORT_RECONCILIATION_STEPS_READ_FAILED');
    for (const step of data ?? []) {
      const steps = result.get(step.template_id) ?? [];
      steps.push(step);
      result.set(step.template_id, steps);
    }
    return result;
  }

  private async completePlan(planId: string, sessionId: string): Promise<void> {
    const { error } = await this.supabaseAdminService.client
      .from('workout_plans')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        activity_session_id: sessionId,
      })
      .eq('id', planId)
      .eq('status', 'planned');
    if (error) throw new InternalServerErrorException('IMPORT_RECONCILIATION_PLAN_COMPLETE_FAILED');
  }

  private async updateSession(sessionId: string, payload: ActivitySessionUpdate): Promise<void> {
    const { error } = await this.supabaseAdminService.client
      .from('activity_sessions')
      .update(payload)
      .eq('id', sessionId);
    if (error) throw new InternalServerErrorException('IMPORT_RECONCILIATION_SESSION_UPDATE_FAILED');
  }
}
