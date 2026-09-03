import { supabase } from '../../../lib/supabaseClient';
import {
  EnduranceWorkoutStep,
  EnduranceWorkoutStepProgression,
  EnduranceWorkoutStepProgressionInsert,
  EnduranceWorkoutTemplate,
  EnduranceWorkoutTemplateProgression,
} from '../../../types/requests.types';
import {
  applyProgressionsToSteps,
  applyTemplateSummaryProgression,
  filterStepProgressionsBySteps,
  filterStaleWeekOneProgressions,
  getProgressionWeekIndex,
  normalizeStepProgressions,
  shouldApplyProgressionForTemplateDate,
  StepProgressionOverride,
} from '../helpers/enduranceProgression.helper';
import { sortAdvancedTemplateSteps } from '../helpers/advancedEnduranceSession.helper';

export type RecurringEnduranceTemplate = {
  id: string;
  scheduled_day: number | null;
  recurrence_start_date: string | null;
  recurrence_end_date: string | null;
};

export type PopulatedProgressionTemplate = EnduranceWorkoutTemplate & {
  steps: EnduranceWorkoutStep[];
};

export const isDateWithinEnduranceRecurrence = (
  plannedDate: string,
  template: Pick<RecurringEnduranceTemplate, 'recurrence_start_date' | 'recurrence_end_date'>,
): boolean => {
  if (template.recurrence_start_date && plannedDate < template.recurrence_start_date) return false;
  if (template.recurrence_end_date && plannedDate > template.recurrence_end_date) return false;
  return true;
};

export const deleteFuturePlansOutsideEnduranceRecurrence = async ({
  userId,
  templateId,
  recurrenceEndDate,
}: {
  userId: string;
  templateId: string;
  recurrenceEndDate: string | null | undefined;
}) => {
  if (!recurrenceEndDate) return;

  const { error } = await supabase
    .from('workout_plans')
    .delete()
    .eq('user_id', userId)
    .eq('endurance_template_id', templateId)
    .gt('planned_date', recurrenceEndDate)
    .is('completed_at', null)
    .neq('status', 'completed');

  if (error) {
    console.error('[enduranceProgressionService.deleteFuturePlansOutsideEnduranceRecurrence] error:', error);
  }
};

export const fetchEnduranceStepProgressions = async (
  templateId: string,
): Promise<EnduranceWorkoutStepProgression[]> => {
  const { data, error } = await supabase
    .from('endurance_workout_step_progressions')
    .select('*')
    .eq('template_id', templateId)
    .order('week_index', { ascending: true });

  if (error) throw error;
  return data || [];
};

export const fetchEnduranceTemplateProgressions = async (
  templateId: string,
): Promise<EnduranceWorkoutTemplateProgression[]> => {
  const { data, error } = await supabase
    .from('endurance_workout_template_progressions')
    .select('*')
    .eq('template_id', templateId)
    .order('week_index', { ascending: true });

  if (error) throw error;
  return data || [];
};

export const replaceEnduranceStepProgressions = async (templateId: string, progressions: StepProgressionOverride[]) => {
  const normalizedProgressions = normalizeStepProgressions(progressions);

  const { error: deleteError } = await supabase
    .from('endurance_workout_step_progressions')
    .delete()
    .eq('template_id', templateId);

  if (deleteError) throw deleteError;

  if (normalizedProgressions.length === 0) return;

  const rows: EnduranceWorkoutStepProgressionInsert[] = normalizedProgressions.map(progression => ({
    template_id: templateId,
    progression_key: progression.progression_key,
    week_index: progression.week_index,
    duration_s: progression.duration_s ?? null,
    distance_m: progression.distance_m ?? null,
    target_type: progression.target_type ?? null,
    target_min: progression.target_min ?? null,
    target_max: progression.target_max ?? null,
    repetitions: progression.repetitions ?? null,
    load_kg: progression.load_kg ?? null,
    reps: progression.reps ?? null,
  }));

  const { error: insertError } = await supabase.from('endurance_workout_step_progressions').insert(rows);
  if (insertError) throw insertError;
};

export const applyProgressionsForPlannedDate = (
  template: Pick<EnduranceWorkoutTemplate, 'recurrence_start_date' | 'recurrence_end_date' | 'updated_at'>,
  steps: EnduranceWorkoutStep[],
  progressions: StepProgressionOverride[],
  plannedDate?: string | null,
): EnduranceWorkoutStep[] => {
  if (!plannedDate || !template.recurrence_start_date || !isDateWithinEnduranceRecurrence(plannedDate, template)) {
    return steps;
  }

  const weekIndex = getProgressionWeekIndex(template.recurrence_start_date, plannedDate);
  if (weekIndex < 1) return steps;

  const currentProgressions = filterStaleWeekOneProgressions(progressions, template.updated_at, weekIndex);
  return applyProgressionsToSteps(steps, weekIndex, filterStepProgressionsBySteps(steps, currentProgressions));
};

export const applyTemplateProgressionForPlannedDate = <TTemplate extends EnduranceWorkoutTemplate>(
  template: TTemplate,
  progressions: EnduranceWorkoutTemplateProgression[],
  plannedDate?: string | null,
): TTemplate => {
  if (!plannedDate || !template.recurrence_start_date || !isDateWithinEnduranceRecurrence(plannedDate, template)) {
    return template;
  }

  const weekIndex = getProgressionWeekIndex(template.recurrence_start_date, plannedDate);
  const progression = progressions.find(item => item.week_index === weekIndex);
  if (!progression || !shouldApplyProgressionForTemplateDate(template.updated_at, progression.updated_at, weekIndex)) {
    return template;
  }

  return applyTemplateSummaryProgression(template, weekIndex, [progression]);
};

export const fetchTemplateWithProgressedSteps = async (
  templateId: string,
  plannedDate?: string | null,
): Promise<PopulatedProgressionTemplate | null> => {
  const { data, error } = await supabase
    .from('endurance_workout_templates')
    .select('*, steps:endurance_workout_steps(*)')
    .eq('id', templateId)
    .single();

  if (error) throw error;
  if (!data) return null;

  const [stepProgressions, templateProgressions] = await Promise.all([
    fetchEnduranceStepProgressions(templateId),
    fetchEnduranceTemplateProgressions(templateId),
  ]);
  const progressedTemplate = applyTemplateProgressionForPlannedDate(data, templateProgressions, plannedDate);
  const orderedSteps = sortAdvancedTemplateSteps(data.steps || []);
  return {
    ...progressedTemplate,
    steps: sortAdvancedTemplateSteps(
      applyProgressionsForPlannedDate(data, orderedSteps, stepProgressions, plannedDate),
    ),
  };
};
