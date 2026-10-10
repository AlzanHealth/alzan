import {
  CanonicalHealthMetricSample,
  CanonicalSleepStageInterval,
  HealthConnectDailyActivityCanonical,
  HealthConnectRecoveryCanonical,
  HealthConnectSleepCanonical,
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
  const timestamp = normaliseTimestamp(value);
  const text = readString(value);
  return timestamp?.slice(0, 10) ?? text?.slice(0, 10) ?? new Date(0).toISOString().slice(0, 10);
}

function readNested(record: JsonRecord, path: string): unknown {
  return path.split('.').reduce<unknown>((current, key) => (isRecord(current) ? current[key] : undefined), record);
}

function readMetricNumber(record: JsonRecord, ...paths: string[]): number | null {
  for (const path of paths) {
    const value = readNested(record, path);
    const direct = readNumber(value);
    if (direct != null) return direct;
    if (isRecord(value)) {
      const nested =
        readNumber(value.value) ??
        readNumber(value.count) ??
        readNumber(value.inMeters) ??
        readNumber(value.inKilocalories) ??
        readNumber(value.inCelsius) ??
        readNumber(value.inPercent);
      if (nested != null) return nested;
    }
  }
  return null;
}

function readSourcePackage(payload: JsonRecord): string | null {
  return (
    readString(readNested(payload, 'metadata.dataOrigin.packageName')) ??
    readString(payload.sourcePackage) ??
    readString(payload.packageName)
  );
}

function readSourceRecordId(payload: JsonRecord): string | null {
  return readString(readNested(payload, 'metadata.id')) ?? readString(payload.id);
}

function readSourceUpdatedAt(payload: JsonRecord): string | null {
  return normaliseTimestamp(readNested(payload, 'metadata.lastModifiedTime'));
}

function readIntervals(payload: JsonRecord, date: string): HealthConnectDailyActivityCanonical['intervals'] {
  const intervals = Array.isArray(payload.intervals)
    ? payload.intervals
    : Array.isArray(payload.records)
      ? payload.records
      : [];
  return intervals.filter(isRecord).map(interval => ({
    startTime: normaliseTimestamp(interval.startTime ?? interval.start) ?? `${date}T00:00:00.000Z`,
    endTime: normaliseTimestamp(interval.endTime ?? interval.end),
    steps: readMetricNumber(interval, 'steps', 'count'),
    caloriesKcal: readMetricNumber(interval, 'caloriesKcal', 'activeCaloriesKcal', 'energy.inKilocalories'),
    distanceM: readMetricNumber(interval, 'distanceM', 'distance.inMeters', 'distance'),
    rawPayload: interval,
  }));
}

export function mapHealthConnectDailyActivityToCanonical(payload: unknown): HealthConnectDailyActivityCanonical {
  const root = isRecord(payload) ? payload : {};
  const date = readDate(root.date ?? root.day ?? root.startTime ?? root.timestamp);
  return {
    source: 'health_connect',
    sourcePackage: readSourcePackage(root),
    sourceRecordId: readSourceRecordId(root),
    sourceUpdatedAt: readSourceUpdatedAt(root),
    date,
    timezone: readString(root.timezone) ?? readString(root.zoneOffset) ?? 'UTC',
    totalSteps: readMetricNumber(root, 'steps', 'totalSteps', 'count'),
    caloriesKcal: readMetricNumber(root, 'totalCaloriesKcal', 'caloriesKcal', 'totalCaloriesBurned.inKilocalories'),
    activeCaloriesKcal: readMetricNumber(root, 'activeCaloriesKcal', 'activeCaloriesBurned.inKilocalories'),
    distanceM: readMetricNumber(root, 'distanceM', 'distance.inMeters', 'distance'),
    activeDistanceM: readMetricNumber(root, 'activeDistanceM', 'distanceM', 'distance.inMeters'),
    floorsClimbed: readMetricNumber(root, 'floorsClimbed', 'floors'),
    intervals: readIntervals(root, date),
    rawPayload: root,
  };
}

