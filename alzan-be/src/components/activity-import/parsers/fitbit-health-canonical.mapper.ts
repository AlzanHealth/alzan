import {
  FitbitDailyActivityCanonical,
  FitbitRecoveryCanonical,
  FitbitSleepCanonical,
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
  if (typeof value === 'number') return value === 1 ? true : value === 0 ? false : null;
  return null;
}

function readDate(value: unknown): string {
  const text = readString(value);
  return text ? text.slice(0, 10) : new Date(0).toISOString().slice(0, 10);
}

function normaliseTimestamp(value: unknown): string | null {
  const text = readString(value);
  if (!text) return null;
  const timestamp = Date.parse(text);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
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

function readDistanceMeters(summary: JsonRecord): number | null {
  const direct = readNumber(summary.distance) ?? readNumber(summary.distanceMeters);
  if (direct != null) return direct > 1000 ? direct : direct * 1000;
  const distances = summary.distances;
  if (!Array.isArray(distances)) return null;
  const total = distances.find(
    distance => isRecord(distance) && readString(distance.activity)?.toLowerCase() === 'total',
  );
  return isRecord(total) ? (readNumber(total.distance) ?? 0) * 1000 : null;
}

function readSleepRecord(payload: JsonRecord): JsonRecord {
  if (Array.isArray(payload.sleep) && isRecord(payload.sleep[0])) return payload.sleep[0];
  return payload;
}

export function mapFitbitDailyActivityToCanonical(payload: JsonRecord): FitbitDailyActivityCanonical {
  const summary = isRecord(payload.summary) ? payload.summary : payload;
  const date = readDate(payload.date ?? payload.dateTime ?? summary.dateTime);
  const intervals = Array.isArray(payload.intervals)
    ? payload.intervals.filter(isRecord).map(interval => ({
        startTime: normaliseTimestamp(interval.startTime ?? interval.time) ?? `${date}T00:00:00.000Z`,
        endTime: normaliseTimestamp(interval.endTime),
        steps: readNumber(interval.steps),
        caloriesKcal: readNumber(interval.calories),
        distanceM: readDistanceMeters(interval),
        rawPayload: interval,
      }))
    : [];
  return {
    source: 'fitbit',
    date,
    timezone: readString(payload.timezone) ?? 'UTC',
    totalSteps: readNumber(summary.steps),
    activeSteps: null,
    walkingSteps: null,
    runningSteps: null,
    caloriesKcal: readNumber(summary.caloriesOut) ?? readNumber(summary.calories),
    activeCaloriesKcal: readNumber(summary.activityCalories) ?? readNumber(summary.activeCalories),
    distanceM: readDistanceMeters(summary),
    activeDistanceM: null,
    floorsClimbed: readNumber(summary.floors),
    stepGoal: readNestedNumber(payload, 'goals.steps'),
    goalAchieved: readBoolean(payload.goalAchieved),
    sedentaryMinutes: readNumber(summary.sedentaryMinutes),
    lightlyActiveMin: readNumber(summary.lightlyActiveMinutes),
    fairlyActiveMin: readNumber(summary.fairlyActiveMinutes),
    veryActiveMin: readNumber(summary.veryActiveMinutes),
    intervals,
    rawPayload: payload,
  };
}

export function mapFitbitSleepToCanonical(payload: JsonRecord): FitbitSleepCanonical {
  const sleep = readSleepRecord(payload);
  const startTime = normaliseTimestamp(sleep.startTime) ?? new Date(0).toISOString();
  const endTime = normaliseTimestamp(sleep.endTime) ?? startTime;
  const levels = isRecord(sleep.levels) && isRecord(sleep.levels.summary) ? sleep.levels.summary : {};
  return {
    source: 'fitbit',
    sourceSleepId:
      readString(sleep.logId) ??
      (readNumber(sleep.logId) != null ? String(Math.round(readNumber(sleep.logId) ?? 0)) : null),
    date: readDate(sleep.dateOfSleep ?? payload.date),
    timezone: readString(payload.timezone) ?? 'UTC',
    startTime,
    endTime,
    bedtimeStart: startTime,
    bedtimeEnd: endTime,
    isNap: readBoolean(sleep.isMainSleep) === false,
    totalSleepMin: readNumber(sleep.minutesAsleep) ?? readNumber(sleep.durationMinutes),
    awakeMin: readNumber(sleep.minutesAwake) ?? readNestedNumber(levels, 'wake.minutes'),
    lightSleepMin: readNestedNumber(levels, 'light.minutes'),
    deepSleepMin: readNestedNumber(levels, 'deep.minutes'),
    remSleepMin: readNestedNumber(levels, 'rem.minutes'),
    sleepLatencyMin: readNumber(sleep.minutesToFallAsleep),
    wasoMin: readNumber(sleep.minutesAfterWakeup),
    afterWakeupMin: readNumber(sleep.minutesAfterWakeup),
    sleepScore: readNumber(sleep.efficiency) ?? readNumber(sleep.sleepScore),
    avgHeartRateBpm: readNumber(sleep.averageHeartRate),
    minHeartRateBpm: readNumber(sleep.minHeartRate),
    maxHeartRateBpm: readNumber(sleep.maxHeartRate),
    restingHrBpm: readNumber(sleep.restingHeartRate),
    avgHrvMs: readNumber(sleep.averageHrv) ?? readNestedNumber(sleep, 'hrv.dailyRmssd'),
    hrvRmssdMs: readNestedNumber(sleep, 'hrv.dailyRmssd'),
    avgRespiratoryRpm: readNumber(sleep.breathingRate) ?? readNumber(sleep.respiratoryRate),
    avgSpo2Pct: readNumber(sleep.averageSpo2) ?? readNestedNumber(sleep, 'spo2.avg'),
    minSpo2Pct: readNestedNumber(sleep, 'spo2.min'),
    rawPayload: payload,
  };
}

export function mapFitbitRecoveryToCanonical(payload: JsonRecord): FitbitRecoveryCanonical {
  const date = readDate(payload.date ?? payload.dateTime);
  return {
    source: 'fitbit',
    date,
    timezone: readString(payload.timezone) ?? 'UTC',
    timestamp: normaliseTimestamp(payload.timestamp) ?? `${date}T00:00:00.000Z`,
    recoveryScore: readNumber(payload.recoveryScore),
    readinessScore: readNumber(payload.readinessScore),
    sleepScore: readNumber(payload.sleepScore),
    strainScore: null,
    bodyBatteryStart: null,
    bodyBatteryMin: null,
    bodyBatteryMax: null,
    bodyBatteryEnd: null,
    restingHrBpm: readNumber(payload.restingHeartRate) ?? readNestedNumber(payload, 'heartRate.restingHeartRate'),
    avgHrvMs: readNestedNumber(payload, 'hrv.dailyRmssd') ?? readNumber(payload.hrvRmssd),
    respiratoryRateRpm: readNumber(payload.breathingRate) ?? readNumber(payload.respiratoryRate),
    spo2AvgPct: readNestedNumber(payload, 'spo2.avg') ?? readNumber(payload.spo2Avg),
    balance: readNumber(payload.vo2Max) ?? readNumber(payload.cardioFitnessScore),
    stressState: readNestedNumber(payload, 'temperature.skinTemperature'),
    rawPayload: payload,
  };
}
