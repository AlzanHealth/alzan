type EditedExerciseIdentity = {
  id?: string | null;
};

type ExistingExerciseIdentity = {
  id: string;
  order_index: number;
};

export type StrengthExerciseReconciliationPlan = {
  staged: Array<{ existingId: string; temporaryOrder: number }>;
  retained: Array<{ editorIndex: number; existingId: string }>;
  added: Array<{ editorIndex: number }>;
  removedIds: string[];
};

export type StrengthProgressionTargets = {
  target_sets?: number | null;
  target_reps_min?: number | null;
  target_reps_max?: number | null;
  target_weight_kg?: number | null;
  target_rpe?: number | null;
  rest_seconds?: number | null;
};

const STRENGTH_TARGET_FIELDS = [
  'target_sets',
  'target_reps_min',
  'target_reps_max',
  'target_weight_kg',
  'target_rpe',
  'rest_seconds',
] as const satisfies ReadonlyArray<keyof StrengthProgressionTargets>;

export const buildStrengthProgressionTargetPatch = (
  previous: StrengthProgressionTargets,
  next: StrengthProgressionTargets,
): StrengthProgressionTargets => {
  const patch: StrengthProgressionTargets = {};
  STRENGTH_TARGET_FIELDS.forEach(field => {
    const previousValue = previous[field] ?? null;
    const nextValue = next[field] ?? null;
    if (previousValue !== nextValue) patch[field] = nextValue;
  });
  return patch;
};

export const buildStrengthExerciseReconciliationPlan = ({
  editedExercises,
  existingExercises,
}: {
  editedExercises: EditedExerciseIdentity[];
  existingExercises: ExistingExerciseIdentity[];
}): StrengthExerciseReconciliationPlan => {
  const existingIds = new Set(existingExercises.map(exercise => exercise.id));
  const retainedIds = new Set<string>();
  const retained: StrengthExerciseReconciliationPlan['retained'] = [];
  const added: StrengthExerciseReconciliationPlan['added'] = [];

  editedExercises.forEach((exercise, editorIndex) => {
    if (exercise.id && existingIds.has(exercise.id) && !retainedIds.has(exercise.id)) {
      retainedIds.add(exercise.id);
      retained.push({ editorIndex, existingId: exercise.id });
      return;
    }
    added.push({ editorIndex });
  });

  const maximumExistingOrder = Math.max(-1, ...existingExercises.map(exercise => exercise.order_index));
  const temporaryOrderStart = maximumExistingOrder + editedExercises.length + 1;

  return {
    staged: existingExercises.map((exercise, index) => ({
      existingId: exercise.id,
      temporaryOrder: temporaryOrderStart + index,
    })),
    retained,
    added,
    removedIds: existingExercises.map(exercise => exercise.id).filter(id => !retainedIds.has(id)),
  };
};
