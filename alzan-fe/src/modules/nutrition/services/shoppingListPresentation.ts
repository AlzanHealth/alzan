import type { ShoppingListIngredient, ShoppingListIngredientFilter } from './shoppingListPlanner';

export function getShoppingDisplayIngredients(
  ingredients: ShoppingListIngredient[],
  filtered: ShoppingListIngredient[],
  filter: ShoppingListIngredientFilter,
  retainedKeys: ReadonlySet<string>,
): ShoppingListIngredient[] {
  if (filter !== 'pending' || retainedKeys.size === 0) return filtered;
  const visibleKeys = new Set(filtered.map(item => item.key));
  return ingredients.filter(item => visibleKeys.has(item.key) || retainedKeys.has(item.key));
}
