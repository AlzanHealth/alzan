import {
  CorosDailyActivityCanonical,
  CorosRecoveryCanonical,
  CorosSleepCanonical,
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

function readDate(value: unknown): string {
  const text = readString(value);
  return text ? text.slice(0, 10) : new Date(0).toISOString().slice(0, 10);
}

function readNestedNumber(record: JsonRecord, key: string): number | null {
  const parts = key.split('.');
  let current: unknown = record;
  for (const part of parts) {
    if (!isRecord(current)) return null;
    current = current[part];
  }
  return readNumber(current);
}

function readSleepRecord(payload: JsonRecord): JsonRecord {
  if (isRecord(payload.sleep)) return payload.sleep;
  if (Array.isArray(payload.sleep) && isRecord(payload.sleep[0])) return payload.sleep[0];
  return payload;
}

export function mapCorosDailyActivityToCanonical(payload: JsonRecord): CorosDailyActivityCanonical {
  const date = readDate(payload.date ?? payload.day ?? payload.timestamp);
  return {
    source: 'coros',
    date,
    timezone: readString(payload.timezone) ?? 'UTC',
    totalSteps: readNumber(payload.steps) ?? readNumber(payload.totalSteps),
    activeSteps: readNumber(payload.activeSteps),
    walkingSteps: readNumber(payload.walkingSteps),
    runningSteps: readNumber(payload.runningSteps),
    caloriesKcal: readNumber(payload.calories) ?? readNumber(payload.caloriesKcal),
    activeCaloriesKcal: readNumber(payload.activeCalories),
    distanceM: readNumber(payload.distanceM) ?? readNumber(payload.distance),
    activeDistanceM: readNumber(payload.activeDistanceM),
    floorsClimbed: readNumber(payload.floors) ?? readNumber(payload.elevationFloors),
    sedentaryMinutes: readNumber(payload.sedentaryMinutes),
    lightlyActiveMin: readNumber(payload.lightlyActiveMinutes),
    fairlyActiveMin: readNumber(payload.fairlyActiveMinutes),
    veryActiveMin: readNumber(payload.veryActiveMinutes),
    intervals: Array.isArray(payload.intervals)
      ? payload.intervals.filter(isRecord).map(interval => ({
          startTime: normaliseTimestamp(interval.startTime ?? interval.time) ?? `${date}T00:00:00.000Z`,
          endTime: normaliseTimestamp(interval.endTime),
          steps: readNumber(interval.steps),
          caloriesKcal: readNumber(interval.calories),
          distanceM: readNumber(interval.distanceM) ?? readNumber(interval.distance),
          rawPayload: interval,
        }))
      : [],
    rawPayload: payload,
  };
}

export function mapCorosSleepToCanonical(payload: JsonRecord): CorosSleepCanonical {
  const sleep = readSleepRecord(payload);
  const startTime = normaliseTimestamp(sleep.startTime ?? sleep.bedtimeStart) ?? new Date(0).toISOString();
  const endTime = normaliseTimestamp(sleep.endTime ?? sleep.bedtimeEnd) ?? startTime;
  return {
    source: 'coros',
    sourceSleepId: readString(sleep.id) ?? readString(sleep.sleepId),
    date: readDate(sleep.date ?? payload.date ?? startTime),
    timezone: readString(payload.timezone) ?? readString(sleep.timezone) ?? 'UTC',
    startTime,
    endTime,
    bedtimeStart: normaliseTimestamp(sleep.bedtimeStart) ?? startTime,
    bedtimeEnd: normaliseTimestamp(sleep.bedtimeEnd) ?? endTime,
    isNap: Boolean(sleep.isNap),
    totalSleepMin: readNumber(sleep.totalSleepMin) ?? readNumber(sleep.total_sleep_minutes),
    awakeMin: readNumber(sleep.awakeMin) ?? readNestedNumber(sleep, 'stages.awake'),
    lightSleepMin: readNumber(sleep.lightSleepMin) ?? readNestedNumber(sleep, 'stages.light'),
    deepSleepMin: readNumber(sleep.deepSleepMin) ?? readNestedNumber(sleep, 'stages.deep'),
    remSleepMin: readNumber(sleep.remSleepMin) ?? readNestedNumber(sleep, 'stages.rem'),
    sleepLatencyMin: readNumber(sleep.sleepLatencyMin),
    wasoMin: readNumber(sleep.wasoMin),
    afterWakeupMin: readNumber(sleep.afterWakeupMin),
    sleepScore: readNumber(sleep.sleepScore) ?? readNumber(sleep.score),
    avgHeartRateBpm: readNumber(sleep.avgHeartRate) ?? readNumber(sleep.averageHeartRate),
    minHeartRateBpm: readNumber(sleep.minHeartRate),
    maxHeartRateBpm: readNumber(sleep.maxHeartRate),
    restingHrBpm: readNumber(sleep.restingHeartRate),
    avgHrvMs: readNumber(sleep.avgHrv) ?? readNumber(sleep.hrv),
    hrvRmssdMs: readNumber(sleep.hrvRmssd),
    avgRespiratoryRpm: readNumber(sleep.respiratoryRate),
    avgSpo2Pct: readNumber(sleep.spo2Avg),
    minSpo2Pct: readNumber(sleep.spo2Min),
    rawPayload: payload,
  };
}

export function mapCorosRecoveryToCanonical(payload: JsonRecord): CorosRecoveryCanonical {
  const date = readDate(payload.date ?? payload.day ?? payload.timestamp);
  return {
    source: 'coros',
    date,
    timezone: readString(payload.timezone) ?? 'UTC',
    timestamp: normaliseTimestamp(payload.timestamp) ?? `${date}T00:00:00.000Z`,
    recoveryScore: readNumber(payload.recoveryScore) ?? readNumber(payload.readinessScore),
    readinessScore: readNumber(payload.readinessScore),
    sleepScore: readNumber(payload.sleepScore),
    strainScore: readNumber(payload.trainingLoad) ?? readNumber(payload.training_load),
    restingHrBpm: readNumber(payload.restingHeartRate),
    avgHrvMs: readNumber(payload.hrv) ?? readNumber(payload.avgHrv),
    hrvRmssdMs: readNumber(payload.hrvRmssd),
    respiratoryRateRpm: readNumber(payload.respiratoryRate),
    spo2AvgPct: readNumber(payload.spo2Avg),
    balance: readNumber(payload.recoveryBalance) ?? readNumber(payload.trainingReadiness),
    stressState: readNumber(payload.stressScore),
    rawPayload: payload,
  };
}
