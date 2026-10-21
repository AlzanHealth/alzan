import { supabase } from '../../../lib/supabaseClient';
import type { Exercise } from '../../../types/requests.types';
import type { ExerciseLoadType } from '../../../services/localization';

export interface CreateCustomExerciseInput {
  name: string;
  primaryMuscleId: number;
  secondaryMuscleId: number | null;
  equipmentId: number | null;
  loadType: ExerciseLoadType;
  description: string;
}

export class ExerciseNameAlreadyExistsError extends Error {
  constructor() {
    super('exercise_name_duplicate');
    this.name = 'ExerciseNameAlreadyExistsError';
  }
}

export const normalizeExerciseCatalogName = (value: string): string =>
  value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export const createCustomExercise = async (userId: string, input: CreateCustomExerciseInput): Promise<Exercise> => {
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
