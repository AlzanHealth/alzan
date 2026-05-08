import {
  GarminDailyActivityCanonical,
  GarminRecoveryCanonical,
  GarminSleepCanonical,
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

function unixSecondsToIso(value: number | null): string | null {
  if (value == null || !Number.isFinite(value) || value <= 0) return null;
  return new Date(value * 1000).toISOString();
}

function normaliseTimestamp(value: unknown): string | null {
  const unixTimestamp = readNumber(value);
  if (unixTimestamp != null && unixTimestamp > 1000000000) return unixSecondsToIso(unixTimestamp);
  const text = readString(value);
  if (!text) return null;
  const timestamp = Date.parse(text);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

function extractDate(payload: JsonRecord, timestamp: string): string {
  return readString(payload.CalendarDate) ?? readString(payload.calendarDate) ?? timestamp.slice(0, 10);
}

function extractTimezone(payload: JsonRecord): string {
  return readString(payload.Timezone) ?? readString(payload.timezone) ?? 'UTC';
}

function minutesFromSeconds(value: number | null): number | null {
  if (value == null || !Number.isFinite(value) || value < 0) return null;
  return value / 60;
}

export function mapGarminDailyActivityToCanonical(payload: unknown): GarminDailyActivityCanonical {
  const data = isRecord(payload) ? payload : {};
  const startTime =
    normaliseTimestamp(data.StartTimeInSeconds) ??
    normaliseTimestamp(data.startTimeInSeconds) ??
    normaliseTimestamp(data.StartTime) ??
    new Date(0).toISOString();
  const endTime =
    normaliseTimestamp(data.EndTimeInSeconds) ??
    normaliseTimestamp(data.endTimeInSeconds) ??
    normaliseTimestamp(data.EndTime);
  const totalSteps = readNumber(data.Steps) ?? readNumber(data.steps) ?? readNumber(data.totalSteps);
  const calories = readNumber(data.ActiveKilocalories) ?? readNumber(data.Calories) ?? readNumber(data.calories);

  return {
    source: 'garmin',
    date: extractDate(data, startTime),
    timezone: extractTimezone(data),
    totalSteps: totalSteps != null ? Math.round(totalSteps) : null,
    activeSteps: readNumber(data.ActiveSteps),
    walkingSteps: readNumber(data.WalkingSteps),
    runningSteps: readNumber(data.RunningSteps),
    caloriesKcal: calories,
    activeCaloriesKcal: readNumber(data.ActiveKilocalories),
    distanceM: readNumber(data.DistanceInMeters) ?? readNumber(data.distanceInMeters),
    activeDistanceM: readNumber(data.ActiveDistanceInMeters),
    floorsClimbed: readNumber(data.FloorsClimbed),
    stepGoal: readNumber(data.StepGoal),
    goalAchieved: readBoolean(data.GoalAchieved),
    sedentaryMinutes: readNumber(data.SedentaryMinutes),
    lightlyActiveMin: readNumber(data.LightlyActiveMinutes),
    fairlyActiveMin: readNumber(data.FairlyActiveMinutes),
    veryActiveMin: readNumber(data.VeryActiveMinutes),
    intervals: [
      {
        startTime,
        endTime,
        steps: totalSteps != null ? Math.round(totalSteps) : null,
        caloriesKcal: calories,
        distanceM: readNumber(data.DistanceInMeters) ?? readNumber(data.distanceInMeters),
        rawPayload: data,
      },
    ],
    rawPayload: data,
  };
}

export function mapGarminSleepToCanonical(payload: unknown): GarminSleepCanonical {
  const data = isRecord(payload) ? payload : {};
  const startTime =
    normaliseTimestamp(data.SleepStartTimestampGMT) ??
    normaliseTimestamp(data.StartTimeInSeconds) ??
    normaliseTimestamp(data.startTimeInSeconds) ??
    new Date(0).toISOString();
  const endTime =
    normaliseTimestamp(data.SleepEndTimestampGMT) ??
    normaliseTimestamp(data.EndTimeInSeconds) ??
    normaliseTimestamp(data.endTimeInSeconds) ??
    startTime;

  return {
    source: 'garmin',
    sourceSleepId: readString(data.SleepSummaryId) ?? readString(data.summaryId) ?? readString(data.sleepId),
    date: extractDate(data, startTime),
    timezone: extractTimezone(data),
    startTime,
    endTime,
    bedtimeStart: normaliseTimestamp(data.BedtimeStart) ?? startTime,
    bedtimeEnd: normaliseTimestamp(data.BedtimeEnd) ?? endTime,
    isNap: readBoolean(data.IsNap) ?? false,
    totalSleepMin:
      readNumber(data.TotalSleepDurationInSeconds) != null
        ? minutesFromSeconds(readNumber(data.TotalSleepDurationInSeconds))
        : readNumber(data.TotalSleepInMinutes),
    awakeMin:
      readNumber(data.AwakeDurationInSeconds) != null
        ? minutesFromSeconds(readNumber(data.AwakeDurationInSeconds))
        : readNumber(data.AwakeInMinutes),
    lightSleepMin:
      readNumber(data.LightSleepDurationInSeconds) != null
        ? minutesFromSeconds(readNumber(data.LightSleepDurationInSeconds))
        : readNumber(data.LightSleepInMinutes),
    deepSleepMin:
      readNumber(data.DeepSleepDurationInSeconds) != null
        ? minutesFromSeconds(readNumber(data.DeepSleepDurationInSeconds))
        : readNumber(data.DeepSleepInMinutes),
    remSleepMin:
      readNumber(data.RemSleepInSeconds) != null
        ? minutesFromSeconds(readNumber(data.RemSleepInSeconds))
        : readNumber(data.RemSleepInMinutes),
    sleepLatencyMin: minutesFromSeconds(readNumber(data.SleepLatencyInSeconds)),
    wasoMin: minutesFromSeconds(readNumber(data.WakeAfterSleepOnsetInSeconds)),
    afterWakeupMin: minutesFromSeconds(readNumber(data.AfterWakeupInSeconds)),
    sleepScore: readNumber(data.SleepScore) ?? readNumber(data.OverallSleepScore),
    avgHeartRateBpm: readNumber(data.AverageHeartRateInBeatsPerMinute),
    minHeartRateBpm: readNumber(data.LowestHeartRateInBeatsPerMinute),
    maxHeartRateBpm: readNumber(data.MaxHeartRateInBeatsPerMinute),
    restingHrBpm: readNumber(data.RestingHeartRateInBeatsPerMinute),
    avgHrvMs: readNumber(data.AvgHrv) ?? readNumber(data.AvgHRV),
    hrvRmssdMs: readNumber(data.HrvRmssd),
    avgRespiratoryRpm: readNumber(data.AverageRespiration),
    avgSpo2Pct: readNumber(data.AverageSpO2) ?? readNumber(data.AvgSpo2),
    minSpo2Pct: readNumber(data.LowestSpO2),
    rawPayload: data,
  };
}

export function mapGarminRecoveryToCanonical(payload: unknown): GarminRecoveryCanonical {
  const data = isRecord(payload) ? payload : {};
  const timestamp =
    normaliseTimestamp(data.StartTimeInSeconds) ??
    normaliseTimestamp(data.SummaryTimeInSeconds) ??
    normaliseTimestamp(data.timestamp) ??
    new Date(0).toISOString();

  return {
    source: 'garmin',
    date: extractDate(data, timestamp),
    timezone: extractTimezone(data),
    timestamp,
    recoveryScore: readNumber(data.RecoveryScore),
    readinessScore: readNumber(data.ReadinessScore),
    sleepScore: readNumber(data.SleepScore),
    strainScore: readNumber(data.StressScore) ?? readNumber(data.StressLevel),
    bodyBatteryStart: readNumber(data.BodyBatteryStart),
    bodyBatteryMin: readNumber(data.BodyBatteryMin),
    bodyBatteryMax: readNumber(data.BodyBatteryMax),
    bodyBatteryEnd: readNumber(data.BodyBatteryEnd),
    restingHrBpm: readNumber(data.RestingHeartRateInBeatsPerMinute),
    avgHrvMs: readNumber(data.AvgHrv) ?? readNumber(data.AvgHRV),
    respiratoryRateRpm: readNumber(data.AverageRespiration),
    spo2AvgPct: readNumber(data.AverageSpO2) ?? readNumber(data.AvgSpo2),
    balance: readNumber(data.BodyBatteryEnd) ?? readNumber(data.BodyBattery),
    stressState: readNumber(data.StressScore) ?? readNumber(data.StressLevel),
    rawPayload: data,
  };
}
