import assert from 'node:assert/strict';
import {
  buildStrengthExerciseReconciliationPlan,
  buildStrengthProgressionTargetPatch,
} from './strengthExerciseReconciliation.helper';

const reordered = buildStrengthExerciseReconciliationPlan({
  editedExercises: [{ id: 'old-bench' }, { id: 'old-squat' }],
  existingExercises: [
    { id: 'old-squat', order_index: 0 },
    { id: 'old-bench', order_index: 1 },
  ],
});

assert.deepEqual(reordered, {
  staged: [
    { existingId: 'old-squat', temporaryOrder: 4 },
    { existingId: 'old-bench', temporaryOrder: 5 },
  ],
  retained: [
    { editorIndex: 0, existingId: 'old-bench' },
    { editorIndex: 1, existingId: 'old-squat' },
  ],
  added: [],
  removedIds: [],
});

const changed = buildStrengthExerciseReconciliationPlan({
  editedExercises: [{ id: 'old-squat' }, { id: 'tmp-new-exercise' }],
  existingExercises: [
    { id: 'old-squat', order_index: 0 },
    { id: 'old-bench', order_index: 1 },
  ],
});

assert.deepEqual(changed, {
  staged: [
    { existingId: 'old-squat', temporaryOrder: 4 },
    { existingId: 'old-bench', temporaryOrder: 5 },
  ],
  retained: [{ editorIndex: 0, existingId: 'old-squat' }],
  added: [{ editorIndex: 1 }],
  removedIds: ['old-bench'],
});

const duplicateOrForeignIds = buildStrengthExerciseReconciliationPlan({
  editedExercises: [{ id: 'old-squat' }, { id: 'old-squat' }, { id: 'foreign-row' }],
  existingExercises: [{ id: 'old-squat', order_index: 0 }],
});

assert.deepEqual(duplicateOrForeignIds, {
  staged: [{ existingId: 'old-squat', temporaryOrder: 4 }],
  retained: [{ editorIndex: 0, existingId: 'old-squat' }],
  added: [{ editorIndex: 1 }, { editorIndex: 2 }],
  removedIds: [],
});

const baseTargets = {
  target_sets: 4,
  target_reps_min: 6,
  target_reps_max: 6,
  target_weight_kg: 80,
  target_rpe: 8,
  rest_seconds: 150,
};

assert.deepEqual(
  buildStrengthProgressionTargetPatch(baseTargets, {
    ...baseTargets,
    target_sets: 5,
    target_weight_kg: null,
  }),
  {
    target_sets: 5,
    target_weight_kg: null,
  },
);

assert.deepEqual(buildStrengthProgressionTargetPatch(baseTargets, { ...baseTargets }), {});
assert.deepEqual(
  buildStrengthProgressionTargetPatch(
    { ...baseTargets, target_reps_min: 6, target_reps_max: 8 },
    { ...baseTargets, target_reps_min: 6, target_reps_max: 8 },
  ),
  {},
);
