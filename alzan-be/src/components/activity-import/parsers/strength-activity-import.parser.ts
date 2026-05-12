import { Database } from '../../../types/database.types';

export type StrengthActivityProvider =
  | 'suunto'
  | 'strava'
  | 'garmin'
  | 'polar'
  | 'fitbit'
  | 'apple_health'
  | 'coros'
  | 'whoop'
  | 'oura'
  | 'ultrahuman'
  | 'unknown';
export type StrengthActivitySourceFileType = 'fit' | 'json';

export interface ImportedStrengthActivityDevice {
  name: string | null;
  model: string | null;
  serial: string | null;
}

export interface ImportedStrengthActivityHeartRateZone {
  zone: 1 | 2 | 3 | 4 | 5;
  durationSeconds: number;
  percentage: number;
}

export interface ImportedStrengthActivityHeartRateSample {
  offsetSeconds: number | null;
  timestamp: string | null;
  bpm: number;
}

export interface ImportedStrengthActivitySummary {
  provider: StrengthActivityProvider;
  sourceFileType: StrengthActivitySourceFileType;
  startedAt: string | null;
  endedAt: string | null;
  durationSeconds: number | null;
  caloriesKcal: number | null;
  avgHeartRate: number | null;
  maxHeartRate: number | null;
  minHeartRate: number | null;
  totalSteps: number | null;
  recoveryTimeSeconds: number | null;
  epoc: number | null;
  pte: number | null;
  tss: number | null;
  trainingLoadPeak: number | null;
  device: ImportedStrengthActivityDevice | null;
  heartRateZones: ImportedStrengthActivityHeartRateZone[];
  heartRateStream: ImportedStrengthActivityHeartRateSample[];
}

interface ParseStrengthActivityOptions {
  estimatedMaxHeartRate?: number | null;
}

export type DatabaseProvider = Database['public']['Enums']['provider_enum'];

type JsonRecord = Record<string, unknown>;

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
  startedAt: string | null;
  durationSeconds: number | null;
  caloriesKcal: number | null;
  avgHeartRate: number | null;
  maxHeartRate: number | null;
  totalSteps: number | null;
  sport: number | null;
  subSport: number | null;
  manufacturer: number | null;
  device: ImportedStrengthActivityDevice | null;
  heartRateZones: ImportedStrengthActivityHeartRateZone[];
  heartRateStream: ImportedStrengthActivityHeartRateSample[];
}

const FIT_LOCAL_MESSAGE_TYPES = 16;
const FIT_FILE_ID_MESSAGE_NUMBER = 0;
const FIT_SESSION_MESSAGE_NUMBER = 18;
const FIT_RECORD_MESSAGE_NUMBER = 20;
const FIT_EPOCH_OFFSET_SECONDS = 631065600;
const GARMIN_MANUFACTURER_ID = 1;
const HEART_RATE_STREAM_LIMIT = 5000;

const KNOWN_STRENGTH_ACTIVITY_TYPES = new Set([23]);
const CLEAR_ENDURANCE_JSON_TYPES = new Set([
  'run',
  'running',
  'ride',
  'cycling',
  'swim',
  'swimming',
  'walk',
  'walking',
]);
const CLEAR_ENDURANCE_FIT_SPORTS = new Set([1, 2, 5, 17]);
const STRENGTH_FIT_SPORTS = new Set([4, 37]);
const STRENGTH_FIT_SUB_SPORTS = new Set([20]);

export const STRENGTH_ACTIVITY_PARSE_ERROR_TAG = 'STRENGTH_ACTIVITY_PARSE_ERROR';
export const STRENGTH_ACTIVITY_UNSUPPORTED_ERROR_TAG = 'STRENGTH_ACTIVITY_UNSUPPORTED_ERROR';

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function readNumber(value: unknown): number | null {
  if (isFiniteNumber(value)) return value;

  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value.trim());
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function roundNullable(value: number | null): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  return Math.round(value);
}

function normaliseHeartRate(value: number): number {
  if (value > 0 && value < 4) return value * 60;
  return value;
}

function normaliseCaloriesFromEnergy(value: number): number | null {
  if (!Number.isFinite(value) || value <= 0) return null;
  return value > 20000 ? value / 4184 : value;
}

function normaliseTimestamp(raw: unknown): string | null {
  const text = readString(raw);
  if (!text) return null;

  const timestamp = Date.parse(text);
  if (!Number.isFinite(timestamp)) return null;
  return new Date(timestamp).toISOString();
}

function deriveEndTime(
  startedAt: string | null,
  durationSeconds: number | null,
  explicitEnd?: string | null,
): string | null {
  if (explicitEnd) return explicitEnd;
  if (!startedAt || durationSeconds == null || durationSeconds <= 0) return null;
  return new Date(new Date(startedAt).getTime() + durationSeconds * 1000).toISOString();
}

