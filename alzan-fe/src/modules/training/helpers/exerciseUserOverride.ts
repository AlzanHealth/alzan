import type { ExerciseUserOverride } from '../services/exerciseCatalogService';

type ExerciseUserOverrideFields = Pick<
  ExerciseUserOverride,
  | 'base_name_es'
  | 'base_name_en'
  | 'description_es'
  | 'description_en'
  | 'primary_muscle_id'
  | 'secondary_muscle_id'
  | 'equipment_id'
  | 'load_type'
  | 'primary_muscle'
  | 'secondary_muscle'
  | 'equipment'
>;

type ExerciseWithUserOverride<T extends object> = Omit<T, keyof ExerciseUserOverrideFields> &
  ExerciseUserOverrideFields;

export function applyExerciseUserOverride<T extends object>(
  exercise: T,
  override: ExerciseUserOverride,
): ExerciseWithUserOverride<T>;
export function applyExerciseUserOverride<T extends object>(exercise: T, override?: null | undefined): T;
export function applyExerciseUserOverride<T extends object>(
  exercise: T,
  override: ExerciseUserOverride | null | undefined,
): T | ExerciseWithUserOverride<T>;
export function applyExerciseUserOverride<T extends object>(
  exercise: T,
  override?: ExerciseUserOverride | null,
): T | ExerciseWithUserOverride<T> {
  if (!override) return exercise;

  return {
    ...exercise,
    base_name_es: override.base_name_es,
    base_name_en: override.base_name_en,
    description_es: override.description_es,
    description_en: override.description_en,
    primary_muscle_id: override.primary_muscle_id,
    secondary_muscle_id: override.secondary_muscle_id,
    equipment_id: override.equipment_id,
    load_type: override.load_type,
    primary_muscle: override.primary_muscle,
    secondary_muscle: override.secondary_muscle,
    equipment: override.equipment,
  };
}
