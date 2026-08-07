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

const REGULAR_CUTOFF_MINUTES = 60;
const DINNER_CUTOFF_MINUTES = 180;
const MINUTES_PER_DAY = 24 * 60;

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

const isInWindow = (nowMinutes: number, previousEnd: number, currentEnd: number): boolean => {
  if (previousEnd < currentEnd) {
    return nowMinutes > previousEnd && nowMinutes <= currentEnd;
  }

  if (previousEnd > currentEnd) {
    return nowMinutes > previousEnd || nowMinutes <= currentEnd;
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
): ScheduledMealType => {
  const activeMeals = MEAL_ORDER.filter(mealType => enabledMeals?.[mealType] !== false);

  if (activeMeals.length === 0) return 'breakfast';
  if (activeMeals.length === 1) return activeMeals[0];

  const mealEnds = activeMeals.map((mealType, index) => {
    const nextMealType = activeMeals[(index + 1) % activeMeals.length];
    const currentTime = parseTime(schedule?.[mealType]?.time, DEFAULT_MEAL_TIMES[mealType]);
    let nextTime = parseTime(schedule?.[nextMealType]?.time, DEFAULT_MEAL_TIMES[nextMealType]);

    while (nextTime <= currentTime) nextTime += MINUTES_PER_DAY;

    const cutoff = mealType === 'dinner' ? DINNER_CUTOFF_MINUTES : REGULAR_CUTOFF_MINUTES;
    return normalizeMinutes(nextTime - cutoff);
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
