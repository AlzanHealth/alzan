import type { ShoppingListResult } from './shoppingListService';

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
      typeof candidate.visibleMealCount !== 'number' ||
      typeof candidate.hiddenMealCount !== 'number'
    )
      return null;

    return {
      range: {
        startDate: (range as Record<string, string>).startDate,
        endDate: (range as Record<string, string>).endDate,
      },
      ingredients: ingredients.filter(item => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) return false;
        const ingredient = item as Record<string, unknown>;
        return (
          typeof ingredient.key === 'string' &&
          typeof ingredient.name === 'string' &&
          typeof ingredient.quantity_g === 'number' &&
          (ingredient.category === null || typeof ingredient.category === 'string')
        );
      }) as ShoppingListResult['ingredients'],
      totalMealCount: Math.max(0, candidate.totalMealCount),
      visibleMealCount: Math.max(0, candidate.visibleMealCount),
      hiddenMealCount: Math.max(0, candidate.hiddenMealCount),
    };
  } catch {
    return null;
  }
};
