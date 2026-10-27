import assert from 'node:assert/strict';
import {
  applyStrengthExerciseProgressions,
  applyStrengthProgressionBundleForDate,
  getStrengthProgressionDate,
  loadStrengthProgressionsOrBase,
  type StrengthExerciseProgression,
} from './strengthProgression.helper';
import { getProgressionWeekIndex } from './enduranceProgression.helper';
import { parseTargetRirBySet } from './targetRirBySet.helper';

const baseExercises = [
  {
    id: 'template-exercise-1',
    target_sets: 3,
    target_reps_min: 8,
    target_reps_max: 10,
    target_weight_kg: 70,
    target_rpe: 7,
    target_rir_by_set: [3, 2, 2],
    rest_seconds: 90,
    nested: { preserved: true },
  },
  {
    id: 'template-exercise-2',
    target_sets: 4,
    target_reps_min: 6,
    target_reps_max: 8,
    target_weight_kg: 40,
    target_rpe: 8,
    target_rir_by_set: [3, 2, 2, 1],
    rest_seconds: 120,
    nested: { preserved: true },
  },
];

const progressions: StrengthExerciseProgression[] = [
  {
    workout_template_exercise_id: 'template-exercise-1',
    week_index: 2,
    target_sets: 4,
    target_reps_min: 6,
    target_reps_max: 6,
    target_weight_kg: 80,
    target_rpe: 8,
    rest_seconds: 150,
  },
  {
    workout_template_exercise_id: 'template-exercise-2',
    week_index: 2,
    target_sets: null,
    target_reps_min: null,
    target_reps_max: null,
    target_weight_kg: null,
    target_rpe: null,
    target_rir_by_set: null,
    rest_seconds: null,
  },
  {
    workout_template_exercise_id: 'template-exercise-1',
    week_index: 3,
    target_sets: 5,
    target_reps_min: 5,
    target_reps_max: 5,
    target_weight_kg: 85,
    target_rpe: 9,
    target_rir_by_set: [2, 1, 1, 0, 0],
    rest_seconds: 180,
  },
];

const weekTwo = applyStrengthExerciseProgressions(baseExercises, progressions, 2);
assert.deepEqual(
  {
    target_sets: weekTwo[0].target_sets,
    target_reps_min: weekTwo[0].target_reps_min,
    target_reps_max: weekTwo[0].target_reps_max,
    target_weight_kg: weekTwo[0].target_weight_kg,
    target_rpe: weekTwo[0].target_rpe,
    rest_seconds: weekTwo[0].rest_seconds,
  },
  {
    target_sets: 4,
    target_reps_min: 6,
    target_reps_max: 6,
    target_weight_kg: 80,
    target_rpe: 8,
    rest_seconds: 150,
  },
);
assert.deepEqual(weekTwo[0].nested, { preserved: true });
assert.deepEqual(weekTwo[0].target_rir_by_set, baseExercises[0].target_rir_by_set);
assert.deepEqual(weekTwo[1], baseExercises[1], 'null progression values must preserve the base targets');
assert.deepEqual(baseExercises[0].target_sets, 3, 'the base exercise must not be mutated');

const weekThree = applyStrengthExerciseProgressions(baseExercises, progressions, 3);
assert.deepEqual(
  weekThree[0].target_rir_by_set,
  [2, 1, 1, 0, 0],
  'a progression RIR vector must override the base targets',
);

const weekOne = applyStrengthExerciseProgressions(baseExercises, progressions, 1);
assert.deepEqual(weekOne, baseExercises, 'weeks without overrides must keep the base targets');

assert.equal(getProgressionWeekIndex('2026-06-23', '2026-06-29'), 1);
assert.equal(getProgressionWeekIndex('2026-06-23', '2026-06-30'), 2);

assert.equal(
  getStrengthProgressionDate({
    linkedPlannedDate: '2026-07-07',
    startedAtLocal: '2026-07-06T23:30:00',
    startTime: '2026-07-07T06:30:00.000Z',
  }),
  '2026-07-07',
  'the linked calendar date must be canonical',
);
assert.equal(
  getStrengthProgressionDate({
    linkedPlannedDate: null,
    startedAtLocal: '2026-07-06T23:30:00',
    startTime: '2026-07-07T06:30:00.000Z',
  }),
  '2026-07-06',
  'manual sessions must preserve their original local date',
);
assert.equal(
  getStrengthProgressionDate({
    linkedPlannedDate: null,
    startedAtLocal: null,
    startTime: '2026-07-07T00:30:00.000Z',
  }),
  '2026-07-07',
  'legacy sessions must use a timezone-independent fallback',
);

const boundedProgressionBundle = {
  recurrence_start_date: '2026-06-23',
  recurrence_end_date: '2026-07-20',
  progressions,
};
assert.equal(
  applyStrengthProgressionBundleForDate(baseExercises, boundedProgressionBundle, '2026-06-30')[0].target_sets,
  4,
);
assert.deepEqual(
  applyStrengthProgressionBundleForDate(baseExercises, boundedProgressionBundle, '2026-07-21'),
  baseExercises,
  'dates after the recurrence must use the base targets',
);

assert.deepEqual(parseTargetRirBySet(null, 3), null);
assert.deepEqual(parseTargetRirBySet([3, null, 1], 3), [3, null, 1]);
assert.deepEqual(parseTargetRirBySet([0, 10], 2), [0, 10]);
assert.equal(parseTargetRirBySet([3, 2], 3), null, 'vectors with a different number of sets are rejected');
assert.equal(parseTargetRirBySet([3, -1], 2), null, 'RIR cannot be negative');
assert.equal(parseTargetRirBySet([3, 11], 2), null, 'RIR cannot be above ten');
assert.equal(parseTargetRirBySet([3, 2.5], 2), null, 'RIR targets must be integers');
assert.equal(parseTargetRirBySet([3, '2'], 2), null, 'string values are rejected');
assert.equal(parseTargetRirBySet({ values: [3, 2] }, 2), null, 'non-array JSON is rejected');

const verifySafeFallback = async () => {
  let capturedError: unknown;
  const onLoadFailure = await loadStrengthProgressionsOrBase(
    baseExercises,
    async () => {
      throw new Error('temporary query failure');
    },
    error => {
      capturedError = error;
    },
  );
  assert.deepEqual(onLoadFailure, baseExercises, 'query failures must not prevent the base routine from opening');
  assert.match(String(capturedError), /temporary query failure/);
};

void verifySafeFallback();
