import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { Json } from '../../../types/database.types';
import { Insert, Row, Update } from '../../../types/requests.types';
import { SupabaseAdminService } from '../../../core/supabase/supabase.service';
import {
  buildActivityTotals,
  buildTemplateTotals,
  countComparableStructuralSignals,
  countComparableTotalSignals,
  EnduranceStepLike,
  POSSIBLE_MATCH,
  scoreStructuralMatch,
  scoreTotalsMatch,
  isMatchMarginSufficient,
  isStructuralAutoMatchEligible,
  STRONG_MATCH,
  templateHasBoundaryPhases,
  templateHasRecoveryPhases,
  deriveActivityStructure,
  deriveTemplateDistanceMatchedActivityStructure,
  deriveTemplateStructure,
} from '../../activity-import/matching/endurance-template-match';
import {
  calculateProgressionWeekIndex,
  applyProgressionsToSteps,
  StepProgressionOverride,
} from '../../activity-import/matching/endurance-progression';
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
import { resolveActivityLocalDate } from '../domain/activity-local-date';

type ActivitySessionRow = Row<'activity_sessions'>;
type ActivitySessionInsert = Insert<'activity_sessions'>;
type ActivitySessionUpdate = Update<'activity_sessions'>;
type EnduranceTemplateRow = Row<'endurance_workout_templates'>;
type EnduranceStepRow = Row<'endurance_workout_steps'>;
type WorkoutPlanRow = Row<'workout_plans'>;
type ActivityLapRow = Row<'activity_laps'>;
type MatchMethod = 'structural' | 'totals';

export type StrengthWriteDirective =
  | { kind: 'insert'; extraFields: Partial<ActivitySessionInsert>; autoMerge?: boolean }
  | { kind: 'associate'; targetSessionId: string; payload: ActivitySessionUpdate };

export type EnduranceWriteDirective =
  | { kind: 'insert'; runTemplateMatch: boolean; extraFields?: Partial<ActivitySessionInsert> }
  | { kind: 'associate'; targetSessionId: string };

