import { addWeeks, getISOWeek, getISOWeekYear, startOfWeek } from 'date-fns';

/**
 * Pure week-planning logic for the automatic diet copy feature.
 *
 * This module is intentionally free of any Supabase / network dependency so the
 * core algorithm (which week is copied to which) can be unit-tested in isolation
 * (see `dietCopyPlanner.spec.ts`). The orchestration that actually reads/writes
 * meal logs lives in `dietCopyService.ts`.
 */

export type DietCopyMode = 'sequential' | 'alternating';

/** A single "copy the meals of `source` week into `target` week" instruction. */
export interface WeekCopyOp {
  source: Date;
  target: Date;
}

/**
 * Get ISO week string in format "YYYY-WXX".
 */
export const getISOWeekString = (date: Date): string => {
  // Use the ISO week-year (not the calendar year) so weeks around Jan 1 map to
  // the correct year, e.g. 2026-12-31 → "2027-W01", 2021-01-01 → "2020-W53".
  const year = getISOWeekYear(date);
  const week = getISOWeek(date);
  return `${year}-W${week.toString().padStart(2, '0')}`;
};

/**
 * Convert a "YYYY-WXX" string back to the Monday of that ISO week.
 */
export const getDateFromISOWeekString = (isoStr: string): Date => {
  const [yearStr, weekStr] = isoStr.split('-W');
  const year = parseInt(yearStr, 10);
  const week = parseInt(weekStr, 10);

  // Jan 4th is always in ISO week 1.
  const d = new Date(year, 0, 4);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay() || 7; // 1=Mon, 7=Sun
  // Move to the Monday of ISO week 1.
  const startWeek1 = new Date(d.getTime() - (day - 1) * 24 * 60 * 60 * 1000);

  return addWeeks(startWeek1, week - 1);
};

export interface VisibleWeekRange {
  start: Date;
  end: Date;
  /** Monday of each visible week: [W-2, W-1, W0, W+1, W+2, W+3, W+4] (7 entries). */
  weeks: Date[];
  /** Index of the current week (W0) inside `weeks`. */
  currentWeekIndex: number;
}

/**
 * The visible week window: 2 past weeks + current week + 4 future weeks
 * (W-2 … W+4 = 7 weeks total). The 4 future weeks are the copy horizon.
 */
export const getVisibleWeekRange = (referenceDate: Date = new Date()): VisibleWeekRange => {
  const currentWeekStart = startOfWeek(referenceDate, { weekStartsOn: 1 });

  const weeks: Date[] = [];
  // W-2, W-1, W0 (current), W+1, W+2, W+3, W+4
  for (let i = -2; i <= 4; i++) {
    weeks.push(addWeeks(currentWeekStart, i));
  }

  return {
    start: addWeeks(currentWeekStart, -2),
    end: addWeeks(currentWeekStart, 4),
    weeks,
    currentWeekIndex: 2, // W0 is at index 2
  };
};

/** Future weeks that automatic copy can write into (W+1 … W+4). */
export const getFutureCopyTargets = (referenceDate: Date = new Date()): Date[] => {
  const { weeks, currentWeekIndex } = getVisibleWeekRange(referenceDate);
  return weeks.slice(currentWeekIndex + 1);
};

/**
 * Sequential ("Copia semanal") activation plan.
 *
 * Copies the current week (W0) into each of the 4 following weeks
 * (W0→W+1, W0→W+2, W0→W+3, W0→W+4). Because every target ends up equal to W0,
 * the result is identical to the chain W0→W+1→W+2→W+3→W+4 advertised in the UI.
 */
export const getSequentialActivationPlan = (referenceDate: Date = new Date()): WeekCopyOp[] => {
  const { weeks, currentWeekIndex } = getVisibleWeekRange(referenceDate);
  const source = weeks[currentWeekIndex]; // W0
  const ops: WeekCopyOp[] = [];
  for (let i = currentWeekIndex + 1; i <= currentWeekIndex + 4; i++) {
    ops.push({ source, target: weeks[i] });
  }
  return ops;
};

/**
 * Alternating ("Copia alterna") activation plan.
 *
 * Keeps two plans and alternates them on future weeks, matching the modal copy
 * "Usa semana anterior (Plan A) y actual (Plan B)":
 *   - Plan A = previous week (W-1) → odd offsets W+1, W+3
 *   - Plan B = current week  (W0) → even offsets W+2, W+4
 * Result on future weeks: A, B, A, B.
 */
export const getAlternatingActivationPlan = (referenceDate: Date = new Date()): WeekCopyOp[] => {
  const { weeks, currentWeekIndex } = getVisibleWeekRange(referenceDate);
  const planA = weeks[currentWeekIndex - 1]; // previous week
  const planB = weeks[currentWeekIndex]; // current week
  return [
    { source: planA, target: weeks[currentWeekIndex + 1] }, // W+1 = Plan A
    { source: planB, target: weeks[currentWeekIndex + 2] }, // W+2 = Plan B
    { source: planA, target: weeks[currentWeekIndex + 3] }, // W+3 = Plan A
    { source: planB, target: weeks[currentWeekIndex + 4] }, // W+4 = Plan B
  ];
};

/** ISO week string of the furthest visible week (the copy horizon, W+4). */
export const getCatchUpHorizonISO = (referenceDate: Date = new Date()): string => {
  const { weeks } = getVisibleWeekRange(referenceDate);
  return getISOWeekString(weeks[weeks.length - 1]);
};

/**
 * Ordered list of weeks that must be (re)checked since the user last saw the app.
 *
 * Fills the gap between `lastVisibleWeek` (exclusive) and the current horizon
 * (W+4, inclusive). When `lastVisibleWeek` is undefined we only evaluate the
 * furthest week so we never back-fill ancient history. Capped at 12 iterations.
 */
export const getCatchUpTargets = (referenceDate: Date, lastVisibleWeek: string | undefined): Date[] => {
  const { weeks } = getVisibleWeekRange(referenceDate);
  const horizon = weeks[weeks.length - 1];
  const horizonISO = getISOWeekString(horizon);

  // No pointer yet → only evaluate the furthest week (W+4).
  const lastChecked = lastVisibleWeek ? getDateFromISOWeekString(lastVisibleWeek) : weeks[weeks.length - 2];

  if (getISOWeekString(lastChecked) === horizonISO) return [];

  const targets: Date[] = [];
  let current = addWeeks(lastChecked, 1);
  let safety = 0;
  while (safety < 12) {
    if (current.getTime() > horizon.getTime() + 1000) break;
    targets.push(current);
    current = addWeeks(current, 1);
    safety++;
  }
  return targets;
};

/**
 * Source week for a catch-up copy:
 *   - sequential: the immediately previous week (chain)
 *   - alternating: two weeks back (keeps A/B parity)
 */
export const getCatchUpSource = (mode: DietCopyMode, target: Date): Date =>
  addWeeks(target, mode === 'sequential' ? -1 : -2);
