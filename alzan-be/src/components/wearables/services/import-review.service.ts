import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { Json } from '../../../types/database.types';
import { Row, Update } from '../../../types/requests.types';
import { SupabaseAdminService } from '../../../core/supabase/supabase.service';
import { DUPLICATE_THRESHOLD } from '../../activity-import/matching/duplicate-score';
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
const WATCH_METRICS_REVERT_WINDOW_MS = 72 * 3600 * 1000;
const WATCH_METRICS_SESSION_MAX_AGE_MS = 168 * 3600 * 1000;

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
    input: {
      enduranceTemplateId?: string | null;
      workoutTemplateId?: string | null;
      workoutPlanId?: string;
    },
    targetSessionId?: string,
  ): Promise<string> {
    const session = await this.getCanonicalActionSession(userId, sessionId, targetSessionId);
    const { data, error } = await this.supabaseAdminService.client.rpc('associate_activity_session_template', {
      p_user_id: userId,
      p_session_id: session.id,
      p_endurance_template_id: input.enduranceTemplateId ?? undefined,
      p_workout_template_id: input.workoutTemplateId ?? undefined,
      p_workout_plan_id: input.workoutPlanId,
    });
    if (error) this.throwTemplateAssociationError(error.message);
    const result = this.parseTemplateAssociationResult(data);
    if (result.status === 'selection_required') {
      throw new ConflictException({
        message: 'IMPORT_REVIEW_PLAN_SELECTION_REQUIRED',
        candidates: result.candidates,
      });
    }
    return session.id;
  }

  private parseTemplateAssociationResult(value: Json): {
    status: 'associated' | 'selection_required';
    candidates: Json[];
  } {
    if (value == null || Array.isArray(value) || typeof value !== 'object') {
      throw new InternalServerErrorException('IMPORT_REVIEW_ASSOCIATION_INVALID_RESPONSE');
    }
    const status = value.status;
    const candidates = value.candidates;
    if (status !== 'associated' && status !== 'selection_required') {
      throw new InternalServerErrorException('IMPORT_REVIEW_ASSOCIATION_INVALID_RESPONSE');
    }
    return { status, candidates: Array.isArray(candidates) ? candidates : [] };
  }

  private throwTemplateAssociationError(message: string): never {
    const knownErrors = [
      'IMPORT_REVIEW_TEMPLATE_INPUT_INVALID',
      'IMPORT_REVIEW_TEMPLATE_NOT_FOUND',
      'IMPORT_REVIEW_TEMPLATE_SPORT_MISMATCH',
      'IMPORT_REVIEW_PLAN_INVALID',
      'IMPORT_REVIEW_PLAN_SPORT_MISMATCH',
    ];
    const errorCode = knownErrors.find(code => message.includes(code));
    if (errorCode) throw new BadRequestException(errorCode);
    if (message.includes('IMPORT_REVIEW_SESSION_NOT_FOUND')) throw new NotFoundException('ACTIVITY_SESSION_NOT_FOUND');
    throw new InternalServerErrorException('IMPORT_REVIEW_ASSOCIATION_FAILED');
  }

  /** Clears a pending template suggestion ("keep generic"). */
  public async dismissSuggestion(userId: string, sessionId: string, targetSessionId?: string): Promise<string> {
    const session = await this.getCanonicalActionSession(userId, sessionId, targetSessionId);
    if (
      session.suggested_endurance_template_id == null &&
      session.template_match_score == null &&
      session.template_match_method == null
    ) {
      return session.id;
    }
    await this.updateSession(session.id, {
      suggested_endurance_template_id: null,
      template_match_score: null,
      template_match_method: null,
    });
    return session.id;
  }

  /**
   * Merges the imported session into the existing one. The existing session
   * survives (keeping its template/plan and, for strength, its sets); watch
   * data is applied to it and the imported session is deleted only after
   * everything else succeeded.
   */
  public async mergeDuplicate(userId: string, sessionId: string, targetSessionId?: string): Promise<string> {
    const imported = await this.getOwnedSessionOrExistingTarget(userId, sessionId, targetSessionId);
    if (!imported) {
      if (!targetSessionId) throw new BadRequestException('IMPORT_REVIEW_MERGE_TARGET_REQUIRED');
      return targetSessionId;
    }
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
    // Safety: only a watch-imported session may ever be deleted. A session the
    // user created in the app (manual/interactive, no provenance) must survive.
    if (!this.isImportedSession(source)) {
      throw new BadRequestException('IMPORT_REVIEW_CANNOT_DELETE_APP_SESSION');
    }

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

  private async getOwnedSessionOrExistingTarget(
    userId: string,
    sessionId: string,
    targetSessionId?: string,
  ): Promise<ActivitySessionRow | null> {
    try {
      return await this.getOwnedSession(userId, sessionId);
    } catch (error) {
      if (!targetSessionId || !this.isNotFoundException(error)) throw error;
      await this.getOwnedSession(userId, targetSessionId);
      return null;
    }
  }

  private async getCanonicalActionSession(
    userId: string,
    sessionId: string,
    targetSessionId?: string,
  ): Promise<ActivitySessionRow> {
    try {
      const session = await this.getOwnedSession(userId, sessionId);
      if (targetSessionId && this.shouldUseTargetForAction(session, targetSessionId)) {
        return this.getOwnedSession(userId, targetSessionId);
      }
      return session;
    } catch (error) {
      if (!targetSessionId || !this.isNotFoundException(error)) throw error;
      return this.getOwnedSession(userId, targetSessionId);
    }
  }

  private shouldUseTargetForAction(session: ActivitySessionRow, targetSessionId: string): boolean {
    return session.duplicate_resolution === 'pending' && session.duplicate_of_session_id === targetSessionId;
  }

  /**
   * Automatically merges high-confidence imported duplicates. Returns the
   * survivor id when a merge happened, otherwise null so the import can remain
   * reviewable or generic without blocking sync.
   */
  public async autoMergeDuplicateIfStrong(userId: string, sessionId: string): Promise<string | null> {
    const session = await this.getOwnedSession(userId, sessionId);
    if (
      session.duplicate_resolution !== 'pending' ||
      session.duplicate_of_session_id == null ||
      (session.duplicate_score ?? 0) < DUPLICATE_THRESHOLD
    ) {
      return null;
    }
    const target = await this.getOwnedSession(userId, session.duplicate_of_session_id);
    const importedIsExternal = session.imported_at != null || session.provider_activity_id != null;
    const source = importedIsExternal ? session : target;
    if (!this.isImportedSession(source)) return null;
    return this.mergeDuplicate(userId, session.id, target.id);
  }

  /** Keeps both sessions; for endurance the template match runs now. */
  public async keepBothDuplicates(userId: string, sessionId: string, targetSessionId?: string): Promise<string> {
    const session = await this.getOwnedSessionOrExistingTarget(userId, sessionId, targetSessionId);
    if (!session) {
      if (!targetSessionId) throw new BadRequestException('IMPORT_REVIEW_KEEP_BOTH_TARGET_REQUIRED');
      return targetSessionId;
    }
    if (session.duplicate_resolution !== 'pending') return session.id;
    await this.updateSession(session.id, { duplicate_resolution: 'kept_both' });
    if (session.sport_type !== 'strength' && session.endurance_template_id == null) {
      await this.importReconciliationService.runEnduranceTemplateMatch(userId, session.id);
    }
    return session.id;
  }

  /**
   * Reverts the metrics the watch overrode back to the user's previous app
   * values ("keep mine"). The watch values were applied by default, so this
   * restores `previous` and clears the pending notice.
   */
  public async revertWatchMetrics(userId: string, sessionId: string, targetSessionId?: string): Promise<string> {
    const session = await this.getCanonicalActionSession(userId, sessionId, targetSessionId);
    if (this.isWatchMetricsReviewExpired(session, new Date())) {
      await this.updateSession(session.id, { pending_watch_metrics: null });
      return session.id;
    }
    const previous = this.readPreviousWatchMetrics(session);
    if (!previous) return session.id;
    const payload: ActivitySessionUpdate = { pending_watch_metrics: null };
    for (const column of PENDING_METRIC_COLUMNS) {
      const value = previous[column];
      if (typeof value === 'number') payload[column] = value;
    }
    await this.updateSession(session.id, payload);
    return session.id;
  }

  /** Keeps the watch values (the default) and clears the revert notice. */
  public async keepWatchMetrics(userId: string, sessionId: string, targetSessionId?: string): Promise<string> {
    const session = await this.getCanonicalActionSession(userId, sessionId, targetSessionId);
    if (session.pending_watch_metrics == null) return session.id;
    await this.updateSession(session.id, { pending_watch_metrics: null });
    return session.id;
  }

  /** Clears an expired watch-metric revert notice while keeping the applied watch values. */
  public async clearExpiredWatchMetricsReview(
    userId: string,
    sessionId: string,
    now: Date = new Date(),
  ): Promise<string> {
    const session = await this.getOwnedSession(userId, sessionId);
    if (!this.isWatchMetricsReviewExpired(session, now)) return session.id;
    await this.updateSession(session.id, { pending_watch_metrics: null });
    return session.id;
  }

  /**
   * Strength case 4: the user picks which of today's strength sessions the
   * watch activity belongs to. The generic imported session is deleted only
   * after its data was applied to the chosen session. Without a target the
   * imported session stays as a new workout.
   */
  public async assignStrengthSession(userId: string, sessionId: string, targetSessionId?: string): Promise<string> {
    const generic = await this.getOwnedSessionOrExistingTarget(userId, sessionId, targetSessionId);
    if (!generic) {
      if (!targetSessionId) throw new BadRequestException('IMPORT_REVIEW_ASSIGN_TARGET_INVALID');
      return targetSessionId;
    }
    if (!targetSessionId) {
      await this.updateSession(sessionId, { needs_strength_review: false });
      return sessionId;
    }
    if (targetSessionId === sessionId) throw new BadRequestException('IMPORT_REVIEW_ASSIGN_TARGET_INVALID');
    // Safety: the session being absorbed+deleted must be the watch import, never
    // an app-created session.
    if (!this.isImportedSession(generic)) {
      throw new BadRequestException('IMPORT_REVIEW_CANNOT_DELETE_APP_SESSION');
    }
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
      status: 'completed',
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
      status: 'completed',
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

  /** A session is safe to delete only if it came from a watch/provider import. */
  private isImportedSession(session: ActivitySessionRow): boolean {
    return (
      session.imported_at != null ||
      session.provider_activity_id != null ||
      session.source_record_id != null ||
      session.source === 'imported'
    );
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

  /** Reads the previous app metric values stored for an optional revert. */
  private readPreviousWatchMetrics(session: ActivitySessionRow): Record<string, unknown> | null {
    const raw = session.pending_watch_metrics;
    if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const previous = (raw as Record<string, unknown>).previous;
    if (previous == null || typeof previous !== 'object' || Array.isArray(previous)) return null;
    return previous as Record<string, unknown>;
  }

  private isWatchMetricsReviewExpired(session: ActivitySessionRow, now: Date): boolean {
    if (session.pending_watch_metrics == null) return false;
    const receivedAt = this.readPendingWatchMetricsReceivedAt(session);
    const startedAt = this.readTime(session.start_time);
    if (receivedAt == null || startedAt == null) return true;
    const nowTime = now.getTime();
    return (
      nowTime - receivedAt >= WATCH_METRICS_REVERT_WINDOW_MS || nowTime - startedAt >= WATCH_METRICS_SESSION_MAX_AGE_MS
    );
  }

  private readPendingWatchMetricsReceivedAt(session: ActivitySessionRow): number | null {
    const raw = session.pending_watch_metrics;
    if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) return null;
    return this.readTime((raw as Record<string, unknown>).received_at);
  }

  private readTime(value: unknown): number | null {
    if (typeof value !== 'string') return null;
    const time = new Date(value).getTime();
    return Number.isFinite(time) ? time : null;
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

  private isNotFoundException(error: unknown): boolean {
    return error instanceof NotFoundException;
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
