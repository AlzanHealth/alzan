import {
  CanonicalActivity,
  CanonicalActivityHeartRateZone,
  CanonicalActivityLap,
  CanonicalActivityMetricSample,
  CanonicalActivityPointSample,
  CanonicalActivitySportMapping,
  CanonicalActivityStreams,
  CanonicalSportSubtype,
  CanonicalSportType,
} from './activity-import-canonical.types';
import { parseGarminActivityFileToCanonical } from './garmin-activity-canonical.mapper';

type JsonRecord = Record<string, unknown>;

interface ParsePolarActivityOptions {
  estimatedMaxHeartRate?: number | null;
}

const V3_SAMPLE_HEART_RATE = '0';
const V3_SAMPLE_SPEED_KMH = '1';
const V3_SAMPLE_CADENCE = '2';
const V3_SAMPLE_ALTITUDE = '3';
const V3_SAMPLE_POWER = '4';
const V3_SAMPLE_RUNNING_CADENCE = '8';
const V3_SAMPLE_TEMPERATURE = '9';
const V3_SAMPLE_DISTANCE = '10';

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

function readNestedRecord(record: JsonRecord, key: string): JsonRecord | null {
  const value = record[key];
  return isRecord(value) ? value : null;
}

function readNestedNumber(record: JsonRecord, sectionKey: string, valueKey: string): number | null {
  const section = readNestedRecord(record, sectionKey);
  return section ? readNumber(section[valueKey]) : null;
}

function normaliseTimestamp(raw: unknown): string | null {
  const text = readString(raw);
  if (!text) return null;
  const timestamp = Date.parse(text);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

function normalisePolarLocalTimestamp(raw: unknown, offsetMinutes: number | null): string | null {
  const text = readString(raw);
  if (!text) return null;
  if (/[zZ]|[+-]\d\d:?\d\d$/.test(text)) return normaliseTimestamp(text);
  if (offsetMinutes == null) return normaliseTimestamp(text);
  const match = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?$/.exec(text);
  if (!match) return normaliseTimestamp(text);
  const [, year, month, day, hour, minute, second = '0'] = match;
  const utcMs =
    Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second)) -
    offsetMinutes * 60000;
  return Number.isFinite(utcMs) ? new Date(utcMs).toISOString() : null;
}

