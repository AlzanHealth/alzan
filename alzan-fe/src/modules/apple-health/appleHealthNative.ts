import { NativeModules } from 'react-native';
import { AppleHealthLocalSyncBatch } from './types';
import { uploadAppleHealthBatch } from './appleHealthSync';

type AlzanAppleHealthNativeModule = {
  requestReadPermissions: (options?: { syncDaysBack?: number }) => Promise<boolean>;
  readSyncBatch: (options?: { syncDaysBack?: number }) => Promise<AppleHealthLocalSyncBatch>;
  disconnect?: () => Promise<void>;
};

const getAlzanAppleHealthModule = (): AlzanAppleHealthNativeModule => {
  const nativeModule = NativeModules.AlzanAppleHealth as AlzanAppleHealthNativeModule | undefined;
  if (!nativeModule) {
    throw new Error('Apple Health native module is not available in this build.');
  }
  return nativeModule;
};

export const syncAppleHealthNow = async (options: { syncDaysBack?: number } = {}) => {
  const nativeModule = getAlzanAppleHealthModule();
  console.log('[AppleHealth] Requesting HealthKit read permissions');
  const granted = await nativeModule.requestReadPermissions(options);
  console.log('[AppleHealth] HealthKit permission request completed', { granted });
  if (!granted) throw new Error('Apple Health permissions were not granted.');

  console.log('[AppleHealth] Reading local sync batch');
  const batch = await nativeModule.readSyncBatch(options);
  console.log('[AppleHealth] Local sync batch ready', {
    records: batch.records.length,
    syncStates: batch.syncStates?.length ?? 0,
    traceId: batch.traceId,
  });
  return uploadAppleHealthBatch(batch);
};

export const signOutAppleHealth = async (): Promise<void> => {
  await getAlzanAppleHealthModule().disconnect?.();
};
