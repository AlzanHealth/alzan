import {
  CanonicalActivity,
  CanonicalActivityHeartRateZone,
  CanonicalActivityLap,
  CanonicalActivityMetricSample,
  CanonicalActivityPointSample,
  CanonicalActivitySportMapping,
  CanonicalActivityStreams,
} from './activity-import-canonical.types';
import { mapClimbingTextToCanonical } from './climbing-sport.mapper';
import { mapGolfTextToCanonical } from './golf-sport.mapper';
import { mapMartialArtsTextToCanonical } from './martial-arts-sport.mapper';
import { mapSkiingTextToCanonical } from './skiing-sport.mapper';
import { mapSnowboardTextToCanonical } from './snowboard-sport.mapper';
import { mapTrailTextToCanonical } from './trail-sport.mapper';
import { mapVolleyballTextToCanonical } from './volleyball-sport.mapper';

type JsonRecord = Record<string, unknown>;

interface ParseFitbitActivityOptions {
  estimatedMaxHeartRate?: number | null;
}

const FITBIT_ACTIVITY_TYPE_BY_ID: Record<number, CanonicalActivitySportMapping> = {
  15: { sportType: 'football', sportSubtype: 'football_11' },
  16: { sportType: 'basketball', sportSubtype: 'indoor' },
  27: { sportType: 'tennis', sportSubtype: 'outdoor' },
  82: { sportType: 'swimming', sportSubtype: null },
  91: { sportType: 'running', sportSubtype: 'treadmill' },
  1071: { sportType: 'hiking', sportSubtype: 'trail' },
  2131: { sportType: 'running', sportSubtype: 'treadmill' },
  3000: { sportType: 'strength', sportSubtype: 'indoor' },
  90001: { sportType: 'cycling', sportSubtype: 'road' },
  90009: { sportType: 'running', sportSubtype: 'outdoor' },
  90013: { sportType: 'other', sportSubtype: null },
  90024: { sportType: 'cycling', sportSubtype: 'indoor_trainer' },
};

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

