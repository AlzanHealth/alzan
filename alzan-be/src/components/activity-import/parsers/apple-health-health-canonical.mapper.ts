import {
  AppleHealthDailyActivityCanonical,
  AppleHealthRecoveryCanonical,
  AppleHealthSleepCanonical,
  CanonicalHealthMetricSample,
  CanonicalSleepStageInterval,
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

function readSourcePackage(record: JsonRecord): string | null {
  const source = isRecord(record.source) ? record.source : {};
  const sourceRevision = isRecord(record.sourceRevision) ? record.sourceRevision : {};
  const revisionSource = isRecord(sourceRevision.source) ? sourceRevision.source : {};
  return (
    readString(source.bundleIdentifier) ??
    readString(source.bundle_id) ??
    readString(revisionSource.bundleIdentifier) ??
    readString(revisionSource.bundle_id)
  );
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

function mapSleepStage(value: string): CanonicalSleepStageInterval['stage'] {
  const normalised = normaliseType(value);
  if (normalised.includes('awake')) return 'awake';
  if (normalised.includes('asleepdeep') || normalised.includes('deep')) return 'deep';
  if (normalised.includes('asleeprem') || normalised.includes('rem')) return 'rem';
  if (normalised.includes('asleepcore') || normalised.includes('core')) return 'core';
  if (normalised.includes('asleep')) return 'sleeping';
  return 'unknown';
}

function mapSleepStageIntervals(records: JsonRecord[]): CanonicalSleepStageInterval[] {
  return records.flatMap(record => {
    const startTime = normaliseTimestamp(record.startDate);
    const endTime = normaliseTimestamp(record.endDate);
    if (!startTime || !endTime || endTime <= startTime) return [];
    const providerStage = readString(record.stage ?? record.value ?? record.type) ?? 'unknown';
    return [
      {
        startTime,
        endTime,
        stage: mapSleepStage(providerStage),
        providerStage,
        confidence: readNumber(record.confidence),
        rawPayload: record,
      },
    ];
  });
}

function buildHealthSample(
  metricType: string,
  value: number | null,
  unit: string,
  record: JsonRecord | null,
  fallbackRecordedAt: string,
  timezone: string,
): CanonicalHealthMetricSample[] {
  if (value == null) return [];
  return [
    {
      metricType,
      recordedAt: normaliseTimestamp(record?.startDate) ?? fallbackRecordedAt,
      localDate: (normaliseTimestamp(record?.startDate) ?? fallbackRecordedAt).slice(0, 10),
      timezone,
      value,
      unit,
      sourceRecordId: readString(record?.uuid) ?? readString(record?.id),
      rawPayload: record,
    },
  ];
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
    sourcePackage: records[0] ? readSourcePackage(records[0]) : null,
    sourceRecordId: readString(records[0]?.uuid) ?? readString(records[0]?.id),
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
  const classifiedSleepMinutes = light + deep + rem;
  const unspecifiedSleepMinutes =
    (minutesByStage.asleep ?? 0) + (minutesByStage.asleepunspecified ?? 0) + (minutesByStage.sleeping ?? 0);
  const awake = (minutesByStage.awake ?? 0) + (minutesByStage.asleepawake ?? 0);
  const root = isRecord(payload) ? payload : {};
  return {
    source: 'apple_health',
    sourcePackage: sleepRecords[0] ? readSourcePackage(sleepRecords[0]) : null,
    sourceSleepId: readString(sleepRecords[0]?.parentId) ?? readString(sleepRecords[0]?.id),
    sourceRecordId: readString(sleepRecords[0]?.parentId) ?? readString(sleepRecords[0]?.id),
    date: readString(root.date) ?? readDateFromTimestamp(firstStart),
    timezone: readString(root.timezone) ?? (sleepRecords[0] ? readTimezone(sleepRecords[0]) : 'UTC'),
    startTime: firstStart,
    endTime: lastEnd,
    bedtimeStart: firstStart,
    bedtimeEnd: lastEnd,
    isNap: false,
    totalSleepMin: classifiedSleepMinutes || unspecifiedSleepMinutes || null,
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
    stageIntervals: mapSleepStageIntervals(sleepRecords),
    healthSamples: [],
    rawPayload: isRecord(payload) ? payload : {},
  };
}

export function mapAppleHealthRecoveryToCanonical(payload: unknown): AppleHealthRecoveryCanonical {
  const records = readDataRecords(payload);
  const firstTimestamp = normaliseTimestamp(records[0]?.startDate) ?? new Date(0).toISOString();
  const timezone = records[0] ? readTimezone(records[0]) : 'UTC';
  const restingHrRecord = latestRecord(records, 'restingheartrate');
  const hrvRecord = latestRecord(records, 'heartratevariabilitysdnn');
  const respiratoryRecord = latestRecord(records, 'respiratoryrate');
  const spo2Record = latestRecord(records, 'oxygensaturation');
  const bodyTemperatureRecord = latestRecord(records, 'bodytemperature') ?? latestRecord(records, 'wristtemperature');
  const heartRateRecoveryRecord = latestRecord(records, 'heartraterecovery');
  const restingHrBpm = restingHrRecord ? readNumber(restingHrRecord.value) : null;
  const hrvSdnnMs = hrvRecord ? readNumber(hrvRecord.value) : null;
  const respiratoryRateRpm = respiratoryRecord ? readNumber(respiratoryRecord.value) : null;
  const spo2AvgPct = spo2Record ? readNumber(spo2Record.value) : null;
  const bodyTemperatureC = bodyTemperatureRecord ? readNumber(bodyTemperatureRecord.value) : null;
  const heartRateRecoveryBpm = heartRateRecoveryRecord ? readNumber(heartRateRecoveryRecord.value) : null;
  return {
    source: 'apple_health',
    sourcePackage: records[0] ? readSourcePackage(records[0]) : null,
    sourceRecordId: readString(records[0]?.uuid) ?? readString(records[0]?.id),
    date: readDateFromTimestamp(firstTimestamp),
    timezone,
    timestamp: firstTimestamp,
    recoveryScore: null,
    readinessScore: null,
    sleepScore: null,
    strainScore: null,
    restingHrBpm,
    avgHrvMs: hrvSdnnMs,
    respiratoryRateRpm,
    spo2AvgPct,
    bodyTemperatureC,
    heartRateRecoveryBpm,
    healthSamples: [
      ...buildHealthSample('resting_heart_rate', restingHrBpm, 'bpm', restingHrRecord, firstTimestamp, timezone),
      ...buildHealthSample('hrv_sdnn', hrvSdnnMs, 'ms', hrvRecord, firstTimestamp, timezone),
      ...buildHealthSample('respiratory_rate', respiratoryRateRpm, 'rpm', respiratoryRecord, firstTimestamp, timezone),
      ...buildHealthSample('spo2', spo2AvgPct, '%', spo2Record, firstTimestamp, timezone),
      ...buildHealthSample('body_temperature', bodyTemperatureC, 'C', bodyTemperatureRecord, firstTimestamp, timezone),
      ...buildHealthSample(
        'heart_rate_recovery',
        heartRateRecoveryBpm,
        'bpm',
        heartRateRecoveryRecord,
        firstTimestamp,
        timezone,
      ),
    ],
    balance: null,
    stressState: null,
    rawPayload: isRecord(payload) ? payload : {},
  };
}
