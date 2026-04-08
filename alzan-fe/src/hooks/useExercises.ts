import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabaseClient';
import { Exercise } from '../types/requests.types';
import { ExerciseWithDetails } from '../types/training';
import {
  getCurrentAppLocale,
  getLocalizedExerciseDescription,
  getLocalizedExerciseName,
  normalizeExerciseLoadType,
} from '../services/localization';

interface TranslationRow {
  name: string;
  language_code: string | null;
}

interface ExerciseLookupRow extends Exercise {
  load_type: 'bodyweight' | 'external' | 'assisted' | 'mixed' | null;
  exercise_type: {
    id: number;
    code: string;
  } | null;
  primary_muscle: {
    id: number;
    code: string;
    muscle_group_translations: TranslationRow[] | null;
  } | null;
  secondary_muscle: {
    id: number;
    code: string;
    muscle_group_translations: TranslationRow[] | null;
  } | null;
  equipment: {
    id: number;
    code: string;
    equipment_translations: TranslationRow[] | null;
  } | null;
}

const EXERCISE_LOOKUP_SELECT = `
  *,
  exercise_type:exercise_types (
    id,
    code
  ),
  primary_muscle:muscle_groups!exercises_primary_muscle_id_fkey (
    id,
    code,
    muscle_group_translations (
      name,
      language_code
    )
  ),
  secondary_muscle:muscle_groups!exercises_secondary_muscle_id_fkey (
    id,
    code,
    muscle_group_translations (
      name,
      language_code
    )
  ),
  equipment (
    id,
    code,
    equipment_translations (
      name,
      language_code
    )
  )
`;

const mapExerciseLookupRow = (item: ExerciseLookupRow, languageCode: string): ExerciseWithDetails => {
  // For muscles and equipment, filter translations by language_code
  const muscleTranslations = item.primary_muscle?.muscle_group_translations || [];
  const muscleTrans = muscleTranslations.find(t => t.language_code === languageCode) || muscleTranslations[0];

  const secondaryMuscleTranslations = item.secondary_muscle?.muscle_group_translations || [];
  const secondaryMuscleTrans =
    secondaryMuscleTranslations.find(t => t.language_code === languageCode) || secondaryMuscleTranslations[0];

  const equipTranslations = item.equipment?.equipment_translations || [];
  const equipTrans = equipTranslations.find(t => t.language_code === languageCode) || equipTranslations[0];

  const muscleName = muscleTrans?.name || item.primary_muscle?.code || undefined;
  const secondaryMuscleName = secondaryMuscleTrans?.name || item.secondary_muscle?.code || undefined;
  const equipName = equipTrans?.name || item.equipment?.code || undefined;
  const exerciseName = getLocalizedExerciseName(item);
  const exerciseDescription = getLocalizedExerciseDescription(item);

  return {
    ...item,
    load_type: normalizeExerciseLoadType(item.load_type),
    name: exerciseName,
    description: exerciseDescription ?? item.description_es ?? null,
    muscle_name: muscleName,
    secondary_muscle_name: secondaryMuscleName,
    equipment_name: equipName,
    // Exercise type code for time-based vs reps-based exercises
    exercise_type_code: item.exercise_type?.code || null,
    // Preserve primary_muscle object with translated name for ExerciseDetailScreen
    primary_muscle: item.primary_muscle
      ? {
          id: item.primary_muscle.id,
          code: item.primary_muscle.code,
          name: muscleName || item.primary_muscle.code,
        }
      : null,
    // Preserve secondary_muscle object with translated name
    secondary_muscle: item.secondary_muscle
      ? {
          id: item.secondary_muscle.id,
          code: item.secondary_muscle.code,
          name: secondaryMuscleName || item.secondary_muscle.code,
        }
      : null,
    // Preserve equipment object with translated name
    equipment: item.equipment
      ? {
          id: item.equipment.id,
          code: item.equipment.code,
          name: equipName || item.equipment.code,
        }
      : null,
  };
};

export const useExercises = () => {
  const languageCode = getCurrentAppLocale();

  const {
    data: exercises = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ['exercises', languageCode],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('exercises')
        .select(EXERCISE_LOOKUP_SELECT)
        .returns<ExerciseLookupRow[]>();

      if (error) {
        console.error('Error fetching exercises:', error);
        throw error;
      }

      return data.map(item => mapExerciseLookupRow(item, languageCode));
    },
    staleTime: 1000 * 60 * 5, // Reduced to 5 minutes so new exercises appear sooner
  });

  return {
    exercises,
    isLoading,
    error,
  };
};

export const useExerciseById = (exerciseId?: string) => {
  const languageCode = getCurrentAppLocale();

  const {
    data: exercise = null,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['exercise-by-id', exerciseId, languageCode],
    queryFn: async () => {
      if (!exerciseId) return null;

      const { data, error } = await supabase
        .from('exercises')
        .select(EXERCISE_LOOKUP_SELECT)
        .eq('id', exerciseId)
        .returns<ExerciseLookupRow[]>()
        .maybeSingle();

      if (error) {
        console.error('Error fetching exercise by id:', error);
        throw error;
      }

      if (!data) return null;
      return mapExerciseLookupRow(data, languageCode);
    },
    enabled: !!exerciseId,
    staleTime: 1000 * 60 * 5,
  });

  return {
    exercise,
    isLoading,
    error,
  };
};
