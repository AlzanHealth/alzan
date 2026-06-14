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

const WEARABLE_IMPORT_SOURCE = 'wearable_import';

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
      await this.assertOwnedRow(userId, 'endurance_workout_templates', input.enduranceTemplateId);
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
    await this.moveImportArtifacts(source.id, survivor.id);
    await this.moveWorkoutStructure(source.id, survivor.id);
    await this.relinkSessionReferences(source.id, survivor.id);
    if (source.raw_payload_id) {
      await this.rawPayloadService.linkPayload({
        rawPayloadId: source.raw_payload_id,
        relatedTable: 'activity_sessions',
        relatedId: survivor.id,
      });
    }
    await this.deleteSession(source.id);
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

  /** Applies the pending watch metrics after explicit user consent. */
  public async applyPendingWatchMetrics(userId: string, sessionId: string): Promise<string> {
    const session = await this.getOwnedSession(userId, sessionId);
    const pending = this.readPendingWatchMetrics(session);
    if (!pending) return sessionId;
    const payload: ActivitySessionUpdate = { pending_watch_metrics: null };
    for (const column of PENDING_METRIC_COLUMNS) {
      const value = pending.metrics[column];
      if (typeof value === 'number') payload[column] = value;
    }
    if (typeof pending.end_time === 'string') payload.end_time = pending.end_time;
    await this.updateSession(sessionId, payload);
    return sessionId;
  }

  /** Discards the pending watch metrics ("keep current values"). */
  public async dismissPendingWatchMetrics(userId: string, sessionId: string): Promise<string> {
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
    if (target.sport_type !== 'strength') throw new BadRequestException('IMPORT_REVIEW_ASSIGN_TARGET_INVALID');

    const split = splitStrengthMetrics(this.toStrengthLite(target), this.toWatchMetrics(generic));
    const payload: ActivitySessionUpdate = {
      ...split.applicable,
      pending_watch_metrics: this.importReconciliationService.buildPendingWatchMetrics(split, generic.end_time),
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
    await this.moveImportArtifacts(generic.id, target.id);
    await this.moveWorkoutStructure(generic.id, target.id);
    await this.relinkSessionReferences(generic.id, target.id);
    if (generic.raw_payload_id) {
      await this.rawPayloadService.linkPayload({
        rawPayloadId: generic.raw_payload_id,
        relatedTable: 'activity_sessions',
        relatedId: target.id,
      });
    }
    await this.deleteSession(generic.id);
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
   * Moves the imported artifacts (zones, streams, provider fields, laps and
   * route points) onto the surviving session, replacing the survivor's
   * previous wearable-import artifacts. Nothing belonging to the removed
   * session is dropped — children would otherwise be cascade-deleted with it.
   */
  private async moveImportArtifacts(fromSessionId: string, toSessionId: string): Promise<void> {
    const client = this.supabaseAdminService.client;

    // Each artifact type is only replaced on the survivor when the removed
    // session actually has rows to move; otherwise the survivor's own
    // artifacts are kept untouched.
    const { count: zonesToMove } = await client
      .from('activity_heart_rate_zones')
      .select('id', { count: 'exact', head: true })
      .eq('session_id', fromSessionId);
    if ((zonesToMove ?? 0) > 0) {
      await this.run(client.from('activity_heart_rate_zones').delete().eq('session_id', toSessionId), 'ZONES_CLEAR');
      await this.run(
        client.from('activity_heart_rate_zones').update({ session_id: toSessionId }).eq('session_id', fromSessionId),
        'ZONES_MOVE',
      );
    }

    const { count: streamsToMove } = await client
      .from('activity_streams')
      .select('id', { count: 'exact', head: true })
      .eq('session_id', fromSessionId)
      .eq('source', WEARABLE_IMPORT_SOURCE);
    if ((streamsToMove ?? 0) > 0) {
      await this.run(
        client.from('activity_streams').delete().eq('session_id', toSessionId).eq('source', WEARABLE_IMPORT_SOURCE),
        'STREAMS_CLEAR',
      );
      await this.run(
        client
          .from('activity_streams')
          .update({ session_id: toSessionId })
          .eq('session_id', fromSessionId)
          .eq('source', WEARABLE_IMPORT_SOURCE),
        'STREAMS_MOVE',
      );
      await this.run(
        client
          .from('activity_stream_samples')
          .delete()
          .eq('session_id', toSessionId)
          .eq('source', WEARABLE_IMPORT_SOURCE),
        'STREAM_SAMPLES_CLEAR',
      );
      await this.run(
        client
          .from('activity_stream_samples')
          .update({ session_id: toSessionId })
          .eq('session_id', fromSessionId)
          .eq('source', WEARABLE_IMPORT_SOURCE),
        'STREAM_SAMPLES_MOVE',
      );
    }

    const { count: providerFieldsToMove } = await client
      .from('activity_provider_fields')
      .select('session_id', { count: 'exact', head: true })
      .eq('session_id', fromSessionId);
    if ((providerFieldsToMove ?? 0) > 0) {
      await this.run(
        client.from('activity_provider_fields').delete().eq('session_id', toSessionId),
        'PROVIDER_FIELDS_CLEAR',
      );
      await this.run(
        client.from('activity_provider_fields').update({ session_id: toSessionId }).eq('session_id', fromSessionId),
        'PROVIDER_FIELDS_MOVE',
      );
    }

    const { count: lapsToMove } = await client
      .from('activity_laps')
      .select('id', { count: 'exact', head: true })
      .eq('session_id', fromSessionId);
    if ((lapsToMove ?? 0) > 0) {
      await this.run(
        client.from('activity_laps').delete().eq('session_id', toSessionId).eq('split_group', 'custom'),
        'LAPS_CLEAR',
      );
      await this.run(
        client.from('activity_laps').update({ session_id: toSessionId }).eq('session_id', fromSessionId),
        'LAPS_MOVE',
      );
    }
    const { count: routePointsToMove } = await client
      .from('activity_route_points')
      .select('id', { count: 'exact', head: true })
      .eq('session_id', fromSessionId);
    if ((routePointsToMove ?? 0) > 0) {
      await this.run(client.from('activity_route_points').delete().eq('session_id', toSessionId), 'ROUTE_CLEAR');
      await this.run(
        client.from('activity_route_points').update({ session_id: toSessionId }).eq('session_id', fromSessionId),
        'ROUTE_MOVE',
      );
    }
  }

  /**
   * Moves workout sets (and superset links) from the removed session to the
   * survivor so user-logged strength structure is never lost, renumbering
   * each exercise's sets to continue after the survivor's existing ones.
   */
  private async moveWorkoutStructure(fromSessionId: string, toSessionId: string): Promise<void> {
    const client = this.supabaseAdminService.client;
    const { data: sourceSets, error: sourceError } = await client
      .from('workout_sets')
      .select('id, exercise_id, set_number')
      .eq('session_id', fromSessionId)
      .order('set_number', { ascending: true });
    if (sourceError) throw new InternalServerErrorException('IMPORT_REVIEW_SETS_READ_FAILED');
    if (!sourceSets || sourceSets.length === 0) return;

    const { data: survivorSets, error: survivorError } = await client
      .from('workout_sets')
      .select('exercise_id, set_number')
      .eq('session_id', toSessionId);
    if (survivorError) throw new InternalServerErrorException('IMPORT_REVIEW_SETS_READ_FAILED');

    const nextNumberByExercise = new Map<string, number>();
    for (const set of survivorSets ?? []) {
      const current = nextNumberByExercise.get(set.exercise_id) ?? 0;
      nextNumberByExercise.set(set.exercise_id, Math.max(current, set.set_number ?? 0));
    }
    for (const set of sourceSets) {
      const nextNumber = (nextNumberByExercise.get(set.exercise_id) ?? 0) + 1;
      nextNumberByExercise.set(set.exercise_id, nextNumber);
      await this.run(
        client.from('workout_sets').update({ session_id: toSessionId, set_number: nextNumber }).eq('id', set.id),
        'SETS_MOVE',
      );
    }

    // Superset links only move when the survivor has none of its own,
    // otherwise grouping metadata could clash.
    const { count: survivorLinks } = await client
      .from('activity_session_superset_links')
      .select('id', { count: 'exact', head: true })
      .eq('session_id', toSessionId);
    if ((survivorLinks ?? 0) === 0) {
      await this.run(
        client
          .from('activity_session_superset_links')
          .update({ session_id: toSessionId })
          .eq('session_id', fromSessionId),
        'SUPERSET_LINKS_MOVE',
      );
    }

    // Recompute the survivor's strength totals from the final set list.
    const { data: finalSets, error: finalError } = await client
      .from('workout_sets')
      .select('reps, weight_kg')
      .eq('session_id', toSessionId);
    if (finalError) throw new InternalServerErrorException('IMPORT_REVIEW_SETS_READ_FAILED');
    const totals = (finalSets ?? []).reduce(
      (acc, set) => ({
        sets: acc.sets + 1,
        reps: acc.reps + (set.reps ?? 0),
        volume: acc.volume + (set.reps ?? 0) * (set.weight_kg ?? 0),
      }),
      { sets: 0, reps: 0, volume: 0 },
    );
    await this.updateSession(toSessionId, {
      total_sets: totals.sets,
      total_reps: totals.reps,
      total_volume_kg: Math.round(totals.volume * 100) / 100,
    });
  }

  /**
   * Repoints every remaining reference from the removed session to the
   * survivor (plans, files, health samples, feedback, tags) so nothing is
   * lost or left dangling when the duplicate is deleted.
   */
  private async relinkSessionReferences(fromSessionId: string, toSessionId: string): Promise<void> {
    const client = this.supabaseAdminService.client;
    await this.run(
      client
        .from('workout_plans')
        .update({ activity_session_id: toSessionId })
        .eq('activity_session_id', fromSessionId),
      'PLANS_RELINK',
    );
    await this.run(
      client.from('activity_files').update({ session_id: toSessionId }).eq('session_id', fromSessionId),
      'FILES_RELINK',
    );
    await this.run(
      client
        .from('health_metric_samples')
        .update({ activity_session_id: toSessionId })
        .eq('activity_session_id', fromSessionId),
      'HEALTH_SAMPLES_RELINK',
    );
    await this.run(
      client.from('vo2_max_logs').update({ activity_session_id: toSessionId }).eq('activity_session_id', fromSessionId),
      'VO2_LOGS_RELINK',
    );
    await this.run(
      client.from('session_feedback').update({ session_id: toSessionId }).eq('session_id', fromSessionId),
      'FEEDBACK_RELINK',
    );
    await this.run(
      client.from('activity_session_tags').update({ session_id: toSessionId }).eq('session_id', fromSessionId),
      'TAGS_RELINK',
    );
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

  private readPendingWatchMetrics(
    session: ActivitySessionRow,
  ): { metrics: Record<string, unknown>; end_time: unknown } | null {
    const raw = session.pending_watch_metrics;
    if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const record = raw as Record<string, unknown>;
    const metrics = record.metrics;
    if (metrics == null || typeof metrics !== 'object' || Array.isArray(metrics)) return null;
    return { metrics: metrics as Record<string, unknown>, end_time: record.end_time };
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

  private async updateSession(sessionId: string, payload: ActivitySessionUpdate): Promise<void> {
    const { error } = await this.supabaseAdminService.client
      .from('activity_sessions')
      .update(payload)
      .eq('id', sessionId);
    if (error) throw new InternalServerErrorException('IMPORT_REVIEW_SESSION_UPDATE_FAILED');
  }

  private async deleteSession(sessionId: string): Promise<void> {
    const { error } = await this.supabaseAdminService.client.from('activity_sessions').delete().eq('id', sessionId);
    if (error) throw new InternalServerErrorException('IMPORT_REVIEW_SESSION_DELETE_FAILED');
  }

  private async run(query: PromiseLike<{ error: { message: string } | null }>, step: string): Promise<void> {
    const { error } = await query;
    if (error) throw new InternalServerErrorException(`IMPORT_REVIEW_${step}_FAILED`);
  }
}
