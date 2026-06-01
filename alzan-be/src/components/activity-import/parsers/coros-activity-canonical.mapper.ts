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
import { mapMartialArtsTextToCanonical } from './martial-arts-sport.mapper';
import { mapSkiingTextToCanonical } from './skiing-sport.mapper';
import { mapTrailTextToCanonical } from './trail-sport.mapper';
import { mapVolleyballTextToCanonical } from './volleyball-sport.mapper';
import { parseGarminActivityFileToCanonical } from './garmin-activity-canonical.mapper';

type JsonRecord = Record<string, unknown>;

interface ParseCorosActivityOptions {
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

function normaliseSportText(value: string | null): string {
  return (value ?? '')
    .replace(/[^a-z0-9]+/gi, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();
}

function mapCorosSport(record: JsonRecord): CanonicalActivitySportMapping {
  const rawSport =
    readString(record.activityType) ??
    readString(record.activity_type) ??
    readString(record.sport_name) ??
    readString(record.sport) ??
    readString(record.mode) ??
    readString(record.type);
  const text = normaliseSportText(rawSport);
  const martialArtsSport = mapMartialArtsTextToCanonical(rawSport);
  if (martialArtsSport) return martialArtsSport;

  const climbingSport = mapClimbingTextToCanonical(rawSport);
  if (climbingSport) return climbingSport;
  const volleyballSport = mapVolleyballTextToCanonical(rawSport);
  if (volleyballSport) return volleyballSport;
  const trailSport = mapTrailTextToCanonical(rawSport);
  if (trailSport) return trailSport;
  const skiingSport = mapSkiingTextToCanonical(rawSport);
  if (skiingSport) return skiingSport;

  if (text.includes('walk')) return { sportType: 'hiking', sportSubtype: 'urban_walk' };
  if (text.includes('padel'))
    return { sportType: 'padel', sportSubtype: text.includes('indoor') ? 'indoor' : 'outdoor' };
  if (text.includes('tennis')) return { sportType: 'tennis', sportSubtype: 'outdoor' };
  if (text.includes('basketball')) return { sportType: 'basketball', sportSubtype: 'outdoor' };
  if (text.includes('soccer') || text.includes('football')) {
    if (text.includes('futsal') || text.includes('sala') || text.includes('indoor')) {
      return { sportType: 'football', sportSubtype: 'futsal' };
    }
    return { sportType: 'football', sportSubtype: 'football_11' };
  }
  if (text.includes('hike') || text.includes('hiking')) return { sportType: 'hiking', sportSubtype: 'trail' };
  if (text.includes('pool') && text.includes('swim')) return { sportType: 'swimming', sportSubtype: 'pool' };
  if (text.includes('open_water')) return { sportType: 'swimming', sportSubtype: 'open_water' };
  if (text.includes('swim')) return { sportType: 'swimming', sportSubtype: null };
  if (text.includes('surf')) return { sportType: 'surf', sportSubtype: null };
  if (text.includes('trail') && text.includes('run')) return { sportType: 'trail', sportSubtype: 'trail_running' };
  if (text.includes('track') && text.includes('run')) return { sportType: 'running', sportSubtype: 'track' };
  if (text.includes('indoor') && text.includes('run')) return { sportType: 'running', sportSubtype: 'treadmill' };
  if (text.includes('run')) {
    if (
      text.includes('race') ||
      text.includes('carrera') ||
      text.includes('maraton') ||
      text.includes('maratón') ||
      text.includes('competition') ||
      text.includes('competición')
    ) {
      return { sportType: 'running', sportSubtype: 'race' };
    }
    return { sportType: 'running', sportSubtype: 'outdoor' };
  }
  if (text.includes('indoor') && (text.includes('bike') || text.includes('cycling'))) {
    if (text.includes('spin')) return { sportType: 'cycling', sportSubtype: 'spinning' };
    return { sportType: 'cycling', sportSubtype: 'indoor_trainer' };
  }
  if (text.includes('spin')) {
    return { sportType: 'cycling', sportSubtype: 'spinning' };
  }
  if (text.includes('gravel')) {
    return { sportType: 'cycling', sportSubtype: 'gravel' };
  }
  if (text.includes('mtb') || text.includes('mountain')) {
    return { sportType: 'cycling', sportSubtype: 'mtb' };
  }
  if (text.includes('urban') || text.includes('commute') || text.includes('city')) {
    return { sportType: 'cycling', sportSubtype: 'urban' };
  }
  if (text.includes('bike') || text.includes('cycling')) return { sportType: 'cycling', sportSubtype: 'road' };
  if (text.includes('strength') || text.includes('weight') || text.includes('functional')) {
    return { sportType: 'strength', sportSubtype: 'indoor' };
  }
  if (text.includes('gym') || text.includes('fitness')) return { sportType: 'gym', sportSubtype: 'indoor' };
  return { sportType: 'other', sportSubtype: null };
}

function readCorosSport(record: JsonRecord): string | null {
  return (
    readString(record.activityType) ??
    readString(record.activity_type) ??
    readString(record.sport_name) ??
    readString(record.sport) ??
    readString(record.mode) ??
    readString(record.type)
  );
}

function readDurationSeconds(record: JsonRecord): number | null {
  const seconds =
    readNumber(record.durationSeconds) ??
    readNumber(record.duration_seconds) ??
    readNumber(record.workoutTimeSeconds) ??
    readNumber(record.activeDurationSeconds);
  if (seconds != null) return seconds;
  const milliseconds = readNumber(record.durationMillis) ?? readNumber(record.duration_ms);
  if (milliseconds != null) return milliseconds / 1000;
  return null;
}

function readDistanceMeters(record: JsonRecord): number | null {
  const direct = readNumber(record.distanceM) ?? readNumber(record.distance_m) ?? readNumber(record.distanceMeters);
  if (direct != null) return direct;
  const distance = readNumber(record.distance);
  if (distance == null) return null;
  const unit = readString(record.distanceUnit)?.toLowerCase();
  if (unit === 'km' || unit === 'kilometer' || unit === 'kilometers') return distance * 1000;
  return distance;
}

function readCalories(record: JsonRecord): number | null {
  return readNumber(record.caloriesKcal) ?? readNumber(record.calories_kcal) ?? readNumber(record.calories);
}

function readSpeedMps(value: unknown, unit?: unknown): number | null {
  const speed = readNumber(value);
  if (speed == null) return null;
  const unitText = readString(unit)?.toLowerCase();
  if (unitText === 'kmh' || unitText === 'km/h') return speed / 3.6;
  return speed;
}

function readSamples(record: JsonRecord): JsonRecord[] {
  const samples = record.samples ?? record.records ?? record.streams;
  if (Array.isArray(samples)) return samples.filter(isRecord);
  if (!isRecord(samples)) return [];
  const time = Array.isArray(samples.time) ? samples.time : [];
  const sampleCount = Math.max(
    time.length,
    Array.isArray(samples.heart_rate) ? samples.heart_rate.length : 0,
    Array.isArray(samples.hr) ? samples.hr.length : 0,
    Array.isArray(samples.distance) ? samples.distance.length : 0,
    Array.isArray(samples.speed) ? samples.speed.length : 0,
    Array.isArray(samples.altitude) ? samples.altitude.length : 0,
    Array.isArray(samples.cadence) ? samples.cadence.length : 0,
    Array.isArray(samples.power) ? samples.power.length : 0,
  );
  return Array.from({ length: sampleCount }, (_, index) => ({
    offsetSeconds: time[index],
    heartRate: Array.isArray(samples.heart_rate) ? samples.heart_rate[index] : undefined,
    hr: Array.isArray(samples.hr) ? samples.hr[index] : undefined,
    distance: Array.isArray(samples.distance) ? samples.distance[index] : undefined,
    speed: Array.isArray(samples.speed) ? samples.speed[index] : undefined,
    altitude: Array.isArray(samples.altitude) ? samples.altitude[index] : undefined,
    cadence: Array.isArray(samples.cadence) ? samples.cadence[index] : undefined,
    power: Array.isArray(samples.power) ? samples.power[index] : undefined,
  }));
}

function buildStreams(record: JsonRecord, startedAt: string | null): CanonicalActivityStreams {
  const streams = cloneEmptyStreams();
  const route = Array.isArray(record.route) ? record.route : Array.isArray(record.track) ? record.track : [];
  route.filter(isRecord).forEach((point, index) => {
    const timestamp = normaliseTimestamp(point.timestamp ?? point.time);
    const offsetSeconds =
      readNumber(point.offsetSeconds) ??
      readNumber(point.elapsedSeconds) ??
      readNumber(point.elapsed_time) ??
      resolveOffsetSeconds(startedAt, timestamp) ??
      index;
    pushPositionSample(
      streams.position,
      startedAt,
      offsetSeconds,
      readNumber(point.lat ?? point.latitude),
      readNumber(point.lon ?? point.longitude),
    );
    pushMetricSample(streams.altitude, startedAt, offsetSeconds, readNumber(point.altitude ?? point.elevation));
  });
  readSamples(record).forEach((sample, index) => {
    const timestamp = normaliseTimestamp(sample.timestamp ?? sample.time);
    const offsetSeconds =
      readNumber(sample.offsetSeconds) ??
      readNumber(sample.elapsedSeconds) ??
      readNumber(sample.elapsed_time) ??
      resolveOffsetSeconds(startedAt, timestamp) ??
      index;
    pushPositionSample(
      streams.position,
      startedAt,
      offsetSeconds,
      readNumber(sample.lat ?? sample.latitude),
      readNumber(sample.lon ?? sample.longitude),
    );
    pushMetricSample(
      streams.heartRate,
      startedAt,
      offsetSeconds,
      readNumber(sample.heartRate ?? sample.heart_rate ?? sample.hr),
    );
    pushMetricSample(streams.speed, startedAt, offsetSeconds, readSpeedMps(sample.speed, sample.speedUnit));
    pushMetricSample(streams.distance, startedAt, offsetSeconds, readNumber(sample.distance ?? sample.distanceM));
    pushMetricSample(streams.altitude, startedAt, offsetSeconds, readNumber(sample.altitude ?? sample.elevation));
    pushMetricSample(streams.cadence, startedAt, offsetSeconds, readNumber(sample.cadence));
    pushMetricSample(streams.power, startedAt, offsetSeconds, readNumber(sample.power ?? sample.watts));
    pushMetricSample(streams.temperature, startedAt, offsetSeconds, readNumber(sample.temperature ?? sample.temp));
  });
  return streams;
}

function mapCorosLaps(record: JsonRecord): CanonicalActivityLap[] {
  const laps = Array.isArray(record.laps) ? record.laps : Array.isArray(record.autoLaps) ? record.autoLaps : [];
  return laps.filter(isRecord).map((lap, index) => {
    const durationSeconds = readNumber(lap.durationSeconds) ?? readNumber(lap.duration_s) ?? readNumber(lap.time);
    const distanceM = readNumber(lap.distanceM) ?? readNumber(lap.distance);
    const avgSpeedMps = readSpeedMps(lap.avgSpeed ?? lap.averageSpeed, lap.speedUnit);
    return {
      lapIndex: index + 1,
      lapType: readString(lap.type)?.toLowerCase().includes('auto') ? 'auto' : 'manual',
      distanceM,
      durationSeconds,
      avgPaceSecondsPerKm: avgSpeedMps != null && avgSpeedMps > 0 ? 1000 / avgSpeedMps : null,
      avgHeartRate: roundNullable(readNumber(lap.avgHeartRate ?? lap.averageHeartRate)),
      maxHeartRate: roundNullable(readNumber(lap.maxHeartRate)),
      startOffsetSeconds: readNumber(lap.startOffsetSeconds),
      endOffsetSeconds: readNumber(lap.endOffsetSeconds),
    };
  });
}

function mapNativeHeartRateZones(record: JsonRecord): CanonicalActivityHeartRateZone[] {
  const zones = Array.isArray(record.heart_rate_zones)
    ? record.heart_rate_zones
    : Array.isArray(record.heartRateZones)
      ? record.heartRateZones
      : [];
  const mapped = zones.filter(isRecord).flatMap((zone, index) => {
    const durationSeconds =
      readNumber(zone.durationSeconds) ??
      readNumber(zone.duration_s) ??
      (readNumber(zone.durationMillis) ?? readNumber(zone.duration_ms) ?? 0) / 1000;
    if (durationSeconds <= 0) return [];
    return {
      zone: Math.min(5, Math.max(1, Math.round(readNumber(zone.zone) ?? index + 1))) as 1 | 2 | 3 | 4 | 5,
      durationSeconds,
      percentage: readNumber(zone.percentage) ?? 0,
    };
  });
  const totalSeconds = mapped.reduce((sum, zone) => sum + zone.durationSeconds, 0);
  return mapped.map(zone => ({
    ...zone,
    percentage:
      zone.percentage > 0 ? zone.percentage : totalSeconds > 0 ? (zone.durationSeconds / totalSeconds) * 100 : 0,
  }));
}

function calculateHeartRateZones(
  samples: CanonicalActivityMetricSample[],
  estimatedMaxHeartRate?: number | null,
): CanonicalActivityHeartRateZone[] {
  if (samples.length < 2) return [];
  const maxHeartRate = estimatedMaxHeartRate ?? Math.max(...samples.map(sample => sample.value));
  if (!Number.isFinite(maxHeartRate) || maxHeartRate <= 0) return [];
  const buckets = [0, 0, 0, 0, 0];
  for (const sample of samples) {
    const ratio = sample.value / maxHeartRate;
    const zone = ratio < 0.6 ? 0 : ratio < 0.7 ? 1 : ratio < 0.8 ? 2 : ratio < 0.9 ? 3 : 4;
    buckets[zone] += 60;
  }
  const total = buckets.reduce((sum, value) => sum + value, 0);
  return buckets.flatMap((durationSeconds, index) =>
    durationSeconds > 0
      ? [{ zone: (index + 1) as 1 | 2 | 3 | 4 | 5, durationSeconds, percentage: (durationSeconds / total) * 100 }]
      : [],
  );
}

function averageMetric(samples: CanonicalActivityMetricSample[]): number | null {
  if (samples.length === 0) return null;
  return samples.reduce((sum, sample) => sum + sample.value, 0) / samples.length;
}

function maxMetric(samples: CanonicalActivityMetricSample[]): number | null {
  return samples.length > 0 ? Math.max(...samples.map(sample => sample.value)) : null;
}

function mapCorosFit(binary: Uint8Array, filename: string, options?: ParseCorosActivityOptions): CanonicalActivity {
  const canonical = parseGarminActivityFileToCanonical(binary, filename, options);
  return {
    ...canonical,
    provider: 'coros',
    vendorFields: {
      ...canonical.vendorFields,
      sourceProvider: 'coros',
      corosFilename: filename,
      corosFitParsedWith: 'generic_fit',
    },
  };
}

function parseCorosJson(content: string, filename: string, options?: ParseCorosActivityOptions): CanonicalActivity {
  const parsed = JSON.parse(content) as unknown;
  if (!isRecord(parsed)) throw new Error('Invalid COROS JSON file.');
  const record = isRecord(parsed.workout) ? parsed.workout : isRecord(parsed.activity) ? parsed.activity : parsed;
  const startedAt = normaliseTimestamp(record.startTime ?? record.start_time ?? record.startedAt ?? record.start);
  const durationSeconds = readDurationSeconds(record);
  const endedAt =
    normaliseTimestamp(record.endTime ?? record.end_time ?? record.endedAt ?? record.end) ??
    deriveEndTime(startedAt, durationSeconds);
  const streams = buildStreams(record, startedAt);
  const nativeZones = mapNativeHeartRateZones(record);
  const distanceM = readDistanceMeters(record) ?? maxMetric(streams.distance);
  const sport = mapCorosSport(record);
  return {
    provider: 'coros',
    sourceFileType: 'json',
    sportType: sport.sportType,
    sportSubtype: sport.sportSubtype,
    providerActivityId:
      readIdentifier(record.id) ?? readIdentifier(record.activityId) ?? readIdentifier(record.workoutId),
    summary: {
      startedAt,
      endedAt,
      durationSeconds,
      elapsedSeconds: readNumber(record.elapsedSeconds) ?? durationSeconds,
      distanceM,
      caloriesKcal: readCalories(record),
      avgHeartRate: roundNullable(
        readNumber(record.avgHeartRate ?? record.averageHeartRate) ?? averageMetric(streams.heartRate),
      ),
      maxHeartRate: roundNullable(readNumber(record.maxHeartRate) ?? maxMetric(streams.heartRate)),
      minHeartRate: roundNullable(readNumber(record.minHeartRate)),
      avgSpeedMps:
        readSpeedMps(record.avgSpeed ?? record.averageSpeed, record.speedUnit) ?? averageMetric(streams.speed),
      maxSpeedMps: readSpeedMps(record.maxSpeed, record.speedUnit) ?? maxMetric(streams.speed),
      avgCadence: roundNullable(
        readNumber(record.avgCadence ?? record.averageCadence) ?? averageMetric(streams.cadence),
      ),
      maxCadence: roundNullable(readNumber(record.maxCadence) ?? maxMetric(streams.cadence)),
      avgPowerW: roundNullable(readNumber(record.avgPower ?? record.averagePower) ?? averageMetric(streams.power)),
      maxPowerW: roundNullable(readNumber(record.maxPower) ?? maxMetric(streams.power)),
      elevationGainM: readNumber(record.elevationGainM ?? record.elevation_gain ?? record.totalAscent),
      elevationLossM: readNumber(record.elevationLossM ?? record.elevation_loss ?? record.totalDescent),
      avgTemperatureC:
        readNumber(record.avgTemperature ?? record.averageTemperature) ?? averageMetric(streams.temperature),
      maxTemperatureC: readNumber(record.maxTemperature) ?? maxMetric(streams.temperature),
      totalSteps: readNumber(record.steps) ?? readNumber(record.totalSteps),
      recoveryTimeSeconds: readNumber(record.recoveryTimeSeconds),
      vo2Max: readNumber(record.vo2Max),
      epoc: readNumber(record.epoc),
      pte: readNumber(record.aerobic_te ?? record.aerobicTrainingEffect),
      tss: readNumber(record.training_load ?? record.trainingLoad),
    },
    streams,
    laps: mapCorosLaps(record),
    heartRateZones:
      nativeZones.length > 0 ? nativeZones : calculateHeartRateZones(streams.heartRate, options?.estimatedMaxHeartRate),
    device: {
      name: readString(record.deviceName) ?? readString(record.device?.toString()),
      model: readString(record.deviceModel) ?? (isRecord(record.device) ? readString(record.device.model) : null),
      serial: readString(record.deviceSerial) ?? (isRecord(record.device) ? readString(record.device.serial) : null),
    },
    vendorFields: {
      sourceProvider: 'coros',
      corosFilename: filename,
      corosSport: readCorosSport(record),
      corosMode: readString(record.mode),
      trainingLoad: readNumber(record.training_load ?? record.trainingLoad),
      aerobicTrainingEffect: readNumber(record.aerobic_te ?? record.aerobicTrainingEffect),
      anaerobicTrainingEffect: readNumber(record.anaerobic_te ?? record.anaerobicTrainingEffect),
      runningPerformance: record.runningPerformance ?? null,
      effortPace: record.effortPace ?? null,
      strideLength: readNumber(record.strideLength),
      groundTime: readNumber(record.groundTime),
      leftRightBalance: record.leftRightBalance ?? null,
      strideHeight: readNumber(record.strideHeight),
      strideRatio: readNumber(record.strideRatio),
      swimmingMetrics: record.swimmingMetrics ?? record.swimMetrics ?? null,
      temperatureMetrics: record.temperatureMetrics ?? null,
      rawDevice: record.device ?? null,
    },
  };
}

export function parseCorosActivityFileToCanonical(
  content: string | Uint8Array,
  filename: string,
  options?: ParseCorosActivityOptions,
): CanonicalActivity {
  if (typeof content !== 'string') return mapCorosFit(content, filename, options);
  return parseCorosJson(content, filename, options);
}
