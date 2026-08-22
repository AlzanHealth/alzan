type JsonRecord = Record<string, unknown>;

const COROS_MAX_WINDOW_DAYS = 30;
const DEFAULT_MAX_FIT_BYTES = 25 * 1024 * 1024;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function records(value: unknown): JsonRecord[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function extractRecords(payload: unknown, keys: string[]): JsonRecord[] {
  if (Array.isArray(payload)) return records(payload);
  if (!isRecord(payload)) return [];
  for (const key of keys) {
    const values = records(payload[key]);
    if (values.length > 0 || Array.isArray(payload[key])) return values;
  }
  if (isRecord(payload.data)) return extractRecords(payload.data, keys);
  return [];
}

function formatCorosDate(date: Date): string {
  return date.toISOString().slice(0, 10).replace(/-/g, '');
}

export function buildCorosDateWindows(start: Date, end: Date): Array<{ startDate: string; endDate: string }> {
  const normalizedStart = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()));
  const normalizedEnd = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate()));
  if (normalizedStart.getTime() > normalizedEnd.getTime()) return [];

  const windows: Array<{ startDate: string; endDate: string }> = [];
  let cursor = normalizedStart;
  while (cursor.getTime() <= normalizedEnd.getTime()) {
    const requestedEnd = new Date(cursor.getTime() + (COROS_MAX_WINDOW_DAYS - 1) * MS_PER_DAY);
    const windowEnd = requestedEnd.getTime() < normalizedEnd.getTime() ? requestedEnd : normalizedEnd;
    windows.push({ startDate: formatCorosDate(cursor), endDate: formatCorosDate(windowEnd) });
    cursor = new Date(windowEnd.getTime() + MS_PER_DAY);
  }
  return windows;
}

export function extractCorosWorkoutRecords(payload: unknown): JsonRecord[] {
  return extractRecords(payload, ['sportDataList', 'workouts', 'data', 'result']);
}

export function extractCorosDailyRecords(payload: unknown): JsonRecord[] {
  return extractRecords(payload, ['dailyDataList', 'daily', 'data', 'result']);
}

export function assertCorosFitBytes(bytes: Uint8Array, maxBytes = DEFAULT_MAX_FIT_BYTES): void {
  if (bytes.byteLength > maxBytes) throw new Error('COROS_FIT_FILE_TOO_LARGE');
  if (bytes.byteLength < 12) throw new Error('COROS_FIT_FILE_INVALID');
  const headerSize = bytes[0];
  const signature = String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]);
  if (headerSize < 12 || headerSize > bytes.byteLength || signature !== '.FIT') {
    throw new Error('COROS_FIT_FILE_INVALID');
  }
}

export function assertCorosWebhookPayloadSize(payload: unknown, maxBytes: number): void {
  if (Buffer.byteLength(JSON.stringify(payload), 'utf8') > maxBytes) {
    throw new Error('COROS_WEBHOOK_PAYLOAD_TOO_LARGE');
  }
}
