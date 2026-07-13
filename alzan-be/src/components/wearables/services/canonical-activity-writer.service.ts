import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Json } from '../../../types/database.types';
import { Database, Insert, Update } from '../../../types/requests.types';
import { SupabaseAdminService } from '../../../core/supabase/supabase.service';
import { DUPLICATE_THRESHOLD } from '../../activity-import/matching/duplicate-score';
import {
  CanonicalActivity,
  CanonicalActivityMetricSample,
} from '../../activity-import/parsers/activity-import-canonical.types';
import { normaliseCanonicalActivityLaps } from '../../activity-import/parsers/canonical-lap-normalizer';
import {
  buildDistanceSplitBucketsFromLaps,
  isOneKilometerAutoLapSequence,
} from '../../activity-import/parsers/lap-split-utils';
import { encodePolyline } from '../../activity-import/parsers/route-import.parser';
import {
  ActivityDatabaseProvider,
  CanonicalProvenance,
  UpsertActivityInput,
  WearableProvider,
} from '../domain/wearable.types';
import { DedupeService } from './dedupe.service';
import { ImportReconciliationService } from './import-reconciliation.service';
import { RawPayloadService } from './raw-payload.service';

type ActivitySessionInsert = Insert<'activity_sessions'>;
type ActivitySessionUpdate = Update<'activity_sessions'>;
type ActivityLapInsert = Insert<'activity_laps'>;
type ActivityHeartRateZoneInsert = Insert<'activity_heart_rate_zones'>;
type ActivityStreamInsert = Insert<'activity_streams'>;
type ActivityRoutePointInsert = Insert<'activity_route_points'>;
type ActivityStreamSampleInsert = Insert<'activity_stream_samples'>;
type ActivityProviderFieldsInsert = Insert<'activity_provider_fields'>;
type StreamType = Database['public']['Enums']['stream_type_enum'];
type ChunkInsertError = {
  code?: string | null;
  details?: string | null;
  hint?: string | null;
  message?: string | null;
};
type ExistingSessionMeta = {
  duplicate_of_session_id: string | null;
  duplicate_resolution: string | null;
  duplicate_score: number | null;
  source: string | null;
  sport_type: string;
  endurance_template_id: string | null;
};

const WEARABLE_IMPORT_SOURCE = 'wearable_import';
const ROUTE_POINT_INSERT_CHUNK_SIZE = 200;
const STREAM_SAMPLE_INSERT_CHUNK_SIZE = 100;
const MIN_RETRY_INSERT_CHUNK_SIZE = 25;
const INSERT_RETRY_BASE_DELAY_MS = 150;
const INSERT_RETRY_ATTEMPTS = 3;

/**
 * Gym workouts can arrive from watches as either 'strength' or 'gym', and
 * Alzan's interactive sessions are stored as 'strength'. Both must follow the
 * strength reconciliation path so external metrics attach to the user's
 * interactive session instead of creating a duplicate.
 */
function isStrengthSport(sportType: string | null | undefined): boolean {
  return sportType === 'strength' || sportType === 'gym';
}

@Injectable()
export class CanonicalActivityWriterService {
  private readonly logger = new Logger(CanonicalActivityWriterService.name);

  constructor(
    private readonly supabaseAdminService: SupabaseAdminService,
    rawPayloadService: RawPayloadService,
    private readonly dedupeService: DedupeService,
    private readonly importReconciliationService: ImportReconciliationService,
  ) {
    void rawPayloadService;
  }

