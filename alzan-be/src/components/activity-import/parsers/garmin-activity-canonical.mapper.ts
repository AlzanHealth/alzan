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
import { mapClimbingTextToCanonical } from './climbing-sport.mapper';
import { mapMartialArtsTextToCanonical } from './martial-arts-sport.mapper';
import { mapSkiingTextToCanonical } from './skiing-sport.mapper';
import { mapTrailTextToCanonical } from './trail-sport.mapper';
import { mapVolleyballTextToCanonical } from './volleyball-sport.mapper';

type JsonRecord = Record<string, unknown>;

interface ParseGarminActivityOptions {
  estimatedMaxHeartRate?: number | null;
}

interface FitFieldDefinition {
  fieldNumber: number;
  size: number;
  baseType: number;
}

interface FitDeveloperFieldDefinition {
  size: number;
}

interface FitMessageDefinition {
  littleEndian: boolean;
  globalMessageNumber: number;
  fields: FitFieldDefinition[];
  developerFields: FitDeveloperFieldDefinition[];
}

interface FitParseState {
  sport: number | null;
  subSport: number | null;
  manufacturer: number | null;
  product: number | null;
  summary: Partial<CanonicalActivity['summary']>;
  position: CanonicalActivityPointSample[];
  heartRate: CanonicalActivityMetricSample[];
  speed: CanonicalActivityMetricSample[];
  distance: CanonicalActivityMetricSample[];
  altitude: CanonicalActivityMetricSample[];
  cadence: CanonicalActivityMetricSample[];
  power: CanonicalActivityMetricSample[];
  temperature: CanonicalActivityMetricSample[];
  laps: CanonicalActivityLap[];
  nativeHeartRateZones: CanonicalActivityHeartRateZone[];
  device: CanonicalActivity['device'];
}

interface FitLapAccumulator {
  distanceM: number | null;
  durationSeconds: number | null;
  avgSpeedMps: number | null;
  avgHeartRate: number | null;
  maxHeartRate: number | null;
  startTimestampSeconds: number | null;
  lapType: CanonicalActivityLap['lapType'];
}

interface FitRecordAccumulator {
  timestampSeconds: number | null;
  lat: number | null;
  lon: number | null;
  altitudeM: number | null;
  heartRate: number | null;
  speedMps: number | null;
  distanceM: number | null;
  cadence: number | null;
  power: number | null;
  temperatureC: number | null;
}

const FIT_LOCAL_MESSAGE_TYPES = 16;
const FIT_FILE_ID_MESSAGE_NUMBER = 0;
const FIT_SESSION_MESSAGE_NUMBER = 18;
const FIT_LAP_MESSAGE_NUMBER = 19;
const FIT_RECORD_MESSAGE_NUMBER = 20;
const FIT_EPOCH_OFFSET_SECONDS = 631065600;
const FIT_INVALID_SINT32 = 2147483647;
const FIT_SEMICIRCLES_TO_DEGREES = 180 / 2147483648;

