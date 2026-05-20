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
  const granted = await nativeModule.requestReadPermissions(options);
  if (!granted) throw new Error('Apple Health permissions were not granted.');

  const batch = await nativeModule.readSyncBatch(options);
  return uploadAppleHealthBatch(batch);
};

export const signOutAppleHealth = async (): Promise<void> => {
  await getAlzanAppleHealthModule().disconnect?.();
};
