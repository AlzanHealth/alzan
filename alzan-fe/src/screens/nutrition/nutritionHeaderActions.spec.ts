import assert from 'node:assert/strict';
import {
  getNutritionHomeMenuImportTarget,
  getNutritionHomeRecipeLibraryTarget,
  getRecipeLibraryShoppingListTarget,
} from './nutritionHeaderActions';

assert.deepEqual(getNutritionHomeMenuImportTarget(), { screen: 'MenuImport' });
assert.deepEqual(getNutritionHomeRecipeLibraryTarget('2026-08-24'), {
  screen: 'RecipeLibrary',
  params: { date: '2026-08-24' },
});
assert.deepEqual(getRecipeLibraryShoppingListTarget('2026-08-24'), {
  screen: 'ShoppingList',
  params: { date: '2026-08-24' },
});

console.log('nutritionHeaderActions tests passed');
