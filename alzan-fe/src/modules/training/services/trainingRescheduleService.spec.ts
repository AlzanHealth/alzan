import assert from 'node:assert/strict';
import {
  buildWorkoutPlanMoveUpdate,
  validateWorkoutPlanMove,
  type MoveWorkoutPlanInput,
} from '../helpers/trainingReschedule.helper';

const baseInput: MoveWorkoutPlanInput = {
  planId: 'plan-1',
  fromDate: '2026-07-06',
  toDate: '2026-07-07',
};

assert.deepEqual(validateWorkoutPlanMove(baseInput), { ok: true });

assert.deepEqual(buildWorkoutPlanMoveUpdate(baseInput.toDate, '2026-07-06T10:00:00.000Z'), {
  planned_date: '2026-07-07',
  status: 'rescheduled',
  updated_at: '2026-07-06T10:00:00.000Z',
});

assert.deepEqual(validateWorkoutPlanMove({ ...baseInput, planId: 'session-activity-1' }), {
  ok: false,
  reason: 'missing_plan',
});

assert.deepEqual(validateWorkoutPlanMove({ ...baseInput, isExtraSession: true }), {
  ok: false,
  reason: 'extra_session',
});

assert.deepEqual(validateWorkoutPlanMove({ ...baseInput, isCompleted: true }), {
  ok: false,
  reason: 'completed',
});

assert.deepEqual(validateWorkoutPlanMove({ ...baseInput, fromDate: '2026-07-06', toDate: '2026-07-06' }), {
  ok: false,
  reason: 'same_date',
});

assert.deepEqual(validateWorkoutPlanMove({ ...baseInput, toDate: '07/07/2026' }), {
  ok: false,
  reason: 'invalid_date',
});
