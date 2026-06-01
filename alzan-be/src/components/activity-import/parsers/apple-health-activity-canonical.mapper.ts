import {
  CanonicalActivity,
  CanonicalActivityHeartRateZone,
  CanonicalActivityMetricSample,
  CanonicalActivityPointSample,
  CanonicalActivitySportMapping,
  CanonicalActivityStreams,
} from './activity-import-canonical.types';
import { mapClimbingTextToCanonical } from './climbing-sport.mapper';
import { mapMartialArtsTextToCanonical } from './martial-arts-sport.mapper';
import { mapTrailTextToCanonical } from './trail-sport.mapper';
import { mapVolleyballTextToCanonical } from './volleyball-sport.mapper';

type JsonRecord = Record<string, unknown>;

interface ParseAppleHealthActivityOptions {
  estimatedMaxHeartRate?: number | null;
}

const STREAM_SAMPLE_SECONDS = 60;

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

function normaliseType(value: unknown): string {
  return (
    readString(value)
      ?.replace(/^HKWorkoutActivityType/, '')
      .replace(/^HKQuantityTypeIdentifier/, '')
      .replace(/^HKCategoryTypeIdentifier/, '')
      .replace(/[_\s-]+/g, '')
      .toLowerCase() ?? ''
  );
}

function mapAppleHealthSport(
  workoutType: string | null,
  title: string | null,
  metadata: unknown,
): CanonicalActivitySportMapping {
  const combined = [workoutType, title, isRecord(metadata) ? readString(metadata.activityName) : null]
    .filter((value): value is string => value != null)
    .join(' ');
  const normalised = normaliseType(combined);
  const martialArtsSport = mapMartialArtsTextToCanonical(combined);
  if (martialArtsSport) return martialArtsSport;

  const climbingSport = mapClimbingTextToCanonical(combined);
  if (climbingSport) return climbingSport;
  const volleyballSport = mapVolleyballTextToCanonical(combined);
  if (volleyballSport) return volleyballSport;
  const trailSport = mapTrailTextToCanonical(combined);
  if (trailSport) return trailSport;

  if (normalised.includes('padel')) return { sportType: 'padel', sportSubtype: 'outdoor' };
  if (normalised.includes('running') || normalised.includes('trackandfield')) {
    const isIndoor =
      normalised.includes('indoor') ||
      normalised.includes('treadmill') ||
      normalised.includes('cinta') ||
      (isRecord(metadata) &&
        (metadata.HKIndoorWorkout === true ||
          metadata.HKIndoorWorkout === 1 ||
          metadata.HKIndoorWorkout === '1' ||
          String(metadata.HKIndoorWorkout).toLowerCase() === 'true'));
    if (isIndoor) return { sportType: 'running', sportSubtype: 'treadmill' };

    const nameLower = [title, isRecord(metadata) ? readString(metadata.activityName) : null]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    if (
      nameLower.includes('race') ||
      nameLower.includes('carrera') ||
      nameLower.includes('maratón') ||
      nameLower.includes('maraton') ||
      nameLower.includes('competition') ||
      nameLower.includes('competición')
    ) {
      return { sportType: 'running', sportSubtype: 'race' };
    }
    if (
      nameLower.includes('trail') ||
      nameLower.includes('sendero') ||
      nameLower.includes('montaña') ||
      nameLower.includes('mountain')
    ) {
      return { sportType: 'trail', sportSubtype: 'trail_running' };
    }
    if (nameLower.includes('track') || nameLower.includes('pista') || nameLower.includes('atletismo')) {
      return { sportType: 'running', sportSubtype: 'track' };
    }

    return { sportType: 'running', sportSubtype: 'outdoor' };
  }
  if (normalised.includes('walking')) return { sportType: 'hiking', sportSubtype: 'urban_walk' };
  if (normalised.includes('cycling') || normalised.includes('handcycling')) {
    if (normalised.includes('indoor') || normalised.includes('spin')) {
      if (normalised.includes('spin')) return { sportType: 'cycling', sportSubtype: 'spinning' };
      return { sportType: 'cycling', sportSubtype: 'indoor_trainer' };
    }
    if (normalised.includes('mountain') || normalised.includes('mtb')) {
      return { sportType: 'cycling', sportSubtype: 'mtb' };
    }
    if (normalised.includes('gravel')) {
      return { sportType: 'cycling', sportSubtype: 'gravel' };
    }
    if (normalised.includes('urban') || normalised.includes('city') || normalised.includes('commute')) {
      return { sportType: 'cycling', sportSubtype: 'urban' };
    }
    return { sportType: 'cycling', sportSubtype: 'road' };
  }
  if (normalised.includes('swimming') || normalised.includes('waterfitness'))
    return { sportType: 'swimming', sportSubtype: null };
  if (normalised.includes('surfing')) return { sportType: 'surf', sportSubtype: null };
  if (normalised.includes('soccer') || normalised.includes('football')) {
    if (normalised.includes('futsal') || normalised.includes('sala') || normalised.includes('indoor')) {
      return { sportType: 'football', sportSubtype: 'futsal' };
    }
    return { sportType: 'football', sportSubtype: 'football_11' };
  }
  if (normalised.includes('basketball')) return { sportType: 'basketball', sportSubtype: 'indoor' };
  if (normalised.includes('tennis')) return { sportType: 'tennis', sportSubtype: 'outdoor' };
  if (normalised.includes('hiking')) return { sportType: 'hiking', sportSubtype: 'trail' };
  if (
    normalised.includes('traditionalstrengthtraining') ||
    normalised.includes('functionalstrengthtraining') ||
    normalised.includes('coretraining')
  ) {
    return { sportType: 'strength', sportSubtype: 'indoor' };
  }
  if (
    normalised.includes('crosstraining') ||
    normalised.includes('highintensityintervaltraining') ||
    normalised.includes('fitness') ||
    normalised.includes('gym')
  ) {
    return { sportType: 'gym', sportSubtype: null };
  }
  return { sportType: 'other', sportSubtype: null };
}

