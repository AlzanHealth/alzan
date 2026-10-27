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
import type { Json } from '../../../types/database.types';
import { parseTargetRirBySet, type TargetRirBySet } from '../helpers/targetRirBySet.helper';

export type PreviewExercise = {
  id: string;
  base_name_es: string | null;
  base_name_en: string | null;
  load_type: string | null;
  exercise_type_code?: string | null;
};

export type PreviewGymExercise = Omit<WorkoutTemplateExercise, 'target_rir_by_set'> & {
  target_rir_by_set: TargetRirBySet;
  exercise: PreviewExercise | null;
};

type DatabasePreviewGymExercise = Omit<PreviewGymExercise, 'target_rir_by_set'> & {
  target_rir_by_set: Json | null;
  exercise: (Omit<PreviewExercise, 'exercise_type_code'> & { exercise_type: { code: string } | null }) | null;
};

export type GymPreviewTemplate = WorkoutTemplate & {
  exercises: PreviewGymExercise[];
};

type DatabaseGymPreviewTemplate = WorkoutTemplate & {
  exercises: DatabasePreviewGymExercise[];
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
          exercise:exercises(id, base_name_es, base_name_en, load_type, exercise_type:exercise_types(code))
        )
      `,
    )
    .eq('id', templateId)
    .single();

  if (error) throw error;
  if (!data) return null;

  const databaseTemplate = data as unknown as DatabaseGymPreviewTemplate;
  const template: GymPreviewTemplate = {
    ...databaseTemplate,
    exercises: databaseTemplate.exercises.map(item => ({
      ...item,
      target_rir_by_set: parseTargetRirBySet(item.target_rir_by_set, item.target_sets),
      exercise: item.exercise
        ? { ...item.exercise, exercise_type_code: item.exercise.exercise_type?.code ?? null }
        : null,
    })),
  };
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
