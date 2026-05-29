import {
  CanonicalActivity,
  CanonicalActivityHeartRateZone,
  CanonicalActivityMetricSample,
  CanonicalActivitySportMapping,
  CanonicalActivityStreams,
} from './activity-import-canonical.types';

type JsonRecord = Record<string, unknown>;

interface ParseHealthConnectActivityOptions {
  estimatedMaxHeartRate?: number | null;
}

const STREAM_LIMIT = 10000;

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

function readNested(record: JsonRecord, path: string): unknown {
  return path.split('.').reduce<unknown>((current, key) => (isRecord(current) ? current[key] : undefined), record);
}

function readMetricNumber(record: JsonRecord, ...paths: string[]): number | null {
  for (const path of paths) {
    const value = readNested(record, path);
    const direct = readNumber(value);
    if (direct != null) return direct;
    if (!isRecord(value)) continue;
    const nested =
      readNumber(value.value) ??
      readNumber(value.count) ??
      readNumber(value.inMeters) ??
      readNumber(value.meters) ??
      readNumber(value.inKilocalories) ??
      readNumber(value.kilocalories) ??
      readNumber(value.inMetersPerSecond) ??
      readNumber(value.metersPerSecond) ??
      readNumber(value.inWatts) ??
      readNumber(value.watts) ??
      readNumber(value.inRevolutionsPerMinute) ??
      readNumber(value.revolutionsPerMinute) ??
      readNumber(value.inCelsius) ??
      readNumber(value.celsius) ??
      readNumber(value.inPercent);
    if (nested != null) return nested;
  }
  return null;
}

