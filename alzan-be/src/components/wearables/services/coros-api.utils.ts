type JsonRecord = Record<string, unknown>;

const COROS_MAX_WINDOW_DAYS = 30;
const DEFAULT_MAX_FIT_BYTES = 25 * 1024 * 1024;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const COROS_WEBHOOK_MAX_ATTEMPTS = 10;
const COROS_WEBHOOK_MAX_BACKOFF_MINUTES = 60;

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

export interface CorosRecordPage {
  records: JsonRecord[];
  nextPage: number | null;
}

function readPositiveInteger(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN;
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function readPagination(payload: unknown): number | null {
  if (!isRecord(payload)) return null;
  const containers = [payload, isRecord(payload.data) ? payload.data : null].filter(isRecord);
  for (const container of containers) {
    const explicitNext = readPositiveInteger(
      container.nextPage ?? container.next_page ?? container.next_page_no ?? container.nextPageNo,
    );
    if (explicitNext) return explicitNext;
    const hasMore = container.hasMore ?? container.has_more ?? container.more;
    if (hasMore === true) {
      const currentPage = readPositiveInteger(container.page ?? container.pageNo ?? container.page_no) ?? 1;
      return currentPage + 1;
    }
    const currentPage = readPositiveInteger(container.page ?? container.pageNo ?? container.page_no);
    const totalPages = readPositiveInteger(container.totalPage ?? container.total_page ?? container.totalPages);
    if (currentPage && totalPages && currentPage < totalPages) return currentPage + 1;
  }
  return null;
}

function extractRecordPage(payload: unknown, keys: string[]): CorosRecordPage {
  return { records: extractRecords(payload, keys), nextPage: readPagination(payload) };
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
  return extractCorosWorkoutPage(payload).records;
}

export function extractCorosWorkoutPage(payload: unknown): CorosRecordPage {
  return extractRecordPage(payload, ['sportDataList', 'workouts', 'data', 'result']);
}

export function extractCorosDailyRecords(payload: unknown): JsonRecord[] {
  return extractCorosDailyPage(payload).records;
}

export function extractCorosDailyPage(payload: unknown): CorosRecordPage {
  return extractRecordPage(payload, ['dailyList', 'dailyDataList', 'daily', 'data', 'result']);
}

export function assertCorosApiSuccess(payload: unknown): void {
  if (!isRecord(payload) || payload.result == null) return;
  const result = String(payload.result);
  if (result !== '0000') throw new Error(`COROS_API_ERROR_${result}`);
}

export function extractCorosFitUrls(payload: unknown): string[] {
  assertCorosApiSuccess(payload);
  const value = isRecord(payload) && isRecord(payload.data) ? payload.data : payload;
  if (!isRecord(value)) return [];
  const urls: string[] = [];
  const rootUrl = typeof value.fitUrl === 'string' ? value.fitUrl.trim() : '';
  if (rootUrl) urls.push(rootUrl);
  if (Array.isArray(value.triathlonItemList)) {
    for (const item of value.triathlonItemList) {
      if (!isRecord(item) || typeof item.fitUrl !== 'string') continue;
      const itemUrl = item.fitUrl.trim();
      if (itemUrl) urls.push(itemUrl);
    }
  }
  return [...new Set(urls)];
}

export function getCorosWebhookFailureState(
  previousAttempts: number,
  now = new Date(),
): { attempts: number; isDeadLetter: boolean; nextAttemptAt: string | null } {
  const attempts = Math.max(0, previousAttempts) + 1;
  if (attempts >= COROS_WEBHOOK_MAX_ATTEMPTS) return { attempts, isDeadLetter: true, nextAttemptAt: null };
  const delayMinutes = Math.min(2 ** (attempts - 1), COROS_WEBHOOK_MAX_BACKOFF_MINUTES);
  return {
    attempts,
    isDeadLetter: false,
    nextAttemptAt: new Date(now.getTime() + delayMinutes * 60_000).toISOString(),
  };
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
