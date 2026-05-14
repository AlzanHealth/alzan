import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { Json } from '../../../types/database.types';
import { Database, Insert, Update } from '../../../types/requests.types';
import { SupabaseAdminService } from '../../../core/supabase/supabase.service';
import {
  CanonicalActivity,
  CanonicalActivityMetricSample,
} from '../../activity-import/parsers/activity-import-canonical.types';
import { encodePolyline } from '../../activity-import/parsers/route-import.parser';
import {
  ActivityDatabaseProvider,
  CanonicalProvenance,
  UpsertActivityInput,
  WearableProvider,
} from '../domain/wearable.types';
import { DedupeService } from './dedupe.service';
import { RawPayloadService } from './raw-payload.service';

type ActivitySessionInsert = Insert<'activity_sessions'>;
type ActivitySessionUpdate = Update<'activity_sessions'>;
type DeviceInsert = Insert<'devices'>;
type ActivityLapInsert = Insert<'activity_laps'>;
type ActivityHeartRateZoneInsert = Insert<'activity_heart_rate_zones'>;
type ActivityStreamInsert = Insert<'activity_streams'>;
type ActivityRoutePointInsert = Insert<'activity_route_points'>;
type ActivityStreamSampleInsert = Insert<'activity_stream_samples'>;
type ActivityProviderFieldsInsert = Insert<'activity_provider_fields'>;
type StreamType = Database['public']['Enums']['stream_type_enum'];

const WEARABLE_IMPORT_SOURCE = 'wearable_import';
const INSERT_CHUNK_SIZE = 1000;

@Injectable()
export class CanonicalActivityWriterService {
  constructor(
    private readonly supabaseAdminService: SupabaseAdminService,
    private readonly rawPayloadService: RawPayloadService,
    private readonly dedupeService: DedupeService,
  ) {}

