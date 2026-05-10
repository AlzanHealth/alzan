import {
  PolarDailyActivityCanonical,
  PolarRecoveryCanonical,
  PolarSleepCanonical,
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

function extractDate(payload: JsonRecord, timestamp: string): string {
  return readString(payload.date) ?? readString(payload.calendarDate) ?? timestamp.slice(0, 10);
}

function extractTimezone(payload: JsonRecord): string {
  return readString(payload.timezone) ?? readString(payload.zoneId) ?? 'UTC';
}

function minutesFromMillis(value: number | null): number | null {
  if (value == null || !Number.isFinite(value) || value < 0) return null;
  return value / 60000;
}

function readMinutes(payload: JsonRecord, ...keys: string[]): number | null {
  for (const key of keys) {
    const value = readNumber(payload[key]);
    if (value != null) return value > 10000 ? value / 60000 : value;
  }
  return null;
}

export function mapPolarDailyActivityToCanonical(payload: unknown): PolarDailyActivityCanonical {
  const data = isRecord(payload) ? payload : {};
  const startTime =
    normaliseTimestamp(data.startTime) ??
    normaliseTimestamp(data.from) ??
    normaliseTimestamp(data.date) ??
    new Date(0).toISOString();
  const endTime = normaliseTimestamp(data.endTime) ?? normaliseTimestamp(data.to);
  const steps = readNumber(data.steps) ?? readNumber(data.totalSteps) ?? readNumber(data.stepCount);
  const calories = readNumber(data.calories) ?? readNumber(data.caloriesKcal) ?? readNumber(data.activeCalories);
  const distance = readNumber(data.distanceMeters) ?? readNumber(data.distance) ?? readNumber(data.distanceM);

  return {
    source: 'polar',
    date: extractDate(data, startTime),
    timezone: extractTimezone(data),
    totalSteps: steps != null ? Math.round(steps) : null,
    activeSteps: readNumber(data.activeSteps),
    walkingSteps: readNumber(data.walkingSteps),
    runningSteps: readNumber(data.runningSteps),
    caloriesKcal: calories,
    activeCaloriesKcal: readNumber(data.activeCalories),
    distanceM: distance,
    activeDistanceM: readNumber(data.activeDistanceMeters),
    floorsClimbed: readNumber(data.floorsClimbed),
    stepGoal: readNumber(data.stepGoal),
    goalAchieved: readBoolean(data.goalAchieved),
    sedentaryMinutes: readNumber(data.sedentaryMinutes),
    lightlyActiveMin: readNumber(data.lightlyActiveMinutes),
    fairlyActiveMin: readNumber(data.fairlyActiveMinutes),
    veryActiveMin: readNumber(data.veryActiveMinutes),
    intervals: [
      {
        startTime,
        endTime,
        steps: steps != null ? Math.round(steps) : null,
        caloriesKcal: calories,
        distanceM: distance,
        rawPayload: data,
      },
    ],
    rawPayload: data,
  };
}

export function mapPolarSleepToCanonical(payload: unknown): PolarSleepCanonical {
  const data = isRecord(payload) ? payload : {};
  const startTime =
    normaliseTimestamp(data.sleepStartTime) ??
    normaliseTimestamp(data.bedtimeStart) ??
    normaliseTimestamp(data.startTime) ??
    new Date(0).toISOString();
  const endTime =
    normaliseTimestamp(data.sleepEndTime) ??
    normaliseTimestamp(data.bedtimeEnd) ??
    normaliseTimestamp(data.endTime) ??
    startTime;

  return {
    source: 'polar',
    sourceSleepId: readString(data.id) ?? readString(data.sleepId),
    date: extractDate(data, startTime),
    timezone: extractTimezone(data),
    startTime,
    endTime,
    bedtimeStart: normaliseTimestamp(data.bedtimeStart) ?? startTime,
    bedtimeEnd: normaliseTimestamp(data.bedtimeEnd) ?? endTime,
    isNap: readBoolean(data.isNap) ?? false,
    totalSleepMin:
      readMinutes(data, 'totalSleep', 'totalSleepMin', 'sleepDuration') ??
      minutesFromMillis(readNumber(data.totalSleepMillis)),
    awakeMin: readMinutes(data, 'awakeTime', 'awakeMin', 'awakeDuration'),
    lightSleepMin: readMinutes(data, 'lightSleep', 'lightSleepMin', 'lightSleepDuration'),
    deepSleepMin: readMinutes(data, 'deepSleep', 'deepSleepMin', 'deepSleepDuration'),
    remSleepMin: readMinutes(data, 'remSleep', 'remSleepMin', 'remSleepDuration'),
    sleepLatencyMin: readMinutes(data, 'sleepLatency', 'sleepLatencyMin'),
    wasoMin: readMinutes(data, 'waso', 'wasoMin', 'wakeAfterSleepOnset'),
    afterWakeupMin: readMinutes(data, 'afterWakeup', 'afterWakeupMin'),
    sleepScore: readNumber(data.sleepScore) ?? readNumber(data.sleepScoreValue),
    avgHeartRateBpm: readNumber(data.averageHeartRate) ?? readNumber(data.avgHeartRate),
    minHeartRateBpm: readNumber(data.minimumHeartRate) ?? readNumber(data.minHeartRate),
    maxHeartRateBpm: readNumber(data.maximumHeartRate) ?? readNumber(data.maxHeartRate),
    restingHrBpm: readNumber(data.restingHeartRate),
    avgHrvMs: readNumber(data.averageHrv) ?? readNumber(data.avgHrv) ?? readNumber(data.hrvAvg),
    hrvRmssdMs: readNumber(data.hrvRmssd),
    avgRespiratoryRpm: readNumber(data.averageRespiration) ?? readNumber(data.breathingRate),
    avgSpo2Pct: readNumber(data.averageSpo2) ?? readNumber(data.spo2Avg),
    minSpo2Pct: readNumber(data.minimumSpo2) ?? readNumber(data.spo2Min),
    rawPayload: data,
  };
}

export function mapPolarRecoveryToCanonical(payload: unknown): PolarRecoveryCanonical {
  const data = isRecord(payload) ? payload : {};
  const timestamp =
    normaliseTimestamp(data.timestamp) ??
    normaliseTimestamp(data.measuredAt) ??
    normaliseTimestamp(data.date) ??
    new Date(0).toISOString();
  const recoveryScore =
    readNumber(data.nightlyRechargeStatus) ?? readNumber(data.recoveryScore) ?? readNumber(data.readinessScore);

  return {
    source: 'polar',
    date: extractDate(data, timestamp),
    timezone: extractTimezone(data),
    timestamp,
    recoveryScore,
    readinessScore: readNumber(data.readinessScore),
    sleepScore: readNumber(data.sleepScore),
    strainScore: readNumber(data.trainingLoad) ?? readNumber(data.cardioLoad),
    restingHrBpm: readNumber(data.restingHeartRate),
    avgHrvMs: readNumber(data.hrvAvg) ?? readNumber(data.averageHrv),
    respiratoryRateRpm: readNumber(data.breathingRate) ?? readNumber(data.respiratoryRate),
    spo2AvgPct: readNumber(data.averageSpo2) ?? readNumber(data.spo2Avg),
    balance: readNumber(data.ansCharge) ?? recoveryScore,
    stressState: readNumber(data.trainingLoad) ?? readNumber(data.cardioLoad),
    rawPayload: data,
  };
}