function normaliseType(value: unknown): string {
  return (
    readString(value)
      ?.replace(/^androidx\.health\.connect\.client\.records\./i, '')
      .replace(/^android\.health\.connect\.datatypes\./i, '')
      .replace(/Record$/i, '')
      .replace(/^EXERCISE_SESSION_TYPE_/i, '')
      .replace(/^EXERCISE_TYPE_/i, '')
      .replace(/[_\s-]+/g, '')
      .toLowerCase() ?? ''
  );
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

function resolveSourcePackage(record: JsonRecord): string | null {
  return (
    readString(readNested(record, 'metadata.dataOrigin.packageName')) ??
    readString(readNested(record, 'metadata.data_origin.package_name')) ??
    readString(record.sourcePackage) ??
    readString(record.packageName)
  );
}

function resolveSourceProviderKey(sourcePackage: string | null): string | null {
  if (!sourcePackage) return null;
  const lower = sourcePackage.toLowerCase();
  if (lower === 'android') return 'android_device';
  if (lower.includes('shealth')) return 'samsung_health';
  if (lower.includes('fitbit')) return 'fitbit';
  if (lower.includes('fitness')) return 'google_fit';
  if (lower.includes('garmin')) return 'garmin';
  if (lower.includes('polar')) return 'polar';
  if (lower.includes('suunto')) return 'suunto';
  if (lower.includes('coros')) return 'coros';
  return null;
}

function getRecordType(record: JsonRecord): string {
  return normaliseType(record.recordType ?? record.type ?? record.quantityType ?? record.identifier);
}

function readWorkouts(parsed: JsonRecord): JsonRecord[] {
  const data = isRecord(parsed.data) ? parsed.data : {};
  const workouts = Array.isArray(data.workouts)
    ? data.workouts
    : Array.isArray(parsed.workouts)
      ? parsed.workouts
      : Array.isArray(data.exerciseSessions)
        ? data.exerciseSessions
        : Array.isArray(parsed.exerciseSessions)
          ? parsed.exerciseSessions
          : [parsed];
  return workouts.filter(isRecord);
}

function readRecords(parsed: JsonRecord): JsonRecord[] {
  const data = isRecord(parsed.data) ? parsed.data : {};
  const records = Array.isArray(data.records) ? data.records : Array.isArray(parsed.records) ? parsed.records : [];
  return records.filter(isRecord);
}

function selectWorkout(parsed: JsonRecord): JsonRecord {
  const workouts = readWorkouts(parsed);
  return workouts.reduce<JsonRecord>((selected, candidate) => {
    const selectedDuration =
      readMetricNumber(selected, 'durationSeconds', 'duration') ??
      deriveDurationSeconds(normaliseTimestamp(selected.startTime), normaliseTimestamp(selected.endTime)) ??
      0;
    const candidateDuration =
      readMetricNumber(candidate, 'durationSeconds', 'duration') ??
      deriveDurationSeconds(normaliseTimestamp(candidate.startTime), normaliseTimestamp(candidate.endTime)) ??
      0;
    return candidateDuration > selectedDuration ? candidate : selected;
  }, workouts[0] ?? parsed);
}

function isRecordLinkedToWorkout(
  record: JsonRecord,
  workout: JsonRecord,
  startedAt: string | null,
  endedAt: string | null,
): boolean {
  const workoutId =
    readIdentifier(readNested(workout, 'metadata.id')) ?? readIdentifier(workout.id) ?? readIdentifier(workout.uuid);
  const recordParentId =
    readIdentifier(record.parentId) ??
    readIdentifier(record.parent_id) ??
    readIdentifier(readNested(record, 'metadata.clientRecordId'));
  if (workoutId && recordParentId && workoutId === recordParentId) return true;
  const recordStart = normaliseTimestamp(record.startTime ?? record.start ?? record.time ?? record.timestamp);
  if (!recordStart || !startedAt || !endedAt) return false;
  const recordMs = new Date(recordStart).getTime();
  return recordMs >= new Date(startedAt).getTime() && recordMs <= new Date(endedAt).getTime();
}

function readAssociatedRecords(
  records: JsonRecord[],
  workout: JsonRecord,
  startedAt: string | null,
  endedAt: string | null,
): JsonRecord[] {
  const linked = records.filter(record => isRecordLinkedToWorkout(record, workout, startedAt, endedAt));
  return linked.length > 0 ? linked : records;
}

function mapHealthConnectSport(workout: JsonRecord): CanonicalActivitySportMapping {
  const raw = [
    readString(workout.exerciseType),
    readString(workout.workoutActivityType),
    readString(workout.type),
    readString(workout.title),
    readString(workout.notes),
    isRecord(workout.metadata) ? readString(workout.metadata.activityName) : null,
  ]
    .filter((value): value is string => value != null)
    .join(' ');
  const normalised = normaliseType(raw);
  if (normalised.includes('padel')) return { sportType: 'padel', sportSubtype: 'indoor' };
  if (normalised.includes('runningtreadmill') || normalised.includes('treadmill'))
    return { sportType: 'running', sportSubtype: 'treadmill' };
  if (normalised.includes('running')) return { sportType: 'running', sportSubtype: 'outdoor' };
  if (normalised.includes('walking')) return { sportType: 'hiking', sportSubtype: 'urban_walk' };
  if (normalised.includes('biking') || normalised.includes('cycling')) {
    if (normalised.includes('spin')) return { sportType: 'cycling', sportSubtype: 'spinning' };
    if (normalised.includes('gravel')) return { sportType: 'cycling', sportSubtype: 'gravel' };
    if (normalised.includes('mountain') || normalised.includes('mtb'))
      return { sportType: 'cycling', sportSubtype: 'mtb' };
    if (normalised.includes('urban') || normalised.includes('commute') || normalised.includes('city'))
      return { sportType: 'cycling', sportSubtype: 'urban' };
    if (normalised.includes('stationary') || normalised.includes('indoor') || normalised.includes('trainer'))
      return { sportType: 'cycling', sportSubtype: 'indoor_trainer' };
    return { sportType: 'cycling', sportSubtype: 'road' };
  }
  if (normalised.includes('swimmingpool')) return { sportType: 'swimming', sportSubtype: 'pool' };
  if (normalised.includes('swimmingopenwater')) return { sportType: 'swimming', sportSubtype: 'open_water' };
  if (normalised.includes('swimming')) return { sportType: 'swimming', sportSubtype: null };
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
    normalised.includes('strength') ||
    normalised.includes('weightlifting') ||
    normalised.includes('calisthenics') ||
    normalised.includes('functionalfitness')
  ) {
    return { sportType: 'strength', sportSubtype: 'indoor' };
  }
  if (
    normalised.includes('highintensityintervaltraining') ||
    normalised.includes('exerciseclass') ||
    normalised.includes('gymnastics') ||
    normalised.includes('gym') ||
    normalised.includes('workout')
  ) {
    return { sportType: 'gym', sportSubtype: null };
  }
  return { sportType: 'other', sportSubtype: null };
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
  streams: CanonicalActivityStreams,
  startedAt: string | null,
  timestamp: string | null,
  point: JsonRecord,
): void {
  const lat = readMetricNumber(point, 'latitude', 'lat');
  const lon = readMetricNumber(point, 'longitude', 'lon', 'lng');
  if (lat == null || lon == null || Math.abs(lat) > 90 || Math.abs(lon) > 180) return;
  streams.position.push({ offsetSeconds: resolveOffsetSeconds(startedAt, timestamp), timestamp, lat, lon });
  pushMetricSample(streams.altitude, startedAt, timestamp, readMetricNumber(point, 'altitude.inMeters', 'altitude'));
}