interface TemplateMatchResult {
  templateId: string;
  templateName: string;
  score: number;
  method: MatchMethod;
  plannedPlanId: string | null;
  signalCount: number;
  runnerUpScore: number | null;
  planSelectionRequired: boolean;
  isAutoMatchEligible: boolean;
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
      return this.directiveFromPlan(plan, watch, activity);
    } catch (error) {
      this.logger.error(
        `Strength reconciliation failed for user ${userId}; importing as plain session`,
        error as Error,
      );
      return { kind: 'insert', extraFields: {} };
    }
  }

  /**
   * Resolves non-strength imports before writing. Strong same-day duplicates
   * update the existing Alzan session directly, so a second visible card is
   * never created just to be merged later. Weak/doubtful matches become a new
   * generic imported workout.
   */
  public async resolveEnduranceDirective(
    userId: string,
    activity: CanonicalActivity,
  ): Promise<EnduranceWriteDirective> {
    try {
      const candidates = (await this.findTodaysSessions(userId, [activity.sportType], activity)).filter(
        candidate => candidate.status !== 'cancelled',
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
          distanceM: activity.summary.distanceM,
          durationS: activity.summary.durationSeconds,
          startTime: activity.summary.startedAt,
          endTime: activity.summary.endedAt,
        },
      );
      if (plan.duplicateOfSessionId != null && plan.autoMerge) {
        return { kind: 'associate', targetSessionId: plan.duplicateOfSessionId };
      }
      // Weak same-day duplicate (< threshold): still create the session, but
      // flag it so the detail shows the subtle "you already have another
      // {sport} today" notice and lets the user merge manually if it really is.
      if (plan.duplicateOfSessionId != null) {
        return {
          kind: 'insert',
          runTemplateMatch: plan.runTemplateMatch,
          extraFields: {
            duplicate_of_session_id: plan.duplicateOfSessionId,
            duplicate_score: plan.duplicateScore,
            duplicate_resolution: 'pending',
          },
        };
      }
      return { kind: 'insert', runTemplateMatch: plan.runTemplateMatch };
    } catch (error) {
      this.logger.error(
        `Endurance reconciliation failed for user ${userId}; importing as plain session`,
        error as Error,
      );
      return { kind: 'insert', runTemplateMatch: true };
    }
  }

  /**
   * Template matching for an imported endurance session. All same-sport
   * templates are scored together so an equally plausible unplanned template
   * can block an unsafe automatic association. >= 80 auto-associates (and
   * completes the matching workout plan), 60-79 stores a suggestion, below
   * stays generic. Also used by the review endpoint when the user keeps both
   * duplicates.
   */
  public async runEnduranceTemplateMatch(userId: string, sessionId: string): Promise<void> {
    const session = await this.getSession(userId, sessionId);
    if (!session || session.sport_type === 'strength') return;
    if (session.endurance_template_id != null) return;

    const localDate = resolveActivityLocalDate({
      startTime: session.start_time,
      startedAtLocal: session.started_at_local,
      timezone: session.timezone,
    });
    if (!localDate) return;
    const plannedPlans = await this.findEndurancePlannedPlans(userId, localDate);
    const laps = await this.getSessionLaps(sessionId);

    const allTemplates = await this.findTemplatesBySport(userId, session.sport_type);
    const best = await this.scoreTemplates(
      session,
      laps,
      allTemplates.map(template => template.id),
      plannedPlans,
      allTemplates,
    );
    if (best == null || best.score < POSSIBLE_MATCH) return;

    if (
      best.score >= STRONG_MATCH &&
      best.signalCount >= 2 &&
      best.isAutoMatchEligible &&
      !best.planSelectionRequired &&
      isMatchMarginSufficient(best.score, best.runnerUpScore)
    ) {
      if (best.plannedPlanId != null) {
        const { error } = await this.supabaseAdminService.client.rpc('associate_activity_session_template', {
          p_user_id: userId,
          p_session_id: sessionId,
          p_endurance_template_id: best.templateId,
          p_workout_template_id: undefined,
          p_workout_plan_id: best.plannedPlanId,
        });
        if (error) throw new InternalServerErrorException('IMPORT_RECONCILIATION_PLAN_ASSOCIATION_FAILED');
        await this.updateSession(sessionId, {
          template_match_score: best.score,
          template_match_method: best.method,
          ...(session.name == null ? { name: best.templateName } : {}),
        });
        return;
      }
      await this.updateSession(sessionId, {
        endurance_template_id: best.templateId,
        suggested_endurance_template_id: null,
        template_match_score: best.score,
        template_match_method: best.method,
        ...(session.name == null ? { name: best.templateName } : {}),
      });
      return;
    }
    await this.updateSession(sessionId, {
      suggested_endurance_template_id: best.templateId,
      template_match_score: best.score,
      template_match_method: best.method,
    });
  }

  /**
   * Template matching for an imported strength session. If exactly one gym plan
   * is scheduled for today, it auto-associates the generic imported session
   * to that plan to prevent floating calendar entries.
   */
  public async runStrengthTemplateMatch(userId: string, sessionId: string): Promise<void> {
    const session = await this.getSession(userId, sessionId);
    if (!session || (session.sport_type !== 'strength' && session.sport_type !== 'gym')) return;
    if (session.workout_template_id != null) return;

    const localDate = resolveActivityLocalDate({
      startTime: session.start_time,
      startedAtLocal: session.started_at_local,
      timezone: session.timezone,
    });
    if (!localDate) return;
    const plannedPlans = await this.findStrengthPlannedPlans(userId, localDate);

    if (plannedPlans.length === 1) {
      const plan = plannedPlans[0];
      const { error } = await this.supabaseAdminService.client.rpc('associate_activity_session_template', {
        p_user_id: userId,
        p_session_id: sessionId,
        p_endurance_template_id: undefined,
        p_workout_template_id: plan.gym_template_id ?? undefined,
        p_workout_plan_id: plan.id,
      });
      if (error) {
        this.logger.error(`Strength template auto-association failed for session ${sessionId}`, error.message);
        return;
      }
      if (session.name == null) {
        // We could look up the template name to rename the session if needed,
        // but for now we just associate it.
      }
    }
  }

  /**
   * When a watch activity is written straight onto an existing Alzan session,
   * mark the corresponding calendar plan completed too. The method is
   * best-effort so a plan bookkeeping problem never blocks the import.
   */
  public async completePlansForAssociatedSession(userId: string, sessionId: string): Promise<void> {
    try {
      const session = await this.getSession(userId, sessionId);
      if (!session) return;
      await this.completePlansBySessionId(userId, sessionId);
    } catch (error) {
      this.logger.warn(`Plan completion skipped for associated session ${sessionId}`, error as Error);
    }
  }

  /** Splits watch metrics vs an existing session into applicable/conflicting/previous. */
  public splitMetricsAgainstSession(session: ActivitySessionRow, activity: CanonicalActivity): StrengthMetricSplit {
    return splitStrengthMetrics(this.toStrengthLite(session), this.toWatchMetrics(activity));
  }

  /**
   * The watch already overrode the conflicting columns (it is the more
   * accurate source). This records the previous app values so the user can
   * revert from the activity summary if they prefer their own numbers; returns
   * null when nothing was overridden.
   */
  public buildPendingWatchMetrics(split: StrengthMetricSplit): Json | null {
    if (Object.keys(split.previous).length === 0) return null;
    return {
      previous: split.previous,
      received_at: new Date().toISOString(),
    } as unknown as Json;
  }

  private directiveFromPlan(
    plan: StrengthReconciliationPlan,
    watch: WatchStrengthMetrics,
    activity: CanonicalActivity,
  ): StrengthWriteDirective {
    switch (plan.kind) {
      case 'create_generic':
        return { kind: 'insert', extraFields: {} };
      case 'create_needs_review':
        return { kind: 'insert', extraFields: { needs_strength_review: true } };
      case 'create_duplicate_pending':
        return {
          kind: 'insert',
          autoMerge: plan.autoMerge,
          extraFields: {
            duplicate_of_session_id: plan.ofSessionId,
            duplicate_score: plan.score,
            duplicate_resolution: 'pending',
          },
        };
      case 'update_existing_external':
        return {
          kind: 'associate',
          targetSessionId: plan.targetSessionId,
          payload: {
            ...this.buildStrengthWatchPayload(watch),
            start_time: activity.summary.startedAt ?? undefined,
            started_at_local: activity.summary.startedAtLocal ?? null,
            timezone: activity.summary.timezone ?? null,
          },
        };
      case 'associate': {
        // Watch wins by default: apply both the filled-in and the overriding
        // values; keep the overridden app values in pending for an optional revert.
        const payload: ActivitySessionUpdate = {
          ...plan.metrics.applicable,
          ...plan.metrics.conflicting,
          pending_watch_metrics: this.buildPendingWatchMetrics(plan.metrics),
          epoc: watch.epoc,
          pte: watch.pte,
          tss_hr: watch.tssHr,
          start_time: activity.summary.startedAt ?? undefined,
          started_at_local: activity.summary.startedAtLocal ?? null,
          timezone: activity.summary.timezone ?? null,
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
          start_time: activity.summary.startedAt ?? undefined,
          started_at_local: activity.summary.startedAtLocal ?? null,
          timezone: activity.summary.timezone ?? null,
        };
        return { kind: 'associate', targetSessionId: plan.targetSessionId, payload };
      }
    }
  }

  private buildStrengthWatchPayload(watch: WatchStrengthMetrics): ActivitySessionUpdate {
    return {
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
      pending_watch_metrics: null,
      duplicate_of_session_id: null,
      duplicate_score: null,
      duplicate_resolution: 'merged',
      needs_strength_review: false,
    };
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
    const stepsAndProgressionsByTemplate = await this.findStepsAndProgressionsByTemplateIds(
      templates.map(template => template.id),
    );

    const lapLikes = laps.map(lap => ({
      distanceM: lap.distance_m,
      durationSeconds: lap.duration_s,
      avgPaceSecondsPerKm: lap.avg_pace_s_per_km,
      lapType: lap.lap_type,
    }));
    const activityTotals = buildActivityTotals({ distanceM: session.distance_m, durationS: session.duration_s });

    const matches: TemplateMatchResult[] = [];
    for (const template of templates) {
      const { steps: stepRows, progressions: progressionRows } = stepsAndProgressionsByTemplate.get(template.id) ?? {
        steps: [],
        progressions: [],
      };

      const matchingPlans = plannedPlans.filter(plan => plan.endurance_template_id === template.id);
      const plannedPlan = matchingPlans.length === 1 ? matchingPlans[0] : null;
      const plannedDate = plannedPlan?.planned_date ?? session.started_at_local ?? session.start_time;

      const weekIndex = calculateProgressionWeekIndex(template.recurrence_start_date, plannedDate);

      let steps = stepRows.map(this.toStepLike);
      if (weekIndex > 0 && progressionRows.length > 0) {
        steps = applyProgressionsToSteps(steps, weekIndex, progressionRows);
      }

      const templateAwareStructure = deriveTemplateDistanceMatchedActivityStructure(lapLikes, steps);
      const activityStructure =
        templateAwareStructure ??
        (templateHasBoundaryPhases(steps) || templateHasRecoveryPhases(steps)
          ? null
          : deriveActivityStructure(lapLikes));
      let score: number;
      let method: MatchMethod;
      let signalCount: number;
      let isAutoMatchEligible: boolean;
      const templateStructure = activityStructure != null ? deriveTemplateStructure(steps) : null;
      if (activityStructure != null && templateStructure != null) {
        score = scoreStructuralMatch(activityStructure, templateStructure);
        method = 'structural';
        signalCount = countComparableStructuralSignals(activityStructure, templateStructure);
        isAutoMatchEligible = isStructuralAutoMatchEligible(activityStructure, templateStructure);
      } else {
        const templateTotals = buildTemplateTotals(
          { totalDistanceM: template.total_distance_m, totalDurationS: template.total_duration_s },
          steps,
        );
        score = scoreTotalsMatch(activityTotals, templateTotals);
        method = 'totals';
        signalCount = countComparableTotalSignals(activityTotals, templateTotals);
        isAutoMatchEligible = true;
      }
      matches.push({
        templateId: template.id,
        templateName: template.base_name,
        score,
        method,
        plannedPlanId: plannedPlan?.id ?? null,
        signalCount,
        runnerUpScore: null,
        planSelectionRequired: matchingPlans.length > 1,
        isAutoMatchEligible,
      });
    }
    matches.sort(
      (left, right) =>
        right.score - left.score ||
        Number(right.plannedPlanId != null) - Number(left.plannedPlanId != null) ||
        left.templateId.localeCompare(right.templateId),
    );
    const best = matches[0] ?? null;
    if (!best) return null;
    return { ...best, runnerUpScore: matches[1]?.score ?? null };
  }

  private toStepLike(step: EnduranceStepRow): EnduranceStepLike {
    return {
      id: step.id,
      parentStepId: step.parent_step_id,
      progressionKey: step.progression_key,
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
      return { startTime: reference.summary.startedAt, startedAtLocal: reference.summary.startedAtLocal ?? null };
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
      .in('split_group', ['legacy', 'custom'])
      .order('lap_index', { ascending: true });
    if (error) throw new InternalServerErrorException('IMPORT_RECONCILIATION_LAPS_READ_FAILED');
    return data ?? [];
  }

  private async findEndurancePlannedPlans(userId: string, localDate: string): Promise<WorkoutPlanRow[]> {
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

  private async findStrengthPlannedPlans(userId: string, localDate: string): Promise<WorkoutPlanRow[]> {
    const { data, error } = await this.supabaseAdminService.client
      .from('workout_plans')
      .select('*')
      .eq('user_id', userId)
      .eq('planned_date', localDate)
      .eq('status', 'planned')
      .not('gym_template_id', 'is', null);
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

  private async findStepsAndProgressionsByTemplateIds(
    templateIds: string[],
  ): Promise<Map<string, { steps: EnduranceStepRow[]; progressions: StepProgressionOverride[] }>> {
    const result = new Map<string, { steps: EnduranceStepRow[]; progressions: StepProgressionOverride[] }>();
    if (templateIds.length === 0) return result;

    const [{ data: stepsData, error: stepsError }, { data: progressionsData, error: progressionsError }] =
      await Promise.all([
        this.supabaseAdminService.client
          .from('endurance_workout_steps')
          .select('*')
          .in('template_id', templateIds)
          .order('order_index', { ascending: true }),
        this.supabaseAdminService.client
          .from('endurance_workout_step_progressions')
          .select('*')
          .in('template_id', templateIds),
      ]);

    if (stepsError) throw new InternalServerErrorException('IMPORT_RECONCILIATION_STEPS_READ_FAILED');
    if (progressionsError) throw new InternalServerErrorException('IMPORT_RECONCILIATION_PROGRESSIONS_READ_FAILED');

    for (const id of templateIds) {
      result.set(id, { steps: [], progressions: [] });
    }

    for (const step of stepsData ?? []) {
      result.get(step.template_id)!.steps.push(step);
    }
    for (const progression of progressionsData ?? []) {
      result.get(progression.template_id)!.progressions.push(progression);
    }

    return result;
  }

  private async completePlansBySessionId(userId: string, sessionId: string): Promise<void> {
    const { error } = await this.supabaseAdminService.client
      .from('workout_plans')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        activity_session_id: sessionId,
      })
      .eq('user_id', userId)
      .eq('activity_session_id', sessionId)
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
