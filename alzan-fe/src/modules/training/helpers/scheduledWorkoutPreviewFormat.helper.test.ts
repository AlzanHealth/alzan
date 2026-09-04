import assert from 'node:assert/strict';
import {
  formatEnduranceStepDuration,
  formatEnduranceStepTarget,
  formatGymExercisePrescription,
  PreviewLabels,
} from './scheduledWorkoutPreviewFormat.helper';

const labels: PreviewLabels = {
  reps: 'Reps',
  sets: 'Sets',
  time: 'Time',
  rest: 'Rest',
  hrZone: 'HR Zone',
  heartRate: 'Heart rate',
  pace: 'Pace',
  speed: 'Speed',
  power: 'Power',
  distance: 'Distance',
  duration: 'Duration',
  load: 'Load',
};

assert.equal(
  formatGymExercisePrescription(
    {
      target_sets: 2,
      target_reps_min: 8,
      target_reps_max: 8,
      rest_seconds: 90,
      exercise: { load_type: 'reps' },
    },
    labels,
  ),
  '2 Sets · 8 reps · Rest 1:30',
);

assert.equal(
  formatGymExercisePrescription(
    {
      target_sets: 3,
      target_reps_min: 60,
      target_reps_max: 60,
      rest_seconds: 30,
      exercise: { load_type: 'time' },
    },
    labels,
  ),
  '3 Sets · 60s time · Rest 0:30',
);

assert.equal(
  formatEnduranceStepDuration(
    {
      duration_type: 'distance',
      distance_m: 1000,
      target_type: 'pace',
      target_min: 285,
      target_max: 285,
      repetitions: null,
    },
    labels,
  ),
  'Distance: 1.00 km',
);

assert.equal(
  formatEnduranceStepDuration(
    {
      duration_type: 'time',
      duration_s: 299.6,
      target_type: 'none',
      repetitions: null,
    },
    labels,
  ),
  'Duration: 5:00',
);

assert.equal(
  formatEnduranceStepTarget(
    {
      duration_type: 'distance',
      distance_m: 1000,
      target_type: 'pace',
      target_min: 285,
      target_max: 285,
      repetitions: null,
    },
    'running',
    labels,
  ),
  'Pace: 4:45 min/km',
);

assert.equal(
  formatEnduranceStepTarget(
    {
      duration_type: 'distance',
      distance_m: 400,
      target_type: 'pace',
      target_min: 240,
      target_max: 240,
      repetitions: null,
    },
    'running',
    labels,
  ),
  'Pace: 4:00 min/km',
);

assert.equal(
  formatEnduranceStepTarget(
    {
      duration_type: 'time',
      duration_s: 600,
      target_type: 'heart_rate',
      target_min: 3,
      target_max: 3,
      repetitions: null,
    },
    'running',
    labels,
  ),
  'HR Zone 3',
);

assert.equal(
  formatEnduranceStepTarget(
    {
      duration_type: 'time',
      duration_s: 1800,
      target_type: 'speed',
      target_min: 32,
      target_max: 32,
      repetitions: null,
    },
    'cycling',
    labels,
  ),
  'Speed: 32 km/h',
);

assert.equal(
  formatEnduranceStepTarget(
    {
      duration_type: 'time',
      duration_s: null,
      target_type: 'none',
      repetitions: null,
      hyrox_step_type: 'station',
      reps: 100,
      load_kg: 9,
    },
    'hyrox',
    labels,
  ),
  '100 reps · Load: 9.0 kg',
);

assert.equal(
  formatEnduranceStepTarget(
    {
      duration_type: 'time',
      duration_s: 900,
      target_type: 'pace',
      target_min: 285,
      target_max: 300,
      repetitions: null,
    },
    'running',
    labels,
    'km',
    { includeLabel: false },
  ),
  '4:45 min/km - 5:00 min/km',
);

console.log('scheduledWorkoutPreviewFormat.helper tests passed');