  public async upsertActivity(input: UpsertActivityInput): Promise<string> {
    const deviceId = await this.ensureDevice(input.userId, input.activity, input.provenance);
    const existingSessionId = await this.findExistingSessionId(input.userId, input.activity, input.provenance);
    const sessionPayload = this.buildSessionPayload(input, deviceId);
    const sessionId = existingSessionId
      ? await this.updateSession(existingSessionId, sessionPayload)
      : await this.insertSession(sessionPayload as ActivitySessionInsert);

    await this.replaceLaps(sessionId, input.userId, input.activity);
    await this.replaceHeartRateZones(sessionId, input.activity);
    await this.replaceStreams(sessionId, input.userId, input.activity, input.provenance);
    await this.replaceRoutePoints(sessionId, input.userId, input.activity, input.provenance);
    await this.upsertProviderFields(sessionId, input.userId, input.activity, input.provenance);
    await this.rawPayloadService.linkPayload({
      rawPayloadId: input.provenance.rawPayloadId,
      relatedTable: 'activity_sessions',
      relatedId: sessionId,
    });

    return sessionId;
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
    const provider = this.toActivityDatabaseProvider(provenance.provider);

    if (serial) {
      const { data, error } = await this.supabaseAdminService.client
        .from('devices')
        .select('id')
        .eq('user_id', userId)
        .eq('provider', provider)
        .eq('device_serial', serial)
        .maybeSingle();
      if (error) throw new InternalServerErrorException('WEARABLE_DEVICE_READ_FAILED');
      if (data?.id) return data.id;
    }

    const payload: DeviceInsert = {
      user_id: userId,
      provider,
      device_name: name,
      device_model: model,
      device_serial: serial,
    };
    const { data, error } = await this.supabaseAdminService.client
      .from('devices')
      .insert(payload)
      .select('id')
      .single();
    if (error) throw new InternalServerErrorException('WEARABLE_DEVICE_CREATE_FAILED');
    return data.id;
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

  private async insertSession(payload: ActivitySessionInsert): Promise<string> {
    const { data, error } = await this.supabaseAdminService.client
      .from('activity_sessions')
      .insert(payload)
      .select('id')
      .single();
    if (error) throw new InternalServerErrorException('WEARABLE_ACTIVITY_INSERT_FAILED');
    return data.id;
  }

  private async updateSession(sessionId: string, payload: ActivitySessionUpdate): Promise<string> {
    const { error } = await this.supabaseAdminService.client
      .from('activity_sessions')
      .update(payload)
      .eq('id', sessionId);
    if (error) throw new InternalServerErrorException('WEARABLE_ACTIVITY_UPDATE_FAILED');
    return sessionId;
  }

  private async replaceLaps(sessionId: string, userId: string, activity: CanonicalActivity): Promise<void> {
    const { error: deleteError } = await this.supabaseAdminService.client
      .from('activity_laps')
      .delete()
      .eq('session_id', sessionId)
      .eq('split_group', 'custom');
    if (deleteError) throw new InternalServerErrorException('WEARABLE_ACTIVITY_LAPS_DELETE_FAILED');
    if (activity.laps.length === 0) return;

    const rows: ActivityLapInsert[] = activity.laps.map(lap => ({
      session_id: sessionId,
      user_id: userId,
      lap_index: lap.lapIndex,
      lap_type: lap.lapType,
      split_group: 'custom',
      split_group_order: 0,
      split_distance_m: null,
      distance_m: lap.distanceM,
      duration_s: lap.durationSeconds == null ? null : Math.round(lap.durationSeconds),
      avg_heart_rate: lap.avgHeartRate == null ? null : Math.round(lap.avgHeartRate),
      max_heart_rate: lap.maxHeartRate == null ? null : Math.round(lap.maxHeartRate),
      avg_pace_s_per_km: lap.avgPaceSecondsPerKm == null ? null : Math.round(lap.avgPaceSecondsPerKm),
      start_offset_s: lap.startOffsetSeconds == null ? null : Math.round(lap.startOffsetSeconds),
      end_offset_s: lap.endOffsetSeconds == null ? null : Math.round(lap.endOffsetSeconds),
    }));
    const { error } = await this.supabaseAdminService.client.from('activity_laps').insert(rows);
    if (error) throw new InternalServerErrorException('WEARABLE_ACTIVITY_LAPS_INSERT_FAILED');
  }

  private async replaceHeartRateZones(sessionId: string, activity: CanonicalActivity): Promise<void> {
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

  private async replaceStreams(
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

  private async replaceRoutePoints(
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
    if (activity.streams.position.length === 0) return;

    const rows: ActivityRoutePointInsert[] = activity.streams.position.map((point, index) => ({
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

    const polyline = encodePolyline(activity.streams.position.map(point => [point.lat, point.lon] as [number, number]));
    const { error: polylineError } = await this.supabaseAdminService.client
      .from('activity_sessions')
      .update({ route_polyline: polyline })
      .eq('id', sessionId);
    if (polylineError) throw new InternalServerErrorException('WEARABLE_ACTIVITY_POLYLINE_UPDATE_FAILED');
  }

  private async upsertProviderFields(
    sessionId: string,
    userId: string,
    activity: CanonicalActivity,
    provenance: CanonicalProvenance,
  ): Promise<void> {
    const payload: ActivityProviderFieldsInsert = {
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
    const { error } = await this.supabaseAdminService.client
      .from('activity_provider_fields')
      .upsert(payload, { onConflict: 'session_id' });
    if (error) throw new InternalServerErrorException('WEARABLE_ACTIVITY_PROVIDER_FIELDS_UPSERT_FAILED');
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

  private toActivityDatabaseProvider(provider: WearableProvider): ActivityDatabaseProvider {
    if (provider === 'oura' || provider === 'ultrahuman') return 'other';
    return provider;
  }

  private async insertInChunks<T extends ActivityRoutePointInsert | ActivityStreamSampleInsert>(
    table: 'activity_route_points' | 'activity_stream_samples',
    rows: T[],
    errorCode: string,
  ): Promise<void> {
    for (let startIndex = 0; startIndex < rows.length; startIndex += INSERT_CHUNK_SIZE) {
      const chunk = rows.slice(startIndex, startIndex + INSERT_CHUNK_SIZE);
      const { error } = await this.supabaseAdminService.client.from(table).insert(chunk);
      if (error) throw new InternalServerErrorException(errorCode);
    }
  }
}
