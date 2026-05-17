import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { SupabaseAdminService } from '../../../core/supabase/supabase.service';
import { parseActivityFileToCanonical } from '../../activity-import/parsers/activity-import-canonical.parser';
import {
  CanonicalActivity,
  ProviderDailyActivityCanonical,
  ProviderRecoveryCanonical,
  ProviderSleepCanonical,
} from '../../activity-import/parsers/activity-import-canonical.types';
import {
  mapAppleHealthDailyActivityToCanonical,
  mapAppleHealthRecoveryToCanonical,
  mapAppleHealthSleepToCanonical,
} from '../../activity-import/parsers/apple-health-health-canonical.mapper';
import {
  mapHealthConnectDailyActivityToCanonical,
  mapHealthConnectRecoveryToCanonical,
  mapHealthConnectSleepToCanonical,
} from '../../activity-import/parsers/health-connect-health-canonical.mapper';
import { LocalHealthSyncDto, LocalHealthSyncRecordDto } from '../dto/local-health-sync.dto';
import { ProviderOriginDto } from '../dto/provider-origin.dto';
import {
  CanonicalProvenance,
  HealthMetricSampleInput,
  LocalSyncResult,
  SourceChannel,
  WearableProvider,
} from '../domain/wearable.types';
import { CanonicalActivityWriterService } from './canonical-activity-writer.service';
import { CanonicalHealthWriterService } from './canonical-health-writer.service';
import { IntegrationSyncStateService } from './integration-sync-state.service';
import { ProviderOriginService } from './provider-origin.service';
import { RawPayloadService } from './raw-payload.service';

type JsonRecord = Record<string, unknown>;

@Injectable()
export class LocalHealthSyncService {
  constructor(
    private readonly supabaseAdminService: SupabaseAdminService,
    private readonly rawPayloadService: RawPayloadService,
    private readonly providerOriginService: ProviderOriginService,
    private readonly syncStateService: IntegrationSyncStateService,
    private readonly activityWriterService: CanonicalActivityWriterService,
    private readonly healthWriterService: CanonicalHealthWriterService,
  ) {}

  public async sync(userId: string, body: LocalHealthSyncDto): Promise<LocalSyncResult> {
    await this.assertHealthConsent(userId);
    const provider = body.source_channel as WearableProvider;
    const result: LocalSyncResult = {
      activitiesImported: 0,
      dailyActivitiesImported: 0,
      sleepsImported: 0,
      recoveriesImported: 0,
      healthSamplesImported: 0,
      originsUpserted: 0,
    };

    for (const origin of body.origins ?? []) {
      await this.upsertOrigin(userId, origin);
      result.originsUpserted += 1;
    }

    if (body.source_channel === 'health_connect') {
      await this.ensureHealthConnectSelection(userId);
    }

    for (const record of body.records) {
      const sourcePackage = this.resolveRecordSourcePackage(body, record);
      if (body.source_channel === 'health_connect')
        await this.assertSelectedHealthConnectPackage(userId, sourcePackage);
      const rawPayload = await this.rawPayloadService.storeRawPayload({
        userId,
        provider,
        sourceChannel: body.source_channel,
        sourcePackage,
        objectType: record.object_type,
        sourceRecordId: record.source_record_id ?? this.readSourceRecordId(record.payload),
        payload: record.payload,
        traceId: body.trace_id ?? null,
      });
      const provenance = this.buildBaseProvenance(body, record, rawPayload.id, sourcePackage);
      await this.processRecord(userId, body, record, provenance, result);
    }

    for (const state of body.sync_states ?? []) {
      await this.syncStateService.saveState({
        userId,
        provider,
        sourceChannel: body.source_channel,
        sourcePackage: body.source_package ?? null,
        syncDomain: state.sync_domain,
        cursorToken: state.cursor_token ?? null,
        anchorToken: state.anchor_token ?? null,
        lastRecordAt: state.last_record_at ?? null,
        status: 'success',
      });
    }

    await this.ensureLocalSdkConnection(userId, provider);

    return result;
  }

