import { wearablesLocalHealthApi } from '../wearables';
import { AppleHealthLocalSyncBatch, getAppleHealthSourcePackage } from './types';

export const uploadAppleHealthBatch = async (batch: AppleHealthLocalSyncBatch) => {
  const sourcePackage = getAppleHealthSourcePackage(batch.sourceRevision);
  return wearablesLocalHealthApi.uploadLocalHealthSync({
    source_channel: 'apple_health',
    source_package: sourcePackage,
    trace_id: batch.traceId,
    records: batch.records.map(record => ({
      ...record,
      source_package: record.source_package ?? sourcePackage,
    })),
    sync_states: batch.syncStates,
  });
};