function readRouteLocations(workout: JsonRecord): JsonRecord[] {
  const route =
    readNested(workout, 'exerciseRoute.locations') ??
    readNested(workout, 'route.locations') ??
    readNested(workout, 'exerciseRoute.route') ??
    workout.route;
  if (Array.isArray(route)) return route.filter(isRecord);
  return [];
}

function readRecordSamples(record: JsonRecord): JsonRecord[] {
  if (Array.isArray(record.samples)) return record.samples.filter(isRecord);
  if (Array.isArray(record.data)) return record.data.filter(isRecord);
  if ('time' in record || 'timestamp' in record || 'value' in record) return [record];
  return [];
}

function readSampleTimestamp(sample: JsonRecord, fallback: JsonRecord): string | null {
  return normaliseTimestamp(sample.time ?? sample.timestamp ?? sample.startTime ?? fallback.startTime ?? fallback.time);
}

function buildStreams(workout: JsonRecord, records: JsonRecord[], startedAt: string | null): CanonicalActivityStreams {
  const streams = cloneEmptyStreams();
  for (const point of readRouteLocations(workout).slice(0, STREAM_LIMIT)) {
    const timestamp = normaliseTimestamp(point.time ?? point.timestamp);
    pushPositionSample(streams, startedAt, timestamp, point);
  }

  const directSamples = Array.isArray(workout.samples) ? workout.samples.filter(isRecord) : [];
  for (const sample of directSamples.slice(0, STREAM_LIMIT)) {
    const timestamp = normaliseTimestamp(sample.time ?? sample.timestamp ?? sample.startTime);
    pushMetricSample(streams.heartRate, startedAt, timestamp, readMetricNumber(sample, 'beatsPerMinute', 'bpm', 'hr'));
    pushMetricSample(streams.speed, startedAt, timestamp, readMetricNumber(sample, 'speed.inMetersPerSecond', 'speed'));
    pushMetricSample(streams.power, startedAt, timestamp, readMetricNumber(sample, 'power.inWatts', 'power'));
    pushMetricSample(streams.cadence, startedAt, timestamp, readMetricNumber(sample, 'rate', 'cadence'));
    pushMetricSample(streams.distance, startedAt, timestamp, readMetricNumber(sample, 'distance.inMeters', 'distance'));
    pushMetricSample(streams.temperature, startedAt, timestamp, readMetricNumber(sample, 'temperature.inCelsius'));
  }

  for (const record of records) {
    const type = getRecordType(record);
    for (const sample of readRecordSamples(record).slice(0, STREAM_LIMIT)) {
      const timestamp = readSampleTimestamp(sample, record);
      if (type.includes('heartrate')) {
        pushMetricSample(streams.heartRate, startedAt, timestamp, readMetricNumber(sample, 'beatsPerMinute', 'bpm'));
      } else if (type.includes('speed')) {
        pushMetricSample(
          streams.speed,
          startedAt,
          timestamp,
          readMetricNumber(sample, 'speed.inMetersPerSecond', 'speed'),
        );
      } else if (type.includes('power')) {
        pushMetricSample(streams.power, startedAt, timestamp, readMetricNumber(sample, 'power.inWatts', 'power'));
      } else if (type.includes('cyclingpedalingcadence')) {
        pushMetricSample(
          streams.cadence,
          startedAt,
          timestamp,
          readMetricNumber(sample, 'revolutionsPerMinute', 'rpm', 'rate'),
        );
      } else if (type.includes('stepscadence')) {
        pushMetricSample(streams.cadence, startedAt, timestamp, readMetricNumber(sample, 'rate', 'rpm'));
      } else if (type.includes('distance')) {
        pushMetricSample(
          streams.distance,
          startedAt,
          timestamp,
          readMetricNumber(record, 'distance.inMeters', 'distance'),
        );
      } else if (type.includes('temperature')) {
        pushMetricSample(streams.temperature, startedAt, timestamp, readMetricNumber(sample, 'temperature.inCelsius'));
      }
    }
  }

  return streams;
}