  private async processRecord(
    userId: string,
    body: LocalHealthSyncDto,
    record: LocalHealthSyncRecordDto,
    baseProvenance: CanonicalProvenance,
    result: LocalSyncResult,
  ): Promise<void> {
    if (record.object_type === 'activity') {
      const activity = this.parseActivity(body.source_channel, record.payload);
      const provenance = this.mergeActivityProvenance(baseProvenance, activity);
      await this.activityWriterService.upsertActivity({ userId, activity, provenance });
      result.activitiesImported += 1;
      return;
    }

    if (record.object_type === 'daily_activity') {
      const dailyActivity = this.mapDailyActivity(body.source_channel, record.payload);
      const provenance = this.mergeHealthProvenance(baseProvenance, dailyActivity);
      await this.healthWriterService.upsertDailyActivity({ userId, dailyActivity, provenance });
      result.dailyActivitiesImported += 1;
      return;
    }

    if (record.object_type === 'sleep') {
      const sleep = this.mapSleep(body.source_channel, record.payload);
      const provenance = this.mergeHealthProvenance(baseProvenance, sleep);
      await this.healthWriterService.upsertSleep({ userId, sleep, provenance });
      result.sleepsImported += 1;
      return;
    }

    if (record.object_type === 'recovery') {
      const recovery = this.mapRecovery(body.source_channel, record.payload);
      const provenance = this.mergeHealthProvenance(baseProvenance, recovery);
      await this.healthWriterService.upsertRecovery({ userId, recovery, provenance });
      result.recoveriesImported += 1;
      return;
    }

    const samples = this.mapDirectHealthSamples(userId, record, baseProvenance);
    for (const sample of samples) {
      await this.healthWriterService.writeHealthSample(sample);
      result.healthSamplesImported += 1;
    }
  }

  private parseActivity(sourceChannel: SourceChannel, payload: JsonRecord): CanonicalActivity {
    const filename =
      sourceChannel === 'apple_health' ? 'apple-health-local-sync.json' : 'health-connect-local-sync.json';
    return parseActivityFileToCanonical(JSON.stringify(payload), filename);
  }

  private mapDailyActivity(sourceChannel: SourceChannel, payload: JsonRecord): ProviderDailyActivityCanonical {
    return sourceChannel === 'apple_health'
      ? mapAppleHealthDailyActivityToCanonical(payload)
      : mapHealthConnectDailyActivityToCanonical(payload);
  }

  private mapSleep(sourceChannel: SourceChannel, payload: JsonRecord): ProviderSleepCanonical {
    return sourceChannel === 'apple_health'
      ? mapAppleHealthSleepToCanonical(payload)
      : mapHealthConnectSleepToCanonical(payload);
  }

  private mapRecovery(sourceChannel: SourceChannel, payload: JsonRecord): ProviderRecoveryCanonical {
    return sourceChannel === 'apple_health'
      ? mapAppleHealthRecoveryToCanonical(payload)
      : mapHealthConnectRecoveryToCanonical(payload);
  }

  private mapDirectHealthSamples(
    userId: string,
    record: LocalHealthSyncRecordDto,
    provenance: CanonicalProvenance,
  ): HealthMetricSampleInput[] {
    const recordedAt =
      record.recorded_at ?? this.normaliseTimestamp(record.payload.recordedAt ?? record.payload.timestamp);
    if (!recordedAt) throw new BadRequestException('HEALTH_SAMPLE_RECORDED_AT_REQUIRED');
    if (record.object_type === 'weight') return this.mapWeightSamples(userId, record, provenance, recordedAt);
    const metricType =
      record.metric_type ??
      (record.object_type === 'vo2_max' ? 'vo2_max' : this.readString(record.payload.metric_type));
    const value = record.value ?? this.readNumber(record.payload.value);
    const unit = record.unit ?? this.readString(record.payload.unit) ?? this.defaultUnit(metricType);
    if (!metricType || value == null || !unit) throw new BadRequestException('HEALTH_SAMPLE_VALUE_REQUIRED');
    return [
      {
        userId,
        provider: provenance.provider,
        sourceChannel: provenance.sourceChannel,
        sourcePackage: provenance.sourcePackage,
        sourceRecordId: provenance.sourceRecordId,
        metricType,
        recordedAt,
        localDate: recordedAt.slice(0, 10),
        timezone: this.readString(record.payload.timezone),
        value,
        unit,
        rawPayloadId: provenance.rawPayloadId,
        rawPayload: record.payload,
      },
    ];
  }

