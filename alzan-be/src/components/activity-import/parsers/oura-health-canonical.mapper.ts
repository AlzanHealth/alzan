import {
  OuraDailyActivityCanonical,
  OuraRecoveryCanonical,
  OuraSleepCanonical,
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

function extractDate(payload: JsonRecord, timestamp: string): string {
  return readString(payload.day) ?? readString(payload.date) ?? timestamp.slice(0, 10);
}

function extractTimezone(payload: JsonRecord): string {
  return readString(payload.timezone) ?? readString(payload.zoneId) ?? 'UTC';
}

function secondsToMinutes(value: number | null): number | null {
  if (value == null || !Number.isFinite(value) || value < 0) return null;
  return value / 60;
}

function readNestedNumber(record: JsonRecord, key: string, nestedKey: string): number | null {
  const section = record[key];
  if (!isRecord(section)) return null;
  return readNumber(section[nestedKey]);
}

function selectFirstRecord(payload: unknown, key: string): JsonRecord {
  if (!isRecord(payload)) return {};
  const data = payload[key];
  if (Array.isArray(data) && isRecord(data[0])) return data[0];
  if (Array.isArray(payload.data) && isRecord(payload.data[0])) return payload.data[0];
  return payload;
}

export function mapOuraDailyActivityToCanonical(payload: unknown): OuraDailyActivityCanonical {
  const data = selectFirstRecord(payload, 'daily_activity');
  const timestamp = normaliseTimestamp(data.timestamp) ?? normaliseTimestamp(data.day) ?? new Date(0).toISOString();
  const steps = readNumber(data.steps);
  const activeCalories = readNumber(data.active_calories);
  const totalCalories = readNumber(data.total_calories) ?? activeCalories;
  const distanceM = readNumber(data.equivalent_walking_distance) ?? readNumber(data.distance);
  const metersToTarget = readNumber(data.meters_to_target);

  return {
    source: 'oura',
    date: extractDate(data, timestamp),
    timezone: extractTimezone(data),
    totalSteps: steps != null ? Math.round(steps) : null,
    caloriesKcal: totalCalories,
    activeCaloriesKcal: activeCalories,
    distanceM,
    activeDistanceM: distanceM,
    stepGoal: null,
    goalAchieved: metersToTarget == null ? null : metersToTarget === 0,
    sedentaryMinutes: secondsToMinutes(readNumber(data.sedentary_time)),
    lightlyActiveMin: secondsToMinutes(readNumber(data.low_activity_time)),
    fairlyActiveMin: secondsToMinutes(readNumber(data.medium_activity_time)),
    veryActiveMin: secondsToMinutes(readNumber(data.high_activity_time)),
    intervals: [
      {
        startTime: timestamp,
        endTime: null,
        steps: steps != null ? Math.round(steps) : null,
        caloriesKcal: totalCalories,
        distanceM,
        rawPayload: data,
      },
    ],
    rawPayload: data,
  };
}

export function mapOuraSleepToCanonical(payload: unknown): OuraSleepCanonical {
  const data = selectFirstRecord(payload, 'sleep');
  const startTime =
    normaliseTimestamp(data.bedtime_start) ??
    normaliseTimestamp(data.start_datetime) ??
    normaliseTimestamp(data.startTime) ??
    new Date(0).toISOString();
  const endTime =
    normaliseTimestamp(data.bedtime_end) ??
    normaliseTimestamp(data.end_datetime) ??
    normaliseTimestamp(data.endTime) ??
    startTime;

  return {
    source: 'oura',
    sourceSleepId: readString(data.id),
    date: extractDate(data, startTime),
    timezone: extractTimezone(data),
    startTime,
    endTime,
    bedtimeStart: startTime,
    bedtimeEnd: endTime,
    isNap: readString(data.type) === 'rest',
    totalSleepMin: secondsToMinutes(readNumber(data.total_sleep_duration)),
    awakeMin: secondsToMinutes(readNumber(data.awake_time)),
    lightSleepMin: secondsToMinutes(readNumber(data.light_sleep_duration)),
    deepSleepMin: secondsToMinutes(readNumber(data.deep_sleep_duration)),
    remSleepMin: secondsToMinutes(readNumber(data.rem_sleep_duration)),
    sleepLatencyMin: secondsToMinutes(readNumber(data.latency)),
    wasoMin: secondsToMinutes(readNumber(data.awake_time)),
    afterWakeupMin: null,
    sleepScore: readNumber(data.efficiency) ?? readNestedNumber(data, 'readiness', 'score'),
    avgHeartRateBpm: readNumber(data.average_heart_rate),
    minHeartRateBpm: readNumber(data.lowest_heart_rate),
    avgHrvMs: readNumber(data.average_hrv),
    hrvRmssdMs: readNumber(data.average_hrv),
    avgRespiratoryRpm: readNumber(data.average_breath),
    avgSpo2Pct: readNestedNumber(data, 'spo2_percentage', 'average') ?? readNumber(data.average_spo2),
    rawPayload: data,
  };
}

export function mapOuraRecoveryToCanonical(payload: unknown): OuraRecoveryCanonical {
  const data = selectFirstRecord(payload, 'readiness');
  const timestamp = normaliseTimestamp(data.timestamp) ?? normaliseTimestamp(data.day) ?? new Date(0).toISOString();
  const contributors = isRecord(data.contributors) ? data.contributors : {};
  const dailyStress = isRecord(data.daily_stress) ? data.daily_stress : {};
  const readinessScore = readNumber(data.score) ?? readNumber(data.readiness_score);

  return {
    source: 'oura',
    date: extractDate(data, timestamp),
    timezone: extractTimezone(data),
    timestamp,
    recoveryScore: readinessScore,
    readinessScore,
    sleepScore: readNumber(data.sleep_score),
    strainScore: readNumber(data.activity_score),
    restingHrBpm: readNumber(contributors.resting_heart_rate),
    avgHrvMs: readNumber(contributors.hrv_balance) ?? readNumber(data.average_hrv),
    respiratoryRateRpm: readNumber(data.respiratory_rate),
    spo2AvgPct: readNestedNumber(data, 'spo2_percentage', 'average') ?? readNumber(data.spo2_average),
    balance: readNumber(data.temperature_deviation) ?? readNumber(data.temperature_trend_deviation),
    stressState: readNumber(dailyStress.stress_high) ?? readNumber(data.stress_high),
    rawPayload: data,
  };
}
