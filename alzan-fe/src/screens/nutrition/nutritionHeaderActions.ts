type MenuImportTarget = { screen: 'MenuImport' };
type RecipeLibraryTarget = { screen: 'RecipeLibrary'; params: { date: string } };
type ShoppingListTarget = { screen: 'ShoppingList'; params: { date: string } };

export const getNutritionHomeMenuImportTarget = (): MenuImportTarget => ({ screen: 'MenuImport' });

export const getNutritionHomeRecipeLibraryTarget = (date: string): RecipeLibraryTarget => ({
  screen: 'RecipeLibrary',
  params: { date },
});

export const getRecipeLibraryShoppingListTarget = (date: string): ShoppingListTarget => ({
  screen: 'ShoppingList',
  params: { date },
});
