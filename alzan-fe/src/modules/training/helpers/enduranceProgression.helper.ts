import { addDays, differenceInCalendarDays, format, parseISO } from 'date-fns';
import { DurationType, PhaseType, SportType, TargetType } from '../../../types/requests.types';

export type ProgressionBuilderStep = {
  id: string;
  progression_key?: string | null;
  phase_type: PhaseType;
  duration_type: DurationType;
  duration_s?: number | null;
  distance_m?: number | null;
  target_type: TargetType;
  target_min?: number | null;
  target_max?: number | null;
  repetitions: number | null;
  parent_step_id?: string | null;
  is_group: boolean | null;
  children?: ProgressionBuilderStep[];
  hyrox_step_type?: string | null;
  hyrox_station_key?: string | null;
  load_kg?: number | null;
  reps?: number | null;
};

export type StepProgressionOverride = {
  progression_key: string;
  week_index: number;
  duration_s?: number | null;
  distance_m?: number | null;
  target_type?: TargetType | null;
  target_min?: number | null;
  target_max?: number | null;
  repetitions?: number | null;
  load_kg?: number | null;
  reps?: number | null;
};

export type EligibleProgressionStep = ProgressionBuilderStep & {
  progression_key: string;
  path: string;
};

const STRUCTURED_PROGRESSION_SPORTS: SportType[] = ['running', 'cycling', 'swimming', 'hyrox'];

