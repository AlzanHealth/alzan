import { getLocalizedIngredientName, getCurrentAppLocale } from '../../../services/localization';
import { supabase } from '../../../lib/supabaseClient';
import type { ShoppingIngredientInput, ShoppingListDateRange, ShoppingListIngredient } from './shoppingListPlanner';
import {
  aggregateShoppingIngredients,
  getActiveShoppingMealLogIds,
  getShoppingCycleRange,
} from './shoppingListPlanner';

export type { ShoppingListDateRange, ShoppingListIngredient } from './shoppingListPlanner';

export type ShoppingListResult = {
  range: ShoppingListDateRange;
  ingredients: ShoppingListIngredient[];
};

type IngredientNameLookupRow = {
  id: string;
  name_es: string;
  name_en: string;
};

export async function getShoppingList(
  userId: string,
  selectedDate: Date | string,
  startDay: number,
): Promise<ShoppingListResult> {
  if (!userId) throw new Error('No authenticated user');

  const range = getShoppingCycleRange(selectedDate, startDay);
  const { data: logs, error: logsError } = await supabase
    .from('meal_logs')
    .select('id, adherence_status')
    .eq('user_id', userId)
    .gte('date', range.startDate)
    .lte('date', range.endDate);

  if (logsError) throw logsError;

  const mealLogIds = getActiveShoppingMealLogIds(logs || []);
  if (mealLogIds.length === 0) return { range, ingredients: [] };

  const { data: items, error: itemsError } = await supabase
    .from('meal_items')
    .select('name, quantity_g, source, source_ref')
    .eq('user_id', userId)
    .in('meal_log_id', mealLogIds)
    .returns<ShoppingIngredientInput[]>();

  if (itemsError) throw itemsError;

  const databaseIngredientIds = Array.from(
    new Set(
      (items || [])
        .filter(
          (item): item is ShoppingIngredientInput & { source_ref: string } =>
            item.source === 'database' && typeof item.source_ref === 'string' && item.source_ref.trim().length > 0,
        )
        .map(item => item.source_ref),
    ),
  );
  const localizedNamesById = new Map<string, string>();

  if (databaseIngredientIds.length > 0) {
    const { data: ingredients, error: ingredientsError } = await supabase
      .from('ingredients')
      .select('id, name_es, name_en')
      .in('id', databaseIngredientIds)
      .returns<IngredientNameLookupRow[]>();

    if (!ingredientsError && ingredients) {
      const locale = getCurrentAppLocale();
      ingredients.forEach(ingredient => {
        localizedNamesById.set(ingredient.id, getLocalizedIngredientName(ingredient, locale));
      });
    }
  }

  return {
    range,
    ingredients: aggregateShoppingIngredients(items || [], localizedNamesById),
  };
}