function parseIsoDurationSeconds(value: unknown): number | null {
  const text = readString(value);
  if (!text) return null;
  const match = /^P(?:\d+D)?T?(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?$/i.exec(text);
  if (!match) return null;
  const hours = Number.parseFloat(match[1] ?? '0');
  const minutes = Number.parseFloat(match[2] ?? '0');
  const seconds = Number.parseFloat(match[3] ?? '0');
  const total = hours * 3600 + minutes * 60 + seconds;
  return Number.isFinite(total) && total > 0 ? total : null;
}

function parseOffsetSeconds(value: unknown): number | null {
  const numberValue = readNumber(value);
  if (numberValue != null) return numberValue > 10000 ? numberValue / 1000 : numberValue;
  return parseIsoDurationSeconds(value);
}

function deriveEndTime(
  startedAt: string | null,
  durationSeconds: number | null,
  explicitEnd: string | null,
): string | null {
  if (explicitEnd) return explicitEnd;
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

function mapPolarSport(rawSport: string | null, rawDetailed: string | null): CanonicalActivitySportMapping {
  const sport = `${rawDetailed ?? ''} ${rawSport ?? ''}`.toUpperCase();
  if (sport.includes('WALKING')) return { sportType: 'running', sportSubtype: 'walk' };
  if (sport.includes('PADEL')) return { sportType: 'padel', sportSubtype: 'outdoor' };
  if (sport.includes('TENNIS')) return { sportType: 'tennis', sportSubtype: 'outdoor' };
  if (sport.includes('BASKETBALL')) return { sportType: 'basketball', sportSubtype: 'indoor' };
  if (sport.includes('SOCCER') || sport.includes('FUTSAL') || sport.includes('TEAMSPORTS_FOOTBALL')) {
    return { sportType: 'football', sportSubtype: 'outdoor' };
  }
  if (sport.includes('HIKING') || sport.includes('MOUNTAINEERING')) {
    return { sportType: 'hiking', sportSubtype: 'trail' };
  }
  if (sport.includes('OPEN_WATER')) return { sportType: 'swimming', sportSubtype: 'open_water' };
  if (sport.includes('POOL_SWIMMING') || sport.includes('SWIMMING_POOL')) {
    return { sportType: 'swimming', sportSubtype: 'pool' };
  }
  if (sport.includes('SWIMMING')) return { sportType: 'swimming', sportSubtype: null };
  if (sport.includes('TRAIL_RUNNING') || sport.includes('RUNNING_TRAIL')) {
    return { sportType: 'running', sportSubtype: 'trail' };
  }
  if (sport.includes('TREADMILL') || sport.includes('INDOOR_RUNNING')) {
    return { sportType: 'running', sportSubtype: 'indoor' };
  }
  if (sport.includes('TRACK_AND_FIELD') || sport.includes('TRACK_RUNNING')) {
    return { sportType: 'running', sportSubtype: 'track' };
  }
  if (sport.includes('RUNNING') || sport.includes('JOGGING') || sport.includes('ULTRARUNNING')) {
    if (
      sport.includes('RACE') ||
      sport.includes('CARRERA') ||
      sport.includes('MARATHON') ||
      sport.includes('MARATON') ||
      sport.includes('MARATÓN') ||
      sport.includes('COMPETITION') ||
      sport.includes('COMPETICIÓN')
    ) {
      return { sportType: 'running', sportSubtype: 'race' };
    }
    return { sportType: 'running', sportSubtype: 'road' };
  }
  if (sport.includes('INDOOR_CYCLING')) {
    return { sportType: 'cycling', sportSubtype: 'indoor' };
  }
  if (sport.includes('SPINNING')) {
    return { sportType: 'cycling', sportSubtype: 'spinning' };
  }
  if (sport.includes('GRAVEL')) {
    return { sportType: 'cycling', sportSubtype: 'gravel' };
  }
  if (sport.includes('MOUNTAIN_BIKING')) {
    return { sportType: 'cycling', sportSubtype: 'trail' };
  }
  if (sport.includes('CITY_CYCLING') || sport.includes('URBAN_CYCLING')) {
    return { sportType: 'cycling', sportSubtype: 'urban' };
  }
  if (sport.includes('CYCLING') || sport.includes('BIKING') || sport.includes('E_BIKE')) {
    return { sportType: 'cycling', sportSubtype: 'road' };
  }
  if (sport.includes('STRENGTH_TRAINING')) return { sportType: 'strength', sportSubtype: 'indoor' };
  if (sport.includes('FITNESS') || sport.includes('ELLIPTICAL') || sport.includes('ROWING')) {
    return { sportType: 'gym', sportSubtype: 'indoor' };
  }
  return { sportType: 'other', sportSubtype: null };
}

function readPolarSport(record: JsonRecord, exercise: JsonRecord): string | null {
  const exerciseSport = exercise.sport;
  const sessionSport = record.sport;
  if (isRecord(exerciseSport)) return readIdentifier(exerciseSport.id) ?? readString(exerciseSport.name);
  if (isRecord(sessionSport)) return readIdentifier(sessionSport.id) ?? readString(sessionSport.name);
  return (
    readString(exercise.sport) ??
    readString(record.sport) ??
    readString(record.sport_type) ??
    readString(record.sportType)
  );
}

function readPolarDetailedSport(record: JsonRecord, exercise: JsonRecord): string | null {
  return (
    readString(exercise.detailed_sport_info) ??
    readString(exercise.detailedSportInfo) ??
    readString(record.detailed_sport_info) ??
    readString(record.detailedSportInfo)
  );
}

function readPrimaryExercise(record: JsonRecord): JsonRecord {
  const exercises = Array.isArray(record.exercises) ? record.exercises.filter(isRecord) : [];
  if (exercises.length === 0) return {};
  return exercises.reduce((selected, exercise) => {
    const selectedScore = (readNumber(selected.durationMillis) ?? 0) + (readNumber(selected.distanceMeters) ?? 0);
    const exerciseScore = (readNumber(exercise.durationMillis) ?? 0) + (readNumber(exercise.distanceMeters) ?? 0);
    return exerciseScore > selectedScore ? exercise : selected;
  }, exercises[0]);
}

function readStartedAt(record: JsonRecord, exercise: JsonRecord): string | null {
  const offset = readNumber(record.start_time_utc_offset) ?? readNumber(exercise.start_time_utc_offset);
  return (
    normaliseTimestamp(exercise.startTime) ??
    normaliseTimestamp(record.startTime) ??
    normalisePolarLocalTimestamp(exercise.start_time, offset) ??
    normalisePolarLocalTimestamp(record.start_time, offset)
  );
}

function readDurationSeconds(record: JsonRecord, exercise: JsonRecord): number | null {
  const millis = readNumber(exercise.durationMillis) ?? readNumber(record.durationMillis);
  if (millis != null) return millis / 1000;
  return (
    parseIsoDurationSeconds(exercise.duration) ??
    parseIsoDurationSeconds(record.duration) ??
    readNumber(exercise.durationSeconds) ??
    readNumber(record.durationSeconds) ??
    readNumber(record.duration)
  );
}

function readProviderActivityId(record: JsonRecord, exercise: JsonRecord): string | null {
  const exerciseIdentifier = readNestedRecord(exercise, 'identifier');
  const sessionIdentifier = readNestedRecord(record, 'identifier');
  return (
    readIdentifier(exerciseIdentifier?.id) ??
    readIdentifier(sessionIdentifier?.id) ??
    readIdentifier(exercise.id) ??
    readIdentifier(record.id)
  );
}

function readDevice(record: JsonRecord): CanonicalActivity['device'] {
  const product = readNestedRecord(record, 'product');
  return {
    name: readString(record.device) ?? readString(product?.modelName) ?? 'Polar',
    model: readString(product?.modelName) ?? readString(record.device),
    serial: readString(record.device_id) ?? readString(record.deviceId),
  };
}

function parseV3SampleValues(sample: JsonRecord): number[] {
  const data = readString(sample.data);
  if (!data) return [];
  return data
    .split(',')
    .map(value => (value.trim().toLowerCase() === 'null' ? null : readNumber(value)))
    .filter((value): value is number => value != null);
}

function pushV3Sample(sample: JsonRecord, startedAt: string | null, streams: CanonicalActivityStreams): void {
  const sampleType = readString(sample['sample-type']) ?? readString(sample.sampleType);
  const recordingRate = readNumber(sample['recording-rate']) ?? readNumber(sample.recordingRate) ?? 1;
  const values = parseV3SampleValues(sample);
  values.forEach((value, index) => {
    const offsetSeconds = index * recordingRate;
    if (sampleType === V3_SAMPLE_HEART_RATE) pushMetricSample(streams.heartRate, startedAt, offsetSeconds, value);
    if (sampleType === V3_SAMPLE_SPEED_KMH) pushMetricSample(streams.speed, startedAt, offsetSeconds, value / 3.6);
    if (sampleType === V3_SAMPLE_CADENCE || sampleType === V3_SAMPLE_RUNNING_CADENCE) {
      pushMetricSample(streams.cadence, startedAt, offsetSeconds, value);
    }
    if (sampleType === V3_SAMPLE_ALTITUDE) pushMetricSample(streams.altitude, startedAt, offsetSeconds, value);
    if (sampleType === V3_SAMPLE_POWER) pushMetricSample(streams.power, startedAt, offsetSeconds, value);
    if (sampleType === V3_SAMPLE_TEMPERATURE) pushMetricSample(streams.temperature, startedAt, offsetSeconds, value);
    if (sampleType === V3_SAMPLE_DISTANCE) pushMetricSample(streams.distance, startedAt, offsetSeconds, value);
  });
}

function normaliseV4SampleType(rawType: string | null): string {
  return rawType?.trim().toUpperCase() ?? '';
}

function pushV4Sample(sample: JsonRecord, startedAt: string | null, streams: CanonicalActivityStreams): void {
  const type = normaliseV4SampleType(readString(sample.type));
  const intervalSeconds = (readNumber(sample.intervalMillis) ?? 1000) / 1000;
  const values = Array.isArray(sample.values) ? sample.values.map(readNumber) : [];
  values.forEach((value, index) => {
    if (value == null) return;
    const offsetSeconds = index * intervalSeconds;
    if (type === 'HEART_RATE') pushMetricSample(streams.heartRate, startedAt, offsetSeconds, value);
    if (type === 'SPEED') pushMetricSample(streams.speed, startedAt, offsetSeconds, value);
    if (type === 'DISTANCE') pushMetricSample(streams.distance, startedAt, offsetSeconds, value);
    if (type === 'ALTITUDE') pushMetricSample(streams.altitude, startedAt, offsetSeconds, value);
    if (type === 'CADENCE') pushMetricSample(streams.cadence, startedAt, offsetSeconds, value);
    if (type.includes('POWER')) pushMetricSample(streams.power, startedAt, offsetSeconds, value);
    if (type === 'TEMPERATURE' || type === 'BODY_TEMPERATURE') {
      pushMetricSample(streams.temperature, startedAt, offsetSeconds, value);
    }
  });
}

function pushFlatSample(sample: JsonRecord, startedAt: string | null, streams: CanonicalActivityStreams): void {
  const timestamp = normaliseTimestamp(sample.timestamp ?? sample.time ?? sample.startTime);
  const offsetSeconds = resolveOffsetSeconds(startedAt, timestamp);
  pushPositionSample(
    streams.position,
    startedAt,
    offsetSeconds,
    readNumber(sample.latitude) ?? readNumber(sample.lat),
    readNumber(sample.longitude) ?? readNumber(sample.lon) ?? readNumber(sample.lng),
  );
  pushMetricSample(
    streams.heartRate,
    startedAt,
    offsetSeconds,
    readNumber(sample.heart_rate) ?? readNumber(sample.heartRate) ?? readNumber(sample.hr),
  );
  pushMetricSample(streams.speed, startedAt, offsetSeconds, readNumber(sample.speed) ?? readNumber(sample.speedMps));
  pushMetricSample(
    streams.distance,
    startedAt,
    offsetSeconds,
    readNumber(sample.distance) ?? readNumber(sample.distanceMeters),
  );
  pushMetricSample(streams.altitude, startedAt, offsetSeconds, readNumber(sample.altitude));
  pushMetricSample(streams.cadence, startedAt, offsetSeconds, readNumber(sample.cadence));
  pushMetricSample(streams.power, startedAt, offsetSeconds, readNumber(sample.power) ?? readNumber(sample.powerW));
  pushMetricSample(streams.temperature, startedAt, offsetSeconds, readNumber(sample.temperature));
}

function pushPolarRoute(
  record: JsonRecord,
  exercise: JsonRecord,
  startedAt: string | null,
  streams: CanonicalActivityStreams,
): void {
  const v3Route = Array.isArray(record.route) ? record.route.filter(isRecord) : [];
  v3Route.forEach(point => {
    pushPositionSample(
      streams.position,
      startedAt,
      parseOffsetSeconds(point.time),
      readNumber(point.latitude),
      readNumber(point.longitude),
    );
  });
  const routes = readNestedRecord(exercise, 'routes') ?? readNestedRecord(record, 'routes');
  const route = routes ? readNestedRecord(routes, 'route') : null;
  const wayPoints = route && Array.isArray(route.wayPoints) ? route.wayPoints.filter(isRecord) : [];
  wayPoints.forEach(point => {
    const offsetSeconds = parseOffsetSeconds(point.elapsedMillis);
    pushPositionSample(
      streams.position,
      startedAt,
      offsetSeconds,
      readNumber(point.latitude),
      readNumber(point.longitude),
    );
    pushMetricSample(streams.altitude, startedAt, offsetSeconds, readNumber(point.altitude));
  });
}

function buildPolarStreams(
  record: JsonRecord,
  exercise: JsonRecord,
  startedAt: string | null,
): CanonicalActivityStreams {
  const streams = cloneEmptyStreams();
  const samples = [
    ...(Array.isArray(record.samples) ? record.samples.filter(isRecord) : []),
    ...(Array.isArray(exercise.samples) ? exercise.samples.filter(isRecord) : []),
  ];
  samples.forEach(sample => {
    if ('sample-type' in sample || 'sampleType' in sample) pushV3Sample(sample, startedAt, streams);
    if ('type' in sample && 'values' in sample) pushV4Sample(sample, startedAt, streams);
    if ('timestamp' in sample || 'heart_rate' in sample || 'heartRate' in sample)
      pushFlatSample(sample, startedAt, streams);
  });
  pushPolarRoute(record, exercise, startedAt, streams);
  return streams;
}

function calculateAverage(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function calculateMax(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((highest, value) => (value > highest ? value : highest), values[0]);
}

function readStreamValues(stream: CanonicalActivityMetricSample[]): number[] {
  return stream.map(sample => sample.value).filter(value => Number.isFinite(value));
}

function calculatePaceSecondsPerKm(durationSeconds: number | null, distanceM: number | null): number | null {
  if (durationSeconds == null || distanceM == null || durationSeconds <= 0 || distanceM <= 0) return null;
  return durationSeconds / (distanceM / 1000);
}

function mapPolarLap(
  lap: JsonRecord,
  index: number,
  startedAt: string | null,
  lapType: CanonicalActivityLap['lapType'],
): CanonicalActivityLap {
  const distanceM = readNumber(lap.distanceMeters) ?? readNumber(lap.distance);
  const durationSeconds =
    readNumber(lap.durationMillis) != null
      ? (readNumber(lap.durationMillis) ?? 0) / 1000
      : readNumber(lap.durationSeconds);
  const startOffsetSeconds =
    parseOffsetSeconds(lap.startLocationTimeMillis) ??
    parseOffsetSeconds(lap.splitTimeMillis) ??
    resolveOffsetSeconds(startedAt, normaliseTimestamp(lap.startTime));
  const endOffsetSeconds =
    startOffsetSeconds != null && durationSeconds != null ? startOffsetSeconds + durationSeconds : null;
  return {
    lapIndex: index + 1,
    lapType,
    distanceM,
    durationSeconds,
    avgPaceSecondsPerKm: calculatePaceSecondsPerKm(durationSeconds ?? null, distanceM),
    avgHeartRate: readNestedNumber(lap, 'statistics', 'hrAvg') ?? readNumber(lap.hrAvg),
    maxHeartRate: readNestedNumber(lap, 'statistics', 'hrMax') ?? readNumber(lap.hrMax),
    startOffsetSeconds,
    endOffsetSeconds,
  };
}

function mapPolarLaps(exercise: JsonRecord, startedAt: string | null): CanonicalActivityLap[] {
  const manualLaps = Array.isArray(exercise.laps) ? exercise.laps.filter(isRecord) : [];
  const autoLaps = Array.isArray(exercise.autoLaps) ? exercise.autoLaps.filter(isRecord) : [];
  return [
    ...manualLaps.map((lap, index) => mapPolarLap(lap, index, startedAt, 'manual')),
    ...autoLaps.map((lap, index) => mapPolarLap(lap, manualLaps.length + index, startedAt, 'auto')),
  ].filter(
    lap => (lap.distanceM != null && lap.distanceM > 0) || (lap.durationSeconds != null && lap.durationSeconds > 0),
  );
}

function readZoneDurationSeconds(zone: JsonRecord): number {
  const explicit = readNumber(zone.durationSeconds);
  if (explicit != null) return Math.max(0, explicit);
  const inZone = zone['in-zone'] ?? zone.inZone;
  const millisOrSeconds = readNumber(inZone);
  if (millisOrSeconds != null) return Math.max(0, millisOrSeconds > 10000 ? millisOrSeconds / 1000 : millisOrSeconds);
  return Math.max(0, parseIsoDurationSeconds(inZone) ?? 0);
}

function buildHeartRateZonesFromPolar(record: JsonRecord, exercise: JsonRecord): CanonicalActivityHeartRateZone[] {
  const rawZones = [
    ...(Array.isArray(record.heart_rate_zones) ? record.heart_rate_zones.filter(isRecord) : []),
    ...(Array.isArray(record.heartRateZones) ? record.heartRateZones.filter(isRecord) : []),
    ...(Array.isArray(exercise.zones) ? exercise.zones.filter(isRecord) : []),
  ].filter(zone => {
    const type = readString(zone.type)?.toUpperCase();
    return !type || type === 'ZONE_TYPE_HEART_RATE' || type === 'HEART_RATE' || type === 'HEARTRATE';
  });
  const durations = rawZones.slice(0, 5).map(readZoneDurationSeconds);
  const total = durations.reduce((sum, value) => sum + value, 0);
  if (total <= 0) return [];
  return durations
    .map((duration, index) => ({
      zone: Math.min(5, Math.max(1, Math.round(readNumber(rawZones[index]?.index) ?? index + 1))) as 1 | 2 | 3 | 4 | 5,
      durationSeconds: Math.round(duration),
      percentage: Math.round((duration / total) * 100),
    }))
    .filter(zone => zone.durationSeconds > 0);
}

function getHeartRateZoneIndex(heartRate: number, maxHeartRate: number): number {
  const ratio = heartRate / maxHeartRate;
  if (ratio < 0.7) return 0;
  if (ratio < 0.8) return 1;
  if (ratio < 0.9) return 2;
  if (ratio < 0.95) return 3;
  return 4;
}

function buildHeartRateZones(
  heartRateStream: CanonicalActivityMetricSample[],
  durationSeconds: number | null,
  estimatedMaxHeartRate?: number | null,
): CanonicalActivityHeartRateZone[] {
  const samples = heartRateStream.filter(sample => sample.value > 0);
  if (samples.length === 0) return [];
  const observedMax = samples.reduce((max, sample) => Math.max(max, sample.value), 0);
  const maxHeartRate = estimatedMaxHeartRate != null && estimatedMaxHeartRate > 0 ? estimatedMaxHeartRate : observedMax;
  if (maxHeartRate <= 0) return [];
  const buckets = [0, 0, 0, 0, 0];
  if (samples.length === 1) {
    buckets[getHeartRateZoneIndex(samples[0].value, maxHeartRate)] = durationSeconds ?? 1;
  } else {
    samples.forEach((sample, index) => {
      const next = samples[index + 1];
      const seconds =
        sample.offsetSeconds != null && next?.offsetSeconds != null
          ? Math.max(1, next.offsetSeconds - sample.offsetSeconds)
          : durationSeconds != null
            ? Math.max(1, durationSeconds / samples.length)
            : 1;
      buckets[getHeartRateZoneIndex(sample.value, maxHeartRate)] += seconds;
    });
  }
  const total = buckets.reduce((sum, value) => sum + value, 0);
  if (total <= 0) return [];
  return buckets
    .map((duration, index) => ({
      zone: (index + 1) as 1 | 2 | 3 | 4 | 5,
      durationSeconds: Math.round(duration),
      percentage: Math.round((duration / total) * 100),
    }))
    .filter(zone => zone.durationSeconds > 0);
}

function addVendorField(target: Record<string, unknown>, key: string, value: unknown): void {
  if (value == null) return;
  target[key] = value;
}

function buildVendorFields(
  record: JsonRecord,
  exercise: JsonRecord,
  sport: string | null,
  detailed: string | null,
): Record<string, unknown> {
  const vendorFields: Record<string, unknown> = {
    sourceProvider: 'polar',
    polarSport: sport,
  };
  addVendorField(vendorFields, 'polarDetailedSportInfo', detailed);
  addVendorField(
    vendorFields,
    'polarTrainingLoad',
    readNumber(exercise.trainingLoad) ?? readNumber(record.trainingLoad),
  );
  addVendorField(vendorFields, 'polarTrainingLoadPro', record.training_load_pro ?? record.trainingLoadPro);
  addVendorField(vendorFields, 'polarTrainingLoadReport', exercise.trainingLoadReport ?? record.trainingLoadReport);
  addVendorField(
    vendorFields,
    'polarRunningIndex',
    readNumber(exercise.runningIndex) ?? readNumber(record['running-index']),
  );
  addVendorField(vendorFields, 'polarTrainingBenefit', readString(record.trainingBenefit));
  addVendorField(vendorFields, 'polarHillSplits', exercise.hillSplits ?? record.hillSplits);
  addVendorField(vendorFields, 'polarSwimmingStatistics', exercise.swimmingStatistics ?? record.swimmingStatistics);
  addVendorField(
    vendorFields,
    'polarStrengthTrainingResults',
    exercise.strengthTrainingResults ?? record.strengthTrainingResults,
  );
  addVendorField(vendorFields, 'polarPauseTimes', exercise.pauseTimes ?? record.pauseTimes);
  addVendorField(vendorFields, 'polarPhysicalInformation', exercise.physicalInformation ?? record.physicalInformation);
  return vendorFields;
}

function buildCanonicalActivity(params: {
  sourceFileType: 'fit' | 'json';
  sportType: CanonicalSportType;
  sportSubtype: CanonicalSportSubtype | null;
  providerActivityId: string | null;
  summary: Partial<CanonicalActivity['summary']>;
  streams: CanonicalActivityStreams;
  laps: CanonicalActivityLap[];
  heartRateZones: CanonicalActivityHeartRateZone[];
  device: CanonicalActivity['device'];
  vendorFields: Record<string, unknown>;
  estimatedMaxHeartRate?: number | null;
}): CanonicalActivity {
  const heartRates = readStreamValues(params.streams.heartRate);
  const speeds = readStreamValues(params.streams.speed);
  const cadence = readStreamValues(params.streams.cadence);
  const power = readStreamValues(params.streams.power);
  const temperature = readStreamValues(params.streams.temperature);
  const durationSeconds = roundNullable(params.summary.durationSeconds);
  const distanceM = params.summary.distanceM ?? null;
  const summary: CanonicalActivity['summary'] = {
    startedAt: params.summary.startedAt ?? null,
    endedAt:
      params.summary.endedAt ??
      deriveEndTime(params.summary.startedAt ?? null, params.summary.elapsedSeconds ?? durationSeconds, null),
    durationSeconds,
    elapsedSeconds: roundNullable(params.summary.elapsedSeconds ?? durationSeconds),
    distanceM,
    caloriesKcal: roundNullable(params.summary.caloriesKcal),
    avgHeartRate: roundNullable(params.summary.avgHeartRate ?? calculateAverage(heartRates)),
    maxHeartRate: roundNullable(params.summary.maxHeartRate ?? calculateMax(heartRates)),
    minHeartRate: roundNullable(
      params.summary.minHeartRate ?? (heartRates.length > 0 ? Math.min(...heartRates) : null),
    ),
    avgSpeedMps:
      params.summary.avgSpeedMps ??
      calculateAverage(speeds) ??
      (durationSeconds && distanceM ? distanceM / durationSeconds : null),
    maxSpeedMps: params.summary.maxSpeedMps ?? calculateMax(speeds),
    avgCadence: roundNullable(params.summary.avgCadence ?? calculateAverage(cadence)),
    maxCadence: roundNullable(params.summary.maxCadence ?? calculateMax(cadence)),
    avgPowerW: roundNullable(params.summary.avgPowerW ?? calculateAverage(power)),
    maxPowerW: roundNullable(params.summary.maxPowerW ?? calculateMax(power)),
    elevationGainM: params.summary.elevationGainM ?? null,
    elevationLossM: params.summary.elevationLossM ?? null,
    avgTemperatureC: params.summary.avgTemperatureC ?? calculateAverage(temperature),
    maxTemperatureC: params.summary.maxTemperatureC ?? calculateMax(temperature),
    totalSteps: roundNullable(params.summary.totalSteps),
    recoveryTimeSeconds: roundNullable(params.summary.recoveryTimeSeconds),
    vo2Max: params.summary.vo2Max ?? null,
    epoc: params.summary.epoc ?? null,
    pte: params.summary.pte ?? null,
    tss: params.summary.tss ?? null,
  };
  return {
    provider: 'polar',
    sourceFileType: params.sourceFileType,
    sportType: params.sportType,
    sportSubtype: params.sportSubtype,
    providerActivityId: params.providerActivityId,
    summary,
    streams: params.streams,
    laps: params.laps,
    heartRateZones:
      params.heartRateZones.length > 0
        ? params.heartRateZones
        : buildHeartRateZones(params.streams.heartRate, summary.durationSeconds, params.estimatedMaxHeartRate),
    device: params.device,
    vendorFields: params.vendorFields,
  };
}

function parsePolarJson(rawJson: string, filename: string, options?: ParsePolarActivityOptions): CanonicalActivity {
  const parsed = JSON.parse(rawJson) as unknown;
  if (!isRecord(parsed)) throw new Error('Invalid Polar JSON file.');
  const exercise = readPrimaryExercise(parsed);
  const sport = readPolarSport(parsed, exercise);
  const detailedSport = readPolarDetailedSport(parsed, exercise);
  const sportMapping = mapPolarSport(sport, detailedSport);
  const startedAt = readStartedAt(parsed, exercise);
  const durationSeconds = readDurationSeconds(parsed, exercise);
  const endedAt =
    normaliseTimestamp(exercise.stopTime) ??
    normaliseTimestamp(parsed.stopTime) ??
    deriveEndTime(startedAt, durationSeconds, null);
  const streams = buildPolarStreams(parsed, exercise, startedAt);
  const vendorFields = buildVendorFields(parsed, exercise, sport, detailedSport);
  addVendorField(vendorFields, 'polarFilename', filename);
  return buildCanonicalActivity({
    sourceFileType: 'json',
    sportType: sportMapping.sportType,
    sportSubtype: sportMapping.sportSubtype,
    providerActivityId: readProviderActivityId(parsed, exercise),
    summary: {
      startedAt,
      endedAt,
      durationSeconds,
      elapsedSeconds: durationSeconds,
      distanceM:
        readNumber(exercise.distanceMeters) ?? readNumber(parsed.distanceMeters) ?? readNumber(parsed.distance),
      caloriesKcal: readNumber(exercise.calories) ?? readNumber(parsed.calories),
      avgHeartRate:
        readNumber(exercise.hrAvg) ??
        readNumber(parsed.hrAvg) ??
        readNumber(parsed.average_heart_rate) ??
        readNumber(parsed.averageHeartRate) ??
        readNestedNumber(parsed, 'heart_rate', 'average'),
      maxHeartRate:
        readNumber(exercise.hrMax) ??
        readNumber(parsed.hrMax) ??
        readNumber(parsed.maximum_heart_rate) ??
        readNumber(parsed.maximumHeartRate) ??
        readNestedNumber(parsed, 'heart_rate', 'maximum'),
      avgSpeedMps: readNumber(exercise.avgSpeedMps) ?? readNumber(parsed.avgSpeedMps),
      maxSpeedMps: readNumber(exercise.maxSpeedMps) ?? readNumber(parsed.maxSpeedMps),
      avgCadence: readNumber(exercise.avgCadence) ?? readNumber(parsed.avgCadence),
      maxCadence: readNumber(exercise.maxCadence) ?? readNumber(parsed.maxCadence),
      avgPowerW: readNumber(exercise.avgPowerW) ?? readNumber(parsed.avgPowerW),
      maxPowerW: readNumber(exercise.maxPowerW) ?? readNumber(parsed.maxPowerW),
      elevationGainM: readNumber(exercise.ascentMeters) ?? readNumber(parsed.ascentMeters),
      elevationLossM: readNumber(exercise.descentMeters) ?? readNumber(parsed.descentMeters),
      avgTemperatureC: readNumber(exercise.avgTemperatureC) ?? readNumber(parsed.avgTemperatureC),
      maxTemperatureC: readNumber(exercise.maxTemperatureC) ?? readNumber(parsed.maxTemperatureC),
      totalSteps: readNumber(exercise.steps) ?? readNumber(parsed.steps),
      recoveryTimeSeconds:
        readNumber(exercise.recoveryTimeMillis) != null
          ? (readNumber(exercise.recoveryTimeMillis) ?? 0) / 1000
          : readNumber(parsed.recoveryTimeMillis) != null
            ? (readNumber(parsed.recoveryTimeMillis) ?? 0) / 1000
            : null,
      vo2Max: readNestedNumber(parsed, 'physicalInformation', 'vo2Max'),
      tss: readNestedNumber(exercise, 'trainingPeaksStatistics', 'trainingStressScore'),
    },
    streams,
    laps: mapPolarLaps(exercise, startedAt),
    heartRateZones: buildHeartRateZonesFromPolar(parsed, exercise),
    device: readDevice(parsed),
    vendorFields,
    estimatedMaxHeartRate: options?.estimatedMaxHeartRate,
  });
}

function parsePolarFit(binary: Uint8Array, filename: string, options?: ParsePolarActivityOptions): CanonicalActivity {
  const canonical = parseGarminActivityFileToCanonical(binary, filename, options);
  return {
    ...canonical,
    provider: 'polar',
    device: {
      name: canonical.device?.name ?? 'Polar',
      model: canonical.device?.model ?? null,
      serial: canonical.device?.serial ?? null,
    },
    vendorFields: {
      ...canonical.vendorFields,
      sourceProvider: 'polar',
      polarFitProviderAssumed: true,
      polarFilename: filename,
    },
  };
}

export function parsePolarActivityFileToCanonical(
  content: string | Uint8Array,
  filename: string,
  options?: ParsePolarActivityOptions,
): CanonicalActivity {
  if (typeof content === 'string') return parsePolarJson(content, filename, options);
  return parsePolarFit(content, filename, options);
}
