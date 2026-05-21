import { NativeModules } from 'react-native';
import { HealthConnectDataOrigin, HealthConnectLocalSyncBatch } from './types';
import {
  registerHealthConnectOrigins,
  selectHealthConnectOriginByPackage,
  uploadHealthConnectBatch,
} from './healthConnectSync';

type AlzanHealthConnectNativeModule = {
  getAvailableOrigins: () => Promise<HealthConnectDataOrigin[]>;
  requestReadPermissions: (options: { selectedPackageName?: string; syncDaysBack?: number }) => Promise<boolean>;
  readSyncBatch: (options: {
    selectedPackageName: string;
    syncDaysBack?: number;
  }) => Promise<HealthConnectLocalSyncBatch>;
  disconnect?: () => Promise<void>;
};

export class HealthConnectNoDataSourcesError extends Error {
  constructor() {
    super('No Health Connect data sources found.');
    this.name = 'HealthConnectNoDataSourcesError';
  }
}

const getAlzanHealthConnectModule = (): AlzanHealthConnectNativeModule => {
  const nativeModule = NativeModules.AlzanHealthConnect as AlzanHealthConnectNativeModule | undefined;
  if (!nativeModule) {
    throw new Error('Health Connect native module is not available in this build.');
  }
  return nativeModule;
};

const logHealthConnectDebug = (message: string, metadata?: Record<string, unknown>) => {
  if (!__DEV__) return;
  if (metadata) {
    console.info(`[HealthConnect] ${message}`, metadata);
    return;
  }
  console.info(`[HealthConnect] ${message}`);
};

export const syncHealthConnectNow = async (
  options: { selectedPackageName?: string | null; syncDaysBack?: number } = {},
) => {
  const nativeModule = getAlzanHealthConnectModule();
  let origins: HealthConnectDataOrigin[] = [];
  let selectedPackageName = options.selectedPackageName?.trim() || null;

  logHealthConnectDebug('Starting sync', {
    hasSelectedPackage: !!selectedPackageName,
    syncDaysBack: options.syncDaysBack ?? null,
  });

  if (!selectedPackageName) {
    const granted = await nativeModule.requestReadPermissions({
      syncDaysBack: options.syncDaysBack,
    });
    logHealthConnectDebug('Initial permission result', { granted });
    if (!granted) throw new Error('Health Connect permissions were not granted.');

    origins = await nativeModule.getAvailableOrigins();
    logHealthConnectDebug('Origins discovered after permission grant', { count: origins.length });
    if (origins.length > 0) await registerHealthConnectOrigins(origins);
    selectedPackageName = origins.length === 1 ? origins[0]?.packageName : null;
  }

  if (!selectedPackageName) {
    if (origins.length === 0) {
      throw new HealthConnectNoDataSourcesError();
    }
    throw new Error('Choose one Health Connect data source before syncing.');
  }

  await selectHealthConnectOriginByPackage(selectedPackageName);
  const granted = await nativeModule.requestReadPermissions({
    selectedPackageName,
    syncDaysBack: options.syncDaysBack,
  });
  logHealthConnectDebug('Selected-origin permission result', { granted, selectedPackageName });
  if (!granted) throw new Error('Health Connect permissions were not granted.');

  if (origins.length === 0) {
    origins = await nativeModule.getAvailableOrigins();
    logHealthConnectDebug('Origins discovered for selected package', { count: origins.length });
    if (origins.length > 0) await registerHealthConnectOrigins(origins);
  }

  const batch = await nativeModule.readSyncBatch({
    selectedPackageName,
    syncDaysBack: options.syncDaysBack,
  });
  logHealthConnectDebug('Read batch completed', {
    selectedPackageName,
    recordCount: batch.records.length,
    originCount: batch.origins?.length ?? origins.length,
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
