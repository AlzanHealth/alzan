import { Database } from '../../../types/database.types';

export type StrengthActivityProvider = 'suunto' | 'strava' | 'garmin' | 'polar' | 'unknown';
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
  device: ImportedStrengthActivityDevice | null;
  heartRateStream: ImportedStrengthActivityHeartRateSample[];
}

const FIT_LOCAL_MESSAGE_TYPES = 16;
const FIT_FILE_ID_MESSAGE_NUMBER = 0;
const FIT_SESSION_MESSAGE_NUMBER = 18;
const FIT_RECORD_MESSAGE_NUMBER = 20;
const FIT_EPOCH_OFFSET_SECONDS = 631065600;
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

function readNestedMetric(record: JsonRecord, key: string, metricKey: string): number | null {
  const section = record[key];
  if (!Array.isArray(section) || section.length === 0) return null;
  const firstMetric = section[0];
  if (!isRecord(firstMetric)) return null;
  return readNumber(firstMetric[metricKey]);
}

function providerToDatabaseProvider(provider: StrengthActivityProvider): DatabaseProvider {
  if (provider === 'unknown') return 'other';
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
  return 'unknown';
}

function detectJsonProvider(parsed: unknown, filename: string): StrengthActivityProvider {
  const fileProvider = detectProviderFromFilename(filename);
  if (fileProvider !== 'unknown') return fileProvider;

  if (!isRecord(parsed)) return 'unknown';
  if (isRecord(parsed.DeviceLog)) return 'suunto';

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
    readString(parsed.sport_type),
    readString(parsed.sportType),
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

  const observedMax = heartRateSamples.reduce((highest, value) => (value > highest ? value : highest), heartRateSamples[0]);
  return Number.isFinite(observedMax) && observedMax > 0 ? observedMax : null;
}

function buildHeartRateZonesFromStream(
  stream: ImportedStrengthActivityHeartRateSample[],
  estimatedMaxHeartRate?: number | null,
): ImportedStrengthActivityHeartRateZone[] {
  const samples = stream
    .map(sample => sample.bpm)
    .filter((bpm): bpm is number => Number.isFinite(bpm) && bpm > 0);

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

function parseGenericJson(parsed: unknown, filename: string): ImportedStrengthActivitySummary {
  if (!isRecord(parsed)) {
    throw new Error(STRENGTH_ACTIVITY_PARSE_ERROR_TAG);
  }

  const provider = detectJsonProvider(parsed, filename);
  const distanceM = readNumber(parsed.distance) ?? readNumber(parsed.distance_m) ?? readNumber(parsed.distanceMeters);

  if (isClearlyUnsupportedJsonActivity(parsed, distanceM)) {
    throw new Error(STRENGTH_ACTIVITY_UNSUPPORTED_ERROR_TAG);
  }

  const startedAt = normaliseTimestamp(
    parsed.start_date ?? parsed.start_date_local ?? parsed.startTime ?? parsed.started_at ?? parsed.date,
  );
  const durationSeconds =
    readNumber(parsed.elapsed_time) ??
    readNumber(parsed.moving_time) ??
    readNumber(parsed.duration) ??
    readNumber(parsed.durationSeconds);
  const endedAt = normaliseTimestamp(parsed.endTime ?? parsed.ended_at);
  const caloriesKcal =
    readNumber(parsed.calories) ??
    readNumber(parsed.calories_kcal) ??
    normaliseCaloriesFromEnergy(readNumber(parsed.energy) ?? readNumber(parsed.Energy) ?? 0);
  const avgHeartRate =
    readNumber(parsed.average_heartrate) ?? readNumber(parsed.avgHeartRate) ?? readNumber(parsed.averageHeartRate);
  const maxHeartRate =
    readNumber(parsed.max_heartrate) ?? readNumber(parsed.maxHeartRate) ?? readNumber(parsed.maximumHeartRate);
  const minHeartRate =
    readNumber(parsed.min_heartrate) ?? readNumber(parsed.minHeartRate) ?? readNumber(parsed.minimumHeartRate);
  const totalSteps = readNumber(parsed.steps) ?? readNumber(parsed.totalSteps);
  const recoveryTimeSeconds = readNumber(parsed.recovery_time) ?? readNumber(parsed.recoveryTimeSeconds);
  const epoc = readNumber(parsed.epoc) ?? readNumber(parsed.EPOC);
  const pte = readNumber(parsed.pte) ?? readNumber(parsed.PTE) ?? readNumber(parsed.peak_training_effect);
  const tss = readNumber(parsed.tss) ?? readNumber(parsed.TSS) ?? readNumber(parsed.hrTSS);
  const rawDevice = isRecord(parsed.device) ? parsed.device : isRecord(parsed.Device) ? parsed.Device : null;

  return {
    provider,
    sourceFileType: 'json',
    startedAt,
    endedAt: deriveEndTime(startedAt, durationSeconds ?? null, endedAt),
    durationSeconds: roundNullable(durationSeconds),
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
      : null,
    heartRateZones: [],
    heartRateStream: [],
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
      if (field.fieldNumber === 3 && numericValue != null) {
        state.device = {
          ...(state.device ?? { name: null, model: null, serial: null }),
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
    device: null,
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
  const computedZones = buildHeartRateZonesFromStream(state.heartRateStream, options?.estimatedMaxHeartRate);

  return {
    provider: detectFitProvider(filename),
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

  return parseGenericJson(parsed, filename);
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
