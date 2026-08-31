import assert from 'node:assert/strict';

import type { MealComponent } from '../types/ingredients';
import { getOptimisticFavoriteIds, sortPersonalRecipes, type PersonalRecipeUsage } from './recipeLibraryPlanner';

const recipe = (id: string, name: string, createdAt: string, updatedAt = createdAt): MealComponent => ({
  id: `recipe_${id}`,
  external_id: id,
  name,
  source: 'database',
  itemType: 'recipe',
  recipe_created_at: createdAt,
  recipe_updated_at: updatedAt,
});

const usage = (recipeId: string, useCount: number, lastUsedAt: string): PersonalRecipeUsage => ({
  recipeId,
  useCount,
  lastUsedAt,
});

function run() {
  const recipes = [
    recipe('older', 'Zanahoria', '2026-08-01T10:00:00.000Z'),
    recipe('newer', 'Arroz', '2026-08-03T10:00:00.000Z'),
  ];

  assert.deepEqual(
    sortPersonalRecipes(recipes, 'created', new Map()),
    [recipes[1], recipes[0]],
    'created sorting should use created_at, not updated_at',
  );

  assert.deepEqual(
    sortPersonalRecipes(
      recipes,
      'most_used',
      new Map([
        ['older', usage('older', 8, '2026-08-04T10:00:00.000Z')],
        ['newer', usage('newer', 2, '2026-08-05T10:00:00.000Z')],
      ]),
    ),
    [recipes[0], recipes[1]],
    'most used sorting should use personal usage data',
  );

  assert.deepEqual(getOptimisticFavoriteIds(['recipe-1', 'recipe-2'], 'recipe-1', false), ['recipe-1', 'recipe-2']);
  assert.deepEqual(getOptimisticFavoriteIds(['recipe-1', 'recipe-2'], 'recipe-1', true), ['recipe-2']);
  assert.deepEqual(getOptimisticFavoriteIds(['recipe-1'], 'recipe-2', false), ['recipe-1', 'recipe-2']);

  console.log('recipeLibraryPlanner: all assertions passed');
}

run();