function readRecords(parsed: JsonRecord): JsonRecord[] {
  const data = isRecord(parsed.data) ? parsed.data : {};
  const records = Array.isArray(data.records) ? data.records : Array.isArray(parsed.records) ? parsed.records : [];
  return records.filter(isRecord);
}

function readWorkouts(parsed: JsonRecord): JsonRecord[] {
  const data = isRecord(parsed.data) ? parsed.data : {};
  const workouts = Array.isArray(data.workouts)
    ? data.workouts
    : Array.isArray(parsed.workouts)
      ? parsed.workouts
      : [parsed];
  return workouts.filter(isRecord);
}

function selectWorkout(parsed: JsonRecord): JsonRecord {
  return readWorkouts(parsed).reduce<JsonRecord>(
    (selected, candidate) => {
      const selectedDuration =
        readNumber(selected.duration) ??
        deriveDurationSeconds(normaliseTimestamp(selected.startDate), normaliseTimestamp(selected.endDate)) ??
        0;
      const candidateDuration =
        readNumber(candidate.duration) ??
        deriveDurationSeconds(normaliseTimestamp(candidate.startDate), normaliseTimestamp(candidate.endDate)) ??
        0;
      return candidateDuration > selectedDuration ? candidate : selected;
    },
    readWorkouts(parsed)[0] ?? parsed,
  );
}

function getRecordType(record: JsonRecord): string {
  return normaliseType(record.type ?? record.quantityType ?? record.identifier);
}

function isRecordLinkedToWorkout(
  record: JsonRecord,
  workout: JsonRecord,
  startedAt: string | null,
  endedAt: string | null,
): boolean {
  const workoutId = readIdentifier(workout.id) ?? readIdentifier(workout.uuid);
  const parentId = readIdentifier(record.parentId) ?? readIdentifier(record.parent_id);
  if (workoutId && parentId && workoutId === parentId) return true;
  const recordStart = normaliseTimestamp(record.startDate ?? record.start);
  if (!recordStart || !startedAt || !endedAt) return false;
  const recordMs = new Date(recordStart).getTime();
  return recordMs >= new Date(startedAt).getTime() && recordMs <= new Date(endedAt).getTime();
}

