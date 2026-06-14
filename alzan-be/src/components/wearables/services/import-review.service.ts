import { BadRequestException, Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { Row, Update } from '../../../types/requests.types';
import { SupabaseAdminService } from '../../../core/supabase/supabase.service';
import {
  splitStrengthMetrics,
  StrengthSessionLite,
  WatchStrengthMetrics,
} from '../../activity-import/matching/reconciliation-plan';
import { ImportReconciliationService } from './import-reconciliation.service';
import { RawPayloadService } from './raw-payload.service';

type ActivitySessionRow = Row<'activity_sessions'>;
type ActivitySessionUpdate = Update<'activity_sessions'>;

const PENDING_METRIC_COLUMNS = [
  'duration_s',
  'calories_kcal',
  'avg_heart_rate',
  'max_heart_rate',
  'min_heart_rate',
  'recovery_time_s',
] as const;

/**
 * User-driven actions over imported activities: template association,
 * duplicate merge / keep-both, watch-metric conflict resolution and strength
 * session assignment. All actions are ownership-checked and never lose data
 * without an explicit user decision (the spec's safety rule).
 */
@Injectable()
export class ImportReviewService {
  constructor(
    private readonly supabaseAdminService: SupabaseAdminService,
    private readonly rawPayloadService: RawPayloadService,
    private readonly importReconciliationService: ImportReconciliationService,
  ) {}

  public async associateTemplate(
    userId: string,
    sessionId: string,
    input: { enduranceTemplateId?: string | null; workoutTemplateId?: string | null },
  ): Promise<string> {
    const session = await this.getOwnedSession(userId, sessionId);
    const localDate = this.sessionLocalDate(session);

    if (input.enduranceTemplateId) {
      const templateSport = await this.getOwnedTemplateSport(
        userId,
        'endurance_workout_templates',
        input.enduranceTemplateId,
      );
      // An endurance template must match the session's sport (no associating a
      // cycling template to a run). The FE picker already filters by sport;
      // this is defense-in-depth at the API boundary.
      if (templateSport !== session.sport_type) {
        throw new BadRequestException('IMPORT_REVIEW_TEMPLATE_SPORT_MISMATCH');
      }
      await this.revertPlansCompletedBySession(sessionId);
      await this.updateSession(sessionId, {
        endurance_template_id: input.enduranceTemplateId,
        suggested_endurance_template_id: null,
        template_match_score: null,
        template_match_method: null,
      });
      await this.completePlannedPlan(userId, localDate, sessionId, {
        endurance_template_id: input.enduranceTemplateId,
      });
      return sessionId;
    }
    if (input.workoutTemplateId) {
      await this.assertOwnedRow(userId, 'workout_templates', input.workoutTemplateId);
      // Gym routines only attach to strength/gym sessions.
      if (session.sport_type !== 'strength' && session.sport_type !== 'gym') {
        throw new BadRequestException('IMPORT_REVIEW_TEMPLATE_SPORT_MISMATCH');
      }
      await this.revertPlansCompletedBySession(sessionId);
      await this.updateSession(sessionId, { workout_template_id: input.workoutTemplateId });
      await this.completePlannedPlan(userId, localDate, sessionId, { gym_template_id: input.workoutTemplateId });
      return sessionId;
    }

    // Remove association: clear template links and revert any plan this
    // session had completed, so the calendar shows the plan as pending again.
    await this.revertPlansCompletedBySession(sessionId);
    await this.updateSession(sessionId, {
      endurance_template_id: null,
      workout_template_id: null,
      template_match_score: null,
      template_match_method: null,
    });
    return sessionId;
  }

  /** Clears a pending template suggestion ("keep generic"). */
  public async dismissSuggestion(userId: string, sessionId: string): Promise<string> {
    await this.getOwnedSession(userId, sessionId);
    await this.updateSession(sessionId, {
      suggested_endurance_template_id: null,
      template_match_score: null,
      template_match_method: null,
    });
    return sessionId;
  }

  /**
   * Merges the imported session into the existing one. The existing session
   * survives (keeping its template/plan and, for strength, its sets); watch
   * data is applied to it and the imported session is deleted only after
   * everything else succeeded.
   */
  public async mergeDuplicate(userId: string, sessionId: string, targetSessionId?: string): Promise<string> {
    const imported = await this.getOwnedSession(userId, sessionId);
    const targetId = targetSessionId ?? imported.duplicate_of_session_id;
    if (!targetId || targetId === sessionId) {
      throw new BadRequestException('IMPORT_REVIEW_MERGE_TARGET_REQUIRED');
    }
    const target = await this.getOwnedSession(userId, targetId);

    // The external/imported side provides the watch data. If the user merges
    // from the older session's detail instead, swap roles.
    const importedIsExternal = imported.imported_at != null || imported.provider_activity_id != null;
    const source = importedIsExternal ? imported : target;
    const survivor = importedIsExternal ? target : imported;
    if (source.id === survivor.id) throw new BadRequestException('IMPORT_REVIEW_MERGE_TARGET_REQUIRED');

    const payload: ActivitySessionUpdate =
      survivor.sport_type === 'strength'
        ? this.buildStrengthWatchPayload(source)
        : this.buildEnduranceWatchPayload(source);
    // The provenance columns carry partial unique indexes
    // (uq_activity_provider_record / uq_activity_source_record): clear them on
    // the source before copying onto the survivor.
    await this.clearProvenance(source.id);
    await this.updateSession(survivor.id, {
      ...payload,
      ...this.buildProvenanceCopy(source),
      duplicate_of_session_id: null,
      duplicate_score: null,
      duplicate_resolution: 'merged',
      needs_strength_review: false,
    });
    if (source.raw_payload_id) {
      await this.rawPayloadService.linkPayload({
        rawPayloadId: source.raw_payload_id,
        relatedTable: 'activity_sessions',
        relatedId: survivor.id,
      });
    }
    // Atomic: moves every artifact + back-reference and deletes the source in
    // a single transaction (no half-moved state on a mid-operation failure).
    await this.absorbAndDelete(source.id, survivor.id);
    return survivor.id;
  }

  /** Keeps both sessions; for endurance the template match runs now. */
  public async keepBothDuplicates(userId: string, sessionId: string): Promise<string> {
    const session = await this.getOwnedSession(userId, sessionId);
    await this.updateSession(sessionId, { duplicate_resolution: 'kept_both' });
    if (session.sport_type !== 'strength' && session.endurance_template_id == null) {
      await this.importReconciliationService.runEnduranceTemplateMatch(userId, sessionId);
    }
    return sessionId;
  }

  /**
   * Reverts the metrics the watch overrode back to the user's previous app
   * values ("keep mine"). The watch values were applied by default, so this
   * restores `previous` and clears the pending notice.
   */
  public async revertWatchMetrics(userId: string, sessionId: string): Promise<string> {
    const session = await this.getOwnedSession(userId, sessionId);
    const previous = this.readPreviousWatchMetrics(session);
    if (!previous) return sessionId;
    const payload: ActivitySessionUpdate = { pending_watch_metrics: null };
    for (const column of PENDING_METRIC_COLUMNS) {
      const value = previous[column];
      if (typeof value === 'number') payload[column] = value;
    }
    await this.updateSession(sessionId, payload);
    return sessionId;
  }

  /** Keeps the watch values (the default) and clears the revert notice. */
  public async keepWatchMetrics(userId: string, sessionId: string): Promise<string> {
    await this.getOwnedSession(userId, sessionId);
    await this.updateSession(sessionId, { pending_watch_metrics: null });
    return sessionId;
  }

  /**
   * Strength case 4: the user picks which of today's strength sessions the
   * watch activity belongs to. The generic imported session is deleted only
   * after its data was applied to the chosen session. Without a target the
   * imported session stays as a new workout.
   */
  public async assignStrengthSession(userId: string, sessionId: string, targetSessionId?: string): Promise<string> {
    const generic = await this.getOwnedSession(userId, sessionId);
    if (!targetSessionId) {
      await this.updateSession(sessionId, { needs_strength_review: false });
      return sessionId;
    }
    if (targetSessionId === sessionId) throw new BadRequestException('IMPORT_REVIEW_ASSIGN_TARGET_INVALID');
    const target = await this.getOwnedSession(userId, targetSessionId);
    if (target.sport_type !== 'strength' && target.sport_type !== 'gym') {
      throw new BadRequestException('IMPORT_REVIEW_ASSIGN_TARGET_INVALID');
    }

    // Watch wins by default; overridden app values kept for an optional revert.
    const split = splitStrengthMetrics(this.toStrengthLite(target), this.toWatchMetrics(generic));
    const payload: ActivitySessionUpdate = {
      ...split.applicable,
      ...split.conflicting,
      pending_watch_metrics: this.importReconciliationService.buildPendingWatchMetrics(split),
      epoc: generic.epoc ?? target.epoc,
      pte: generic.pte ?? target.pte,
      tss_hr: generic.tss_hr ?? target.tss_hr,
    };
    if (target.status !== 'completed') {
      payload.status = 'completed';
      payload.end_time = generic.end_time ?? target.end_time;
    }
    // Clear unique provenance columns on the generic session before copying
    // them onto the target (partial unique indexes would reject duplicates).
    await this.clearProvenance(generic.id);
    await this.updateSession(target.id, { ...payload, ...this.buildProvenanceCopy(generic) });
    if (generic.raw_payload_id) {
      await this.rawPayloadService.linkPayload({
        rawPayloadId: generic.raw_payload_id,
        relatedTable: 'activity_sessions',
        relatedId: target.id,
      });
    }
    // Atomic move + delete (see mergeDuplicate).
    await this.absorbAndDelete(generic.id, target.id);
    return target.id;
  }

  private buildStrengthWatchPayload(source: ActivitySessionRow): ActivitySessionUpdate {
    return {
      duration_s: source.duration_s,
      end_time: source.end_time,
      calories_kcal: source.calories_kcal,
      avg_heart_rate: source.avg_heart_rate,
      max_heart_rate: source.max_heart_rate,
      min_heart_rate: source.min_heart_rate,
      recovery_time_s: source.recovery_time_s,
      epoc: source.epoc,
      pte: source.pte,
      tss_hr: source.tss_hr,
      pending_watch_metrics: null,
    };
  }

  private buildEnduranceWatchPayload(source: ActivitySessionRow): ActivitySessionUpdate {
    return {
      start_time: source.start_time,
      end_time: source.end_time,
      duration_s: source.duration_s,
      distance_m: source.distance_m,
      elev_gain_m: source.elev_gain_m,
      elev_loss_m: source.elev_loss_m,
      avg_heart_rate: source.avg_heart_rate,
      max_heart_rate: source.max_heart_rate,
      min_heart_rate: source.min_heart_rate,
      avg_speed_m_per_s: source.avg_speed_m_per_s,
      calories_kcal: source.calories_kcal,
      avg_cadence: source.avg_cadence,
      max_cadence: source.max_cadence,
      avg_power_w: source.avg_power_w,
      max_power_w: source.max_power_w,
      avg_temp_c: source.avg_temp_c,
      max_temp_c: source.max_temp_c,
      recovery_time_s: source.recovery_time_s,
      total_steps: source.total_steps,
      vo2_max: source.vo2_max,
      tss_hr: source.tss_hr,
      epoc: source.epoc,
      pte: source.pte,
      route_polyline: source.route_polyline ?? undefined,
      pending_watch_metrics: null,
    };
  }

  private buildProvenanceCopy(source: ActivitySessionRow): ActivitySessionUpdate {
    return {
      provider: source.provider,
      provider_activity_id: source.provider_activity_id,
      device_id: source.device_id,
      imported_at: source.imported_at ?? new Date().toISOString(),
      source_channel: source.source_channel,
      source_package: source.source_package,
      source_provider_key: source.source_provider_key,
      source_record_id: source.source_record_id,
      source_updated_at: source.source_updated_at,
      raw_payload_id: source.raw_payload_id,
    };
  }

  /** Clears the unique provenance columns so they can be copied to another session. */
  private async clearProvenance(sessionId: string): Promise<void> {
    await this.run(
      this.supabaseAdminService.client
        .from('activity_sessions')
        .update({ provider_activity_id: null, source_record_id: null })
        .eq('id', sessionId),
      'PROVENANCE_CLEAR',
    );
  }

  /**
   * Atomically moves every child artifact and back-reference from one session
   * onto another and deletes the source, in a single Postgres transaction
   * (absorb_and_delete_session). Guarantees no half-moved state on failure.
   */
  private async absorbAndDelete(fromSessionId: string, toSessionId: string): Promise<void> {
    const { error } = await this.supabaseAdminService.client.rpc('absorb_and_delete_session', {
      p_source: fromSessionId,
      p_target: toSessionId,
    });
    if (error) throw new InternalServerErrorException('IMPORT_REVIEW_ABSORB_FAILED');
  }

  private async revertPlansCompletedBySession(sessionId: string): Promise<void> {
    await this.run(
      this.supabaseAdminService.client
        .from('workout_plans')
        .update({ status: 'planned', completed_at: null, activity_session_id: null })
        .eq('activity_session_id', sessionId),
      'PLANS_REVERT',
    );
  }

  private async completePlannedPlan(
    userId: string,
    localDate: string,
    sessionId: string,
    match: { endurance_template_id?: string; gym_template_id?: string },
  ): Promise<void> {
    let query = this.supabaseAdminService.client
      .from('workout_plans')
      .update({ status: 'completed', completed_at: new Date().toISOString(), activity_session_id: sessionId })
      .eq('user_id', userId)
      .eq('planned_date', localDate)
      .eq('status', 'planned');
    if (match.endurance_template_id) query = query.eq('endurance_template_id', match.endurance_template_id);
    if (match.gym_template_id) query = query.eq('gym_template_id', match.gym_template_id);
    await this.run(query, 'PLAN_COMPLETE');
  }

  /** Reads the previous app metric values stored for an optional revert. */
  private readPreviousWatchMetrics(session: ActivitySessionRow): Record<string, unknown> | null {
    const raw = session.pending_watch_metrics;
    if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const previous = (raw as Record<string, unknown>).previous;
    if (previous == null || typeof previous !== 'object' || Array.isArray(previous)) return null;
    return previous as Record<string, unknown>;
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

  private toWatchMetrics(session: ActivitySessionRow): WatchStrengthMetrics {
    return {
      durationS: session.duration_s,
      endTime: session.end_time,
      caloriesKcal: session.calories_kcal,
      avgHeartRate: session.avg_heart_rate,
      maxHeartRate: session.max_heart_rate,
      minHeartRate: session.min_heart_rate,
      recoveryTimeS: session.recovery_time_s,
      epoc: session.epoc,
      pte: session.pte,
      tssHr: session.tss_hr,
    };
  }

  private sessionLocalDate(session: ActivitySessionRow): string {
    return (session.started_at_local ?? session.start_time).slice(0, 10);
  }

  private async getOwnedSession(userId: string, sessionId: string): Promise<ActivitySessionRow> {
    const { data, error } = await this.supabaseAdminService.client
      .from('activity_sessions')
      .select('*')
      .eq('id', sessionId)
      .eq('user_id', userId)
      .maybeSingle();
    if (error) throw new InternalServerErrorException('IMPORT_REVIEW_SESSION_READ_FAILED');
    if (!data) throw new NotFoundException('IMPORT_REVIEW_SESSION_NOT_FOUND');
    return data;
  }

  private async assertOwnedRow(
    userId: string,
    table: 'endurance_workout_templates' | 'workout_templates',
    id: string,
  ): Promise<void> {
    const { data, error } = await this.supabaseAdminService.client
      .from(table)
      .select('id')
      .eq('id', id)
      .eq('user_id', userId)
      .maybeSingle();
    if (error) throw new InternalServerErrorException('IMPORT_REVIEW_TEMPLATE_READ_FAILED');
    if (!data) throw new NotFoundException('IMPORT_REVIEW_TEMPLATE_NOT_FOUND');
  }

  /** Returns the owned template's sport_type, or throws if not found. */
  private async getOwnedTemplateSport(
    userId: string,
    table: 'endurance_workout_templates',
    id: string,
  ): Promise<string> {
    const { data, error } = await this.supabaseAdminService.client
      .from(table)
      .select('sport_type')
      .eq('id', id)
      .eq('user_id', userId)
      .maybeSingle();
    if (error) throw new InternalServerErrorException('IMPORT_REVIEW_TEMPLATE_READ_FAILED');
    if (!data) throw new NotFoundException('IMPORT_REVIEW_TEMPLATE_NOT_FOUND');
    return data.sport_type;
  }

  private async updateSession(sessionId: string, payload: ActivitySessionUpdate): Promise<void> {
    const { error } = await this.supabaseAdminService.client
      .from('activity_sessions')
      .update(payload)
      .eq('id', sessionId);
    if (error) throw new InternalServerErrorException('IMPORT_REVIEW_SESSION_UPDATE_FAILED');
  }

  private async run(query: PromiseLike<{ error: { message: string } | null }>, step: string): Promise<void> {
    const { error } = await query;
    if (error) throw new InternalServerErrorException(`IMPORT_REVIEW_${step}_FAILED`);
  }
}
