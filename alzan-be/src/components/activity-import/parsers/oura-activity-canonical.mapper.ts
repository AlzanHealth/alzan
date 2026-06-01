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
import { mapSnowboardTextToCanonical } from './snowboard-sport.mapper';
import { mapTrailTextToCanonical } from './trail-sport.mapper';
import { mapVolleyballTextToCanonical } from './volleyball-sport.mapper';

type JsonRecord = Record<string, unknown>;

interface ParseOuraActivityOptions {
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

function pushHeartRateSample(
  target: CanonicalActivityMetricSample[],
  startedAt: string | null,
  timestamp: string | null,
  bpm: number | null,
): void {
  if (bpm == null || !Number.isFinite(bpm) || bpm <= 0) return;
  target.push({ offsetSeconds: resolveOffsetSeconds(startedAt, timestamp), timestamp, value: Math.round(bpm) });
}

function mapOuraSport(activity: string | null): CanonicalActivitySportMapping {
  const normalised = activity?.trim().toLowerCase() ?? '';
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
  const snowboardSport = mapSnowboardTextToCanonical(activity);
  if (snowboardSport) return snowboardSport;

  if (normalised.includes('walk')) return { sportType: 'hiking', sportSubtype: 'urban_walk' };
  if (normalised.includes('track')) return { sportType: 'running', sportSubtype: 'track' };
  if (
    normalised.includes('treadmill') ||
    normalised.includes('indoor_running') ||
    (normalised.includes('indoor') && (normalised.includes('run') || normalised.includes('jogging')))
  )
    return { sportType: 'running', sportSubtype: 'treadmill' };
  if (normalised.includes('running') || normalised.includes('run') || normalised.includes('jogging')) {
    if (
      normalised.includes('race') ||
      normalised.includes('carrera') ||
      normalised.includes('maraton') ||
      normalised.includes('maratón') ||
      normalised.includes('competition') ||
      normalised.includes('competición')
    ) {
      return { sportType: 'running', sportSubtype: 'race' };
    }
    return { sportType: 'running', sportSubtype: 'outdoor' };
  }
  if (
    normalised.includes('cycling') ||
    normalised.includes('biking') ||
    normalised.includes('bike') ||
    normalised.includes('spin')
  ) {
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
  if (normalised === 'swimming') return { sportType: 'swimming', sportSubtype: null };
  if (normalised.includes('soccer') || normalised.includes('football') || normalised.includes('futsal')) {
    if (normalised.includes('futsal') || normalised.includes('sala') || normalised.includes('indoor')) {
      return { sportType: 'football', sportSubtype: 'futsal' };
    }
    return { sportType: 'football', sportSubtype: 'football_11' };
  }
  if (normalised === 'basketball') return { sportType: 'basketball', sportSubtype: 'indoor' };
  if (normalised === 'tennis') return { sportType: 'tennis', sportSubtype: 'outdoor' };
  if (normalised === 'padel') return { sportType: 'padel', sportSubtype: 'outdoor' };
  if (normalised === 'hiking') return { sportType: 'hiking', sportSubtype: 'trail' };
  if (
    normalised === 'strength_training' ||
    normalised === 'weightlifting' ||
    normalised.includes('strength') ||
    normalised.includes('weight')
  ) {
    return { sportType: 'strength', sportSubtype: 'indoor' };
  }
  if (
    normalised === 'gym' ||
    normalised.includes('fitness') ||
    normalised.includes('crossfit') ||
    normalised.includes('hiit') ||
    normalised.includes('workout')
  ) {
    return { sportType: 'gym', sportSubtype: 'indoor' };
  }
  return { sportType: 'other', sportSubtype: null };
}

function selectWorkoutRecord(parsed: JsonRecord): JsonRecord {
  if (Array.isArray(parsed.data) && isRecord(parsed.data[0])) return parsed.data[0];
  if (Array.isArray(parsed.workouts) && isRecord(parsed.workouts[0])) return parsed.workouts[0];
  if (isRecord(parsed.workout)) return parsed.workout;
  return parsed;
}

function readHeartRateArrays(record: JsonRecord, parsed: JsonRecord): unknown[] {
  const candidates = [
    record.heart_rate,
    record.heartRate,
    record.heartrate,
    parsed.heart_rate,
    parsed.heartRate,
    parsed.heartrate,
  ];
  const seen = new Set<unknown>();
  return candidates.flatMap(value => {
    if (!value || seen.has(value)) return [];
    seen.add(value);
    return Array.isArray(value) ? value : isRecord(value) ? [value] : [];
  });
}

function pushOuraSampleObject(sample: JsonRecord, startedAt: string | null, streams: CanonicalActivityStreams): void {
  const source = readString(sample.source)?.toLowerCase();
  if (source && source !== 'workout') return;
  const timestamp = normaliseTimestamp(sample.timestamp ?? sample.time ?? sample.dateTime);
  const intervalSeconds = readNumber(sample.interval) ?? 60;
  if (Array.isArray(sample.items)) {
    sample.items.forEach((item, index) => {
      const offsetSeconds = timestamp ? resolveOffsetSeconds(startedAt, timestamp) : null;
      const sampleTimestamp =
        offsetSeconds != null ? resolveTimestamp(startedAt, offsetSeconds + index * intervalSeconds) : timestamp;
      pushHeartRateSample(streams.heartRate, startedAt, sampleTimestamp, readNumber(item));
    });
    return;
  }
  pushHeartRateSample(streams.heartRate, startedAt, timestamp, readNumber(sample.bpm) ?? readNumber(sample.value));
}

function buildOuraStreams(record: JsonRecord, parsed: JsonRecord, startedAt: string | null): CanonicalActivityStreams {
  const streams = cloneEmptyStreams();
  readHeartRateArrays(record, parsed).forEach(sample => {
    if (isRecord(sample)) {
      pushOuraSampleObject(sample, startedAt, streams);
      return;
    }
    pushHeartRateSample(streams.heartRate, startedAt, null, readNumber(sample));
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

export function parseOuraActivityJsonToCanonical(
  content: string,
  filename: string,
  options?: ParseOuraActivityOptions,
): CanonicalActivity {
  const parsed = JSON.parse(content) as unknown;
  if (!isRecord(parsed)) throw new Error('Invalid Oura JSON file.');
  const record = selectWorkoutRecord(parsed);
  const activity = readString(record.activity);
  const sport = mapOuraSport(activity);
  const startedAt = normaliseTimestamp(record.start_datetime ?? record.startDatetime ?? record.startTime);
  const endedAt = normaliseTimestamp(record.end_datetime ?? record.endDatetime ?? record.endTime);
  const durationSeconds = readNumber(record.duration) ?? deriveDurationSeconds(startedAt, endedAt);
  const streams = buildOuraStreams(record, parsed, startedAt);
  const avgHeartRate =
    readNumber(record.average_heart_rate) ??
    readNumber(record.averageHeartRate) ??
    roundNullable(calculateAverageSampleValue(streams.heartRate));
  const maxHeartRate =
    readNumber(record.max_heart_rate) ??
    readNumber(record.maxHeartRate) ??
    (streams.heartRate.length > 0 ? Math.max(...streams.heartRate.map(sample => sample.value)) : null);
  const minHeartRate =
    readNumber(record.min_heart_rate) ??
    readNumber(record.minHeartRate) ??
    (streams.heartRate.length > 0 ? Math.min(...streams.heartRate.map(sample => sample.value)) : null);

  return {
    provider: 'oura',
    sourceFileType: 'json',
    sportType: sport.sportType,
    sportSubtype: sport.sportSubtype,
    providerActivityId: readIdentifier(record.id),
    summary: {
      startedAt,
      endedAt,
      durationSeconds: roundNullable(durationSeconds),
      elapsedSeconds: roundNullable(durationSeconds),
      distanceM: roundNullable(readNumber(record.distance)),
      caloriesKcal: roundNullable(readNumber(record.calories)),
      avgHeartRate: roundNullable(avgHeartRate),
      maxHeartRate: roundNullable(maxHeartRate),
      minHeartRate: roundNullable(minHeartRate),
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
      totalSteps: null,
      recoveryTimeSeconds: null,
      vo2Max: null,
      epoc: null,
      pte: null,
      tss: null,
    },
    streams,
    laps: [],
    heartRateZones: buildHeartRateZonesFromStream(streams.heartRate, options?.estimatedMaxHeartRate),
    device: null,
    vendorFields: {
      sourceProvider: 'oura',
      ouraFilename: filename,
      ouraActivity: activity,
      ouraDay: readString(record.day),
      ouraIntensity: readString(record.intensity),
      ouraSource: readString(record.source),
      ouraLabel: readString(record.label),
      ouraMeta: isRecord(record.meta) ? record.meta : null,
    },
  };
}
