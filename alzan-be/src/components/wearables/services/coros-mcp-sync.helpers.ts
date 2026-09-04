type JsonRecord = Record<string, unknown>;

export type CorosMcpToolShape = {
  name: string;
  inputSchema?: Record<string, unknown>;
};

export type CorosMcpActivityPage = {
  records: JsonRecord[];
  nextCursor: string | null;
  hasMore: boolean;
};

export type CorosMcpDateWindow = {
  startDate: string;
  endDate: string;
};

export function buildCorosMcpDateWindows(start: Date, end: Date, maxWindowDays: number): CorosMcpDateWindow[] {
  if (!Number.isInteger(maxWindowDays) || maxWindowDays < 1) throw new Error('COROS_MCP_INVALID_WINDOW_SIZE');
  const normalizedStart = startOfUtcDay(start);
  const normalizedEnd = startOfUtcDay(end);
  if (normalizedStart.getTime() > normalizedEnd.getTime()) return [];

  const windows: CorosMcpDateWindow[] = [];
  let cursor = normalizedStart;
  while (cursor.getTime() <= normalizedEnd.getTime()) {
    const requestedEnd = new Date(cursor.getTime() + (maxWindowDays - 1) * MS_PER_DAY);
    const windowEnd = requestedEnd.getTime() < normalizedEnd.getTime() ? requestedEnd : normalizedEnd;
    windows.push({ startDate: formatDate(cursor), endDate: formatDate(windowEnd) });
    cursor = new Date(windowEnd.getTime() + MS_PER_DAY);
  }
  return windows;
}

export function extractCorosMcpRecords(value: unknown): JsonRecord[] {
  const unwrapped = unwrapMcpValue(value);
  if (Array.isArray(unwrapped)) return unwrapped.filter(isRecord);
  if (!isRecord(unwrapped)) return [];
  for (const key of ['activities', 'sportRecords', 'sportDataList', 'records', 'workouts', 'data']) {
    const values = unwrapped[key];
    if (Array.isArray(values)) return values.filter(isRecord);
  }
  return isActivityRecord(unwrapped) ? [unwrapped] : [];
}

export function uniqueCorosMcpRecords(values: JsonRecord[]): JsonRecord[] {
  const recordsById = new Map<string, JsonRecord>();
  for (const record of values) {
    const id = readActivityId(record);
    if (!id) continue;
    if (!recordsById.has(id)) recordsById.set(id, record);
  }
  return [...recordsById.values()].sort((left, right) => readStartMs(right) - readStartMs(left));
}

export function buildCorosMcpToolArguments(
  tool: CorosMcpToolShape,
  values: { startDate?: string; endDate?: string; activityId?: string; cursor?: string | null },
): JsonRecord {
  const properties = readProperties(tool.inputSchema);
  const result: JsonRecord = {};
  assignToolValue(
    result,
    properties,
    ['startDate', 'start_date', 'fromDate', 'from_date', 'startTime', 'start_time'],
    values.startDate,
  );
  assignToolValue(
    result,
    properties,
    ['endDate', 'end_date', 'toDate', 'to_date', 'endTime', 'end_time'],
    values.endDate,
  );
  assignToolValue(
    result,
    properties,
    ['activityId', 'activity_id', 'labelId', 'label_id', 'workoutId', 'workout_id', 'id'],
    values.activityId,
  );
  assignToolValue(
    result,
    properties,
    ['cursor', 'pageToken', 'page_token', 'nextCursor', 'next_cursor'],
    values.cursor,
  );
  if (properties.length === 0) {
    if (values.startDate !== undefined) result.startDate = values.startDate;
    if (values.endDate !== undefined) result.endDate = values.endDate;
    if (values.activityId !== undefined) result.activityId = values.activityId;
    if (values.cursor) result.cursor = values.cursor;
  }
  return result;
}

export function extractCorosMcpActivityPage(value: unknown): CorosMcpActivityPage {
  const unwrapped = unwrapMcpValue(value);
  const record = isRecord(unwrapped) ? unwrapped : null;
  const records = extractCorosMcpRecords(unwrapped);
  if (!record) return { records, nextCursor: null, hasMore: false };
  const nextCursor = readStringFromKeys(record, [
    'nextCursor',
    'next_cursor',
    'nextPageToken',
    'next_page_token',
    'cursor',
  ]);
  const hasMore =
    readBooleanFromKeys(record, ['hasMore', 'has_more', 'hasNextPage', 'has_next_page']) || nextCursor !== null;
  return { records, nextCursor, hasMore };
}

export function mergeCorosMcpActivityPayload(summary: JsonRecord, detail: unknown, laps: unknown): JsonRecord {
  const summaryId = readActivityId(summary);
  const detailRecord = detail ? unwrapMcpValue(detail) : null;
  const lapRecord = laps ? unwrapMcpValue(laps) : null;
  const merged: JsonRecord = {
    ...summary,
    ...(isRecord(detailRecord) ? detailRecord : {}),
  };
  if (summaryId && !readActivityId(merged)) merged.activityId = summaryId;
  if (isRecord(lapRecord)) {
    merged.laps = lapRecord.laps ?? lapRecord.lapList ?? lapRecord.records ?? lapRecord;
  }
  return merged;
}

export function extractCorosMcpFitBytes(value: unknown): Uint8Array | null {
  return extractCorosMcpFitByteArrays(value)[0] ?? null;
}

