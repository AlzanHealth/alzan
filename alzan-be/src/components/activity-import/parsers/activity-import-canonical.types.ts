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

export interface SuuntoDailyActivityCanonical {
  source: 'suunto';
  date: string;
  timezone: string;
  totalSteps: number | null;
  caloriesKcal: number | null;
  distanceM: number | null;
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

export interface SuuntoSleepCanonical {
  source: 'suunto';
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
  avgHrvMs: number | null;
  avgSpo2Pct: number | null;
  rawPayload: Record<string, unknown>;
}

export interface SuuntoRecoveryCanonical {
  source: 'suunto';
  date: string;
  timezone: string;
  timestamp: string;
  balance: number | null;
  stressState: number | null;
  rawPayload: Record<string, unknown>;
}
