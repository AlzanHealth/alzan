import {
  CorosDailyActivityCanonical,
  CorosRecoveryCanonical,
  CorosSleepCanonical,
} from './activity-import-canonical.types';

type JsonRecord = Record<string, unknown>;

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
  const numeric =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && /^\d+(?:\.\d+)?$/.test(value.trim())
        ? Number(value)
        : null;
  if (numeric != null && numeric > 0) {
    const milliseconds = numeric < 100_000_000_000 ? numeric * 1000 : numeric;
    const timestamp = new Date(milliseconds);
    return Number.isFinite(timestamp.getTime()) ? timestamp.toISOString() : null;
  }
  const text = readString(value);
  if (!text) return null;
  const normalizedText = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(text) ? `${text.replace(' ', 'T')}Z` : text;
  const timestamp = Date.parse(normalizedText);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

function readDate(value: unknown): string {
  const numeric = readNumber(value);
  if (numeric != null) {
    const compact = String(Math.round(numeric));
    if (/^\d{8}$/.test(compact)) return `${compact.slice(0, 4)}-${compact.slice(4, 6)}-${compact.slice(6, 8)}`;
  }
  const text = readString(value);
  return text ? text.slice(0, 10) : new Date(0).toISOString().slice(0, 10);
}

export function mapCorosDailyActivityToCanonical(payload: JsonRecord): CorosDailyActivityCanonical {
  const date = readDate(payload.happenDay);
  return {
    source: 'coros',
    date,
    timezone: 'COROS_LOCAL',
    totalSteps: readNumber(payload.step),
    activeSteps: null,
    walkingSteps: null,
    runningSteps: null,
    caloriesKcal: readNumber(payload.calorie) == null ? null : (readNumber(payload.calorie) as number) / 1000,
    activeCaloriesKcal: null,
    distanceM: null,
    activeDistanceM: null,
    floorsClimbed: null,
    sedentaryMinutes: null,
    lightlyActiveMin: null,
    fairlyActiveMin: null,
    veryActiveMin: null,
    intervals: [],
    rawPayload: payload,
  };
}

export function mapCorosSleepToCanonical(payload: JsonRecord): CorosSleepCanonical {
  const startTime = normaliseTimestamp(payload.sleepStartTime) ?? new Date(0).toISOString();
  const endTime = normaliseTimestamp(payload.sleepEndTime) ?? startTime;
  const durationMinutes = Math.max(0, (Date.parse(endTime) - Date.parse(startTime)) / 60000);
  return {
    source: 'coros',
    sourceSleepId: null,
    date: readDate(payload.happenDay),
    timezone: 'COROS_LOCAL',
    startTime,
    endTime,
    bedtimeStart: startTime,
    bedtimeEnd: endTime,
    isNap: false,
    totalSleepMin: durationMinutes,
    awakeMin: null,
    lightSleepMin: null,
    deepSleepMin: null,
    remSleepMin: null,
    sleepLatencyMin: null,
    wasoMin: null,
    afterWakeupMin: null,
    sleepScore: null,
    avgHeartRateBpm: readNumber(payload.sleepAvgHr),
    minHeartRateBpm: null,
    maxHeartRateBpm: null,
    restingHrBpm: null,
    avgHrvMs: readNumber(payload.ppgHrv),
    hrvRmssdMs: null,
    avgRespiratoryRpm: null,
    avgSpo2Pct: null,
    minSpo2Pct: null,
    rawPayload: payload,
  };
}

export function mapCorosRecoveryToCanonical(payload: JsonRecord): CorosRecoveryCanonical {
  const date = readDate(payload.happenDay);
  return {
    source: 'coros',
    date,
    timezone: 'COROS_LOCAL',
    timestamp: `${date}T00:00:00.000Z`,
    recoveryScore: null,
    readinessScore: null,
    sleepScore: null,
    strainScore: null,
    restingHrBpm: readNumber(payload.rhr),
    avgHrvMs: readNumber(payload.ppgHrv),
    hrvRmssdMs: null,
    respiratoryRateRpm: null,
    spo2AvgPct: null,
    balance: null,
    stressState: null,
    rawPayload: payload,
  };
}
