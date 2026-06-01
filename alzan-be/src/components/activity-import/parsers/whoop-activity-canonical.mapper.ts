import {
  CanonicalActivity,
  CanonicalActivityHeartRateZone,
  CanonicalActivitySportMapping,
  CanonicalActivityStreams,
} from './activity-import-canonical.types';
import { mapClimbingTextToCanonical } from './climbing-sport.mapper';
import { mapMartialArtsTextToCanonical } from './martial-arts-sport.mapper';
import { mapTrailTextToCanonical } from './trail-sport.mapper';
import { mapVolleyballTextToCanonical } from './volleyball-sport.mapper';

type JsonRecord = Record<string, unknown>;

interface ParseWhoopActivityOptions {
  estimatedMaxHeartRate?: number | null;
}

const KILOJOULE_PER_KILOCALORIE = 4.184;

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

function mapWhoopSport(sportName: string | null): CanonicalActivitySportMapping {
  const normalised =
    sportName
      ?.trim()
      .toLowerCase()
      .replace(/[\s-]+/g, '_') ?? '';
  const martialArtsSport = mapMartialArtsTextToCanonical(sportName);
  if (martialArtsSport) return martialArtsSport;

  const climbingSport = mapClimbingTextToCanonical(sportName);
  if (climbingSport) return climbingSport;
  const volleyballSport = mapVolleyballTextToCanonical(sportName);
  if (volleyballSport) return volleyballSport;
  const trailSport = mapTrailTextToCanonical(sportName);
  if (trailSport) return trailSport;

  if (normalised === 'running' || normalised === 'track_field')
    return { sportType: 'running', sportSubtype: 'outdoor' };
  if (normalised === 'walking' || normalised === 'walk') return { sportType: 'hiking', sportSubtype: 'urban_walk' };
  if (normalised === 'cycling') return { sportType: 'cycling', sportSubtype: 'road' };
  if (normalised === 'spin' || normalised === 'spinning') return { sportType: 'cycling', sportSubtype: 'spinning' };
  if (normalised === 'assault_bike' || normalised === 'indoor_cycling')
    return { sportType: 'cycling', sportSubtype: 'indoor_trainer' };
  if (normalised === 'mountain_biking') return { sportType: 'cycling', sportSubtype: 'mtb' };
  if (normalised === 'gravel_cycling' || normalised === 'gravel_ride')
    return { sportType: 'cycling', sportSubtype: 'gravel' };
  if (normalised === 'urban_cycling' || normalised === 'bike_commuting')
    return { sportType: 'cycling', sportSubtype: 'urban' };
  if (normalised === 'swimming') return { sportType: 'swimming', sportSubtype: null };
  if (normalised.includes('soccer') || normalised.includes('football') || normalised.includes('futsal')) {
    if (normalised.includes('futsal') || normalised.includes('sala') || normalised.includes('indoor')) {
      return { sportType: 'football', sportSubtype: 'futsal' };
    }
    return { sportType: 'football', sportSubtype: 'football_11' };
  }
  if (normalised === 'basketball') return { sportType: 'basketball', sportSubtype: 'indoor' };
  if (normalised === 'tennis') return { sportType: 'tennis', sportSubtype: 'outdoor' };
  if (normalised === 'padel' || normalised === 'paddle_tennis') return { sportType: 'padel', sportSubtype: 'outdoor' };
  if (normalised === 'hiking/rucking' || normalised === 'hiking' || normalised === 'rucking') {
    return { sportType: 'hiking', sportSubtype: 'trail' };
  }
  if (
    normalised === 'weightlifting' ||
    normalised === 'powerlifting' ||
    normalised === 'strength_trainer' ||
    normalised.includes('strength')
  ) {
    return { sportType: 'strength', sportSubtype: 'indoor' };
  }
  if (
    normalised === 'functional_fitness' ||
    normalised === 'box_fitness' ||
    normalised === 'gym' ||
    normalised === 'crossfit' ||
    normalised === 'hiit' ||
    normalised === 'workout' ||
    normalised.includes('fitness')
  ) {
    return { sportType: 'gym', sportSubtype: 'indoor' };
  }
  return { sportType: 'other', sportSubtype: null };
}

function selectWorkoutRecord(parsed: JsonRecord): JsonRecord {
  if (Array.isArray(parsed.records) && isRecord(parsed.records[0])) return parsed.records[0];
  if (Array.isArray(parsed.data) && isRecord(parsed.data[0])) return parsed.data[0];
  if (Array.isArray(parsed.workouts) && isRecord(parsed.workouts[0])) return parsed.workouts[0];
  if (isRecord(parsed.workout)) return parsed.workout;
  return parsed;
}

