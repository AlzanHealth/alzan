import { CanonicalActivity } from './activity-import-canonical.types';
import { parseAppleHealthActivityJsonToCanonical } from './apple-health-activity-canonical.mapper';
import { parseCorosActivityFileToCanonical } from './coros-activity-canonical.mapper';
import { parseFitbitActivityJsonToCanonical } from './fitbit-activity-canonical.mapper';
import { buildEmptyGenericActivity, parseGenericActivityJsonToCanonical } from './generic-activity-canonical.mapper';
import { parseGarminActivityFileToCanonical } from './garmin-activity-canonical.mapper';
import { parseOuraActivityJsonToCanonical } from './oura-activity-canonical.mapper';
import { parsePolarActivityFileToCanonical } from './polar-activity-canonical.mapper';
import { parseStravaActivityJsonToCanonical } from './strava-activity-canonical.mapper';
import { parseSuuntoActivityFileToCanonical } from './suunto-activity-canonical.mapper';
import { parseUltrahumanActivityJsonToCanonical } from './ultrahuman-activity-canonical.mapper';
import { parseWhoopActivityJsonToCanonical } from './whoop-activity-canonical.mapper';

interface ParseActivityFileOptions {
  estimatedMaxHeartRate?: number | null;
}

type JsonRecord = Record<string, unknown>;

const FIT_LOCAL_MESSAGE_TYPES = 16;
const FIT_FILE_ID_MESSAGE_NUMBER = 0;
const GARMIN_MANUFACTURER_ID = 1;

interface FitFieldDefinition {
  fieldNumber: number;
  size: number;
  baseType: number;
}

