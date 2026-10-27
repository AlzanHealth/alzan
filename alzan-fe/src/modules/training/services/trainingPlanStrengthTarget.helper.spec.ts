import assert from 'node:assert/strict';
import {
  getTrainingPlanExerciseMetricError,
  getTrainingPlanExerciseMetricValidationErrors,
  getTrainingPlanStrengthTargetValues,
} from './trainingPlanStrengthTarget.helper';
import type { TrainingExerciseResolution } from './trainingPlanImportExerciseResolver';
import type { TrainingPlanImportDocument } from './trainingPlanImportContract';

const timedExercise = {
  exercise_name: 'Plancha lateral',
  order_index: 0,
  sets: 3,
  duration_s: 30,
};

assert.deepEqual(getTrainingPlanStrengthTargetValues(timedExercise, 8), {
  target_reps_min: 30,
  target_reps_max: 30,
});
assert.deepEqual(
  getTrainingPlanStrengthTargetValues({ exercise_name: 'Sentadilla', order_index: 0, sets: 3, reps: 8 }, 8),
  { target_reps_min: 8, target_reps_max: 8 },
);
assert.deepEqual(
  getTrainingPlanStrengthTargetValues(
    { exercise_name: 'Dominadas', order_index: 0, sets: 3, reps_min: 6, reps_max: 10 },
    null,
  ),
  { target_reps_min: 6, target_reps_max: 10 },
);

assert.equal(getTrainingPlanExerciseMetricError(timedExercise, 'Tiempo'), null);
assert.deepEqual(
  getTrainingPlanExerciseMetricError({ exercise_name: 'Plancha lateral', order_index: 0, sets: 3, reps: 30 }, 'Tiempo'),
  { kind: 'timed_needs_duration', exerciseName: 'Plancha lateral' },
);
assert.deepEqual(
  getTrainingPlanExerciseMetricError({ exercise_name: 'Sentadilla', order_index: 0, sets: 3, duration_s: 30 }, 'reps'),
  { kind: 'reps_need_repetitions', exerciseName: 'Sentadilla' },
);
assert.deepEqual(
  getTrainingPlanExerciseMetricError(
    { exercise_name: 'Ejercicio sin tipo conocido', order_index: 0, sets: 3, duration_s: 30 },
    null,
  ),
  { kind: 'timed_catalog_type_required', exerciseName: 'Ejercicio sin tipo conocido' },
  'a timed prescription requires a verified time-based catalog exercise',
);

assert.equal(
  getTrainingPlanExerciseMetricError({ exercise_name: 'Plancha lateral', order_index: 0, sets: 3, reps: 30 }, 'Tiempo')
    ?.kind,
  'timed_needs_duration',
);
assert.equal(
  getTrainingPlanExerciseMetricError({ exercise_name: 'Sentadilla', order_index: 0, sets: 3, duration_s: 30 }, 'reps')
    ?.kind,
  'reps_need_repetitions',
);

const timedPlan: TrainingPlanImportDocument = {
  format: 'alzan-training-plan',
  version: 1,
  plan_name: 'Plan isométrico',
  start_date: '2026-08-04',
  end_date: '2026-08-04',
  weeks: [
    {
      week_number: 1,
      sessions: [
        {
          date: '2026-08-04',
          sport: 'strength',
          name: 'Core',
          exercises: [timedExercise],
        },
      ],
    },
  ],
};
const timedResolution: TrainingExerciseResolution = {
  resolutionKey: '0:plancha lateral',
  sourceName: 'Plancha lateral',
  candidates: [],
  selectedCandidate: { id: 'plank', base_name_es: 'Plancha lateral', base_name_en: null, exercise_type: 'Tiempo' },
};
const timedResolutions = [timedResolution];
assert.deepEqual(getTrainingPlanExerciseMetricValidationErrors(timedPlan, timedResolutions), []);
assert.deepEqual(
  getTrainingPlanExerciseMetricValidationErrors(timedPlan, [
    {
      ...timedResolution,
      selectedCandidate: { id: 'plank', base_name_es: 'Plancha lateral', base_name_en: null, exercise_type: 'reps' },
    },
  ]),
  [
    {
      path: 'weeks[0].sessions[0].exercises[0]',
      issue: { kind: 'reps_need_repetitions', exerciseName: 'Plancha lateral' },
    },
  ],
  'the import review must surface metric and catalog-type mismatches before saving',
);

console.log('trainingPlanStrengthTarget helper tests passed');
