import { Database } from '../types/database.types';

export type StrengthActivityProvider =
  | 'suunto'
  | 'strava'
  | 'garmin'
  | 'polar'
  | 'fitbit'
  | 'health_connect'
  | 'coros'
  | 'apple_health'
  | 'whoop'
  | 'unknown';
export type StrengthActivitySourceFileType = 'fit' | 'json';

export interface ImportedStrengthActivityDevice {
  name: string | null;
  model: string | null;
  serial: string | null;
}

export interface ImportedStrengthActivityHeartRateZone {
  zone: 1 | 2 | 3 | 4 | 5;
  durationSeconds: number;
  percentage: number;
}

export interface ImportedStrengthActivityHeartRateSample {
  offsetSeconds: number | null;
  timestamp: string | null;
  bpm: number;
}

export interface ImportedStrengthActivitySummary {
  provider: StrengthActivityProvider;
  sourceFileType: StrengthActivitySourceFileType;
  startedAt: string | null;
  endedAt: string | null;
  durationSeconds: number | null;
  caloriesKcal: number | null;
  avgHeartRate: number | null;
  maxHeartRate: number | null;
  minHeartRate: number | null;
  totalSteps: number | null;
  recoveryTimeSeconds: number | null;
  epoc: number | null;
  pte: number | null;
  tss: number | null;
  trainingLoadPeak: number | null;
  device: ImportedStrengthActivityDevice | null;
  heartRateZones: ImportedStrengthActivityHeartRateZone[];
  heartRateStream: ImportedStrengthActivityHeartRateSample[];
}

export type DatabaseProvider = Database['public']['Enums']['provider_enum'];

export const STRENGTH_ACTIVITY_PARSE_ERROR_TAG = 'STRENGTH_ACTIVITY_PARSE_ERROR';
export const STRENGTH_ACTIVITY_UNSUPPORTED_ERROR_TAG = 'STRENGTH_ACTIVITY_UNSUPPORTED_ERROR';

export function getDatabaseProviderForStrengthImport(provider: StrengthActivityProvider): DatabaseProvider {
  if (provider === 'unknown') return 'other';
  return provider;
}
