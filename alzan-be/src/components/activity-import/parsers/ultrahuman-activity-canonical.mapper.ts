import {
  CanonicalActivity,
  CanonicalActivityHeartRateZone,
  CanonicalActivityMetricSample,
  CanonicalActivitySportMapping,
  CanonicalActivityStreams,
} from './activity-import-canonical.types';
import { mapClimbingTextToCanonical } from './climbing-sport.mapper';
import { mapMartialArtsTextToCanonical } from './martial-arts-sport.mapper';
import { mapSkiingTextToCanonical } from './skiing-sport.mapper';
import { mapTrailTextToCanonical } from './trail-sport.mapper';
import { mapVolleyballTextToCanonical } from './volleyball-sport.mapper';

type JsonRecord = Record<string, unknown>;

interface ParseUltrahumanActivityOptions {
  estimatedMaxHeartRate?: number | null;
}

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

function roundNullable(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  return Math.round(value);
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

function deriveDurationSeconds(startedAt: string | null, endedAt: string | null): number | null {
  if (!startedAt || !endedAt) return null;
  const startedMs = new Date(startedAt).getTime();
  const endedMs = new Date(endedAt).getTime();
  if (!Number.isFinite(startedMs) || !Number.isFinite(endedMs) || endedMs <= startedMs) return null;
  return Math.round((endedMs - startedMs) / 1000);
}

function resolveTimestamp(startedAt: string | null, offsetSeconds: number | null): string | null {
  if (!startedAt || offsetSeconds == null || !Number.isFinite(offsetSeconds)) return null;
  return new Date(new Date(startedAt).getTime() + offsetSeconds * 1000).toISOString();
}

function resolveOffsetSeconds(startedAt: string | null, timestamp: string | null): number | null {
  if (!startedAt || !timestamp) return null;
  const startedMs = new Date(startedAt).getTime();
  const timestampMs = new Date(timestamp).getTime();
  if (!Number.isFinite(startedMs) || !Number.isFinite(timestampMs)) return null;
  return Math.max(0, Math.round((timestampMs - startedMs) / 1000));
}

function cloneEmptyStreams(): CanonicalActivityStreams {
  return {
    position: [],
    heartRate: [],
    speed: [],
    distance: [],
    altitude: [],
    cadence: [],
    power: [],
    temperature: [],
  };
}

function readMetricValue(value: unknown): number | null {
  if (isRecord(value)) return readNumber(value.value) ?? readNumber(value.average) ?? readNumber(value.score);
  return readNumber(value);
}

function readNestedMetric(record: JsonRecord, key: string, ...nestedKeys: string[]): number | null {
  const section = record[key];
  if (!isRecord(section)) return readMetricValue(section);
  for (const nestedKey of nestedKeys) {
    const value = readMetricValue(section[nestedKey]);
    if (value != null) return value;
  }
  return readMetricValue(section);
}

function indexMetricEnvelope(parsed: JsonRecord): JsonRecord {
  const metricData = isRecord(parsed.data) && Array.isArray(parsed.data.metric_data) ? parsed.data.metric_data : [];
  return metricData.filter(isRecord).reduce<JsonRecord>((indexed, item) => {
    const type = readString(item.type);
    const object = isRecord(item.object) ? item.object : item;
    if (type) indexed[type] = object;
    return indexed;
  }, {});
}

function selectActivityRecord(parsed: JsonRecord): JsonRecord {
  if (isRecord(parsed.activity)) return parsed.activity;
  if (isRecord(parsed.workout)) return parsed.workout;
  if (Array.isArray(parsed.activities) && isRecord(parsed.activities[0])) return parsed.activities[0];
  if (Array.isArray(parsed.workouts) && isRecord(parsed.workouts[0])) return parsed.workouts[0];
  return parsed;
}

function mapUltrahumanSport(activity: string | null): CanonicalActivitySportMapping {
  const normalised = activity?.trim().toLowerCase().replace(/\s+/g, '_') ?? '';
  const martialArtsSport = mapMartialArtsTextToCanonical(activity);
  if (martialArtsSport) return martialArtsSport;

  const climbingSport = mapClimbingTextToCanonical(activity);
  if (climbingSport) return climbingSport;
  const volleyballSport = mapVolleyballTextToCanonical(activity);
  if (volleyballSport) return volleyballSport;
  const trailSport = mapTrailTextToCanonical(activity);
  if (trailSport) return trailSport;
  const skiingSport = mapSkiingTextToCanonical(activity);
  if (skiingSport) return skiingSport;

  if (normalised === 'running' || normalised === 'run') return { sportType: 'running', sportSubtype: 'outdoor' };
  if (normalised === 'walking' || normalised === 'walk') return { sportType: 'hiking', sportSubtype: 'urban_walk' };
  if (normalised.includes('cycling') || normalised.includes('biking') || normalised.includes('bike')) {
    if (normalised.includes('spin')) return { sportType: 'cycling', sportSubtype: 'spinning' };
    if (normalised.includes('gravel')) return { sportType: 'cycling', sportSubtype: 'gravel' };
    if (normalised.includes('mountain') || normalised.includes('mtb'))
      return { sportType: 'cycling', sportSubtype: 'mtb' };
    if (normalised.includes('urban') || normalised.includes('commute') || normalised.includes('city'))
      return { sportType: 'cycling', sportSubtype: 'urban' };
    if (normalised.includes('indoor') || normalised.includes('trainer'))
      return { sportType: 'cycling', sportSubtype: 'indoor_trainer' };
    return { sportType: 'cycling', sportSubtype: 'road' };
  }
  if (normalised === 'swimming' || normalised === 'swim') return { sportType: 'swimming', sportSubtype: null };
  if (normalised.includes('soccer') || normalised.includes('football') || normalised.includes('futsal')) {
    if (normalised.includes('futsal') || normalised.includes('sala') || normalised.includes('indoor')) {
      return { sportType: 'football', sportSubtype: 'futsal' };
    }
    return { sportType: 'football', sportSubtype: 'football_11' };
  }
  if (normalised === 'basketball') return { sportType: 'basketball', sportSubtype: 'indoor' };
  if (normalised === 'tennis') return { sportType: 'tennis', sportSubtype: 'outdoor' };
  if (normalised === 'padel') return { sportType: 'padel', sportSubtype: 'outdoor' };
  if (normalised === 'hiking' || normalised === 'hike') return { sportType: 'hiking', sportSubtype: 'trail' };
  if (
    normalised === 'strength_training' ||
    normalised === 'strength' ||
    normalised === 'weightlifting' ||
    normalised.includes('weight')
  ) {
    return { sportType: 'strength', sportSubtype: 'indoor' };
  }
  if (
    normalised === 'gym' ||
    normalised.includes('fitness') ||
    normalised.includes('crossfit') ||
    normalised.includes('hiit') ||
    normalised.includes('workout') ||
    normalised.includes('functional')
  ) {
    return { sportType: 'gym', sportSubtype: 'indoor' };
  }
  return { sportType: 'other', sportSubtype: null };
}

function readActivityName(record: JsonRecord): string | null {
  return (
    readString(record.activity) ??
    readString(record.activityName) ??
    readString(record.type) ??
    readString(record.category) ??
    readString(record.workout_type)
  );
}

function pushHeartRateSample(
  target: CanonicalActivityMetricSample[],
  startedAt: string | null,
  timestamp: string | null,
  bpm: number | null,
): void {
  if (bpm == null || !Number.isFinite(bpm) || bpm <= 0) return;
  target.push({ offsetSeconds: resolveOffsetSeconds(startedAt, timestamp), timestamp, value: Math.round(bpm) });
}

function readSampleArrayFromMetric(metric: unknown): unknown[] {
  if (Array.isArray(metric)) return metric;
  if (isRecord(metric) && Array.isArray(metric.samples)) return metric.samples;
  if (isRecord(metric) && Array.isArray(metric.values)) return metric.values;
  return [];
}

function buildUltrahumanStreams(
  record: JsonRecord,
  parsed: JsonRecord,
  startedAt: string | null,
): CanonicalActivityStreams {
  const streams = cloneEmptyStreams();
  const heartRateSources = [record.heart_rate, record.heartRate, parsed.heart_rate, parsed.heartRate];
  heartRateSources.flatMap(readSampleArrayFromMetric).forEach((sample, index) => {
    const sampleRecord = isRecord(sample) ? sample : null;
    const timestamp = sampleRecord ? normaliseTimestamp(sampleRecord.timestamp ?? sampleRecord.time) : null;
    const fallbackTimestamp = timestamp ?? resolveTimestamp(startedAt, index * 60);
    const bpm = sampleRecord ? (readNumber(sampleRecord.value) ?? readNumber(sampleRecord.bpm)) : readNumber(sample);
    pushHeartRateSample(streams.heartRate, startedAt, fallbackTimestamp, bpm);
  });
  return streams;
}

function calculateAverageSampleValue(samples: CanonicalActivityMetricSample[]): number | null {
  if (samples.length === 0) return null;
  return samples.reduce((sum, sample) => sum + sample.value, 0) / samples.length;
}

function calculateHeartRateZoneFromSample(value: number, maxHeartRate: number): 1 | 2 | 3 | 4 | 5 {
  const ratio = value / maxHeartRate;
  if (ratio < 0.6) return 1;
  if (ratio < 0.7) return 2;
  if (ratio < 0.8) return 3;
  if (ratio < 0.9) return 4;
  return 5;
}

function buildHeartRateZonesFromStream(
  samples: CanonicalActivityMetricSample[],
  estimatedMaxHeartRate?: number | null,
): CanonicalActivityHeartRateZone[] {
  if (samples.length === 0) return [];
  const maxHeartRate = estimatedMaxHeartRate ?? Math.max(...samples.map(sample => sample.value));
  if (!Number.isFinite(maxHeartRate) || maxHeartRate <= 0) return [];
  const buckets = new Map<1 | 2 | 3 | 4 | 5, number>();
  for (const sample of samples) {
    const zone = calculateHeartRateZoneFromSample(sample.value, maxHeartRate);
    buckets.set(zone, (buckets.get(zone) ?? 0) + 60);
  }
  const totalSeconds = Array.from(buckets.values()).reduce((sum, value) => sum + value, 0);
  return Array.from(buckets.entries())
    .sort(([left], [right]) => left - right)
    .map(([zone, durationSeconds]) => ({
      zone,
      durationSeconds,
      percentage: Math.round((durationSeconds / totalSeconds) * 100),
    }));
}

export function parseUltrahumanActivityJsonToCanonical(
  content: string,
  filename: string,
  options?: ParseUltrahumanActivityOptions,
): CanonicalActivity {
  const parsed = JSON.parse(content) as unknown;
  if (!isRecord(parsed)) throw new Error('Invalid Ultrahuman JSON file.');
  const metrics = indexMetricEnvelope(parsed);
  const record = selectActivityRecord(parsed);
  const activity = readActivityName(record);
  const sport = mapUltrahumanSport(activity);
  const startedAt = normaliseTimestamp(record.start_datetime ?? record.startTime ?? record.started_at);
  const endedAt = normaliseTimestamp(record.end_datetime ?? record.endTime ?? record.ended_at);
  const durationSeconds =
    readNumber(record.duration) ?? readNumber(record.durationSeconds) ?? deriveDurationSeconds(startedAt, endedAt);
  const movement = isRecord(record.movement) ? record.movement : isRecord(parsed.movement) ? parsed.movement : {};
  const heartRate = isRecord(record.heart_rate)
    ? record.heart_rate
    : isRecord(record.heartRate)
      ? record.heartRate
      : isRecord(parsed.heart_rate)
        ? parsed.heart_rate
        : isRecord(parsed.heartRate)
          ? parsed.heartRate
          : {};
  const recovery = isRecord(record.recovery) ? record.recovery : isRecord(parsed.recovery) ? parsed.recovery : {};
  const streams = buildUltrahumanStreams(record, parsed, startedAt);
  const avgHeartRate =
    readNumber(record.average_heart_rate) ??
    readNumber(record.averageHeartRate) ??
    readNestedMetric(heartRate, 'average_bpm', 'value') ??
    readNestedMetric(heartRate, 'average', 'value') ??
    roundNullable(calculateAverageSampleValue(streams.heartRate));
  const maxHeartRate =
    readNumber(record.max_heart_rate) ??
    readNumber(record.maxHeartRate) ??
    readNestedMetric(heartRate, 'max_bpm', 'value') ??
    (streams.heartRate.length > 0 ? Math.max(...streams.heartRate.map(sample => sample.value)) : null);
  const totalSteps =
    readNumber(record.steps) ?? readNestedMetric(movement, 'steps', 'value') ?? readMetricValue(metrics.steps);
  const calories =
    readNumber(record.calories) ??
    readNumber(record.caloriesKcal) ??
    readNestedMetric(movement, 'active_kcal', 'value') ??
    readNestedMetric(movement, 'calories', 'value') ??
    readMetricValue(metrics.active_kcal) ??
    readMetricValue(metrics.calories);
  const vo2Max =
    readNumber(record.vo2_max) ??
    readNumber(record.vo2Max) ??
    readNestedMetric(movement, 'vo2_max', 'value') ??
    readMetricValue(metrics.vo2_max);
  const recoveryIndex = readNestedMetric(recovery, 'score', 'value') ?? readMetricValue(metrics.recovery_index);
  const movementIndex = readMetricValue(metrics.movement_index);
  const metabolicScore = readMetricValue(metrics.metabolic_score);

  return {
    provider: 'ultrahuman',
    sourceFileType: 'json',
    sportType: sport.sportType,
    sportSubtype: sport.sportSubtype,
    providerActivityId: readIdentifier(record.id) ?? readIdentifier(record.logId),
    summary: {
      startedAt,
      endedAt,
      durationSeconds: roundNullable(durationSeconds),
      elapsedSeconds: roundNullable(durationSeconds),
      distanceM: roundNullable(readNumber(record.distance) ?? readNumber(record.distance_m)),
      caloriesKcal: roundNullable(calories),
      avgHeartRate: roundNullable(avgHeartRate),
      maxHeartRate: roundNullable(maxHeartRate),
      minHeartRate: null,
      avgSpeedMps: null,
      maxSpeedMps: null,
      avgCadence: null,
      maxCadence: null,
      avgPowerW: null,
      maxPowerW: null,
      elevationGainM: null,
      elevationLossM: null,
      avgTemperatureC: null,
      maxTemperatureC: null,
      totalSteps: roundNullable(totalSteps),
      recoveryTimeSeconds: null,
      vo2Max,
      epoc: null,
      pte: null,
      tss: null,
    },
    streams,
    laps: [],
    heartRateZones: buildHeartRateZonesFromStream(streams.heartRate, options?.estimatedMaxHeartRate),
    device: null,
    vendorFields: {
      sourceProvider: 'ultrahuman',
      ultrahumanFilename: filename,
      ultrahumanActivity: activity,
      ultrahumanCategory: readString(record.category),
      ultrahumanIntensity: readString(record.intensity),
      ultrahumanRecoveryIndex: recoveryIndex,
      ultrahumanMovementIndex: movementIndex,
      ultrahumanMetabolicScore: metabolicScore,
    },
  };
}