  private mapWeightSamples(
    userId: string,
    record: LocalHealthSyncRecordDto,
    provenance: CanonicalProvenance,
    recordedAt: string,
  ): HealthMetricSampleInput[] {
    const weight =
      record.value ?? this.readNumber(record.payload.weight_kg ?? record.payload.weightKg ?? record.payload.value);
    const bodyFat = this.readNumber(record.payload.bodyfat_percent ?? record.payload.bodyFatPercent);
    const base = {
      userId,
      provider: provenance.provider,
      sourceChannel: provenance.sourceChannel,
      sourcePackage: provenance.sourcePackage,
      sourceRecordId: provenance.sourceRecordId,
      recordedAt,
      localDate: recordedAt.slice(0, 10),
      timezone: this.readString(record.payload.timezone),
      rawPayloadId: provenance.rawPayloadId,
      rawPayload: record.payload,
    };
    return [
      ...(weight == null ? [] : [{ ...base, metricType: 'weight_kg', value: weight, unit: 'kg' }]),
      ...(bodyFat == null ? [] : [{ ...base, metricType: 'body_fat_percent', value: bodyFat, unit: '%' }]),
    ];
  }

  private async assertHealthConsent(userId: string): Promise<void> {
    const { data, error } = await this.supabaseAdminService.client
      .from('user_preferences')
      .select('health_data_consent')
      .eq('user_id', userId)
      .maybeSingle();
    if (error) throw new BadRequestException('HEALTH_CONSENT_READ_FAILED');
    if (!data?.health_data_consent) throw new ForbiddenException('HEALTH_DATA_CONSENT_REQUIRED');
  }

  private async ensureLocalSdkConnection(userId: string, provider: WearableProvider): Promise<void> {
    const now = new Date().toISOString();
    const { error } = await this.supabaseAdminService.client.from('user_connections').upsert(
      {
        user_id: userId,
        provider,
        provider_user_id: userId,
        provider_username: provider,
        access_token: null,
        refresh_token: null,
        token_expires_at: null,
        scope: 'read',
        connection_kind: 'local_sdk',
        status: 'active',
        revoked_at: null,
        last_error: null,
        last_synced_at: now,
        updated_at: now,
      },
      { onConflict: 'user_id,provider' },
    );
    if (error) throw new BadRequestException('LOCAL_HEALTH_CONNECTION_UPSERT_FAILED');
  }

  private async assertSelectedHealthConnectPackage(userId: string, sourcePackage: string | null): Promise<void> {
    if (!sourcePackage) throw new BadRequestException('HEALTH_CONNECT_SOURCE_PACKAGE_REQUIRED');
    const selection = await this.providerOriginService.getHealthConnectSelection(userId);
    if (!selection?.sourcePackage) throw new BadRequestException('HEALTH_CONNECT_SOURCE_SELECTION_REQUIRED');
    if (selection.sourcePackage !== sourcePackage)
      throw new ForbiddenException('HEALTH_CONNECT_SOURCE_PACKAGE_MISMATCH');
  }

  private async ensureHealthConnectSelection(userId: string): Promise<void> {
    const selected = await this.providerOriginService.getHealthConnectSelection(userId);
    if (selected?.sourcePackage) return;
    const origins = await this.providerOriginService.listOrigins(userId, 'health_connect');
    if (origins.length !== 1) return;
    await this.providerOriginService.selectHealthConnectOrigin(userId, origins[0].id);
  }

  private async upsertOrigin(userId: string, origin: ProviderOriginDto): Promise<void> {
    await this.providerOriginService.upsertOrigin({
      userId,
      sourceChannel: origin.source_channel,
      provider: origin.provider,
      sourcePackage: origin.source_package ?? null,
      sourceProviderKey: origin.source_provider_key ?? null,
      displayName: origin.display_name ?? null,
      platform: origin.platform ?? null,
      rawPayload: origin.raw_payload ?? null,
    });
  }

