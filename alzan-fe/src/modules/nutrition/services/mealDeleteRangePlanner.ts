import { addDays, addYears, format, isAfter, isBefore, startOfDay } from 'date-fns';

export type MealDeleteRangeBounds = {
  minimumDate: Date;
  maximumDate: Date;
};

export type MealDeleteDateRange = {
  start: Date;
  end: Date;
};

export type MealDeleteIsoRange = {
  start: string;
  end: string;
};

const toDay = (date: Date): Date => startOfDay(date);

export const getFutureMealDeleteRangeBounds = (now: Date = new Date()): MealDeleteRangeBounds => {
  const today = toDay(now);
  return {
    minimumDate: addDays(today, 1),
    maximumDate: addYears(today, 1),
  };
};

export const getDefaultFutureMealDeleteRange = (now: Date = new Date()): MealDeleteDateRange => {
  const { minimumDate } = getFutureMealDeleteRangeBounds(now);
  return {
    start: minimumDate,
    end: addDays(minimumDate, 6),
  };
};

export const buildFutureMealDeleteRange = (start: Date, end: Date, now: Date = new Date()): MealDeleteIsoRange => {
  const { minimumDate, maximumDate } = getFutureMealDeleteRangeBounds(now);
  const normalizedStart = toDay(start);
  const normalizedEnd = toDay(end);

  if (isBefore(normalizedStart, minimumDate)) {
    throw new Error('The future delete range must start tomorrow or later');
  }

  if (isAfter(normalizedStart, maximumDate) || isAfter(normalizedEnd, maximumDate)) {
    throw new Error('The future delete range cannot be more than one year ahead');
  }

  if (isBefore(normalizedEnd, normalizedStart)) {
    throw new Error('The future delete range end must be on or after the start');
  }

  return {
    start: format(normalizedStart, 'yyyy-MM-dd'),
    end: format(normalizedEnd, 'yyyy-MM-dd'),
  };
};
