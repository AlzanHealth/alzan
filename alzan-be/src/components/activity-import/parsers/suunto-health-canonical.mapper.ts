import {
  SuuntoDailyActivityCanonical,
  SuuntoRecoveryCanonical,
  SuuntoSleepCanonical,
} from './activity-import-canonical.types';

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string') return null;
  const parsed = Number.parseFloat(value.trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function readBoolean(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value;
  if (typeof value !== 'string') return null;
  const lowered = value.trim().toLowerCase();
  if (lowered === 'true') return true;
  if (lowered === 'false') return false;
  return null;
}

function normaliseTimestamp(value: unknown): string | null {
  const text = readString(value);
  if (!text) return null;
  const timestamp = Date.parse(text);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

function extractEntryData(payload: unknown): JsonRecord {
  if (!isRecord(payload)) return {};
  return isRecord(payload.entryData) ? payload.entryData : payload;
}

function extractTimestamp(payload: unknown, entryData: JsonRecord): string {
  const timestamp =
    normaliseTimestamp(isRecord(payload) ? payload.timestamp : null) ??
    normaliseTimestamp(entryData.DateTime) ??
    normaliseTimestamp(entryData.BedtimeStart) ??
    new Date(0).toISOString();
  return timestamp;
}

function extractTimezoneFromTimestamp(timestamp: string): string {
  return timestamp.endsWith('Z') ? 'UTC' : 'UTC';
}

function extractDate(timestamp: string): string {
  return timestamp.slice(0, 10);
}

function secondsToMinutes(value: number | null): number | null {
  if (value == null || !Number.isFinite(value) || value < 0) return null;
  return value / 60;
}

export function mapSuuntoDailyActivityToCanonical(payload: unknown): SuuntoDailyActivityCanonical {
  const entryData = extractEntryData(payload);
  const timestamp = extractTimestamp(payload, entryData);
  const steps = readNumber(entryData.StepCount) ?? readNumber(entryData.Steps) ?? readNumber(entryData.steps);
  const calories =
    readNumber(entryData.EnergyConsumption) ?? readNumber(entryData.Calories) ?? readNumber(entryData.calories);
  const distance = readNumber(entryData.Distance) ?? readNumber(entryData.distance);

  return {
    source: 'suunto',
    date: extractDate(timestamp),
    timezone: extractTimezoneFromTimestamp(timestamp),
    totalSteps: steps != null ? Math.round(steps) : null,
    caloriesKcal: calories,
    distanceM: distance,
    intervals: [
      {
        startTime: timestamp,
        endTime: null,
        steps: steps != null ? Math.round(steps) : null,
        caloriesKcal: calories,
        distanceM: distance,
        rawPayload: entryData,
      },
    ],
    rawPayload: isRecord(payload) ? payload : entryData,
  };
}

export function mapSuuntoSleepToCanonical(payload: unknown): SuuntoSleepCanonical {
  const entryData = extractEntryData(payload);
  const bedtimeStart = normaliseTimestamp(entryData.BedtimeStart) ?? extractTimestamp(payload, entryData);
  const bedtimeEnd = normaliseTimestamp(entryData.BedtimeEnd) ?? bedtimeStart;

  return {
    source: 'suunto',
    sourceSleepId: readString(entryData.SleepId) ?? readString(entryData.sleepId),
    date: extractDate(bedtimeStart),
    timezone: extractTimezoneFromTimestamp(bedtimeStart),
    startTime: bedtimeStart,
    endTime: bedtimeEnd,
    bedtimeStart,
    bedtimeEnd,
    isNap: readBoolean(entryData.IsNap) ?? false,
    totalSleepMin: secondsToMinutes(readNumber(entryData.TotalSleepDuration) ?? readNumber(entryData.SleepDuration)),
    awakeMin: secondsToMinutes(readNumber(entryData.AwakeDuration) ?? readNumber(entryData.AwakeTime)),
    lightSleepMin: secondsToMinutes(readNumber(entryData.LightSleepDuration)),
    deepSleepMin: secondsToMinutes(readNumber(entryData.DeepSleepDuration)),
    remSleepMin: secondsToMinutes(readNumber(entryData.RemSleepDuration) ?? readNumber(entryData.REMSleepDuration)),
    sleepLatencyMin: secondsToMinutes(readNumber(entryData.SleepOnsetLatencyDuration)),
    wasoMin: secondsToMinutes(readNumber(entryData.WakeAfterSleepOnsetDuration)),
    afterWakeupMin: secondsToMinutes(readNumber(entryData.WakeBeforeOffBedDuration)),
    sleepScore: readNumber(entryData.SleepScore) ?? readNumber(entryData.SleepQuality),
    avgHeartRateBpm: readNumber(entryData.AvgHeartRate) ?? readNumber(entryData.AvgHR),
    minHeartRateBpm: readNumber(entryData.MinHeartRate) ?? readNumber(entryData.MinHR),
    avgHrvMs: readNumber(entryData.AvgHRV),
    avgSpo2Pct: readNumber(entryData.AvgSpo2) ?? readNumber(entryData.MaxSpo2),
    rawPayload: isRecord(payload) ? payload : entryData,
  };
}

export function mapSuuntoRecoveryToCanonical(payload: unknown): SuuntoRecoveryCanonical {
  const entryData = extractEntryData(payload);
  const timestamp = extractTimestamp(payload, entryData);

  return {
    source: 'suunto',
    date: extractDate(timestamp),
    timezone: extractTimezoneFromTimestamp(timestamp),
    timestamp,
    balance: readNumber(entryData.Balance),
    stressState: readNumber(entryData.StressState),
    rawPayload: isRecord(payload) ? payload : entryData,
  };
}
