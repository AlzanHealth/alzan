import assert from 'node:assert/strict';
import {
  buildGymSetModeDefaults,
  getGymSetModeLabel,
  getNextGymSetMode,
  getWorkoutSetTypeForGymSetMode,
  parseGymSetModeRecord,
  parseWarmupSetRecordAsGymSetModes,
} from './gymSetMode.helper';

assert.deepEqual(
  buildGymSetModeDefaults([{ exercise_id: 'exercise-a', target_sets: 3, is_warmup: false, drop_set_mode: 'none' }]),
  {},
);

assert.deepEqual(
  buildGymSetModeDefaults([{ exercise_id: 'exercise-a', target_sets: 3, is_warmup: true, drop_set_mode: 'all' }]),
  {
    'exercise-a-1': 'warmup',
    'exercise-a-2': 'warmup',
    'exercise-a-3': 'warmup',
  },
);

assert.deepEqual(
  buildGymSetModeDefaults([{ exercise_id: 'exercise-a', target_sets: 3, is_warmup: false, drop_set_mode: 'last' }]),
  {
    'exercise-a-3': 'drop_set',
  },
);

assert.deepEqual(
  buildGymSetModeDefaults([{ exercise_id: 'exercise-a', target_sets: 2, is_warmup: false, drop_set_mode: 'all' }]),
  {
    'exercise-a-1': 'drop_set',
    'exercise-a-2': 'drop_set',
  },
);

assert.equal(getNextGymSetMode('normal'), 'warmup');
assert.equal(getNextGymSetMode('warmup'), 'drop_set');
assert.equal(getNextGymSetMode('drop_set'), 'normal');

assert.equal(getGymSetModeLabel('normal', 2), '2');
assert.equal(getGymSetModeLabel('warmup', 2), 'W');
assert.equal(getGymSetModeLabel('drop_set', 2), 'D');

assert.equal(getWorkoutSetTypeForGymSetMode('normal'), 'normal');
assert.equal(getWorkoutSetTypeForGymSetMode('warmup'), 'warmup');
assert.equal(getWorkoutSetTypeForGymSetMode('drop_set'), 'drop_set');

assert.deepEqual(parseGymSetModeRecord({ 'exercise-a-1': 'drop_set', 'exercise-a-2': 'bad' }), {
  'exercise-a-1': 'drop_set',
});

assert.deepEqual(parseWarmupSetRecordAsGymSetModes({ 'exercise-a-1': true, 'exercise-a-2': false }), {
  'exercise-a-1': 'warmup',
});

console.log('gymSetMode.helper tests passed');
