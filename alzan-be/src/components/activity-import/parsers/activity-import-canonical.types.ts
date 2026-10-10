import { Database } from '../../../types/database.types';

export type CanonicalActivityProvider = Database['public']['Enums']['wearable_provider_enum'] | 'other';
export type CanonicalActivitySourceFileType = 'fit' | 'json';
export type CanonicalSportType = Database['public']['Enums']['sport_type_enum'];
export type CanonicalSportSubtype = string;

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
  altitudeM?: number | null;
  distanceM?: number | null;
  speedMps?: number | null;
  horizontalAccuracyM?: number | null;
  verticalAccuracyM?: number | null;
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
  timezone?: string | null;
  startedAtLocal?: string | null;
  endedAtLocal?: string | null;
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

export interface CanonicalActivityProvenance {
  sourceChannel: 'cloud' | 'apple_health' | 'health_connect' | 'file_import' | 'manual';
  sourcePackage: string | null;
  sourceProviderKey: string | null;
  sourceRecordId: string | null;
  sourceUpdatedAt: string | null;
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
  pendingWatchMetrics?: Record<string, unknown> | null;
  provenance?: CanonicalActivityProvenance;
  hydrationVersion?: number;
}

export interface CanonicalSleepStageInterval {
  startTime: string;
  endTime: string;
  stage: Database['public']['Enums']['sleep_stage_enum'];
  providerStage: string | null;
  confidence: number | null;
  rawPayload: Record<string, unknown> | null;
}

export interface CanonicalHealthMetricSample {
  metricType: string;
  recordedAt: string;
  localDate?: string | null;
  timezone?: string | null;
  value: number;
  unit: string;
  sourceRecordId?: string | null;
  rawPayload?: Record<string, unknown> | null;
}

export interface ProviderDailyActivityCanonical<TSource extends CanonicalActivityProvider = CanonicalActivityProvider> {
  source: TSource;
  sourcePackage?: string | null;
  sourceRecordId?: string | null;
  sourceUpdatedAt?: string | null;
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
  sourcePackage?: string | null;
  sourceSleepId: string | null;
  sourceRecordId?: string | null;
  sourceUpdatedAt?: string | null;
  date: string;
  timezone: string;
  startTime: string;
  endTime: string;
  bedtimeStart: string | null;
  bedtimeEnd: string | null;
  isNap: boolean;
  totalSleepMin: number | null;
  durationInBedMin?: number | null;
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
  maxSpo2Pct?: number | null;
  stageIntervals?: CanonicalSleepStageInterval[];
  healthSamples?: CanonicalHealthMetricSample[];
  rawPayload: Record<string, unknown>;
}

export interface ProviderRecoveryCanonical<TSource extends CanonicalActivityProvider = CanonicalActivityProvider> {
  source: TSource;
  sourcePackage?: string | null;
  sourceRecordId?: string | null;
  sourceUpdatedAt?: string | null;
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
  hrvRmssdMs?: number | null;
  respiratoryRateRpm?: number | null;
  spo2AvgPct?: number | null;
  temperatureDeviationC?: number | null;
  skinTemperatureC?: number | null;
  bodyTemperatureC?: number | null;
  vo2Max?: number | null;
  heartRateRecoveryBpm?: number | null;
  healthSamples?: CanonicalHealthMetricSample[];
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

export type UltrahumanDailyActivityCanonical = ProviderDailyActivityCanonical<'ultrahuman'>;
export type UltrahumanSleepCanonical = ProviderSleepCanonical<'ultrahuman'>;
export type UltrahumanRecoveryCanonical = ProviderRecoveryCanonical<'ultrahuman'>;

export interface WhoopCycleCanonical {
  source: 'whoop';
  sourceCycleId: string | null;
  date: string;
  timezone: string;
  startTime: string;
  endTime: string | null;
  scoreState: string | null;
  strainScore: number | null;
  kilojoule: number | null;
  caloriesKcal: number | null;
  avgHeartRateBpm: number | null;
  maxHeartRateBpm: number | null;
  rawPayload: Record<string, unknown>;
}

export type WhoopSleepCanonical = ProviderSleepCanonical<'whoop'>;
export type WhoopRecoveryCanonical = ProviderRecoveryCanonical<'whoop'>;

export type AppleHealthDailyActivityCanonical = ProviderDailyActivityCanonical<'apple_health'>;
export type AppleHealthSleepCanonical = ProviderSleepCanonical<'apple_health'>;
export type AppleHealthRecoveryCanonical = ProviderRecoveryCanonical<'apple_health'>;

export type HealthConnectDailyActivityCanonical = ProviderDailyActivityCanonical<'health_connect'> & {
  sourcePackage: string | null;
};
export type HealthConnectSleepCanonical = ProviderSleepCanonical<'health_connect'> & {
  sourcePackage: string | null;
};
export type HealthConnectRecoveryCanonical = ProviderRecoveryCanonical<'health_connect'> & {
  sourcePackage: string | null;
};

export type CorosDailyActivityCanonical = ProviderDailyActivityCanonical<'coros'>;
export type CorosSleepCanonical = ProviderSleepCanonical<'coros'>;
export type CorosRecoveryCanonical = ProviderRecoveryCanonical<'coros'>;

export interface UltrahumanMetabolicCanonical {
  source: 'ultrahuman';
  date: string;
  timezone: string;
  timestamp: string;
  glucoseMgDl: number | null;
  averageGlucoseMgDl: number | null;
  glucoseVariabilityPct: number | null;
  hba1cPct: number | null;
  timeInTargetPct: number | null;
  metabolicScore: number | null;
  rawPayload: Record<string, unknown>;
}
