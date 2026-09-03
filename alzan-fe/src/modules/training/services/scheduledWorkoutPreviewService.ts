import { supabase } from '../../../lib/supabaseClient';
import {
  EnduranceWorkoutStep,
  EnduranceWorkoutTemplate,
  WorkoutTemplate,
  WorkoutTemplateExercise,
} from '../../../types/requests.types';
import { fetchTemplateWithProgressedSteps } from './enduranceProgressionService';
import { applyStrengthProgressionsForPlannedDate } from './strengthProgressionService';
import { sortByOrderIndex } from '../helpers/advancedEnduranceSession.helper';

export type PreviewExercise = {
  id: string;
  base_name_es: string | null;
  base_name_en: string | null;
  load_type: string | null;
};

export type PreviewGymExercise = WorkoutTemplateExercise & {
  exercise: PreviewExercise | null;
};

export type GymPreviewTemplate = WorkoutTemplate & {
  exercises: PreviewGymExercise[];
};

export type EndurancePreviewTemplate = EnduranceWorkoutTemplate & {
  steps: EnduranceWorkoutStep[];
};

export const fetchGymPreviewTemplate = async (
  templateId: string,
  plannedDate: string,
): Promise<GymPreviewTemplate | null> => {
  const { data, error } = await supabase
    .from('workout_templates')
    .select(
      `
        *,
        exercises:workout_template_exercises(
          *,
          exercise:exercises(id, base_name_es, base_name_en, load_type)
        )
      `,
    )
    .eq('id', templateId)
    .single();

  if (error) throw error;
  if (!data) return null;

  const template = data as unknown as GymPreviewTemplate;
  const exercises = sortByOrderIndex(template.exercises || []);
  return {
    ...template,
    exercises: await applyStrengthProgressionsForPlannedDate(templateId, plannedDate, exercises),
  };
};

export const fetchEndurancePreviewTemplate = async (
  templateId: string,
  plannedDate: string,
): Promise<EndurancePreviewTemplate | null> => fetchTemplateWithProgressedSteps(templateId, plannedDate);