const EMPTY_STREAMS: CanonicalActivityStreams = {
  position: [],
  heartRate: [],
  speed: [],
  distance: [],
  altitude: [],
  cadence: [],
  power: [],
  temperature: [],
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

function unixSecondsToIso(value: number | null): string | null {
  if (value == null || !Number.isFinite(value) || value <= 0) return null;
  return new Date(value * 1000).toISOString();
}

function deriveEndTime(startedAt: string | null, durationSeconds: number | null): string | null {
  if (!startedAt || durationSeconds == null || durationSeconds <= 0) return null;
  return new Date(new Date(startedAt).getTime() + durationSeconds * 1000).toISOString();
}

function semicirclesToDegrees(value: number): number {
  return value * FIT_SEMICIRCLES_TO_DEGREES;
}

function fitTimestampToSeconds(value: number | null): number | null {
  if (value == null || value <= 0) return null;
  return value + FIT_EPOCH_OFFSET_SECONDS;
}

function secondsToIso(value: number | null): string | null {
  if (value == null || value <= 0) return null;
  return new Date(value * 1000).toISOString();
}

function resolveOffsetSeconds(startedAt: string | null, timestamp: string | null): number | null {
  if (!startedAt || !timestamp) return null;
  const startedMs = new Date(startedAt).getTime();
  const timestampMs = new Date(timestamp).getTime();
  if (!Number.isFinite(startedMs) || !Number.isFinite(timestampMs)) return null;
  return Math.max(0, Math.round((timestampMs - startedMs) / 1000));
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

function setLargest(
  target: Partial<CanonicalActivity['summary']>,
  key: keyof CanonicalActivity['summary'],
  value: number | null,
): void {
  if (value == null || !Number.isFinite(value) || value <= 0) return;
  const current = target[key];
  if (typeof current !== 'number' || value > current) {
    (target as Record<string, unknown>)[key] = value;
  }
}

function getFitBaseTypeSize(baseType: number): number | null {
  switch (baseType) {
    case 0x00:
    case 0x01:
    case 0x02:
    case 0x0a:
    case 0x0d:
      return 1;
    case 0x83:
    case 0x84:
    case 0x8b:
      return 2;
    case 0x85:
    case 0x86:
    case 0x88:
    case 0x8c:
      return 4;
    case 0x89:
    case 0x8e:
    case 0x8f:
    case 0x90:
      return 8;
    default:
      return null;
  }
}

function decodeFitFieldAsNumber(
  dataView: DataView,
  offset: number,
  size: number,
  baseType: number,
  littleEndian: boolean,
): number | null {
  const baseTypeSize = getFitBaseTypeSize(baseType);
  if (baseTypeSize == null || size < baseTypeSize) return null;
  switch (baseType) {
    case 0x00:
    case 0x02:
    case 0x0d: {
      const value = dataView.getUint8(offset);
      return value === 0xff ? null : value;
    }
    case 0x01: {
      const value = dataView.getInt8(offset);
      return value === 0x7f ? null : value;
    }
    case 0x83: {
      const value = dataView.getInt16(offset, littleEndian);
      return value === 0x7fff ? null : value;
    }
    case 0x84: {
      const value = dataView.getUint16(offset, littleEndian);
      return value === 0xffff ? null : value;
    }
    case 0x85: {
      const value = dataView.getInt32(offset, littleEndian);
      return value === FIT_INVALID_SINT32 ? null : value;
    }
    case 0x86: {
      const value = dataView.getUint32(offset, littleEndian);
      return value === 0xffffffff ? null : value;
    }
    case 0x88: {
      const value = dataView.getFloat32(offset, littleEndian);
      return Number.isFinite(value) ? value : null;
    }
    case 0x89: {
      const value = dataView.getFloat64(offset, littleEndian);
      return Number.isFinite(value) ? value : null;
    }
    default:
      return null;
  }
}

function decodeFitFieldAsNumbers(
  dataView: DataView,
  offset: number,
  size: number,
  baseType: number,
  littleEndian: boolean,
): number[] {
  const baseTypeSize = getFitBaseTypeSize(baseType);
  if (baseTypeSize == null || size < baseTypeSize) return [];
  const values: number[] = [];
  for (let relativeOffset = 0; relativeOffset + baseTypeSize <= size; relativeOffset += baseTypeSize) {
    const value = decodeFitFieldAsNumber(dataView, offset + relativeOffset, baseTypeSize, baseType, littleEndian);
    if (value != null && Number.isFinite(value)) values.push(value);
  }
  return values;
}

function buildHeartRateZonesFromFitSessionField(values: number[]): CanonicalActivityHeartRateZone[] {
  const durations = values.slice(0, 5).map(value => (Number.isFinite(value) && value > 0 ? value / 1000 : 0));
  const totalDuration = durations.reduce((sum, value) => sum + value, 0);
  if (totalDuration <= 0) return [];
  return durations
    .map((duration, index) => ({
      zone: (index + 1) as 1 | 2 | 3 | 4 | 5,
      durationSeconds: Math.round(duration),
      percentage: Math.round((duration / totalDuration) * 100),
    }))
    .filter(zone => zone.durationSeconds > 0);
}

function mapFitLapTrigger(triggerValue: number | null): CanonicalActivityLap['lapType'] {
  if (triggerValue == null) return 'unknown';
  if (triggerValue === 0) return 'manual';
  if (triggerValue === 1) return 'time';
  if (triggerValue === 2) return 'distance';
  return 'unknown';
}

function parseFitDefinitionMessage(
  dataView: DataView,
  offset: number,
  dataEnd: number,
  recordHeader: number,
): { nextOffset: number; definition: FitMessageDefinition } {
  const hasDeveloperData = (recordHeader & 0x20) !== 0;
  if (offset + 5 > dataEnd) throw new Error('Invalid Garmin FIT file.');
  offset += 1;
  const architecture = dataView.getUint8(offset);
  const littleEndian = architecture === 0;
  offset += 1;
  const globalMessageNumber = dataView.getUint16(offset, littleEndian);
  offset += 2;
  if (offset + 1 > dataEnd) throw new Error('Invalid Garmin FIT file.');
  const fieldCount = dataView.getUint8(offset);
  offset += 1;
  const fields: FitFieldDefinition[] = [];
  for (let index = 0; index < fieldCount; index += 1) {
    if (offset + 3 > dataEnd) throw new Error('Invalid Garmin FIT file.');
    fields.push({
      fieldNumber: dataView.getUint8(offset),
      size: dataView.getUint8(offset + 1),
      baseType: dataView.getUint8(offset + 2),
    });
    offset += 3;
  }
  const developerFields: FitDeveloperFieldDefinition[] = [];
  if (hasDeveloperData) {
    if (offset + 1 > dataEnd) throw new Error('Invalid Garmin FIT file.');
    const developerFieldCount = dataView.getUint8(offset);
    offset += 1;
    for (let index = 0; index < developerFieldCount; index += 1) {
      if (offset + 3 > dataEnd) throw new Error('Invalid Garmin FIT file.');
      developerFields.push({ size: dataView.getUint8(offset + 1) });
      offset += 3;
    }
  }
  return { nextOffset: offset, definition: { littleEndian, globalMessageNumber, fields, developerFields } };
}

function parseFitDataMessage(
  dataView: DataView,
  offset: number,
  dataEnd: number,
  definition: FitMessageDefinition,
  state: FitParseState,
): number {
  const record: FitRecordAccumulator = {
    timestampSeconds: null,
    lat: null,
    lon: null,
    altitudeM: null,
    heartRate: null,
    speedMps: null,
    distanceM: null,
    cadence: null,
    power: null,
    temperatureC: null,
  };
  const lap: FitLapAccumulator = {
    distanceM: null,
    durationSeconds: null,
    avgSpeedMps: null,
    avgHeartRate: null,
    maxHeartRate: null,
    startTimestampSeconds: null,
    lapType: 'unknown',
  };
  for (const field of definition.fields) {
    if (offset + field.size > dataEnd) throw new Error('Invalid Garmin FIT file.');
    const numericValue = decodeFitFieldAsNumber(dataView, offset, field.size, field.baseType, definition.littleEndian);
    if (definition.globalMessageNumber === FIT_FILE_ID_MESSAGE_NUMBER) {
      if (field.fieldNumber === 1 && numericValue != null) state.manufacturer = Math.round(numericValue);
      if (field.fieldNumber === 2 && numericValue != null) state.product = Math.round(numericValue);
      if (field.fieldNumber === 3 && numericValue != null) {
        state.device = {
          ...(state.device ?? { name: 'Garmin', model: null, serial: null }),
          serial: String(Math.round(numericValue)),
        };
      }
    }
    if (definition.globalMessageNumber === FIT_SESSION_MESSAGE_NUMBER) {
      if (field.fieldNumber === 2) state.summary.startedAt = secondsToIso(fitTimestampToSeconds(numericValue));
      if (field.fieldNumber === 5 && numericValue != null) state.sport = Math.round(numericValue);
      if (field.fieldNumber === 6 && numericValue != null) state.subSport = Math.round(numericValue);
      if (field.fieldNumber === 7)
        setLargest(state.summary, 'elapsedSeconds', numericValue != null ? numericValue / 1000 : null);
      if (field.fieldNumber === 8)
        setLargest(state.summary, 'durationSeconds', numericValue != null ? numericValue / 1000 : null);
      if (field.fieldNumber === 9)
        setLargest(state.summary, 'distanceM', numericValue != null ? numericValue / 100 : null);
      if (field.fieldNumber === 10) setLargest(state.summary, 'totalSteps', numericValue);
      if (field.fieldNumber === 11) setLargest(state.summary, 'caloriesKcal', numericValue);
      if (field.fieldNumber === 13)
        setLargest(state.summary, 'avgSpeedMps', numericValue != null ? numericValue / 1000 : null);
      if (field.fieldNumber === 14)
        setLargest(state.summary, 'maxSpeedMps', numericValue != null ? numericValue / 1000 : null);
      if (field.fieldNumber === 16) setLargest(state.summary, 'avgHeartRate', numericValue);
      if (field.fieldNumber === 17) setLargest(state.summary, 'maxHeartRate', numericValue);
      if (field.fieldNumber === 18) setLargest(state.summary, 'avgCadence', numericValue);
      if (field.fieldNumber === 19) setLargest(state.summary, 'maxCadence', numericValue);
      if (field.fieldNumber === 20) setLargest(state.summary, 'avgPowerW', numericValue);
      if (field.fieldNumber === 21) setLargest(state.summary, 'maxPowerW', numericValue);
      if (field.fieldNumber === 22) setLargest(state.summary, 'elevationGainM', numericValue);
      if (field.fieldNumber === 23) setLargest(state.summary, 'elevationLossM', numericValue);
      if (field.fieldNumber === 65) {
        const zones = buildHeartRateZonesFromFitSessionField(
          decodeFitFieldAsNumbers(dataView, offset, field.size, field.baseType, definition.littleEndian),
        );
        if (zones.length > 0) state.nativeHeartRateZones = zones;
      }
      if (field.fieldNumber === 253) state.summary.endedAt = secondsToIso(fitTimestampToSeconds(numericValue));
    }
    if (definition.globalMessageNumber === FIT_RECORD_MESSAGE_NUMBER) {
      if (field.fieldNumber === 0 && numericValue != null) record.lat = semicirclesToDegrees(numericValue);
      if (field.fieldNumber === 1 && numericValue != null) record.lon = semicirclesToDegrees(numericValue);
      if (field.fieldNumber === 2 && numericValue != null) record.altitudeM = numericValue / 5 - 500;
      if (field.fieldNumber === 3 && numericValue != null) record.heartRate = numericValue;
      if (field.fieldNumber === 4 && numericValue != null) record.cadence = numericValue;
      if (field.fieldNumber === 5 && numericValue != null) record.distanceM = numericValue / 100;
      if (field.fieldNumber === 6 && numericValue != null) record.speedMps = numericValue / 1000;
      if (field.fieldNumber === 7 && numericValue != null) record.power = numericValue;
      if (field.fieldNumber === 13 && numericValue != null) record.temperatureC = numericValue;
      if (field.fieldNumber === 253) record.timestampSeconds = fitTimestampToSeconds(numericValue);
    }
    if (definition.globalMessageNumber === FIT_LAP_MESSAGE_NUMBER) {
      if (field.fieldNumber === 2) lap.startTimestampSeconds = fitTimestampToSeconds(numericValue);
      if (field.fieldNumber === 7 && numericValue != null)
        lap.durationSeconds = lap.durationSeconds ?? numericValue / 1000;
      if (field.fieldNumber === 8 && numericValue != null) lap.durationSeconds = numericValue / 1000;
      if (field.fieldNumber === 9 && numericValue != null) lap.distanceM = numericValue / 100;
      if (field.fieldNumber === 13 && numericValue != null) lap.avgSpeedMps = numericValue / 1000;
      if (field.fieldNumber === 15 && numericValue != null) lap.avgHeartRate = numericValue;
      if (field.fieldNumber === 16 && numericValue != null) lap.maxHeartRate = numericValue;
      if (field.fieldNumber === 26)
        lap.lapType = mapFitLapTrigger(numericValue != null ? Math.round(numericValue) : null);
    }
    offset += field.size;
  }
  for (const developerField of definition.developerFields) {
    if (offset + developerField.size > dataEnd) throw new Error('Invalid Garmin FIT file.');
    offset += developerField.size;
  }
  appendFitRecord(state, record);
  appendFitLap(state, lap);
  return offset;
}

function appendFitRecord(state: FitParseState, record: FitRecordAccumulator): void {
  const timestamp = secondsToIso(record.timestampSeconds);
  const startedAt = state.summary.startedAt ?? null;
  if (record.lat != null && record.lon != null && Math.abs(record.lat) <= 90 && Math.abs(record.lon) <= 180) {
    state.position.push({
      offsetSeconds: resolveOffsetSeconds(startedAt, timestamp),
      timestamp,
      lat: record.lat,
      lon: record.lon,
    });
  }
  pushMetricSample(state.heartRate, startedAt, timestamp, record.heartRate);
  pushMetricSample(state.speed, startedAt, timestamp, record.speedMps);
  pushMetricSample(state.distance, startedAt, timestamp, record.distanceM);
  pushMetricSample(state.altitude, startedAt, timestamp, record.altitudeM);
  pushMetricSample(state.cadence, startedAt, timestamp, record.cadence);
  pushMetricSample(state.power, startedAt, timestamp, record.power);
  pushMetricSample(state.temperature, startedAt, timestamp, record.temperatureC);
}

function appendFitLap(state: FitParseState, lap: FitLapAccumulator): void {
  const hasDistance = lap.distanceM != null && lap.distanceM > 0;
  const hasDuration = lap.durationSeconds != null && lap.durationSeconds > 0;
  if (!hasDistance && !hasDuration) return;
  const startTime = secondsToIso(lap.startTimestampSeconds);
  const startOffsetSeconds = resolveOffsetSeconds(state.summary.startedAt ?? null, startTime);
  const endOffsetSeconds =
    startOffsetSeconds != null && lap.durationSeconds != null ? startOffsetSeconds + lap.durationSeconds : null;
  const avgPaceSecondsPerKm =
    lap.avgSpeedMps != null && lap.avgSpeedMps > 0
      ? 1000 / lap.avgSpeedMps
      : lap.durationSeconds != null && lap.distanceM != null && lap.distanceM > 0
        ? lap.durationSeconds / (lap.distanceM / 1000)
        : null;
  state.laps.push({
    lapIndex: state.laps.length + 1,
    lapType: lap.lapType,
    distanceM: lap.distanceM,
    durationSeconds: lap.durationSeconds,
    avgPaceSecondsPerKm,
    avgHeartRate: lap.avgHeartRate,
    maxHeartRate: lap.maxHeartRate,
    startOffsetSeconds,
    endOffsetSeconds,
  });
}

export function mapGarminActivityToCanonicalSport(params: {
  activityType?: string | null;
  fitSport?: number | null;
  fitSubSport?: number | null;
  name?: string | null;
}): CanonicalActivitySportMapping {
  const fitSport = params.fitSport != null ? Math.round(params.fitSport) : null;
  const fitSubSport = params.fitSubSport != null ? Math.round(params.fitSubSport) : null;
  const combinedText = [params.activityType, params.name].filter(Boolean).join(' ').toLowerCase();
  const martialArtsSport = mapMartialArtsTextToCanonical(combinedText);
  if (martialArtsSport) return martialArtsSport;

  const climbingSport = mapClimbingTextToCanonical(combinedText);
  if (climbingSport) return climbingSport;
  const volleyballSport = mapVolleyballTextToCanonical(combinedText);
  if (volleyballSport) return volleyballSport;
  const trailSport = mapTrailTextToCanonical(combinedText);
  if (trailSport) return trailSport;
  const skiingSport = mapSkiingTextToCanonical(combinedText);
  if (skiingSport) return skiingSport;

  if (fitSport === 13) return { sportType: 'skiing', sportSubtype: 'alpine' };
  if (fitSport === 3) return { sportType: 'skiing', sportSubtype: 'cross_country' };
  if (fitSport === 14) return { sportType: 'skiing', sportSubtype: null };

  const isRace =
    combinedText.includes('carrera') ||
    combinedText.includes('race') ||
    combinedText.includes('maratón') ||
    combinedText.includes('maraton') ||
    combinedText.includes('competition') ||
    combinedText.includes('competición');

  if (fitSport === 1) {
    if (fitSubSport === 3) return { sportType: 'trail', sportSubtype: 'trail_running' };
    if (fitSubSport === 4) return { sportType: 'running', sportSubtype: 'track' };
    if (fitSubSport === 1) return { sportType: 'running', sportSubtype: 'treadmill' };
    if (isRace) return { sportType: 'running', sportSubtype: 'race' };
    return { sportType: 'running', sportSubtype: 'outdoor' };
  }
  if (fitSport === 2) {
    if (fitSubSport === 6) return { sportType: 'cycling', sportSubtype: 'indoor_trainer' };
    if (fitSubSport === 7) return { sportType: 'cycling', sportSubtype: 'mtb' }; // Mountain Biking
    if (fitSubSport === 46) return { sportType: 'cycling', sportSubtype: 'gravel' };
    if (fitSubSport === 17) return { sportType: 'cycling', sportSubtype: 'spinning' };
    return { sportType: 'cycling', sportSubtype: 'road' };
  }
  if (fitSport === 5) {
    if (fitSubSport === 18) return { sportType: 'swimming', sportSubtype: 'open_water' };
    return { sportType: 'swimming', sportSubtype: 'pool' };
  }
  if (fitSport === 43 && fitSubSport === 55) return { sportType: 'surf', sportSubtype: null };
  if (fitSport === 6) return { sportType: 'basketball', sportSubtype: 'indoor' };
  if (fitSport === 7) {
    if (combinedText.includes('futsal') || combinedText.includes('sala') || combinedText.includes('indoor')) {
      return { sportType: 'football', sportSubtype: 'futsal' };
    }
    return { sportType: 'football', sportSubtype: 'football_11' };
  }
  if (fitSport === 8) return { sportType: 'tennis', sportSubtype: 'outdoor' };
  if (fitSubSport === 20) return { sportType: 'strength', sportSubtype: 'indoor' };
  if (fitSport === 4) {
    if (fitSubSport === 1) return { sportType: 'running', sportSubtype: 'treadmill' };
    return { sportType: 'gym', sportSubtype: null };
  }
  if (fitSport === 17) return { sportType: 'hiking', sportSubtype: 'trail' };
  if (fitSport === 11) return { sportType: 'hiking', sportSubtype: 'urban_walk' };
  if (fitSport === 64 && fitSubSport === 85) return { sportType: 'padel', sportSubtype: 'outdoor' };
  const activityType = params.activityType?.toLowerCase().replace(/[_-]+/g, ' ') ?? '';
  if (activityType.includes('padel')) return { sportType: 'padel', sportSubtype: 'outdoor' };
  if (activityType.includes('walk')) return { sportType: 'hiking', sportSubtype: 'urban_walk' };
  if (activityType.includes('hike')) return { sportType: 'hiking', sportSubtype: 'trail' };
  if (activityType.includes('soccer') || activityType.includes('football')) {
    if (activityType.includes('futsal') || activityType.includes('sala') || activityType.includes('indoor')) {
      return { sportType: 'football', sportSubtype: 'futsal' };
    }
    return { sportType: 'football', sportSubtype: 'football_11' };
  }
  if (activityType.includes('basketball')) return { sportType: 'basketball', sportSubtype: 'indoor' };
  if (activityType.includes('tennis')) return { sportType: 'tennis', sportSubtype: 'outdoor' };
  if (activityType.includes('open water')) return { sportType: 'swimming', sportSubtype: 'open_water' };
  if (activityType.includes('swim')) return { sportType: 'swimming', sportSubtype: 'pool' };
  if (activityType.includes('surf')) return { sportType: 'surf', sportSubtype: null };
  if (activityType.includes('bike') || activityType.includes('cycling') || activityType.includes('ciclismo')) {
    if (activityType.includes('indoor') || activityType.includes('rodillo') || activityType.includes('trainer')) {
      if (activityType.includes('spin')) return { sportType: 'cycling', sportSubtype: 'spinning' };
      return { sportType: 'cycling', sportSubtype: 'indoor_trainer' };
    }
    if (activityType.includes('spin')) {
      return { sportType: 'cycling', sportSubtype: 'spinning' };
    }
    if (activityType.includes('gravel')) {
      return { sportType: 'cycling', sportSubtype: 'gravel' };
    }
    if (activityType.includes('mountain') || activityType.includes('mtb')) {
      return { sportType: 'cycling', sportSubtype: 'mtb' };
    }
    if (
      activityType.includes('urban') ||
      activityType.includes('commute') ||
      activityType.includes('city') ||
      activityType.includes('urbano')
    ) {
      return { sportType: 'cycling', sportSubtype: 'urban' };
    }
    return { sportType: 'cycling', sportSubtype: 'road' };
  }
  if (activityType.includes('track')) return { sportType: 'running', sportSubtype: 'track' };
  if (activityType.includes('treadmill') || activityType.includes('indoor run'))
    return { sportType: 'running', sportSubtype: 'treadmill' };
  if (activityType.includes('run')) {
    if (isRace) return { sportType: 'running', sportSubtype: 'race' };
    return { sportType: 'running', sportSubtype: 'outdoor' };
  }
  if (activityType.includes('strength') || activityType.includes('weight'))
    return { sportType: 'strength', sportSubtype: 'indoor' };
  if (activityType.includes('gym') || activityType.includes('fitness')) return { sportType: 'gym', sportSubtype: null };
  return { sportType: 'other', sportSubtype: null };
}

function parseGarminFit(binary: Uint8Array, options?: ParseGarminActivityOptions): CanonicalActivity {
  if (binary.byteLength < 12) throw new Error('Invalid Garmin FIT file.');
  const dataView = new DataView(binary.buffer, binary.byteOffset, binary.byteLength);
  const headerSize = dataView.getUint8(0);
  if (headerSize < 12 || binary.byteLength < headerSize) throw new Error('Invalid Garmin FIT file.');
  const fitSignature = String.fromCharCode(binary[8], binary[9], binary[10], binary[11]);
  if (fitSignature !== '.FIT') throw new Error('Invalid Garmin FIT file.');
  const dataSize = dataView.getUint32(4, true);
  const dataStart = headerSize;
  const dataEnd = dataStart + dataSize;
  if (dataEnd > binary.byteLength) throw new Error('Invalid Garmin FIT file.');
  const localDefinitions: Array<FitMessageDefinition | null> = Array.from(
    { length: FIT_LOCAL_MESSAGE_TYPES },
    () => null,
  );
  const state: FitParseState = {
    sport: null,
    subSport: null,
    manufacturer: null,
    product: null,
    summary: {},
    position: [],
    heartRate: [],
    speed: [],
    distance: [],
    altitude: [],
    cadence: [],
    power: [],
    temperature: [],
    laps: [],
    nativeHeartRateZones: [],
    device: { name: 'Garmin', model: null, serial: null },
  };
  let offset = dataStart;
  while (offset < dataEnd) {
    const recordHeader = dataView.getUint8(offset);
    offset += 1;
    if ((recordHeader & 0x80) !== 0) {
      const localMessageType = (recordHeader >> 5) & 0x03;
      const definition = localDefinitions[localMessageType];
      if (!definition) throw new Error('Invalid Garmin FIT file.');
      offset = parseFitDataMessage(dataView, offset, dataEnd, definition, state);
      continue;
    }
    const isDefinitionMessage = (recordHeader & 0x40) !== 0;
    const localMessageType = recordHeader & 0x0f;
    if (localMessageType >= FIT_LOCAL_MESSAGE_TYPES) throw new Error('Invalid Garmin FIT file.');
    if (isDefinitionMessage) {
      const parsed = parseFitDefinitionMessage(dataView, offset, dataEnd, recordHeader);
      localDefinitions[localMessageType] = parsed.definition;
      offset = parsed.nextOffset;
      continue;
    }
    const definition = localDefinitions[localMessageType];
    if (!definition) throw new Error('Invalid Garmin FIT file.');
    offset = parseFitDataMessage(dataView, offset, dataEnd, definition, state);
  }
  const sport = mapGarminActivityToCanonicalSport({ fitSport: state.sport, fitSubSport: state.subSport });
  return buildCanonicalActivity({
    sourceFileType: 'fit',
    sportType: sport.sportType,
    sportSubtype: sport.sportSubtype,
    summary: state.summary,
    streams: {
      position: state.position,
      heartRate: state.heartRate,
      speed: state.speed,
      distance: state.distance,
      altitude: state.altitude,
      cadence: state.cadence,
      power: state.power,
      temperature: state.temperature,
    },
    laps: state.laps,
    heartRateZones: state.nativeHeartRateZones,
    device: state.device,
    providerActivityId: null,
    vendorFields: {
      garminFitSport: state.sport,
      garminFitSubSport: state.subSport,
      garminManufacturer: state.manufacturer,
      garminProduct: state.product,
    },
    estimatedMaxHeartRate: options?.estimatedMaxHeartRate,
  });
}

function pushGarminJsonSample(sample: JsonRecord, startedAt: string | null, streams: CanonicalActivityStreams): void {
  const timestamp = unixSecondsToIso(readNumber(sample.StartTimeInSeconds)) ?? normaliseTimestamp(sample.timestamp);
  const lat = readNumber(sample.LatitudeInDegree) ?? readNumber(sample.latitude);
  const lon = readNumber(sample.LongitudeInDegree) ?? readNumber(sample.longitude);
  if (lat != null && lon != null && Math.abs(lat) <= 90 && Math.abs(lon) <= 180) {
    streams.position.push({ offsetSeconds: resolveOffsetSeconds(startedAt, timestamp), timestamp, lat, lon });
  }
  pushMetricSample(
    streams.heartRate,
    startedAt,
    timestamp,
    readNumber(sample.HeartRate) ?? readNumber(sample.heartRate),
  );
  pushMetricSample(
    streams.speed,
    startedAt,
    timestamp,
    readNumber(sample.SpeedMetersPerSecond) ?? readNumber(sample.speed),
  );
  pushMetricSample(
    streams.distance,
    startedAt,
    timestamp,
    readNumber(sample.TotalDistanceInMeters) ?? readNumber(sample.distance),
  );
  pushMetricSample(
    streams.altitude,
    startedAt,
    timestamp,
    readNumber(sample.ElevationInMeters) ?? readNumber(sample.elevation),
  );
  pushMetricSample(streams.power, startedAt, timestamp, readNumber(sample.PowerInWatts) ?? readNumber(sample.power));
  pushMetricSample(
    streams.temperature,
    startedAt,
    timestamp,
    readNumber(sample.AirTemperatureCelcius) ?? readNumber(sample.temperature),
  );
  const cadence =
    readNumber(sample.StepsPerMinute) ??
    readNumber(sample.BikeCadenceInRPM) ??
    readNumber(sample.SwimCadenceInStrokesPerMinute);
  pushMetricSample(streams.cadence, startedAt, timestamp, cadence);
}

function parseGarminJson(rawJson: string, options?: ParseGarminActivityOptions): CanonicalActivity {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch {
    throw new Error('Invalid Garmin JSON file.');
  }
  if (!isRecord(parsed)) throw new Error('Invalid Garmin JSON file.');
  const summary = isRecord(parsed.Summary) ? parsed.Summary : parsed;
  const activityType = readString(summary.ActivityType) ?? readString(summary.activityType) ?? readString(summary.type);
  const sport = mapGarminActivityToCanonicalSport({ activityType });
  const startedAt = unixSecondsToIso(readNumber(summary.StartTimeInSeconds)) ?? normaliseTimestamp(summary.startTime);
  const durationSeconds = readNumber(summary.DurationInSeconds) ?? readNumber(summary.duration);
  const streams: CanonicalActivityStreams = {
    position: [],
    heartRate: [],
    speed: [],
    distance: [],
    altitude: [],
    cadence: [],
    power: [],
    temperature: [],
  };
  if (Array.isArray(parsed.Samples)) {
    for (const sample of parsed.Samples) {
      if (isRecord(sample)) pushGarminJsonSample(sample, startedAt, streams);
    }
  }
  const laps = Array.isArray(parsed.Laps) ? parseGarminJsonLaps(parsed.Laps, startedAt) : [];
  return buildCanonicalActivity({
    sourceFileType: 'json',
    sportType: sport.sportType,
    sportSubtype: sport.sportSubtype,
    summary: {
      startedAt,
      endedAt: deriveEndTime(startedAt, durationSeconds),
      durationSeconds,
      elapsedSeconds: durationSeconds,
      distanceM: readNumber(summary.DistanceInMeters),
      caloriesKcal: readNumber(summary.ActiveKilocalories) ?? readNumber(summary.Calories),
      avgHeartRate: readNumber(summary.AverageHeartRateInBeatsPerMinute),
      maxHeartRate: readNumber(summary.MaxHeartRateInBeatsPerMinute),
      avgSpeedMps: readNumber(summary.AverageSpeedInMetersPerSecond),
      maxSpeedMps: readNumber(summary.MaxSpeedInMetersPerSecond),
      avgCadence:
        readNumber(summary.AverageRunCadenceInStepsPerMinute) ??
        readNumber(summary.AverageBikeCadenceInRoundsPerMinute) ??
        readNumber(summary.AverageSwimCadenceInStrokesPerMinute),
      maxCadence:
        readNumber(summary.MaxRunCadenceInStepsPerMinute) ?? readNumber(summary.MaxBikeCadenceInRoundsPerMinute),
      avgPowerW: readNumber(summary.AveragePowerInWatts) ?? readNumber(summary.AvgPowerInWatts),
      maxPowerW: readNumber(summary.MaxPowerInWatts),
      elevationGainM: readNumber(summary.TotalElevationGainInMeters),
      elevationLossM: readNumber(summary.TotalElevationLossInMeters),
      totalSteps: readNumber(summary.Steps),
    },
    streams,
    laps,
    device: {
      name: readString(summary.DeviceName) ?? 'Garmin',
      model: readString(summary.DeviceName),
      serial: null,
    },
    providerActivityId: readString(summary.ActivityId) ?? null,
    vendorFields: { garminActivityType: activityType, garminSummaryId: readString(summary.SummaryId) },
    estimatedMaxHeartRate: options?.estimatedMaxHeartRate,
  });
}

function parseGarminJsonLaps(rawLaps: unknown[], startedAt: string | null): CanonicalActivityLap[] {
  return rawLaps
    .filter(isRecord)
    .map((lap, index) => {
      const startTime = unixSecondsToIso(readNumber(lap.StartTimeInSeconds)) ?? normaliseTimestamp(lap.startTime);
      const durationSeconds = readNumber(lap.DurationInSeconds) ?? readNumber(lap.duration);
      const distanceM = readNumber(lap.DistanceInMeters) ?? readNumber(lap.distance);
      const avgSpeedMps = readNumber(lap.AverageSpeedInMetersPerSecond);
      const startOffsetSeconds = resolveOffsetSeconds(startedAt, startTime);
      const avgPaceSecondsPerKm =
        avgSpeedMps != null && avgSpeedMps > 0
          ? 1000 / avgSpeedMps
          : durationSeconds != null && distanceM != null && distanceM > 0
            ? durationSeconds / (distanceM / 1000)
            : null;
      return {
        lapIndex: index + 1,
        lapType: 'unknown' as const,
        distanceM,
        durationSeconds,
        avgPaceSecondsPerKm,
        avgHeartRate: readNumber(lap.AverageHeartRateInBeatsPerMinute),
        maxHeartRate: readNumber(lap.MaxHeartRateInBeatsPerMinute),
        startOffsetSeconds,
        endOffsetSeconds:
          startOffsetSeconds != null && durationSeconds != null ? startOffsetSeconds + durationSeconds : null,
      };
    })
    .filter(
      lap => (lap.distanceM != null && lap.distanceM > 0) || (lap.durationSeconds != null && lap.durationSeconds > 0),
    );
}

function buildHeartRateZones(
  heartRateStream: CanonicalActivityMetricSample[],
  durationSeconds: number | null,
  estimatedMaxHeartRate?: number | null,
): CanonicalActivityHeartRateZone[] {
  const samples = heartRateStream.filter(sample => sample.value > 0);
  if (samples.length === 0) return [];
  const fallbackMax = samples.reduce((max, sample) => Math.max(max, sample.value), 0);
  const maxHeartRate = estimatedMaxHeartRate != null && estimatedMaxHeartRate > 0 ? estimatedMaxHeartRate : fallbackMax;
  if (maxHeartRate <= 0) return [];
  const buckets = [0, 0, 0, 0, 0];
  if (samples.length === 1) {
    buckets[getHeartRateZoneIndex(samples[0].value, maxHeartRate)] = durationSeconds ?? 0;
  } else {
    for (let index = 0; index < samples.length; index += 1) {
      const current = samples[index];
      const next = samples[index + 1];
      const seconds =
        current.offsetSeconds != null && next?.offsetSeconds != null
          ? Math.max(1, next.offsetSeconds - current.offsetSeconds)
          : durationSeconds != null
            ? Math.max(1, durationSeconds / samples.length)
            : 1;
      buckets[getHeartRateZoneIndex(current.value, maxHeartRate)] += seconds;
    }
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

function getHeartRateZoneIndex(heartRate: number, maxHeartRate: number): number {
  const ratio = heartRate / maxHeartRate;
  if (ratio < 0.7) return 0;
  if (ratio < 0.8) return 1;
  if (ratio < 0.9) return 2;
  if (ratio < 0.95) return 3;
  return 4;
}

function buildCanonicalActivity(params: {
  sourceFileType: CanonicalActivity['sourceFileType'];
  sportType: CanonicalSportType;
  sportSubtype: CanonicalSportSubtype | null;
  summary: Partial<CanonicalActivity['summary']>;
  streams: CanonicalActivityStreams;
  laps: CanonicalActivityLap[];
  device: CanonicalActivity['device'];
  providerActivityId: string | null;
  vendorFields: Record<string, unknown>;
  heartRateZones?: CanonicalActivityHeartRateZone[];
  estimatedMaxHeartRate?: number | null;
}): CanonicalActivity {
  const heartRates = params.streams.heartRate.map(sample => sample.value).filter(value => value > 0);
  const avgFromStream =
    heartRates.length > 0 ? heartRates.reduce((sum, value) => sum + value, 0) / heartRates.length : null;
  const summary: CanonicalActivity['summary'] = {
    startedAt: params.summary.startedAt ?? null,
    endedAt:
      params.summary.endedAt ?? deriveEndTime(params.summary.startedAt ?? null, params.summary.durationSeconds ?? null),
    durationSeconds: roundNullable(params.summary.durationSeconds),
    elapsedSeconds: roundNullable(params.summary.elapsedSeconds),
    distanceM: params.summary.distanceM ?? null,
    caloriesKcal: roundNullable(params.summary.caloriesKcal),
    avgHeartRate: roundNullable(params.summary.avgHeartRate ?? avgFromStream),
    maxHeartRate: roundNullable(
      params.summary.maxHeartRate ?? (heartRates.length > 0 ? Math.max(...heartRates) : null),
    ),
    minHeartRate: roundNullable(
      params.summary.minHeartRate ?? (heartRates.length > 0 ? Math.min(...heartRates) : null),
    ),
    avgSpeedMps: params.summary.avgSpeedMps ?? null,
    maxSpeedMps: params.summary.maxSpeedMps ?? null,
    avgCadence: roundNullable(params.summary.avgCadence),
    maxCadence: roundNullable(params.summary.maxCadence),
    avgPowerW: roundNullable(params.summary.avgPowerW),
    maxPowerW: roundNullable(params.summary.maxPowerW),
    elevationGainM: params.summary.elevationGainM ?? null,
    elevationLossM: params.summary.elevationLossM ?? null,
    avgTemperatureC: params.summary.avgTemperatureC ?? null,
    maxTemperatureC: params.summary.maxTemperatureC ?? null,
    totalSteps: roundNullable(params.summary.totalSteps),
    recoveryTimeSeconds: roundNullable(params.summary.recoveryTimeSeconds),
    vo2Max: params.summary.vo2Max ?? null,
    epoc: params.summary.epoc ?? null,
    pte: params.summary.pte ?? null,
    tss: params.summary.tss ?? null,
  };
  return {
    provider: 'garmin',
    sourceFileType: params.sourceFileType,
    sportType: params.sportType,
    sportSubtype: params.sportSubtype,
    providerActivityId: params.providerActivityId,
    summary,
    streams: params.streams,
    laps: params.laps,
    heartRateZones:
      params.heartRateZones && params.heartRateZones.length > 0
        ? params.heartRateZones
        : buildHeartRateZones(params.streams.heartRate, summary.durationSeconds, params.estimatedMaxHeartRate),
    device: params.device,
    vendorFields: params.vendorFields,
  };
}

export function parseGarminActivityFileToCanonical(
  content: string | Uint8Array,
  filename: string,
  options?: ParseGarminActivityOptions,
): CanonicalActivity {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.fit')) {
    if (typeof content === 'string') throw new Error('Invalid Garmin FIT file.');
    return parseGarminFit(content, options);
  }
  if (lower.endsWith('.json')) {
    if (typeof content !== 'string') throw new Error('Invalid Garmin JSON file.');
    return parseGarminJson(content, options);
  }
  return buildCanonicalActivity({
    sourceFileType: 'json',
    sportType: 'other',
    sportSubtype: null,
    summary: {},
    streams: EMPTY_STREAMS,
    laps: [],
    device: { name: 'Garmin', model: null, serial: null },
    providerActivityId: null,
    vendorFields: {},
    estimatedMaxHeartRate: options?.estimatedMaxHeartRate,
  });
}
