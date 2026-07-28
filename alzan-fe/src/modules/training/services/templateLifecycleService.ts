import { format } from 'date-fns';
import { supabase } from '../../../lib/supabaseClient';
import { buildTemplateExpirationPlan, type TemplateLifecycleRow } from '../helpers/templateLifecycle.helper';

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

type TemplateTable = 'workout_templates' | 'endurance_workout_templates';
type TemplateForeignKey = 'gym_template_id' | 'endurance_template_id';

const selectLifecycleTemplates = async (table: TemplateTable, userId: string): Promise<TemplateLifecycleRow[]> => {
  const { data, error } = await supabase
    .from(table)
    .select('id, user_id, recurrence_start_date, recurrence_end_date, auto_delete_after_end')
    .eq('user_id', userId)
    .not('recurrence_end_date', 'is', null)
    .returns<TemplateLifecycleRow[]>();

  if (error) throw error;
  return data ?? [];
};

const unlinkAndDeleteTemplate = async ({
  table,
  templateId,
  foreignKey,
  endDate,
  userId,
}: {
  table: TemplateTable;
  templateId: string;
  foreignKey: TemplateForeignKey;
  endDate: string;
  userId: string;
}): Promise<void> => {
  const plansQuery = supabase
    .from('workout_plans')
    .delete()
    .eq(foreignKey, templateId)
    .eq('user_id', userId)
    .gt('planned_date', endDate)
    .is('completed_at', null)
    .neq('status', 'completed');
  const { error: plansError } = await plansQuery;
  if (plansError) throw plansError;

  const { error: unlinkPlansError } = await supabase
    .from('workout_plans')
    .update({ [foreignKey]: null })
    .eq(foreignKey, templateId)
    .eq('user_id', userId);
  if (unlinkPlansError) throw unlinkPlansError;

  const sessionForeignKey = table === 'workout_templates' ? 'workout_template_id' : 'endurance_template_id';
  const { error: unlinkSessionsError } = await supabase
    .from('activity_sessions')
    .update({ [sessionForeignKey]: null })
    .eq(sessionForeignKey, templateId)
    .eq('user_id', userId);
  if (unlinkSessionsError) throw unlinkSessionsError;

  if (table === 'workout_templates') {
    const { error: translationsError } = await supabase
      .from('workout_template_translations')
      .delete()
      .eq('workout_template_id', templateId);
    if (translationsError) throw translationsError;
  }

  const { error: templateError } = await supabase.from(table).delete().eq('id', templateId).eq('user_id', userId);
  if (templateError) throw templateError;
};

const activeCleanups = new Map<string, Promise<number>>();

const expireTrainingTemplatesInternal = async (
  userId: string,
  localDate: string = format(new Date(), 'yyyy-MM-dd'),
): Promise<number> => {
  const [gymTemplates, enduranceTemplates] = await Promise.all([
    selectLifecycleTemplates('workout_templates', userId),
    selectLifecycleTemplates('endurance_workout_templates', userId),
  ]);

  let deletedCount = 0;
  const candidates: Array<{
    table: TemplateTable;
    foreignKey: TemplateForeignKey;
    template: TemplateLifecycleRow;
  }> = [
    ...gymTemplates.map(template => ({
      table: 'workout_templates' as const,
      foreignKey: 'gym_template_id' as const,
      template,
    })),
    ...enduranceTemplates.map(template => ({
      table: 'endurance_workout_templates' as const,
      foreignKey: 'endurance_template_id' as const,
      template,
    })),
  ];

  for (const candidate of candidates) {
    const expiration = buildTemplateExpirationPlan(candidate.template, localDate);
    if (!expiration) continue;

    await unlinkAndDeleteTemplate({
      table: candidate.table,
      templateId: candidate.template.id,
      foreignKey: candidate.foreignKey,
      endDate: expiration.deleteFuturePlansAfter,
      userId,
    });
    deletedCount += 1;
  }

  return deletedCount;
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