function readStageMinutes(stages: unknown, names: string[]): number | null {
  if (!Array.isArray(stages)) return null;
  const total = stages.filter(isRecord).reduce((sum, stage) => {
    const type = readString(stage.stage ?? stage.type ?? stage.name)?.toLowerCase() ?? '';
    if (!names.some(name => type.includes(name))) return sum;
    const durationSeconds =
      readMetricNumber(stage, 'durationSeconds') ??
      (normaliseTimestamp(stage.startTime) && normaliseTimestamp(stage.endTime)
        ? (new Date(normaliseTimestamp(stage.endTime) as string).getTime() -
            new Date(normaliseTimestamp(stage.startTime) as string).getTime()) /
          1000
        : null);
    return sum + (durationSeconds ?? 0);
  }, 0);
  return total > 0 ? total / 60 : null;
}

function mapSleepStage(value: string): CanonicalSleepStageInterval['stage'] {
  const normalised = value.toLowerCase();
  if (normalised.includes('awake')) return 'awake';
  if (normalised.includes('outofbed') || normalised.includes('out_of_bed')) return 'out_of_bed';
  if (normalised.includes('deep')) return 'deep';
  if (normalised.includes('rem')) return 'rem';
  if (normalised.includes('light')) return 'light';
  if (normalised.includes('core')) return 'core';
  if (normalised.includes('sleeping') || normalised.includes('asleep')) return 'sleeping';
  return 'unknown';
}

function readStageIntervals(stages: unknown): CanonicalSleepStageInterval[] {
  if (!Array.isArray(stages)) return [];
  return stages.filter(isRecord).flatMap(stage => {
    const startTime = normaliseTimestamp(stage.startTime ?? stage.start);
    const endTime = normaliseTimestamp(stage.endTime ?? stage.end);
    if (!startTime || !endTime || endTime <= startTime) return [];
    const providerStage = readString(stage.stage ?? stage.type ?? stage.name) ?? 'unknown';
    return [
      {
        startTime,
        endTime,
        stage: mapSleepStage(providerStage),
        providerStage,
        confidence: readMetricNumber(stage, 'confidence'),
        rawPayload: stage,
      },
    ];
  });
}

function buildHealthSample(
  metricType: string,
  value: number | null,
  unit: string,
  root: JsonRecord,
  recordedAt: string,
  date: string,
): CanonicalHealthMetricSample[] {
  if (value == null) return [];
  return [
    {
      metricType,
      recordedAt,
      localDate: date,
      timezone: readString(root.timezone) ?? 'UTC',
      value,
      unit,
      sourceRecordId: readSourceRecordId(root),
      rawPayload: root,
    },
  ];
}