function sumRecords(records: JsonRecord[], predicate: (type: string) => boolean, ...paths: string[]): number | null {
  const total = records.reduce((sum, record) => {
    if (!predicate(getRecordType(record))) return sum;
    return sum + (readMetricNumber(record, ...paths) ?? 0);
  }, 0);
  return total > 0 ? total : null;
}

function average(values: number[]): number | null {
  const safeValues = values.filter(value => Number.isFinite(value));
  return safeValues.length > 0 ? safeValues.reduce((sum, value) => sum + value, 0) / safeValues.length : null;
}

function max(values: number[]): number | null {
  const safeValues = values.filter(value => Number.isFinite(value));
  return safeValues.length > 0 ? Math.max(...safeValues) : null;
}

function min(values: number[]): number | null {
  const safeValues = values.filter(value => Number.isFinite(value));
  return safeValues.length > 0 ? Math.min(...safeValues) : null;
}

function readNativeZones(workout: JsonRecord): CanonicalActivityHeartRateZone[] {
  const rawZones = Array.isArray(workout.heartRateZones)
    ? workout.heartRateZones
    : Array.isArray(workout.heart_rate_zones)
      ? workout.heart_rate_zones
      : [];
  const zones = rawZones.filter(isRecord).flatMap(zone => {
    const zoneNumber = readMetricNumber(zone, 'zone');
    const durationSeconds =
      readMetricNumber(zone, 'durationSeconds', 'duration_seconds') ??
      (readMetricNumber(zone, 'durationMinutes') != null
        ? (readMetricNumber(zone, 'durationMinutes') as number) * 60
        : null);
    if (zoneNumber == null || durationSeconds == null || zoneNumber < 1 || zoneNumber > 5 || durationSeconds <= 0) {
      return [];
    }
    return [{ zone: Math.round(zoneNumber) as 1 | 2 | 3 | 4 | 5, durationSeconds: Math.round(durationSeconds) }];
  });
  const total = zones.reduce((sum, zone) => sum + zone.durationSeconds, 0);
  return total > 0 ? zones.map(zone => ({ ...zone, percentage: (zone.durationSeconds / total) * 100 })) : [];
}

function resolveHeartRateZone(normalisedHeartRate: number): 1 | 2 | 3 | 4 | 5 {
  if (normalisedHeartRate >= 0.9) return 5;
  if (normalisedHeartRate >= 0.8) return 4;
  if (normalisedHeartRate >= 0.7) return 3;
  if (normalisedHeartRate >= 0.6) return 2;
  return 1;
}

