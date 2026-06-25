export const DEFAULT_GYM_REPS = 8;
export const DEFAULT_GYM_TIME_SECONDS = 60;

export type DefaultGymExerciseTargets = {
  target_reps_min: number;
  target_reps_max: number;
};

const normalizeExerciseTypeCode = (exerciseTypeCode: string | null | undefined): string =>
  (exerciseTypeCode ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

export const isTimeBasedGymExerciseType = (exerciseTypeCode: string | null | undefined): boolean =>
  ['tiempo', 'time', 'duration', 'duracion'].includes(normalizeExerciseTypeCode(exerciseTypeCode));

export const getDefaultGymExerciseTargets = (
  exerciseTypeCode: string | null | undefined,
): DefaultGymExerciseTargets => {
  const defaultValue = isTimeBasedGymExerciseType(exerciseTypeCode) ? DEFAULT_GYM_TIME_SECONDS : DEFAULT_GYM_REPS;

  return {
    target_reps_min: defaultValue,
    target_reps_max: defaultValue,
  };
};
