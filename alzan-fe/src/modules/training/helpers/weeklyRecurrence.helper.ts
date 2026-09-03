import { addDays, format, parseISO } from 'date-fns';

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const isWeekday = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 6;

export const isValidDateOnly = (value: unknown): value is string => {
  if (typeof value !== 'string' || !ISO_DATE_PATTERN.test(value)) return false;

  const parsed = parseISO(value);
  return !Number.isNaN(parsed.getTime()) && format(parsed, 'yyyy-MM-dd') === value;
};

const dateAtStartOfDay = (date: Date): Date => {
  const normalized = new Date(date);
  normalized.setHours(0, 0, 0, 0);
  return normalized;
};

export const getNextWeeklyOccurrence = (fromDate: Date, weekday: number | null | undefined): string | null => {
  if (!isWeekday(weekday) || Number.isNaN(fromDate.getTime())) return null;

  const normalizedFromDate = dateAtStartOfDay(fromDate);
  const daysUntilTarget = (weekday - normalizedFromDate.getDay() + 7) % 7;
  return format(addDays(normalizedFromDate, daysUntilTarget), 'yyyy-MM-dd');
};

export const getFirstWeeklyOccurrenceOnOrAfter = (
  startDate: string | null | undefined,
  weekday: number | null | undefined,
): string | null => {
  if (!isValidDateOnly(startDate) || !isWeekday(weekday)) return null;
  return getNextWeeklyOccurrence(parseISO(`${startDate}T00:00:00`), weekday);
};

export const calculateWeeklyEndDate = (
  startDate: string | null | undefined,
  weekday: number | null | undefined,
  weeks: number | null | undefined,
): string | null => {
  const normalizedStart = getFirstWeeklyOccurrenceOnOrAfter(startDate, weekday);
  if (!normalizedStart || typeof weeks !== 'number' || !Number.isInteger(weeks) || weeks < 1) return null;

  return format(addDays(parseISO(`${normalizedStart}T00:00:00`), (weeks - 1) * 7), 'yyyy-MM-dd');
};

export const parsePositiveWholeWeeks = (value: unknown): number | null => {
  if (typeof value === 'number') return Number.isInteger(value) && value >= 1 ? value : null;
  if (typeof value !== 'string' || !/^\d+$/.test(value.trim())) return null;

  const weeks = Number(value);
  return Number.isSafeInteger(weeks) && weeks >= 1 ? weeks : null;
};
