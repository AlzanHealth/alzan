import type { MenuImportPreview, MenuImportPreviewIngredient, MenuImportPreviewMeal } from './menuImportPlanner';

export type MenuImportConflictSummary = {
  pendingIngredients: number;
  pendingMealDecisions: number;
  pendingMealTypes: number;
  total: number;
};

export const isMenuImportIngredientPending = (ingredient: MenuImportPreviewIngredient): boolean =>
  ingredient.selectedCandidate === null;

export const isMenuImportMealPending = (meal: MenuImportPreviewMeal): boolean =>
  meal.meal_type === 'unspecified' ||
  meal.ingredients.some(isMenuImportIngredientPending) ||
  (meal.conflict !== null && meal.conflict.decision === null);

export const getMenuImportConflictSummary = (preview: MenuImportPreview): MenuImportConflictSummary => {
  let pendingIngredients = 0;
  let pendingMealDecisions = 0;
  let pendingMealTypes = 0;

  preview.meals.forEach(meal => {
    pendingIngredients += meal.ingredients.filter(isMenuImportIngredientPending).length;
    if (meal.meal_type === 'unspecified') pendingMealTypes += 1;
    if (meal.conflict !== null && meal.conflict.decision === null) pendingMealDecisions += 1;
  });

  return {
    pendingIngredients,
    pendingMealDecisions,
    pendingMealTypes,
    total: pendingIngredients + pendingMealDecisions + pendingMealTypes,
  };
};

export const getVisibleMenuImportIngredients = (
  ingredients: MenuImportPreviewMeal['ingredients'],
  showOnlyConflicts: boolean,
): MenuImportPreviewIngredient[] =>
  showOnlyConflicts ? ingredients.filter(isMenuImportIngredientPending) : ingredients;

export const getVisibleMenuImportMeals = (
  meals: MenuImportPreviewMeal[],
  showOnlyConflicts: boolean,
): MenuImportPreviewMeal[] => (showOnlyConflicts ? meals.filter(isMenuImportMealPending) : meals);
