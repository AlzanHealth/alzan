import { CanonicalActivity } from './activity-import-canonical.types';
import { buildEmptyGenericActivity, parseGenericActivityJsonToCanonical } from './generic-activity-canonical.mapper';
import { parseGarminActivityFileToCanonical } from './garmin-activity-canonical.mapper';
import { parseSuuntoActivityFileToCanonical } from './suunto-activity-canonical.mapper';

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

export function parseActivityFileToCanonical(
  content: string | Uint8Array,
  filename: string,
  options?: ParseActivityFileOptions,
): CanonicalActivity {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.fit')) {
    if (typeof content === 'string') throw new Error('Invalid FIT file.');
    const manufacturer = detectFitManufacturer(content);
    if (manufacturer === GARMIN_MANUFACTURER_ID || lower.includes('garmin')) {
      return parseGarminActivityFileToCanonical(content, filename, options);
    }
    return parseSuuntoActivityFileToCanonical(content, filename, options);
  }
  if (lower.endsWith('.json')) {
    if (typeof content !== 'string') throw new Error('Invalid JSON file.');
    const parsed = JSON.parse(content) as unknown;
    if (!isRecord(parsed)) throw new Error('Invalid JSON file.');
    if (lower.includes('garmin') || isGarminJson(parsed))
      return parseGarminActivityFileToCanonical(content, filename, options);
    if (lower.includes('suunto') || isSuuntoJson(parsed))
      return parseSuuntoActivityFileToCanonical(content, filename, options);
    return parseGenericActivityJsonToCanonical(content, filename);
  }
  return buildEmptyGenericActivity();
}
