import { strict as assert } from 'node:assert';
import { getDailyPlanAction } from './dailyPlanAction.helper';

const plan = {
  gym_template_id: 'push',
  planned_date: '2026-09-28',
  activity_session_id: 'open',
  status: 'completed',
};
const active = {
  id: 'open',
  workout_template_id: 'push',
  start_time: '2026-09-28T12:57:00',
  end_time: null,
};

assert.deepEqual(
  getDailyPlanAction(plan, active),
  {
    isThisSessionActive: true,
    isCompleted: false,
    disabled: false,
    label: 'training.resume',
  },
  'An open linked session must resume even when starting it marked the plan completed',
);

assert.equal(getDailyPlanAction({ ...plan, activity_session_id: null }, active).label, 'training.resume');
assert.equal(
  getDailyPlanAction({ ...plan, activity_session_id: null, planned_date: '2026-09-27' }, active).isThisSessionActive,
  false,
);
assert.equal(
  getDailyPlanAction({ ...plan, activity_session_id: 'other', completedSession: { id: 'other' } }, active).label,
  'training.viewSummary',
);
assert.equal(
  getDailyPlanAction({ ...plan, activity_session_id: null, completedSession: { id: 'done' } }, active).label,
  'training.viewSummary',
  'A completed workout must not become active through a same-template fallback',
);
assert.equal(getDailyPlanAction(plan, { ...active, end_time: '2026-09-28T13:57:00' }).isThisSessionActive, false);

for (const [input, label] of [
  [{ gym_template_id: 'push' }, 'training.start'],
  [{}, 'training.register'],
] as const) {
  const result = getDailyPlanAction(input);
  assert.equal(result.label, label);
  assert.equal(result.disabled, false, 'Planned actions must work without a completed session');
}
assert.equal(getDailyPlanAction({ completedSession: { id: 'done' } }).disabled, false);
assert.equal(getDailyPlanAction({ status: 'completed' }).disabled, true);
console.log('Daily plan actions: passed');
