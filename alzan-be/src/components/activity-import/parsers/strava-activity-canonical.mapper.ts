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

type JsonRecord = Record<string, unknown>;

interface ParseStravaActivityOptions {
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
  if (typeof value === 'string' && value.trim().length > 0) return value.trim();
  return null;
}

function readIdentifier(value: unknown): string | null {
  if (typeof value === 'string' && value.trim().length > 0) return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(Math.round(value));
  return null;
}

function readBoolean(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value === 1 ? true : value === 0 ? false : null;
  if (typeof value !== 'string') return null;
  const normalised = value.trim().toLowerCase();
  if (normalised === 'true' || normalised === '1') return true;
  if (normalised === 'false' || normalised === '0') return false;
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
  rawPoint: unknown,
): void {
  if (!Array.isArray(rawPoint) || rawPoint.length < 2) return;
  const lat = readNumber(rawPoint[0]);
  const lon = readNumber(rawPoint[1]);
  if (lat == null || lon == null || Math.abs(lat) > 90 || Math.abs(lon) > 180) return;
  target.push({ offsetSeconds, timestamp: resolveTimestamp(startedAt, offsetSeconds), lat, lon });
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

function mapStravaSport(rawSportType: string | null, trainer: boolean | null): CanonicalActivitySportMapping {
  const sportType = rawSportType?.trim() ?? '';
  const normalised = sportType.toLowerCase();
  if (normalised === 'trailrun') return { sportType: 'running', sportSubtype: 'trail' };
  if (normalised === 'virtualrun') return { sportType: 'running', sportSubtype: 'indoor' };
  if (normalised === 'run') return { sportType: 'running', sportSubtype: trainer ? 'indoor' : 'road' };
  if (normalised === 'mountainbikeride' || normalised === 'gravelride' || normalised === 'emountainbikeride') {
    return { sportType: 'cycling', sportSubtype: 'trail' };
  }
  if (normalised === 'virtualride') return { sportType: 'cycling', sportSubtype: 'indoor' };
  if (normalised === 'ride' || normalised === 'ebikeride') {
    return { sportType: 'cycling', sportSubtype: trainer ? 'indoor' : 'road' };
  }
  if (normalised === 'swim') return { sportType: 'swimming', sportSubtype: null };
  if (normalised === 'soccer' || normalised === 'football') return { sportType: 'football', sportSubtype: 'outdoor' };
  if (normalised === 'basketball') return { sportType: 'basketball', sportSubtype: 'indoor' };
  if (normalised === 'tennis') return { sportType: 'tennis', sportSubtype: 'outdoor' };
  if (normalised === 'padel') return { sportType: 'padel', sportSubtype: 'outdoor' };
  if (normalised === 'hike') return { sportType: 'hiking', sportSubtype: 'trail' };
  if (normalised === 'weighttraining' || normalised === 'workout') {
    return { sportType: 'strength', sportSubtype: 'indoor' };
  }
  return { sportType: 'other', sportSubtype: null };
}

function readStravaSportType(parsed: JsonRecord): string | null {
  return readString(parsed.sport_type) ?? readString(parsed.sportType) ?? readString(parsed.type);
}

function readStreamData(parsed: JsonRecord, streamName: string): unknown[] {
  const rawStreams = parsed.streams;
  if (!rawStreams) return [];
  if (Array.isArray(rawStreams)) {
    const stream = rawStreams.find(value => isRecord(value) && readString(value.type) === streamName);
    return isRecord(stream) && Array.isArray(stream.data) ? stream.data : [];
  }
  if (!isRecord(rawStreams)) return [];
  const stream = rawStreams[streamName];
  if (Array.isArray(stream)) return stream;
  if (isRecord(stream) && Array.isArray(stream.data)) return stream.data;
  return [];
}

function readOffsetAt(times: unknown[], index: number): number | null {
  return readNumber(times[index]);
}

function buildStravaStreams(parsed: JsonRecord, startedAt: string | null): CanonicalActivityStreams {
  const streams = cloneEmptyStreams();
  const times = readStreamData(parsed, 'time');
  const latLng = readStreamData(parsed, 'latlng');
  const distances = readStreamData(parsed, 'distance');
  const altitude = readStreamData(parsed, 'altitude');
  const speed = readStreamData(parsed, 'velocity_smooth');
  const heartRate = readStreamData(parsed, 'heartrate');
  const cadence = readStreamData(parsed, 'cadence');
  const power = readStreamData(parsed, 'watts');
  const temperature = readStreamData(parsed, 'temp');
  const sampleCount = Math.max(
    times.length,
    latLng.length,
    distances.length,
    altitude.length,
    speed.length,
    heartRate.length,
    cadence.length,
    power.length,
    temperature.length,
  );
  for (let index = 0; index < sampleCount; index += 1) {
    const offsetSeconds = readOffsetAt(times, index);
    pushPositionSample(streams.position, startedAt, offsetSeconds, latLng[index]);
    pushMetricSample(streams.distance, startedAt, offsetSeconds, readNumber(distances[index]));
    pushMetricSample(streams.altitude, startedAt, offsetSeconds, readNumber(altitude[index]));
    pushMetricSample(streams.speed, startedAt, offsetSeconds, readNumber(speed[index]));
    pushMetricSample(streams.heartRate, startedAt, offsetSeconds, readNumber(heartRate[index]));
    pushMetricSample(streams.cadence, startedAt, offsetSeconds, readNumber(cadence[index]));
    pushMetricSample(streams.power, startedAt, offsetSeconds, readNumber(power[index]));
    pushMetricSample(streams.temperature, startedAt, offsetSeconds, readNumber(temperature[index]));
  }
  return streams;
}

function readStreamVendorData(parsed: JsonRecord, streamName: string): unknown[] | null {
  const values = readStreamData(parsed, streamName);
  return values.length > 0 ? values : null;
}

function calculatePaceSecondsPerKm(durationSeconds: number | null, distanceM: number | null): number | null {
  if (durationSeconds == null || distanceM == null || durationSeconds <= 0 || distanceM <= 0) return null;
  return durationSeconds / (distanceM / 1000);
}

function calculatePaceFromSpeed(
  avgSpeedMps: number | null,
  durationSeconds: number | null,
  distanceM: number | null,
): number | null {
  if (avgSpeedMps != null && avgSpeedMps > 0) return 1000 / avgSpeedMps;
  return calculatePaceSecondsPerKm(durationSeconds, distanceM);
}

function resolveLapOffset(
  rawOffset: unknown,
  times: unknown[],
  fallbackTimestamp: string | null,
  startedAt: string | null,
): number | null {
  const streamIndex = readNumber(rawOffset);
  if (streamIndex != null && Number.isInteger(streamIndex) && streamIndex >= 0) {
    const offsetFromStream = readNumber(times[streamIndex]);
    if (offsetFromStream != null) return offsetFromStream;
  }
  if (!startedAt || !fallbackTimestamp) return null;
  const startedMs = new Date(startedAt).getTime();
  const timestampMs = new Date(fallbackTimestamp).getTime();
  if (!Number.isFinite(startedMs) || !Number.isFinite(timestampMs)) return null;
  return Math.max(0, Math.round((timestampMs - startedMs) / 1000));
}

function mapStravaLaps(parsed: JsonRecord, startedAt: string | null): CanonicalActivityLap[] {
  const rawLaps = Array.isArray(parsed.laps) ? parsed.laps : Array.isArray(parsed.Laps) ? parsed.Laps : [];
  if (rawLaps.length === 0 && Array.isArray(parsed.splits_metric)) {
    return mapStravaSplits(parsed.splits_metric);
  }
  const times = readStreamData(parsed, 'time');
  return rawLaps
    .filter(isRecord)
    .map((lap, index) => {
      const distanceM = readNumber(lap.distance);
      const durationSeconds = readNumber(lap.moving_time) ?? readNumber(lap.elapsed_time);
      const startTimestamp = normaliseTimestamp(lap.start_date);
      const startOffsetSeconds = resolveLapOffset(lap.start_index, times, startTimestamp, startedAt);
      const endOffsetSeconds = resolveLapOffset(lap.end_index, times, null, startedAt);
      return {
        lapIndex: Math.round(readNumber(lap.lap_index) ?? index + 1),
        lapType: 'unknown' as const,
        distanceM,
        durationSeconds,
        avgPaceSecondsPerKm: calculatePaceFromSpeed(readNumber(lap.average_speed), durationSeconds, distanceM),
        avgHeartRate: readNumber(lap.average_heartrate),
        maxHeartRate: readNumber(lap.max_heartrate),
        startOffsetSeconds,
        endOffsetSeconds,
      };
    })
    .filter(
      lap => (lap.distanceM != null && lap.distanceM > 0) || (lap.durationSeconds != null && lap.durationSeconds > 0),
    );
}

function mapStravaSplits(rawSplits: unknown[]): CanonicalActivityLap[] {
  return rawSplits
    .filter(isRecord)
    .map((split, index) => {
      const distanceM = readNumber(split.distance);
      const durationSeconds = readNumber(split.moving_time) ?? readNumber(split.elapsed_time);
      return {
        lapIndex: Math.round(readNumber(split.split) ?? index + 1),
        lapType: 'distance' as const,
        distanceM,
        durationSeconds,
        avgPaceSecondsPerKm: calculatePaceFromSpeed(readNumber(split.average_speed), durationSeconds, distanceM),
        avgHeartRate: null,
        maxHeartRate: null,
        startOffsetSeconds: null,
        endOffsetSeconds: null,
      };
    })
    .filter(
      split =>
        (split.distanceM != null && split.distanceM > 0) ||
        (split.durationSeconds != null && split.durationSeconds > 0),
    );
}

function readStravaZones(parsed: JsonRecord): JsonRecord[] {
  const zones = Array.isArray(parsed.zones)
    ? parsed.zones
    : Array.isArray(parsed.activity_zones)
      ? parsed.activity_zones
      : [];
  return zones.filter(isRecord);
}

function readDistributionBuckets(zone: JsonRecord): JsonRecord[] {
  const buckets = Array.isArray(zone.distribution_buckets)
    ? zone.distribution_buckets
    : Array.isArray(zone.distributionBuckets)
      ? zone.distributionBuckets
      : [];
  return buckets.filter(isRecord);
}

function buildHeartRateZonesFromStrava(parsed: JsonRecord): CanonicalActivityHeartRateZone[] {
  const heartRateZone = readStravaZones(parsed).find(zone => {
    const zoneType = readString(zone.type)?.toLowerCase();
    return zoneType === 'heartrate' || zoneType === 'heart_rate';
  });
  if (!heartRateZone) return [];
  const durations = readDistributionBuckets(heartRateZone)
    .slice(0, 5)
    .map(bucket => Math.max(0, readNumber(bucket.time) ?? readNumber(bucket.duration) ?? 0));
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
    buckets[getHeartRateZoneIndex(samples[0].value, maxHeartRate)] = durationSeconds ?? 1;
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

function readMapPolyline(parsed: JsonRecord): string | null {
  const map = isRecord(parsed.map) ? parsed.map : null;
  if (!map) return null;
  return readString(map.summary_polyline) ?? readString(map.polyline);
}

function addVendorField(target: Record<string, unknown>, key: string, value: unknown): void {
  if (value == null) return;
  target[key] = value;
}

function buildVendorFields(parsed: JsonRecord, sportType: string | null): Record<string, unknown> {
  const vendorFields: Record<string, unknown> = {
    sourceProvider: 'strava',
    stravaSportType: sportType,
  };
  addVendorField(vendorFields, 'stravaType', readString(parsed.type));
  addVendorField(vendorFields, 'stravaStartDateLocal', readString(parsed.start_date_local));
  addVendorField(vendorFields, 'stravaTimezone', readString(parsed.timezone));
  addVendorField(vendorFields, 'stravaExternalId', readIdentifier(parsed.external_id));
  addVendorField(vendorFields, 'stravaUploadId', readIdentifier(parsed.upload_id));
  addVendorField(vendorFields, 'stravaUploadIdStr', readIdentifier(parsed.upload_id_str));
  addVendorField(vendorFields, 'stravaWeightedAverageWatts', readNumber(parsed.weighted_average_watts));
  addVendorField(vendorFields, 'stravaKilojoules', readNumber(parsed.kilojoules));
  addVendorField(vendorFields, 'stravaDeviceWatts', readBoolean(parsed.device_watts));
  addVendorField(vendorFields, 'stravaGearId', readIdentifier(parsed.gear_id));
  addVendorField(vendorFields, 'stravaTrainer', readBoolean(parsed.trainer));
  addVendorField(vendorFields, 'stravaCommute', readBoolean(parsed.commute));
  addVendorField(vendorFields, 'stravaManual', readBoolean(parsed.manual));
  addVendorField(vendorFields, 'stravaPrivate', readBoolean(parsed.private));
  addVendorField(vendorFields, 'stravaFlagged', readBoolean(parsed.flagged));
  addVendorField(vendorFields, 'stravaSufferScore', readNumber(parsed.suffer_score));
  addVendorField(vendorFields, 'stravaPolyline', readMapPolyline(parsed));
  addVendorField(vendorFields, 'stravaMoving', readStreamVendorData(parsed, 'moving'));
  addVendorField(vendorFields, 'stravaGradeSmooth', readStreamVendorData(parsed, 'grade_smooth'));
  return vendorFields;
}

function buildCanonicalActivity(params: {
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
  const heartRates = params.streams.heartRate.map(sample => sample.value).filter(value => value > 0);
  const avgFromStream =
    heartRates.length > 0 ? heartRates.reduce((sum, value) => sum + value, 0) / heartRates.length : null;
  const summary: CanonicalActivity['summary'] = {
    startedAt: params.summary.startedAt ?? null,
    endedAt:
      params.summary.endedAt ??
      deriveEndTime(
        params.summary.startedAt ?? null,
        params.summary.elapsedSeconds ?? params.summary.durationSeconds ?? null,
      ),
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
    provider: 'strava',
    sourceFileType: 'json',
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

export function parseStravaActivityJsonToCanonical(
  rawJson: string,
  filename: string,
  options?: ParseStravaActivityOptions,
): CanonicalActivity {
  const parsed = JSON.parse(rawJson) as unknown;
  if (!isRecord(parsed)) throw new Error('Invalid Strava JSON file.');
  const sportType = readStravaSportType(parsed);
  const trainer = readBoolean(parsed.trainer);
  const sport = mapStravaSport(sportType, trainer);
  const startedAt = normaliseTimestamp(parsed.start_date);
  const durationSeconds = readNumber(parsed.moving_time) ?? readNumber(parsed.elapsed_time);
  const elapsedSeconds = readNumber(parsed.elapsed_time) ?? durationSeconds;
  const streams = buildStravaStreams(parsed, startedAt);
  const vendorFields = buildVendorFields(parsed, sportType);
  addVendorField(vendorFields, 'stravaFilename', filename);
  return buildCanonicalActivity({
    sportType: sport.sportType,
    sportSubtype: sport.sportSubtype,
    providerActivityId: readIdentifier(parsed.id),
    summary: {
      startedAt,
      durationSeconds,
      elapsedSeconds,
      distanceM: readNumber(parsed.distance),
      caloriesKcal: readNumber(parsed.calories),
      avgHeartRate: readNumber(parsed.average_heartrate),
      maxHeartRate: readNumber(parsed.max_heartrate),
      avgSpeedMps: readNumber(parsed.average_speed),
      maxSpeedMps: readNumber(parsed.max_speed),
      avgCadence: readNumber(parsed.average_cadence),
      avgPowerW: readNumber(parsed.average_watts),
      maxPowerW: readNumber(parsed.max_watts),
      elevationGainM: readNumber(parsed.total_elevation_gain),
      avgTemperatureC: readNumber(parsed.average_temp),
    },
    streams,
    laps: mapStravaLaps(parsed, startedAt),
    heartRateZones: buildHeartRateZonesFromStrava(parsed),
    device: {
      name: readString(parsed.device_name) ?? 'Strava',
      model: readString(parsed.device_name),
      serial: null,
    },
    vendorFields,
    estimatedMaxHeartRate: options?.estimatedMaxHeartRate,
  });
}
