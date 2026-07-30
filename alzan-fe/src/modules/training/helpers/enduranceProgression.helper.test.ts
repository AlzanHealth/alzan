import assert from 'node:assert/strict';
import {
  applyProgressionsToSteps,
  applyTemplateSummaryProgression,
  calculateProgressionWeeks,
  createProgressionKey,
  getEligibleProgressionSteps,
  getNextScheduledDateString,
  getProgressionWeekIndex,
  normalizeStepProgressions,
  type ProgressionBuilderStep,
} from './enduranceProgression.helper';

const baseSteps: ProgressionBuilderStep[] = [
  {
    id: 'warmup',
    progression_key: 'warmup-key',
    phase_type: 'warmup',
    duration_type: 'time',
    duration_s: 600,
    target_type: 'none',
    repetitions: 1,
    is_group: false,
  },
  {
    id: 'work',
    progression_key: 'work-key',
    phase_type: 'interval',
    duration_type: 'distance',
    distance_m: 1000,
    target_type: 'pace',
    target_min: 285,
    target_max: 285,
    repetitions: 1,
    is_group: false,
  },
  {
    id: 'recovery',
    progression_key: 'recovery-key',
    phase_type: 'recovery',
    duration_type: 'time',
    duration_s: 90,
    target_type: 'none',
    repetitions: 1,
    is_group: false,
  },
];

assert.equal(getNextScheduledDateString(new Date('2026-06-22T10:00:00'), 2), '2026-06-23');
assert.equal(getNextScheduledDateString(new Date('2026-06-23T10:00:00'), 2), '2026-06-23');
assert.equal(calculateProgressionWeeks('2026-06-23', '2026-06-23'), 1);
assert.equal(calculateProgressionWeeks('2026-06-23', '2026-06-30'), 2);
assert.equal(calculateProgressionWeeks('2026-06-23', '2026-07-07'), 3);
assert.equal(calculateProgressionWeeks('2026-07-07', '2026-06-23'), 0);
assert.equal(calculateProgressionWeeks('invalid', '2026-06-23'), 0);
assert.equal(getProgressionWeekIndex('2026-06-23', '2026-06-23'), 1);
assert.equal(getProgressionWeekIndex('2026-06-23', '2026-06-30'), 2);
assert.equal(getProgressionWeekIndex('2026-06-23', '2026-07-06'), 2);
assert.equal(getProgressionWeekIndex('2026-06-23', '2026-07-07'), 3);
assert.equal(getProgressionWeekIndex('2026-06-23', '2026-06-22'), 0);

const baseTemplateSummary = {
  total_distance_m: 5000,
  total_duration_s: 1800,
};
assert.deepEqual(
  applyTemplateSummaryProgression(baseTemplateSummary, 2, [
    {
      week_index: 2,
      total_distance_m: 8000,
      total_duration_s: 2400,
    },
  ]),
  {
    total_distance_m: 8000,
    total_duration_s: 2400,
  },
);
assert.deepEqual(
  applyTemplateSummaryProgression(baseTemplateSummary, 3, [
    {
      week_index: 3,
      total_distance_m: 10000,
      total_duration_s: null,
    },
  ]),
  {
    total_distance_m: 10000,
    total_duration_s: 1800,
  },
);
assert.deepEqual(applyTemplateSummaryProgression(baseTemplateSummary, 0, []), baseTemplateSummary);

assert.deepEqual(
  getEligibleProgressionSteps(baseSteps, 'running').map(step => step.progression_key),
  ['work-key'],
);
assert.deepEqual(getEligibleProgressionSteps(baseSteps, 'football'), []);

const hyroxSteps: ProgressionBuilderStep[] = [
  {
    id: 'run',
    progression_key: 'hyrox-run',
    phase_type: 'interval',
    duration_type: 'distance',
    distance_m: 1000,
    target_type: 'none',
    repetitions: 1,
    is_group: false,
    hyrox_step_type: 'run',
  },
  {
    id: 'station',
    progression_key: 'hyrox-station',
    phase_type: 'interval',
    duration_type: 'time',
    target_type: 'none',
    repetitions: 1,
    is_group: false,
    hyrox_step_type: 'station',
    reps: 100,
    load_kg: 9,
  },
  {
    id: 'rest',
    progression_key: 'hyrox-rest',
    phase_type: 'recovery',
    duration_type: 'time',
    target_type: 'none',
    repetitions: 1,
    is_group: false,
    hyrox_step_type: 'rest',
  },
];

assert.deepEqual(
  getEligibleProgressionSteps(hyroxSteps, 'hyrox').map(step => step.progression_key),
  ['hyrox-run', 'hyrox-station'],
);

