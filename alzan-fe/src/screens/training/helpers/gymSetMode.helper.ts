export type GymSetMode = 'normal' | 'warmup' | 'drop_set';
export type GymDropSetMode = 'none' | 'last' | 'all';

type ExerciseSetModeDefaultsInput = {
  exercise_id?: string | null;
  is_warmup?: boolean | null;
  target_sets?: number | null;
  drop_set_mode?: string | null;
};

export const normalizeGymDropSetMode = (value: unknown): GymDropSetMode => {
  if (value === 'last' || value === 'all') return value;
  return 'none';
};

export const normalizeGymSetMode = (value: unknown): GymSetMode => {
  if (value === 'warmup' || value === 'drop_set') return value;
  return 'normal';
};

export const getNextGymSetMode = (mode: GymSetMode): GymSetMode => {
  if (mode === 'normal') return 'warmup';
  if (mode === 'warmup') return 'drop_set';
  return 'normal';
};

export const getGymSetModeLabel = (mode: GymSetMode, setNumber: number) => {
  if (mode === 'warmup') return 'W';
  if (mode === 'drop_set') return 'D';
  return String(setNumber);
};

export const getWorkoutSetTypeForGymSetMode = (mode: GymSetMode) => mode;

export const buildGymSetModeDefaults = (orderedExercises: ExerciseSetModeDefaultsInput[]) => {
  const defaults: Record<string, GymSetMode> = {};

  orderedExercises.forEach(exercise => {
    const exerciseId = exercise.exercise_id;
    if (!exerciseId) return;

    const totalSets = Math.max(0, exercise.target_sets || 3);
    if (exercise.is_warmup) {
      for (let setNumber = 1; setNumber <= totalSets; setNumber += 1) {
        defaults[`${exerciseId}-${setNumber}`] = 'warmup';
      }
      return;
    }

    const dropSetMode = normalizeGymDropSetMode(exercise.drop_set_mode);
    if (dropSetMode === 'all') {
      for (let setNumber = 1; setNumber <= totalSets; setNumber += 1) {
        defaults[`${exerciseId}-${setNumber}`] = 'drop_set';
      }
      return;
    }

    if (dropSetMode === 'last' && totalSets > 0) {
      defaults[`${exerciseId}-${totalSets}`] = 'drop_set';
    }
  });

  return defaults;
};

export const parseGymSetModeRecord = (value: unknown): Record<string, GymSetMode> | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;

  const parsed: Record<string, GymSetMode> = {};
  Object.entries(value).forEach(([key, itemValue]) => {
    const mode = normalizeGymSetMode(itemValue);
    if (mode !== 'normal') {
      parsed[key] = mode;
    }
  });

  return parsed;
};

export const parseWarmupSetRecordAsGymSetModes = (value: unknown): Record<string, GymSetMode> | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;

  const parsed: Record<string, GymSetMode> = {};
  Object.entries(value).forEach(([key, itemValue]) => {
    if (itemValue) {
      parsed[key] = 'warmup';
    }
  });

  return parsed;
};
