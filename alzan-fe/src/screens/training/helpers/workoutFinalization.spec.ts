import assert from 'node:assert/strict';
import {
  getWorkoutSetMetricValue,
  getWorkoutSetMetrics,
  prepareWorkoutSetIds,
  saveWorkoutSequentially,
} from './workoutFinalization';
import { emptyActiveWorkoutDraft } from './activeWorkoutDraft';

async function run() {
  assert.deepEqual(
    getWorkoutSetMetrics(30, 'Tiempo'),
    { reps: null, duration_s: 30 },
    'finishing a timed set must persist elapsed seconds instead of repetitions',
  );
  assert.deepEqual(getWorkoutSetMetrics(45, 'duration'), { reps: null, duration_s: 45 });
  assert.deepEqual(
    getWorkoutSetMetrics(8, 'Repeticiones'),
    { reps: 8, duration_s: null },
    'new repetition sets do not invent effort durations',
  );
  assert.deepEqual(getWorkoutSetMetrics(12, null), { reps: 12, duration_s: null });
  assert.equal(
    getWorkoutSetMetricValue({ reps: null, duration_s: 40 }, 'Tiempo'),
    40,
    'resume must retain saved seconds',
  );
  assert.equal(getWorkoutSetMetricValue({ reps: 8, duration_s: null }, 'Repeticiones'), 8);
  assert.equal(getWorkoutSetMetricValue({ reps: 30 }, 'Tiempo'), 30, 'legacy timed values remain readable');
  const mixedMetricSet = { reps: 8, duration_s: 40 };
  assert.deepEqual(
    getWorkoutSetMetrics(10, 'Repeticiones', mixedMetricSet),
    { reps: 10, duration_s: 40 },
    'editing repetitions must preserve a wearable effort duration',
  );
  assert.equal(getWorkoutSetMetricValue(mixedMetricSet, 'Repeticiones'), 8, 'effort duration must not replace reps');
  assert.equal(getWorkoutSetMetricValue(mixedMetricSet, 'Tiempo'), 40);
  assert.equal(getWorkoutSetMetricValue(mixedMetricSet, null), 8, 'unknown types preserve repetitions');
  assert.deepEqual(
    getWorkoutSetMetrics(getWorkoutSetMetricValue({ reps: 30, duration_s: null }, 'Tiempo') ?? 0, 'Tiempo'),
    { reps: null, duration_s: 30 },
    'editing a legacy timed set canonicalizes seconds using its real catalog type',
  );
  assert.deepEqual(
    getWorkoutSetMetrics(getWorkoutSetMetricValue({ reps: 30, duration_s: null }, null) ?? 0, null),
    { reps: 30, duration_s: null },
    'an unknown exercise type must not reinterpret repetitions as seconds',
  );
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