const repeatedBlockSteps: ProgressionBuilderStep[] = [
  {
    id: 'repeat-block',
    progression_key: 'repeat-block-key',
    phase_type: 'interval',
    duration_type: 'lap_button',
    target_type: 'none',
    repetitions: 6,
    is_group: true,
    children: baseSteps,
  },
];

assert.deepEqual(
  getEligibleProgressionSteps(repeatedBlockSteps, 'running').map(step => step.progression_key),
  ['repeat-block-key', 'work-key'],
);

const normalized = normalizeStepProgressions([
  {
    progression_key: 'work-key',
    week_index: 1,
    target_type: 'pace',
    target_min: 280,
    target_max: 280,
  },
  {
    progression_key: 'work-key',
    week_index: 1,
    target_type: 'pace',
    target_min: 270,
    target_max: 270,
  },
  {
    progression_key: '',
    week_index: 1,
    target_min: 260,
  },
  {
    progression_key: 'work-key',
    week_index: 0,
    target_min: 250,
  },
  {
    progression_key: 'empty-key',
    week_index: 1,
    target_type: 'pace',
  },
]);

assert.deepEqual(normalized, [
  {
    progression_key: 'work-key',
    week_index: 1,
    target_type: 'pace',
    target_min: 270,
    target_max: 270,
  },
]);

const progressedSteps = applyProgressionsToSteps(baseSteps, 1, normalized);
assert.equal(progressedSteps[1].target_min, 270);
assert.equal(progressedSteps[1].target_max, 270);
assert.equal(progressedSteps[0].duration_s, 600);

const durationAndTargetProgressedSteps = applyProgressionsToSteps(baseSteps, 2, [
  {
    progression_key: 'work-key',
    week_index: 2,
    distance_m: 1200,
    target_type: 'heart_rate',
    target_min: 3,
    target_max: 3,
  },
]);
assert.equal(durationAndTargetProgressedSteps[1].distance_m, 1200);
assert.equal(durationAndTargetProgressedSteps[1].target_type, 'heart_rate');
assert.equal(durationAndTargetProgressedSteps[1].target_min, 3);
assert.equal(durationAndTargetProgressedSteps[1].target_max, 3);

const repeatedProgressedSteps = applyProgressionsToSteps(repeatedBlockSteps, 3, [
  {
    progression_key: 'repeat-block-key',
    week_index: 3,
    repetitions: 8,
  },
]);
assert.equal(repeatedProgressedSteps[0].repetitions, 8);

const twoDifferentIntervalSteps: ProgressionBuilderStep[] = [
  {
    id: 'short-fast-interval',
    progression_key: 'short-fast-key',
    phase_type: 'interval',
    duration_type: 'distance',
    distance_m: 400,
    target_type: 'pace',
    target_min: 255,
    target_max: 255,
    repetitions: 1,
    is_group: false,
  },
  {
    id: 'long-steady-interval',
    progression_key: 'long-steady-key',
    phase_type: 'interval',
    duration_type: 'time',
    duration_s: 600,
    target_type: 'heart_rate',
    target_min: 2,
    target_max: 2,
    repetitions: 1,
    is_group: false,
  },
];

assert.deepEqual(
  getEligibleProgressionSteps(twoDifferentIntervalSteps, 'running').map(step => step.progression_key),
  ['short-fast-key', 'long-steady-key'],
);

const twoDifferentProgressedIntervals = applyProgressionsToSteps(twoDifferentIntervalSteps, 4, [
  {
    progression_key: 'short-fast-key',
    week_index: 4,
    distance_m: 500,
    target_type: 'pace',
    target_min: 245,
    target_max: 245,
  },
  {
    progression_key: 'long-steady-key',
    week_index: 4,
    duration_s: 720,
    target_type: 'heart_rate',
    target_min: 3,
    target_max: 3,
  },
]);
assert.equal(twoDifferentProgressedIntervals[0].distance_m, 500);
assert.equal(twoDifferentProgressedIntervals[0].target_min, 245);
assert.equal(twoDifferentProgressedIntervals[1].duration_s, 720);
assert.equal(twoDifferentProgressedIntervals[1].target_min, 3);
assert.equal(twoDifferentProgressedIntervals[0].progression_key, 'short-fast-key');
assert.equal(twoDifferentProgressedIntervals[1].progression_key, 'long-steady-key');

const stableKey = createProgressionKey();
assert.match(stableKey, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
assert.notEqual(stableKey, createProgressionKey());

console.log('enduranceProgression.helper tests passed');