  public async upsertActivity(input: UpsertActivityInput): Promise<string> {
    const deviceId = await this.ensureDevice(input.userId, input.activity, input.provenance);
    const existingSessionId = await this.findExistingSessionId(input.userId, input.activity, input.provenance);
    const sessionPayload = this.buildSessionPayload(input, deviceId);

    let sessionId: string;
    let sessionPayloadToPersist: ActivitySessionInsert | ActivitySessionUpdate;
    let clearProvenanceSessionId: string | null = null;
    let completeAssociatedPlans = false;
    let strengthAssociation = false;
    let shouldRunEnduranceTemplateMatch = false;
    if (existingSessionId) {
      const writeSessionId = await this.resolveExistingWriteSessionId(existingSessionId);
      const redirectedDuplicate = writeSessionId !== existingSessionId;
      if (writeSessionId !== existingSessionId) {
        clearProvenanceSessionId = existingSessionId;
      }
      // Re-sync of an activity already linked to a session. If that session
      // is an Alzan strength session that absorbed the external activity,
      // never overwrite its metrics again (the user may have chosen to keep
      // their own values): refresh provenance only.
      const existingMeta = await this.getSessionMeta(writeSessionId);
      if (redirectedDuplicate) {
        strengthAssociation = isStrengthSport(input.activity.sportType);
        sessionId = writeSessionId;
        sessionPayloadToPersist = strengthAssociation
          ? this.buildStrengthAssociationPayload(input, deviceId)
          : this.buildEnduranceAssociationPayload(input, deviceId);
        completeAssociatedPlans = true;
      } else if (isStrengthSport(existingMeta?.sport_type) && existingMeta?.source !== 'imported') {
        strengthAssociation = true;
        sessionId = writeSessionId;
        sessionPayloadToPersist = this.buildProvenancePayload(input, deviceId);
      } else {
        sessionId = writeSessionId;
        sessionPayloadToPersist = sessionPayload;
        shouldRunEnduranceTemplateMatch =
          !isStrengthSport(existingMeta?.sport_type) && existingMeta?.endurance_template_id == null;
      }
    } else if (isStrengthSport(input.activity.sportType)) {
      // The watch never creates sets: a same-day Alzan strength session may
      // absorb the external metrics instead of spawning a new session.
      const directive = await this.importReconciliationService.resolveStrengthDirective(input.userId, input.activity);
      if (directive.kind === 'associate') {
        strengthAssociation = true;
        sessionId = directive.targetSessionId;
        sessionPayloadToPersist = {
          ...directive.payload,
          ...this.buildProvenancePayload(input, deviceId),
        };
        completeAssociatedPlans = true;
      } else {
        sessionId = randomUUID();
        sessionPayloadToPersist = { ...sessionPayload, ...directive.extraFields } as ActivitySessionInsert;
        await this.insertHydrationSkeleton(sessionId, sessionPayloadToPersist as ActivitySessionInsert);
      }
    } else {
      const directive = await this.importReconciliationService.resolveEnduranceDirective(input.userId, input.activity);
      if (directive.kind === 'associate') {
        sessionId = directive.targetSessionId;
        sessionPayloadToPersist = this.buildEnduranceAssociationPayload(input, deviceId);
        completeAssociatedPlans = true;
      } else {
        sessionId = randomUUID();
        sessionPayloadToPersist = {
          ...sessionPayload,
          ...(directive.extraFields ?? {}),
        } as ActivitySessionInsert;
        await this.insertHydrationSkeleton(sessionId, sessionPayloadToPersist as ActivitySessionInsert);
        shouldRunEnduranceTemplateMatch = directive.runTemplateMatch;
      }
    }

    await this.persistActivityBundle({
      input,
      sessionId,
      sessionPayload: sessionPayloadToPersist,
      clearProvenanceSessionId,
      replaceLaps: !strengthAssociation,
    });

    if (completeAssociatedPlans) {
      await this.importReconciliationService.completePlansForAssociatedSession(input.userId, sessionId);
    }

    if (shouldRunEnduranceTemplateMatch) {
      try {
        await this.importReconciliationService.runEnduranceTemplateMatch(input.userId, sessionId);
        await this.finishLifecycleReconciliation(input.lifecycleImportId, null);
      } catch (error) {
        this.logger.warn(`Template matching deferred for imported session ${sessionId}`, error as Error);
        await this.finishLifecycleReconciliation(input.lifecycleImportId, this.errorMessage(error));
      }
    } else {
      await this.finishLifecycleReconciliation(input.lifecycleImportId, null);
    }

    return sessionId;
  }

  private async finishLifecycleReconciliation(
    importId: string | null | undefined,
    errorCode: string | null,
  ): Promise<void> {
    if (!importId) return;
    const { error } = await this.supabaseAdminService.client.rpc('finish_wearable_activity_reconciliation', {
      p_import_id: importId,
      p_error_code: errorCode as string,
    });
    if (error) this.logger.error('Failed to persist wearable reconciliation status', error as Error);
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : 'WEARABLE_RECONCILIATION_FAILED';
  }

  private async resolveExistingWriteSessionId(sessionId: string): Promise<string> {
    const meta = await this.getSessionMeta(sessionId);
    if (!meta) return sessionId;
    if (
      meta.duplicate_resolution === 'pending' &&
      meta.duplicate_of_session_id != null &&
      (meta.duplicate_score ?? 0) >= DUPLICATE_THRESHOLD
    ) {
      return meta.duplicate_of_session_id;
    }
    return sessionId;
  }

  private async getSessionMeta(sessionId: string): Promise<ExistingSessionMeta | null> {
    const { data, error } = await this.supabaseAdminService.client
      .from('activity_sessions')
      .select(
        'sport_type, source, endurance_template_id, duplicate_of_session_id, duplicate_resolution, duplicate_score',
      )
      .eq('id', sessionId)
      .maybeSingle();
    if (error) throw new InternalServerErrorException('WEARABLE_ACTIVITY_LOOKUP_FAILED');
    return data;
  }

