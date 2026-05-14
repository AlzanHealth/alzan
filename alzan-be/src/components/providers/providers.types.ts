export enum WearableProvider {
  STRAVA = 'strava',
  GARMIN = 'garmin',
  POLAR = 'polar',
  SUUNTO = 'suunto',
  COROS = 'coros',
  WHOOP = 'whoop',
  OURA = 'oura',
  FITBIT = 'fitbit',
  ULTRAHUMAN = 'ultrahuman',
  APPLE_HEALTH = 'apple_health',
  HEALTH_CONNECT = 'health_connect',
}

export type WearableProviderConnectionKind = 'oauth' | 'local_sdk' | 'file_import';

export interface WearableProviderCapability {
  provider: WearableProvider;
  connectionKind: WearableProviderConnectionKind;
  supportsActivities: boolean;
  supportsDailyHealth: boolean;
  supportsSleep: boolean;
  supportsRecovery: boolean;
  supportsServerBackfill: boolean;
  supportsLocalSdk: boolean;
}
