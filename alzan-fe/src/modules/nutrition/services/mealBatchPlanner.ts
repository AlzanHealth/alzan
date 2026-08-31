import { addDays, differenceInCalendarDays, format, isValid, parseISO } from 'date-fns';
import type { MealType } from '../../../types/requests.types';

export const MAX_MEAL_RANGE_DAYS = 30;

export type MealBatchSource = {
  id: string;
  date: string;
  meal_type: MealType;
};

export type MealRange = {
  startDate: string;
  endDate: string;
};

export type MealTransferPlanItem = {
  logId: string;
  source: MealBatchSource;
  destination: {
    date: string;
    mealType: MealType;
  };
};

const parseMealDate = (date: string): Date => {
  const parsed = parseISO(date);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !isValid(parsed)) throw new Error('Invalid meal date');
  return parsed;
};

export const getInclusiveMealRangeDays = (range: MealRange): number => {
  const start = parseMealDate(range.startDate);
  const end = parseMealDate(range.endDate);
  const days = differenceInCalendarDays(end, start) + 1;

  if (days < 1) throw new Error('Range start must be before or equal to the end date');
  if (days > MAX_MEAL_RANGE_DAYS) throw new Error(`Range cannot exceed a maximum of ${MAX_MEAL_RANGE_DAYS} days`);
  return days;
};

export const validateMealRange = (range: MealRange): void => {
  getInclusiveMealRangeDays(range);
};

const createTransferItem = (
  source: MealBatchSource,
  destinationDate: string,
  destinationMealType: MealType = source.meal_type,
): MealTransferPlanItem => ({
  logId: source.id,
  source,
  destination: { date: destinationDate, mealType: destinationMealType },
});

export const buildMealSelectionPlan = (sources: MealBatchSource[], destinationDate: string): MealTransferPlanItem[] => {
  parseMealDate(destinationDate);
  return sources.filter(source => source.id).map(source => createTransferItem(source, destinationDate));
};

export const buildRangeTransferPlan = (
  sources: MealBatchSource[],
  range: MealRange,
  destinationStartDate: string,
): MealTransferPlanItem[] => {
  const sourceStart = parseMealDate(range.startDate);
  validateMealRange(range);
  const destinationStart = parseMealDate(destinationStartDate);

  return sources
    .filter(source => {
      const sourceDate = parseMealDate(source.date);
      return sourceDate >= sourceStart && sourceDate <= parseMealDate(range.endDate) && source.id;
    })
    .map(source => {
      const sourceDate = parseMealDate(source.date);
      const offset = differenceInCalendarDays(sourceDate, sourceStart);
      return createTransferItem(source, format(addDays(destinationStart, offset), 'yyyy-MM-dd'));
    });
};

export const buildDayDuplicationPlan = (
  sources: MealBatchSource[],
  destinationDate: string,
): MealTransferPlanItem[] => {
  const sourceDate = sources[0]?.date;
  if (!sourceDate) return [];
  return buildRangeTransferPlan(sources, { startDate: sourceDate, endDate: sourceDate }, destinationDate);
};
