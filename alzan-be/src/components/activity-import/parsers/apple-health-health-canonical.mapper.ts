import {
  AppleHealthDailyActivityCanonical,
  AppleHealthRecoveryCanonical,
  AppleHealthSleepCanonical,
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

function normaliseTimestamp(value: unknown): string | null {
  const text = readString(value);
  if (!text) return null;
  const timestamp = Date.parse(text);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

function normaliseType(value: unknown): string {
  return (
    readString(value)
      ?.replace(/^HKQuantityTypeIdentifier/, '')
      .replace(/^HKCategoryTypeIdentifier/, '')
      .replace(/[_\s-]+/g, '')
      .toLowerCase() ?? ''
  );
}

function readDataRecords(payload: unknown): JsonRecord[] {
  if (!isRecord(payload)) return [];
  const data = isRecord(payload.data) ? payload.data : {};
  const records = Array.isArray(data.records) ? data.records : Array.isArray(payload.records) ? payload.records : [];
  return records.filter(isRecord);
}

function readSleepRecords(payload: unknown): JsonRecord[] {
  if (!isRecord(payload)) return [];
  const data = isRecord(payload.data) ? payload.data : {};
  const sleep = Array.isArray(data.sleep) ? data.sleep : Array.isArray(payload.sleep) ? payload.sleep : [payload];
  return sleep.filter(isRecord);
}

function readDateFromTimestamp(timestamp: string): string {
  return timestamp.slice(0, 10);
}

function readTimezone(record: JsonRecord): string {
  return readString(record.zoneOffset) ?? readString(record.timezone) ?? 'UTC';
}

function minutesBetween(startTime: string | null, endTime: string | null): number | null {
  if (!startTime || !endTime) return null;
  const startMs = new Date(startTime).getTime();
  const endMs = new Date(endTime).getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return null;
  return (endMs - startMs) / 60000;
}

function sumRecords(records: JsonRecord[], typeName: string): number | null {
  const values = records
    .filter(record => normaliseType(record.type).includes(typeName))
    .map(record => readNumber(record.value))
    .filter((value): value is number => value != null);
  return values.length > 0 ? values.reduce((sum, value) => sum + value, 0) : null;
}

function latestRecord(records: JsonRecord[], typeName: string): JsonRecord | null {
  return records.filter(record => normaliseType(record.type).includes(typeName)).at(-1) ?? null;
}

function readLatestValue(records: JsonRecord[], typeName: string): number | null {
  const record = latestRecord(records, typeName);
  return record ? readNumber(record.value) : null;
}

export function mapAppleHealthDailyActivityToCanonical(payload: unknown): AppleHealthDailyActivityCanonical {
  const records = readDataRecords(payload);
  const firstTimestamp = normaliseTimestamp(records[0]?.startDate) ?? new Date(0).toISOString();
  const steps = sumRecords(records, 'stepcount');
  const activeCalories = sumRecords(records, 'activeenergyburned');
  const basalCalories = sumRecords(records, 'basalenergyburned');
  const distance = sumRecords(records, 'distance');
  return {
    source: 'apple_health',
    date: readDateFromTimestamp(firstTimestamp),
    timezone: records[0] ? readTimezone(records[0]) : 'UTC',
    totalSteps: steps == null ? null : Math.round(steps),
    caloriesKcal: (activeCalories ?? 0) + (basalCalories ?? 0) || activeCalories,
    activeCaloriesKcal: activeCalories,
    distanceM: distance,
    activeDistanceM: distance,
    intervals: records
      .filter(record => normaliseType(record.type).includes('stepcount'))
      .map(record => ({
        startTime: normaliseTimestamp(record.startDate) ?? firstTimestamp,
        endTime: normaliseTimestamp(record.endDate),
        steps: readNumber(record.value),
        caloriesKcal: null,
        distanceM: null,
        rawPayload: record,
      })),
    rawPayload: isRecord(payload) ? payload : {},
  };
}

export function mapAppleHealthSleepToCanonical(payload: unknown): AppleHealthSleepCanonical {
  const sleepRecords = readSleepRecords(payload);
  const firstStart = normaliseTimestamp(sleepRecords[0]?.startDate) ?? new Date(0).toISOString();
  const lastEnd = normaliseTimestamp(sleepRecords.at(-1)?.endDate) ?? firstStart;
  const minutesByStage = sleepRecords.reduce<Record<string, number>>((accumulator, record) => {
    const stage = normaliseType(record.stage ?? record.value ?? record.type);
    const minutes = minutesBetween(normaliseTimestamp(record.startDate), normaliseTimestamp(record.endDate)) ?? 0;
    accumulator[stage] = (accumulator[stage] ?? 0) + minutes;
    return accumulator;
  }, {});
  const light = (minutesByStage.asleepcore ?? 0) + (minutesByStage.light ?? 0);
  const deep = (minutesByStage.asleepdeep ?? 0) + (minutesByStage.deep ?? 0);
  const rem = (minutesByStage.asleeprem ?? 0) + (minutesByStage.rem ?? 0);
  const awake = (minutesByStage.awake ?? 0) + (minutesByStage.asleepawake ?? 0);
  return {
    source: 'apple_health',
    sourceSleepId: readString(sleepRecords[0]?.parentId) ?? readString(sleepRecords[0]?.id),
    date: readDateFromTimestamp(firstStart),
    timezone: sleepRecords[0] ? readTimezone(sleepRecords[0]) : 'UTC',
    startTime: firstStart,
    endTime: lastEnd,
    bedtimeStart: firstStart,
    bedtimeEnd: lastEnd,
    isNap: false,
    totalSleepMin: light + deep + rem || null,
    awakeMin: awake || null,
    lightSleepMin: light || null,
    deepSleepMin: deep || null,
    remSleepMin: rem || null,
    sleepLatencyMin: null,
    wasoMin: awake || null,
    afterWakeupMin: null,
    sleepScore: null,
    avgHeartRateBpm: null,
    minHeartRateBpm: null,
    avgHrvMs: null,
    avgSpo2Pct: null,
    rawPayload: isRecord(payload) ? payload : {},
  };
}

export function mapAppleHealthRecoveryToCanonical(payload: unknown): AppleHealthRecoveryCanonical {
  const records = readDataRecords(payload);
  const firstTimestamp = normaliseTimestamp(records[0]?.startDate) ?? new Date(0).toISOString();
  return {
    source: 'apple_health',
    date: readDateFromTimestamp(firstTimestamp),
    timezone: records[0] ? readTimezone(records[0]) : 'UTC',
    timestamp: firstTimestamp,
    recoveryScore: null,
    readinessScore: null,
    sleepScore: null,
    strainScore: null,
    restingHrBpm: readLatestValue(records, 'restingheartrate'),
    avgHrvMs: readLatestValue(records, 'heartratevariabilitysdnn'),
    respiratoryRateRpm: readLatestValue(records, 'respiratoryrate'),
    spo2AvgPct: readLatestValue(records, 'oxygensaturation'),
    balance: readLatestValue(records, 'bodytemperature') ?? readLatestValue(records, 'wristtemperature'),
    stressState: readLatestValue(records, 'heartraterecovery'),
    rawPayload: isRecord(payload) ? payload : {},
  };
}