  /** Provenance-only payload used when associating an external strength activity to an existing session. */
  private buildProvenancePayload(input: UpsertActivityInput, deviceId: string | null): ActivitySessionUpdate {
    return {
      provider: this.toActivityDatabaseProvider(input.provenance.provider),
      provider_activity_id: input.activity.providerActivityId,
      device_id: deviceId,
      imported_at: new Date().toISOString(),
      source_channel: input.provenance.sourceChannel,
      source_package: input.provenance.sourcePackage,
      source_provider_key: input.provenance.sourceProviderKey,
      source_record_id: input.provenance.sourceRecordId,
      source_updated_at: input.provenance.sourceUpdatedAt,
      raw_payload_id: input.provenance.rawPayloadId,
    };
  }

  private async ensureDevice(
    userId: string,
    activity: CanonicalActivity,
    provenance: CanonicalProvenance,
  ): Promise<string | null> {
    if (!activity.device) return null;
    const serial = activity.device.serial?.trim() || null;
    const name = activity.device.name?.trim() || null;
    const model = activity.device.model?.trim() || null;
    if (!serial && !name && !model) return null;
    const { data, error } = await this.supabaseAdminService.client.rpc('upsert_wearable_device', {
      p_user_id: userId,
      p_provider: provenance.provider,
      p_device_name: name as string,
      p_device_model: model as string,
      p_device_serial: serial as string,
    });
    if (error) throw new InternalServerErrorException('WEARABLE_DEVICE_CREATE_FAILED');
    return data;
  }

  private async findExistingSessionId(
    userId: string,
    activity: CanonicalActivity,
    provenance: CanonicalProvenance,
  ): Promise<string | null> {
    const provider = this.toActivityDatabaseProvider(provenance.provider);
    const providerActivityId = activity.providerActivityId;
    if (providerActivityId) {
      const found = await this.findSessionByRecord({
        userId,
        provider,
        sourceChannel: provenance.sourceChannel,
        sourcePackage: provenance.sourcePackage,
        column: 'provider_activity_id',
        value: providerActivityId,
      });
      if (found) return found;
    }
    if (!provenance.sourceRecordId) return null;
    return this.findSessionByRecord({
      userId,
      provider,
      sourceChannel: provenance.sourceChannel,
      sourcePackage: provenance.sourcePackage,
      column: 'source_record_id',
      value: provenance.sourceRecordId,
    });
  }

  private async findSessionByRecord(input: {
    userId: string;
    provider: ActivityDatabaseProvider;
    sourceChannel: string;
    sourcePackage: string | null;
    column: 'provider_activity_id' | 'source_record_id';
    value: string;
  }): Promise<string | null> {
    let query = this.supabaseAdminService.client
      .from('activity_sessions')
      .select('id')
      .eq('user_id', input.userId)
      .eq('provider', input.provider)
      .eq('source_channel', input.sourceChannel)
      .eq(input.column, input.value);
    query = input.sourcePackage ? query.eq('source_package', input.sourcePackage) : query.is('source_package', null);
    const { data, error } = await query.maybeSingle();
    if (error) throw new InternalServerErrorException('WEARABLE_ACTIVITY_LOOKUP_FAILED');
    return data?.id ?? null;
  }

  private buildSessionPayload(input: UpsertActivityInput, deviceId: string | null): ActivitySessionInsert {
    const summary = input.activity.summary;
    const provider = this.toActivityDatabaseProvider(input.provenance.provider);
    return {
      user_id: input.userId,
      sport_type: input.activity.sportType,
      sport_subtype: input.activity.sportSubtype,
      start_time: summary.startedAt ?? new Date().toISOString(),
      end_time: summary.endedAt,
      timezone: summary.timezone ?? null,
      started_at_local: summary.startedAtLocal ?? null,
      ended_at_local: summary.endedAtLocal ?? null,
      duration_s: summary.durationSeconds,
      distance_m: summary.distanceM,
      elev_gain_m: summary.elevationGainM,
      elev_loss_m: summary.elevationLossM,
      avg_heart_rate: summary.avgHeartRate,
      max_heart_rate: summary.maxHeartRate,
      min_heart_rate: summary.minHeartRate,
      avg_speed_m_per_s: summary.avgSpeedMps,
      calories_kcal: summary.caloriesKcal,
      source: 'imported',
      provider,
      provider_activity_id: input.activity.providerActivityId,
      device_id: deviceId,
      avg_cadence: summary.avgCadence == null ? null : Math.round(summary.avgCadence),
      max_cadence: summary.maxCadence == null ? null : Math.round(summary.maxCadence),
      avg_power_w: summary.avgPowerW == null ? null : Math.round(summary.avgPowerW),
      max_power_w: summary.maxPowerW == null ? null : Math.round(summary.maxPowerW),
      avg_temp_c: summary.avgTemperatureC,
      max_temp_c: summary.maxTemperatureC,
      imported_at: new Date().toISOString(),
      recovery_time_s: summary.recoveryTimeSeconds,
      total_steps: summary.totalSteps,
      vo2_max: summary.vo2Max,
      tss_hr: summary.tss,
      epoc: summary.epoc,
      pte: summary.pte,
      source_channel: input.provenance.sourceChannel,
      source_package: input.provenance.sourcePackage,
      source_provider_key: input.provenance.sourceProviderKey,
      source_record_id: input.provenance.sourceRecordId,
      source_updated_at: input.provenance.sourceUpdatedAt,
      raw_payload_id: input.provenance.rawPayloadId,
    };
  }

