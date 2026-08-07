export type ScheduledMealType = 'breakfast' | 'almuerzo' | 'lunch' | 'merienda' | 'dinner';

export type MealSchedule = Partial<Record<ScheduledMealType, { time?: string }>>;
export type EnabledMeals = Partial<Record<ScheduledMealType, boolean>>;

const MEAL_ORDER: ScheduledMealType[] = ['breakfast', 'almuerzo', 'lunch', 'merienda', 'dinner'];
const DEFAULT_MEAL_TIMES: Record<ScheduledMealType, string> = {
  breakfast: '08:00',
  almuerzo: '11:00',
  lunch: '14:00',
  merienda: '17:30',
  dinner: '21:00',
};

const NIGHT_MULTIPLIER = 2.5;
const MAX_NIGHT_CUTOFF_MINUTES = 6 * 60;
const MINUTES_PER_DAY = 24 * 60;

export const DEFAULT_NEXT_MEAL_CUTOFF_HOURS = 1;
export const MIN_NEXT_MEAL_CUTOFF_HOURS = 0;
export const MAX_NEXT_MEAL_CUTOFF_HOURS = 24;

export const normalizeNextMealCutoffHours = (
  value: unknown,
  maximumHours: number = MAX_NEXT_MEAL_CUTOFF_HOURS,
): number => {
  const safeMaximum = Math.min(MAX_NEXT_MEAL_CUTOFF_HOURS, Math.max(MIN_NEXT_MEAL_CUTOFF_HOURS, maximumHours));
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return Math.min(DEFAULT_NEXT_MEAL_CUTOFF_HOURS, safeMaximum);
  }

  const rounded = Math.round(value * 100) / 100;
  return Math.min(safeMaximum, Math.max(MIN_NEXT_MEAL_CUTOFF_HOURS, rounded));
};

const parseTime = (time: string | undefined, fallback: string): number => {
  const value = time ?? fallback;
  const [hours, minutes] = value.split(':').map(Number);

  if (
    !Number.isInteger(hours) ||
    !Number.isInteger(minutes) ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59
  ) {
    const [fallbackHours, fallbackMinutes] = fallback.split(':').map(Number);
    return fallbackHours * 60 + fallbackMinutes;
  }

  return hours * 60 + minutes;
};

const normalizeMinutes = (minutes: number): number => ((minutes % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;

export const getMaxNextMealCutoffHours = (
  schedule: MealSchedule | undefined,
  enabledMeals: EnabledMeals | undefined,
): number => {
  const activeMeals = MEAL_ORDER.filter(mealType => enabledMeals?.[mealType] !== false);
  if (activeMeals.length < 2) return MAX_NEXT_MEAL_CUTOFF_HOURS;

  const shortestIntervalMinutes = activeMeals.reduce((shortest, mealType, index) => {
    const nextMealType = activeMeals[(index + 1) % activeMeals.length];
    const currentTime = parseTime(schedule?.[mealType]?.time, DEFAULT_MEAL_TIMES[mealType]);
    let nextTime = parseTime(schedule?.[nextMealType]?.time, DEFAULT_MEAL_TIMES[nextMealType]);
    while (nextTime <= currentTime) nextTime += MINUTES_PER_DAY;
    return Math.min(shortest, nextTime - currentTime);
  }, MINUTES_PER_DAY);

  return Math.round((shortestIntervalMinutes / 60) * 100) / 100;
};

type MealEnd = {
  minute: number;
  inclusive: boolean;
};

const isInWindow = (nowMinutes: number, previousEnd: MealEnd, currentEnd: MealEnd): boolean => {
  const isAfterPreviousEnd = previousEnd.inclusive ? nowMinutes > previousEnd.minute : nowMinutes >= previousEnd.minute;
  const isBeforeCurrentEnd = currentEnd.inclusive ? nowMinutes <= currentEnd.minute : nowMinutes < currentEnd.minute;

  if (previousEnd.minute < currentEnd.minute) {
    return isAfterPreviousEnd && isBeforeCurrentEnd;
  }

  if (previousEnd.minute > currentEnd.minute) {
    return isAfterPreviousEnd || isBeforeCurrentEnd;
  }

  return false;
};

/**
 * Returns the meal slot whose configured time window contains the supplied time.
 * The previous meal owns an exact cutoff minute (for example, 13:00 is still
 * Almuerzo when Comida is configured at 14:00).
 */
export const getMealTypeForTime = (
  schedule: MealSchedule | undefined,
  enabledMeals: EnabledMeals | undefined,
  date = new Date(),
  options?: { cutoffHours?: number },
): ScheduledMealType => {
  const activeMeals = MEAL_ORDER.filter(mealType => enabledMeals?.[mealType] !== false);

  if (activeMeals.length === 0) return 'breakfast';
  if (activeMeals.length === 1) return activeMeals[0];

  const baseCutoffMinutes = Math.round(normalizeNextMealCutoffHours(options?.cutoffHours) * 60);

  const mealEnds = activeMeals.map((mealType, index) => {
    const nextMealType = activeMeals[(index + 1) % activeMeals.length];
    const currentTime = parseTime(schedule?.[mealType]?.time, DEFAULT_MEAL_TIMES[mealType]);
    let nextTime = parseTime(schedule?.[nextMealType]?.time, DEFAULT_MEAL_TIMES[nextMealType]);

    while (nextTime <= currentTime) nextTime += MINUTES_PER_DAY;

    const intervalMinutes = nextTime - currentTime;
    const cutoff =
      mealType === 'dinner'
        ? Math.min(baseCutoffMinutes * NIGHT_MULTIPLIER, MAX_NIGHT_CUTOFF_MINUTES, intervalMinutes)
        : Math.min(baseCutoffMinutes, intervalMinutes);

    return {
      minute: normalizeMinutes(nextTime - cutoff),
      inclusive: cutoff > 0,
    };
  });

  const nowMinutes = date.getHours() * 60 + date.getMinutes();

  for (let index = 0; index < activeMeals.length; index += 1) {
    const previousIndex = (index - 1 + activeMeals.length) % activeMeals.length;
    if (isInWindow(nowMinutes, mealEnds[previousIndex], mealEnds[index])) {
      return activeMeals[index];
    }
  }

  return activeMeals[0];
};