function normaliseTimestamp(raw: unknown): string | null {
  const text = readString(raw);
  if (!text) return null;
  const timestamp = Date.parse(text);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

function deriveEndTime(startedAt: string | null, durationSeconds: number | null): string | null {
  if (!startedAt || durationSeconds == null || durationSeconds <= 0) return null;
  return new Date(new Date(startedAt).getTime() + durationSeconds * 1000).toISOString();
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

function pushMetricSample(
  target: CanonicalActivityMetricSample[],
  startedAt: string | null,
  offsetSeconds: number | null,
  value: number | null,
): void {
  if (value == null || !Number.isFinite(value)) return;
  target.push({ offsetSeconds, timestamp: resolveTimestamp(startedAt, offsetSeconds), value });
}

function pushPositionSample(
  target: CanonicalActivityPointSample[],
  startedAt: string | null,
  offsetSeconds: number | null,
  lat: number | null,
  lon: number | null,
): void {
  if (lat == null || lon == null || Math.abs(lat) > 90 || Math.abs(lon) > 180) return;
  target.push({ offsetSeconds, timestamp: resolveTimestamp(startedAt, offsetSeconds), lat, lon });
}

function selectActivityRecord(parsed: JsonRecord): JsonRecord {
  if (Array.isArray(parsed.activities) && isRecord(parsed.activities[0])) return parsed.activities[0];
  if (isRecord(parsed.activity)) return parsed.activity;
  return parsed;
}

function normaliseDurationSeconds(value: unknown): number | null {
  const raw = readNumber(value);
  if (raw == null || raw <= 0) return null;
  return raw > 10000 ? raw / 1000 : raw;
}

function normaliseDistanceMeters(value: unknown, unit: unknown): number | null {
  const raw = readNumber(value);
  if (raw == null || raw <= 0) return null;
  const normalisedUnit = readString(unit)?.toLowerCase() ?? '';
  if (normalisedUnit.includes('mile')) return raw * 1609.344;
  if (normalisedUnit.includes('kilometer') || normalisedUnit === 'km') return raw * 1000;
  if (normalisedUnit.includes('meter') || normalisedUnit === 'm') return raw;
  return raw > 1000 ? raw : raw * 1000;
}

function normaliseSpeedMps(value: unknown): number | null {
  const raw = readNumber(value);
  if (raw == null || raw <= 0) return null;
  return raw > 15 ? raw / 3.6 : raw;
}

function mapFitbitSport(activityTypeId: number | null, activityName: string | null): CanonicalActivitySportMapping {
  const normalised = activityName?.trim().toLowerCase() ?? '';
  const martialArtsSport = mapMartialArtsTextToCanonical(activityName);
  if (martialArtsSport) return martialArtsSport;

  const climbingSport = mapClimbingTextToCanonical(activityName);
  if (climbingSport) return climbingSport;
  const volleyballSport = mapVolleyballTextToCanonical(activityName);
  if (volleyballSport) return volleyballSport;
  const golfSport = mapGolfTextToCanonical(activityName);
  if (golfSport) return golfSport;
  const trailSport = mapTrailTextToCanonical(activityName);
  if (trailSport) return trailSport;
  const skiingSport = mapSkiingTextToCanonical(activityName);
  if (skiingSport) return skiingSport;
  const snowboardSport = mapSnowboardTextToCanonical(activityName);
  if (snowboardSport) return snowboardSport;

  if (activityTypeId != null && FITBIT_ACTIVITY_TYPE_BY_ID[activityTypeId]) {
    const mapped = FITBIT_ACTIVITY_TYPE_BY_ID[activityTypeId];
    const hasDetailedCyclingName =
      mapped.sportType === 'cycling' &&
      ['spin', 'gravel', 'mountain', 'mtb', 'urban', 'commute', 'city', 'indoor', 'trainer'].some(detail =>
        normalised.includes(detail),
      );
    const hasDetailedOtherName =
      mapped.sportType === 'other' && (normalised.includes('padel') || normalised.includes('walk'));
    if (!hasDetailedCyclingName && !hasDetailedOtherName) return mapped;
  }
  if (normalised.includes('walk')) return { sportType: 'hiking', sportSubtype: 'urban_walk' };
  if (normalised.includes('padel')) return { sportType: 'padel', sportSubtype: 'outdoor' };
  if (normalised.includes('tennis')) return { sportType: 'tennis', sportSubtype: 'outdoor' };
  if (normalised.includes('basketball')) return { sportType: 'basketball', sportSubtype: 'indoor' };
  if (normalised.includes('soccer') || normalised.includes('football')) {
    if (normalised.includes('futsal') || normalised.includes('sala') || normalised.includes('indoor')) {
      return { sportType: 'football', sportSubtype: 'futsal' };
    }
    return { sportType: 'football', sportSubtype: 'football_11' };
  }
  if (normalised.includes('hike') || normalised.includes('hiking'))
    return { sportType: 'hiking', sportSubtype: 'trail' };
  if (normalised.includes('treadmill') || normalised.includes('indoor run'))
    return { sportType: 'running', sportSubtype: 'treadmill' };
  if (normalised.includes('trail run') || normalised.includes('mountain run'))
    return { sportType: 'trail', sportSubtype: 'trail_running' };
  if (normalised.includes('track run')) return { sportType: 'running', sportSubtype: 'track' };
  if (normalised.includes('run')) {
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
  if (normalised.includes('bike') || normalised.includes('cycling')) {
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
  if (normalised.includes('swim')) return { sportType: 'swimming', sportSubtype: null };
  if (normalised.includes('strength') || normalised.includes('weight'))
    return { sportType: 'strength', sportSubtype: 'indoor' };
  if (
    normalised.includes('gym') ||
    normalised.includes('fitness') ||
    normalised.includes('workout') ||
    normalised.includes('circuit') ||
    normalised.includes('crossfit') ||
    normalised.includes('hiit') ||
    normalised.includes('aerobic') ||
    normalised.includes('bootcamp')
  ) {
    return { sportType: 'gym', sportSubtype: 'indoor' };
  }
  return { sportType: 'other', sportSubtype: null };
}

function readStreamDataset(parsed: JsonRecord, streamName: string): unknown[] {
  const rawStreams = parsed.streams;
  if (isRecord(rawStreams)) {
    const rawStream = rawStreams[streamName];
    if (Array.isArray(rawStream)) return rawStream;
    if (isRecord(rawStream) && Array.isArray(rawStream.data)) return rawStream.data;
  }
  const intradayKey = `activities-${streamName}-intraday`;
  const rawIntraday = parsed[intradayKey];
  if (isRecord(rawIntraday) && Array.isArray(rawIntraday.dataset)) return rawIntraday.dataset;
  return [];
}

function resolveFitbitSampleOffset(sample: unknown, startedAt: string | null, index: number): number | null {
  if (!isRecord(sample)) return index * 60;
  const directOffset = readNumber(sample.offsetSeconds) ?? readNumber(sample.offset) ?? readNumber(sample.seconds);
  if (directOffset != null) return directOffset;
  const timestamp = normaliseTimestamp(sample.timestamp ?? sample.dateTime);
  if (timestamp) return resolveOffsetSeconds(startedAt, timestamp);
  const timeText = readString(sample.time);
  if (!timeText || !startedAt) return index * 60;
  const date = startedAt.slice(0, 10);
  return resolveOffsetSeconds(startedAt, normaliseTimestamp(`${date}T${timeText}Z`));
}

function readSampleValue(sample: unknown): number | null {
  if (isRecord(sample)) return readNumber(sample.value) ?? readNumber(sample.bpm);
  return readNumber(sample);
}

function buildFitbitStreams(parsed: JsonRecord, startedAt: string | null): CanonicalActivityStreams {
  const streams = cloneEmptyStreams();
  readStreamDataset(parsed, 'heartrate').forEach((sample, index) => {
    pushMetricSample(
      streams.heartRate,
      startedAt,
      resolveFitbitSampleOffset(sample, startedAt, index),
      readSampleValue(sample),
    );
  });
  readStreamDataset(parsed, 'heartRate').forEach((sample, index) => {
    pushMetricSample(
      streams.heartRate,
      startedAt,
      resolveFitbitSampleOffset(sample, startedAt, index),
      readSampleValue(sample),
    );
  });
  readStreamDataset(parsed, 'distance').forEach((sample, index) => {
    pushMetricSample(
      streams.distance,
      startedAt,
      resolveFitbitSampleOffset(sample, startedAt, index),
      readSampleValue(sample),
    );
  });
  readStreamDataset(parsed, 'calories').forEach((sample, index) => {
    pushMetricSample(streams.temperature, startedAt, resolveFitbitSampleOffset(sample, startedAt, index), null);
  });
  readStreamDataset(parsed, 'altitude').forEach((sample, index) => {
    pushMetricSample(
      streams.altitude,
      startedAt,
      resolveFitbitSampleOffset(sample, startedAt, index),
      readSampleValue(sample),
    );
  });
  readStreamDataset(parsed, 'elevation').forEach((sample, index) => {
    pushMetricSample(
      streams.altitude,
      startedAt,
      resolveFitbitSampleOffset(sample, startedAt, index),
      readSampleValue(sample),
    );
  });
  const route = Array.isArray(parsed.route) ? parsed.route : [];
  route.forEach((point, index) => {
    if (!isRecord(point)) return;
    const offsetSeconds = resolveFitbitSampleOffset(point, startedAt, index);
    pushPositionSample(
      streams.position,
      startedAt,
      offsetSeconds,
      readNumber(point.latitude),
      readNumber(point.longitude),
    );
    pushMetricSample(streams.altitude, startedAt, offsetSeconds, readNumber(point.altitude));
    pushMetricSample(streams.distance, startedAt, offsetSeconds, readNumber(point.distance));
  });
  return streams;
}

function calculateHeartRateZoneFromSample(value: number, maxHeartRate: number): 1 | 2 | 3 | 4 | 5 {
  const ratio = value / maxHeartRate;
  if (ratio < 0.6) return 1;
  if (ratio < 0.7) return 2;
  if (ratio < 0.8) return 3;
  if (ratio < 0.9) return 4;
  return 5;
}

function calculateHeartRateZonesFromStream(
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

function mapFitbitZoneName(rawName: unknown): 1 | 2 | 3 | 5 | null {
  const name = readString(rawName)?.toLowerCase();
  if (!name) return null;
  if (name.includes('out') || name.includes('below')) return 1;
  if (name.includes('fat') || name.includes('moderate')) return 2;
  if (name.includes('cardio') || name.includes('vigorous')) return 3;
  if (name.includes('peak')) return 5;
  return null;
}

function buildFitbitHeartRateZones(parsed: JsonRecord): CanonicalActivityHeartRateZone[] {
  const rawZones = Array.isArray(parsed.heartRateZones) ? parsed.heartRateZones : [];
  const mapped: CanonicalActivityHeartRateZone[] = [];
  for (const zone of rawZones) {
    if (!isRecord(zone)) continue;
    const canonicalZone = mapFitbitZoneName(zone.name ?? zone.zoneName ?? zone.type);
    const minutes = readNumber(zone.minutes) ?? readNumber(zone.min);
    if (!canonicalZone || minutes == null || minutes <= 0) continue;
    mapped.push({ zone: canonicalZone, durationSeconds: Math.round(minutes * 60), percentage: 0 });
  }
  const totalSeconds = mapped.reduce((sum, zone) => sum + zone.durationSeconds, 0);
  return totalSeconds > 0
    ? mapped.map(zone => ({ ...zone, percentage: Math.round((zone.durationSeconds / totalSeconds) * 100) }))
    : [];
}

function readWorkoutSummary(parsed: JsonRecord): JsonRecord | null {
  const direct = isRecord(parsed.workoutSummary) ? parsed.workoutSummary : null;
  if (direct) return direct;
  return isRecord(parsed.workout_summary) ? parsed.workout_summary : null;
}

function buildFitbitLaps(parsed: JsonRecord): CanonicalActivityLap[] {
  const rawLaps = Array.isArray(parsed.laps) ? parsed.laps : [];
  const laps: CanonicalActivityLap[] = [];
  rawLaps.forEach((rawLap, index) => {
    if (!isRecord(rawLap)) return;
    const durationSeconds = normaliseDurationSeconds(
      rawLap.duration ?? rawLap.TotalTimeSeconds ?? rawLap.totalTimeSeconds,
    );
    const distanceM = normaliseDistanceMeters(
      rawLap.distance ?? rawLap.DistanceMeters ?? rawLap.distanceMeters,
      'meter',
    );
    laps.push({
      lapIndex: index + 1,
      lapType: 'unknown',
      distanceM,
      durationSeconds,
      avgPaceSecondsPerKm:
        durationSeconds != null && distanceM != null && distanceM > 0 ? durationSeconds / (distanceM / 1000) : null,
      avgHeartRate: readNumber(rawLap.averageHeartRate) ?? null,
      maxHeartRate: readNumber(rawLap.maxHeartRate) ?? null,
      startOffsetSeconds: readNumber(rawLap.startOffsetSeconds) ?? null,
      endOffsetSeconds: null,
    });
  });
  return laps;
}

export function parseFitbitActivityJsonToCanonical(
  content: string,
  filename: string,
  options?: ParseFitbitActivityOptions,
): CanonicalActivity {
  const parsed = JSON.parse(content) as unknown;
  if (!isRecord(parsed)) throw new Error('Invalid Fitbit JSON file.');
  const record = selectActivityRecord(parsed);
  const activityName = readString(record.activityName) ?? readString(record.name);
  const activityTypeId = roundNullable(readNumber(record.activityTypeId));
  const sport = mapFitbitSport(activityTypeId, activityName);
  const startedAt = normaliseTimestamp(record.startTime ?? record.originalStartTime ?? parsed.startTime);
  const durationSeconds = normaliseDurationSeconds(record.duration);
  const workoutSummary = readWorkoutSummary(record) ?? readWorkoutSummary(parsed);
  const mobilityMetrics =
    workoutSummary && isRecord(workoutSummary.mobilityMetrics) ? workoutSummary.mobilityMetrics : null;
  const streams = buildFitbitStreams(record, startedAt);
  const heartRateZones = buildFitbitHeartRateZones(record);
  const source = isRecord(record.source) ? record.source : null;
  const distanceM = normaliseDistanceMeters(record.distance, record.distanceUnit);
  const avgSpeedMps =
    normaliseSpeedMps(record.speed) ??
    (durationSeconds != null && distanceM != null ? distanceM / durationSeconds : null);
  return {
    provider: 'fitbit',
    sourceFileType: 'json',
    sportType: sport.sportType,
    sportSubtype: sport.sportSubtype,
    providerActivityId: readIdentifier(record.logId),
    summary: {
      startedAt,
      endedAt: deriveEndTime(startedAt, durationSeconds),
      durationSeconds: roundNullable(durationSeconds),
      elapsedSeconds: roundNullable(normaliseDurationSeconds(record.originalDuration) ?? durationSeconds),
      distanceM: roundNullable(distanceM),
      caloriesKcal: roundNullable(readNumber(record.calories)),
      avgHeartRate: roundNullable(readNumber(record.averageHeartRate)),
      maxHeartRate: roundNullable(readNumber(record.maxHeartRate)),
      minHeartRate: null,
      avgSpeedMps,
      maxSpeedMps: normaliseSpeedMps(record.maxSpeed),
      avgCadence: readNumber(mobilityMetrics?.avgCadenceStepsPerMinute),
      maxCadence: null,
      avgPowerW: null,
      maxPowerW: null,
      elevationGainM: roundNullable(readNumber(record.elevationGain)),
      elevationLossM: null,
      avgTemperatureC: null,
      maxTemperatureC: null,
      totalSteps: roundNullable(readNumber(record.steps)),
      recoveryTimeSeconds: null,
      vo2Max: null,
      epoc: null,
      pte: null,
      tss: null,
    },
    streams,
    laps: buildFitbitLaps(record),
    heartRateZones:
      heartRateZones.length > 0
        ? heartRateZones
        : calculateHeartRateZonesFromStream(streams.heartRate, options?.estimatedMaxHeartRate),
    device: {
      name: readString(source?.name) ?? 'Fitbit',
      model: readString(source?.name),
      serial: readIdentifier(source?.id),
    },
    vendorFields: {
      sourceProvider: 'fitbit',
      fitbitActivityName: activityName,
      fitbitActivityTypeId: activityTypeId,
      fitbitLogType: readString(record.logType),
      fitbitDistanceUnit: readString(record.distanceUnit),
      fitbitActiveDurationMs: readNumber(record.activeDuration),
      fitbitOriginalDurationMs: readNumber(record.originalDuration),
      fitbitOriginalStartTime: readString(record.originalStartTime),
      fitbitActiveZoneMinutes: record.activeZoneMinutes ?? null,
      fitbitManualValuesSpecified: record.manualValuesSpecified ?? null,
      fitbitSourceType: readString(source?.type),
      fitbitTrackerFeatures: Array.isArray(source?.trackerFeatures) ? source?.trackerFeatures : null,
      fitbitTcxLink: readString(record.tcxLink),
      fitbitCaloriesLink: readString(record.caloriesLink),
      fitbitHeartRateLink: readString(record.heartRateLink),
      fitbitAvgGroundContactTimeMs: readNumber(mobilityMetrics?.avgGroundContactTimeMilliseconds),
      fitbitLegacyApiDeprecatesAt: '2026-09',
      fitbitFutureGoogleHealthApiCompatible: true,
      fitbitFilename: filename,
    },
  };
}
