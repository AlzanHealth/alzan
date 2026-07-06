import { supabase } from '../../../lib/supabaseClient';
import {
  buildWorkoutPlanMoveUpdate,
  validateWorkoutPlanMove,
  type MoveWorkoutPlanInput,
} from '../helpers/trainingReschedule.helper';

export type { MoveWorkoutPlanInput, MoveWorkoutPlanValidation } from '../helpers/trainingReschedule.helper';
export { buildWorkoutPlanMoveUpdate, validateWorkoutPlanMove } from '../helpers/trainingReschedule.helper';

export const moveWorkoutPlan = async (input: MoveWorkoutPlanInput): Promise<void> => {
  const validation = validateWorkoutPlanMove(input);
  if (!validation.ok) {
    throw new Error(`workout_plan_move_${validation.reason}`);
  }

  const { data, error } = await supabase
    .from('workout_plans')
    .update(buildWorkoutPlanMoveUpdate(input.toDate))
    .eq('id', input.planId)
    .eq('planned_date', input.fromDate)
    .neq('status', 'completed')
    .is('completed_at', null)
    .select('id')
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error('workout_plan_move_not_found');
};
