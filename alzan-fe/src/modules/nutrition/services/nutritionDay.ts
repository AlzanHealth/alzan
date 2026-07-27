import { format } from 'date-fns';

export const DEFAULT_NUTRITION_DAY_ROLLOVER_TIME = '03:00';

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;
const MILLISECONDS_PER_MINUTE = 60 * 1000;
const MAX_ROLLOVER_SEARCH_MINUTES = 36 * 60;

const parseTimeToMinutes = (value: string | null | undefined): number | null => {
  if (!value) return null;

  const match = TIME_PATTERN.exec(value);
  if (!match) return null;

  return Number(match[1]) * 60 + Number(match[2]);
};

export const normalizeNutritionDayRolloverTime = (value: string | null | undefined): string => {
  return value && parseTimeToMinutes(value) != null ? value : DEFAULT_NUTRITION_DAY_ROLLOVER_TIME;
};

export const getMillisecondsUntilNextNutritionDayRollover = (
  now: Date,
  rolloverTime: string | null | undefined = DEFAULT_NUTRITION_DAY_ROLLOVER_TIME,
): number => {
  const normalizedRollover = normalizeNutritionDayRolloverTime(rolloverTime);
  const currentNutritionDate = formatNutritionDayDate(now, normalizedRollover);
  const nowTime = now.getTime();
  const firstMinuteBoundary =
    Math.floor(nowTime / MILLISECONDS_PER_MINUTE) * MILLISECONDS_PER_MINUTE + MILLISECONDS_PER_MINUTE;
  const searchDeadline = nowTime + MAX_ROLLOVER_SEARCH_MINUTES * MILLISECONDS_PER_MINUTE;

  for (
    let candidateTime = firstMinuteBoundary;
    candidateTime <= searchDeadline;
    candidateTime += MILLISECONDS_PER_MINUTE
  ) {
    if (formatNutritionDayDate(new Date(candidateTime), normalizedRollover) !== currentNutritionDate) {
      return candidateTime - nowTime;
    }
  }

  return searchDeadline - nowTime;
};

export const getNutritionDayDate = (
  now: Date = new Date(),
  rolloverTime: string | null | undefined = DEFAULT_NUTRITION_DAY_ROLLOVER_TIME,
): Date => {
  const normalizedRollover = normalizeNutritionDayRolloverTime(rolloverTime);
  const rolloverMinutes = parseTimeToMinutes(normalizedRollover) ?? 0;
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const nutritionDay = new Date(now);

  if (currentMinutes < rolloverMinutes) {
    nutritionDay.setDate(nutritionDay.getDate() - 1);
  }

  nutritionDay.setHours(12, 0, 0, 0);
  return nutritionDay;
};

export const formatNutritionDayDate = (
  now: Date = new Date(),
  rolloverTime: string | null | undefined = DEFAULT_NUTRITION_DAY_ROLLOVER_TIME,
): string => {
  return format(getNutritionDayDate(now, rolloverTime), 'yyyy-MM-dd');
};

export const buildTimePickerDate = (time: string | null | undefined, base: Date = new Date()): Date => {
  const normalized = normalizeNutritionDayRolloverTime(time);
  const [hours, minutes] = normalized.split(':').map(Number);
  const date = new Date(base);
  date.setHours(hours, minutes, 0, 0);
  return date;
};
