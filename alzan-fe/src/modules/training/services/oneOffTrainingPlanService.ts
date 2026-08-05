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

export const syncOneOffTrainingPlan = async ({
  userId,
  templateId,
  plannedDate,
  kind,
}: OneOffPlanInput): Promise<void> => {
  const { data: existingPlan, error: selectError } = await getActivePlanQuery({ userId, templateId, kind })
    .limit(1)
    .maybeSingle();
  if (selectError) throw selectError;

  const templateColumn = getTemplateColumn(kind);
  if (existingPlan) {
    const { error } = await supabase
      .from('workout_plans')
      .update({ planned_date: plannedDate })
      .eq('id', existingPlan.id);
    if (error) throw error;
    return;
  }

  const { error } = await supabase.from('workout_plans').insert({
    user_id: userId,
    planned_date: plannedDate,
    status: 'planned',
    [templateColumn]: templateId,
  });
  if (error) throw error;
};

export const removeOneOffTrainingPlans = async ({
  userId,
  templateId,
  kind,
}: Omit<OneOffPlanInput, 'plannedDate'>): Promise<void> => {
  const templateColumn = getTemplateColumn(kind);
  const { error } = await supabase
    .from('workout_plans')
    .delete()
    .eq('user_id', userId)
    .eq(templateColumn, templateId)
    .in('status', ['planned', 'rescheduled'])
    .is('completed_at', null);
  if (error) throw error;
};