  private buildBaseProvenance(
    body: LocalHealthSyncDto,
    record: LocalHealthSyncRecordDto,
    rawPayloadId: string | null,
    sourcePackage: string | null,
  ): CanonicalProvenance {
    return {
      provider: body.source_channel,
      sourceChannel: body.source_channel,
      sourcePackage,
      sourceProviderKey:
        this.readString(record.payload.sourceProviderKey) ?? this.inferSourceProviderKey(sourcePackage),
      sourceRecordId: record.source_record_id ?? this.readSourceRecordId(record.payload),
      sourceUpdatedAt:
        record.source_updated_at ??
        this.normaliseTimestamp(this.readNested(record.payload, 'metadata.lastModifiedTime')),
      rawPayloadId,
    };
  }

  private mergeActivityProvenance(base: CanonicalProvenance, activity: CanonicalActivity): CanonicalProvenance {
    return {
      ...base,
      sourcePackage: activity.provenance?.sourcePackage ?? base.sourcePackage,
      sourceProviderKey: activity.provenance?.sourceProviderKey ?? base.sourceProviderKey,
      sourceRecordId: activity.provenance?.sourceRecordId ?? base.sourceRecordId ?? activity.providerActivityId,
      sourceUpdatedAt: activity.provenance?.sourceUpdatedAt ?? base.sourceUpdatedAt,
    };
  }

  private mergeHealthProvenance(
    base: CanonicalProvenance,
    value: ProviderDailyActivityCanonical | ProviderSleepCanonical | ProviderRecoveryCanonical,
  ): CanonicalProvenance {
    return {
      ...base,
      sourcePackage: value.sourcePackage ?? base.sourcePackage,
      sourceRecordId: value.sourceRecordId ?? base.sourceRecordId,
      sourceUpdatedAt: value.sourceUpdatedAt ?? base.sourceUpdatedAt,
    };
  }

  private resolveRecordSourcePackage(body: LocalHealthSyncDto, record: LocalHealthSyncRecordDto): string | null {
    return (
      record.source_package ??
      body.source_package ??
      this.readString(this.readNested(record.payload, 'metadata.dataOrigin.packageName')) ??
      this.readString(this.readNested(record.payload, 'metadata.data_origin.package_name')) ??
      this.readString(record.payload.sourcePackage) ??
      this.readString(record.payload.packageName) ??
      this.readString(this.readNested(record.payload, 'source.bundleIdentifier')) ??
      this.readString(this.readNested(record.payload, 'sourceRevision.source.bundleIdentifier'))
    );
  }

  private readSourceRecordId(payload: JsonRecord): string | null {
    return (
      this.readString(this.readNested(payload, 'metadata.id')) ??
      this.readString(payload.uuid) ??
      this.readString(payload.id) ??
      this.readString(payload.sourceRecordId)
    );
  }

  private inferSourceProviderKey(sourcePackage: string | null): string | null {
    if (!sourcePackage) return null;
    const lower = sourcePackage.toLowerCase();
    if (lower.includes('shealth')) return 'samsung_health';
    if (lower.includes('fitbit')) return 'fitbit';
    if (lower.includes('garmin')) return 'garmin';
    if (lower.includes('polar')) return 'polar';
    if (lower.includes('suunto')) return 'suunto';
    if (lower.includes('coros')) return 'coros';
    if (lower.includes('fitness')) return 'google_fit';
    if (lower.includes('apple')) return 'apple_health';
    return null;
  }

  private defaultUnit(metricType: string | null): string | null {
    if (!metricType) return null;
    if (metricType.includes('hrv')) return 'ms';
    if (metricType.includes('heart_rate')) return 'bpm';
    if (metricType.includes('spo2') || metricType.includes('body_fat')) return '%';
    if (metricType.includes('temperature')) return 'C';
    if (metricType.includes('vo2')) return 'ml/kg/min';
    if (metricType.includes('weight')) return 'kg';
    return null;
  }

  private normaliseTimestamp(value: unknown): string | null {
    const text = this.readString(value);
    if (!text) return null;
    const parsed = Date.parse(text);
    return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
  }

  private readNested(record: JsonRecord, path: string): unknown {
    return path.split('.').reduce<unknown>((current, key) => {
      return typeof current === 'object' && current !== null && !Array.isArray(current)
        ? (current as JsonRecord)[key]
        : undefined;
    }, record);
  }

  private readString(value: unknown): string | null {
    return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
  }

  private readNumber(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value !== 'string') return null;
    const parsed = Number.parseFloat(value.trim());
    return Number.isFinite(parsed) ? parsed : null;
  }
}
