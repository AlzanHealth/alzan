import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  workoutBlocks,
  effectiveWorkoutExercises,
  moveWorkoutBlock,
  detachWorkoutExercise,
  substituteWorkoutExercise,
  nextWorkoutAutoSet,
  addWorkoutExercise,
} from './workoutOrganization';
import { getActiveWorkoutDraftStore, type ActiveWorkoutDraft } from './activeWorkoutDraft';
import type { WorkoutTemplateExerciseWithDetails } from '../ActiveWorkoutScreen';
import type { ExerciseWithDetails } from '../../../types/training';

const detail = (id: string): ExerciseWithDetails => ({
  id,
  name: id,
  base_name_es: id,
  base_name_en: null,
  created_at: '2026-09-21T00:00:00Z',
  description_en: null,
  description_es: null,
  archived_at: null,
  difficulty: null,
  equipment_id: null,
  exercise_type_id: null,
  is_custom: false,
  load_type: 'external',
  owner_user_id: null,
  primary_muscle_id: null,
  secondary_muscle_id: null,
  exercise_type_code: 'Repeticiones',
});
const exercises: WorkoutTemplateExerciseWithDetails[] = ['a', 'b', 'c', 'd'].map((exercise_id, order_index) => ({
  id: exercise_id,
  exercise_id,
  target_sets: 3,
  target_reps_min: 8,
  target_reps_max: 10,
  rest_seconds: 60,
  target_weight_kg: 70,
  exercise: detail(exercise_id),
  workout_template_id: 'original-template',
  user_id: null,
  notes: null,
  target_rpe: null,
  order_index,
  is_warmup: false,
  drop_set_mode: 'none',
  superset_next_exercise_id: null,
}));
const makeDraft = (): ActiveWorkoutDraft => ({
  version: 1,
  inputs: { 'a-1': { weight: '70', reps: '9' } },
  setModes: { 'a-1': 'warmup' },
  completedSets: [],
  extraSets: { a: 1 },
  adhocExercises: [],
  hiddenExercises: [],
  exerciseOrder: ['a', 'b', 'c', 'd'],
  supersetLinks: ['a|b'],
});
const original = makeDraft();
assert.deepEqual(workoutBlocks(original), [['a', 'b'], ['c'], ['d']]);
const moved = moveWorkoutBlock(original, 2, 1);
assert.deepEqual(moved.exerciseOrder, ['a', 'b', 'd', 'c']);
assert.deepEqual(moveWorkoutBlock(original, 0, 2).exerciseOrder, ['c', 'd', 'a', 'b']);
assert.deepEqual(original.exerciseOrder, ['a', 'b', 'c', 'd']);
assert.equal(moved.inputs, original.inputs);
const detached = detachWorkoutExercise(original, 'a');
assert.deepEqual(detached.supersetLinks, []);
assert.deepEqual(moveWorkoutBlock(detached, 3, 1).exerciseOrder, ['a', 'd', 'b', 'c']);
const machine = detail('machine');
test('new exercises initialize complete editable input rows atomically', () => {
  const entry = { ...exercises[0], exercise_id: 'machine', exercise: machine };
  const next = addWorkoutExercise(original, entry);
  assert.deepEqual(next.inputs['machine-1'], { weight: '', reps: '8' });
  assert.deepEqual(next.exerciseOrder, [...original.exerciseOrder, 'machine']);
  assert.equal(next.adhocExercises[0], entry);
});
const replaced = substituteWorkoutExercise(original, exercises, 'a', machine, [], null);
assert.deepEqual(replaced.exerciseOrder, ['machine', 'b', 'c', 'd']);
assert.deepEqual(replaced.supersetLinks, ['machine|b']);
assert.deepEqual(replaced.inputs['machine-1'], { weight: '', reps: '9' });
assert.equal(replaced.inputs['a-1'], undefined);
assert.equal(replaced.extraSets.machine, 1);
assert.equal(replaced.setModes['machine-1'], 'warmup');
assert.equal(replaced.adhocExercises[0].target_weight_kg, 0);
assert.ok(replaced.hiddenExercises.includes('a'));
assert.throws(() =>
  substituteWorkoutExercise({ ...original, completedSets: ['a-1'] }, exercises, 'a', machine, [], null),
);
assert.throws(() => substituteWorkoutExercise(original, exercises, 'a', machine, ['a'], null));
assert.throws(() => substituteWorkoutExercise(original, exercises, 'a', machine, [], 'a'));
assert.throws(() => substituteWorkoutExercise(original, exercises, 'a', { ...machine, id: 'b' }, [], null));
assert.throws(() => substituteWorkoutExercise(original, exercises, 'a', { ...machine, id: 'a' }, [], null));
const timed = substituteWorkoutExercise(
  original,
  exercises,
  'a',
  { ...machine, exercise_type_code: 'Tiempo' },
  [],
  null,
);
assert.equal(timed.inputs['machine-1'].reps, '60');
assert.equal(timed.setModes['machine-1'], 'normal');
assert.equal(timed.adhocExercises[0].rest_seconds, 60);
console.log('Workout organization checks passed');