function buildHeartRateZonesFromStream(
  stream: CanonicalActivityMetricSample[],
  estimatedMaxHeartRate?: number | null,
): CanonicalActivityHeartRateZone[] {
  const samples = stream.map(sample => sample.value).filter(value => Number.isFinite(value) && value > 0);
  if (samples.length === 0) return [];
  const effectiveMax =
    estimatedMaxHeartRate != null && Number.isFinite(estimatedMaxHeartRate) && estimatedMaxHeartRate > 0
      ? estimatedMaxHeartRate
      : max(samples);
  if (effectiveMax == null || effectiveMax <= 0) return [];
  const durations = [0, 0, 0, 0, 0];
  for (const bpm of samples) durations[resolveHeartRateZone(bpm / effectiveMax) - 1] += 1;
  return ([1, 2, 3, 4, 5] as const)
    .map(zone => ({
      zone,
      durationSeconds: durations[zone - 1],
      percentage: (durations[zone - 1] / samples.length) * 100,
    }))
    .filter(zone => zone.durationSeconds > 0);
}

function mapLaps(workout: JsonRecord, startedAt: string | null): CanonicalActivity['laps'] {
  const laps = Array.isArray(workout.laps) ? workout.laps.filter(isRecord) : [];
  return laps.map((lap, index) => {
    const start = normaliseTimestamp(lap.startTime ?? lap.start);
    const end = normaliseTimestamp(lap.endTime ?? lap.end);
    const durationSeconds = readMetricNumber(lap, 'durationSeconds') ?? deriveDurationSeconds(start, end);
    const distanceM = readMetricNumber(lap, 'length.inMeters', 'distance.inMeters', 'distanceM', 'distance');
    return {
      lapIndex: index + 1,
      lapType: 'unknown',
      distanceM,
      durationSeconds,
      avgPaceSecondsPerKm:
        distanceM != null && durationSeconds != null && distanceM > 0 ? durationSeconds / (distanceM / 1000) : null,
      avgHeartRate: readMetricNumber(lap, 'avgHeartRate', 'averageHeartRate'),
      maxHeartRate: readMetricNumber(lap, 'maxHeartRate'),
      startOffsetSeconds: resolveOffsetSeconds(startedAt, start),
      endOffsetSeconds: resolveOffsetSeconds(startedAt, end),
    };
  });
}

function readDevice(workout: JsonRecord): CanonicalActivity['device'] {
  const device = isRecord(readNested(workout, 'metadata.device'))
    ? (readNested(workout, 'metadata.device') as JsonRecord)
    : isRecord(workout.device)
      ? workout.device
      : null;
  if (!device) return null;
  return {
    name: readString(device.name) ?? readString(device.manufacturer),
    model: readString(device.model),
    serial: readString(device.serial) ?? readString(device.uid),
  };
}

