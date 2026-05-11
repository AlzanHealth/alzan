import {
  UltrahumanDailyActivityCanonical,
  UltrahumanMetabolicCanonical,
  UltrahumanRecoveryCanonical,
  UltrahumanSleepCanonical,
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
  if (typeof value === 'number' && Number.isFinite(value)) {
    const timestamp = value > 100000000000 ? value : value * 1000;
    return new Date(timestamp).toISOString();
  }
  const text = readString(value);
  if (!text) return null;
  const timestamp = Date.parse(text);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

function readDate(payload: JsonRecord, fallbackTimestamp?: string | null): string {
  return (
    readString(payload.ultrahuman_date) ??
    readString(payload.date) ??
    readString(payload.day) ??
    fallbackTimestamp?.slice(0, 10) ??
    new Date(0).toISOString().slice(0, 10)
  );
}

function extractTimezone(payload: JsonRecord): string {
  return readString(payload.timezone) ?? readString(payload.zoneId) ?? 'UTC';
}

function readMetricValue(value: unknown): number | null {
  if (!isRecord(value)) return readNumber(value);
  return readNumber(value.value) ?? readNumber(value.average) ?? readNumber(value.score);
}

function readNestedMetric(record: JsonRecord, key: string): number | null {
  return readMetricValue(record[key]);
}

function indexMetricEnvelope(payload: JsonRecord): JsonRecord {
  const metricData = isRecord(payload.data) && Array.isArray(payload.data.metric_data) ? payload.data.metric_data : [];
  return metricData.filter(isRecord).reduce<JsonRecord>((indexed, metric) => {
    const type = readString(metric.type);
    if (!type) return indexed;
    indexed[type] = isRecord(metric.object) ? metric.object : metric;
    return indexed;
  }, {});
}

function selectMetricRecord(payload: unknown, metricType: string): JsonRecord {
  if (!isRecord(payload)) return {};
  const metrics = indexMetricEnvelope(payload);
  const metric = metrics[metricType];
  if (isRecord(metric)) return metric;
  if (readString(payload.type) === metricType && isRecord(payload.object)) return payload.object;
  return payload;
}

function secondsToMinutes(value: number | null): number | null {
  if (value == null || !Number.isFinite(value) || value < 0) return null;
  return value / 60;
}

function readSleepStageSeconds(stages: unknown, stageType: string): number | null {
  if (!Array.isArray(stages)) return null;
  const stage = stages
    .filter(isRecord)
    .find(candidate => readString(candidate.type)?.toLowerCase() === stageType.toLowerCase());
  return stage
    ? (readNumber(stage.stage_time) ?? readNumber(stage.duration) ?? readNumber(stage.duration_seconds))
    : null;
}

function readQuickMetric(metrics: unknown, metricType: string): number | null {
  if (!Array.isArray(metrics)) return null;
  const metric = metrics
    .filter(isRecord)
    .find(candidate => readString(candidate.type)?.toLowerCase() === metricType.toLowerCase());
  return metric ? readMetricValue(metric) : null;
}

function resolveMovement(payload: JsonRecord): JsonRecord {
  return isRecord(payload.movement) ? payload.movement : payload;
}

export function mapUltrahumanDailyActivityToCanonical(payload: unknown): UltrahumanDailyActivityCanonical {
  const root = isRecord(payload) ? payload : {};
  const metrics = indexMetricEnvelope(root);
  const movement = resolveMovement(root);
  const date = readDate(root);
  const steps = readNumber(movement.steps) ?? readNestedMetric(metrics, 'steps');
  const activeCalories =
    readNumber(movement.active_kcal) ?? readNumber(movement.activeCalories) ?? readNestedMetric(metrics, 'active_kcal');
  const calories = activeCalories ?? readNumber(movement.calories) ?? readNestedMetric(metrics, 'calories');
  const distanceM =
    readNumber(movement.distance_m) ??
    readNumber(movement.distanceMeters) ??
    readNumber(movement.distance) ??
    readNestedMetric(metrics, 'distance');

  return {
    source: 'ultrahuman',
    date,
    timezone: extractTimezone(root),
    totalSteps: steps != null ? Math.round(steps) : null,
    caloriesKcal: calories,
    activeCaloriesKcal: activeCalories,
    distanceM,
    activeDistanceM: distanceM,
    intervals: [
      {
        startTime: normaliseTimestamp(root.timestamp) ?? `${date}T00:00:00.000Z`,
        endTime: null,
        steps: steps != null ? Math.round(steps) : null,
        caloriesKcal: calories,
        distanceM,
        rawPayload: movement,
      },
    ],
    rawPayload: root,
  };
}

export function mapUltrahumanSleepToCanonical(payload: unknown): UltrahumanSleepCanonical {
  const sleep = selectMetricRecord(payload, 'Sleep');
  const startTime =
    normaliseTimestamp(sleep.bedtime_start) ?? normaliseTimestamp(sleep.startTime) ?? new Date(0).toISOString();
  const endTime = normaliseTimestamp(sleep.bedtime_end) ?? normaliseTimestamp(sleep.endTime) ?? startTime;
  const deepSleepMin = secondsToMinutes(readSleepStageSeconds(sleep.sleep_stages, 'deep_sleep'));
  const lightSleepMin = secondsToMinutes(readSleepStageSeconds(sleep.sleep_stages, 'light_sleep'));
  const remSleepMin = secondsToMinutes(readSleepStageSeconds(sleep.sleep_stages, 'rem_sleep'));
  const awakeMin = secondsToMinutes(readSleepStageSeconds(sleep.sleep_stages, 'awake'));
  const stagedSleepMin =
    deepSleepMin != null || lightSleepMin != null || remSleepMin != null
      ? (deepSleepMin ?? 0) + (lightSleepMin ?? 0) + (remSleepMin ?? 0)
      : null;
  const timeInBedMin = secondsToMinutes(readQuickMetric(sleep.quick_metrics, 'time_in_bed'));

  return {
    source: 'ultrahuman',
    sourceSleepId: readString(sleep.id),
    date: readDate(sleep, startTime),
    timezone: extractTimezone(sleep),
    startTime,
    endTime,
    bedtimeStart: startTime,
    bedtimeEnd: endTime,
    isNap: readString(sleep.type)?.toLowerCase() === 'nap',
    totalSleepMin: stagedSleepMin ?? (timeInBedMin != null ? timeInBedMin - (awakeMin ?? 0) : null),
    awakeMin,
    lightSleepMin,
    deepSleepMin,
    remSleepMin,
    sleepLatencyMin: secondsToMinutes(readQuickMetric(sleep.quick_metrics, 'latency')),
    wasoMin: awakeMin,
    afterWakeupMin: null,
    sleepScore: readQuickMetric(sleep.quick_metrics, 'sleep_efic') ?? readNumber(sleep.sleep_score),
    avgHeartRateBpm: readNestedMetric(sleep, 'average_heart_rate') ?? readNumber(sleep.average_heart_rate),
    minHeartRateBpm: readNestedMetric(sleep, 'lowest_heart_rate') ?? readNumber(sleep.lowest_heart_rate),
    avgHrvMs: readNestedMetric(sleep, 'hrv') ?? readNumber(sleep.average_hrv),
    avgRespiratoryRpm: readNestedMetric(sleep, 'respiratory_rate') ?? readNumber(sleep.respiratory_rate),
    avgSpo2Pct: readNestedMetric(sleep, 'spo2') ?? readNumber(sleep.average_spo2),
    rawPayload: sleep,
  };
}

export function mapUltrahumanRecoveryToCanonical(payload: unknown): UltrahumanRecoveryCanonical {
  const root = isRecord(payload) ? payload : {};
  const metrics = indexMetricEnvelope(root);
  const recoveryIndex = readNestedMetric(root, 'recovery_index') ?? readNestedMetric(metrics, 'recovery_index');
  const movementIndex = readNestedMetric(root, 'movement_index') ?? readNestedMetric(metrics, 'movement_index');
  const metabolicScore = readNestedMetric(root, 'metabolic_score') ?? readNestedMetric(metrics, 'metabolic_score');
  const date = readDate(root);

  return {
    source: 'ultrahuman',
    date,
    timezone: extractTimezone(root),
    timestamp: normaliseTimestamp(root.timestamp) ?? `${date}T00:00:00.000Z`,
    recoveryScore: recoveryIndex,
    readinessScore: recoveryIndex,
    sleepScore: null,
    strainScore: movementIndex,
    restingHrBpm: readNestedMetric(root, 'resting_heart_rate') ?? readNestedMetric(metrics, 'resting_heart_rate'),
    avgHrvMs: readNestedMetric(root, 'hrv') ?? readNestedMetric(metrics, 'hrv'),
    respiratoryRateRpm: readNestedMetric(root, 'respiratory_rate') ?? readNestedMetric(metrics, 'respiratory_rate'),
    spo2AvgPct: readNestedMetric(root, 'spo2') ?? readNestedMetric(metrics, 'spo2'),
    balance: readNestedMetric(root, 'temperature') ?? readNestedMetric(metrics, 'temperature'),
    stressState: metabolicScore,
    rawPayload: root,
  };
}

export function mapUltrahumanMetabolicToCanonical(payload: unknown): UltrahumanMetabolicCanonical {
  const root = isRecord(payload) ? payload : {};
  const metrics = indexMetricEnvelope(root);
  const date = readDate(root);

  return {
    source: 'ultrahuman',
    date,
    timezone: extractTimezone(root),
    timestamp: normaliseTimestamp(root.timestamp) ?? `${date}T00:00:00.000Z`,
    glucoseMgDl: readNestedMetric(root, 'glucose') ?? readNestedMetric(metrics, 'glucose'),
    averageGlucoseMgDl: readNestedMetric(root, 'average_glucose') ?? readNestedMetric(metrics, 'average_glucose'),
    glucoseVariabilityPct:
      readNestedMetric(root, 'glucose_variability') ?? readNestedMetric(metrics, 'glucose_variability'),
    hba1cPct: readNestedMetric(root, 'hba1c') ?? readNestedMetric(metrics, 'hba1c'),
    timeInTargetPct: readNestedMetric(root, 'time_in_target') ?? readNestedMetric(metrics, 'time_in_target'),
    metabolicScore: readNestedMetric(root, 'metabolic_score') ?? readNestedMetric(metrics, 'metabolic_score'),
    rawPayload: root,
  };
}