  private buildEnduranceAssociationPayload(input: UpsertActivityInput, deviceId: string | null): ActivitySessionUpdate {
    const summary = input.activity.summary;
    const payload: ActivitySessionUpdate = {
      status: 'completed',
      end_time: summary.endedAt,
      timezone: summary.timezone ?? null,
      started_at_local: summary.startedAtLocal ?? null,
      ended_at_local: summary.endedAtLocal ?? null,
      duration_s: summary.durationSeconds,
      distance_m: summary.distanceM,
      elev_gain_m: summary.elevationGainM,
      elev_loss_m: summary.elevationLossM,
      avg_heart_rate: summary.avgHeartRate,
      max_heart_rate: summary.maxHeartRate,
      min_heart_rate: summary.minHeartRate,
      avg_speed_m_per_s: summary.avgSpeedMps,
      calories_kcal: summary.caloriesKcal,
      avg_cadence: summary.avgCadence == null ? null : Math.round(summary.avgCadence),
      max_cadence: summary.maxCadence == null ? null : Math.round(summary.maxCadence),
      avg_power_w: summary.avgPowerW == null ? null : Math.round(summary.avgPowerW),
      max_power_w: summary.maxPowerW == null ? null : Math.round(summary.maxPowerW),
      avg_temp_c: summary.avgTemperatureC,
      max_temp_c: summary.maxTemperatureC,
      recovery_time_s: summary.recoveryTimeSeconds,
      total_steps: summary.totalSteps,
      vo2_max: summary.vo2Max,
      tss_hr: summary.tss,
      epoc: summary.epoc,
      pte: summary.pte,
      ...this.buildProvenancePayload(input, deviceId),
      duplicate_of_session_id: null,
      duplicate_score: null,
      duplicate_resolution: 'merged',
      needs_strength_review: false,
    };
    if (summary.startedAt) payload.start_time = summary.startedAt;
    return payload;
  }

  private buildStrengthAssociationPayload(input: UpsertActivityInput, deviceId: string | null): ActivitySessionUpdate {
    const summary = input.activity.summary;
    return {
      status: 'completed',
      end_time: summary.endedAt,
      duration_s: summary.durationSeconds,
      calories_kcal: summary.caloriesKcal,
      avg_heart_rate: summary.avgHeartRate,
      max_heart_rate: summary.maxHeartRate,
      min_heart_rate: summary.minHeartRate,
      recovery_time_s: summary.recoveryTimeSeconds,
      epoc: summary.epoc,
      pte: summary.pte,
      tss_hr: summary.tss,
      ...this.buildProvenancePayload(input, deviceId),
      pending_watch_metrics: null,
      duplicate_of_session_id: null,
      duplicate_score: null,
      duplicate_resolution: 'merged',
      needs_strength_review: false,
    };
  }

  private async insertHydrationSkeleton(sessionId: string, payload: ActivitySessionInsert): Promise<void> {
    await this.insertSession({
      id: sessionId,
      user_id: payload.user_id,
      sport_type: payload.sport_type,
      sport_subtype: payload.sport_subtype,
      start_time: payload.start_time,
      end_time: null,
      source: payload.source,
      provider: payload.provider,
      provider_activity_id: payload.provider_activity_id,
      source_channel: payload.source_channel,
      source_package: payload.source_package,
      source_provider_key: payload.source_provider_key,
      source_record_id: payload.source_record_id,
      source_updated_at: payload.source_updated_at,
      raw_payload_id: payload.raw_payload_id,
    });
  }