test('autoplay resolves the next timed exercise using the applied order without completing reps exercises', () => {
  const timedExercises = exercises.map(item => ({
    ...item,
    exercise: { ...detail(item.exercise_id), exercise_type_code: 'Tiempo' },
  }));
  const reordered = { ...original, exerciseOrder: ['a', 'd', 'b', 'c'], extraSets: {} };
  assert.equal(nextWorkoutAutoSet(reordered, timedExercises, 'a', 4)?.exercise.exercise_id, 'd');
  assert.equal(nextWorkoutAutoSet(reordered, exercises, 'a', 4), null);
  assert.equal(nextWorkoutAutoSet(reordered, timedExercises, 'c', 4), null);
});

test('replacement and organization survive a fresh local store without changing the template', async () => {
  const values = new Map<string, string>();
  const adapter = () => ({
    async getItem(key: string) {
      return values.get(key) ?? null;
    },
    async setItem(key: string, value: string) {
      values.set(key, value);
    },
    async removeItem(key: string) {
      values.delete(key);
    },
  });
  const templateBefore = JSON.stringify(exercises);
  const store = getActiveWorkoutDraftStore(adapter(), 'u', 's');
  await store.hydrate(original);
  const changed = moveWorkoutBlock(replaced, 2, 0);
  store.update(() => changed);
  await store.flush();
  const fresh = getActiveWorkoutDraftStore(adapter(), 'u', 's');
  await fresh.hydrate(original);
  assert.deepEqual(fresh.getSnapshot().draft, changed);
  assert.equal(JSON.stringify(exercises), templateBefore);
});

test('replacing an exercise and selecting the original again preserves active targets and unique entries', () => {
  const restored = substituteWorkoutExercise(
    replaced,
    effectiveWorkoutExercises(replaced, exercises),
    'machine',
    detail('a'),
    [],
    null,
  );
  assert.deepEqual(restored.exerciseOrder, original.exerciseOrder);
  assert.deepEqual(restored.hiddenExercises, ['machine']);
  assert.deepEqual(
    restored.adhocExercises.map(item => item.exercise_id),
    ['a'],
  );
  const effective = effectiveWorkoutExercises(restored, exercises);
  assert.equal(effective.filter(item => item.exercise_id === 'a').length, 1);
  assert.equal(
    effective.some(item => item.exercise_id === 'machine'),
    false,
  );
  assert.deepEqual(restored.inputs['a-1'], { weight: '', reps: '9' });
  assert.equal(restored.inputs['machine-1'], undefined);
  assert.equal(restored.setModes['a-1'], 'warmup');
  assert.equal(restored.extraSets.a, 1);
  assert.deepEqual(restored.supersetLinks, ['a|b']);
  assert.equal(restored.adhocExercises[0].target_reps_min, 8);
  assert.equal(restored.adhocExercises[0].target_reps_max, 10);
  assert.equal(restored.adhocExercises[0].target_sets, 3);
  assert.equal(restored.adhocExercises[0].rest_seconds, 60);
  assert.equal(restored.adhocExercises[0].target_weight_kg, 0);
});
