import { LocalHealthSyncRecord, LocalHealthSyncState, ProviderOriginInput } from '../wearables';

export type HealthConnectDataOrigin = {
  packageName: string;
  appName?: string;
  providerKey?: string;
  platform?: 'android';
  raw?: Record<string, unknown>;
};

export type HealthConnectLocalSyncBatch = {
  selectedPackageName: string;
  origins?: HealthConnectDataOrigin[];
  records: LocalHealthSyncRecord[];
  syncStates?: LocalHealthSyncState[];
  traceId?: string;
};

export const toHealthConnectProviderOrigin = (origin: HealthConnectDataOrigin): ProviderOriginInput => ({
  source_channel: 'health_connect',
  provider: 'health_connect',
  source_package: origin.packageName,
  source_provider_key: origin.providerKey,
  display_name: origin.appName,
  platform: origin.platform ?? 'android',
  raw_payload: origin.raw,
});
