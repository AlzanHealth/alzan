import { supabase } from '../../../lib/supabaseClient';
import type { Exercise } from '../../../types/requests.types';
import type { Tables } from '../../../types/database.types';
import type { ExerciseLoadType } from '../../../services/localization';
import { normalizeExerciseCatalogName } from '../helpers/exerciseCatalogMatching';
import { loadAllPages } from '../helpers/loadAllPages';

export { normalizeExerciseCatalogName } from '../helpers/exerciseCatalogMatching';

export interface CreateCustomExerciseInput {
  name: string;
  primaryMuscleId: number;
  secondaryMuscleId: number | null;
  equipmentId: number | null;
  loadType: ExerciseLoadType;
  description: string;
}

type ExerciseTranslations = Array<{ name: string; language_code: string | null }> | null;

export interface ExerciseUserOverride extends Tables<'user_exercise_overrides'> {
  primary_muscle: {
    id: number;
    code: string;
    muscle_group_translations: ExerciseTranslations;
  } | null;
  secondary_muscle: {
    id: number;
    code: string;
    muscle_group_translations: ExerciseTranslations;
  } | null;
  equipment: {
    id: number;
    code: string;
    equipment_translations: ExerciseTranslations;
  } | null;
}

const EXERCISE_USER_OVERRIDE_SELECT = `
  *,
  primary_muscle:muscle_groups!user_exercise_overrides_primary_muscle_fkey (
    id,
    code,
    muscle_group_translations (name, language_code)
  ),
  secondary_muscle:muscle_groups!user_exercise_overrides_secondary_muscle_fkey (
    id,
    code,
    muscle_group_translations (name, language_code)
  ),
  equipment:equipment!user_exercise_overrides_equipment_fkey (
    id,
    code,
    equipment_translations (name, language_code)
  )
`;

export class ExerciseNameAlreadyExistsError extends Error {
  constructor() {
    super('exercise_name_duplicate');
    this.name = 'ExerciseNameAlreadyExistsError';
  }
}

const prepareCustomExerciseInput = (userId: string, input: CreateCustomExerciseInput) => {
  const name = input.name.trim().replace(/\s+/g, ' ');
  const description = input.description.trim() || null;
  const validLoadTypes: ExerciseLoadType[] = ['external', 'bodyweight', 'assisted', 'mixed'];

  if (
    !userId ||
    name.length < 2 ||
    name.length > 80 ||
    !normalizeExerciseCatalogName(name) ||
    (description?.length ?? 0) > 500 ||
    !Number.isInteger(input.primaryMuscleId) ||
    input.primaryMuscleId <= 0 ||
    (input.secondaryMuscleId !== null &&
      (!Number.isInteger(input.secondaryMuscleId) || input.secondaryMuscleId <= 0)) ||
    (input.equipmentId !== null && (!Number.isInteger(input.equipmentId) || input.equipmentId <= 0)) ||
    !validLoadTypes.includes(input.loadType)
  ) {
    throw new Error('exercise_custom_input_invalid');
  }

  return { name, description };
};

export const createCustomExercise = async (userId: string, input: CreateCustomExerciseInput): Promise<Exercise> => {
  const { name, description } = prepareCustomExerciseInput(userId, input);

  const { data, error } = await supabase
    .from('exercises')
    .insert({
      base_name_es: name,
      base_name_en: name,
      description_es: description,
      description_en: description,
      primary_muscle_id: input.primaryMuscleId,
      secondary_muscle_id: input.secondaryMuscleId,
      equipment_id: input.equipmentId,
      exercise_type_id: null,
      difficulty: null,
      is_custom: true,
      owner_user_id: userId,
      load_type: input.loadType,
    })
    .select()
    .single();

  if (error) {
    if (error.code === '23505' && error.message.includes('exercise_name_duplicate')) {
      throw new ExerciseNameAlreadyExistsError();
    }
    throw error;
  }

  return data;
};

export const fetchExerciseUserOverrides = async (
  userId: string,
  exerciseIds?: readonly string[],
): Promise<ExerciseUserOverride[]> => {
  if (!userId) return [];
  if (exerciseIds && exerciseIds.length === 0) return [];

  return loadAllPages(async (from, to) => {
    let query = supabase
      .from('user_exercise_overrides')
      .select(EXERCISE_USER_OVERRIDE_SELECT)
      .eq('user_id', userId)
      .order('exercise_id', { ascending: true });

    if (exerciseIds) query = query.in('exercise_id', [...exerciseIds]);

    const { data, error } = await query.range(from, to).returns<ExerciseUserOverride[]>();

    if (error) throw error;
    return data ?? [];
  });
};