export function parseHealthConnectActivityJsonToCanonical(
  rawJson: string,
  filename: string,
  options?: ParseHealthConnectActivityOptions,
): CanonicalActivity {
  const parsed = JSON.parse(rawJson) as unknown;
  if (!isRecord(parsed)) throw new Error('Invalid JSON file.');

  const workout = selectWorkout(parsed);
  const startedAt = normaliseTimestamp(workout.startTime ?? workout.start);
  const endedAt = normaliseTimestamp(workout.endTime ?? workout.end);
  const durationSeconds =
    readMetricNumber(workout, 'durationSeconds', 'duration') ?? deriveDurationSeconds(startedAt, endedAt);
  const records = readAssociatedRecords(readRecords(parsed), workout, startedAt, endedAt);
  const streams = buildStreams(workout, records, startedAt);
  const heartRateValues = streams.heartRate.map(sample => sample.value);
  const speedValues = streams.speed.map(sample => sample.value);
  const powerValues = streams.power.map(sample => sample.value);
  const cadenceValues = streams.cadence.map(sample => sample.value);
  const temperatureValues = streams.temperature.map(sample => sample.value);
  const sourcePackage = resolveSourcePackage(workout) ?? records.map(resolveSourcePackage).find(Boolean) ?? null;
  const sourceProviderKey = readString(parsed.sourceProviderKey) ?? resolveSourceProviderKey(sourcePackage);
  const sourceRecordId =
    readIdentifier(readNested(workout, 'metadata.id')) ?? readIdentifier(workout.id) ?? readIdentifier(workout.uuid);
  const sourceUpdatedAt = normaliseTimestamp(readNested(workout, 'metadata.lastModifiedTime'));
  const sport = mapHealthConnectSport(workout);
  const caloriesKcal =
    readMetricNumber(workout, 'activeCaloriesKcal', 'totalEnergyBurnedKcal', 'caloriesKcal') ??
    sumRecords(
      records,
      type => type.includes('activecalories') || type.includes('totalcalories'),
      'energy.inKilocalories',
      'energy',
      'caloriesKcal',
    );

  return {
    provider: 'health_connect',
    sourceFileType: 'json',
    sportType: sport.sportType,
    sportSubtype: sport.sportSubtype,
    providerActivityId: sourceRecordId,
    summary: {
      startedAt,
      endedAt,
      durationSeconds: roundNullable(durationSeconds),
      elapsedSeconds: roundNullable(durationSeconds),
      distanceM:
        readMetricNumber(workout, 'distanceM', 'totalDistance', 'distance.inMeters') ??
        sumRecords(records, type => type.includes('distance'), 'distance.inMeters', 'distance'),
      caloriesKcal: roundNullable(caloriesKcal),
      avgHeartRate: roundNullable(
        readMetricNumber(workout, 'avgHeartRate', 'averageHeartRate') ?? average(heartRateValues),
      ),
      maxHeartRate: roundNullable(readMetricNumber(workout, 'maxHeartRate') ?? max(heartRateValues)),
      minHeartRate: roundNullable(readMetricNumber(workout, 'minHeartRate') ?? min(heartRateValues)),
      avgSpeedMps: readMetricNumber(workout, 'avgSpeedMps', 'averageSpeed') ?? average(speedValues),
      maxSpeedMps: readMetricNumber(workout, 'maxSpeedMps', 'maxSpeed') ?? max(speedValues),
      avgCadence: readMetricNumber(workout, 'avgCadence', 'avgCyclingCadence') ?? average(cadenceValues),
      maxCadence: readMetricNumber(workout, 'maxCadence', 'maxCyclingCadence') ?? max(cadenceValues),
      avgPowerW: readMetricNumber(workout, 'avgPowerW', 'averagePower') ?? average(powerValues),
      maxPowerW: readMetricNumber(workout, 'maxPowerW', 'maxPower') ?? max(powerValues),
      elevationGainM:
        readMetricNumber(workout, 'elevationGainM', 'elevationGained.inMeters') ??
        sumRecords(records, type => type.includes('elevation'), 'elevation.inMeters', 'elevationGained.inMeters'),
      elevationLossM: readMetricNumber(workout, 'elevationLossM'),
      avgTemperatureC: readMetricNumber(workout, 'avgTemperatureC') ?? average(temperatureValues),
      maxTemperatureC: readMetricNumber(workout, 'maxTemperatureC') ?? max(temperatureValues),
      totalSteps:
        readMetricNumber(workout, 'steps', 'totalSteps') ??
        sumRecords(records, type => type.includes('steps') && !type.includes('cadence'), 'count', 'steps'),
      recoveryTimeSeconds: null,
      vo2Max: readMetricNumber(workout, 'vo2Max'),
      epoc: null,
      pte: null,
      tss: null,
    },
    streams,
    laps: mapLaps(workout, startedAt),
    heartRateZones: (() => {
      const nativeZones = readNativeZones(workout);
      return nativeZones.length > 0
        ? nativeZones
        : buildHeartRateZonesFromStream(streams.heartRate, options?.estimatedMaxHeartRate);
    })(),
    device: readDevice(workout),
    vendorFields: {
      sourceProvider: 'health_connect',
      channel: 'health_connect',
      healthConnectFilename: filename,
      healthConnectExerciseType: readString(workout.exerciseType) ?? readString(workout.type),
      sourceProviderKey,
      sourcePackage,
      dataOriginPackageName: sourcePackage,
      clientRecordId: readIdentifier(readNested(workout, 'metadata.clientRecordId')),
      healthConnectSegments: Array.isArray(workout.segments) ? workout.segments : [],
      rawMetadata: isRecord(workout.metadata) ? workout.metadata : null,
    },
    provenance: {
      sourceChannel: 'health_connect',
      sourcePackage,
      sourceProviderKey,
      sourceRecordId,
      sourceUpdatedAt,
    },
  };
}
