import type { MealComponent } from '../types/ingredients';

export type PersonalRecipeSort = 'recently_used' | 'most_used' | 'created' | 'alphabetical';

export type PersonalRecipeUsage = {
  recipeId: string;
  lastUsedAt: string | null;
  useCount: number;
};

const getTimestamp = (value: string | null | undefined): number => {
  if (!value) return 0;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : 0;
};

const compareNames = (left: MealComponent, right: MealComponent): number =>
  left.name.localeCompare(right.name, undefined, { sensitivity: 'base' });

export const sortPersonalRecipes = (
  recipes: MealComponent[],
  sort: PersonalRecipeSort,
  usageById: ReadonlyMap<string, PersonalRecipeUsage>,
): MealComponent[] => {
  return [...recipes].sort((left, right) => {
    const leftId = left.external_id;
    const rightId = right.external_id;
    const leftUsage = leftId ? usageById.get(leftId) : undefined;
    const rightUsage = rightId ? usageById.get(rightId) : undefined;

    if (sort === 'alphabetical') return compareNames(left, right);

    if (sort === 'most_used') {
      const leftCount = leftUsage?.useCount ?? left.recipe_uses_total ?? 0;
      const rightCount = rightUsage?.useCount ?? right.recipe_uses_total ?? 0;
      if (rightCount !== leftCount) return rightCount - leftCount;
    } else if (sort === 'created') {
      const rightCreated = getTimestamp(right.recipe_created_at);
      const leftCreated = getTimestamp(left.recipe_created_at);
      if (rightCreated !== leftCreated) return rightCreated - leftCreated;
    } else {
      const leftRecent = getTimestamp(leftUsage?.lastUsedAt) || getTimestamp(left.recipe_updated_at);
      const rightRecent = getTimestamp(rightUsage?.lastUsedAt) || getTimestamp(right.recipe_updated_at);
      if (rightRecent !== leftRecent) return rightRecent - leftRecent;
    }

    return compareNames(left, right);
  });
};

export const getOptimisticFavoriteIds = (
  favoriteIds: readonly string[],
  recipeId: string,
  isCurrentlyFavorite: boolean,
): string[] => {
  const uniqueIds = Array.from(new Set(favoriteIds));
  if (isCurrentlyFavorite) return uniqueIds.filter(id => id !== recipeId);
  return uniqueIds.includes(recipeId) ? uniqueIds : [...uniqueIds, recipeId];
};
