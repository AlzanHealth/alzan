import type { ShoppingListResult } from './shoppingListService';
import { SHOPPING_LIST_CATEGORY_ORDER } from './shoppingListPlanner';

type ShoppingListCacheDescriptor = {
  userId: string;
  mode: string;
  rangeStart: string;
  rangeEnd: string;
  customStartDate?: string;
  customEndDate?: string;
  startDay: number;
  timezone: string;
  mealTimes: Record<string, string>;
  showPast?: boolean;
};

const SHOPPING_LIST_CACHE_PREFIX = 'alzan.shopping-list.result';

export const getShoppingListCacheKey = (descriptor: ShoppingListCacheDescriptor): string =>
  `${SHOPPING_LIST_CACHE_PREFIX}.${encodeURIComponent(JSON.stringify(descriptor))}`;

export const serializeShoppingListResult = (result: ShoppingListResult): string => JSON.stringify(result);

export const parseShoppingListResult = (value: string | null): ShoppingListResult | null => {
  if (!value) return null;

  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const candidate = parsed as Record<string, unknown>;
    const range = candidate.range;
    const ingredients = candidate.ingredients;
    if (
      !range ||
      typeof range !== 'object' ||
      Array.isArray(range) ||
      typeof (range as Record<string, unknown>).startDate !== 'string' ||
      typeof (range as Record<string, unknown>).endDate !== 'string' ||
      !Array.isArray(ingredients) ||
      typeof candidate.totalMealCount !== 'number' ||
      !Number.isFinite(candidate.totalMealCount) ||
      candidate.totalMealCount < 0 ||
      typeof candidate.visibleMealCount !== 'number' ||
      !Number.isFinite(candidate.visibleMealCount) ||
      candidate.visibleMealCount < 0 ||
      typeof candidate.hiddenMealCount !== 'number' ||
      !Number.isFinite(candidate.hiddenMealCount) ||
      candidate.hiddenMealCount < 0
    )
      return null;

    const parsedIngredients: ShoppingListResult['ingredients'] = [];
    for (const item of ingredients) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
      const ingredient = item as Record<string, unknown>;
      if (
        typeof ingredient.key !== 'string' ||
        ingredient.key.trim().length === 0 ||
        typeof ingredient.name !== 'string' ||
        ingredient.name.trim().length === 0 ||
        typeof ingredient.quantity_g !== 'number' ||
        !Number.isFinite(ingredient.quantity_g) ||
        ingredient.quantity_g < 0 ||
        (ingredient.category !== null &&
          (typeof ingredient.category !== 'string' ||
            !SHOPPING_LIST_CATEGORY_ORDER.includes(
              ingredient.category as (typeof SHOPPING_LIST_CATEGORY_ORDER)[number],
            ))) ||
        (ingredient.purchase_quantity_g !== undefined &&
          (typeof ingredient.purchase_quantity_g !== 'number' ||
            !Number.isFinite(ingredient.purchase_quantity_g) ||
            ingredient.purchase_quantity_g <= 0))
      )
        return null;

      if (ingredient.sources !== undefined) {
        if (!Array.isArray(ingredient.sources)) return null;
        for (const source of ingredient.sources) {
          if (!source || typeof source !== 'object' || Array.isArray(source)) return null;
          const candidate = source as Record<string, unknown>;
          if (
            typeof candidate.date !== 'string' ||
            (candidate.mealType !== null && typeof candidate.mealType !== 'string') ||
            (candidate.mealName !== null && typeof candidate.mealName !== 'string')
          )
            return null;
        }
      }
      parsedIngredients.push(item as ShoppingListResult['ingredients'][number]);
    }

    return {
      range: {
        startDate: (range as Record<string, string>).startDate,
        endDate: (range as Record<string, string>).endDate,
      },
      ingredients: parsedIngredients,
      totalMealCount: Math.max(0, candidate.totalMealCount),
      visibleMealCount: Math.max(0, candidate.visibleMealCount),
      hiddenMealCount: Math.max(0, candidate.hiddenMealCount),
    };
  } catch {
    return null;
  }
};
