import { differenceInCalendarDays, format, subDays } from 'date-fns';

export const SETTINGS_PDF_EXPORT_RANGE_STORAGE_KEY = '@alzan_settings_pdf_export_range';
export const SETTINGS_PDF_EXPORT_MAX_RANGE_DAYS = 92;

export type SettingsPdfExportRange = {
  startDate: Date;
  endDate: Date;
};

export type SettingsPdfExportRangeError = { type: 'inverted' } | { type: 'tooLong'; minStartDate: Date } | null;

export type SettingsPdfExportRangeStorage = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
};

type PersistedSettingsPdfExportRange = {
  startDate: string;
  endDate: string;
};

export const formatSettingsPdfExportDate = (date: Date): string => format(date, 'yyyy-MM-dd');

export const parseSettingsPdfExportDateInput = (value: string): Date | null => {
  const normalized = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return null;

  const parsed = new Date(`${normalized}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return null;

  return formatSettingsPdfExportDate(parsed) === normalized ? parsed : null;
};

export const getDefaultSettingsPdfExportRange = (now = new Date()): SettingsPdfExportRange => ({
  startDate: subDays(now, 7),
  endDate: now,
});

export const getSettingsPdfExportMinStartDate = (endDate: Date): Date =>
  subDays(endDate, SETTINGS_PDF_EXPORT_MAX_RANGE_DAYS);

export const getSettingsPdfExportRangeError = ({
  startDate,
  endDate,
}: SettingsPdfExportRange): SettingsPdfExportRangeError => {
  const rangeDays = differenceInCalendarDays(endDate, startDate);
  if (rangeDays < 0) return { type: 'inverted' };
  if (rangeDays > SETTINGS_PDF_EXPORT_MAX_RANGE_DAYS) {
    return { type: 'tooLong', minStartDate: getSettingsPdfExportMinStartDate(endDate) };
  }
  return null;
};

const isPersistedSettingsPdfExportRange = (value: unknown): value is PersistedSettingsPdfExportRange => {
  if (typeof value !== 'object' || value === null) return false;
  if (!('startDate' in value) || !('endDate' in value)) return false;
  return typeof value.startDate === 'string' && typeof value.endDate === 'string';
};

export const saveSettingsPdfExportRange = async (
  storage: SettingsPdfExportRangeStorage,
  range: SettingsPdfExportRange,
) => {
  const payload: PersistedSettingsPdfExportRange = {
    startDate: formatSettingsPdfExportDate(range.startDate),
    endDate: formatSettingsPdfExportDate(range.endDate),
  };

  await storage.setItem(SETTINGS_PDF_EXPORT_RANGE_STORAGE_KEY, JSON.stringify(payload));
};

export const loadSettingsPdfExportRange = async (
  storage: SettingsPdfExportRangeStorage,
  now = new Date(),
): Promise<SettingsPdfExportRange> => {
  const fallback = getDefaultSettingsPdfExportRange(now);

  try {
    const raw = await storage.getItem(SETTINGS_PDF_EXPORT_RANGE_STORAGE_KEY);
    if (!raw) return fallback;

    const payload: unknown = JSON.parse(raw);
    if (!isPersistedSettingsPdfExportRange(payload)) return fallback;

    const startDate = parseSettingsPdfExportDateInput(payload.startDate);
    const endDate = parseSettingsPdfExportDateInput(payload.endDate);
    if (!startDate || !endDate) return fallback;

    const savedRange = { startDate, endDate };
    if (getSettingsPdfExportRangeError(savedRange)) return fallback;

    return savedRange;
  } catch {
    return fallback;
  }
};
