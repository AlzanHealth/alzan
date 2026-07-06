import type { WorkoutPlanUpdate } from '../../../types/requests.types';

export type MoveWorkoutPlanInput = {
  planId: string;
  fromDate: string;
  toDate: string;
  isCompleted?: boolean;
  isExtraSession?: boolean;
};

export type MoveWorkoutPlanValidation =
  | { ok: true }
  | { ok: false; reason: 'completed' | 'extra_session' | 'invalid_date' | 'missing_plan' | 'same_date' };

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export const validateWorkoutPlanMove = (input: MoveWorkoutPlanInput): MoveWorkoutPlanValidation => {
  if (!input.planId || input.planId.startsWith('session-')) return { ok: false, reason: 'missing_plan' };
  if (input.isExtraSession) return { ok: false, reason: 'extra_session' };
  if (input.isCompleted) return { ok: false, reason: 'completed' };
  if (!ISO_DATE_PATTERN.test(input.fromDate) || !ISO_DATE_PATTERN.test(input.toDate)) {
    return { ok: false, reason: 'invalid_date' };
  }
  if (input.fromDate === input.toDate) return { ok: false, reason: 'same_date' };
  return { ok: true };
};

export const buildWorkoutPlanMoveUpdate = (
  toDate: string,
  updatedAt = new Date().toISOString(),
): WorkoutPlanUpdate => ({
  planned_date: toDate,
  status: 'rescheduled',
  updated_at: updatedAt,
});
