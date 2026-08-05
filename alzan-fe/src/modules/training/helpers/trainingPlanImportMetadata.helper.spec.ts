import assert from 'node:assert/strict';
import { resolveTrainingImportMetadata } from './trainingPlanImportMetadata.helper';

assert.deepEqual(resolveTrainingImportMetadata('running', 'Tempo', 'Outdoor'), {
  ok: true,
  workoutGoal: 'tempo_threshold',
  modality: 'outdoor',
});

assert.deepEqual(resolveTrainingImportMetadata('strength', 'Fuerza', 'Free Weights'), {
  ok: true,
  workoutGoal: 'strength',
  modality: 'free_weights',
});

assert.deepEqual(resolveTrainingImportMetadata('running', undefined, undefined), {
  ok: true,
  workoutGoal: null,
  modality: 'outdoor',
});

assert.deepEqual(resolveTrainingImportMetadata('strength', undefined, undefined), {
  ok: true,
  workoutGoal: null,
  modality: 'gym',
});

assert.deepEqual(resolveTrainingImportMetadata('running', 'inventado', 'outdoor'), {
  ok: false,
  invalidFields: ['workout_goal'],
});

assert.deepEqual(resolveTrainingImportMetadata('strength', 'strength', 'parque'), {
  ok: false,
  invalidFields: ['modality'],
});

assert.deepEqual(resolveTrainingImportMetadata('running', 'inventado', 'parque'), {
  ok: false,
  invalidFields: ['workout_goal', 'modality'],
});
