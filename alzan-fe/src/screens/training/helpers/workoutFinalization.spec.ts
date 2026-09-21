import assert from 'node:assert/strict';
import { prepareWorkoutSetIds, saveWorkoutSequentially } from './workoutFinalization';
import { emptyActiveWorkoutDraft } from './activeWorkoutDraft';

async function run() {
  const draft = { ...emptyActiveWorkoutDraft(), completedSets: ['a-1', 'b-1'] };
  const prepared = prepareWorkoutSetIds(draft, [{ exercise_id: 'a', set_number: 1, id: 'saved-id' }], () => 'new-id');
  assert.deepEqual(prepared.setIds, { 'a-1': 'saved-id', 'b-1': 'new-id' });
  assert.deepEqual(
    prepareWorkoutSetIds(prepared, [], () => 'wrong-id'),
    prepared,
  );
  const saved: number[] = [];
  await assert.rejects(
    saveWorkoutSequentially([1, 2, 3], async n => {
      if (n === 2) throw new Error('offline');
      saved.push(n);
    }),
    /offline/,
  );
  assert.deepEqual(saved, [1]);
  console.log('Workout finalization checks passed');
}
void run();