interface FitMessageDefinition {
  littleEndian: boolean;
  globalMessageNumber: number;
  fields: FitFieldDefinition[];
  developerFieldSizes: number[];
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function decodeFitFieldAsNumber(
  dataView: DataView,
  offset: number,
  size: number,
  baseType: number,
  littleEndian: boolean,
): number | null {
  if (size <= 0) return null;
  switch (baseType) {
    case 0x02:
    case 0x0d:
      return dataView.getUint8(offset);
    case 0x84:
      return size >= 2 ? dataView.getUint16(offset, littleEndian) : null;
    case 0x86:
      return size >= 4 ? dataView.getUint32(offset, littleEndian) : null;
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
  if (offset + 5 > dataEnd) throw new Error('Invalid FIT file.');
  offset += 1;
  const architecture = dataView.getUint8(offset);
  const littleEndian = architecture === 0;
  offset += 1;
  const globalMessageNumber = dataView.getUint16(offset, littleEndian);
  offset += 2;
  const fieldCount = dataView.getUint8(offset);
  offset += 1;
  const fields: FitFieldDefinition[] = [];
  for (let index = 0; index < fieldCount; index += 1) {
    if (offset + 3 > dataEnd) throw new Error('Invalid FIT file.');
    fields.push({
      fieldNumber: dataView.getUint8(offset),
      size: dataView.getUint8(offset + 1),
      baseType: dataView.getUint8(offset + 2),
    });
    offset += 3;
  }
  const developerFieldSizes: number[] = [];
  if (hasDeveloperData) {
    if (offset + 1 > dataEnd) throw new Error('Invalid FIT file.');
    const developerFieldCount = dataView.getUint8(offset);
    offset += 1;
    for (let index = 0; index < developerFieldCount; index += 1) {
      if (offset + 3 > dataEnd) throw new Error('Invalid FIT file.');
      developerFieldSizes.push(dataView.getUint8(offset + 1));
      offset += 3;
    }
  }
  return { nextOffset: offset, definition: { littleEndian, globalMessageNumber, fields, developerFieldSizes } };
}

function detectFitManufacturer(binary: Uint8Array): number | null {
  if (binary.byteLength < 12) return null;
  const dataView = new DataView(binary.buffer, binary.byteOffset, binary.byteLength);
  const headerSize = dataView.getUint8(0);
  if (headerSize < 12 || binary.byteLength < headerSize) return null;
  if (String.fromCharCode(binary[8], binary[9], binary[10], binary[11]) !== '.FIT') return null;
  const dataSize = dataView.getUint32(4, true);
  const dataEnd = headerSize + dataSize;
  if (dataEnd > binary.byteLength) return null;
  const definitions: Array<FitMessageDefinition | null> = Array.from({ length: FIT_LOCAL_MESSAGE_TYPES }, () => null);
  let offset = headerSize;
  while (offset < dataEnd) {
    const recordHeader = dataView.getUint8(offset);
    offset += 1;
    if ((recordHeader & 0x80) !== 0) {
      const localMessageType = (recordHeader >> 5) & 0x03;
      const definition = definitions[localMessageType];
      if (!definition) return null;
      offset +=
        definition.fields.reduce((sum, field) => sum + field.size, 0) +
        definition.developerFieldSizes.reduce((sum, size) => sum + size, 0);
      continue;
    }
    const isDefinitionMessage = (recordHeader & 0x40) !== 0;
    const localMessageType = recordHeader & 0x0f;
    if (localMessageType >= FIT_LOCAL_MESSAGE_TYPES) return null;
    if (isDefinitionMessage) {
      const parsed = parseFitDefinitionMessage(dataView, offset, dataEnd, recordHeader);
      definitions[localMessageType] = parsed.definition;
      offset = parsed.nextOffset;
      continue;
    }
    const definition = definitions[localMessageType];
    if (!definition) return null;
    for (const field of definition.fields) {
      if (offset + field.size > dataEnd) return null;
      if (definition.globalMessageNumber === FIT_FILE_ID_MESSAGE_NUMBER && field.fieldNumber === 1) {
        return decodeFitFieldAsNumber(dataView, offset, field.size, field.baseType, definition.littleEndian);
      }
      offset += field.size;
    }
    offset += definition.developerFieldSizes.reduce((sum, size) => sum + size, 0);
  }
  return null;
}

function isGarminJson(parsed: JsonRecord): boolean {
  if (isRecord(parsed.Summary)) return true;
  return (
    'ActivityId' in parsed ||
    'SummaryId' in parsed ||
    'ActivityType' in parsed ||
    'StartTimeInSeconds' in parsed ||
    'Steps' in parsed ||
    'BodyBatteryEnd' in parsed
  );
}

function isSuuntoJson(parsed: JsonRecord): boolean {
  return isRecord(parsed.DeviceLog) || 'entryData' in parsed;
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function hasStravaProviderSignal(parsed: JsonRecord): boolean {
  return [parsed.provider, parsed.source, parsed.platform, parsed.uploaded_from]
    .map(readString)
    .some(value => value?.toLowerCase().includes('strava') ?? false);
}

function hasPolarProviderSignal(parsed: JsonRecord): boolean {
  return [parsed.provider, parsed.source, parsed.platform, parsed.uploaded_from, parsed.application]
    .map(value => (isRecord(value) ? value.name : value))
    .map(readString)
    .some(value => value?.toLowerCase().includes('polar') ?? false);
}

function hasFitbitProviderSignal(parsed: JsonRecord): boolean {
  return [parsed.provider, parsed.source, parsed.platform, parsed.uploaded_from]
    .map(value => (isRecord(value) ? value.name : value))
    .map(readString)
    .some(value => value?.toLowerCase().includes('fitbit') ?? false);
}

function hasOuraProviderSignal(parsed: JsonRecord): boolean {
  return [parsed.provider, parsed.source, parsed.platform, parsed.uploaded_from]
    .map(value => (isRecord(value) ? value.name : value))
    .map(readString)
    .some(value => value?.toLowerCase().includes('oura') ?? false);
}

function hasUltrahumanProviderSignal(parsed: JsonRecord): boolean {
  return [parsed.provider, parsed.source, parsed.platform, parsed.uploaded_from]
    .map(value => (isRecord(value) ? value.name : value))
    .map(readString)
    .some(value => value?.toLowerCase().includes('ultrahuman') ?? false);
}

function hasWhoopProviderSignal(parsed: JsonRecord): boolean {
  return [parsed.provider, parsed.source, parsed.platform, parsed.uploaded_from]
    .map(value => (isRecord(value) ? value.name : value))
    .map(readString)
    .some(value => value?.toLowerCase().includes('whoop') ?? false);
}

function hasAppleHealthProviderSignal(parsed: JsonRecord): boolean {
  return [parsed.provider, parsed.source, parsed.platform, parsed.uploaded_from, parsed.sourceRevision]
    .map(value => (isRecord(value) ? value.name : value))
    .map(readString)
    .some(value => {
      const lower = value?.toLowerCase() ?? '';
      return lower.includes('apple') || lower.includes('healthkit');
    });
}

function hasCorosProviderSignal(parsed: JsonRecord): boolean {
  return [parsed.provider, parsed.source, parsed.platform, parsed.uploaded_from, parsed.application]
    .map(value => (isRecord(value) ? value.name : value))
    .map(readString)
    .some(value => value?.toLowerCase().includes('coros') ?? false);
}

function isCorosJson(parsed: JsonRecord): boolean {
  if (hasCorosProviderSignal(parsed)) return true;
  if ('training_load' in parsed || 'aerobic_te' in parsed || 'anaerobic_te' in parsed) return true;
  if ('activityType' in parsed && ('samples' in parsed || 'laps' in parsed || 'route' in parsed)) return true;
  if ('heart_rate_zones' in parsed && ('sport' in parsed || 'mode' in parsed || 'activity_type' in parsed)) return true;
  const workout = isRecord(parsed.workout) ? parsed.workout : null;
  return workout != null && hasCorosProviderSignal({ ...parsed, ...workout });
}

function isFitbitJson(parsed: JsonRecord): boolean {
  if (hasFitbitProviderSignal(parsed)) return true;
  if ('logId' in parsed && ('activityTypeId' in parsed || 'activityName' in parsed)) return true;
  if ('tcxLink' in parsed || 'activeZoneMinutes' in parsed || 'workoutSummary' in parsed) return true;
  if ('heartRateZones' in parsed && ('logType' in parsed || 'source' in parsed)) return true;
  if (Array.isArray(parsed.activities)) {
    return parsed.activities.some(
      activity => isRecord(activity) && ('logId' in activity || 'activityTypeId' in activity),
    );
  }
  return false;
}

function isOuraJson(parsed: JsonRecord): boolean {
  if (hasOuraProviderSignal(parsed)) return true;
  if ('activity' in parsed && ('start_datetime' in parsed || 'end_datetime' in parsed || 'intensity' in parsed))
    return true;
  if (
    'daily_activity' in parsed ||
    'readiness' in parsed ||
    'sleep' in parsed ||
    'spo2' in parsed ||
    'sessions' in parsed
  )
    return true;
  if (Array.isArray(parsed.data)) {
    return parsed.data.some(
      item => isRecord(item) && ('activity' in item || 'bedtime_start' in item || 'total_sleep_duration' in item),
    );
  }
  return false;
}

function isUltrahumanJson(parsed: JsonRecord): boolean {
  if (hasUltrahumanProviderSignal(parsed)) return true;
  if ('movement_index' in parsed || 'recovery_index' in parsed || 'metabolic_score' in parsed) return true;
  if ('glucose' in parsed || 'cgm' in parsed || 'vo2_max' in parsed) return true;
  if ('movement' in parsed && ('heart_rate' in parsed || 'recovery' in parsed || 'vo2_max' in parsed)) return true;
  const metricData = isRecord(parsed.data) && Array.isArray(parsed.data.metric_data) ? parsed.data.metric_data : [];
  return metricData.some(metric => {
    if (!isRecord(metric)) return false;
    const type = readString(metric.type)?.toLowerCase();
    return (
      type === 'sleep' ||
      type === 'steps' ||
      type === 'movement_index' ||
      type === 'recovery_index' ||
      type === 'metabolic_score' ||
      type === 'glucose' ||
      type === 'average_glucose' ||
      type === 'glucose_variability'
    );
  });
}

function isWhoopJson(parsed: JsonRecord): boolean {
  if (hasWhoopProviderSignal(parsed)) return true;
  if ('sport_name' in parsed && ('score_state' in parsed || 'score' in parsed || 'start' in parsed)) return true;
  if ('cycle_id' in parsed || 'stage_summary' in parsed || 'sleep_needed' in parsed) return true;
  if ('recovery_score' in parsed || 'hrv_rmssd_milli' in parsed) return true;
  if (isRecord(parsed.score)) {
    return 'strain' in parsed.score || 'zone_durations' in parsed.score || 'recovery_score' in parsed.score;
  }
  return ['records', 'data', 'workouts', 'sleeps', 'recoveries', 'cycles'].some(key => {
    const value = parsed[key];
    if (!Array.isArray(value) || !isRecord(value[0])) return false;
    return isWhoopJson(value[0]);
  });
}

function isAppleHealthJson(parsed: JsonRecord): boolean {
  if (hasAppleHealthProviderSignal(parsed)) return true;
  if ('workoutActivityType' in parsed || 'sourceRevision' in parsed) return true;
  if (readString(parsed.type)?.startsWith('HKWorkoutActivityType')) return true;
  const data = isRecord(parsed.data) ? parsed.data : {};
  if (Array.isArray(data.workouts) || Array.isArray(data.records) || Array.isArray(data.sleep)) return true;
  if (Array.isArray(parsed.workouts)) {
    return parsed.workouts.some(
      workout => isRecord(workout) && ('workoutActivityType' in workout || 'type' in workout),
    );
  }
  return false;
}

function isPolarJson(parsed: JsonRecord): boolean {
  if (hasPolarProviderSignal(parsed)) return true;
  if ('polar_user' in parsed || 'start_time_utc_offset' in parsed || 'detailed_sport_info' in parsed) return true;
  if ('training_load_pro' in parsed || 'heart_rate_zones' in parsed) return true;
  if ('durationMillis' in parsed || 'trainingLoadReport' in parsed) return true;
  if (Array.isArray(parsed.exercises) && ('sport' in parsed || 'product' in parsed || 'application' in parsed))
    return true;
  if (isRecord(parsed.product) && readString(parsed.product.modelName)?.toLowerCase().includes('polar')) return true;
  return false;
}

function isStravaJson(parsed: JsonRecord): boolean {
  if (hasStravaProviderSignal(parsed)) return true;
  return (
    'upload_id' in parsed ||
    'upload_id_str' in parsed ||
    'suffer_score' in parsed ||
    'splits_metric' in parsed ||
    'segment_efforts' in parsed ||
    (isRecord(parsed.map) && ('summary_polyline' in parsed.map || 'polyline' in parsed.map)) ||
    ('streams' in parsed && ('sport_type' in parsed || 'type' in parsed))
  );
}

export function parseActivityFileToCanonical(
  content: string | Uint8Array,
  filename: string,
  options?: ParseActivityFileOptions,
): CanonicalActivity {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.fit')) {
    if (typeof content === 'string') throw new Error('Invalid FIT file.');
    const manufacturer = detectFitManufacturer(content);
    if (lower.includes('coros')) {
      return parseCorosActivityFileToCanonical(content, filename, options);
    }
    if (lower.includes('polar')) {
      return parsePolarActivityFileToCanonical(content, filename, options);
    }
    if (manufacturer === GARMIN_MANUFACTURER_ID || lower.includes('garmin')) {
      return parseGarminActivityFileToCanonical(content, filename, options);
    }
    return parseSuuntoActivityFileToCanonical(content, filename, options);
  }
  if (lower.endsWith('.json')) {
    if (typeof content !== 'string') throw new Error('Invalid JSON file.');
    const parsed = JSON.parse(content) as unknown;
    if (!isRecord(parsed)) throw new Error('Invalid JSON file.');
    if (lower.includes('apple_health') || lower.includes('apple-health') || isAppleHealthJson(parsed))
      return parseAppleHealthActivityJsonToCanonical(content, filename, options);
    if (lower.includes('coros') || isCorosJson(parsed))
      return parseCorosActivityFileToCanonical(content, filename, options);
    if (lower.includes('whoop') || isWhoopJson(parsed))
      return parseWhoopActivityJsonToCanonical(content, filename, options);
    if (lower.includes('ultrahuman') || isUltrahumanJson(parsed))
      return parseUltrahumanActivityJsonToCanonical(content, filename, options);
    if (lower.includes('oura') || isOuraJson(parsed))
      return parseOuraActivityJsonToCanonical(content, filename, options);
    if (lower.includes('fitbit') || isFitbitJson(parsed))
      return parseFitbitActivityJsonToCanonical(content, filename, options);
    if (lower.includes('polar') || isPolarJson(parsed))
      return parsePolarActivityFileToCanonical(content, filename, options);
    if (lower.includes('strava') || isStravaJson(parsed))
      return parseStravaActivityJsonToCanonical(content, filename, options);
    if (lower.includes('garmin') || isGarminJson(parsed))
      return parseGarminActivityFileToCanonical(content, filename, options);
    if (lower.includes('suunto') || isSuuntoJson(parsed))
      return parseSuuntoActivityFileToCanonical(content, filename, options);
    return parseGenericActivityJsonToCanonical(content, filename);
  }
  return buildEmptyGenericActivity();
}
