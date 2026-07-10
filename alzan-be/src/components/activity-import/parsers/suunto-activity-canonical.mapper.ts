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
import { mapGolfTextToCanonical } from './golf-sport.mapper';
import { mapHyroxTextToCanonical } from './hyrox-sport.mapper';
import { mapMartialArtsTextToCanonical } from './martial-arts-sport.mapper';
import { mapSkiingTextToCanonical } from './skiing-sport.mapper';
import { mapSnowboardTextToCanonical } from './snowboard-sport.mapper';
import { mapTrailTextToCanonical } from './trail-sport.mapper';
import { mapVolleyballTextToCanonical } from './volleyball-sport.mapper';

type JsonRecord = Record<string, unknown>;

interface ParseSuuntoActivityOptions {
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
const RADIANS_TO_DEGREES = 180 / Math.PI;

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

// Official Suunto activity IDs: https://aspartnercontent.blob.core.windows.net/apizone/docs/Activities.pdf
const SUUNTO_ACTIVITY_ID_MAP = new Map<number, CanonicalActivitySportMapping>([
  [0, { sportType: 'hiking', sportSubtype: 'urban_walk' }], // Walking
  [1, { sportType: 'running', sportSubtype: 'outdoor' }],
  [2, { sportType: 'cycling', sportSubtype: 'road' }],
  [3, { sportType: 'skiing', sportSubtype: 'cross_country' }],
  [10, { sportType: 'cycling', sportSubtype: 'mtb' }], // Mountain Biking
  [11, { sportType: 'hiking', sportSubtype: 'trail' }],
  [13, { sportType: 'skiing', sportSubtype: 'alpine' }], // Downhill skiing
  [16, { sportType: 'golf', sportSubtype: null }],
  [17, { sportType: 'gym', sportSubtype: null }], // Indoor sports
  [20, { sportType: 'gym', sportSubtype: null }], // Outdoor gym
  [21, { sportType: 'swimming', sportSubtype: 'pool' }],
  [22, { sportType: 'trail', sportSubtype: 'trail_running' }],
  [23, { sportType: 'strength', sportSubtype: 'indoor' }], // Gym
  [24, { sportType: 'hiking', sportSubtype: 'urban_walk' }], // Nordic walking
  [29, { sportType: 'climbing', sportSubtype: null }],
  [30, { sportType: 'snowboard', sportSubtype: 'slope' }],
  [31, { sportType: 'skiing', sportSubtype: 'backcountry' }], // Ski touring
  [32, { sportType: 'gym', sportSubtype: null }], // Fitness class
  [33, { sportType: 'football', sportSubtype: 'football_11' }],
  [34, { sportType: 'tennis', sportSubtype: 'outdoor' }],
  [35, { sportType: 'basketball', sportSubtype: 'indoor' }],
  [38, { sportType: 'volleyball', sportSubtype: 'indoor_volleyball' }],
  [51, { sportType: 'gym', sportSubtype: null }], // Yoga/pilates
  [52, { sportType: 'cycling', sportSubtype: 'indoor_trainer' }],
  [53, { sportType: 'running', sportSubtype: 'treadmill' }],
  [54, { sportType: 'gym', sportSubtype: null }], // Crossfit
  [55, { sportType: 'gym', sportSubtype: null }], // Crosstrainer
  [57, { sportType: 'gym', sportSubtype: null }], // Indoor rowing
  [59, { sportType: 'running', sportSubtype: 'track' }], // Track and field
  [62, { sportType: 'martial_arts', sportSubtype: null }], // Combat sport
  [63, { sportType: 'strength', sportSubtype: 'indoor' }], // Kettlebell
  [67, { sportType: 'football', sportSubtype: 'futsal' }],
  [69, { sportType: 'gym', sportSubtype: null }], // Aerobics
  [70, { sportType: 'hiking', sportSubtype: 'trail' }], // Trekking
  [73, { sportType: 'gym', sportSubtype: null }], // Circuit training
  [75, { sportType: 'padel', sportSubtype: 'outdoor' }],
  [77, { sportType: 'martial_arts', sportSubtype: 'boxing' }],
  [81, { sportType: 'gym', sportSubtype: null }], // Gymnastics
  [83, { sportType: 'hiking', sportSubtype: 'high_mountain' }], // Mountaineering
  [84, { sportType: 'skiing', sportSubtype: 'alpine' }], // Telemark skiing
  [85, { sportType: 'swimming', sportSubtype: 'open_water' }],
  [91, { sportType: 'surf', sportSubtype: 'surf' }],
  [99, { sportType: 'cycling', sportSubtype: 'gravel' }], // Gravel Biking
  [103, { sportType: 'running', sportSubtype: 'track' }], // Track running
  [104, { sportType: 'strength', sportSubtype: 'indoor' }], // Calisthenics
  [105, { sportType: 'cycling', sportSubtype: 'road' }], // E-biking
  [106, { sportType: 'cycling', sportSubtype: 'mtb' }], // E-mtb
  [107, { sportType: 'skiing', sportSubtype: 'backcountry' }], // Backcountry skiing
  [110, { sportType: 'snowboard', sportSubtype: 'splitboard' }], // Splitboarding
  [114, { sportType: 'cycling', sportSubtype: 'gravel' }], // Cyclocross
  [115, { sportType: 'trail', sportSubtype: 'trail_running' }], // Vertical running
  [116, { sportType: 'skiing', sportSubtype: 'backcountry' }], // Ski mountaineering
  [117, { sportType: 'skiing', sportSubtype: 'cross_country' }], // Skate skiing
  [118, { sportType: 'skiing', sportSubtype: 'cross_country' }], // Classic skiing
  [120, { sportType: 'gym', sportSubtype: null }], // Pilates
  [121, { sportType: 'gym', sportSubtype: null }], // Yoga
]);

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

function valuesAreClose(value: number, target: number, tolerance: number): boolean {
  return Math.abs(value - target) <= tolerance;
}

function normaliseHeartRate(value: number): number {
  return value > 0 && value < 4 ? value * 60 : value;
}

function normaliseCaloriesFromEnergy(value: number | null): number | null {
  if (value == null || !Number.isFinite(value) || value <= 0) return null;
  return value > 20000 ? value / 4184 : value;
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

function normaliseLatLon(value: number, isLatitude: boolean): number {
  if (Math.abs(value) <= Math.PI) return value * RADIANS_TO_DEGREES;
  if (isLatitude && Math.abs(value) <= 90) return value;
  if (!isLatitude && Math.abs(value) <= 180) return value;
  return value;
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

export function mapSuuntoActivityToCanonicalSport(params: {
  activityId?: number | null;
  fitSport?: number | null;
  fitSubSport?: number | null;
  sportName?: string | null;
}): CanonicalActivitySportMapping {
  const martialArtsSport = mapMartialArtsTextToCanonical(params.sportName);
  if (martialArtsSport) return martialArtsSport;

  const climbingSport = mapClimbingTextToCanonical(params.sportName);
  if (climbingSport) return climbingSport;
  const volleyballSport = mapVolleyballTextToCanonical(params.sportName);
  if (volleyballSport) return volleyballSport;

  const golfSport = mapGolfTextToCanonical(params.sportName);
  if (golfSport) return golfSport;
  const hyroxSport = mapHyroxTextToCanonical(params.sportName);
  if (hyroxSport) return hyroxSport;
  const trailSport = mapTrailTextToCanonical(params.sportName);
  if (trailSport) return trailSport;
  const skiingSport = mapSkiingTextToCanonical(params.sportName);
  if (skiingSport) return skiingSport;
  const snowboardSport = mapSnowboardTextToCanonical(params.sportName);
  if (snowboardSport) return snowboardSport;

  // Watch DeviceLog exports use a legacy ActivityType enum that conflicts with the official
  // cloud activity IDs (e.g. 3 = running in DeviceLog vs cross-country skiing in the cloud list),
  // so the textual sport label takes precedence over the numeric id when both are present.
  const nameMapping = mapSuuntoSportNameToCanonical(params.sportName);
  if (nameMapping) return nameMapping;

  if (params.activityId != null) {
    const mappedActivityId = SUUNTO_ACTIVITY_ID_MAP.get(Math.round(params.activityId));
    if (mappedActivityId) return mappedActivityId;
  }

  const fitSport = params.fitSport != null ? Math.round(params.fitSport) : null;
  const fitSubSport = params.fitSubSport != null ? Math.round(params.fitSubSport) : null;

  if (fitSport === 1) {
    const isRace =
      params.sportName &&
      (params.sportName.toLowerCase().includes('carrera') ||
        params.sportName.toLowerCase().includes('race') ||
        params.sportName.toLowerCase().includes('maratón') ||
        params.sportName.toLowerCase().includes('maraton') ||
        params.sportName.toLowerCase().includes('competition') ||
        params.sportName.toLowerCase().includes('competición'));
    if (fitSubSport === 3) return { sportType: 'trail', sportSubtype: 'trail_running' };
    if (fitSubSport === 4) return { sportType: 'running', sportSubtype: 'track' };
    if (fitSubSport === 1) return { sportType: 'running', sportSubtype: 'treadmill' };
    if (isRace) return { sportType: 'running', sportSubtype: 'race' };
    return { sportType: 'running', sportSubtype: 'outdoor' };
  }
  if (fitSport === 2) {
    // FIT sub_sport: 5 = spin, 6 = indoor_cycling, 7 = road, 8 = mountain, 11 = cyclocross, 46 = gravel_cycling
    if (fitSubSport === 6) return { sportType: 'cycling', sportSubtype: 'indoor_trainer' };
    if (fitSubSport === 5) return { sportType: 'cycling', sportSubtype: 'spinning' };
    if (fitSubSport === 8) return { sportType: 'cycling', sportSubtype: 'mtb' };
    if (fitSubSport === 46) return { sportType: 'cycling', sportSubtype: 'gravel' };
    if (fitSubSport === 11) return { sportType: 'cycling', sportSubtype: 'gravel' }; // Cyclocross
    return { sportType: 'cycling', sportSubtype: 'road' };
  }
  if (fitSport === 5) {
    if (fitSubSport === 18) return { sportType: 'swimming', sportSubtype: 'open_water' };
    return { sportType: 'swimming', sportSubtype: 'pool' };
  }
  if (fitSport === 12) return { sportType: 'skiing', sportSubtype: 'cross_country' };
  if (fitSport === 13) {
    if (fitSubSport === 37) return { sportType: 'skiing', sportSubtype: 'backcountry' };
    return { sportType: 'skiing', sportSubtype: 'alpine' };
  }
  if (fitSport === 14) {
    if (fitSubSport === 37) return { sportType: 'snowboard', sportSubtype: 'splitboard' };
    return { sportType: 'snowboard', sportSubtype: 'slope' };
  }
  if (fitSport === 16) return { sportType: 'hiking', sportSubtype: 'high_mountain' }; // Mountaineering
  if (fitSport === 25) return { sportType: 'golf', sportSubtype: null };
  if (fitSport === 31) return { sportType: 'climbing', sportSubtype: null };
  if (fitSport === 38) return { sportType: 'surf', sportSubtype: 'surf' };
  if (fitSport === 47) return { sportType: 'martial_arts', sportSubtype: 'boxing' };
  if (fitSport === 4) {
    // FITNESS_EQUIPMENT
    if (fitSubSport === 20) return { sportType: 'strength', sportSubtype: 'indoor' };
    if (fitSubSport === 1) return { sportType: 'running', sportSubtype: 'treadmill' };
    return { sportType: 'gym', sportSubtype: null };
  }
  if (fitSport === 6) return { sportType: 'basketball', sportSubtype: 'indoor' };
  if (fitSport === 7) {
    const sportName = params.sportName?.toLowerCase() ?? '';
    if (sportName.includes('futsal') || sportName.includes('sala') || sportName.includes('indoor')) {
      return { sportType: 'football', sportSubtype: 'futsal' };
    }
    return { sportType: 'football', sportSubtype: 'football_11' };
  }
  if (fitSport === 8) return { sportType: 'tennis', sportSubtype: 'outdoor' };
  if (fitSport === 10 && fitSubSport === 20) return { sportType: 'strength', sportSubtype: 'indoor' };
  if (fitSport === 10) return { sportType: 'gym', sportSubtype: 'indoor' };
  if (fitSport === 17) return { sportType: 'hiking', sportSubtype: 'trail' };
  if (fitSport === 11) return { sportType: 'hiking', sportSubtype: 'urban_walk' };
  if (fitSport === 64 && fitSubSport === 85) return { sportType: 'padel', sportSubtype: 'outdoor' };

  return { sportType: 'other', sportSubtype: null };
}

function mapSuuntoSportNameToCanonical(rawSportName: string | null | undefined): CanonicalActivitySportMapping | null {
  const sportName = rawSportName?.toLowerCase() ?? '';
  if (!sportName) return null;
  if (sportName.includes('padel')) return { sportType: 'padel', sportSubtype: 'outdoor' };
  if (sportName.includes('hiking') || sportName.includes('trekking'))
    return { sportType: 'hiking', sportSubtype: 'trail' };
  if (sportName.includes('football') || sportName.includes('soccer') || sportName.includes('futsal')) {
    if (sportName.includes('futsal') || sportName.includes('sala') || sportName.includes('indoor')) {
      return { sportType: 'football', sportSubtype: 'futsal' };
    }
    return { sportType: 'football', sportSubtype: 'football_11' };
  }
  if (sportName.includes('basketball')) return { sportType: 'basketball', sportSubtype: 'indoor' };
  if (sportName.includes('tennis')) return { sportType: 'tennis', sportSubtype: 'outdoor' };
  if (sportName.includes('swim')) {
    if (sportName.includes('open') || sportName.includes('aguas abiertas')) {
      return { sportType: 'swimming', sportSubtype: 'open_water' };
    }
    return { sportType: 'swimming', sportSubtype: 'pool' };
  }
  if (sportName.includes('cycl') || sportName.includes('bike') || sportName.includes('bici')) {
    if (sportName.includes('indoor') || sportName.includes('rodillo') || sportName.includes('trainer')) {
      if (sportName.includes('spin')) return { sportType: 'cycling', sportSubtype: 'spinning' };
      return { sportType: 'cycling', sportSubtype: 'indoor_trainer' };
    }
    if (sportName.includes('spin')) {
      return { sportType: 'cycling', sportSubtype: 'spinning' };
    }
    if (sportName.includes('gravel')) {
      return { sportType: 'cycling', sportSubtype: 'gravel' };
    }
    if (sportName.includes('mtb') || sportName.includes('mountain') || sportName.includes('montaña')) {
      return { sportType: 'cycling', sportSubtype: 'mtb' };
    }
    if (
      sportName.includes('urban') ||
      sportName.includes('commute') ||
      sportName.includes('city') ||
      sportName.includes('urbano')
    ) {
      return { sportType: 'cycling', sportSubtype: 'urban' };
    }
    return { sportType: 'cycling', sportSubtype: 'road' };
  }
  if (sportName.includes('walk')) return { sportType: 'hiking', sportSubtype: 'urban_walk' };
  if (sportName.includes('run')) {
    if (sportName.includes('indoor') || sportName.includes('treadmill') || sportName.includes('cinta')) {
      return { sportType: 'running', sportSubtype: 'treadmill' };
    }
    if (sportName.includes('trail') || sportName.includes('mountain') || sportName.includes('montaña')) {
      return { sportType: 'trail', sportSubtype: 'trail_running' };
    }
    if (sportName.includes('track') || sportName.includes('pista') || sportName.includes('atletismo')) {
      return { sportType: 'running', sportSubtype: 'track' };
    }
    if (
      sportName.includes('race') ||
      sportName.includes('carrera') ||
      sportName.includes('maratón') ||
      sportName.includes('maraton') ||
      sportName.includes('competition') ||
      sportName.includes('competición')
    ) {
      return { sportType: 'running', sportSubtype: 'race' };
    }
    return { sportType: 'running', sportSubtype: 'outdoor' };
  }
  if (sportName.includes('strength') || sportName.includes('weight'))
    return { sportType: 'strength', sportSubtype: 'indoor' };
  if (
    sportName.includes('gym') ||
    sportName.includes('circuit') ||
    sportName.includes('crossfit') ||
    sportName.includes('hiit') ||
    sportName.includes('fitness')
  ) {
    return { sportType: 'gym', sportSubtype: null };
  }

  return null;
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

function parseFitDefinitionMessage(
  dataView: DataView,
  offset: number,
  dataEnd: number,
  recordHeader: number,
): { nextOffset: number; definition: FitMessageDefinition } {
  const hasDeveloperData = (recordHeader & 0x20) !== 0;
  offset += 1;
  const architecture = dataView.getUint8(offset);
  offset += 1;
  const littleEndian = architecture === 0;
  const globalMessageNumber = dataView.getUint16(offset, littleEndian);
  offset += 2;
  const fieldCount = dataView.getUint8(offset);
  offset += 1;
  const fields: FitFieldDefinition[] = [];
  for (let index = 0; index < fieldCount; index += 1) {
    if (offset + 3 > dataEnd) throw new Error('Invalid Suunto FIT file.');
    fields.push({
      fieldNumber: dataView.getUint8(offset),
      size: dataView.getUint8(offset + 1),
      baseType: dataView.getUint8(offset + 2),
    });
    offset += 3;
  }
  const developerFields: FitDeveloperFieldDefinition[] = [];
  if (hasDeveloperData) {
    const developerFieldCount = dataView.getUint8(offset);
    offset += 1;
    for (let index = 0; index < developerFieldCount; index += 1) {
      if (offset + 3 > dataEnd) throw new Error('Invalid Suunto FIT file.');
      developerFields.push({ size: dataView.getUint8(offset + 1) });
      offset += 3;
    }
  }
  return { nextOffset: offset, definition: { littleEndian, globalMessageNumber, fields, developerFields } };
}

function setLargest(
  target: Partial<CanonicalActivity['summary']>,
  key: keyof CanonicalActivity['summary'],
  value: number | null,
): void {
  if (value == null || !Number.isFinite(value) || value <= 0) return;
  const current = target[key];
  if (typeof current !== 'number' || value > current) {
    (target as Record<string, number>)[key] = value;
  }
}

function mapFitLapTrigger(value: number | null): CanonicalActivityLap['lapType'] {
  if (value === 0) return 'manual';
  if (value === 1) return 'time';
  if (value === 2) return 'distance';
  return 'unknown';
}

function pushMetricSample(
  target: CanonicalActivityMetricSample[],
  startedAt: string | null,
  timestamp: string | null,
  value: number | null,
): void {
  if (value == null || !Number.isFinite(value)) return;
  target.push({
    offsetSeconds: resolveOffsetSeconds(startedAt, timestamp),
    timestamp,
    value,
  });
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
    if (offset + field.size > dataEnd) throw new Error('Invalid Suunto FIT file.');
    const numericValue = decodeFitFieldAsNumber(dataView, offset, field.size, field.baseType, definition.littleEndian);

    if (
      definition.globalMessageNumber === FIT_FILE_ID_MESSAGE_NUMBER &&
      field.fieldNumber === 3 &&
      numericValue != null
    ) {
      state.device = {
        ...(state.device ?? { name: null, model: null, serial: null }),
        serial: String(Math.round(numericValue)),
      };
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
      if (field.fieldNumber === 3 && numericValue != null) record.heartRate = normaliseHeartRate(numericValue);
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
    if (offset + developerField.size > dataEnd) throw new Error('Invalid Suunto FIT file.');
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

const STANDARD_DISTANCE_AUTOLAP_M = 1000;
const STANDARD_DISTANCE_AUTOLAP_TOLERANCE_M = 15;
const SUMMARY_LAP_DISTANCE_TOLERANCE_M = 25;
const SUMMARY_LAP_DURATION_TOLERANCE_S = 5;
const MIN_INTERVAL_SIGNAL_LAPS = 4;
const MIN_INTERVAL_PACE_SPREAD = 0.25;

function lapPaceSecondsPerKm(lap: CanonicalActivityLap): number | null {
  if (lap.avgPaceSecondsPerKm != null && lap.avgPaceSecondsPerKm > 0) return lap.avgPaceSecondsPerKm;
  if (lap.durationSeconds != null && lap.durationSeconds > 0 && lap.distanceM != null && lap.distanceM > 0) {
    return (lap.durationSeconds / lap.distanceM) * 1000;
  }
  return null;
}

function isValidSuuntoLap(lap: CanonicalActivityLap): boolean {
  return (lap.distanceM != null && lap.distanceM > 0) || (lap.durationSeconds != null && lap.durationSeconds > 0);
}

function isTotalLikeSuuntoLap(lap: CanonicalActivityLap, summary: Partial<CanonicalActivity['summary']>): boolean {
  const summaryDistanceM = summary.distanceM ?? null;
  const summaryDurationSeconds = summary.durationSeconds ?? null;
  const hasSummaryDistance = summaryDistanceM != null && summaryDistanceM > 0;
  const hasSummaryDuration = summaryDurationSeconds != null && summaryDurationSeconds > 0;
  if (!hasSummaryDistance && !hasSummaryDuration) return false;

  const distanceMatches =
    hasSummaryDistance &&
    lap.distanceM != null &&
    lap.distanceM > 0 &&
    valuesAreClose(lap.distanceM, summaryDistanceM, SUMMARY_LAP_DISTANCE_TOLERANCE_M);
  const durationMatches =
    hasSummaryDuration &&
    lap.durationSeconds != null &&
    lap.durationSeconds > 0 &&
    valuesAreClose(lap.durationSeconds, summaryDurationSeconds, SUMMARY_LAP_DURATION_TOLERANCE_S);

  if (hasSummaryDistance && hasSummaryDuration) return distanceMatches || durationMatches;
  if (hasSummaryDistance) return distanceMatches;
  if (hasSummaryDuration) return durationMatches;
  return false;
}

function isStandardDistanceMarker(lap: CanonicalActivityLap): boolean {
  return (
    lap.distanceM != null &&
    valuesAreClose(lap.distanceM, STANDARD_DISTANCE_AUTOLAP_M, STANDARD_DISTANCE_AUTOLAP_TOLERANCE_M)
  );
}

function lapHasTiming(lap: CanonicalActivityLap): boolean {
  return (
    lap.startOffsetSeconds != null && lap.endOffsetSeconds != null && lap.endOffsetSeconds > lap.startOffsetSeconds
  );
}

function lapsOverlap(left: CanonicalActivityLap, right: CanonicalActivityLap): boolean {
  if (!lapHasTiming(left) || !lapHasTiming(right)) return false;
  return (
    Math.max(left.startOffsetSeconds as number, right.startOffsetSeconds as number) <
    Math.min(left.endOffsetSeconds as number, right.endOffsetSeconds as number)
  );
}

function hasNonStandardIntervalSignal(laps: CanonicalActivityLap[]): boolean {
  const paceValues = laps
    .map(lapPaceSecondsPerKm)
    .filter((value): value is number => value != null && Number.isFinite(value) && value > 0);
  if (paceValues.length < MIN_INTERVAL_SIGNAL_LAPS) return false;

  const minPace = Math.min(...paceValues);
  const maxPace = Math.max(...paceValues);
  const medianPace = [...paceValues].sort((left, right) => left - right)[Math.floor(paceValues.length / 2)];
  if (medianPace == null || medianPace <= 0) return false;

  return (maxPace - minPace) / medianPace >= MIN_INTERVAL_PACE_SPREAD;
}

function buildLapIdentity(lap: CanonicalActivityLap): string {
  const distanceKey = lap.distanceM == null ? 'null' : Math.round(lap.distanceM);
  const durationKey = lap.durationSeconds == null ? 'null' : Math.round(lap.durationSeconds);
  const startKey = lap.startOffsetSeconds == null ? 'null' : Math.round(lap.startOffsetSeconds);
  const endKey = lap.endOffsetSeconds == null ? 'null' : Math.round(lap.endOffsetSeconds);
  return `${lap.lapType}|${distanceKey}|${durationKey}|${startKey}|${endKey}`;
}

function normaliseSuuntoFitLaps(
  laps: CanonicalActivityLap[],
  summary: Partial<CanonicalActivity['summary']>,
): CanonicalActivityLap[] {
  const validLaps = laps.filter(isValidSuuntoLap);
  if (validLaps.length === 0) return [];

  let workingLaps = [...validLaps];
  const totalLikeMask = workingLaps.map(lap => isTotalLikeSuuntoLap(lap, summary));
  if (totalLikeMask.some(Boolean) && totalLikeMask.some(isTotalLike => !isTotalLike)) {
    workingLaps = workingLaps.filter((_, index) => !totalLikeMask[index]);
  }

  const standardDistanceMarkerMask = workingLaps.map(isStandardDistanceMarker);
  const nonStandardLaps = workingLaps.filter((_, index) => !standardDistanceMarkerMask[index]);
  const overlappedStandardMarkerMask = workingLaps.map(
    (lap, index) =>
      standardDistanceMarkerMask[index] && nonStandardLaps.some(nonStandardLap => lapsOverlap(lap, nonStandardLap)),
  );

  if (overlappedStandardMarkerMask.some(Boolean)) {
    workingLaps = workingLaps.filter((_, index) => !overlappedStandardMarkerMask[index]);
  } else if (
    standardDistanceMarkerMask.some(Boolean) &&
    workingLaps.some((lap, index) => standardDistanceMarkerMask[index] && !lapHasTiming(lap)) &&
    hasNonStandardIntervalSignal(nonStandardLaps)
  ) {
    workingLaps = nonStandardLaps;
  }

  const seen = new Set<string>();
  const deduped: CanonicalActivityLap[] = [];
  for (const lap of workingLaps) {
    const identity = buildLapIdentity(lap);
    if (seen.has(identity)) continue;
    seen.add(identity);
    deduped.push(lap);
  }

  return deduped.map((lap, index) => ({
    ...lap,
    lapIndex: index + 1,
  }));
}

function parseSuuntoFit(binary: Uint8Array, options?: ParseSuuntoActivityOptions): CanonicalActivity {
  if (binary.byteLength < 12) throw new Error('Invalid Suunto FIT file.');
  const dataView = new DataView(binary.buffer, binary.byteOffset, binary.byteLength);
  const headerSize = dataView.getUint8(0);
  if (headerSize < 12 || binary.byteLength < headerSize) throw new Error('Invalid Suunto FIT file.');
  const fitSignature = String.fromCharCode(binary[8], binary[9], binary[10], binary[11]);
  if (fitSignature !== '.FIT') throw new Error('Invalid Suunto FIT file.');
  const dataSize = dataView.getUint32(4, true);
  const dataStart = headerSize;
  const dataEnd = dataStart + dataSize;
  if (dataEnd > binary.byteLength) throw new Error('Invalid Suunto FIT file.');

  const localDefinitions: Array<FitMessageDefinition | null> = Array.from(
    { length: FIT_LOCAL_MESSAGE_TYPES },
    () => null,
  );
  const state: FitParseState = {
    sport: null,
    subSport: null,
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
    device: null,
  };

  let offset = dataStart;
  while (offset < dataEnd) {
    const recordHeader = dataView.getUint8(offset);
    offset += 1;
    if ((recordHeader & 0x80) !== 0) {
      const localMessageType = (recordHeader >> 5) & 0x03;
      const definition = localDefinitions[localMessageType];
      if (!definition) throw new Error('Invalid Suunto FIT file.');
      offset = parseFitDataMessage(dataView, offset, dataEnd, definition, state);
      continue;
    }
    const isDefinitionMessage = (recordHeader & 0x40) !== 0;
    const localMessageType = recordHeader & 0x0f;
    if (localMessageType >= FIT_LOCAL_MESSAGE_TYPES) throw new Error('Invalid Suunto FIT file.');
    if (isDefinitionMessage) {
      const parsed = parseFitDefinitionMessage(dataView, offset, dataEnd, recordHeader);
      localDefinitions[localMessageType] = parsed.definition;
      offset = parsed.nextOffset;
      continue;
    }
    const definition = localDefinitions[localMessageType];
    if (!definition) throw new Error('Invalid Suunto FIT file.');
    offset = parseFitDataMessage(dataView, offset, dataEnd, definition, state);
  }

  const sport = mapSuuntoActivityToCanonicalSport({ fitSport: state.sport, fitSubSport: state.subSport });
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
    laps: normaliseSuuntoFitLaps(state.laps, state.summary),
    device: state.device,
    vendorFields: { suuntoFitSport: state.sport, suuntoFitSubSport: state.subSport },
    heartRateZones: state.nativeHeartRateZones,
    estimatedMaxHeartRate: options?.estimatedMaxHeartRate,
  });
}

function pushJsonSample(sample: JsonRecord, startedAt: string | null, streams: CanonicalActivityStreams): void {
  const timestamp =
    normaliseTimestamp(sample.TimeISO8601) ?? normaliseTimestamp(sample.UTC) ?? normaliseTimestamp(sample.timestamp);
  const offsetSeconds = resolveOffsetSeconds(startedAt, timestamp);
  const latRaw = readNumber(sample.Latitude) ?? readNumber(sample.latitude) ?? readNumber(sample.lat);
  const lonRaw =
    readNumber(sample.Longitude) ?? readNumber(sample.longitude) ?? readNumber(sample.lon) ?? readNumber(sample.lng);
  if (latRaw != null && lonRaw != null) {
    const lat = normaliseLatLon(latRaw, true);
    const lon = normaliseLatLon(lonRaw, false);
    if (Math.abs(lat) <= 90 && Math.abs(lon) <= 180) {
      streams.position.push({ offsetSeconds, timestamp, lat, lon });
    }
  }
  const heartRate = readNumber(sample.HR) ?? readNumber(sample.HeartRate) ?? readNumber(sample.heartRate);
  pushMetricSample(streams.heartRate, startedAt, timestamp, heartRate != null ? normaliseHeartRate(heartRate) : null);
  pushMetricSample(streams.distance, startedAt, timestamp, readNumber(sample.Distance) ?? readNumber(sample.distance));
  pushMetricSample(streams.altitude, startedAt, timestamp, readNumber(sample.Altitude) ?? readNumber(sample.elevation));
  pushMetricSample(streams.speed, startedAt, timestamp, readNumber(sample.Speed) ?? readNumber(sample.speed));
  pushMetricSample(streams.cadence, startedAt, timestamp, readNumber(sample.Cadence) ?? readNumber(sample.cadence));
  pushMetricSample(streams.power, startedAt, timestamp, readNumber(sample.Power) ?? readNumber(sample.power));
  pushMetricSample(
    streams.temperature,
    startedAt,
    timestamp,
    readNumber(sample.Temperature) ?? readNumber(sample.temperature),
  );
}

function readWindowMetric(window: JsonRecord, metricName: string, metricKey: 'Avg' | 'Max' | 'Min'): number | null {
  const metric = window[metricName];
  if (Array.isArray(metric) && isRecord(metric[0])) {
    return readNumber(metric[0][metricKey]);
  }
  return null;
}

function mapWindowTypeToLapType(windowType: string | null): CanonicalActivityLap['lapType'] {
  if (windowType?.toLowerCase() === 'autolap') return 'distance';
  return 'unknown';
}

function mapSuuntoWindowsToLaps(windows: unknown): CanonicalActivityLap[] {
  if (!Array.isArray(windows)) return [];
  let elapsedSeconds = 0;
  return windows
    .map(candidate => (isRecord(candidate) && isRecord(candidate.Window) ? candidate.Window : null))
    .filter((window): window is JsonRecord => {
      if (!window) return false;
      const type = readString(window.Type)?.toLowerCase();
      return type === 'autolap';
    })
    .map((window, index) => {
      const distanceM = readNumber(window.Distance) ?? readNumber(window.DistanceMax);
      const durationSeconds = readNumber(window.Duration);
      const startOffsetSeconds = elapsedSeconds;
      if (durationSeconds != null && durationSeconds > 0) elapsedSeconds += durationSeconds;
      return {
        lapIndex: index + 1,
        lapType: mapWindowTypeToLapType(readString(window.Type)),
        distanceM,
        durationSeconds,
        avgPaceSecondsPerKm:
          distanceM != null && distanceM > 0 && durationSeconds != null ? durationSeconds / (distanceM / 1000) : null,
        avgHeartRate:
          readWindowMetric(window, 'HR', 'Avg') != null
            ? normaliseHeartRate(readWindowMetric(window, 'HR', 'Avg') as number)
            : null,
        maxHeartRate:
          readWindowMetric(window, 'HR', 'Max') != null
            ? normaliseHeartRate(readWindowMetric(window, 'HR', 'Max') as number)
            : null,
        startOffsetSeconds,
        endOffsetSeconds: durationSeconds != null ? startOffsetSeconds + durationSeconds : null,
      };
    });
}

function parseSuuntoJson(rawJson: string, options?: ParseSuuntoActivityOptions): CanonicalActivity {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch {
    throw new Error('Invalid Suunto JSON file.');
  }
  if (!isRecord(parsed)) throw new Error('Invalid Suunto JSON file.');
  const deviceLog = isRecord(parsed.DeviceLog) ? parsed.DeviceLog : parsed;
  const header = isRecord(deviceLog.Header) ? deviceLog.Header : deviceLog;
  const activityId =
    readNumber(header.ActivityType) ?? readNumber(header.activityId) ?? readNumber(header.activity_type_id);
  const sport = mapSuuntoActivityToCanonicalSport({
    activityId,
    sportName:
      readString(header.ActivityName) ??
      readString(header.Activity) ??
      readString(header.Sport) ??
      readString(header.sport),
  });
  const startedAt =
    normaliseTimestamp(header.DateTime) ?? normaliseTimestamp(header.StartTime) ?? normaliseTimestamp(header.startTime);
  const durationSeconds = readNumber(header.Duration) ?? readNumber(header.duration);
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

  if (Array.isArray(deviceLog.Samples)) {
    for (const sample of deviceLog.Samples) {
      if (isRecord(sample)) pushJsonSample(sample, startedAt, streams);
    }
  }

  const device = isRecord(deviceLog.Device)
    ? {
        name: readString(deviceLog.Device.Name) ?? readString(deviceLog.Device.name),
        model: isRecord(deviceLog.Device.Info)
          ? readString(deviceLog.Device.Info.HW)
          : readString(deviceLog.Device.Model),
        serial: readString(deviceLog.Device.SerialNumber) ?? readString(deviceLog.Device.serial),
      }
    : null;

  return buildCanonicalActivity({
    sourceFileType: 'json',
    sportType: sport.sportType,
    sportSubtype: sport.sportSubtype,
    summary: {
      startedAt,
      endedAt: deriveEndTime(startedAt, durationSeconds ?? null),
      durationSeconds,
      elapsedSeconds: durationSeconds,
      distanceM: readNumber(header.Distance) ?? readNumber(header.distance),
      caloriesKcal:
        readNumber(header.Calories) ??
        readNumber(header.KCal) ??
        normaliseCaloriesFromEnergy(readNumber(header.Energy) ?? readNumber(header.energy)),
      avgHeartRate:
        readNumber(header.AverageHeartRate) != null
          ? normaliseHeartRate(readNumber(header.AverageHeartRate) as number)
          : null,
      maxHeartRate:
        readNumber(header.MaxHeartRate) != null ? normaliseHeartRate(readNumber(header.MaxHeartRate) as number) : null,
      minHeartRate:
        readNumber(header.MinHeartRate) != null ? normaliseHeartRate(readNumber(header.MinHeartRate) as number) : null,
      elevationGainM: readNumber(header.Ascent) ?? readNumber(header.ascent),
      elevationLossM: readNumber(header.Descent) ?? readNumber(header.descent),
      recoveryTimeSeconds: readNumber(header.RecoveryTime) ?? readNumber(header.RecoveryTimeSeconds),
      vo2Max: readNumber(header.MAXVO2) ?? readNumber(header.VO2Max),
      epoc: readNumber(header.PeakEPOC) ?? readNumber(header.EPOC),
      pte: readNumber(header.PeakTrainingEffect) ?? readNumber(header.PTE),
      tss:
        readNumber(header.TrainingStressScore) ??
        readNumber(header.TSS) ??
        readNumber(header.TrainingLoadPeak) ??
        readNumber(header.TraingingLoadPeak),
      totalSteps: readNumber(header.StepCount) ?? readNumber(header.TotalSteps),
    },
    streams,
    laps: mapSuuntoWindowsToLaps(deviceLog.Windows),
    device,
    vendorFields: { suuntoActivityId: activityId ?? null },
    estimatedMaxHeartRate: options?.estimatedMaxHeartRate,
  });
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
    provider: 'suunto',
    sourceFileType: params.sourceFileType,
    sportType: params.sportType,
    sportSubtype: params.sportSubtype,
    providerActivityId: null,
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

export function parseSuuntoActivityFileToCanonical(
  content: string | Uint8Array,
  filename: string,
  options?: ParseSuuntoActivityOptions,
): CanonicalActivity {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.fit')) {
    if (typeof content === 'string') throw new Error('Invalid Suunto FIT file.');
    return parseSuuntoFit(content, options);
  }
  if (lower.endsWith('.json')) {
    if (typeof content !== 'string') throw new Error('Invalid Suunto JSON file.');
    return parseSuuntoJson(content, options);
  }
  return buildCanonicalActivity({
    sourceFileType: 'json',
    sportType: 'other',
    sportSubtype: null,
    summary: {},
    streams: EMPTY_STREAMS,
    laps: [],
    device: null,
    vendorFields: {},
    estimatedMaxHeartRate: options?.estimatedMaxHeartRate,
  });
}
