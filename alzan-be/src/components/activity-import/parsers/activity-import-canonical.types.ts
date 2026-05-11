import { Database } from '../../../types/database.types';

export type CanonicalActivityProvider = Database['public']['Enums']['wearable_provider_enum'] | 'other';
export type CanonicalActivitySourceFileType = 'fit' | 'json';
export type CanonicalSportType = Database['public']['Enums']['sport_type_enum'];
export type CanonicalSportSubtype = Database['public']['Enums']['sport_subtype_enum'];

export interface CanonicalActivitySportMapping {
  sportType: CanonicalSportType;
  sportSubtype: CanonicalSportSubtype | null;
}

export interface CanonicalActivityDevice {
  name: string | null;
  model: string | null;
  serial: string | null;
}

export interface CanonicalActivityPointSample {
  offsetSeconds: number | null;
  timestamp: string | null;
  lat: number;
  lon: number;
}

export interface CanonicalActivityMetricSample {
  offsetSeconds: number | null;
  timestamp: string | null;
  value: number;
}

export interface CanonicalActivityStreams {
  position: CanonicalActivityPointSample[];
  heartRate: CanonicalActivityMetricSample[];
  speed: CanonicalActivityMetricSample[];
  distance: CanonicalActivityMetricSample[];
  altitude: CanonicalActivityMetricSample[];
  cadence: CanonicalActivityMetricSample[];
  power: CanonicalActivityMetricSample[];
  temperature: CanonicalActivityMetricSample[];
}

export interface CanonicalActivitySummary {
  startedAt: string | null;
  endedAt: string | null;
  durationSeconds: number | null;
  elapsedSeconds: number | null;
  distanceM: number | null;
  caloriesKcal: number | null;
  avgHeartRate: number | null;
  maxHeartRate: number | null;
  minHeartRate: number | null;
  avgSpeedMps: number | null;
  maxSpeedMps: number | null;
  avgCadence: number | null;
  maxCadence: number | null;
  avgPowerW: number | null;
  maxPowerW: number | null;
  elevationGainM: number | null;
  elevationLossM: number | null;
  avgTemperatureC: number | null;
  maxTemperatureC: number | null;
  totalSteps: number | null;
  recoveryTimeSeconds: number | null;
  vo2Max: number | null;
  epoc: number | null;
  pte: number | null;
  tss: number | null;
}

export interface CanonicalActivityLap {
  lapIndex: number;
  lapType: 'manual' | 'auto' | 'distance' | 'time' | 'unknown';
  distanceM: number | null;
  durationSeconds: number | null;
  avgPaceSecondsPerKm: number | null;
  avgHeartRate: number | null;
  maxHeartRate: number | null;
  startOffsetSeconds: number | null;
  endOffsetSeconds: number | null;
}

export interface CanonicalActivityHeartRateZone {
  zone: 1 | 2 | 3 | 4 | 5;
  durationSeconds: number;
  percentage: number;
}

export interface CanonicalActivity {
  provider: CanonicalActivityProvider;
  sourceFileType: CanonicalActivitySourceFileType;
  sportType: CanonicalSportType;
  sportSubtype: CanonicalSportSubtype | null;
  providerActivityId: string | null;
  summary: CanonicalActivitySummary;
  streams: CanonicalActivityStreams;
  laps: CanonicalActivityLap[];
  heartRateZones: CanonicalActivityHeartRateZone[];
  device: CanonicalActivityDevice | null;
  vendorFields: Record<string, unknown>;
}

export interface ProviderDailyActivityCanonical<TSource extends CanonicalActivityProvider = CanonicalActivityProvider> {
  source: TSource;
  date: string;
  timezone: string;
  totalSteps: number | null;
  activeSteps?: number | null;
  walkingSteps?: number | null;
  runningSteps?: number | null;
  caloriesKcal: number | null;
  activeCaloriesKcal?: number | null;
  distanceM: number | null;
  activeDistanceM?: number | null;
  floorsClimbed?: number | null;
  stepGoal?: number | null;
  goalAchieved?: boolean | null;
  sedentaryMinutes?: number | null;
  lightlyActiveMin?: number | null;
  fairlyActiveMin?: number | null;
  veryActiveMin?: number | null;
  intervals: Array<{
    startTime: string;
    endTime: string | null;
    steps: number | null;
    caloriesKcal: number | null;
    distanceM: number | null;
    rawPayload: Record<string, unknown>;
  }>;
  rawPayload: Record<string, unknown>;
}

export interface ProviderSleepCanonical<TSource extends CanonicalActivityProvider = CanonicalActivityProvider> {
  source: TSource;
  sourceSleepId: string | null;
  date: string;
  timezone: string;
  startTime: string;
  endTime: string;
  bedtimeStart: string | null;
  bedtimeEnd: string | null;
  isNap: boolean;
  totalSleepMin: number | null;
  awakeMin: number | null;
  lightSleepMin: number | null;
  deepSleepMin: number | null;
  remSleepMin: number | null;
  sleepLatencyMin: number | null;
  wasoMin: number | null;
  afterWakeupMin: number | null;
  sleepScore: number | null;
  avgHeartRateBpm: number | null;
  minHeartRateBpm: number | null;
  maxHeartRateBpm?: number | null;
  restingHrBpm?: number | null;
  avgHrvMs: number | null;
  hrvRmssdMs?: number | null;
  avgRespiratoryRpm?: number | null;
  avgSpo2Pct: number | null;
  minSpo2Pct?: number | null;
  rawPayload: Record<string, unknown>;
}

export interface ProviderRecoveryCanonical<TSource extends CanonicalActivityProvider = CanonicalActivityProvider> {
  source: TSource;
  date: string;
  timezone: string;
  timestamp: string;
  recoveryScore?: number | null;
  readinessScore?: number | null;
  sleepScore?: number | null;
  strainScore?: number | null;
  bodyBatteryStart?: number | null;
  bodyBatteryMin?: number | null;
  bodyBatteryMax?: number | null;
  bodyBatteryEnd?: number | null;
  restingHrBpm?: number | null;
  avgHrvMs?: number | null;
  respiratoryRateRpm?: number | null;
  spo2AvgPct?: number | null;
  balance: number | null;
  stressState: number | null;
  rawPayload: Record<string, unknown>;
}

export type SuuntoDailyActivityCanonical = ProviderDailyActivityCanonical<'suunto'>;
export type SuuntoSleepCanonical = ProviderSleepCanonical<'suunto'>;
export type SuuntoRecoveryCanonical = ProviderRecoveryCanonical<'suunto'>;

export type GarminDailyActivityCanonical = ProviderDailyActivityCanonical<'garmin'>;
export type GarminSleepCanonical = ProviderSleepCanonical<'garmin'>;
export type GarminRecoveryCanonical = ProviderRecoveryCanonical<'garmin'>;

export type PolarDailyActivityCanonical = ProviderDailyActivityCanonical<'polar'>;
export type PolarSleepCanonical = ProviderSleepCanonical<'polar'>;
export type PolarRecoveryCanonical = ProviderRecoveryCanonical<'polar'>;

export type FitbitDailyActivityCanonical = ProviderDailyActivityCanonical<'fitbit'>;
export type FitbitSleepCanonical = ProviderSleepCanonical<'fitbit'>;
export type FitbitRecoveryCanonical = ProviderRecoveryCanonical<'fitbit'>;

export type OuraDailyActivityCanonical = ProviderDailyActivityCanonical<'oura'>;
export type OuraSleepCanonical = ProviderSleepCanonical<'oura'>;
export type OuraRecoveryCanonical = ProviderRecoveryCanonical<'oura'>;