  private async persistActivityBundle(params: {
    input: UpsertActivityInput;
    sessionId: string;
    sessionPayload: ActivitySessionInsert | ActivitySessionUpdate;
    clearProvenanceSessionId: string | null;
    replaceLaps: boolean;
  }): Promise<void> {
    const { input, sessionId } = params;
    const positionSamples = this.sanitizePositionSamples(input.activity.streams.position);
    const routePoints: ActivityRoutePointInsert[] = positionSamples.map((point, index) => ({
      session_id: sessionId,
      user_id: input.userId,
      point_index: index,
      timestamp: point.timestamp,
      offset_s: point.offsetSeconds,
      lat: point.lat,
      lon: point.lon,
      altitude_m: point.altitudeM,
      distance_m: point.distanceM,
      speed_mps: point.speedMps,
      horizontal_accuracy_m: point.horizontalAccuracyM,
      vertical_accuracy_m: point.verticalAccuracyM,
      source: WEARABLE_IMPORT_SOURCE,
      source_channel: input.provenance.sourceChannel,
      source_package: input.provenance.sourcePackage,
      source_record_id: input.provenance.sourceRecordId,
      raw_payload_id: input.provenance.rawPayloadId,
      raw_payload: null,
    }));
    const providerFields = this.buildProviderFieldsPayload(sessionId, input.userId, input.activity, input.provenance);
    const { error } = await this.supabaseAdminService.client.rpc('persist_wearable_activity_bundle', {
      p_user_id: input.userId,
      p_session_id: sessionId,
      p_session_payload: this.toJson(params.sessionPayload),
      p_clear_provenance_session_id: (params.clearProvenanceSessionId ?? null) as string,
      p_replace_laps: params.replaceLaps,
      p_laps: this.toJson(this.buildLapRows(sessionId, input.userId, input.activity)),
      p_heart_rate_zones: this.toJson(
        input.activity.heartRateZones.map(zone => ({
          session_id: sessionId,
          zone: zone.zone,
          duration_s: zone.durationSeconds,
          percentage: Number.parseFloat(Math.max(0, Math.min(100, zone.percentage)).toFixed(2)),
        })),
      ),
      p_streams: this.toJson(this.buildStreamRows(sessionId, input.userId, input.activity, input.provenance)),
      p_stream_samples: this.toJson(
        this.buildStreamSampleRows(sessionId, input.userId, input.activity, input.provenance),
      ),
      p_route_points: this.toJson(routePoints),
      p_route_polyline:
        positionSamples.length > 0
          ? encodePolyline(positionSamples.map(point => [point.lat, point.lon] as [number, number]))
          : (null as unknown as string),
      p_provider_fields: this.toJson(providerFields),
      p_raw_payload_id: (input.provenance.rawPayloadId ?? null) as string,
      p_import_id: (input.lifecycleImportId ?? null) as string,
      p_job_id: (input.lifecycleJobId ?? null) as string,
      p_canonical_version: input.canonicalVersion ?? input.activity.hydrationVersion ?? 1,
    });
    if (error) throw new InternalServerErrorException('WEARABLE_ACTIVITY_BUNDLE_PERSIST_FAILED');
  }

  private async insertSession(payload: ActivitySessionInsert): Promise<string> {
    const { data, error } = await this.supabaseAdminService.client
      .from('activity_sessions')
      .insert(payload)
      .select('id')
      .single();
    if (error) throw new InternalServerErrorException('WEARABLE_ACTIVITY_INSERT_FAILED');
    return data.id;
  }

  public async replaceLaps(sessionId: string, userId: string, activity: CanonicalActivity): Promise<void> {
    const { error: deleteError } = await this.supabaseAdminService.client
      .from('activity_laps')
      .delete()
      .eq('session_id', sessionId);
    if (deleteError) throw new InternalServerErrorException('WEARABLE_ACTIVITY_LAPS_DELETE_FAILED');
    const rows = this.buildLapRows(sessionId, userId, activity);
    if (rows.length === 0) return;
    const { error } = await this.supabaseAdminService.client.from('activity_laps').insert(rows);
    if (error) throw new InternalServerErrorException('WEARABLE_ACTIVITY_LAPS_INSERT_FAILED');
  }

  private buildLapRows(sessionId: string, userId: string, activity: CanonicalActivity): ActivityLapInsert[] {
    if (activity.laps.length === 0) return [];
    const laps = normaliseCanonicalActivityLaps(activity.laps, activity.summary);
    if (laps.length === 0) return [];

    const distanceBuckets = buildDistanceSplitBucketsFromLaps(laps);
    const tabRows =
      distanceBuckets.length > 0
        ? distanceBuckets.flatMap((bucket, bucketIndex) =>
            bucket.laps.map(lap =>
              this.buildActivityLapInsert({
                lap,
                sessionId,
                userId,
                splitGroup: 'distance',
                splitGroupOrder: bucketIndex,
                splitDistanceM: bucket.splitDistanceM,
              }),
            ),
          )
        : laps.map(lap =>
            this.buildActivityLapInsert({
              lap,
              sessionId,
              userId,
              splitGroup: isOneKilometerAutoLapSequence(laps) ? 'distance' : 'custom',
              splitGroupOrder: 0,
              splitDistanceM: isOneKilometerAutoLapSequence(laps) ? 1000 : null,
            }),
          );
    return tabRows;
  }

