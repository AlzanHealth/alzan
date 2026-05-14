import { wearablesLocalHealthApi } from '../wearables';
import { HealthConnectDataOrigin, HealthConnectLocalSyncBatch, toHealthConnectProviderOrigin } from './types';

export const registerHealthConnectOrigins = async (origins: HealthConnectDataOrigin[]) => {
  return wearablesLocalHealthApi.upsertHealthConnectOrigins(origins.map(toHealthConnectProviderOrigin));
};

export const selectHealthConnectOriginByPackage = async (packageName: string) => {
  const origins = await wearablesLocalHealthApi.listHealthConnectOrigins();
  const origin = origins.find(item => item.source_package === packageName);
  if (!origin) throw new Error(`Health Connect origin not registered: ${packageName}`);
  return wearablesLocalHealthApi.selectHealthConnectOrigin(origin.id);
};

export const uploadHealthConnectBatch = async (batch: HealthConnectLocalSyncBatch) => {
  return wearablesLocalHealthApi.uploadLocalHealthSync({
    source_channel: 'health_connect',
    source_package: batch.selectedPackageName,
    trace_id: batch.traceId,
    origins: batch.origins?.map(toHealthConnectProviderOrigin),
    records: batch.records.map(record => ({
      ...record,
      source_package: record.source_package ?? batch.selectedPackageName,
    })),
    sync_states: batch.syncStates,
  });
};