export function mapHealthConnectSleepToCanonical(payload: unknown): HealthConnectSleepCanonical {
  const root = isRecord(payload) ? payload : {};
  const sleep = isRecord(root.sleep) ? root.sleep : root;
  const startTime = normaliseTimestamp(sleep.startTime ?? sleep.start) ?? new Date(0).toISOString();
  const endTime = normaliseTimestamp(sleep.endTime ?? sleep.end) ?? startTime;
  const stages = sleep.stages;
  const stagedSleepMinutes = readStageMinutes(stages, ['deep', 'light', 'core', 'rem', 'sleeping', 'asleep']);

  return {
    source: 'health_connect',
    sourcePackage: readSourcePackage(sleep) ?? readSourcePackage(root),
    sourceSleepId: readSourceRecordId(sleep),
    sourceRecordId: readSourceRecordId(sleep),
    sourceUpdatedAt: readSourceUpdatedAt(sleep),
    date: readDate(sleep.date ?? startTime),
    timezone: readString(sleep.timezone) ?? readString(sleep.startZoneOffset) ?? 'UTC',
    startTime,
    endTime,
    bedtimeStart: startTime,
    bedtimeEnd: endTime,
    isNap: Boolean(sleep.isNap) || readString(sleep.title)?.toLowerCase().includes('nap') === true,
    totalSleepMin: stagedSleepMinutes ?? readMetricNumber(sleep, 'totalSleepMin', 'durationMinutes'),
    awakeMin: readStageMinutes(stages, ['awake']),
    lightSleepMin: readStageMinutes(stages, ['light', 'core']),
    deepSleepMin: readStageMinutes(stages, ['deep']),
    remSleepMin: readStageMinutes(stages, ['rem']),
    sleepLatencyMin: readMetricNumber(sleep, 'sleepLatencyMin'),
    wasoMin: readMetricNumber(sleep, 'wasoMin'),
    afterWakeupMin: readMetricNumber(sleep, 'afterWakeupMin'),
    sleepScore: readMetricNumber(sleep, 'sleepScore', 'score'),
    avgHeartRateBpm: readMetricNumber(sleep, 'avgHeartRate', 'averageHeartRate'),
    minHeartRateBpm: readMetricNumber(sleep, 'minHeartRate'),
    maxHeartRateBpm: readMetricNumber(sleep, 'maxHeartRate'),
    restingHrBpm: readMetricNumber(sleep, 'restingHeartRate'),
    avgHrvMs: readMetricNumber(sleep, 'avgHrv', 'hrvRmssd'),
    hrvRmssdMs: readMetricNumber(sleep, 'hrvRmssd'),
    avgRespiratoryRpm: readMetricNumber(sleep, 'respiratoryRate'),
    avgSpo2Pct: readMetricNumber(sleep, 'spo2Avg', 'oxygenSaturation.inPercent'),
    stageIntervals: readStageIntervals(stages),
    healthSamples: [],
    rawPayload: root,
  };
}

export function mapHealthConnectRecoveryToCanonical(payload: unknown): HealthConnectRecoveryCanonical {
  const root = isRecord(payload) ? payload : {};
  const date = readDate(root.date ?? root.day ?? root.timestamp);
  const recordedAt = normaliseTimestamp(root.timestamp ?? root.startTime) ?? `${date}T00:00:00.000Z`;
  const restingHrBpm = readMetricNumber(root, 'restingHeartRate', 'restingHeartRateBpm');
  const hrvRmssdMs = readMetricNumber(root, 'hrvRmssd', 'heartRateVariabilityRmssd');
  const respiratoryRateRpm = readMetricNumber(root, 'respiratoryRate');
  const spo2AvgPct = readMetricNumber(root, 'spo2Avg', 'oxygenSaturation.inPercent');
  const vo2Max = readMetricNumber(root, 'vo2Max');
  const skinTemperatureC = readMetricNumber(root, 'temperatureC', 'skinTemperature.inCelsius');
  return {
    source: 'health_connect',
    sourcePackage: readSourcePackage(root),
    sourceRecordId: readSourceRecordId(root),
    sourceUpdatedAt: readSourceUpdatedAt(root),
    date,
    timezone: readString(root.timezone) ?? 'UTC',
    timestamp: recordedAt,
    recoveryScore: readMetricNumber(root, 'recoveryScore', 'readinessScore'),
    readinessScore: readMetricNumber(root, 'readinessScore'),
    sleepScore: readMetricNumber(root, 'sleepScore'),
    strainScore: null,
    restingHrBpm,
    avgHrvMs: hrvRmssdMs,
    hrvRmssdMs,
    respiratoryRateRpm,
    spo2AvgPct,
    skinTemperatureC,
    vo2Max,
    healthSamples: [
      ...buildHealthSample('resting_heart_rate', restingHrBpm, 'bpm', root, recordedAt, date),
      ...buildHealthSample('hrv_rmssd', hrvRmssdMs, 'ms', root, recordedAt, date),
      ...buildHealthSample('respiratory_rate', respiratoryRateRpm, 'rpm', root, recordedAt, date),
      ...buildHealthSample('spo2', spo2AvgPct, '%', root, recordedAt, date),
      ...buildHealthSample('skin_temperature', skinTemperatureC, 'C', root, recordedAt, date),
      ...buildHealthSample('vo2_max', vo2Max, 'ml/kg/min', root, recordedAt, date),
    ],
    balance: null,
    stressState: null,
    rawPayload: root,
  };
}
