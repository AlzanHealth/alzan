import assert from 'node:assert/strict';
import type { ExerciseUserOverride } from '../services/exerciseCatalogService';
import { applyExerciseUserOverride } from './exerciseUserOverride';

const originalExercise = {
  id: 'exercise-1',
  base_name_es: 'Press banca',
  base_name_en: 'Bench press',
  description_es: 'Descripción común',
  description_en: 'Shared description',
  primary_muscle_id: 1,
  secondary_muscle_id: null,
  equipment_id: 2,
  load_type: 'external' as const,
  exercise_type: { id: 7, code: 'reps' },
};

const override: ExerciseUserOverride = {
  user_id: 'user-1',
  exercise_id: 'exercise-1',
  base_name_es: 'Mi press de pecho',
  base_name_en: 'My chest press',
  description_es: 'Mi descripción',
  description_en: 'My description',
  primary_muscle_id: 3,
  secondary_muscle_id: 4,
  equipment_id: 5,
  load_type: 'mixed',
  created_at: '2026-10-21T00:00:00.000Z',
  updated_at: '2026-10-21T00:00:00.000Z',
  primary_muscle: { id: 3, code: 'chest', muscle_group_translations: null },
  secondary_muscle: { id: 4, code: 'triceps', muscle_group_translations: null },
  equipment: { id: 5, code: 'machine', equipment_translations: null },
};

const effectiveExercise = applyExerciseUserOverride(originalExercise, override);

assert.equal(effectiveExercise.base_name_es, 'Mi press de pecho');
assert.equal(effectiveExercise.description_en, 'My description');
assert.equal(effectiveExercise.primary_muscle_id, 3);
assert.equal(effectiveExercise.equipment_id, 5);
assert.deepEqual(effectiveExercise.exercise_type, originalExercise.exercise_type);
assert.equal(originalExercise.base_name_es, 'Press banca', 'personal edits must not mutate the shared row');
assert.equal(
  applyExerciseUserOverride(originalExercise).base_name_es,
  'Press banca',
  'the shared values remain the fallback when no override exists',
);

console.log('Personal exercise override merge checks passed');
