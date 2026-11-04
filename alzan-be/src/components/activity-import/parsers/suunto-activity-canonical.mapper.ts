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
import { normaliseCanonicalActivityLaps } from './canonical-lap-normalizer';
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
  fieldNumber: number;
  size: number;
  developerDataIndex: number;
}

interface FitDeveloperFieldDescription {
  fieldName: string;
  units: string | null;
  baseType: number;
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
  lapStartTimestamps: Array<string | null>;
  lapElapsedDurations: Array<number | null>;
  nativeHeartRateZones: CanonicalActivityHeartRateZone[];
  developerFieldDescriptions: Map<string, FitDeveloperFieldDescription>;
  developerDataApplications: Map<number, string>;
  developerFieldValues: Record<string, string | number | number[]>;
  device: CanonicalActivity['device'];
  localTimestampSeconds: number | null;
}

interface FitLapAccumulator {
  distanceM: number | null;
  durationSeconds: number | null;
  elapsedSeconds: number | null;
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
const FIT_ACTIVITY_MESSAGE_NUMBER = 34;
const FIT_FIELD_DESCRIPTION_MESSAGE_NUMBER = 206;
const FIT_DEVELOPER_DATA_ID_MESSAGE_NUMBER = 207;
const FIT_LAP_TRIGGER_FIELD_NUMBER = 24;
const FIT_LAP_TRIGGER_MANUAL = 0;
const FIT_LAP_TRIGGER_DURATION = 1;
const FIT_LAP_TRIGGER_DISTANCE = 2;
const FIT_LAP_TRIGGER_FITNESS_EQUIPMENT = 8;
const FIT_EPOCH_OFFSET_SECONDS = 631065600;
const SUUNTO_EPOCH_MS_THRESHOLD = 100_000_000_000;
const FIT_INVALID_SINT32 = 2147483647;
const FIT_SEMICIRCLES_TO_DEGREES = 180 / 2147483648;
const RADIANS_TO_DEGREES = 180 / Math.PI;
const SUUNTO_LAP_EXTENSION_TYPES = new Set([
  'intervalstream',
  'manuallapstream',
  'distancelap',
  'durationlap',
  'verticallap',
]);
const SUMMARY_FIT_DISTANCE_TOLERANCE_M = 25;

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

function formatUtcOffset(offsetMinutes: number): string {
  const sign = offsetMinutes < 0 ? '-' : '+';
  const absolute = Math.abs(offsetMinutes);
  const hours = Math.floor(absolute / 60)
    .toString()
    .padStart(2, '0');
  const minutes = (absolute % 60).toString().padStart(2, '0');
  return `${sign}${hours}:${minutes}`;
}

function toLocalTimestamp(utcTimestamp: string | null, offsetMinutes: number): string | null {
  if (!utcTimestamp) return null;
  const timestamp = Date.parse(utcTimestamp);
  if (!Number.isFinite(timestamp)) return null;
  return new Date(timestamp + offsetMinutes * 60_000).toISOString().slice(0, 19);
}

function applyFitLocalTimestamp(state: FitParseState): void {
  if (state.localTimestampSeconds == null) return;
  const referenceTimestamp = state.summary.endedAt ?? state.summary.startedAt ?? null;
  if (!referenceTimestamp) return;
  const referenceSeconds = Date.parse(referenceTimestamp) / 1000;
  if (!Number.isFinite(referenceSeconds)) return;
  const offsetMinutes = Math.round((state.localTimestampSeconds - referenceSeconds) / 60);
  if (Math.abs(offsetMinutes) > 14 * 60) return;
  state.summary.timezone = formatUtcOffset(offsetMinutes);
  state.summary.startedAtLocal = toLocalTimestamp(state.summary.startedAt ?? null, offsetMinutes);
  state.summary.endedAtLocal = toLocalTimestamp(state.summary.endedAt ?? null, offsetMinutes);
}

export function applySuuntoWorkoutSummaryTimeMetadata(
  activity: CanonicalActivity,
  workoutSummary: Record<string, unknown>,
): CanonicalActivity {
  const rawOffset =
    workoutSummary.timeOffsetInMinutes ?? workoutSummary.time_offset_in_minutes ?? workoutSummary.TimeOffsetInMinutes;
  const offsetMinutes = readNumber(rawOffset);
  if (offsetMinutes == null || !Number.isInteger(offsetMinutes) || Math.abs(offsetMinutes) > 14 * 60) return activity;
  return {
    ...activity,
    summary: {
      ...activity.summary,
      timezone: formatUtcOffset(offsetMinutes),
      startedAtLocal: toLocalTimestamp(activity.summary.startedAt, offsetMinutes),
      endedAtLocal: toLocalTimestamp(activity.summary.endedAt, offsetMinutes),
    },
  };
}

function unwrapSuuntoWorkoutObject(value: unknown): JsonRecord | null {
  if (!isRecord(value)) return null;
  let current = value;
  for (let depth = 0; depth < 3 && isRecord(current.payload); depth += 1) {
    current = current.payload;
  }
  return current;
}

function readSuuntoWorkoutExtensions(value: unknown): JsonRecord[] {
  const workout = unwrapSuuntoWorkoutObject(value);
  if (!workout) return [];
  if (Array.isArray(workout.extensions)) return workout.extensions.filter(isRecord);

  const extensions: JsonRecord[] = [];
  for (const [key, extension] of Object.entries(workout)) {
    if (key.toLowerCase().endsWith('extension') && isRecord(extension)) {
      extensions.push({ ...extension, type: key });
    }
  }
  return extensions;
}

function readNonNegativeMetric(record: JsonRecord, ...keys: string[]): number | null {
  for (const key of keys) {
    const value = readNumber(record[key]);
    if (value != null && value >= 0) return value;
  }
  return null;
}

function readPositiveMetric(record: JsonRecord, ...keys: string[]): number | null {
  const value = readNonNegativeMetric(record, ...keys);
  return value != null && value > 0 ? value : null;
}

function roundSuuntoMetric(value: number | null, precision: number): number | null {
  if (value == null) return null;
  const scale = 10 ** precision;
  return Math.round(value * scale) / scale;
}

function readPeakEpocFromStream(extension: JsonRecord): number | null {
  const values = [extension.samples, extension.values, extension.data, extension.stream].find(Array.isArray);
  if (!Array.isArray(values)) return null;
  const epocValues = values
    .map(value =>
      typeof value === 'number'
        ? value
        : isRecord(value)
          ? readNonNegativeMetric(value, 'epoc', 'value', 'epocValue', 'peakEpoc', 'peak_epoc')
          : null,
    )
    .filter((value): value is number => value != null && Number.isFinite(value));
  return epocValues.length > 0 ? Math.max(...epocValues) : null;
}

function readWorkoutExtensionType(extension: JsonRecord): string {
  return (readString(extension.type) ?? readString(extension.extensionType) ?? '').toLowerCase();
}

function readWorkoutLapMarkers(sources: unknown[], startedAt: string | null): Array<{ start: number; end: number }> {
  if (!startedAt) return [];
  const startedAtMs = Date.parse(startedAt);
  if (!Number.isFinite(startedAtMs)) return [];

  const readEpochMs = (value: unknown): number | null => {
    if (typeof value === 'number' && Number.isFinite(value))
      return value < SUUNTO_EPOCH_MS_THRESHOLD ? value * 1000 : value;
    if (typeof value !== 'string' || value.trim().length === 0) return null;
    const numeric = Number(value);
    if (Number.isFinite(numeric) && /^\d+(\.\d+)?$/.test(value.trim())) {
      return numeric < SUUNTO_EPOCH_MS_THRESHOLD ? numeric * 1000 : numeric;
    }
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  };

  const markers: Array<{ start: number; end: number }> = [];
  for (const source of sources) {
    for (const extension of readSuuntoWorkoutExtensions(source)) {
      const extensionType = readWorkoutExtensionType(extension)
        .replace(/extension$/, '')
        .replace(/[^a-z]/g, '');
      if (!SUUNTO_LAP_EXTENSION_TYPES.has(extensionType)) continue;
      const collections = [extension.intervals, extension.markers, extension.laps, extension.values, extension.data];
      const entries = collections.find(Array.isArray);
      if (!Array.isArray(entries)) continue;
      for (const entry of entries) {
        if (!isRecord(entry)) continue;
        const startMs = readEpochMs(entry.startTime ?? entry.start_time ?? entry.start);
        const endMs = readEpochMs(entry.endTime ?? entry.end_time ?? entry.stopTime ?? entry.end);
        if (startMs == null || endMs == null || endMs <= startMs) continue;
        const start = (startMs - startedAtMs) / 1000;
        const end = (endMs - startedAtMs) / 1000;
        if (start < 0 || end <= 0) continue;
        if (!markers.some(marker => Math.abs(marker.start - start) < 0.5 && Math.abs(marker.end - end) < 0.5)) {
          markers.push({ start, end });
        }
      }
    }
  }

  return markers.sort((left, right) => left.start - right.start);
}

function interpolateDistanceAtOffset(activity: CanonicalActivity, offsetSeconds: number): number | null {
  if (offsetSeconds <= 0) return 0;
  const samples = activity.streams.distance
    .filter(
      sample => sample.offsetSeconds != null && Number.isFinite(sample.offsetSeconds) && Number.isFinite(sample.value),
    )
    .sort((left, right) => (left.offsetSeconds as number) - (right.offsetSeconds as number));
  if (samples.length === 0) return null;

  const exact = samples.find(sample => Math.abs((sample.offsetSeconds as number) - offsetSeconds) <= 0.25);
  if (exact) return exact.value;

  let before: CanonicalActivityMetricSample | null = null;
  let after: CanonicalActivityMetricSample | null = null;
  for (const sample of samples) {
    const sampleOffset = sample.offsetSeconds as number;
    if (sampleOffset < offsetSeconds) before = sample;
    else if (sampleOffset > offsetSeconds) {
      after = sample;
      break;
    }
  }
  if (before && after) {
    const beforeOffset = before.offsetSeconds as number;
    const afterOffset = after.offsetSeconds as number;
    const span = afterOffset - beforeOffset;
    if (span <= 0) return null;
    return before.value + ((after.value - before.value) * (offsetSeconds - beforeOffset)) / span;
  }

  const durationSeconds = activity.summary.durationSeconds;
  if (
    after == null &&
    durationSeconds != null &&
    Math.abs(offsetSeconds - durationSeconds) <= 2 &&
    activity.summary.distanceM != null
  ) {
    return activity.summary.distanceM;
  }
  return null;
}

function buildLapFromIntervalWindow(
  activity: CanonicalActivity,
  lapIndex: number,
  startOffsetSeconds: number,
  endOffsetSeconds: number,
  distanceM: number | null,
  lapType: CanonicalActivityLap['lapType'],
): CanonicalActivityLap {
  const durationSeconds = endOffsetSeconds - startOffsetSeconds;
  const heartRates = activity.streams.heartRate
    .filter(
      sample =>
        sample.offsetSeconds != null &&
        sample.offsetSeconds >= startOffsetSeconds &&
        sample.offsetSeconds < endOffsetSeconds,
    )
    .map(sample => sample.value);
  return {
    lapIndex,
    lapType,
    distanceM,
    durationSeconds,
    avgPaceSecondsPerKm: distanceM != null && distanceM > 0 ? (durationSeconds * 1000) / distanceM : null,
    avgHeartRate: heartRates.length > 0 ? heartRates.reduce((sum, value) => sum + value, 0) / heartRates.length : null,
    maxHeartRate: heartRates.length > 0 ? Math.max(...heartRates) : null,
    startOffsetSeconds,
    endOffsetSeconds,
  };
}

function readSuuntoIntervalEntries(source: unknown): JsonRecord[] {
  const workout = unwrapSuuntoWorkoutObject(source);
  if (!workout) return [];

  const deviceLog = isRecord(workout.DeviceLog) ? workout.DeviceLog : workout;
  const windows = deviceLog.Windows ?? workout.Windows;
  const windowEntries = Array.isArray(windows)
    ? windows
        .map(candidate => (isRecord(candidate) && isRecord(candidate.Window) ? candidate.Window : candidate))
        .filter((entry): entry is JsonRecord => isRecord(entry) && readString(entry.Type)?.toLowerCase() === 'interval')
    : [];

  const extensionEntries = readSuuntoWorkoutExtensions(source).flatMap(extension => {
    const type = readWorkoutExtensionType(extension)
      .replace(/extension$/, '')
      .replace(/[^a-z]/g, '');
    if (!type.includes('interval')) return [];

    const collections = [extension.intervals, extension.windows, extension.laps, extension.values, extension.data];
    const entries: JsonRecord[] = [];
    for (const collection of collections) {
      if (Array.isArray(collection)) {
        entries.push(...collection.filter(isRecord));
      } else if (isRecord(collection)) {
        for (const nested of Object.values(collection)) {
          if (Array.isArray(nested)) entries.push(...nested.filter(isRecord));
        }
      }
    }
    if (entries.length === 0 && (extension.startTime != null || extension.start_time != null)) {
      entries.push(extension);
    }
    return entries;
  });

  return [...windowEntries, ...extensionEntries];
}

function readIntervalValue(record: JsonRecord, ...keys: string[]): number | null {
  for (const key of keys) {
    const candidate = record[key];
    const value = isRecord(candidate) ? readNumber(candidate.value) : readNumber(candidate);
    if (value != null && value >= 0) return value;
  }
  return null;
}

function readIntervalOffset(value: unknown, startedAtMs: number): number | null {
  if (typeof value === 'string') {
    const numeric = Number(value);
    if (value.trim().length > 0 && Number.isFinite(numeric)) return readIntervalOffset(numeric, startedAtMs);
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? Math.max(0, (parsed - startedAtMs) / 1000) : null;
  }
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return null;
  if (value >= SUUNTO_EPOCH_MS_THRESHOLD) return Math.max(0, (value - startedAtMs) / 1000);
  if (value >= 1_000_000_000) return Math.max(0, value - startedAtMs / 1000);
  return value;
}

function readIntervalName(entry: JsonRecord): string | null {
  return (
    readString(entry.IntervalNotes) ??
    readString(entry.intervalNotes) ??
    readString(entry.notes) ??
    readString(entry.name) ??
    readString(entry.label) ??
    readString(entry.title) ??
    readString(entry.intervalName) ??
    readString(entry.phaseName) ??
    readString(entry.IntervalType) ??
    readString(entry.intervalType) ??
    readString(entry.phaseType)
  );
}

function buildSuuntoIntervalLaps(activity: CanonicalActivity, sources: unknown[]): CanonicalActivityLap[] {
  const startedAtMs = activity.summary.startedAt == null ? null : Date.parse(activity.summary.startedAt);
  if (startedAtMs == null || !Number.isFinite(startedAtMs)) return [];

  const entries = sources.flatMap(source => readSuuntoIntervalEntries(source));
  const laps: CanonicalActivityLap[] = [];
  let nextStartOffsetSeconds = 0;

  for (const entry of entries) {
    const startOffsetSeconds =
      readIntervalOffset(
        entry.startOffsetSeconds ?? entry.start_offset_s ?? entry.startOffset ?? entry.startTime ?? entry.start_time,
        startedAtMs,
      ) ?? nextStartOffsetSeconds;
    const explicitEndOffsetSeconds = readIntervalOffset(
      entry.endOffsetSeconds ?? entry.end_offset_s ?? entry.endOffset ?? entry.endTime ?? entry.end_time,
      startedAtMs,
    );
    const explicitDurationSeconds = readIntervalValue(
      entry,
      'Duration',
      'duration',
      'durationSeconds',
      'duration_s',
      'totalTimerTime',
      'total_timer_time',
      'totalElapsedTime',
      'total_elapsed_time',
    );
    const endOffsetSeconds =
      explicitEndOffsetSeconds ??
      (explicitDurationSeconds != null ? startOffsetSeconds + explicitDurationSeconds : null);
    const durationSeconds =
      explicitDurationSeconds ??
      (endOffsetSeconds != null && endOffsetSeconds > startOffsetSeconds
        ? endOffsetSeconds - startOffsetSeconds
        : null);
    if (durationSeconds == null || durationSeconds <= 0) continue;

    const resolvedEndOffsetSeconds = endOffsetSeconds ?? startOffsetSeconds + durationSeconds;
    const intervalDistanceM = readIntervalValue(
      entry,
      'Distance',
      'distance',
      'distanceM',
      'distance_m',
      'totalDistance',
      'total_distance',
    );
    const startDistanceM = intervalDistanceM == null ? interpolateDistanceAtOffset(activity, startOffsetSeconds) : null;
    const endDistanceM =
      intervalDistanceM == null ? interpolateDistanceAtOffset(activity, resolvedEndOffsetSeconds) : null;
    const distanceM =
      intervalDistanceM ??
      (startDistanceM != null && endDistanceM != null && endDistanceM > startDistanceM
        ? endDistanceM - startDistanceM
        : null);
    const matchingFitLap = activity.laps.find(
      lap =>
        lap.startOffsetSeconds != null &&
        lap.endOffsetSeconds != null &&
        Math.abs(lap.startOffsetSeconds - startOffsetSeconds) <= 15 &&
        Math.abs(lap.endOffsetSeconds - resolvedEndOffsetSeconds) <= 30,
    );
    const windowAverageHeartRate = readWindowMetric(entry, 'HR', 'Avg');
    const windowMaxHeartRate = readWindowMetric(entry, 'HR', 'Max');
    const intervalLap: CanonicalActivityLap = {
      lapIndex: laps.length + 1,
      lapName: readIntervalName(entry),
      lapType: 'manual',
      distanceM: distanceM ?? matchingFitLap?.distanceM ?? null,
      durationSeconds,
      avgPaceSecondsPerKm:
        distanceM != null && distanceM > 0
          ? (durationSeconds * 1000) / distanceM
          : (matchingFitLap?.avgPaceSecondsPerKm ?? null),
      avgHeartRate:
        windowAverageHeartRate != null
          ? normaliseHeartRate(windowAverageHeartRate)
          : (matchingFitLap?.avgHeartRate ?? null),
      maxHeartRate:
        windowMaxHeartRate != null ? normaliseHeartRate(windowMaxHeartRate) : (matchingFitLap?.maxHeartRate ?? null),
      startOffsetSeconds,
      endOffsetSeconds: resolvedEndOffsetSeconds,
    };
    const duplicate = laps.some(
      lap =>
        lap.startOffsetSeconds != null &&
        Math.abs(lap.startOffsetSeconds - intervalLap.startOffsetSeconds!) < 1 &&
        Math.abs((lap.endOffsetSeconds ?? 0) - (intervalLap.endOffsetSeconds ?? 0)) < 1,
    );
    if (!duplicate) {
      laps.push(intervalLap);
      nextStartOffsetSeconds = resolvedEndOffsetSeconds;
    }
  }

  return laps;
}

function reconstructMissingWorkoutBoundaryLaps(
  activity: CanonicalActivity,
  markers: Array<{ start: number; end: number }>,
): CanonicalActivityLap[] | null {
  if (activity.laps.length > 1 || markers.length === 0) return null;
  const durationSeconds = activity.summary.durationSeconds;
  const elapsedSeconds = activity.summary.elapsedSeconds;
  const totalDistanceM = activity.summary.distanceM;
  if (
    durationSeconds == null ||
    durationSeconds <= 0 ||
    totalDistanceM == null ||
    totalDistanceM <= 0 ||
    (elapsedSeconds != null && Math.abs(elapsedSeconds - durationSeconds) > 30)
  ) {
    return null;
  }

  let cursor = 0;
  const segments: Array<{ start: number; end: number; isMarker: boolean }> = [];
  for (const marker of markers) {
    if (marker.start < cursor - 0.5 || marker.end > durationSeconds + 0.5) return null;
    if (marker.start - cursor > 30) segments.push({ start: cursor, end: marker.start, isMarker: false });
    segments.push({ start: marker.start, end: marker.end, isMarker: true });
    cursor = marker.end;
  }
  if (durationSeconds - cursor > 30) segments.push({ start: cursor, end: durationSeconds, isMarker: false });

  const existingLap = activity.laps[0];
  let matchedSegmentIndex = -1;
  if (existingLap) {
    if (
      existingLap.startOffsetSeconds == null ||
      existingLap.durationSeconds == null ||
      existingLap.durationSeconds <= 0 ||
      existingLap.distanceM == null ||
      existingLap.distanceM <= 0
    ) {
      return null;
    }
    const existingEnd = existingLap.endOffsetSeconds ?? existingLap.startOffsetSeconds + existingLap.durationSeconds;
    matchedSegmentIndex = segments.findIndex(
      segment =>
        segment.isMarker &&
        Math.abs(segment.start - existingLap.startOffsetSeconds!) <= 15 &&
        Math.abs(segment.end - existingEnd) <= 30,
    );
    if (matchedSegmentIndex < 0) return null;
  }

  const reconstructed: CanonicalActivityLap[] = [];
  for (const segment of segments) {
    const segmentDuration = segment.end - segment.start;
    if (segmentDuration <= 0) return null;
    const startDistanceM = interpolateDistanceAtOffset(activity, segment.start);
    const endDistanceM = interpolateDistanceAtOffset(activity, segment.end);
    if (startDistanceM == null || endDistanceM == null || endDistanceM <= startDistanceM) return null;
    const lap =
      existingLap &&
      segment.isMarker &&
      Math.abs(segment.start - existingLap.startOffsetSeconds!) <= 15 &&
      Math.abs(
        segment.end - (existingLap.endOffsetSeconds ?? existingLap.startOffsetSeconds! + existingLap.durationSeconds!),
      ) <= 30
        ? { ...existingLap, lapIndex: reconstructed.length + 1 }
        : buildLapFromIntervalWindow(
            activity,
            reconstructed.length + 1,
            segment.start,
            segment.end,
            endDistanceM - startDistanceM,
            'unknown',
          );
    reconstructed.push(lap);
  }

  if (reconstructed.length <= activity.laps.length) return null;
  const reconstructedDistanceM = reconstructed.reduce((sum, lap) => sum + (lap.distanceM ?? 0), 0);
  if (Math.abs(reconstructedDistanceM - totalDistanceM) > Math.max(50, totalDistanceM * 0.03)) return null;
  return reconstructed;
}

/** Enriches cloud FIT data with the documented summary and interval extensions returned by Suunto. */
export function applySuuntoWorkoutExtensions(activity: CanonicalActivity, ...sources: unknown[]): CanonicalActivity {
  let vo2Max = activity.summary.vo2Max;
  let epoc = activity.summary.epoc;
  let pte = activity.summary.pte;
  let recoveryTimeSeconds = activity.summary.recoveryTimeSeconds;

  for (const source of sources) {
    const workout = unwrapSuuntoWorkoutObject(source);
    if (workout) {
      const extensions = readSuuntoWorkoutExtensions(source);
      const fitness = extensions.find(extension => readWorkoutExtensionType(extension) === 'fitnessextension');
      const summary = extensions.find(extension => readWorkoutExtensionType(extension) === 'summaryextension');
      const epocStream = extensions.find(extension => readWorkoutExtensionType(extension) === 'epocstreamextension');
      vo2Max ??= fitness
        ? roundSuuntoMetric(
            readPositiveMetric(fitness, 'estimatedVo2Max', 'estimatedVO2Max', 'estimated_vo2_max', 'vo2Max', 'vo2_max'),
            1,
          )
        : null;
      epoc ??= roundSuuntoMetric(
        (summary ? readNonNegativeMetric(summary, 'peakEpoc', 'peak_epoc', 'epoc') : null) ??
          (epocStream ? readPeakEpocFromStream(epocStream) : null),
        1,
      );
      pte ??= summary
        ? roundSuuntoMetric(readPositiveMetric(summary, 'pte', 'peakTrainingEffect', 'trainingEffect'), 1)
        : null;
      recoveryTimeSeconds ??= summary
        ? readNonNegativeMetric(summary, 'recoveryTime', 'recovery_time')
        : readNonNegativeMetric(workout, 'recoveryTime', 'recovery_time');
    }
  }

  const markers = readWorkoutLapMarkers(sources, activity.summary.startedAt);
  const reconstructedLaps = reconstructMissingWorkoutBoundaryLaps(activity, markers);
  const parsedIntervalLaps = buildSuuntoIntervalLaps(activity, sources);
  const existingIntervalLaps = activity.intervalLaps ?? [];
  const intervalLaps =
    parsedIntervalLaps.length >= existingIntervalLaps.length ? parsedIntervalLaps : existingIntervalLaps;
  return {
    ...activity,
    summary: { ...activity.summary, vo2Max, epoc, pte, recoveryTimeSeconds },
    ...(reconstructedLaps ? { laps: reconstructedLaps } : {}),
    ...(intervalLaps.length > 0 ? { intervalLaps } : {}),
  };
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

function fitDeveloperFieldKey(developerDataIndex: number, fieldNumber: number): string {
  return `${developerDataIndex}:${fieldNumber}`;
}

function normaliseSuuntoDeveloperMetric(fieldName: string, value: number): number {
  if (
    fieldName === 'estimated_vo2_max' ||
    fieldName === 'peak_epoc' ||
    fieldName === 'peak_training_effect' ||
    fieldName === 'training_effect'
  ) {
    return Math.round(value * 10) / 10;
  }
  if (fieldName === 'recovery_time') return Math.round(value);
  return value;
}

function decodeFitFieldAsString(dataView: DataView, offset: number, size: number): string | null {
  if (size <= 0 || offset + size > dataView.byteLength) return null;
  const bytes: number[] = [];
  for (let index = 0; index < size; index += 1) {
    const byte = dataView.getUint8(offset + index);
    if (byte === 0) break;
    bytes.push(byte);
  }
  if (bytes.length === 0) return null;
  return new TextDecoder().decode(new Uint8Array(bytes)).trim() || null;
}

function decodeFitFieldAsByteString(dataView: DataView, offset: number, size: number): string | null {
  if (size <= 0 || offset + size > dataView.byteLength) return null;
  const bytes: number[] = [];
  for (let index = 0; index < size; index += 1) {
    const byte = dataView.getUint8(offset + index);
    if (byte === 0) break;
    bytes.push(byte);
  }
  return bytes.length > 0 ? String.fromCharCode(...bytes) : null;
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
      return value === FIT_INVALID_SINT32 ? null : value;
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
    if (offset + 1 > dataEnd) throw new Error('Invalid Suunto FIT file.');
    const developerFieldCount = dataView.getUint8(offset);
    offset += 1;
    for (let index = 0; index < developerFieldCount; index += 1) {
      if (offset + 3 > dataEnd) throw new Error('Invalid Suunto FIT file.');
      developerFields.push({
        fieldNumber: dataView.getUint8(offset),
        size: dataView.getUint8(offset + 1),
        developerDataIndex: dataView.getUint8(offset + 2),
      });
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
  if (value === FIT_LAP_TRIGGER_MANUAL || value === FIT_LAP_TRIGGER_FITNESS_EQUIPMENT) return 'manual';
  if (value === FIT_LAP_TRIGGER_DURATION) return 'time';
  if (value === FIT_LAP_TRIGGER_DISTANCE) return 'distance';
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
  const developerMessageFields = new Map<number, string | number | number[]>();
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
    elapsedSeconds: null,
    avgSpeedMps: null,
    avgHeartRate: null,
    maxHeartRate: null,
    startTimestampSeconds: null,
    lapType: 'unknown',
  };

  for (const field of definition.fields) {
    if (offset + field.size > dataEnd) throw new Error('Invalid Suunto FIT file.');
    const numericValue = decodeFitFieldAsNumber(dataView, offset, field.size, field.baseType, definition.littleEndian);

    if (definition.globalMessageNumber === FIT_FIELD_DESCRIPTION_MESSAGE_NUMBER) {
      if (field.fieldNumber === 0 && numericValue != null) developerMessageFields.set(0, Math.round(numericValue));
      if (field.fieldNumber === 1 && numericValue != null) developerMessageFields.set(1, Math.round(numericValue));
      if (field.fieldNumber === 2 && numericValue != null) developerMessageFields.set(2, Math.round(numericValue));
      if (field.fieldNumber === 3) {
        const fieldName = decodeFitFieldAsString(dataView, offset, field.size);
        if (fieldName) developerMessageFields.set(3, fieldName);
      }
      if (field.fieldNumber === 8) {
        const units = decodeFitFieldAsString(dataView, offset, field.size);
        if (units) developerMessageFields.set(8, units);
      }
    }

    if (definition.globalMessageNumber === FIT_DEVELOPER_DATA_ID_MESSAGE_NUMBER) {
      if (field.fieldNumber === 0 && numericValue != null) developerMessageFields.set(0, Math.round(numericValue));
      if (field.fieldNumber === 1) {
        const applicationId = decodeFitFieldAsByteString(dataView, offset, field.size);
        if (applicationId) developerMessageFields.set(1, applicationId);
      }
    }

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

    if (definition.globalMessageNumber === FIT_ACTIVITY_MESSAGE_NUMBER && field.fieldNumber === 5) {
      state.localTimestampSeconds = fitTimestampToSeconds(numericValue);
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
      if (field.fieldNumber === 7 && numericValue != null) {
        lap.elapsedSeconds = numericValue / 1000;
        lap.durationSeconds = lap.durationSeconds ?? lap.elapsedSeconds;
      }
      if (field.fieldNumber === 8 && numericValue != null) lap.durationSeconds = numericValue / 1000;
      if (field.fieldNumber === 9 && numericValue != null) lap.distanceM = numericValue / 100;
      if (field.fieldNumber === 13 && numericValue != null) lap.avgSpeedMps = numericValue / 1000;
      if (field.fieldNumber === 15 && numericValue != null) lap.avgHeartRate = numericValue;
      if (field.fieldNumber === 16 && numericValue != null) lap.maxHeartRate = numericValue;
      if (field.fieldNumber === FIT_LAP_TRIGGER_FIELD_NUMBER)
        lap.lapType = mapFitLapTrigger(numericValue != null ? Math.round(numericValue) : null);
    }

    offset += field.size;
  }

  for (const developerField of definition.developerFields) {
    if (offset + developerField.size > dataEnd) throw new Error('Invalid Suunto FIT file.');
    const descriptor = state.developerFieldDescriptions.get(
      fitDeveloperFieldKey(developerField.developerDataIndex, developerField.fieldNumber),
    );
    if (descriptor) {
      const fieldValue =
        descriptor.baseType === 0x07
          ? decodeFitFieldAsString(dataView, offset, developerField.size)
          : decodeFitFieldAsNumbers(
              dataView,
              offset,
              developerField.size,
              descriptor.baseType,
              definition.littleEndian,
            );
      const normalizedValue =
        typeof fieldValue === 'string'
          ? fieldValue
          : fieldValue != null && fieldValue.length === 1
            ? normaliseSuuntoDeveloperMetric(descriptor.fieldName, fieldValue[0])
            : fieldValue;
      if (
        normalizedValue != null &&
        (definition.globalMessageNumber === FIT_SESSION_MESSAGE_NUMBER ||
          definition.globalMessageNumber === FIT_LAP_MESSAGE_NUMBER)
      ) {
        state.developerFieldValues[descriptor.fieldName] = normalizedValue;
        if (definition.globalMessageNumber === FIT_SESSION_MESSAGE_NUMBER && typeof normalizedValue === 'number') {
          if (descriptor.fieldName === 'estimated_vo2_max') setLargest(state.summary, 'vo2Max', normalizedValue);
          if (descriptor.fieldName === 'peak_epoc') setLargest(state.summary, 'epoc', normalizedValue);
          if (descriptor.fieldName === 'recovery_time')
            setLargest(state.summary, 'recoveryTimeSeconds', normalizedValue);
          if (descriptor.fieldName === 'peak_training_effect' || descriptor.fieldName === 'training_effect')
            setLargest(state.summary, 'pte', normalizedValue);
        }
      }
    }
    offset += developerField.size;
  }

  if (definition.globalMessageNumber === FIT_FIELD_DESCRIPTION_MESSAGE_NUMBER) {
    const developerDataIndex = developerMessageFields.get(0);
    const fieldNumber = developerMessageFields.get(1);
    const baseType = developerMessageFields.get(2);
    const fieldName = developerMessageFields.get(3);
    const units = developerMessageFields.get(8);
    if (
      typeof developerDataIndex === 'number' &&
      typeof fieldNumber === 'number' &&
      typeof baseType === 'number' &&
      typeof fieldName === 'string'
    ) {
      state.developerFieldDescriptions.set(fitDeveloperFieldKey(developerDataIndex, fieldNumber), {
        fieldName,
        units: typeof units === 'string' ? units : null,
        baseType,
      });
    }
  }

  if (definition.globalMessageNumber === FIT_DEVELOPER_DATA_ID_MESSAGE_NUMBER) {
    const developerDataIndex = developerMessageFields.get(0);
    const applicationId = developerMessageFields.get(1);
    if (typeof developerDataIndex === 'number' && typeof applicationId === 'string') {
      state.developerDataApplications.set(developerDataIndex, applicationId);
    }
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
  state.lapStartTimestamps.push(startTime);
  state.lapElapsedDurations.push(lap.elapsedSeconds);
}

function resolveFitOffsetsAfterSummary(state: FitParseState): void {
  const startedAt = state.summary.startedAt ?? null;
  if (!startedAt) return;

  for (const sample of state.position) {
    if (sample.offsetSeconds == null) sample.offsetSeconds = resolveOffsetSeconds(startedAt, sample.timestamp);
  }
  const metricStreams = [
    state.heartRate,
    state.speed,
    state.distance,
    state.altitude,
    state.cadence,
    state.power,
    state.temperature,
  ];
  for (const stream of metricStreams) {
    for (const sample of stream) {
      if (sample.offsetSeconds == null) sample.offsetSeconds = resolveOffsetSeconds(startedAt, sample.timestamp);
    }
  }

  state.laps = state.laps.map((lap, index) => {
    if (lap.startOffsetSeconds != null) return lap;
    const startOffsetSeconds = resolveOffsetSeconds(startedAt, state.lapStartTimestamps[index] ?? null);
    return {
      ...lap,
      startOffsetSeconds,
      endOffsetSeconds:
        startOffsetSeconds != null && lap.durationSeconds != null
          ? startOffsetSeconds + lap.durationSeconds
          : lap.endOffsetSeconds,
    };
  });
}

function enrichFitLap(lap: CanonicalActivityLap, state: FitParseState): CanonicalActivityLap {
  const { startOffsetSeconds: start, endOffsetSeconds: end, durationSeconds } = lap;
  if (start == null || end == null || end <= start) return lap;

  const distanceAt = (offset: number) => state.distance.find(sample => sample.offsetSeconds === offset)?.value;
  const from = distanceAt(start) ?? (start === 0 ? 0 : undefined);
  const to = distanceAt(end);
  const distanceM = lap.distanceM ?? (from != null && to != null && to > from ? to - from : null);
  const heartRates = state.heartRate.filter(
    sample => sample.offsetSeconds != null && sample.offsetSeconds >= start && sample.offsetSeconds < end,
  );
  return {
    ...lap,
    distanceM,
    avgPaceSecondsPerKm:
      lap.avgPaceSecondsPerKm ??
      (distanceM != null && distanceM > 0 && durationSeconds != null ? (durationSeconds * 1000) / distanceM : null),
    avgHeartRate:
      lap.avgHeartRate ??
      (heartRates.length ? heartRates.reduce((sum, sample) => sum + sample.value, 0) / heartRates.length : null),
    maxHeartRate:
      lap.maxHeartRate ??
      (heartRates.length ? heartRates.reduce((max, sample) => Math.max(max, sample.value), 0) : null),
  };
}

function fitLapsOverlap(left: CanonicalActivityLap, right: CanonicalActivityLap): boolean {
  if (
    left.startOffsetSeconds == null ||
    left.endOffsetSeconds == null ||
    right.startOffsetSeconds == null ||
    right.endOffsetSeconds == null
  ) {
    return false;
  }
  return (
    Math.min(left.endOffsetSeconds, right.endOffsetSeconds) -
      Math.max(left.startOffsetSeconds, right.startOffsetSeconds) >
    1
  );
}

function buildFitTerminalRemainderLap(
  state: FitParseState,
  normalisedLaps: CanonicalActivityLap[],
): CanonicalActivityLap | null {
  const manualLaps = normalisedLaps.filter(
    lap => lap.lapType === 'manual' && lap.startOffsetSeconds != null && lap.endOffsetSeconds != null,
  );
  if (manualLaps.length < 2) return null;

  const rawAutolaps = state.laps.filter(
    lap => lap.lapType === 'distance' || lap.lapType === 'time' || lap.lapType === 'auto',
  );
  if (!rawAutolaps.some(autolap => manualLaps.some(manualLap => fitLapsOverlap(autolap, manualLap)))) return null;

  const latestManualEnd = Math.max(...manualLaps.map(lap => lap.endOffsetSeconds as number));
  if (
    normalisedLaps.some(
      lap =>
        lap.lapType !== 'manual' && lap.startOffsetSeconds != null && lap.startOffsetSeconds >= latestManualEnd - 1,
    )
  ) {
    return null;
  }

  const distanceSamples = state.distance
    .filter(sample => sample.offsetSeconds != null && Number.isFinite(sample.value))
    .sort((left, right) => (left.offsetSeconds as number) - (right.offsetSeconds as number));
  const distanceAtManualEnd = [...distanceSamples]
    .reverse()
    .find(sample => (sample.offsetSeconds as number) <= latestManualEnd);
  const finalDistanceSample = [...distanceSamples]
    .reverse()
    .find(sample => (sample.offsetSeconds as number) > latestManualEnd);
  if (!distanceAtManualEnd || !finalDistanceSample) return null;

  const distanceM = finalDistanceSample.value - distanceAtManualEnd.value;
  const endOffsetSeconds = finalDistanceSample.offsetSeconds as number;
  const timestampDurationSeconds = endOffsetSeconds - latestManualEnd;
  const manualElapsedSeconds = state.laps.reduce(
    (sum, lap, index) =>
      lap.lapType === 'manual' && state.lapElapsedDurations[index] != null
        ? sum + (state.lapElapsedDurations[index] as number)
        : sum,
    0,
  );
  const elapsedRemainderSeconds =
    state.summary.elapsedSeconds != null ? state.summary.elapsedSeconds - manualElapsedSeconds : null;
  const durationSeconds =
    elapsedRemainderSeconds != null &&
    elapsedRemainderSeconds > 0 &&
    Math.abs(elapsedRemainderSeconds - timestampDurationSeconds) <= 2
      ? elapsedRemainderSeconds
      : timestampDurationSeconds;
  if (distanceM <= 0 || durationSeconds <= 0) return null;
  if (
    state.summary.distanceM != null &&
    Math.abs(finalDistanceSample.value - state.summary.distanceM) > SUMMARY_FIT_DISTANCE_TOLERANCE_M
  ) {
    return null;
  }

  const tailHeartRates = state.heartRate.filter(
    sample =>
      sample.offsetSeconds != null &&
      sample.offsetSeconds >= latestManualEnd &&
      sample.offsetSeconds <= endOffsetSeconds,
  );
  const avgHeartRate =
    tailHeartRates.length > 0
      ? Math.round(tailHeartRates.reduce((sum, sample) => sum + sample.value, 0) / tailHeartRates.length)
      : null;

  return {
    lapIndex: normalisedLaps.length + 1,
    lapType: 'unknown',
    distanceM,
    durationSeconds,
    avgPaceSecondsPerKm: durationSeconds / (distanceM / 1000),
    avgHeartRate,
    maxHeartRate: tailHeartRates.length > 0 ? Math.max(...tailHeartRates.map(sample => sample.value)) : null,
    startOffsetSeconds: latestManualEnd,
    endOffsetSeconds,
  };
}

function parseSuuntoFit(binary: Uint8Array, options?: ParseSuuntoActivityOptions): CanonicalActivity {
  binary = normaliseSuuntoFitBinary(binary);
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
    lapStartTimestamps: [],
    lapElapsedDurations: [],
    nativeHeartRateZones: [],
    developerFieldDescriptions: new Map(),
    developerDataApplications: new Map(),
    developerFieldValues: {},
    device: null,
    localTimestampSeconds: null,
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

  resolveFitOffsetsAfterSummary(state);
  applyFitLocalTimestamp(state);

  const normalisedLaps = normaliseCanonicalActivityLaps(state.laps, state.summary);
  const terminalRemainderLap = buildFitTerminalRemainderLap(state, normalisedLaps);
  const canonicalLaps = terminalRemainderLap ? [...normalisedLaps, terminalRemainderLap] : normalisedLaps;

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
    laps: canonicalLaps.map(lap => enrichFitLap(lap, state)),
    device: state.device,
    vendorFields: {
      suuntoFitSport: state.sport,
      suuntoFitSubSport: state.subSport,
      ...(Object.keys(state.developerFieldValues).length > 0
        ? { suuntoFitDeveloperFields: state.developerFieldValues }
        : {}),
      ...(state.developerDataApplications.size > 0
        ? { suuntoFitDeveloperApplications: Object.fromEntries(state.developerDataApplications) }
        : {}),
    },
    heartRateZones: state.nativeHeartRateZones,
    estimatedMaxHeartRate: options?.estimatedMaxHeartRate,
  });
}

function normaliseSuuntoFitBinary(binary: Uint8Array): Uint8Array {
  if (binary.byteLength >= 12 && String.fromCharCode(binary[8], binary[9], binary[10], binary[11]) === '.FIT') {
    return binary;
  }

  for (let signatureOffset = 8; signatureOffset + 3 < binary.byteLength; signatureOffset += 1) {
    if (
      binary[signatureOffset] === 0x2e &&
      binary[signatureOffset + 1] === 0x46 &&
      binary[signatureOffset + 2] === 0x49 &&
      binary[signatureOffset + 3] === 0x54
    ) {
      const headerOffset = signatureOffset - 8;
      const headerSize = binary[headerOffset];
      if (headerSize >= 12 && headerOffset + headerSize <= binary.byteLength) {
        return binary.subarray(headerOffset);
      }
    }
  }

  return binary;
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

function mapSuuntoWindowsToLaps(windows: unknown): CanonicalActivityLap[] {
  if (!Array.isArray(windows)) return [];
  const elapsedByType = { manual: 0, distance: 0 };
  return windows
    .map(candidate => (isRecord(candidate) && isRecord(candidate.Window) ? candidate.Window : null))
    .filter((window): window is JsonRecord => {
      if (!window) return false;
      const type = readString(window.Type)?.toLowerCase();
      return type === 'autolap' || type === 'interval';
    })
    .map((window, index) => {
      const distanceM = readNumber(window.Distance) ?? readNumber(window.DistanceMax);
      const durationSeconds = readNumber(window.Duration);
      const lapType = readString(window.Type)?.toLowerCase() === 'interval' ? 'manual' : 'distance';
      const startOffsetSeconds = elapsedByType[lapType];
      if (durationSeconds != null && durationSeconds > 0) elapsedByType[lapType] += durationSeconds;
      return {
        lapIndex: index + 1,
        lapName: readString(window.IntervalNotes) ?? readString(window.IntervalType) ?? null,
        lapType,
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
  const durationSeconds =
    readNumber(header.Duration) ??
    readNumber(header.duration) ??
    readNumber(header.totalTime) ??
    readNumber(header.total_time);
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
    timezone: params.summary.timezone ?? null,
    startedAtLocal: params.summary.startedAtLocal ?? null,
    endedAtLocal: params.summary.endedAtLocal ?? null,
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
    hydrationVersion: 1,
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