  private buildActivityLapInsert(params: {
    lap: CanonicalActivity['laps'][number];
    sessionId: string;
    userId: string;
    splitGroup: 'custom' | 'distance';
    splitGroupOrder: number;
    splitDistanceM: number | null;
  }): ActivityLapInsert {
    return {
      session_id: params.sessionId,
      user_id: params.userId,
      lap_index: params.lap.lapIndex,
      lap_type: params.lap.lapType,
      split_group: params.splitGroup,
      split_group_order: params.splitGroupOrder,
      split_distance_m: params.splitDistanceM,
      distance_m: params.lap.distanceM,
      duration_s: params.lap.durationSeconds,
      avg_heart_rate: params.lap.avgHeartRate == null ? null : Math.round(params.lap.avgHeartRate),
      max_heart_rate: params.lap.maxHeartRate == null ? null : Math.round(params.lap.maxHeartRate),
      avg_pace_s_per_km: params.lap.avgPaceSecondsPerKm == null ? null : Math.round(params.lap.avgPaceSecondsPerKm),
      start_offset_s: params.lap.startOffsetSeconds == null ? null : Math.round(params.lap.startOffsetSeconds),
      end_offset_s: params.lap.endOffsetSeconds == null ? null : Math.round(params.lap.endOffsetSeconds),
    };
  }

  public async replaceHeartRateZones(sessionId: string, activity: CanonicalActivity): Promise<void> {
    const { error: deleteError } = await this.supabaseAdminService.client
      .from('activity_heart_rate_zones')
      .delete()
      .eq('session_id', sessionId);
    if (deleteError) throw new InternalServerErrorException('WEARABLE_ACTIVITY_ZONES_DELETE_FAILED');
    if (activity.heartRateZones.length === 0) return;

    const rows: ActivityHeartRateZoneInsert[] = activity.heartRateZones.map(zone => ({
      session_id: sessionId,
      zone: zone.zone,
      duration_s: zone.durationSeconds,
      percentage: Number.parseFloat(Math.max(0, Math.min(100, zone.percentage)).toFixed(2)),
    }));
    const { error } = await this.supabaseAdminService.client.from('activity_heart_rate_zones').insert(rows);
    if (error) throw new InternalServerErrorException('WEARABLE_ACTIVITY_ZONES_INSERT_FAILED');
  }

  public async replaceStreams(
    sessionId: string,
    userId: string,
    activity: CanonicalActivity,
    provenance: CanonicalProvenance,
  ): Promise<void> {
    const { error: deleteStreamsError } = await this.supabaseAdminService.client
      .from('activity_streams')
      .delete()
      .eq('session_id', sessionId)
      .eq('source', WEARABLE_IMPORT_SOURCE);
    if (deleteStreamsError) throw new InternalServerErrorException('WEARABLE_ACTIVITY_STREAMS_DELETE_FAILED');

    const streamRows = this.buildStreamRows(sessionId, userId, activity, provenance);
    if (streamRows.length > 0) {
      const { error } = await this.supabaseAdminService.client.from('activity_streams').insert(streamRows);
      if (error) throw new InternalServerErrorException('WEARABLE_ACTIVITY_STREAMS_INSERT_FAILED');
    }

    const { error: deleteSamplesError } = await this.supabaseAdminService.client
      .from('activity_stream_samples')
      .delete()
      .eq('session_id', sessionId)
      .eq('source', WEARABLE_IMPORT_SOURCE);
    if (deleteSamplesError) throw new InternalServerErrorException('WEARABLE_ACTIVITY_STREAM_SAMPLES_DELETE_FAILED');

    const sampleRows = this.buildStreamSampleRows(sessionId, userId, activity, provenance);
    await this.insertInChunks('activity_stream_samples', sampleRows, 'WEARABLE_ACTIVITY_STREAM_SAMPLES_INSERT_FAILED');
  }

  private buildStreamRows(
    sessionId: string,
    userId: string,
    activity: CanonicalActivity,
    provenance: CanonicalProvenance,
  ): ActivityStreamInsert[] {
    return this.getMetricStreams(activity).flatMap(stream => {
      const samples = this.dedupeSamples(stream.samples);
      if (samples.length === 0) return [];
      return [
        {
          session_id: sessionId,
          user_id: userId,
          stream_type: stream.streamType,
          unit: stream.unit,
          sample_hz: null,
          source: WEARABLE_IMPORT_SOURCE,
          source_channel: provenance.sourceChannel,
          source_package: provenance.sourcePackage,
          source_record_id: provenance.sourceRecordId,
          raw_payload_id: provenance.rawPayloadId,
          data: {
            provider: activity.provider,
            sourcePackage: provenance.sourcePackage,
            samples,
          } as unknown as Json,
        },
      ];
    });
  }

  private buildStreamSampleRows(
    sessionId: string,
    userId: string,
    activity: CanonicalActivity,
    provenance: CanonicalProvenance,
  ): ActivityStreamSampleInsert[] {
    return this.getMetricStreams(activity).flatMap(stream =>
      this.dedupeSamples(stream.samples).map(sample => ({
        session_id: sessionId,
        user_id: userId,
        stream_type: stream.streamType,
        timestamp: sample.timestamp,
        offset_s: sample.offsetSeconds,
        value: sample.value,
        unit: stream.unit,
        source: WEARABLE_IMPORT_SOURCE,
        source_channel: provenance.sourceChannel,
        source_package: provenance.sourcePackage,
        source_record_id: provenance.sourceRecordId,
        raw_payload_id: provenance.rawPayloadId,
        raw_payload: null,
      })),
    );
  }