function readScore(record: JsonRecord): JsonRecord {
  return isRecord(record.score) ? record.score : record;
}

function readScoreNumber(record: JsonRecord, score: JsonRecord, key: string): number | null {
  return readNumber(score[key]) ?? readNumber(record[key]);
}

function buildHeartRateZonesFromWhoop(score: JsonRecord): CanonicalActivityHeartRateZone[] {
  const zoneDurations = isRecord(score.zone_durations) ? score.zone_durations : {};
  const zoneSecondsByCanonical = new Map<1 | 2 | 3 | 4 | 5, number>([
    [1, ((readNumber(zoneDurations.zone_zero_milli) ?? 0) + (readNumber(zoneDurations.zone_one_milli) ?? 0)) / 1000],
    [2, (readNumber(zoneDurations.zone_two_milli) ?? 0) / 1000],
    [3, (readNumber(zoneDurations.zone_three_milli) ?? 0) / 1000],
    [4, (readNumber(zoneDurations.zone_four_milli) ?? 0) / 1000],
    [5, (readNumber(zoneDurations.zone_five_milli) ?? 0) / 1000],
  ]);
  const totalSeconds = Array.from(zoneSecondsByCanonical.values()).reduce((sum, seconds) => sum + seconds, 0);
  if (totalSeconds <= 0) return [];
  return ([1, 2, 3, 4, 5] as const)
    .map(zone => {
      const durationSeconds = Math.round(zoneSecondsByCanonical.get(zone) ?? 0);
      return { zone, durationSeconds, percentage: Math.round((durationSeconds / totalSeconds) * 100) };
    })
    .filter(zone => zone.durationSeconds > 0);
}

export function parseWhoopActivityJsonToCanonical(
  content: string,
  filename: string,
  _options?: ParseWhoopActivityOptions,
): CanonicalActivity {
  const parsed = JSON.parse(content) as unknown;
  if (!isRecord(parsed)) throw new Error('Invalid WHOOP JSON file.');
  const record = selectWorkoutRecord(parsed);
  const score = readScore(record);
  const sportName = readString(record.sport_name) ?? readString(record.sportName);
  const sport = mapWhoopSport(sportName);
  const startedAt = normaliseTimestamp(record.start);
  const endedAt = normaliseTimestamp(record.end);
  const durationSeconds = readNumber(record.duration) ?? deriveDurationSeconds(startedAt, endedAt);
  const kilojoule = readScoreNumber(record, score, 'kilojoule');

  return {
    provider: 'whoop',
    sourceFileType: 'json',
    sportType: sport.sportType,
    sportSubtype: sport.sportSubtype,
    providerActivityId: readIdentifier(record.id),
    summary: {
      startedAt,
      endedAt,
      durationSeconds: roundNullable(durationSeconds),
      elapsedSeconds: roundNullable(durationSeconds),
      distanceM: roundNullable(readScoreNumber(record, score, 'distance_meter')),
      caloriesKcal: roundNullable(
        kilojoule == null ? readNumber(record.calories) : kilojoule / KILOJOULE_PER_KILOCALORIE,
      ),
      avgHeartRate: roundNullable(readScoreNumber(record, score, 'average_heart_rate')),
      maxHeartRate: roundNullable(readScoreNumber(record, score, 'max_heart_rate')),
      minHeartRate: null,
      avgSpeedMps: null,
      maxSpeedMps: null,
      avgCadence: null,
      maxCadence: null,
      avgPowerW: null,
      maxPowerW: null,
      elevationGainM: roundNullable(readScoreNumber(record, score, 'altitude_gain_meter')),
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
    streams: cloneEmptyStreams(),
    laps: [],
    heartRateZones: buildHeartRateZonesFromWhoop(score),
    device: null,
    vendorFields: {
      sourceProvider: 'whoop',
      whoopFilename: filename,
      whoopSportName: sportName,
      whoopSportId: readNumber(record.sport_id),
      whoopV1Id: readNumber(record.v1_id),
      whoopScoreState: readString(record.score_state),
      whoopStrain: readScoreNumber(record, score, 'strain'),
      whoopKilojoule: kilojoule,
      whoopPercentRecorded: readScoreNumber(record, score, 'percent_recorded'),
      whoopAltitudeChangeM: readScoreNumber(record, score, 'altitude_change_meter'),
    },
  };
}
