import assert from 'node:assert/strict';
import {
  getMenuImportConflictSummary,
  getVisibleMenuImportIngredients,
  getVisibleMenuImportMeals,
} from './menuImportConflictFilter';
import type { MenuImportPreview, MenuImportPreviewMeal } from './menuImportPlanner';

const ingredient = (name: string, resolved: boolean) => ({
  ingredientKey: name.toLowerCase(),
  name,
  quantity_g: 100,
  selectedCandidate: resolved
    ? { id: `id-${name}`, name, kcal_100: 1, protein_g_100: 1, carbs_g_100: 1, fat_g_100: 1 }
    : null,
  macros: resolved ? { kcal: 1, protein_g: 1, carbs_g: 1, fats_g: 1 } : null,
});

const meal = (
  key: string,
  ingredients: MenuImportPreviewMeal['ingredients'],
  conflict: MenuImportPreviewMeal['conflict'] = null,
): MenuImportPreviewMeal => ({
  key,
  date: '2026-08-26',
  meal_type: 'lunch',
  name: key,
  ingredients,
  macros: { kcal: 1, protein_g: 1, carbs_g: 1, fats_g: 1 },
  conflict,
});

const preview: MenuImportPreview = {
  menuName: 'Test',
  calendarSnapshot: { token: 'token', dates: ['2026-08-26'] },
  existingLogs: [],
  resolutions: [],
  meals: [
    meal('resolved', [ingredient('Arroz', true)]),
    meal('ingredient-pending', [ingredient('Calamar', false), ingredient('Arroz', true)]),
    meal('decision-pending', [ingredient('Pan', true)], { existingLogs: [], decision: null }),
  ],
};

const summary = getMenuImportConflictSummary(preview);
assert.deepEqual(summary, { pendingIngredients: 1, pendingMealDecisions: 1, pendingMealTypes: 0, total: 2 });
assert.deepEqual(
  getVisibleMenuImportMeals(preview.meals, true).map(item => item.key),
  ['ingredient-pending', 'decision-pending'],
);
assert.deepEqual(
  getVisibleMenuImportIngredients(preview.meals[1]?.ingredients ?? [], true).map(item => item.name),
  ['Calamar'],
);
assert.equal(getVisibleMenuImportMeals(preview.meals, false).length, 3);