export function extractCorosMcpFitByteArrays(value: unknown): Uint8Array[] {
  const unwrapped = unwrapMcpValue(value);
  if (Array.isArray(unwrapped) && !unwrapped.every(item => typeof item === 'number')) {
    return unwrapped.flatMap(item => extractCorosMcpFitByteArrays(item));
  }
  const candidate = findFitCandidate(unwrapped);
  if (candidate instanceof Uint8Array) return candidate.length > 0 ? [candidate] : [];
  if (Array.isArray(candidate) && candidate.every(item => typeof item === 'number' && Number.isInteger(item))) {
    return [Uint8Array.from(candidate as number[])];
  }
  if (typeof candidate !== 'string') return [];
  if (/^https:\/\//i.test(candidate.trim())) return [];
  const base64 = candidate.startsWith('data:') ? candidate.slice(candidate.indexOf(',') + 1) : candidate;
  try {
    const bytes = Uint8Array.from(Buffer.from(base64, 'base64'));
    return bytes.length > 0 ? [bytes] : [];
  } catch {
    return [];
  }
}

export function extractCorosMcpFitUrls(value: unknown): string[] {
  const urls = new Set<string>();
  collectFitUrls(unwrapMcpValue(value), urls);
  return [...urls];
}

export function readActivityId(record: JsonRecord): string | null {
  for (const key of ['activityId', 'activity_id', 'labelId', 'label_id', 'workoutId', 'workout_id', 'id']) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) return String(Math.round(value));
  }
  return null;
}

function unwrapMcpValue(value: unknown): unknown {
  if (!isRecord(value)) return value;
  if ('result' in value) return unwrapMcpValue(value.result);
  if (Array.isArray(value.content)) {
    const textItem = value.content.find(
      (item): item is JsonRecord => isRecord(item) && item.type === 'text' && typeof item.text === 'string',
    );
    if (textItem && typeof textItem.text === 'string') {
      try {
        return JSON.parse(textItem.text) as unknown;
      } catch {
        return value;
      }
    }
  }
  return value;
}

function readProperties(inputSchema: Record<string, unknown> | undefined): string[] {
  if (!isRecord(inputSchema?.properties)) return [];
  return Object.keys(inputSchema.properties);
}

function assignToolValue(
  target: JsonRecord,
  properties: string[],
  aliases: string[],
  value: string | undefined | null,
): void {
  if (value === undefined || value === null) return;
  const property = aliases.find(alias => properties.includes(alias));
  if (property) target[property] = value;
}

function readStringFromKeys(record: JsonRecord, keys: string[]): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

function readBooleanFromKeys(record: JsonRecord, keys: string[]): boolean {
  return keys.some(key => record[key] === true);
}

function findFitCandidate(value: unknown): unknown {
  if (value instanceof Uint8Array || typeof value === 'string') return value;
  if (Array.isArray(value)) {
    if (value.every(item => typeof item === 'number')) return value;
    for (const item of value) {
      const candidate = findFitCandidate(item);
      if (candidate !== null) return candidate;
    }
    return null;
  }
  if (!isRecord(value)) return null;
  for (const key of ['fitFile', 'fit_file', 'fitBytes', 'fit_bytes', 'file', 'data', 'blob']) {
    const candidate = value[key];
    if (candidate instanceof Uint8Array || typeof candidate === 'string' || Array.isArray(candidate)) return candidate;
  }
  for (const key of ['resource', 'contents', 'content', 'result']) {
    const candidate = findFitCandidate(value[key]);
    if (candidate !== null) return candidate;
  }
  return null;
}

function collectFitUrls(value: unknown, urls: Set<string>): void {
  if (typeof value === 'string') {
    if (/^https:\/\//i.test(value.trim())) urls.add(value.trim());
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectFitUrls(item, urls);
    return;
  }
  if (!isRecord(value)) return;
  for (const key of [
    'fitUrl',
    'fit_url',
    'fitUrls',
    'fit_urls',
    'downloadUrl',
    'download_url',
    'urls',
    'url',
    'href',
    'uri',
  ]) {
    const candidate = value[key];
    if (typeof candidate === 'string' && /^https:\/\//i.test(candidate.trim())) urls.add(candidate.trim());
    if (Array.isArray(candidate)) collectFitUrls(candidate, urls);
  }
  for (const key of ['resource', 'contents', 'content', 'result', 'data']) collectFitUrls(value[key], urls);
}

function isActivityRecord(value: JsonRecord): boolean {
  return readActivityId(value) != null;
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readStartMs(record: JsonRecord): number {
  for (const key of ['startTime', 'start_time', 'startedAt', 'started_at', 'startDate', 'start_date', 'date']) {
    const value = record[key];
    if (typeof value === 'number' && Number.isFinite(value)) return normaliseEpochMs(value);
    if (typeof value === 'string' && value.trim()) {
      const numeric = Number(value);
      if (Number.isFinite(numeric) && /^\d+(?:\.\d+)?$/.test(value.trim())) return normaliseEpochMs(numeric);
      const parsed = Date.parse(value);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return 0;
}

function normaliseEpochMs(value: number): number {
  return value < 100_000_000_000 ? value * 1000 : value;
}

function startOfUtcDay(value: Date): Date {
  if (!Number.isFinite(value.getTime())) throw new Error('COROS_MCP_INVALID_DATE');
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

function formatDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;