function deriveDurationSeconds(startedAt: string | null, endedAt: string | null): number | null {
  if (!startedAt || !endedAt) return null;
  const startedMs = new Date(startedAt).getTime();
  const endedMs = new Date(endedAt).getTime();
  if (!Number.isFinite(startedMs) || !Number.isFinite(endedMs) || endedMs <= startedMs) return null;
  return Math.round((endedMs - startedMs) / 1000);
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

function readNestedMetric(record: JsonRecord, key: string, metricKey: string): number | null {
  const section = record[key];
  if (!Array.isArray(section) || section.length === 0) return null;
  const firstMetric = section[0];
  if (!isRecord(firstMetric)) return null;
  return readNumber(firstMetric[metricKey]);
}

function readNestedObjectMetric(record: JsonRecord, key: string, metricKey: string): number | null {
  const section = record[key];
  if (!isRecord(section)) return null;
  return readNumber(section[metricKey]);
}

function providerToDatabaseProvider(provider: StrengthActivityProvider): DatabaseProvider {
  if (provider === 'unknown' || provider === 'oura' || provider === 'ultrahuman') return 'other';
  return provider;
}

export function getDatabaseProviderForStrengthImport(provider: StrengthActivityProvider): DatabaseProvider {
  return providerToDatabaseProvider(provider);
}

function detectProviderFromFilename(filename: string): StrengthActivityProvider {
  const lower = filename.toLowerCase();
  if (lower.includes('suunto')) return 'suunto';
  if (lower.includes('strava')) return 'strava';
  if (lower.includes('garmin')) return 'garmin';
  if (lower.includes('polar')) return 'polar';
  if (lower.includes('fitbit')) return 'fitbit';
  if (lower.includes('apple_health') || lower.includes('apple-health')) return 'apple_health';
  if (lower.includes('coros')) return 'coros';
  if (lower.includes('whoop')) return 'whoop';
  if (lower.includes('oura')) return 'oura';
  if (lower.includes('ultrahuman')) return 'ultrahuman';
  return 'unknown';
}

function detectJsonProvider(parsed: unknown, filename: string): StrengthActivityProvider {
  const fileProvider = detectProviderFromFilename(filename);
  if (fileProvider !== 'unknown') return fileProvider;

  if (!isRecord(parsed)) return 'unknown';
  if (isRecord(parsed.DeviceLog)) return 'suunto';
  if ('polar_user' in parsed || 'start_time_utc_offset' in parsed || 'detailed_sport_info' in parsed) return 'polar';
  if ('logId' in parsed || 'activityTypeId' in parsed || 'tcxLink' in parsed || 'activeZoneMinutes' in parsed)
    return 'fitbit';
  if ('workoutActivityType' in parsed || 'sourceRevision' in parsed) return 'apple_health';
  if (isRecord(parsed.data) && (Array.isArray(parsed.data.workouts) || Array.isArray(parsed.data.records)))
    return 'apple_health';
  if (
    'training_load' in parsed ||
    'aerobic_te' in parsed ||
    'anaerobic_te' in parsed ||
    (('activityType' in parsed || 'activity_type' in parsed) && ('samples' in parsed || 'laps' in parsed))
  )
    return 'coros';
  if ('sport_name' in parsed && ('score_state' in parsed || 'score' in parsed || 'start' in parsed)) return 'whoop';
  if (isRecord(parsed.score) && ('strain' in parsed.score || 'zone_durations' in parsed.score)) return 'whoop';
  if ('activity' in parsed && ('start_datetime' in parsed || 'end_datetime' in parsed || 'intensity' in parsed))
    return 'oura';
  if ('movement_index' in parsed || 'recovery_index' in parsed || 'metabolic_score' in parsed) return 'ultrahuman';
  if ('movement' in parsed && ('heart_rate' in parsed || 'recovery' in parsed || 'vo2_max' in parsed))
    return 'ultrahuman';
  if (isRecord(parsed.data) && Array.isArray(parsed.data.metric_data)) return 'ultrahuman';

  const sourceText = [
    readString(parsed.provider),
    readString(parsed.source),
    readString(parsed.uploaded_from),
    readString(parsed.brand),
    readString(parsed.platform),
  ]
    .filter((value): value is string => value != null)
    .join(' ')
    .toLowerCase();

  if (sourceText.includes('strava')) return 'strava';
  if (sourceText.includes('garmin')) return 'garmin';
  if (sourceText.includes('polar')) return 'polar';
  if (sourceText.includes('fitbit')) return 'fitbit';
  if (sourceText.includes('apple') || sourceText.includes('healthkit')) return 'apple_health';
  if (sourceText.includes('coros')) return 'coros';
  if (sourceText.includes('whoop')) return 'whoop';
  if (sourceText.includes('oura')) return 'oura';
  if (sourceText.includes('ultrahuman')) return 'ultrahuman';
  if (sourceText.includes('suunto')) return 'suunto';

  return 'unknown';
}

function isClearlyUnsupportedJsonActivity(parsed: unknown, distanceM: number | null): boolean {
  if (!isRecord(parsed)) return false;

  const deviceLog = isRecord(parsed.DeviceLog) ? parsed.DeviceLog : null;
  const header = deviceLog && isRecord(deviceLog.Header) ? deviceLog.Header : parsed;
  const rawActivityType =
    readNumber(header.ActivityType) ??
    readNumber(header.activityType) ??
    readNumber(header.activity_type_id) ??
    readNumber(parsed.ActivityType);

  if (rawActivityType != null && KNOWN_STRENGTH_ACTIVITY_TYPES.has(Math.round(rawActivityType))) {
    return false;
  }

  const sportText = [
    readString(header.sport_type),
    readString(header.sportType),
    readString(header.Sport),
    readString(header.ActivityName),
    readString(header.activityName),
    readString(header.type),
    readString(header.sport),
    readString(header.sport_name),
    readString(header.workoutActivityType),
    readString(header.activityType),
    readString(header.activity_type),
    readString(header.activity),
    readString(header.detailed_sport_info),
    readString(parsed.sport_type),
    readString(parsed.sportType),
    readString(parsed.sport),
    readString(parsed.sport_name),
    readString(parsed.workoutActivityType),
    readString(parsed.activityType),
    readString(parsed.activity_type),
    readString(parsed.activity),
    readString(parsed.detailed_sport_info),
  ]
    .filter((value): value is string => value != null)
    .join(' ')
    .toLowerCase();

  if (sportText.includes('strength') || sportText.includes('weight') || sportText.includes('gym')) return false;

  if (deviceLog && rawActivityType != null && distanceM != null && distanceM > 1000) return true;

  return distanceM != null && distanceM > 1000 && CLEAR_ENDURANCE_JSON_TYPES.has(sportText);
}

function readHeartRateFromJsonSample(sample: JsonRecord): number | null {
  const raw =
    readNumber(sample.HR) ?? readNumber(sample.HeartRate) ?? readNumber(sample.heartRate) ?? readNumber(sample.hr);
  if (raw == null || raw <= 0) return null;
  return normaliseHeartRate(raw);
}

function parseHeartRateStream(samples: unknown, startedAt: string | null): ImportedStrengthActivityHeartRateSample[] {
  if (!Array.isArray(samples)) return [];
  const startedMs = startedAt ? new Date(startedAt).getTime() : null;
  const stream: ImportedStrengthActivityHeartRateSample[] = [];

  for (const sample of samples) {
    if (!isRecord(sample)) continue;
    const bpm = readHeartRateFromJsonSample(sample);
    if (bpm == null || bpm <= 0) continue;

    const timestamp = normaliseTimestamp(sample.TimeISO8601 ?? sample.UTC ?? sample.time ?? sample.timestamp);
    const timestampMs = timestamp ? new Date(timestamp).getTime() : null;

    stream.push({
      bpm: Math.round(bpm),
      timestamp,
      offsetSeconds:
        startedMs != null && timestampMs != null && Number.isFinite(timestampMs)
          ? Math.max(0, Math.round((timestampMs - startedMs) / 1000))
          : null,
    });

    if (stream.length >= HEART_RATE_STREAM_LIMIT) break;
  }

  return stream;
}

function parsePolarHeartRateStream(
  parsed: JsonRecord,
  startedAt: string | null,
): ImportedStrengthActivityHeartRateSample[] {
  if (!Array.isArray(parsed.samples)) return [];
  const heartRateSample = parsed.samples
    .filter(isRecord)
    .find(sample => readString(sample['sample-type']) === '0' || readString(sample.sampleType) === '0');
  if (!heartRateSample) return [];
  const data = readString(heartRateSample.data);
  if (!data) return [];
  const recordingRate = readNumber(heartRateSample['recording-rate']) ?? readNumber(heartRateSample.recordingRate) ?? 1;
  return data
    .split(',')
    .map(value => readNumber(value))
    .filter((value): value is number => value != null && value > 0)
    .slice(0, HEART_RATE_STREAM_LIMIT)
    .map((value, index) => {
      const offsetSeconds = index * recordingRate;
      return {
        bpm: Math.round(normaliseHeartRate(value)),
        timestamp: startedAt ? new Date(new Date(startedAt).getTime() + offsetSeconds * 1000).toISOString() : null,
        offsetSeconds,
      };
    });
}

function buildHeartRateZonesFromHeader(
  header: JsonRecord | null,
  durationSeconds: number | null,
): ImportedStrengthActivityHeartRateZone[] {
  if (!header) return [];

  const zones = isRecord(header.HrZones) ? header.HrZones : isRecord(header.hrZones) ? header.hrZones : null;
  if (!zones) return [];

  const zoneDurations = ([1, 2, 3, 4, 5] as const).map(zone => {
    const value =
      readNumber(zones[`Zone${zone}Duration`]) ??
      readNumber(zones[`zone${zone}Duration`]) ??
      readNumber(zones[`zone${zone}_duration`]) ??
      0;
    return { zone, durationSeconds: Math.max(0, value) };
  });

  const totalFromZones = zoneDurations.reduce((sum, zone) => sum + zone.durationSeconds, 0);
  const totalDuration = totalFromZones > 0 ? totalFromZones : (durationSeconds ?? 0);
  if (totalDuration <= 0) return [];

  return zoneDurations
    .map(zone => ({
      zone: zone.zone,
      durationSeconds: Math.round(zone.durationSeconds),
      percentage: (zone.durationSeconds / totalDuration) * 100,
    }))
    .filter(zone => zone.durationSeconds > 0);
}

function buildPolarHeartRateZones(parsed: JsonRecord): ImportedStrengthActivityHeartRateZone[] {
  const zones = Array.isArray(parsed.heart_rate_zones) ? parsed.heart_rate_zones.filter(isRecord) : [];
  const durations = zones.slice(0, 5).map(zone => Math.max(0, parseIsoDurationSeconds(zone['in-zone']) ?? 0));
  const totalDuration = durations.reduce((sum, value) => sum + value, 0);
  if (totalDuration <= 0) return [];
  return durations
    .map((duration, index) => ({
      zone: (index + 1) as 1 | 2 | 3 | 4 | 5,
      durationSeconds: Math.round(duration),
      percentage: (duration / totalDuration) * 100,
    }))
    .filter(zone => zone.durationSeconds > 0);
}

function parseFitbitHeartRateStream(
  parsed: JsonRecord,
  startedAt: string | null,
): ImportedStrengthActivityHeartRateSample[] {
  const streams = isRecord(parsed.streams) ? parsed.streams : null;
  const rawStream = streams?.heartrate ?? streams?.heartRate;
  const samples = Array.isArray(rawStream)
    ? rawStream
    : isRecord(rawStream) && Array.isArray(rawStream.data)
      ? rawStream.data
      : [];
  const startedDate = startedAt?.slice(0, 10) ?? null;
  const stream: ImportedStrengthActivityHeartRateSample[] = [];
  samples.slice(0, HEART_RATE_STREAM_LIMIT).forEach((sample, index) => {
    const record = isRecord(sample) ? sample : null;
    const bpm = record ? (readNumber(record.value) ?? readNumber(record.bpm)) : readNumber(sample);
    if (bpm == null || bpm <= 0) return;
    const timestamp =
      record && startedDate && readString(record.time)
        ? normaliseTimestamp(`${startedDate}T${readString(record.time)}Z`)
        : record
          ? normaliseTimestamp(record.timestamp ?? record.dateTime)
          : null;
    const timestampMs = timestamp ? new Date(timestamp).getTime() : null;
    const startedMs = startedAt ? new Date(startedAt).getTime() : null;
    const offsetSeconds =
      startedMs != null && timestampMs != null && Number.isFinite(timestampMs)
        ? Math.max(0, Math.round((timestampMs - startedMs) / 1000))
        : index * 60;
    stream.push({
      bpm: Math.round(normaliseHeartRate(bpm)),
      timestamp:
        timestamp ?? (startedAt ? new Date(new Date(startedAt).getTime() + offsetSeconds * 1000).toISOString() : null),
      offsetSeconds,
    });
  });
  return stream;
}

function parseOuraHeartRateStream(
  parsed: JsonRecord,
  startedAt: string | null,
): ImportedStrengthActivityHeartRateSample[] {
  const rawStream = parsed.heart_rate ?? parsed.heartRate ?? parsed.heartrate;
  const samples = Array.isArray(rawStream) ? rawStream : isRecord(rawStream) ? [rawStream] : [];
  const stream: ImportedStrengthActivityHeartRateSample[] = [];
  samples.slice(0, HEART_RATE_STREAM_LIMIT).forEach((sample, index) => {
    if (!isRecord(sample)) return;
    const source = readString(sample.source)?.toLowerCase();
    if (source && source !== 'workout') return;
    const timestamp = normaliseTimestamp(sample.timestamp ?? sample.time ?? sample.dateTime);
    const timestampMs = timestamp ? new Date(timestamp).getTime() : null;
    const startedMs = startedAt ? new Date(startedAt).getTime() : null;
    const offsetSeconds =
      startedMs != null && timestampMs != null && Number.isFinite(timestampMs)
        ? Math.max(0, Math.round((timestampMs - startedMs) / 1000))
        : index * 60;
    const bpm = readNumber(sample.bpm) ?? readNumber(sample.value);
    if (bpm == null || bpm <= 0) return;
    stream.push({
      bpm: Math.round(normaliseHeartRate(bpm)),
      timestamp:
        timestamp ?? (startedAt ? new Date(new Date(startedAt).getTime() + offsetSeconds * 1000).toISOString() : null),
      offsetSeconds,
    });
  });
  return stream;
}

function parseUltrahumanHeartRateStream(
  parsed: JsonRecord,
  startedAt: string | null,
): ImportedStrengthActivityHeartRateSample[] {
  const rawStream = parsed.heart_rate ?? parsed.heartRate ?? parsed.heartrate;
  const samples = Array.isArray(rawStream)
    ? rawStream
    : isRecord(rawStream) && Array.isArray(rawStream.samples)
      ? rawStream.samples
      : isRecord(rawStream) && Array.isArray(rawStream.values)
        ? rawStream.values
        : [];
  const stream: ImportedStrengthActivityHeartRateSample[] = [];
  samples.slice(0, HEART_RATE_STREAM_LIMIT).forEach((sample, index) => {
    const record = isRecord(sample) ? sample : null;
    const bpm = record ? (readNumber(record.value) ?? readNumber(record.bpm)) : readNumber(sample);
    if (bpm == null || bpm <= 0) return;
    const timestamp = record ? normaliseTimestamp(record.timestamp ?? record.time ?? record.dateTime) : null;
    const timestampMs = timestamp ? new Date(timestamp).getTime() : null;
    const startedMs = startedAt ? new Date(startedAt).getTime() : null;
    const offsetSeconds =
      startedMs != null && timestampMs != null && Number.isFinite(timestampMs)
        ? Math.max(0, Math.round((timestampMs - startedMs) / 1000))
        : index * 60;
    stream.push({
      bpm: Math.round(normaliseHeartRate(bpm)),
      timestamp:
        timestamp ?? (startedAt ? new Date(new Date(startedAt).getTime() + offsetSeconds * 1000).toISOString() : null),
      offsetSeconds,
    });
  });
  return stream;
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

function buildFitbitHeartRateZones(parsed: JsonRecord): ImportedStrengthActivityHeartRateZone[] {
  const zones = Array.isArray(parsed.heartRateZones) ? parsed.heartRateZones.filter(isRecord) : [];
  const mapped: ImportedStrengthActivityHeartRateZone[] = [];
  for (const zone of zones) {
    const canonicalZone = mapFitbitZoneName(zone.name ?? zone.zoneName ?? zone.type);
    const minutes = readNumber(zone.minutes);
    if (!canonicalZone || minutes == null || minutes <= 0) continue;
    mapped.push({ zone: canonicalZone, durationSeconds: Math.round(minutes * 60), percentage: 0 });
  }
  const totalDuration = mapped.reduce((sum, zone) => sum + zone.durationSeconds, 0);
  return totalDuration > 0
    ? mapped.map(zone => ({ ...zone, percentage: (zone.durationSeconds / totalDuration) * 100 }))
    : [];
}

function buildWhoopHeartRateZones(parsed: JsonRecord): ImportedStrengthActivityHeartRateZone[] {
  const score = isRecord(parsed.score) ? parsed.score : parsed;
  const zoneDurations = isRecord(score.zone_durations) ? score.zone_durations : {};
  const allZones: ImportedStrengthActivityHeartRateZone[] = [
    {
      zone: 1,
      durationSeconds: Math.round(
        ((readNumber(zoneDurations.zone_zero_milli) ?? 0) + (readNumber(zoneDurations.zone_one_milli) ?? 0)) / 1000,
      ),
      percentage: 0,
    },
    { zone: 2, durationSeconds: Math.round((readNumber(zoneDurations.zone_two_milli) ?? 0) / 1000), percentage: 0 },
    { zone: 3, durationSeconds: Math.round((readNumber(zoneDurations.zone_three_milli) ?? 0) / 1000), percentage: 0 },
    { zone: 4, durationSeconds: Math.round((readNumber(zoneDurations.zone_four_milli) ?? 0) / 1000), percentage: 0 },
    { zone: 5, durationSeconds: Math.round((readNumber(zoneDurations.zone_five_milli) ?? 0) / 1000), percentage: 0 },
  ];
  const mapped = allZones.filter(zone => zone.durationSeconds > 0);
  const totalDuration = mapped.reduce((sum, zone) => sum + zone.durationSeconds, 0);
  return totalDuration > 0
    ? mapped.map(zone => ({ ...zone, percentage: (zone.durationSeconds / totalDuration) * 100 }))
    : [];
}

function resolveHeartRateZone(normalisedHeartRate: number): 1 | 2 | 3 | 4 | 5 {
  if (normalisedHeartRate >= 0.9) return 5;
  if (normalisedHeartRate >= 0.8) return 4;
  if (normalisedHeartRate >= 0.7) return 3;
  if (normalisedHeartRate >= 0.6) return 2;
  return 1;
}

function resolveEffectiveMaxHeartRate(
  heartRateSamples: number[],
  estimatedMaxHeartRate?: number | null,
): number | null {
  const safeEstimated =
    estimatedMaxHeartRate != null && Number.isFinite(estimatedMaxHeartRate) && estimatedMaxHeartRate > 0
      ? estimatedMaxHeartRate
      : null;

  if (safeEstimated != null) return safeEstimated;
  if (heartRateSamples.length === 0) return null;

  const observedMax = heartRateSamples.reduce(
    (highest, value) => (value > highest ? value : highest),
    heartRateSamples[0],
  );
  return Number.isFinite(observedMax) && observedMax > 0 ? observedMax : null;
}

function buildHeartRateZonesFromStream(
  stream: ImportedStrengthActivityHeartRateSample[],
  estimatedMaxHeartRate?: number | null,
): ImportedStrengthActivityHeartRateZone[] {
  const samples = stream.map(sample => sample.bpm).filter((bpm): bpm is number => Number.isFinite(bpm) && bpm > 0);

  if (samples.length === 0) return [];

  const effectiveMaxHeartRate = resolveEffectiveMaxHeartRate(samples, estimatedMaxHeartRate);
  if (effectiveMaxHeartRate == null) return [];

  const durationsByZone = [0, 0, 0, 0, 0];
  for (const bpm of samples) {
    const zone = resolveHeartRateZone(bpm / effectiveMaxHeartRate);
    durationsByZone[zone - 1] += 1;
  }

  const totalDurationSeconds = samples.length;
  if (totalDurationSeconds <= 0) return [];

  return ([5, 4, 3, 2, 1] as const)
    .map(zone => {
      const zoneSeconds = durationsByZone[zone - 1];
      return {
        zone,
        durationSeconds: Math.round(zoneSeconds),
        percentage: (zoneSeconds / totalDurationSeconds) * 100,
      };
    })
    .filter(zone => zone.durationSeconds > 0);
}

function parseSuuntoJson(parsed: JsonRecord, options?: ParseStrengthActivityOptions): ImportedStrengthActivitySummary {
  const deviceLog = isRecord(parsed.DeviceLog) ? parsed.DeviceLog : parsed;
  const header = isRecord(deviceLog.Header) ? deviceLog.Header : {};
  const windows = Array.isArray(deviceLog.Windows) ? deviceLog.Windows : [];
  const activityWindow = windows
    .map(windowEntry => (isRecord(windowEntry) && isRecord(windowEntry.Window) ? windowEntry.Window : windowEntry))
    .find((window): window is JsonRecord => isRecord(window) && readString(window.Type)?.toLowerCase() === 'activity');

  const startedAt = normaliseTimestamp(header.DateTime ?? header.start_time ?? header.startTime);
  const durationSeconds = readNumber(header.Duration) ?? readNumber(activityWindow?.Duration);
  const caloriesKcal =
    normaliseCaloriesFromEnergy(readNumber(header.Energy) ?? readNumber(activityWindow?.Energy) ?? 0) ??
    readNumber(header.Calories) ??
    readNumber(header.KCal) ??
    null;
  const avgHeartRateRaw =
    readNumber(header.AverageHeartRate) ??
    readNumber(header.AvgHeartRate) ??
    readNestedMetric(activityWindow ?? {}, 'HR', 'Avg');
  const maxHeartRateRaw =
    readNumber(header.MaxHeartRate) ?? readNumber(header.HRMax) ?? readNestedMetric(activityWindow ?? {}, 'HR', 'Max');
  const minHeartRateRaw =
    readNumber(header.MinHeartRate) ?? readNumber(header.HRMin) ?? readNestedMetric(activityWindow ?? {}, 'HR', 'Min');
  const totalSteps = readNumber(header.StepCount) ?? readNumber(header.TotalSteps);
  const recoveryTimeSeconds = readNumber(header.RecoveryTime) ?? readNumber(activityWindow?.RecoveryTime);
  const epoc = readNumber(header.EPOC) ?? readNumber(header.Epoc);
  const pte = readNumber(header.PeakTrainingEffect) ?? readNumber(header.PTE) ?? readNumber(header.PeakEffect);
  const suuntoTrainingLoadPeak =
    readNumber(header.TrainingLoadPeak) ??
    readNumber(header.TraingingLoadPeak) ??
    readNumber(activityWindow?.TrainingLoadPeak) ??
    readNumber(activityWindow?.TraingingLoadPeak);

  // Some Suunto JSON exports provide a normalized training-load peak value instead of explicit TSS.
  // In those exports, the in-app TSS(hr) aligns approximately with loadPeak * 13.6.
  const suuntoDerivedTssFromLoadPeak =
    suuntoTrainingLoadPeak != null && suuntoTrainingLoadPeak > 0 && suuntoTrainingLoadPeak <= 10
      ? suuntoTrainingLoadPeak * 13.6
      : null;

  const tssRaw =
    readNumber(header.TSS) ??
    readNumber(header.TrainingStressScore) ??
    readNumber(header.HrTSS) ??
    readNumber(header.hrTSS) ??
    readNumber(activityWindow?.TSS) ??
    suuntoDerivedTssFromLoadPeak;
  const tss =
    tssRaw != null && suuntoDerivedTssFromLoadPeak != null && tssRaw > 0 && tssRaw <= 10
      ? suuntoDerivedTssFromLoadPeak
      : tssRaw;
  const device = isRecord(deviceLog.Device) ? deviceLog.Device : null;
  const deviceInfo = device && isRecord(device.Info) ? device.Info : null;
  const stream = parseHeartRateStream(deviceLog.Samples, startedAt);
  const distanceM = readNumber(header.Distance) ?? readNumber(activityWindow?.Distance);
  const zonesFromHeader = buildHeartRateZonesFromHeader(header, durationSeconds ?? null);

  if (isClearlyUnsupportedJsonActivity(parsed, distanceM)) {
    throw new Error(STRENGTH_ACTIVITY_UNSUPPORTED_ERROR_TAG);
  }

  return {
    provider: 'suunto',
    sourceFileType: 'json',
    startedAt,
    endedAt: deriveEndTime(startedAt, durationSeconds),
    durationSeconds: roundNullable(durationSeconds),
    caloriesKcal: roundNullable(caloriesKcal),
    avgHeartRate: avgHeartRateRaw != null ? roundNullable(normaliseHeartRate(avgHeartRateRaw)) : null,
    maxHeartRate: maxHeartRateRaw != null ? roundNullable(normaliseHeartRate(maxHeartRateRaw)) : null,
    minHeartRate: minHeartRateRaw != null ? roundNullable(normaliseHeartRate(minHeartRateRaw)) : null,
    totalSteps: roundNullable(totalSteps),
    recoveryTimeSeconds: roundNullable(recoveryTimeSeconds),
    epoc: roundNullable(epoc),
    pte: pte != null && Number.isFinite(pte) ? Number(pte.toFixed(1)) : null,
    tss: roundNullable(tss),
    trainingLoadPeak: suuntoTrainingLoadPeak != null ? Number(suuntoTrainingLoadPeak.toFixed(1)) : null,
    device: device
      ? {
          name: readString(device.Name) ?? readString(device.name),
          model: readString(deviceInfo?.HW) ?? readString(device.model),
          serial: readString(device.SerialNumber) ?? readString(device.serialNumber),
        }
      : {
          name: null,
          model: null,
          serial: null,
        },
    heartRateZones:
      zonesFromHeader.length > 0
        ? zonesFromHeader
        : buildHeartRateZonesFromStream(stream, options?.estimatedMaxHeartRate),
    heartRateStream: stream,
  };
}

function parseGenericJson(
  parsed: unknown,
  filename: string,
  options?: ParseStrengthActivityOptions,
): ImportedStrengthActivitySummary {
  if (!isRecord(parsed)) {
    throw new Error(STRENGTH_ACTIVITY_PARSE_ERROR_TAG);
  }

  const provider = detectJsonProvider(parsed, filename);
  const distanceM =
    readNumber(parsed.distance) ??
    readNumber(parsed.distance_m) ??
    readNumber(parsed.distanceMeters) ??
    readNumber(parsed.distanceM) ??
    readNumber(parsed.totalDistance);

  if (isClearlyUnsupportedJsonActivity(parsed, distanceM)) {
    throw new Error(STRENGTH_ACTIVITY_UNSUPPORTED_ERROR_TAG);
  }

  const startedAt = normaliseTimestamp(
    parsed.start_date ??
      parsed.start_date_local ??
      parsed.start ??
      parsed.startDate ??
      parsed.startTime ??
      parsed.start_datetime ??
      parsed.started_at ??
      parsed.date,
  );
  const rawDuration =
    readNumber(parsed.elapsed_time) ??
    readNumber(parsed.moving_time) ??
    readNumber(parsed.duration) ??
    readNumber(parsed.durationSeconds) ??
    readNumber(parsed.duration_seconds) ??
    parseIsoDurationSeconds(parsed.duration);
  const durationSeconds =
    provider === 'fitbit' && rawDuration != null && rawDuration > 10000 ? rawDuration / 1000 : rawDuration;
  const explicitEndedAt = normaliseTimestamp(
    parsed.end ?? parsed.endDate ?? parsed.endTime ?? parsed.end_datetime ?? parsed.ended_at,
  );
  const derivedDurationSeconds = durationSeconds ?? deriveDurationSeconds(startedAt, explicitEndedAt);
  const score = isRecord(parsed.score) ? parsed.score : {};
  const whoopKilojoule = readNumber(score.kilojoule) ?? readNumber(parsed.kilojoule);
  const caloriesKcal =
    readNumber(parsed.calories) ??
    readNumber(parsed.calories_kcal) ??
    readNumber(parsed.activeEnergyBurned) ??
    readNumber(parsed.totalEnergyBurned) ??
    (provider === 'whoop' && whoopKilojoule != null ? whoopKilojoule / 4.184 : null) ??
    normaliseCaloriesFromEnergy(readNumber(parsed.energy) ?? readNumber(parsed.Energy) ?? 0);
  const avgHeartRate =
    readNumber(score.average_heart_rate) ??
    readNumber(parsed.average_heartrate) ??
    readNumber(parsed.average_heart_rate) ??
    readNumber(parsed.avgHeartRate) ??
    readNumber(parsed.averageHeartRate) ??
    readNestedObjectMetric(parsed, 'heart_rate', 'average');
  const maxHeartRate =
    readNumber(score.max_heart_rate) ??
    readNumber(parsed.max_heartrate) ??
    readNumber(parsed.max_heart_rate) ??
    readNumber(parsed.maxHeartRate) ??
    readNumber(parsed.maximumHeartRate) ??
    readNestedObjectMetric(parsed, 'heart_rate', 'maximum');
  const minHeartRate =
    readNumber(parsed.min_heartrate) ??
    readNumber(parsed.min_heart_rate) ??
    readNumber(parsed.minHeartRate) ??
    readNumber(parsed.minimumHeartRate);
  const totalSteps = readNumber(parsed.steps) ?? readNumber(parsed.totalSteps);
  const recoveryTimeSeconds = readNumber(parsed.recovery_time) ?? readNumber(parsed.recoveryTimeSeconds);
  const epoc = readNumber(parsed.epoc) ?? readNumber(parsed.EPOC);
  const pte = readNumber(parsed.pte) ?? readNumber(parsed.PTE) ?? readNumber(parsed.peak_training_effect);
  const tss = readNumber(parsed.tss) ?? readNumber(parsed.TSS) ?? readNumber(parsed.hrTSS);
  const rawDevice = isRecord(parsed.device)
    ? parsed.device
    : isRecord(parsed.Device)
      ? parsed.Device
      : isRecord(parsed.source)
        ? parsed.source
        : null;
  const ultrahumanHeartRateStream = parseUltrahumanHeartRateStream(parsed, startedAt);
  const polarHeartRateStream = parsePolarHeartRateStream(parsed, startedAt);
  const fitbitHeartRateStream = parseFitbitHeartRateStream(parsed, startedAt);
  const ouraHeartRateStream = parseOuraHeartRateStream(parsed, startedAt);
  const appleHealthHeartRateStream = parseHeartRateStream(parsed.samples, startedAt);
  const heartRateStream =
    appleHealthHeartRateStream.length > 0
      ? appleHealthHeartRateStream
      : ultrahumanHeartRateStream.length > 0
        ? ultrahumanHeartRateStream
        : ouraHeartRateStream.length > 0
          ? ouraHeartRateStream
          : fitbitHeartRateStream.length > 0
            ? fitbitHeartRateStream
            : polarHeartRateStream;
  const heartRateZones =
    provider === 'fitbit'
      ? buildFitbitHeartRateZones(parsed)
      : provider === 'whoop'
        ? buildWhoopHeartRateZones(parsed)
        : buildPolarHeartRateZones(parsed);

  return {
    provider,
    sourceFileType: 'json',
    startedAt,
    endedAt: deriveEndTime(startedAt, derivedDurationSeconds ?? null, explicitEndedAt),
    durationSeconds: roundNullable(derivedDurationSeconds),
    caloriesKcal: roundNullable(caloriesKcal),
    avgHeartRate: avgHeartRate != null ? roundNullable(normaliseHeartRate(avgHeartRate)) : null,
    maxHeartRate: maxHeartRate != null ? roundNullable(normaliseHeartRate(maxHeartRate)) : null,
    minHeartRate: minHeartRate != null ? roundNullable(normaliseHeartRate(minHeartRate)) : null,
    totalSteps: roundNullable(totalSteps),
    recoveryTimeSeconds: roundNullable(recoveryTimeSeconds),
    epoc: roundNullable(epoc),
    pte: pte != null && Number.isFinite(pte) ? Number(pte.toFixed(1)) : null,
    tss: roundNullable(tss),
    trainingLoadPeak: null,
    device: rawDevice
      ? {
          name: readString(rawDevice.name) ?? readString(rawDevice.Name),
          model: readString(rawDevice.model) ?? readString(rawDevice.Model),
          serial: readString(rawDevice.serial) ?? readString(rawDevice.SerialNumber),
        }
      : readString(parsed.device)
        ? {
            name: readString(parsed.device),
            model: readString(parsed.device),
            serial: readString(parsed.device_id),
          }
        : null,
    heartRateZones:
      heartRateZones.length > 0
        ? heartRateZones
        : buildHeartRateZonesFromStream(heartRateStream, options?.estimatedMaxHeartRate),
    heartRateStream,
  };
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
    case 0x0a: {
      const value = dataView.getUint8(offset);
      return value === 0 ? null : value;
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
    case 0x8b: {
      const value = dataView.getUint16(offset, littleEndian);
      return value === 0 ? null : value;
    }
    case 0x85: {
      const value = dataView.getInt32(offset, littleEndian);
      return value === 0x7fffffff ? null : value;
    }
    case 0x86: {
      const value = dataView.getUint32(offset, littleEndian);
      return value === 0xffffffff ? null : value;
    }
    case 0x8c: {
      const value = dataView.getUint32(offset, littleEndian);
      return value === 0 ? null : value;
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

function buildHeartRateZonesFromFitSessionField(values: number[]): ImportedStrengthActivityHeartRateZone[] {
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
    if (offset + 3 > dataEnd) throw new Error(STRENGTH_ACTIVITY_PARSE_ERROR_TAG);
    fields.push({
      fieldNumber: dataView.getUint8(offset),
      size: dataView.getUint8(offset + 1),
      baseType: dataView.getUint8(offset + 2),
    });
    offset += 3;
  }

  const developerFields: FitDeveloperFieldDefinition[] = [];
  if (hasDeveloperData) {
    if (offset + 1 > dataEnd) throw new Error(STRENGTH_ACTIVITY_PARSE_ERROR_TAG);
    const developerFieldCount = dataView.getUint8(offset);
    offset += 1;

    for (let index = 0; index < developerFieldCount; index += 1) {
      if (offset + 3 > dataEnd) throw new Error(STRENGTH_ACTIVITY_PARSE_ERROR_TAG);
      developerFields.push({ size: dataView.getUint8(offset + 1) });
      offset += 3;
    }
  }

  return { nextOffset: offset, definition: { littleEndian, globalMessageNumber, fields, developerFields } };
}

function setLargestNumber(current: number | null, value: number | null): number | null {
  if (value == null || !Number.isFinite(value) || value <= 0) return current;
  return current == null || value > current ? value : current;
}

function fitTimestampToIso(value: number | null): string | null {
  if (value == null || value <= 0) return null;
  return new Date((value + FIT_EPOCH_OFFSET_SECONDS) * 1000).toISOString();
}

function parseFitDataMessage(
  dataView: DataView,
  offset: number,
  dataEnd: number,
  definition: FitMessageDefinition,
  state: FitParseState,
): number {
  let recordTimestamp: string | null = null;
  let recordHeartRate: number | null = null;

  for (const field of definition.fields) {
    if (offset + field.size > dataEnd) throw new Error(STRENGTH_ACTIVITY_PARSE_ERROR_TAG);
    const numericValue = decodeFitFieldAsNumber(dataView, offset, field.size, field.baseType, definition.littleEndian);

    if (definition.globalMessageNumber === FIT_FILE_ID_MESSAGE_NUMBER) {
      if (field.fieldNumber === 1 && numericValue != null) {
        state.manufacturer = Math.round(numericValue);
      }
      if (field.fieldNumber === 3 && numericValue != null) {
        state.device = {
          ...(state.device ?? {
            name: state.manufacturer === GARMIN_MANUFACTURER_ID ? 'Garmin' : null,
            model: null,
            serial: null,
          }),
          serial: String(Math.round(numericValue)),
        };
      }
    }

    if (definition.globalMessageNumber === FIT_SESSION_MESSAGE_NUMBER) {
      if (field.fieldNumber === 2) state.startedAt = fitTimestampToIso(numericValue) ?? state.startedAt;
      if (field.fieldNumber === 5 && numericValue != null) state.sport = Math.round(numericValue);
      if (field.fieldNumber === 6 && numericValue != null) state.subSport = Math.round(numericValue);
      if (field.fieldNumber === 7 && numericValue != null)
        state.durationSeconds = setLargestNumber(state.durationSeconds, numericValue / 1000);
      if (field.fieldNumber === 8 && numericValue != null)
        state.durationSeconds = setLargestNumber(state.durationSeconds, numericValue / 1000);
      if (field.fieldNumber === 10 && numericValue != null)
        state.totalSteps = setLargestNumber(state.totalSteps, Math.round(numericValue));
      if (field.fieldNumber === 11 && numericValue != null)
        state.caloriesKcal = setLargestNumber(state.caloriesKcal, numericValue);
      if (field.fieldNumber === 16 && numericValue != null)
        state.avgHeartRate = setLargestNumber(state.avgHeartRate, numericValue);
      if (field.fieldNumber === 17 && numericValue != null)
        state.maxHeartRate = setLargestNumber(state.maxHeartRate, numericValue);
      if (field.fieldNumber === 65) {
        const zones = buildHeartRateZonesFromFitSessionField(
          decodeFitFieldAsNumbers(dataView, offset, field.size, field.baseType, definition.littleEndian),
        );
        if (zones.length > 0) state.heartRateZones = zones;
      }
      if (field.fieldNumber === 253) state.startedAt = state.startedAt ?? fitTimestampToIso(numericValue);
    }

    if (definition.globalMessageNumber === FIT_RECORD_MESSAGE_NUMBER) {
      if (field.fieldNumber === 3 && numericValue != null && numericValue > 0) recordHeartRate = numericValue;
      if (field.fieldNumber === 253) recordTimestamp = fitTimestampToIso(numericValue);
    }

    offset += field.size;
  }

  for (const developerField of definition.developerFields) {
    if (offset + developerField.size > dataEnd) throw new Error(STRENGTH_ACTIVITY_PARSE_ERROR_TAG);
    offset += developerField.size;
  }

  if (recordHeartRate != null && state.heartRateStream.length < HEART_RATE_STREAM_LIMIT) {
    const startedMs = state.startedAt ? new Date(state.startedAt).getTime() : null;
    const timestampMs = recordTimestamp ? new Date(recordTimestamp).getTime() : null;
    state.heartRateStream.push({
      bpm: Math.round(normaliseHeartRate(recordHeartRate)),
      timestamp: recordTimestamp,
      offsetSeconds:
        startedMs != null && timestampMs != null && Number.isFinite(timestampMs)
          ? Math.max(0, Math.round((timestampMs - startedMs) / 1000))
          : null,
    });
  }

  return offset;
}

function isClearlyUnsupportedFitActivity(state: FitParseState): boolean {
  if (state.subSport != null && STRENGTH_FIT_SUB_SPORTS.has(state.subSport)) return false;
  if (state.sport != null && STRENGTH_FIT_SPORTS.has(state.sport)) return false;
  return state.sport != null && CLEAR_ENDURANCE_FIT_SPORTS.has(state.sport);
}

function detectFitProvider(filename: string): StrengthActivityProvider {
  const fileProvider = detectProviderFromFilename(filename);
  return fileProvider === 'unknown' ? 'unknown' : fileProvider;
}

function detectProviderFromFitManufacturer(manufacturer: number | null, filename: string): StrengthActivityProvider {
  if (manufacturer === GARMIN_MANUFACTURER_ID) return 'garmin';
  return detectFitProvider(filename);
}

function parseFitActivity(
  binary: Uint8Array,
  filename: string,
  options?: ParseStrengthActivityOptions,
): ImportedStrengthActivitySummary {
  if (binary.byteLength < 12) throw new Error(STRENGTH_ACTIVITY_PARSE_ERROR_TAG);
  const dataView = new DataView(binary.buffer, binary.byteOffset, binary.byteLength);
  const headerSize = dataView.getUint8(0);
  if (headerSize < 12 || binary.byteLength < headerSize) throw new Error(STRENGTH_ACTIVITY_PARSE_ERROR_TAG);

  const fitSignature = String.fromCharCode(binary[8], binary[9], binary[10], binary[11]);
  if (fitSignature !== '.FIT') throw new Error(STRENGTH_ACTIVITY_PARSE_ERROR_TAG);

  const dataSize = dataView.getUint32(4, true);
  const dataStart = headerSize;
  const dataEnd = dataStart + dataSize;
  if (dataEnd > binary.byteLength) throw new Error(STRENGTH_ACTIVITY_PARSE_ERROR_TAG);

  const localDefinitions: Array<FitMessageDefinition | null> = Array.from(
    { length: FIT_LOCAL_MESSAGE_TYPES },
    () => null,
  );
  const state: FitParseState = {
    startedAt: null,
    durationSeconds: null,
    caloriesKcal: null,
    avgHeartRate: null,
    maxHeartRate: null,
    totalSteps: null,
    sport: null,
    subSport: null,
    manufacturer: null,
    device: null,
    heartRateZones: [],
    heartRateStream: [],
  };

  let offset = dataStart;
  while (offset < dataEnd) {
    const recordHeader = dataView.getUint8(offset);
    offset += 1;

    if ((recordHeader & 0x80) !== 0) {
      const localMessageType = (recordHeader >> 5) & 0x03;
      const definition = localDefinitions[localMessageType];
      if (!definition) throw new Error(STRENGTH_ACTIVITY_PARSE_ERROR_TAG);
      offset = parseFitDataMessage(dataView, offset, dataEnd, definition, state);
      continue;
    }

    const isDefinitionMessage = (recordHeader & 0x40) !== 0;
    const localMessageType = recordHeader & 0x0f;
    if (localMessageType >= FIT_LOCAL_MESSAGE_TYPES) throw new Error(STRENGTH_ACTIVITY_PARSE_ERROR_TAG);

    if (isDefinitionMessage) {
      const parsedDefinition = parseFitDefinitionMessage(dataView, offset, dataEnd, recordHeader);
      localDefinitions[localMessageType] = parsedDefinition.definition;
      offset = parsedDefinition.nextOffset;
      continue;
    }

    const definition = localDefinitions[localMessageType];
    if (!definition) throw new Error(STRENGTH_ACTIVITY_PARSE_ERROR_TAG);
    offset = parseFitDataMessage(dataView, offset, dataEnd, definition, state);
  }

  if (isClearlyUnsupportedFitActivity(state)) {
    throw new Error(STRENGTH_ACTIVITY_UNSUPPORTED_ERROR_TAG);
  }

  const heartRates = state.heartRateStream.map(sample => sample.bpm);
  const avgFromStream =
    heartRates.length > 0 ? heartRates.reduce((sum, value) => sum + value, 0) / heartRates.length : null;
  const maxFromStream = heartRates.length > 0 ? Math.max(...heartRates) : null;
  const computedZones =
    state.heartRateZones.length > 0
      ? state.heartRateZones
      : buildHeartRateZonesFromStream(state.heartRateStream, options?.estimatedMaxHeartRate);

  return {
    provider: detectProviderFromFitManufacturer(state.manufacturer, filename),
    sourceFileType: 'fit',
    startedAt: state.startedAt,
    endedAt: deriveEndTime(state.startedAt, state.durationSeconds),
    durationSeconds: roundNullable(state.durationSeconds),
    caloriesKcal: roundNullable(state.caloriesKcal),
    avgHeartRate: roundNullable(state.avgHeartRate ?? avgFromStream),
    maxHeartRate: roundNullable(state.maxHeartRate ?? maxFromStream),
    minHeartRate: roundNullable(heartRates.length > 0 ? Math.min(...heartRates) : null),
    totalSteps: roundNullable(state.totalSteps),
    recoveryTimeSeconds: null,
    epoc: null,
    pte: null,
    tss: null,
    trainingLoadPeak: null,
    device: state.device,
    heartRateZones: computedZones,
    heartRateStream: state.heartRateStream,
  };
}

export function parseStrengthActivityJson(
  rawJson: string,
  filename: string,
  options?: ParseStrengthActivityOptions,
): ImportedStrengthActivitySummary {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch {
    throw new Error(STRENGTH_ACTIVITY_PARSE_ERROR_TAG);
  }

  if (isRecord(parsed) && isRecord(parsed.DeviceLog)) {
    return parseSuuntoJson(parsed, options);
  }

  return parseGenericJson(parsed, filename, options);
}

export function parseStrengthActivityFile(
  content: string | Uint8Array,
  filename: string,
  options?: ParseStrengthActivityOptions,
): ImportedStrengthActivitySummary {
  const lower = filename.toLowerCase();

  if (lower.endsWith('.fit')) {
    if (typeof content === 'string') throw new Error(STRENGTH_ACTIVITY_PARSE_ERROR_TAG);
    return parseFitActivity(content, filename, options);
  }

  if (lower.endsWith('.json')) {
    if (typeof content !== 'string') throw new Error(STRENGTH_ACTIVITY_PARSE_ERROR_TAG);
    return parseStrengthActivityJson(content, filename, options);
  }

  throw new Error(STRENGTH_ACTIVITY_PARSE_ERROR_TAG);
}
