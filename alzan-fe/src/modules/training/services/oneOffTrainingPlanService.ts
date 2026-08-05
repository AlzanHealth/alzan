import { supabase } from '../../../lib/supabaseClient';

type OneOffTemplateKind = 'endurance' | 'gym';

type OneOffPlanInput = {
  userId: string;
  templateId: string;
  plannedDate: string;
  kind: OneOffTemplateKind;
};

const getTemplateColumn = (kind: OneOffTemplateKind) =>
  kind === 'endurance' ? 'endurance_template_id' : 'gym_template_id';

const getActivePlanQuery = ({ userId, templateId, kind }: Omit<OneOffPlanInput, 'plannedDate'>) =>
  supabase
    .from('workout_plans')
    .select('id, planned_date')
    .eq('user_id', userId)
    .eq(getTemplateColumn(kind), templateId)
    .eq('is_one_off_schedule', true)
    .in('status', ['planned', 'rescheduled'])
    .is('completed_at', null)
    .order('planned_date', { ascending: true });

export const getOneOffTrainingPlanDate = async ({
  userId,
  templateId,
  kind,
}: Omit<OneOffPlanInput, 'plannedDate'>): Promise<string | null> => {
  const { data, error } = await getActivePlanQuery({ userId, templateId, kind }).limit(1).maybeSingle();
  if (error) throw error;
  return data?.planned_date ?? null;
};

export const syncOneOffTrainingPlan = async ({ templateId, plannedDate, kind }: OneOffPlanInput): Promise<void> => {
  const { error } = await supabase.rpc('set_one_off_workout_plan', {
    p_template_id: templateId,
    p_template_kind: kind,
    p_planned_date: plannedDate,
  });
  if (error) throw error;
};

export const removeOneOffTrainingPlans = async ({
  templateId,
  kind,
}: Omit<OneOffPlanInput, 'plannedDate'>): Promise<void> => {
  const { error } = await supabase.rpc('set_one_off_workout_plan', {
    p_template_id: templateId,
    p_template_kind: kind,
  });
  if (error) throw error;
};
