import assert from 'node:assert/strict';
import { test } from 'node:test';
import { workoutSetProgress } from './workoutSetProgress';

test('counts only this exercise and its currently visible sets', () => {
  assert.deepEqual(workoutSetProgress('bench', 3, 0, new Set(['bench-1', 'bench-3', 'bench-4', 'other-2'])), {
    total: 3,
    completed: 2,
    canCollapse: false,
  });
});
test('only exercises with every set completed can be folded', () => {
  const completed = new Set(['bench-1', 'bench-2', 'bench-3']);
  assert.equal(workoutSetProgress('bench', 3, 0, completed).canCollapse, true);
  assert.equal(workoutSetProgress('bench', 3, 1, completed).canCollapse, false);
  assert.equal(workoutSetProgress('bench', 0, 0, completed).canCollapse, false);
  assert.equal(workoutSetProgress('bench', 3, -3, completed).canCollapse, false);
});
