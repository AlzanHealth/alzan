import assert from 'node:assert/strict';
import { getDefaultGymExerciseTargets } from './gymExerciseDefaults.helper';

assert.deepEqual(getDefaultGymExerciseTargets('time'), {
  target_reps_min: 60,
  target_reps_max: 60,
});

assert.deepEqual(getDefaultGymExerciseTargets('duracion'), {
  target_reps_min: 60,
  target_reps_max: 60,
});

assert.deepEqual(getDefaultGymExerciseTargets('reps'), {
  target_reps_min: 8,
  target_reps_max: 8,
});

assert.deepEqual(getDefaultGymExerciseTargets(null), {
  target_reps_min: 8,
  target_reps_max: 8,
});

console.log('gymExerciseDefaults.helper tests passed');
