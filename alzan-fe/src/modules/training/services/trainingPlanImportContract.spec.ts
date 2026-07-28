import assert from 'node:assert/strict';
import { parseTrainingPlanJson } from './trainingPlanImportContract';

const weekdayForDate = (date: string) =>
  ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'][
    new Date(`${date}T00:00:00.000Z`).getUTCDay()
  ];

const runningSession = (date: string, template_key = 'base-running') => ({
  date,
  weekday: weekdayForDate(date),
  sport: 'running',
  name: 'Intervalos',
  template_key,
  running_steps: [
    { phase_type: 'warmup', duration_type: 'time', duration_s: 600 },
    { phase_type: 'interval', duration_type: 'distance', distance_m: 800, repetitions: 6, progression_key: 'work' },
  ],
});

const strengthSession = (date: string) => ({
  date,
  weekday: weekdayForDate(date),
  sport: 'strength',
  name: 'Fuerza',
  exercises: [{ exercise_id: 'squat', order_index: 0, sets: 4, reps: 6, weight_kg: 80 }],
});

const validDocument = {
  format: 'alzan-training-plan',
  version: 1,
  plan_name: 'Base 4 semanas',
  start_date: '2026-08-03',
  end_date: '2026-08-30',
  weeks: [
    { week_number: 1, sessions: [runningSession('2026-08-03'), strengthSession('2026-08-04')] },
    { week_number: 2, sessions: [runningSession('2026-08-10'), strengthSession('2026-08-11')] },
  ],
};

const parsed = parseTrainingPlanJson(JSON.stringify(validDocument));
assert.equal(parsed.ok, true);
if (parsed.ok) {
  assert.equal(parsed.value.weeks.length, 2);
  assert.equal(parsed.value.weeks[0].sessions[0].weekday, 'lunes');
  assert.equal(parsed.value.weeks[0].sessions[0].running_steps?.[1].repetitions, 6);
  assert.equal(parsed.value.weeks[1].sessions[1].exercises?.[0].weight_kg, 80);
}

const duplicate = parseTrainingPlanJson(
  JSON.stringify({
    ...validDocument,
    weeks: [{ week_number: 1, sessions: [runningSession('2026-08-03'), runningSession('2026-08-03')] }],
  }),
);
assert.equal(duplicate.ok, false);
if (!duplicate.ok) assert.ok(duplicate.errors.some(error => error.code === 'duplicate_date'));

const unsupportedSport = parseTrainingPlanJson(
  JSON.stringify({
    ...validDocument,
    weeks: [{ week_number: 1, sessions: [{ ...runningSession('2026-08-03'), sport: 'cycling' }] }],
  }),
);
assert.equal(unsupportedSport.ok, false);
if (!unsupportedSport.ok) assert.ok(unsupportedSport.errors.some(error => error.code === 'unsupported_sport'));

const mismatchedWeekday = parseTrainingPlanJson(
  JSON.stringify({
    ...validDocument,
    weeks: [{ week_number: 1, sessions: [{ ...runningSession('2026-08-03'), weekday: 'martes' }] }],
  }),
);
assert.equal(mismatchedWeekday.ok, false);
if (!mismatchedWeekday.ok) assert.ok(mismatchedWeekday.errors.some(error => error.code === 'weekday_mismatch'));
