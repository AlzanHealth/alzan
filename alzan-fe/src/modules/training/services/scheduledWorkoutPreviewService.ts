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
import { fetchExerciseUserOverrides } from './exerciseCatalogService';
import { applyExerciseUserOverride } from '../helpers/exerciseUserOverride';

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
  userId?: string,
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
  const exerciseIds = Array.from(new Set(exercises.map(item => item.exercise_id)));
  const overrides = userId ? await fetchExerciseUserOverrides(userId, exerciseIds) : [];
  const overridesByExerciseId = new Map(overrides.map(override => [override.exercise_id, override]));
  const personalizedExercises = exercises.map(item => ({
    ...item,
    exercise: item.exercise
      ? applyExerciseUserOverride(item.exercise, overridesByExerciseId.get(item.exercise.id))
      : null,
  }));
  return {
    ...template,
    exercises: await applyStrengthProgressionsForPlannedDate(templateId, plannedDate, personalizedExercises),
  };
};

export const fetchEndurancePreviewTemplate = async (
  templateId: string,
  plannedDate: string,
): Promise<EndurancePreviewTemplate | null> => fetchTemplateWithProgressedSteps(templateId, plannedDate);