  public async replaceRoutePoints(
    sessionId: string,
    userId: string,
    activity: CanonicalActivity,
    provenance: CanonicalProvenance,
  ): Promise<void> {
    const { error: deleteError } = await this.supabaseAdminService.client
      .from('activity_route_points')
      .delete()
      .eq('session_id', sessionId);
    if (deleteError) throw new InternalServerErrorException('WEARABLE_ACTIVITY_ROUTE_DELETE_FAILED');
    const positionSamples = this.sanitizePositionSamples(activity.streams.position);
    if (positionSamples.length === 0) {
      await this.clearRoutePolyline(sessionId);
      return;
    }

    const rows: ActivityRoutePointInsert[] = positionSamples.map((point, index) => ({
      session_id: sessionId,
      user_id: userId,
      point_index: index,
      timestamp: point.timestamp,
      offset_s: point.offsetSeconds,
      lat: point.lat,
      lon: point.lon,
      source: WEARABLE_IMPORT_SOURCE,
      source_channel: provenance.sourceChannel,
      source_package: provenance.sourcePackage,
      source_record_id: provenance.sourceRecordId,
      raw_payload_id: provenance.rawPayloadId,
    }));
    await this.insertInChunks('activity_route_points', rows, 'WEARABLE_ACTIVITY_ROUTE_INSERT_FAILED');

    const polyline = encodePolyline(positionSamples.map(point => [point.lat, point.lon] as [number, number]));
    const { error: polylineError } = await this.supabaseAdminService.client
      .from('activity_sessions')
      .update({ route_polyline: polyline })
      .eq('id', sessionId);
    if (polylineError) throw new InternalServerErrorException('WEARABLE_ACTIVITY_POLYLINE_UPDATE_FAILED');
  }

  private sanitizePositionSamples(
    samples: CanonicalActivity['streams']['position'],
  ): CanonicalActivity['streams']['position'] {
    const cleaned: CanonicalActivity['streams']['position'] = [];
    for (const sample of samples) {
      if (!this.isValidCoordinate(sample.lat, sample.lon)) continue;
      const previous = cleaned[cleaned.length - 1];
      if (previous && previous.lat === sample.lat && previous.lon === sample.lon) continue;
      cleaned.push(sample);
    }
    return cleaned.length >= 2 ? cleaned : [];
  }

  private isValidCoordinate(lat: number, lon: number): boolean {
    return Number.isFinite(lat) && Number.isFinite(lon) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;
  }

  private async clearRoutePolyline(sessionId: string): Promise<void> {
    const { error } = await this.supabaseAdminService.client
      .from('activity_sessions')
      .update({ route_polyline: null })
      .eq('id', sessionId);
    if (error) throw new InternalServerErrorException('WEARABLE_ACTIVITY_POLYLINE_UPDATE_FAILED');
  }

  public async upsertProviderFields(
    sessionId: string,
    userId: string,
    activity: CanonicalActivity,
    provenance: CanonicalProvenance,
  ): Promise<void> {
    const payload = this.buildProviderFieldsPayload(sessionId, userId, activity, provenance);
    const { error } = await this.supabaseAdminService.client
      .from('activity_provider_fields')
      .upsert(payload, { onConflict: 'session_id' });
    if (error) throw new InternalServerErrorException('WEARABLE_ACTIVITY_PROVIDER_FIELDS_UPSERT_FAILED');
  }

  private buildProviderFieldsPayload(
    sessionId: string,
    userId: string,
    activity: CanonicalActivity,
    provenance: CanonicalProvenance,
  ): ActivityProviderFieldsInsert {
    return {
      session_id: sessionId,
      user_id: userId,
      provider: provenance.provider,
      source_channel: provenance.sourceChannel,
      source_package: provenance.sourcePackage,
      fields: {
        ...activity.vendorFields,
        activityFingerprint: this.dedupeService.buildActivityFingerprint(userId, activity),
        strongIdentityKey: this.dedupeService.buildStrongActivityKey(userId, provenance),
      } as Json,
      raw_metadata: this.readRawMetadata(activity.vendorFields),
      updated_at: new Date().toISOString(),
    };
  }

  private getMetricStreams(activity: CanonicalActivity): Array<{
    streamType: StreamType;
    unit: string;
    samples: CanonicalActivityMetricSample[];
  }> {
    return [
      { streamType: 'heart_rate', unit: 'bpm', samples: activity.streams.heartRate },
      { streamType: 'speed', unit: 'm/s', samples: activity.streams.speed },
      { streamType: 'distance', unit: 'm', samples: activity.streams.distance },
      { streamType: 'altitude', unit: 'm', samples: activity.streams.altitude },
      { streamType: 'cadence', unit: 'rpm', samples: activity.streams.cadence },
      { streamType: 'power', unit: 'W', samples: activity.streams.power },
      { streamType: 'temperature', unit: 'C', samples: activity.streams.temperature },
    ];
  }