const parseDateOnly = (dateStr: string): Date | null => {
  const datePart = dateStr.substring(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(datePart)) return null;
  const date = parseISO(`${datePart}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
};

const createUuidPart = (length: number): string =>
  Array.from({ length }, () => Math.floor(Math.random() * 16).toString(16)).join('');

export const createProgressionKey = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `${createUuidPart(8)}-${createUuidPart(4)}-4${createUuidPart(3)}-${(
    8 + Math.floor(Math.random() * 4)
  ).toString(16)}${createUuidPart(3)}-${createUuidPart(12)}`;
};

export const getNextScheduledDateString = (fromDate: Date, dayOfWeek: number): string => {
  const normalizedFromDate = new Date(fromDate);
  normalizedFromDate.setHours(0, 0, 0, 0);

  const daysUntilTarget = (dayOfWeek - normalizedFromDate.getDay() + 7) % 7;
  return format(addDays(normalizedFromDate, daysUntilTarget), 'yyyy-MM-dd');
};

export const calculateStartDateFromEndAndWeeks = (
  endDateStr: string | null | undefined,
  weeks: number,
): string | null => {
  if (!endDateStr || !weeks || weeks < 1) return null;
  const endDate = parseDateOnly(endDateStr);
  if (!endDate) return null;

  const startDate = addDays(endDate, -(weeks * 7 - 1));
  return format(startDate, 'yyyy-MM-dd');
};

export const calculateProgressionWeeks = (
  startDateStr: string | null | undefined,
  endDateStr: string | null | undefined,
): number => {
  if (!startDateStr || !endDateStr) return 0;

  const startDate = parseDateOnly(startDateStr);
  const endDate = parseDateOnly(endDateStr);
  if (!startDate || !endDate || endDate < startDate) return 0;

  return Math.floor(differenceInCalendarDays(endDate, startDate) / 7) + 1;
};

export const getProgressionWeekIndex = (
  startDateStr: string | null | undefined,
  plannedDateStr: string | null | undefined,
): number => {
  if (!startDateStr || !plannedDateStr) return 0;

  const startDate = parseDateOnly(startDateStr);
  const plannedDate = parseDateOnly(plannedDateStr);
  if (!startDate || !plannedDate || plannedDate < startDate) return 0;

  return Math.floor(differenceInCalendarDays(plannedDate, startDate) / 7) + 1;
};

export const isStructuredProgressionSport = (sportType: string | null | undefined): sportType is SportType =>
  STRUCTURED_PROGRESSION_SPORTS.includes(sportType as SportType);

export const ensureStepProgressionKeys = <TStep extends ProgressionBuilderStep>(steps: TStep[]): TStep[] =>
  steps.map(step => {
    const nextStep = {
      ...step,
      progression_key: step.progression_key || createProgressionKey(),
    };

    if (step.children) {
      return {
        ...nextStep,
        children: ensureStepProgressionKeys(step.children),
      };
    }

    return nextStep;
  }) as TStep[];

const isEligibleStep = (step: ProgressionBuilderStep, sportType: SportType): boolean => {
  if (!step.progression_key) return false;

  if (step.is_group) return (step.repetitions ?? 1) > 1;

  if (sportType === 'hyrox') {
    return step.hyrox_step_type === 'run' || step.hyrox_step_type === 'station';
  }

  return step.phase_type === 'interval';
};

export const getEligibleProgressionSteps = (
  steps: ProgressionBuilderStep[],
  sportType: string | null | undefined,
): EligibleProgressionStep[] => {
  if (!isStructuredProgressionSport(sportType)) return [];

  const stepsWithKeys = ensureStepProgressionKeys(steps);
  const eligibleSteps: EligibleProgressionStep[] = [];

  const visit = (stepList: ProgressionBuilderStep[], parentPath = '') => {
    stepList.forEach((step, index) => {
      const path = parentPath ? `${parentPath}.${index + 1}` : `${index + 1}`;
      if (isEligibleStep(step, sportType)) {
        eligibleSteps.push({ ...step, progression_key: step.progression_key || '', path });
      }
      if (step.children) {
        visit(step.children, path);
      }
    });
  };

  visit(stepsWithKeys);
  return eligibleSteps;
};

const hasFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

export const normalizeStepProgressions = (progressions: StepProgressionOverride[]): StepProgressionOverride[] => {
  const normalizedByKey = new Map<string, StepProgressionOverride>();

  progressions.forEach(progression => {
    if (!progression.progression_key || !Number.isInteger(progression.week_index) || progression.week_index < 1) {
      return;
    }

    const normalized: StepProgressionOverride = {
      progression_key: progression.progression_key,
      week_index: progression.week_index,
    };

    if (progression.target_type) normalized.target_type = progression.target_type;
    if (hasFiniteNumber(progression.target_min)) normalized.target_min = progression.target_min;
    if (hasFiniteNumber(progression.target_max)) normalized.target_max = progression.target_max;
    if (hasFiniteNumber(progression.duration_s))
      normalized.duration_s = Math.max(0, Math.round(progression.duration_s));
    if (hasFiniteNumber(progression.distance_m))
      normalized.distance_m = Math.max(0, Math.round(progression.distance_m));
    if (hasFiniteNumber(progression.repetitions)) {
      normalized.repetitions = Math.max(1, Math.round(progression.repetitions));
    }
    if (hasFiniteNumber(progression.load_kg)) normalized.load_kg = Math.max(0, progression.load_kg);
    if (hasFiniteNumber(progression.reps)) normalized.reps = Math.max(0, Math.round(progression.reps));

    const hasOverrideValue =
      hasFiniteNumber(normalized.target_min) ||
      hasFiniteNumber(normalized.target_max) ||
      hasFiniteNumber(normalized.duration_s) ||
      hasFiniteNumber(normalized.distance_m) ||
      hasFiniteNumber(normalized.repetitions) ||
      hasFiniteNumber(normalized.load_kg) ||
      hasFiniteNumber(normalized.reps);

    if (!hasOverrideValue) return;

    normalizedByKey.set(`${normalized.progression_key}:${normalized.week_index}`, normalized);
  });

  return Array.from(normalizedByKey.values()).sort((a, b) => {
    if (a.progression_key === b.progression_key) return a.week_index - b.week_index;
    return a.progression_key.localeCompare(b.progression_key);
  });
};

const applyProgressionToStep = <TStep extends ProgressionBuilderStep>(
  step: TStep,
  progression: StepProgressionOverride | undefined,
): TStep => {
  if (!progression) return step;

  return {
    ...step,
    duration_s: progression.duration_s ?? step.duration_s,
    distance_m: progression.distance_m ?? step.distance_m,
    target_type: progression.target_type ?? step.target_type,
    target_min: progression.target_min ?? step.target_min,
    target_max: progression.target_max ?? step.target_max,
    repetitions: progression.repetitions ?? step.repetitions,
    load_kg: progression.load_kg ?? step.load_kg,
    reps: progression.reps ?? step.reps,
  };
};

export const applyProgressionsToSteps = <TStep extends ProgressionBuilderStep>(
  steps: TStep[],
  weekIndex: number,
  progressions: StepProgressionOverride[],
): TStep[] => {
  const normalized = normalizeStepProgressions(progressions);
  const progressionByStep = new Map(
    normalized
      .filter(progression => progression.week_index === weekIndex)
      .map(progression => [progression.progression_key, progression] as const),
  );

  return steps.map(step => {
    const nextChildren = step.children ? applyProgressionsToSteps(step.children, weekIndex, normalized) : step.children;
    const progressedStep = applyProgressionToStep(step, progressionByStep.get(step.progression_key || ''));

    return {
      ...progressedStep,
      children: nextChildren,
    };
  });
};
