import { isValid, parseISO } from 'date-fns';

export const isScheduledWeekday = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 6;

export const isValidIsoDate = (value: unknown): value is string => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  return isValid(parseISO(value));
};

export const resolveOneOffDate = (isRecurring: boolean, date: string | null | undefined): string | null =>
  !isRecurring && isValidIsoDate(date) ? date : null;
