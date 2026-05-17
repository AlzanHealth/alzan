import { NativeModules } from 'react-native';
import { HealthConnectDataOrigin, HealthConnectLocalSyncBatch } from './types';
import {
  registerHealthConnectOrigins,
  selectHealthConnectOriginByPackage,
  uploadHealthConnectBatch,
} from './healthConnectSync';

type AlzanHealthConnectNativeModule = {
  getAvailableOrigins: () => Promise<HealthConnectDataOrigin[]>;
  requestReadPermissions: (options: { selectedPackageName: string; syncDaysBack?: number }) => Promise<boolean>;
  readSyncBatch: (options: {
    selectedPackageName: string;
    syncDaysBack?: number;
  }) => Promise<HealthConnectLocalSyncBatch>;
  disconnect?: () => Promise<void>;
};

const getAlzanHealthConnectModule = (): AlzanHealthConnectNativeModule => {
  const nativeModule = NativeModules.AlzanHealthConnect as AlzanHealthConnectNativeModule | undefined;
  if (!nativeModule) {
    throw new Error('Health Connect native module is not available in this build.');
  }
  return nativeModule;
};

export const syncHealthConnectNow = async (
  options: { selectedPackageName?: string | null; syncDaysBack?: number } = {},
) => {
  const nativeModule = getAlzanHealthConnectModule();
  const origins = await nativeModule.getAvailableOrigins();
  if (origins.length > 0) await registerHealthConnectOrigins(origins);

  const selectedPackageName = options.selectedPackageName ?? (origins.length === 1 ? origins[0]?.packageName : null);
  if (!selectedPackageName) {
    throw new Error('Choose one Health Connect data source before syncing.');
  }

  await selectHealthConnectOriginByPackage(selectedPackageName);
  const granted = await nativeModule.requestReadPermissions({
    selectedPackageName,
    syncDaysBack: options.syncDaysBack,
  });
  if (!granted) throw new Error('Health Connect permissions were not granted.');

  const batch = await nativeModule.readSyncBatch({
    selectedPackageName,
    syncDaysBack: options.syncDaysBack,
  });
  return uploadHealthConnectBatch({
    ...batch,
    selectedPackageName,
    origins: batch.origins ?? origins,
  });
};

export const signOutHealthConnect = async (): Promise<void> => {
  await getAlzanHealthConnectModule().disconnect?.();
};
