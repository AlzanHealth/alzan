import { Database } from '../../../types/requests.types';
import {
  CanonicalActivity,
  ProviderDailyActivityCanonical,
  ProviderRecoveryCanonical,
  ProviderSleepCanonical,
} from '../../activity-import/parsers/activity-import-canonical.types';

export type WearableProvider = Database['public']['Enums']['wearable_provider_enum'];
export type ActivityDatabaseProvider = Database['public']['Enums']['provider_enum'];
export type SourceChannel = 'cloud' | 'apple_health' | 'health_connect' | 'file_import' | 'manual';
export type SyncDomain = 'activities' | 'daily_activity' | 'sleep' | 'recovery' | 'health_metrics' | 'body';
export type SyncStatus = 'idle' | 'running' | 'success' | 'error' | 'paused' | 'expired';
export type LocalSyncObjectType =
  | 'activity'
  | 'daily_activity'
  | 'sleep'
  | 'recovery'
  | 'health_sample'
  | 'vo2_max'
  | 'weight';

export interface CanonicalProvenance {
  provider: WearableProvider;
  sourceChannel: SourceChannel;
  sourcePackage: string | null;
  sourceProviderKey: string | null;
  sourceRecordId: string | null;
  sourceUpdatedAt: string | null;
  rawPayloadId: string | null;
}

export interface ProviderOriginInput {
  userId: string;
  sourceChannel: SourceChannel;
  provider: WearableProvider;
  sourcePackage: string | null;
  sourceProviderKey: string | null;
  displayName: string | null;
  platform: string | null;
  rawPayload: Record<string, unknown> | null;
}

export interface ProviderOrigin {
  id: string;
  userId: string;
  sourceChannel: string;
  provider: WearableProvider;
  sourcePackage: string | null;
  sourceProviderKey: string | null;
  displayName: string | null;
  platform: string | null;
  lastSeenAt: string;
}

export interface StoredRawPayload {
  id: string | null;
  payloadHash: string;
}

export interface RawPayloadInput {
  userId: string;
  provider: WearableProvider;
  sourceChannel: SourceChannel;
  sourcePackage: string | null;
  objectType: string;
  sourceRecordId: string | null;
  payload: unknown;
  traceId: string | null;
}

export interface RawPayloadLinkInput {
  rawPayloadId: string | null;
  relatedTable: string;
  relatedId: string;
}

export interface HealthMetricSampleInput {
  userId: string;
  provider: WearableProvider;
  sourceChannel: SourceChannel;
  sourcePackage: string | null;
  sourceRecordId: string | null;
  metricType: string;
  recordedAt: string;
  localDate: string | null;
  timezone: string | null;
  value: number;
  unit: string;
  sleepSessionId?: string | null;
  activitySessionId?: string | null;
  rawPayloadId?: string | null;
  rawPayload?: Record<string, unknown> | null;
}

export interface SleepStageInput {
  startTime: string;
  endTime: string;
  stage: Database['public']['Enums']['sleep_stage_enum'];
  providerStage: string | null;
  confidence: number | null;
  rawPayload: Record<string, unknown> | null;
}

export interface UpsertActivityInput {
  userId: string;
  activity: CanonicalActivity;
  provenance: CanonicalProvenance;
}

export interface UpsertDailyActivityInput {
  userId: string;
  dailyActivity: ProviderDailyActivityCanonical;
  provenance: CanonicalProvenance;
}

export interface UpsertSleepInput {
  userId: string;
  sleep: ProviderSleepCanonical;
  provenance: CanonicalProvenance;
}

export interface UpsertRecoveryInput {
  userId: string;
  recovery: ProviderRecoveryCanonical;
  provenance: CanonicalProvenance;
}

export interface LocalSyncResult {
  activitiesImported: number;
  dailyActivitiesImported: number;
  sleepsImported: number;
  recoveriesImported: number;
  healthSamplesImported: number;
  originsUpserted: number;
}