export const findExactExerciseCatalogMatch = async (
  name: string,
  excludeExerciseId?: string,
): Promise<string | null> => {
  const { data, error } = await supabase.rpc('find_exact_exercise_catalog_match', {
    p_name: name,
    ...(excludeExerciseId ? { p_exclude_exercise_id: excludeExerciseId } : {}),
  });

  if (error) throw error;
  return data;
};

export const updateExerciseForUser = async (
  userId: string,
  exerciseId: string,
  input: CreateCustomExerciseInput,
): Promise<void> => {
  const { name, description } = prepareCustomExerciseInput(userId, input);
  const { data: exercise, error: exerciseError } = await supabase
    .from('exercises')
    .select('id, is_custom, owner_user_id, archived_at')
    .eq('id', exerciseId)
    .maybeSingle();

  if (exerciseError) throw exerciseError;
  if (!exercise || exercise.archived_at) throw new Error('exercise_edit_not_allowed');

  const values = {
    base_name_es: name,
    base_name_en: name,
    description_es: description,
    description_en: description,
    primary_muscle_id: input.primaryMuscleId,
    secondary_muscle_id: input.secondaryMuscleId,
    equipment_id: input.equipmentId,
    load_type: input.loadType,
  };

  if (exercise.is_custom && exercise.owner_user_id === userId) {
    const { data, error } = await supabase
      .from('exercises')
      .update(values)
      .eq('id', exerciseId)
      .eq('owner_user_id', userId)
      .eq('is_custom', true)
      .select('id')
      .maybeSingle();

    if (error) {
      if (error.code === '23505' && error.message.includes('exercise_name_duplicate')) {
        throw new ExerciseNameAlreadyExistsError();
      }
      throw error;
    }
    if (!data) throw new Error('exercise_edit_not_allowed');
    return;
  }

  if (exercise.is_custom || exercise.owner_user_id !== null) {
    throw new Error('exercise_edit_not_allowed');
  }

  const { error } = await supabase.from('user_exercise_overrides').upsert(
    {
      user_id: userId,
      exercise_id: exerciseId,
      ...values,
    },
    { onConflict: 'user_id,exercise_id' },
  );

  if (error) {
    if (error.code === '23505' && error.message.includes('exercise_name_duplicate')) {
      throw new ExerciseNameAlreadyExistsError();
    }
    throw error;
  }
};

export const resetExerciseUserOverride = async (userId: string, exerciseId: string): Promise<void> => {
  const { error } = await supabase
    .from('user_exercise_overrides')
    .delete()
    .eq('user_id', userId)
    .eq('exercise_id', exerciseId);

  if (error) throw error;
};

export const deleteCustomExercise = async (exerciseId: string, userId: string): Promise<'deleted' | 'archived'> => {
  const deletion = await supabase
    .from('exercises')
    .delete()
    .eq('id', exerciseId)
    .eq('owner_user_id', userId)
    .eq('is_custom', true)
    .select('id')
    .maybeSingle();

  if (!deletion.error) {
    if (!deletion.data) {
      throw new Error('exercise_delete_not_allowed');
    }

    return 'deleted';
  }

  if (deletion.error.code !== '23503') {
    throw deletion.error;
  }

  const archive = await supabase
    .from('exercises')
    .update({ archived_at: new Date().toISOString() })
    .eq('id', exerciseId)
    .eq('owner_user_id', userId)
    .eq('is_custom', true)
    .select('id')
    .maybeSingle();

  if (archive.error) {
    throw archive.error;
  }

  if (!archive.data) {
    throw new Error('exercise_delete_not_allowed');
  }

  return 'archived';
};

export const restoreCustomExercise = async (exerciseId: string, userId: string): Promise<void> => {
  const { data, error } = await supabase
    .from('exercises')
    .update({ archived_at: null })
    .eq('id', exerciseId)
    .eq('owner_user_id', userId)
    .eq('is_custom', true)
    .not('archived_at', 'is', null)
    .select('id')
    .maybeSingle();

  if (error) {
    if (error.code === '23505' && error.message.includes('exercise_name_duplicate')) {
      throw new ExerciseNameAlreadyExistsError();
    }
    throw error;
  }

  if (!data) {
    throw new Error('exercise_restore_not_allowed');
  }
};
