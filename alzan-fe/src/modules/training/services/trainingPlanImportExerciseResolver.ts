import type { TrainingPlanStrengthExercise } from './trainingPlanImportContract';

export type TrainingExerciseCatalogRow = {
  id: string;
  base_name_es: string | null;
  base_name_en: string | null;
};

export const normalizeTrainingExerciseName = (value: string): string =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');

export const getTrainingExerciseResolutionKey = (
  exercise: Pick<TrainingPlanStrengthExercise, 'exercise_id' | 'exercise_name' | 'order_index'>,
): string =>
  `${exercise.order_index}:${normalizeTrainingExerciseName(exercise.exercise_name ?? exercise.exercise_id ?? '')}`;

export const resolveTrainingPlanExercisesFromCatalog = (
  exercises: TrainingPlanStrengthExercise[],
  catalog: TrainingExerciseCatalogRow[],
): Map<string, string> => {
  const byId = new Map(catalog.map(exercise => [exercise.id, exercise] as const));
  const idsByName = new Map<string, Set<string>>();

  catalog.forEach(exercise => {
    [exercise.base_name_es, exercise.base_name_en]
      .filter((name): name is string => Boolean(name))
      .forEach(name => {
        const normalizedName = normalizeTrainingExerciseName(name);
        const ids = idsByName.get(normalizedName) ?? new Set<string>();
        ids.add(exercise.id);
        idsByName.set(normalizedName, ids);
      });
  });

  const resolveExactName = (name: string): string | undefined => {
    const ids = idsByName.get(normalizeTrainingExerciseName(name));
    if (!ids || ids.size === 0) return undefined;
    if (ids.size > 1) throw new Error(`El ejercicio "${name}" coincide con más de un ejercicio del catálogo`);
    return [...ids][0];
  };

  const resolved = new Map<string, string>();
  exercises.forEach(exercise => {
    const explicitId = exercise.exercise_id;
    const explicitName = exercise.exercise_name;
    const catalogExercise = explicitId ? byId.get(explicitId) : undefined;
    let resolvedId: string | undefined;

    if (catalogExercise) {
      if (explicitName) {
        const validNames = [catalogExercise.base_name_es, catalogExercise.base_name_en]
          .filter((name): name is string => Boolean(name))
          .map(normalizeTrainingExerciseName);
        if (!validNames.includes(normalizeTrainingExerciseName(explicitName))) {
          throw new Error(`El exercise_id "${explicitId}" no coincide con "${explicitName}"`);
        }
      }
      resolvedId = catalogExercise.id;
    } else if (explicitName) {
      resolvedId = resolveExactName(explicitName);
    }

    if (!resolvedId) {
      const identifier = explicitName ?? explicitId ?? '';
      throw new Error(`No se ha encontrado el ejercicio "${identifier}"`);
    }

    resolved.set(getTrainingExerciseResolutionKey(exercise), resolvedId);
  });

  return resolved;
};
