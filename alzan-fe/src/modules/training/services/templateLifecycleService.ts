import { format } from 'date-fns';
import { supabase } from '../../../lib/supabaseClient';

export { buildTemplateExpirationPlan, isTemplateExpired } from '../helpers/templateLifecycle.helper';
export type { TemplateLifecycleRow } from '../helpers/templateLifecycle.helper';

export const deleteFuturePlansOutsideGymRecurrence = async ({
  userId,
  templateId,
  recurrenceEndDate,
}: {
  userId: string;
  templateId: string;
  recurrenceEndDate: string | null | undefined;
}): Promise<void> => {
  if (!recurrenceEndDate) return;
  const { error } = await supabase
    .from('workout_plans')
    .delete()
    .eq('user_id', userId)
    .eq('gym_template_id', templateId)
    .gt('planned_date', recurrenceEndDate)
    .is('completed_at', null)
    .neq('status', 'completed');
  if (error) throw error;
};

const activeCleanups = new Map<string, Promise<number>>();

const expireTrainingTemplatesInternal = async (
  userId: string,
  localDate: string = format(new Date(), 'yyyy-MM-dd'),
): Promise<number> => {
  if (!userId) throw new Error('Authenticated user is required');
  const { data, error } = await supabase.rpc('expire_training_templates', {
    p_local_date: localDate,
  });
  if (error) throw error;
  return Number(data ?? 0);
};

export const expireTrainingTemplates = (userId: string, localDate?: string): Promise<number> => {
  const activeCleanup = activeCleanups.get(userId);
  if (activeCleanup) return activeCleanup;

  const cleanup = expireTrainingTemplatesInternal(userId, localDate).finally(() => {
    activeCleanups.delete(userId);
  });
  activeCleanups.set(userId, cleanup);

  return cleanup;
};
