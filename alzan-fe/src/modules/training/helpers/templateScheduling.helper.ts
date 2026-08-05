import { addDays, format, isSameWeek, isValid, parseISO, startOfWeek } from 'date-fns';

export const isScheduledWeekday = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 6;

export const isValidIsoDate = (value: unknown): value is string => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  return isValid(parseISO(value));
};

export const resolveOneOffDate = (isRecurring: boolean, date: string | null | undefined): string | null =>
  !isRecurring && isValidIsoDate(date) ? date : null;

export const shouldShowScheduleDays = ({
  isRecurring,
  isImportedDateDriven,
}: {
  isRecurring: boolean;
  isImportedDateDriven: boolean;
}): boolean => !isImportedDateDriven || isRecurring;

export const hasValidRecurringDay = (isRecurring: boolean, selectedDays: number[]): boolean =>
  !isRecurring || (selectedDays.length === 1 && isScheduledWeekday(selectedDays[0]));

const weekStartsOnMonday = { weekStartsOn: 1 as const };

export const getCurrentWeekDateForWeekday = (weekday: number, referenceDate: Date = new Date()): string | null => {
  if (!isScheduledWeekday(weekday)) return null;
  const mondayOffset = weekday === 0 ? 6 : weekday - 1;
  return format(addDays(startOfWeek(referenceDate, weekStartsOnMonday), mondayOffset), 'yyyy-MM-dd');
};

export const getCurrentWeekdayForDate = (
  date: string | null | undefined,
  referenceDate: Date = new Date(),
): number | null => {
  if (!isValidIsoDate(date)) return null;
  const parsedDate = parseISO(date);
  return isSameWeek(parsedDate, referenceDate, weekStartsOnMonday) ? parsedDate.getDay() : null;
};
