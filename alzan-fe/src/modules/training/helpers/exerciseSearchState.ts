interface ExerciseSearchFields {
  name?: string | null;
  base_name_es?: string | null;
  base_name_en?: string | null;
  canonical_name_es?: string | null;
  canonical_name_en?: string | null;
  description?: string | null;
  description_es?: string | null;
  description_en?: string | null;
  muscle_name?: string | null;
  secondary_muscle_name?: string | null;
  equipment_name?: string | null;
}

export const getExerciseSearchFields = (exercise: ExerciseSearchFields): Array<string | null | undefined> => [
  exercise.name,
  exercise.base_name_es,
  exercise.base_name_en,
  exercise.canonical_name_es,
  exercise.canonical_name_en,
  exercise.description,
  exercise.description_es,
  exercise.description_en,
  exercise.muscle_name,
  exercise.secondary_muscle_name,
  exercise.equipment_name,
];

// The limit is the only key field allowed to change during incremental loading.
export const canReuseExerciseSearchPage = (
  previousKey: readonly unknown[] | undefined,
  currentKey: readonly unknown[],
): boolean =>
  !!previousKey &&
  previousKey.length === currentKey.length &&
  typeof previousKey[8] === 'number' &&
  typeof currentKey[8] === 'number' &&
  currentKey[8] > previousKey[8] &&
  previousKey.every((value, index) => index === 8 || value === currentKey[index]);

export const orderExerciseCatalogItems = <T extends { id: string; name: string }>(
  items: readonly T[],
  tab: 'catalog' | 'mine' | 'used',
  usage: Readonly<Record<string, { latestAt: string }>>,
): T[] => {
  // Catalog pages already have canonical name order, or relevance order for
  // searches. Sorting by personal aliases here would reshuffle loaded prefixes.
  if (tab === 'catalog') return [...items];
  return [...items].sort((left, right) => {
    if (tab === 'used') {
      return (usage[right.id]?.latestAt ?? '').localeCompare(usage[left.id]?.latestAt ?? '');
    }
    return left.name.localeCompare(right.name) || left.id.localeCompare(right.id);
  });
};
