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

function extractTimestampSource(payload: unknown, entryData: JsonRecord): string {
  return (
    readString(isRecord(payload) ? payload.timestamp : null) ??
    readString(entryData.DateTime) ??
    readString(entryData.BedtimeStart) ??
    new Date(0).toISOString()
  );
}

function extractTimestamp(payload: unknown, entryData: JsonRecord): string {
  return normaliseTimestamp(extractTimestampSource(payload, entryData)) ?? new Date(0).toISOString();
}

function extractTimezoneFromTimestamp(timestamp: string): string {
  const offset = timestamp.match(/([+-]\d{2}:\d{2})$/)?.[1];
  if (offset) return `UTC${offset}`;
  return timestamp.endsWith('Z') ? 'UTC' : 'UTC';
}

function extractDate(timestamp: string): string {
  const localDate = timestamp.match(/^(\d{4}-\d{2}-\d{2})/)?.[1];
  if (localDate) return localDate;
  return normaliseTimestamp(timestamp)?.slice(0, 10) ?? '1970-01-01';
}

function readIdentifier(value: unknown): string | null {
  return readString(value) ?? (typeof value === 'number' && Number.isFinite(value) ? String(value) : null);
}

function normaliseSpo2(value: number | null): number | null {
  if (value == null) return null;
  return value > 0 && value <= 1 ? value * 100 : value;
}

function secondsToMinutes(value: number | null): number | null {
  if (value == null || !Number.isFinite(value) || value < 0) return null;
  return value / 60;
}

export function mapSuuntoDailyActivityToCanonical(payload: unknown): SuuntoDailyActivityCanonical {
  const entryData = extractEntryData(payload);
  const timestampSource = extractTimestampSource(payload, entryData);
  const timestamp = normaliseTimestamp(timestampSource) ?? new Date(0).toISOString();
  const steps = readNumber(entryData.StepCount) ?? readNumber(entryData.Steps) ?? readNumber(entryData.steps);
  const energy = readNumber(entryData.EnergyConsumption);
  const calories =
    (energy != null ? energy / 4184 : null) ?? readNumber(entryData.Calories) ?? readNumber(entryData.calories);
  const distance = readNumber(entryData.Distance) ?? readNumber(entryData.distance);

  return {
    source: 'suunto',
    date: extractDate(timestampSource),
    timezone: extractTimezoneFromTimestamp(timestampSource),
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
  const bedtimeStartSource = readString(entryData.BedtimeStart) ?? extractTimestamp(payload, entryData);
  const bedtimeEndSource = readString(entryData.BedtimeEnd) ?? bedtimeStartSource;
  const bedtimeStart = normaliseTimestamp(bedtimeStartSource) ?? new Date(0).toISOString();
  const bedtimeEnd = normaliseTimestamp(bedtimeEndSource) ?? bedtimeStart;
  const spo2 = readNumber(entryData.AvgSpo2) ?? readNumber(entryData.MaxSpo2);
  const officialDurationSeconds = readNumber(entryData.Duration);
  const sleepDurationSeconds =
    officialDurationSeconds ?? readNumber(entryData.TotalSleepDuration) ?? readNumber(entryData.SleepDuration);
  const stageSleepSeconds =
    (readNumber(entryData.DeepSleepDuration) ?? 0) +
    (readNumber(entryData.LightSleepDuration) ?? 0) +
    (readNumber(entryData.RemSleepDuration) ?? readNumber(entryData.REMSleepDuration) ?? 0);
  const awakeSeconds = readNumber(entryData.AwakeDuration) ?? readNumber(entryData.AwakeTime);
  const asleepSeconds =
    sleepDurationSeconds == null
      ? null
      : officialDurationSeconds != null && stageSleepSeconds > 0
        ? stageSleepSeconds
        : officialDurationSeconds != null && awakeSeconds != null
          ? Math.max(officialDurationSeconds - awakeSeconds, 0)
          : sleepDurationSeconds;
  const inBedSeconds =
    officialDurationSeconds ?? (sleepDurationSeconds == null ? null : sleepDurationSeconds + (awakeSeconds ?? 0));

  return {
    source: 'suunto',
    sourceSleepId: readIdentifier(entryData.SleepId) ?? readIdentifier(entryData.sleepId),
    date: extractDate(bedtimeStartSource),
    timezone: extractTimezoneFromTimestamp(bedtimeStartSource),
    startTime: bedtimeStart,
    endTime: bedtimeEnd,
    bedtimeStart,
    bedtimeEnd,
    isNap: readBoolean(entryData.IsNap) ?? false,
    totalSleepMin: secondsToMinutes(asleepSeconds),
    durationInBedMin: secondsToMinutes(inBedSeconds),
    awakeMin: secondsToMinutes(
      awakeSeconds ??
        (officialDurationSeconds != null && stageSleepSeconds > 0 ? officialDurationSeconds - stageSleepSeconds : null),
    ),
    lightSleepMin: secondsToMinutes(readNumber(entryData.LightSleepDuration)),
    deepSleepMin: secondsToMinutes(readNumber(entryData.DeepSleepDuration)),
    remSleepMin: secondsToMinutes(readNumber(entryData.RemSleepDuration) ?? readNumber(entryData.REMSleepDuration)),
    sleepLatencyMin: secondsToMinutes(readNumber(entryData.SleepOnsetLatencyDuration)),
    wasoMin: secondsToMinutes(readNumber(entryData.WakeAfterSleepOnsetDuration)),
    afterWakeupMin: secondsToMinutes(readNumber(entryData.WakeBeforeOffBedDuration)),
    sleepScore:
      readNumber(entryData.SleepQualityScore) ?? readNumber(entryData.SleepScore) ?? readNumber(entryData.SleepQuality),
    avgHeartRateBpm: readNumber(entryData.HRAvg) ?? readNumber(entryData.AvgHeartRate) ?? readNumber(entryData.AvgHR),
    minHeartRateBpm: readNumber(entryData.HRMin) ?? readNumber(entryData.MinHeartRate) ?? readNumber(entryData.MinHR),
    avgHrvMs: readNumber(entryData.AvgHRV),
    avgSpo2Pct: normaliseSpo2(spo2),
    rawPayload: isRecord(payload) ? payload : entryData,
  };
}

export function mapSuuntoRecoveryToCanonical(payload: unknown): SuuntoRecoveryCanonical {
  const entryData = extractEntryData(payload);
  const timestampSource = extractTimestampSource(payload, entryData);
  const timestamp = normaliseTimestamp(timestampSource) ?? new Date(0).toISOString();

  return {
    source: 'suunto',
    date: extractDate(timestampSource),
    timezone: extractTimezoneFromTimestamp(timestampSource),
    timestamp,
    balance: readNumber(entryData.Balance),
    stressState: readNumber(entryData.StressState),
    rawPayload: isRecord(payload) ? payload : entryData,
  };
}
