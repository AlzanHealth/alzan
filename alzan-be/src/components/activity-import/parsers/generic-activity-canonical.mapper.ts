import {
  CanonicalActivity,
  CanonicalActivityMetricSample,
  CanonicalActivityPointSample,
  CanonicalActivityProvider,
  CanonicalActivitySportMapping,
  CanonicalActivityStreams,
} from './activity-import-canonical.types';
import { mapClimbingTextToCanonical } from './climbing-sport.mapper';
import { mapGolfTextToCanonical } from './golf-sport.mapper';
import { mapHyroxTextToCanonical } from './hyrox-sport.mapper';
import { mapMartialArtsTextToCanonical } from './martial-arts-sport.mapper';
import { mapSkiingTextToCanonical } from './skiing-sport.mapper';
import { mapSnowboardTextToCanonical } from './snowboard-sport.mapper';
import { mapSurfTextToCanonical } from './surf-sport.mapper';
import { mapTrailTextToCanonical } from './trail-sport.mapper';
import { mapVolleyballTextToCanonical } from './volleyball-sport.mapper';

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

function deriveDurationSeconds(startedAt: string | null, endedAt: string | null): number | null {
  if (!startedAt || !endedAt) return null;
  const startedMs = new Date(startedAt).getTime();
  const endedMs = new Date(endedAt).getTime();
  if (!Number.isFinite(startedMs) || !Number.isFinite(endedMs) || endedMs <= startedMs) return null;
  return Math.round((endedMs - startedMs) / 1000);
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

function resolveOffsetSeconds(startedAt: string | null, timestamp: string | null): number | null {
  if (!startedAt || !timestamp) return null;
  const startedMs = new Date(startedAt).getTime();
  const timestampMs = new Date(timestamp).getTime();
  if (!Number.isFinite(startedMs) || !Number.isFinite(timestampMs)) return null;
  return Math.max(0, Math.round((timestampMs - startedMs) / 1000));
}

function normaliseCaloriesFromEnergy(value: number | null): number | null {
  if (value == null || !Number.isFinite(value) || value <= 0) return null;
  return value > 20000 ? value / 4184 : value / 4.184;
}

function readNestedNumber(record: JsonRecord, sectionName: string, key: string): number | null {
  const section = record[sectionName];
  if (!isRecord(section)) return null;
  return readNumber(section[key]);
}

function detectProvider(parsed: JsonRecord, filename: string): CanonicalActivityProvider {
  const lower = [
    filename,
    readString(parsed.provider),
    readString(parsed.source),
    readString(parsed.platform),
    readString(parsed.uploaded_from),
  ]
    .filter((value): value is string => value != null)
    .join(' ')
    .toLowerCase();
  if (lower.includes('apple')) return 'apple_health';
  if (lower.includes('health_connect') || lower.includes('health connect')) return 'health_connect';
  if (lower.includes('ultrahuman')) return 'ultrahuman';
  if (lower.includes('fitbit')) return 'fitbit';
  if (lower.includes('whoop')) return 'whoop';
  if (lower.includes('oura')) return 'oura';
  if (lower.includes('polar')) return 'polar';
  if (lower.includes('strava')) return 'strava';
  if (lower.includes('garmin')) return 'garmin';
  if (lower.includes('suunto')) return 'suunto';
  return 'other';
}

function mapSportNameToCanonical(rawSportName: string | null): CanonicalActivitySportMapping {
  const sportName = rawSportName?.toLowerCase() ?? '';
  const martialArtsSport = mapMartialArtsTextToCanonical(rawSportName);
  if (martialArtsSport) return martialArtsSport;
  const climbingSport = mapClimbingTextToCanonical(rawSportName);
  if (climbingSport) return climbingSport;
  const volleyballSport = mapVolleyballTextToCanonical(rawSportName);
  if (volleyballSport) return volleyballSport;

  const golfSport = mapGolfTextToCanonical(rawSportName);
  if (golfSport) return golfSport;
  const hyroxSport = mapHyroxTextToCanonical(rawSportName);
  if (hyroxSport) return hyroxSport;
  const trailSport = mapTrailTextToCanonical(rawSportName);
  if (trailSport) return trailSport;
  const skiingSport = mapSkiingTextToCanonical(rawSportName);
  if (skiingSport) return skiingSport;
  const snowboardSport = mapSnowboardTextToCanonical(rawSportName);
  if (snowboardSport) return snowboardSport;
  const surfSport = mapSurfTextToCanonical(rawSportName);
  if (surfSport) return surfSport;

  if (sportName.includes('padel')) return { sportType: 'padel', sportSubtype: 'outdoor' };
  if (sportName.includes('basketball')) return { sportType: 'basketball', sportSubtype: 'indoor' };
  if (sportName.includes('football') || sportName.includes('soccer')) {
    if (sportName.includes('futsal') || sportName.includes('sala') || sportName.includes('indoor')) {
      return { sportType: 'football', sportSubtype: 'futsal' };
    }
    return { sportType: 'football', sportSubtype: 'football_11' };
  }
  if (sportName.includes('tennis')) return { sportType: 'tennis', sportSubtype: 'outdoor' };
  if (sportName.includes('hiking') || sportName.includes('hike')) return { sportType: 'hiking', sportSubtype: 'trail' };
  if (sportName.includes('pool') && sportName.includes('swim')) return { sportType: 'swimming', sportSubtype: 'pool' };
  if (sportName.includes('open water') || sportName.includes('open_water')) {
    return { sportType: 'swimming', sportSubtype: 'open_water' };
  }
  if (sportName.includes('swim')) return { sportType: 'swimming', sportSubtype: 'pool' };
  if (sportName.includes('ride') || sportName.includes('bike') || sportName.includes('cycl')) {
    if (sportName.includes('spin')) return { sportType: 'cycling', sportSubtype: 'spinning' };
    if (sportName.includes('gravel')) return { sportType: 'cycling', sportSubtype: 'gravel' };
    if (sportName.includes('mountain') || sportName.includes('mtb'))
      return { sportType: 'cycling', sportSubtype: 'mtb' };
    if (sportName.includes('urban') || sportName.includes('commute') || sportName.includes('city'))
      return { sportType: 'cycling', sportSubtype: 'urban' };
    if (sportName.includes('indoor') || sportName.includes('trainer'))
      return { sportType: 'cycling', sportSubtype: 'indoor_trainer' };
    return { sportType: 'cycling', sportSubtype: 'road' };
  }
  if (sportName.includes('walk')) return { sportType: 'hiking', sportSubtype: 'urban_walk' };
  if (sportName.includes('run')) return { sportType: 'running', sportSubtype: 'outdoor' };
  if (
    sportName.includes('strength') ||
    sportName.includes('weightlifting') ||
    sportName.includes('weight training') ||
    sportName.includes('weight')
  ) {
    return { sportType: 'strength', sportSubtype: 'indoor' };
  }
  if (
    sportName.includes('gym') ||
    sportName.includes('fitness') ||
    sportName.includes('workout') ||
    sportName.includes('circuit') ||
    sportName.includes('crossfit') ||
    sportName.includes('hiit') ||
    sportName.includes('aerobic') ||
    sportName.includes('bootcamp')
  ) {
    return { sportType: 'gym', sportSubtype: 'indoor' };
  }
  return { sportType: 'other', sportSubtype: null };
}

function readSportName(parsed: JsonRecord): string | null {
  return (
    readString(parsed.sport_type) ??
    readString(parsed.sportType) ??
    readString(parsed.activityName) ??
    readString(parsed.activity) ??
    readString(parsed.workoutActivityType) ??
    readString(parsed.exerciseType) ??
    readString(parsed.sport_name) ??
    readString(parsed.type)
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

function readHeartRateSample(sample: JsonRecord): number | null {
  return (
    readNumber(sample.heart_rate) ??
    readNumber(sample.heartRate) ??
    readNumber(sample.HeartRate) ??
    readNumber(sample.hr) ??
    readNumber(sample.bpm)
  );
}

function pushGenericSample(sample: JsonRecord, startedAt: string | null, streams: CanonicalActivityStreams): void {
  const timestamp = normaliseTimestamp(sample.timestamp ?? sample.time ?? sample.startTime ?? sample.dateTime);
  pushPositionSample(
    streams.position,
    startedAt,
    timestamp,
    readNumber(sample.latitude) ?? readNumber(sample.lat),
    readNumber(sample.longitude) ?? readNumber(sample.lon) ?? readNumber(sample.lng),
  );
  pushMetricSample(streams.heartRate, startedAt, timestamp, readHeartRateSample(sample));
  pushMetricSample(streams.distance, startedAt, timestamp, readNumber(sample.distance) ?? readNumber(sample.distanceM));
  pushMetricSample(streams.speed, startedAt, timestamp, readNumber(sample.speed) ?? readNumber(sample.speedMps));
  pushMetricSample(streams.power, startedAt, timestamp, readNumber(sample.power) ?? readNumber(sample.powerW));
  pushMetricSample(streams.cadence, startedAt, timestamp, readNumber(sample.cadence));
}

function pushStravaLatLngStreams(
  parsed: JsonRecord,
  startedAt: string | null,
  streams: CanonicalActivityStreams,
): void {
  const rawStreams = parsed.streams;
  if (!isRecord(rawStreams) || !Array.isArray(rawStreams.latlng)) return;
  const times = Array.isArray(rawStreams.time) ? rawStreams.time : [];
  rawStreams.latlng.forEach((point, index) => {
    if (!Array.isArray(point) || point.length < 2) return;
    const offsetSeconds = readNumber(times[index]);
    const timestamp =
      startedAt && offsetSeconds != null
        ? new Date(new Date(startedAt).getTime() + offsetSeconds * 1000).toISOString()
        : null;
    pushPositionSample(streams.position, startedAt, timestamp, readNumber(point[0]), readNumber(point[1]));
  });
}

function readSamples(parsed: JsonRecord): unknown[] {
  if (Array.isArray(parsed.samples)) return parsed.samples;
  if (Array.isArray(parsed.Samples)) return parsed.Samples;
  if (Array.isArray(parsed.records)) return parsed.records;
  return [];
}

function buildStreams(parsed: JsonRecord, startedAt: string | null): CanonicalActivityStreams {
  const streams = cloneEmptyStreams();
  for (const sample of readSamples(parsed)) {
    if (isRecord(sample)) pushGenericSample(sample, startedAt, streams);
  }
  pushStravaLatLngStreams(parsed, startedAt, streams);
  return streams;
}

function readStartedAt(parsed: JsonRecord): string | null {
  return normaliseTimestamp(
    parsed.start_date ??
      parsed.startDate ??
      parsed.startTime ??
      parsed.started_at ??
      parsed.start ??
      parsed.start_datetime ??
      parsed.date,
  );
}

function readEndedAt(parsed: JsonRecord): string | null {
  return normaliseTimestamp(parsed.end_date ?? parsed.endDate ?? parsed.endTime ?? parsed.ended_at ?? parsed.end);
}

function readDurationSeconds(parsed: JsonRecord, startedAt: string | null, endedAt: string | null): number | null {
  return (
    readNumber(parsed.elapsed_time) ??
    readNumber(parsed.moving_time) ??
    readNumber(parsed.durationSeconds) ??
    readNumber(parsed.duration) ??
    deriveDurationSeconds(startedAt, endedAt)
  );
}

function readCaloriesKcal(parsed: JsonRecord): number | null {
  return (
    readNumber(parsed.calories) ??
    readNumber(parsed.calories_kcal) ??
    readNumber(parsed.activeEnergyBurned) ??
    readNumber(parsed.totalEnergyBurnedKcal) ??
    readNestedNumber(parsed, 'movement', 'active_kcal') ??
    normaliseCaloriesFromEnergy(
      readNumber(parsed.kilojoule) ?? readNumber(parsed.kilojoules) ?? readNumber(parsed.energy_kj),
    )
  );
}

function readDistanceM(parsed: JsonRecord): number | null {
  return readNumber(parsed.distance) ?? readNumber(parsed.distance_m) ?? readNumber(parsed.distanceMeters);
}

function readAverageHeartRate(parsed: JsonRecord): number | null {
  return (
    readNumber(parsed.average_heartrate) ??
    readNumber(parsed.average_heart_rate) ??
    readNumber(parsed.avgHeartRate) ??
    readNumber(parsed.averageHeartRate) ??
    readNestedNumber(parsed, 'heart_rate', 'average_bpm')
  );
}

function readMaxHeartRate(parsed: JsonRecord): number | null {
  return (
    readNumber(parsed.max_heartrate) ??
    readNumber(parsed.maximum_heart_rate) ??
    readNumber(parsed.max_heart_rate) ??
    readNumber(parsed.maxHeartRate) ??
    readNumber(parsed.maximumHeartRate)
  );
}

function readMinHeartRate(parsed: JsonRecord): number | null {
  return (
    readNumber(parsed.min_heartrate) ??
    readNumber(parsed.minimum_heart_rate) ??
    readNumber(parsed.min_heart_rate) ??
    readNumber(parsed.minHeartRate) ??
    readNumber(parsed.minimumHeartRate)
  );
}

function readDevice(parsed: JsonRecord): CanonicalActivity['device'] {
  const rawDevice = isRecord(parsed.device) ? parsed.device : isRecord(parsed.Device) ? parsed.Device : null;
  if (!rawDevice) return null;
  return {
    name: readString(rawDevice.name) ?? readString(rawDevice.Name),
    model: readString(rawDevice.model) ?? readString(rawDevice.Model),
    serial: readString(rawDevice.serial) ?? readString(rawDevice.SerialNumber),
  };
}

function buildCanonicalActivity(params: {
  provider: CanonicalActivityProvider;
  sport: CanonicalActivitySportMapping;
  startedAt: string | null;
  endedAt: string | null;
  durationSeconds: number | null;
  parsed: JsonRecord;
  streams: CanonicalActivityStreams;
}): CanonicalActivity {
  return {
    provider: params.provider,
    sourceFileType: 'json',
    sportType: params.sport.sportType,
    sportSubtype: params.sport.sportSubtype,
    providerActivityId: readString(params.parsed.id) ?? readString(params.parsed.activity_id),
    summary: {
      startedAt: params.startedAt,
      endedAt: deriveEndTime(params.startedAt, params.durationSeconds, params.endedAt),
      durationSeconds: roundNullable(params.durationSeconds),
      elapsedSeconds: roundNullable(params.durationSeconds),
      distanceM: readDistanceM(params.parsed),
      caloriesKcal: roundNullable(readCaloriesKcal(params.parsed)),
      avgHeartRate: roundNullable(readAverageHeartRate(params.parsed)),
      maxHeartRate: roundNullable(readMaxHeartRate(params.parsed)),
      minHeartRate: roundNullable(readMinHeartRate(params.parsed)),
      avgSpeedMps: readNumber(params.parsed.avgSpeedMps),
      maxSpeedMps: readNumber(params.parsed.maxSpeedMps),
      avgCadence: roundNullable(readNumber(params.parsed.avgCadence)),
      maxCadence: roundNullable(readNumber(params.parsed.maxCadence)),
      avgPowerW: roundNullable(readNumber(params.parsed.avgPowerW)),
      maxPowerW: roundNullable(readNumber(params.parsed.maxPowerW)),
      elevationGainM: readNumber(params.parsed.elevationGainM),
      elevationLossM: readNumber(params.parsed.elevationLossM),
      avgTemperatureC: readNumber(params.parsed.avgTemperatureC),
      maxTemperatureC: readNumber(params.parsed.maxTemperatureC),
      totalSteps: roundNullable(
        readNumber(params.parsed.steps) ??
          readNumber(params.parsed.totalSteps) ??
          readNestedNumber(params.parsed, 'movement', 'steps'),
      ),
      recoveryTimeSeconds: roundNullable(
        readNumber(params.parsed.recovery_time) ?? readNumber(params.parsed.recoveryTimeSeconds),
      ),
      vo2Max: readNumber(params.parsed.vo2Max) ?? readNestedNumber(params.parsed, 'movement', 'vo2_max'),
      epoc: readNumber(params.parsed.epoc) ?? readNumber(params.parsed.EPOC),
      pte: readNumber(params.parsed.pte) ?? readNumber(params.parsed.PTE),
      tss: readNumber(params.parsed.tss) ?? readNumber(params.parsed.TSS) ?? readNumber(params.parsed.hrTSS),
    },
    streams: params.streams,
    laps: [],
    heartRateZones: [],
    device: readDevice(params.parsed),
    vendorFields: {
      sourceProvider: params.provider === 'other' ? 'unknown' : params.provider,
      sourceSport: readSportName(params.parsed),
    },
  };
}

export function parseGenericActivityJsonToCanonical(rawJson: string, filename: string): CanonicalActivity {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch {
    throw new Error('Invalid activity JSON file.');
  }
  if (!isRecord(parsed)) throw new Error('Invalid activity JSON file.');
  const provider = detectProvider(parsed, filename);
  const sport = mapSportNameToCanonical(readSportName(parsed));
  const startedAt = readStartedAt(parsed);
  const endedAt = readEndedAt(parsed);
  const durationSeconds = readDurationSeconds(parsed, startedAt, endedAt);
  const streams = buildStreams(parsed, startedAt);
  return buildCanonicalActivity({ provider, sport, startedAt, endedAt, durationSeconds, parsed, streams });
}

export function buildEmptyGenericActivity(): CanonicalActivity {
  return {
    provider: 'other',
    sourceFileType: 'json',
    sportType: 'other',
    sportSubtype: null,
    providerActivityId: null,
    summary: {
      startedAt: null,
      endedAt: null,
      durationSeconds: null,
      elapsedSeconds: null,
      distanceM: null,
      caloriesKcal: null,
      avgHeartRate: null,
      maxHeartRate: null,
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
      totalSteps: null,
      recoveryTimeSeconds: null,
      vo2Max: null,
      epoc: null,
      pte: null,
      tss: null,
    },
    streams: cloneEmptyStreams(),
    laps: [],
    heartRateZones: [],
    device: null,
    vendorFields: {},
  };
}
