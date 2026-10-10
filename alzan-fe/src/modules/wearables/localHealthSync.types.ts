export type LocalHealthSourceChannel = 'apple_health' | 'health_connect';

export type LocalSyncObjectType =
  | 'activity'
  | 'daily_activity'
  | 'sleep'
  | 'recovery'
  | 'health_sample'
  | 'vo2_max'
  | 'weight';

export type LocalSyncDomain = 'activities' | 'daily_activity' | 'sleep' | 'recovery' | 'health_metrics' | 'body';

export type WearableProviderKey =
  | 'strava'
  | 'garmin'
  | 'polar'
  | 'suunto'
  | 'whoop'
  | 'oura'
  | 'fitbit'
  | 'ultrahuman'
  | 'apple_health'
  | 'health_connect'
  | 'manual'
  | 'coros';

export type ProviderOriginInput = {
  source_channel: LocalHealthSourceChannel;
  provider: WearableProviderKey;
  source_package?: string;
  source_provider_key?: string;
  display_name?: string;
  platform?: string;
  raw_payload?: Record<string, unknown>;
};

export type ProviderOrigin = {
  id: string;
  source_channel: string;
  provider: WearableProviderKey;
  source_package: string | null;
  source_provider_key: string | null;
  display_name: string | null;
  platform: string | null;
  last_seen_at: string;
};

export type LocalHealthSyncRecord = {
  object_type: LocalSyncObjectType;
  source_record_id?: string;
  source_updated_at?: string;
  source_package?: string;
  metric_type?: string;
  value?: number;
  unit?: string;
  recorded_at?: string;
  payload: Record<string, unknown>;
};

export type LocalHealthSyncState = {
  sync_domain: LocalSyncDomain;
  cursor_token?: string;
  anchor_token?: string;
  last_record_at?: string;
};

export type LocalHealthSyncRequest = {
  source_channel: LocalHealthSourceChannel;
  source_package?: string;
  trace_id?: string;
  origins?: ProviderOriginInput[];
  records: LocalHealthSyncRecord[];
  sync_states?: LocalHealthSyncState[];
};

export type LocalHealthSyncResult = {
  activities_imported: number;
  daily_activities_imported: number;
  sleeps_imported: number;
  recoveries_imported: number;
  health_samples_imported: number;
  origins_upserted: number;
};

export type CloudProviderSyncResult = {
  provider: WearableProviderKey;
  job_id?: string;
  status?: 'running' | 'success' | 'partial';
  retry_after_at?: string | null;
  activities_imported: number;
  activities_skipped?: number;
  activities_updated?: number;
  activities_repaired?: number;
  activities_failed?: number;
  activities_reconciled?: number;
  errors_by_code?: Record<string, number>;
  phase_durations_ms?: Record<string, number>;
  last_success_at: string | null;
  health_days_imported?: number;
  health_consent_required?: boolean;
  health_sync_status?: 'success' | 'partial' | 'unavailable' | 'running' | 'skipped';
  health_sync_error?: string;
  health_samples_imported?: number;
  health_sleeps_imported?: number;
  health_recoveries_imported?: number;
  health_last_synced_at?: string | null;
  backfill_complete?: boolean;
  backfill_next_date?: string | null;
  fit_pending?: number;
};

export type CorosCapability = {
  enabled: boolean;
  mode: 'disabled' | 'pilot' | 'public';
  reason?: 'ready' | 'not_configured' | 'restricted';
};

export type CorosDisconnectResult = {
  disconnected: boolean;
  remote_deauthorization_pending: boolean;
};

export type CorosHistoryImportResult = {
  filesImported: number;
  filesSkipped: number;
  filesFailed: number;
  errorsByFile: Array<{ fileName: string; code: string }>;
};