  private dedupeSamples(samples: CanonicalActivityMetricSample[]): CanonicalActivityMetricSample[] {
    const seen = new Set<string>();
    return samples.filter(sample => {
      const key = sample.timestamp ?? `offset:${sample.offsetSeconds ?? 'none'}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return sample.timestamp != null || sample.offsetSeconds != null;
    });
  }

  private readRawMetadata(vendorFields: Record<string, unknown>): Json | null {
    const rawMetadata = vendorFields.rawMetadata ?? vendorFields.appleHealthMetadata;
    return rawMetadata == null ? null : (rawMetadata as Json);
  }

  private toJson(value: unknown): Json {
    return JSON.parse(JSON.stringify(value)) as Json;
  }

  private toActivityDatabaseProvider(provider: WearableProvider): ActivityDatabaseProvider {
    if (provider === 'oura' || provider === 'ultrahuman') return 'other';
    return provider;
  }

  private async insertInChunks<T extends ActivityRoutePointInsert | ActivityStreamSampleInsert>(
    table: 'activity_route_points' | 'activity_stream_samples',
    rows: T[],
    errorCode: string,
  ): Promise<void> {
    const chunkSize =
      table === 'activity_stream_samples' ? STREAM_SAMPLE_INSERT_CHUNK_SIZE : ROUTE_POINT_INSERT_CHUNK_SIZE;
    for (let startIndex = 0; startIndex < rows.length; startIndex += chunkSize) {
      const chunk = rows.slice(startIndex, startIndex + chunkSize);
      await this.insertChunkWithRecovery(table, chunk, errorCode, startIndex, rows.length);
    }
  }

  private async insertChunkWithRecovery<T extends ActivityRoutePointInsert | ActivityStreamSampleInsert>(
    table: 'activity_route_points' | 'activity_stream_samples',
    rows: T[],
    errorCode: string,
    startIndex: number,
    totalRows: number,
  ): Promise<void> {
    const { error } = await this.supabaseAdminService.client.from(table).insert(rows);
    if (!error) return;
    if (this.isRetryableInsertError(error) && rows.length > MIN_RETRY_INSERT_CHUNK_SIZE) {
      const midpoint = Math.ceil(rows.length / 2);
      this.logger.log(
        `${errorCode}: retrying ${table} chunk [${startIndex}-${startIndex + rows.length}] as smaller chunks`,
      );
      await this.insertChunkWithRecovery(table, rows.slice(0, midpoint), errorCode, startIndex, totalRows);
      await this.insertChunkWithRecovery(table, rows.slice(midpoint), errorCode, startIndex + midpoint, totalRows);
      return;
    }
    if (this.isRetryableInsertError(error)) {
      await this.retrySmallChunk(table, rows, errorCode, startIndex, totalRows, error);
      return;
    }
    this.throwChunkInsertError(table, errorCode, startIndex, rows.length, totalRows, error);
  }

  private async retrySmallChunk<T extends ActivityRoutePointInsert | ActivityStreamSampleInsert>(
    table: 'activity_route_points' | 'activity_stream_samples',
    rows: T[],
    errorCode: string,
    startIndex: number,
    totalRows: number,
    firstError: ChunkInsertError,
  ): Promise<void> {
    let lastError = firstError;
    for (let attempt = 2; attempt <= INSERT_RETRY_ATTEMPTS; attempt += 1) {
      await this.sleep(INSERT_RETRY_BASE_DELAY_MS * attempt);
      const { error } = await this.supabaseAdminService.client.from(table).insert(rows);
      if (!error) return;
      lastError = error;
      if (!this.isRetryableInsertError(error)) break;
    }
    this.throwChunkInsertError(table, errorCode, startIndex, rows.length, totalRows, lastError);
  }

  private isRetryableInsertError(error: ChunkInsertError): boolean {
    const message = `${error.message ?? ''} ${error.details ?? ''}`.toLowerCase();
    return message.includes('fetch failed') || message.includes('socket') || message.includes('und_err_socket');
  }

  private throwChunkInsertError(
    table: 'activity_route_points' | 'activity_stream_samples',
    errorCode: string,
    startIndex: number,
    chunkLength: number,
    totalRows: number,
    error: ChunkInsertError,
  ): never {
    this.logger.error(
      `${errorCode}: insert into ${table} failed for chunk [${startIndex}-${startIndex + chunkLength}] ` +
        `(${totalRows} rows total) — code=${error.code ?? 'n/a'} message="${error.message ?? ''}" ` +
        `details="${error.details ?? ''}" hint="${error.hint ?? ''}"`,
    );
    throw new InternalServerErrorException(errorCode);
  }

  private async sleep(milliseconds: number): Promise<void> {
    await new Promise(resolve => {
      setTimeout(resolve, milliseconds);
    });
  }
}