function readStatistic(workout: JsonRecord, typeNames: string[]): number | null {
  const values = Array.isArray(workout.values)
    ? workout.values
    : Array.isArray(workout.statistics)
      ? workout.statistics
      : [];
  for (const value of values.filter(isRecord)) {
    const type = getRecordType(value);
    if (typeNames.some(typeName => type.includes(typeName))) return readNumber(value.value);
  }
  return null;
}

function readRecordAggregate(records: JsonRecord[], typeNames: string[], mode: 'sum' | 'max' | 'avg'): number | null {
  const values = records
    .filter(record => typeNames.some(typeName => getRecordType(record).includes(typeName)))
    .map(record => readNumber(record.value))
    .filter((value): value is number => value != null);
  if (values.length === 0) return null;
  if (mode === 'sum') return values.reduce((sum, value) => sum + value, 0);
  if (mode === 'max') return Math.max(...values);
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function pushMetricSample(
  target: CanonicalActivityMetricSample[],
  startedAt: string | null,
  timestamp: string | null,
  value: number | null,
): void {
  if (value == null || !Number.isFinite(value)) return;
  target.push({ offsetSeconds: resolveOffsetSeconds(startedAt, timestamp), timestamp, value });
}

function pushPositionSample(
  target: CanonicalActivityPointSample[],
  startedAt: string | null,
  timestamp: string | null,
  lat: number | null,
  lon: number | null,
): void {
  if (lat == null || lon == null || Math.abs(lat) > 90 || Math.abs(lon) > 180) return;
  target.push({ offsetSeconds: resolveOffsetSeconds(startedAt, timestamp), timestamp, lat, lon });
}

function pushSample(sample: JsonRecord, startedAt: string | null, streams: CanonicalActivityStreams): void {
  const timestamp = normaliseTimestamp(sample.timestamp ?? sample.time ?? sample.startDate ?? sample.dateTime);
  pushPositionSample(
    streams.position,
    startedAt,
    timestamp,
    readNumber(sample.latitude) ?? readNumber(sample.lat),
    readNumber(sample.longitude) ?? readNumber(sample.lon) ?? readNumber(sample.lng),
  );
  pushMetricSample(streams.altitude, startedAt, timestamp, readNumber(sample.altitude) ?? readNumber(sample.altitudeM));
  pushMetricSample(streams.heartRate, startedAt, timestamp, readNumber(sample.heartRate) ?? readNumber(sample.bpm));
  pushMetricSample(streams.distance, startedAt, timestamp, readNumber(sample.distance) ?? readNumber(sample.distanceM));
  pushMetricSample(
    streams.speed,
    startedAt,
    timestamp,
    readNumber(sample.speed) ?? readNumber(sample.runningSpeed) ?? readNumber(sample.cyclingSpeed),
  );
  pushMetricSample(
    streams.power,
    startedAt,
    timestamp,
    readNumber(sample.power) ?? readNumber(sample.runningPower) ?? readNumber(sample.cyclingPower),
  );
  pushMetricSample(
    streams.cadence,
    startedAt,
    timestamp,
    readNumber(sample.cadence) ?? readNumber(sample.runningCadence) ?? readNumber(sample.cyclingCadence),
  );
  pushMetricSample(streams.temperature, startedAt, timestamp, readNumber(sample.temperature));
}

function pushRecord(record: JsonRecord, startedAt: string | null, streams: CanonicalActivityStreams): void {
  const timestamp = normaliseTimestamp(record.startDate ?? record.start ?? record.timestamp);
  const value = readNumber(record.value);
  const type = getRecordType(record);
  if (type.includes('heartrate') && !type.includes('variability'))
    pushMetricSample(streams.heartRate, startedAt, timestamp, value);
  if (type.includes('distance')) pushMetricSample(streams.distance, startedAt, timestamp, value);
  if (type.includes('speed')) pushMetricSample(streams.speed, startedAt, timestamp, value);
  if (type.includes('power')) pushMetricSample(streams.power, startedAt, timestamp, value);
  if (type.includes('cadence')) pushMetricSample(streams.cadence, startedAt, timestamp, value);
  if (type.includes('altitude')) pushMetricSample(streams.altitude, startedAt, timestamp, value);
  if (type.includes('temperature')) pushMetricSample(streams.temperature, startedAt, timestamp, value);
}

function buildStreams(workout: JsonRecord, records: JsonRecord[], startedAt: string | null): CanonicalActivityStreams {
  const streams = cloneEmptyStreams();
  const samples = Array.isArray(workout.samples) ? workout.samples.filter(isRecord) : [];
  const route = Array.isArray(workout.route) ? workout.route.filter(isRecord) : [];
  samples.forEach(sample => pushSample(sample, startedAt, streams));
  route.forEach(point => {
    const timestamp = normaliseTimestamp(point.timestamp ?? point.time ?? point.startDate);
    pushPositionSample(
      streams.position,
      startedAt,
      timestamp,
      readNumber(point.latitude) ?? readNumber(point.lat),
      readNumber(point.longitude) ?? readNumber(point.lon) ?? readNumber(point.lng),
    );
    pushMetricSample(streams.altitude, startedAt, timestamp, readNumber(point.altitude) ?? readNumber(point.altitudeM));
  });
  records.forEach(record => pushRecord(record, startedAt, streams));
  return streams;
}

function calculateAverage(samples: CanonicalActivityMetricSample[]): number | null {
  if (samples.length === 0) return null;
  return samples.reduce((sum, sample) => sum + sample.value, 0) / samples.length;
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
    const ratio = sample.value / maxHeartRate;
    const zone: 1 | 2 | 3 | 4 | 5 = ratio < 0.6 ? 1 : ratio < 0.7 ? 2 : ratio < 0.8 ? 3 : ratio < 0.9 ? 4 : 5;
    buckets.set(zone, (buckets.get(zone) ?? 0) + STREAM_SAMPLE_SECONDS);
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

function readDevice(workout: JsonRecord): CanonicalActivity['device'] {
  const source = isRecord(workout.source) ? workout.source : {};
  const device = isRecord(workout.device) ? workout.device : {};
  const deviceText = readString(workout.device);
  return {
    name: readString(source.deviceName) ?? readString(source.name) ?? deviceText ?? readString(device.name),
    model: readString(source.deviceModel) ?? readString(device.model) ?? deviceText,
    serial: readString(source.deviceId) ?? readString(device.serial),
  };
}

function readSourcePackage(workout: JsonRecord): string | null {
  const source = isRecord(workout.source) ? workout.source : {};
  const sourceRevision = isRecord(workout.sourceRevision) ? workout.sourceRevision : {};
  const revisionSource = isRecord(sourceRevision.source) ? sourceRevision.source : {};
  return (
    readString(source.bundleIdentifier) ??
    readString(source.bundle_id) ??
    readString(revisionSource.bundleIdentifier) ??
    readString(revisionSource.bundle_id)
  );
}

export function parseAppleHealthActivityJsonToCanonical(
  content: string,
  filename: string,
  options?: ParseAppleHealthActivityOptions,
): CanonicalActivity {
  const parsed = JSON.parse(content) as unknown;
  if (!isRecord(parsed)) throw new Error('Invalid Apple Health JSON file.');
  const workout = selectWorkout(parsed);
  const startedAt = normaliseTimestamp(workout.startDate ?? workout.start);
  const endedAt = normaliseTimestamp(workout.endDate ?? workout.end);
  const linkedRecords = readRecords(parsed).filter(record =>
    isRecordLinkedToWorkout(record, workout, startedAt, endedAt),
  );
  const streams = buildStreams(workout, linkedRecords, startedAt);
  const workoutType = readString(workout.workoutActivityType) ?? readString(workout.type);
  const sport = mapAppleHealthSport(workoutType, readString(workout.title), workout.metadata);
  const sourceRecordId = readIdentifier(workout.uuid) ?? readIdentifier(workout.id);
  const sourcePackage = readSourcePackage(workout);
  const distanceM =
    readNumber(workout.totalDistance) ??
    readNumber(workout.distance) ??
    readStatistic(workout, ['distance']) ??
    readRecordAggregate(linkedRecords, ['distance'], 'max') ??
    (streams.distance.length > 0 ? Math.max(...streams.distance.map(sample => sample.value)) : null);
  const calories =
    readNumber(workout.activeEnergyBurned) ??
    readNumber(workout.totalEnergyBurned) ??
    readStatistic(workout, ['activeenergyburned', 'energyburned']);

  return {
    provider: 'apple_health',
    sourceFileType: 'json',
    sportType: sport.sportType,
    sportSubtype: sport.sportSubtype,
    providerActivityId: sourceRecordId,
    summary: {
      startedAt,
      endedAt,
      durationSeconds: roundNullable(readNumber(workout.duration) ?? deriveDurationSeconds(startedAt, endedAt)),
      elapsedSeconds: roundNullable(readNumber(workout.duration) ?? deriveDurationSeconds(startedAt, endedAt)),
      distanceM: roundNullable(distanceM),
      caloriesKcal: roundNullable(calories),
      avgHeartRate: roundNullable(
        readNumber(workout.averageHeartRate) ??
          readRecordAggregate(linkedRecords, ['heartrate'], 'avg') ??
          calculateAverage(streams.heartRate),
      ),
      maxHeartRate: roundNullable(
        readNumber(workout.maxHeartRate) ??
          readRecordAggregate(linkedRecords, ['heartrate'], 'max') ??
          (streams.heartRate.length > 0 ? Math.max(...streams.heartRate.map(sample => sample.value)) : null),
      ),
      minHeartRate: null,
      avgSpeedMps: readNumber(workout.averageSpeed) ?? calculateAverage(streams.speed),
      maxSpeedMps: streams.speed.length > 0 ? Math.max(...streams.speed.map(sample => sample.value)) : null,
      avgCadence: roundNullable(readNumber(workout.averageCadence) ?? calculateAverage(streams.cadence)),
      maxCadence:
        streams.cadence.length > 0 ? roundNullable(Math.max(...streams.cadence.map(sample => sample.value))) : null,
      avgPowerW: roundNullable(readNumber(workout.averagePower) ?? calculateAverage(streams.power)),
      maxPowerW:
        streams.power.length > 0 ? roundNullable(Math.max(...streams.power.map(sample => sample.value))) : null,
      elevationGainM: roundNullable(readNumber(workout.elevationGain) ?? readNumber(workout.elevationGainM)),
      elevationLossM: roundNullable(readNumber(workout.elevationLoss) ?? readNumber(workout.elevationLossM)),
      avgTemperatureC: readNumber(workout.averageTemperature) ?? calculateAverage(streams.temperature),
      maxTemperatureC:
        streams.temperature.length > 0 ? Math.max(...streams.temperature.map(sample => sample.value)) : null,
      totalSteps: roundNullable(readNumber(workout.steps) ?? readRecordAggregate(linkedRecords, ['stepcount'], 'sum')),
      recoveryTimeSeconds: null,
      vo2Max: readRecordAggregate(linkedRecords, ['vo2max'], 'max'),
      epoc: null,
      pte: null,
      tss: null,
    },
    streams,
    laps: [],
    heartRateZones: buildHeartRateZonesFromStream(streams.heartRate, options?.estimatedMaxHeartRate),
    device: readDevice(workout),
    vendorFields: {
      sourceProvider: 'apple_health',
      appleHealthFilename: filename,
      appleHealthWorkoutActivityType: workoutType,
      appleHealthZoneOffset: readString(workout.zoneOffset),
      appleHealthSource: isRecord(workout.source) ? workout.source : null,
      appleHealthMetadata: isRecord(workout.metadata) ? workout.metadata : null,
      appleHealthEvents: Array.isArray(workout.events) ? workout.events : null,
      appleHealthLaps: Array.isArray(workout.laps) ? workout.laps : null,
      appleHealthSegments: Array.isArray(workout.segments) ? workout.segments : null,
      appleHealthSwimmingStrokeCount:
        readNumber(workout.totalSwimmingStrokeCount) ?? readStatistic(workout, ['swimmingstrokecount']),
    },
    provenance: {
      sourceChannel: 'apple_health',
      sourcePackage,
      sourceProviderKey: 'apple_health',
      sourceRecordId,
      sourceUpdatedAt: null,
    },
  };
}
