import { getProgressionWeekIndex } from './enduranceProgression.helper';
import { isDateWithinTemplateRecurrence } from './trainingPropagation.helper';

export type StrengthProgressionTarget = {
  id: string;
  target_sets: number | null;
  target_reps_min: number | null;
  target_reps_max: number | null;
  target_weight_kg: number | null;
  target_rpe: number | null;
  target_rir_by_set?: Array<number | null> | null;
  rest_seconds: number | null;
};

export type StrengthExerciseProgression = {
  workout_template_exercise_id: string;
  week_index: number;
  target_sets: number | null;
  target_reps_min: number | null;
  target_reps_max: number | null;
  target_weight_kg: number | null;
  target_rpe: number | null;
  target_rir_by_set?: Array<number | null> | null;
  rest_seconds: number | null;
};

export type StrengthProgressionBundle = {
  recurrence_start_date: string | null;
  recurrence_end_date: string | null;
  progressions: StrengthExerciseProgression[];
};

type StrengthProgressionDateSource = {
  linkedPlannedDate?: string | null;
  startedAtLocal?: string | null;
  startTime: string;
};

const toDateOnly = (value: string | null | undefined): string | null => {
  const match = value?.match(/^\d{4}-\d{2}-\d{2}/);
  return match?.[0] ?? null;
};

export const getStrengthProgressionDate = ({
  linkedPlannedDate,
  startedAtLocal,
  startTime,
}: StrengthProgressionDateSource): string =>
  toDateOnly(linkedPlannedDate) ?? toDateOnly(startedAtLocal) ?? toDateOnly(startTime) ?? '';

export const applyStrengthExerciseProgressions = <TExercise extends StrengthProgressionTarget>(
  exercises: TExercise[],
  progressions: StrengthExerciseProgression[],
  weekIndex: number,
): TExercise[] => {
  if (!Number.isInteger(weekIndex) || weekIndex < 1) return exercises;

  const progressionsByExerciseId = new Map(
    progressions
      .filter(progression => progression.week_index === weekIndex)
      .map(progression => [progression.workout_template_exercise_id, progression] as const),
  );

  return exercises.map(exercise => {
    const progression = progressionsByExerciseId.get(exercise.id);
    if (!progression) return exercise;

    return {
      ...exercise,
      target_sets: progression.target_sets ?? exercise.target_sets,
      target_reps_min: progression.target_reps_min ?? exercise.target_reps_min,
      target_reps_max: progression.target_reps_max ?? exercise.target_reps_max,
      target_weight_kg: progression.target_weight_kg ?? exercise.target_weight_kg,
      target_rpe: progression.target_rpe ?? exercise.target_rpe,
      ...(progression.target_rir_by_set != null || Object.prototype.hasOwnProperty.call(exercise, 'target_rir_by_set')
        ? { target_rir_by_set: progression.target_rir_by_set ?? exercise.target_rir_by_set }
        : {}),
      rest_seconds: progression.rest_seconds ?? exercise.rest_seconds,
    };
  });
};

export const applyStrengthProgressionBundleForDate = <TExercise extends StrengthProgressionTarget>(
  exercises: TExercise[],
  bundle: StrengthProgressionBundle,
  plannedDate: string,
): TExercise[] => {
  if (!isDateWithinTemplateRecurrence(plannedDate, bundle)) return exercises;
  const weekIndex = getProgressionWeekIndex(bundle.recurrence_start_date, plannedDate);
  return applyStrengthExerciseProgressions(exercises, bundle.progressions, weekIndex);
};

export const loadStrengthProgressionsOrBase = async <TExercise extends StrengthProgressionTarget>(
  exercises: TExercise[],
  loadProgressions: () => Promise<TExercise[]>,
  onError?: (error: unknown) => void,
): Promise<TExercise[]> => {
  try {
    return await loadProgressions();
  } catch (error) {
    onError?.(error);
    return exercises;
  }
};
