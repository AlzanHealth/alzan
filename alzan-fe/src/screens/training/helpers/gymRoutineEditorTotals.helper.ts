export type RoutineSetsLike = {
  target_sets?: unknown;
};

export const normalizeTargetSetsInput = (value: string): number => {
  const parsedValue = value.trim() === '' ? 0 : Number.parseInt(value, 10);
  return Number.isFinite(parsedValue) && parsedValue > 0 ? parsedValue : 0;
};

export const getTargetSetsCount = (value: unknown): number => {
  if (typeof value === 'number') {
    return Number.isFinite(value) && value > 0 ? value : 0;
  }
  if (typeof value === 'string') {
    return normalizeTargetSetsInput(value);
  }
  return 0;
};

export const calculateRoutineTotalSets = (exercises: RoutineSetsLike[]): number =>
  exercises.reduce((total, exercise) => total + getTargetSetsCount(exercise.target_sets), 0);
