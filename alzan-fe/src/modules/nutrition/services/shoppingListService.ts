import { getLocalizedIngredientName, getCurrentAppLocale } from '../../../services/localization';
import { supabase } from '../../../lib/supabaseClient';
import type { IngredientsCategory } from '../../../types/requests.types';
import type {
  ShoppingIngredientInput,
  ShoppingListDateRange,
  ShoppingListIngredient,
  ShoppingListRequest,
  ShoppingMealLogInput,
  ShoppingMealTimes,
  ShoppingListIngredientSource,
} from './shoppingListPlanner';
import {
  aggregateShoppingIngredients,
  getActiveShoppingMealLogIds,
  getShoppingMealState,
  getShoppingRange,
  planShoppingMealLogs,
} from './shoppingListPlanner';

export type { ShoppingListDateRange, ShoppingListIngredient } from './shoppingListPlanner';

export type ShoppingListResult = {
  range: ShoppingListDateRange;
  ingredients: ShoppingListIngredient[];
  totalMealCount: number;
  visibleMealCount: number;
  hiddenMealCount: number;
};

export class ShoppingListCatalogError extends Error {
  readonly missingIngredientIds: string[];

  constructor(message: string, missingIngredientIds: string[] = []) {
    super(message);
    this.name = 'ShoppingListCatalogError';
    this.missingIngredientIds = missingIngredientIds;
  }
}

type IngredientNameLookupRow = {
  id: string;
  name_es: string;
  name_en: string;
  category: IngredientsCategory | null;
};

export async function getShoppingList(
  userId: string,
  selectedDate: Date | string,
  startDay: number,
  options: {
    mode?: ShoppingListRequest['mode'];
    customStartDate?: string;
    customEndDate?: string;
    now?: Date;
    timezone?: string;
    mealTimes?: ShoppingMealTimes;
    showPast?: boolean;
  } = {},
): Promise<ShoppingListResult> {
  if (!userId) throw new Error('No authenticated user');

  const selectedDateKey = typeof selectedDate === 'string' ? selectedDate : selectedDate.toISOString().slice(0, 10);
  const request: ShoppingListRequest = {
    mode: options.mode || 'upcoming',
    selectedDate: selectedDateKey,
    customStartDate: options.customStartDate,
    customEndDate: options.customEndDate,
    now: options.now || new Date(),
    timezone: options.timezone,
    mealTimes: options.mealTimes,
    showPast: options.showPast,
  };
  const range = getShoppingRange(request, startDay);
  const { data: logs, error: logsError } = await supabase
    .from('meal_logs')
    .select('id, date, meal_type, name, adherence_status, source, origin')
    .eq('user_id', userId)
    .gte('date', range.startDate)
    .lte('date', range.endDate);

  if (logsError) throw logsError;

  const allLogs = (logs || []) as ShoppingMealLogInput[];
  const visibleLogs = planShoppingMealLogs(allLogs, request);
  const sourcesByMealLogId = new Map<string, ShoppingListIngredientSource>(
    visibleLogs.map(log => [
      log.id,
      {
        date: log.date || range.startDate,
        mealType: log.meal_type || null,
        mealName: log.name?.trim() || null,
      },
    ]),
  );
  const mealLogIds = getActiveShoppingMealLogIds(visibleLogs);
  const hiddenMealCount =
    request.mode === 'upcoming' && !request.showPast
      ? allLogs.filter(log => getShoppingMealState(log, request) === 'past').length
      : 0;
  if (mealLogIds.length === 0) {
    return {
      range,
      ingredients: [],
      totalMealCount: allLogs.length,
      visibleMealCount: 0,
      hiddenMealCount,
    };
  }

  const { data: items, error: itemsError } = await supabase
    .from('meal_items')
    .select('name, quantity_g, source, source_ref, meal_log_id')
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
  const categoriesById = new Map<string, IngredientsCategory>();

  if (databaseIngredientIds.length > 0) {
    const { data: ingredients, error: ingredientsError } = await supabase
      .from('ingredients')
      .select('id, name_es, name_en, category')
      .in('id', databaseIngredientIds)
      .returns<IngredientNameLookupRow[]>();

    if (ingredientsError) {
      throw new ShoppingListCatalogError('Could not load the ingredients catalog');
    }
    if (!ingredients || ingredients.length === 0) {
      throw new ShoppingListCatalogError('The ingredients catalog returned no results', databaseIngredientIds);
    }

    const returnedIds = new Set(ingredients.map(ingredient => ingredient.id));
    const missingIngredientIds = databaseIngredientIds.filter(id => !returnedIds.has(id));
    if (missingIngredientIds.length > 0) {
      throw new ShoppingListCatalogError('The ingredients catalog is incomplete', missingIngredientIds);
    }

    const locale = getCurrentAppLocale();
    ingredients.forEach(ingredient => {
      localizedNamesById.set(ingredient.id, getLocalizedIngredientName(ingredient, locale));
      if (ingredient.category) categoriesById.set(ingredient.id, ingredient.category);
    });
  }

  return {
    range,
    ingredients: aggregateShoppingIngredients(items || [], localizedNamesById, categoriesById, sourcesByMealLogId),
    totalMealCount: allLogs.length,
    visibleMealCount: visibleLogs.length,
    hiddenMealCount,
  };
}
