import { WhoopCycleCanonical, WhoopRecoveryCanonical, WhoopSleepCanonical } from './activity-import-canonical.types';

type JsonRecord = Record<string, unknown>;

const KILOJOULE_PER_KILOCALORIE = 4.184;

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

function readIdentifier(value: unknown): string | null {
  if (typeof value === 'string' && value.trim().length > 0) return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(Math.round(value));
  return null;
}

function normaliseTimestamp(value: unknown): string | null {
  const text = readString(value);
  if (!text) return null;
  const timestamp = Date.parse(text);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

function selectFirstRecord(payload: unknown, key: string): JsonRecord {
  if (!isRecord(payload)) return {};
  const keyedValue = payload[key];
  if (Array.isArray(keyedValue) && isRecord(keyedValue[0])) return keyedValue[0];
  if (isRecord(keyedValue)) return keyedValue;
  if (Array.isArray(payload.records) && isRecord(payload.records[0])) return payload.records[0];
  if (Array.isArray(payload.data) && isRecord(payload.data[0])) return payload.data[0];
  return payload;
}

function readDate(payload: JsonRecord, timestamp: string): string {
  return readString(payload.date) ?? readString(payload.day) ?? timestamp.slice(0, 10);
}

function readTimezone(payload: JsonRecord): string {
  return readString(payload.timezone_offset) ?? readString(payload.timezone) ?? 'UTC';
}

function millisecondsToMinutes(value: number | null): number | null {
  if (value == null || !Number.isFinite(value) || value < 0) return null;
  return value / 60000;
}

function readScore(payload: JsonRecord): JsonRecord {
  return isRecord(payload.score) ? payload.score : payload;
}

export function mapWhoopCycleToCanonical(payload: unknown): WhoopCycleCanonical {
  const cycle = selectFirstRecord(payload, 'cycles');
  const score = readScore(cycle);
  const startTime = normaliseTimestamp(cycle.start) ?? new Date(0).toISOString();
  const endTime = normaliseTimestamp(cycle.end);
  const kilojoule = readNumber(score.kilojoule);
  return {
    source: 'whoop',
    sourceCycleId: readIdentifier(cycle.id),
    date: readDate(cycle, startTime),
    timezone: readTimezone(cycle),
    startTime,
    endTime,
    scoreState: readString(cycle.score_state),
    strainScore: readNumber(score.strain),
    kilojoule,
    caloriesKcal: kilojoule == null ? null : kilojoule / KILOJOULE_PER_KILOCALORIE,
    avgHeartRateBpm: readNumber(score.average_heart_rate),
    maxHeartRateBpm: readNumber(score.max_heart_rate),
    rawPayload: cycle,
  };
}

export function mapWhoopSleepToCanonical(payload: unknown): WhoopSleepCanonical {
  const sleep = selectFirstRecord(payload, 'sleeps');
  const stageSummary = isRecord(sleep.stage_summary) ? sleep.stage_summary : {};
  const sleepNeeded = isRecord(sleep.sleep_needed) ? sleep.sleep_needed : {};
  const startTime = normaliseTimestamp(sleep.start) ?? new Date(0).toISOString();
  const endTime = normaliseTimestamp(sleep.end) ?? startTime;
  return {
    source: 'whoop',
    sourceSleepId: readIdentifier(sleep.id),
    date: readDate(sleep, startTime),
    timezone: readTimezone(sleep),
    startTime,
    endTime,
    bedtimeStart: startTime,
    bedtimeEnd: endTime,
    isNap: sleep.nap === true,
    totalSleepMin: millisecondsToMinutes(
      (readNumber(stageSummary.total_light_sleep_time_milli) ?? 0) +
        (readNumber(stageSummary.total_slow_wave_sleep_time_milli) ?? 0) +
        (readNumber(stageSummary.total_rem_sleep_time_milli) ?? 0),
    ),
    awakeMin: millisecondsToMinutes(readNumber(stageSummary.total_awake_time_milli)),
    lightSleepMin: millisecondsToMinutes(readNumber(stageSummary.total_light_sleep_time_milli)),
    deepSleepMin: millisecondsToMinutes(readNumber(stageSummary.total_slow_wave_sleep_time_milli)),
    remSleepMin: millisecondsToMinutes(readNumber(stageSummary.total_rem_sleep_time_milli)),
    sleepLatencyMin: null,
    wasoMin: millisecondsToMinutes(readNumber(stageSummary.total_awake_time_milli)),
    afterWakeupMin: null,
    sleepScore: readNumber(sleep.sleep_performance_percentage),
    avgHeartRateBpm: null,
    minHeartRateBpm: null,
    avgHrvMs: null,
    avgRespiratoryRpm: readNumber(sleep.respiratory_rate),
    avgSpo2Pct: null,
    rawPayload: {
      ...sleep,
      sleepNeeded,
    },
  };
}

export function mapWhoopRecoveryToCanonical(payload: unknown): WhoopRecoveryCanonical {
  const recovery = selectFirstRecord(payload, 'recoveries');
  const score = readScore(recovery);
  const timestamp =
    normaliseTimestamp(recovery.created_at) ??
    normaliseTimestamp(recovery.updated_at) ??
    normaliseTimestamp(recovery.date) ??
    new Date(0).toISOString();
  return {
    source: 'whoop',
    date: readDate(recovery, timestamp),
    timezone: readTimezone(recovery),
    timestamp,
    recoveryScore: readNumber(score.recovery_score),
    readinessScore: readNumber(score.recovery_score),
    sleepScore: null,
    strainScore: null,
    restingHrBpm: readNumber(score.resting_heart_rate),
    avgHrvMs: readNumber(score.hrv_rmssd_milli),
    hrvRmssdMs: readNumber(score.hrv_rmssd_milli),
    respiratoryRateRpm: null,
    spo2AvgPct: readNumber(score.spo2_percentage),
    balance: readNumber(score.skin_temp_celsius),
    stressState: null,
    rawPayload: recovery,
  };
}
