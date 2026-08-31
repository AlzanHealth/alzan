import type { MealItem } from '../../../types/requests.types';
import type { IngredientInput } from '../types/db';
import { MIN_INGREDIENT_QUANTITY_G } from '../constants';

export const MAX_QUICK_MEAL_INGREDIENT_QUANTITY_G = 1000;

export const parseQuickMealQuantity = (input: string): number | null => {
  const normalized = input.trim().replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(normalized)) return null;

  const value = Number(normalized);
  if (!Number.isFinite(value) || value < MIN_INGREDIENT_QUANTITY_G || value > MAX_QUICK_MEAL_INGREDIENT_QUANTITY_G) {
    return null;
  }

  return Math.round(value * 10) / 10;
};

export const sanitizeQuickMealQuantity = (input: string): string => {
  const normalized = input.replace(',', '.').replace(/[^\d.]/g, '');
  const [integerPart, ...decimalParts] = normalized.split('.');
  return decimalParts.length === 0 ? integerPart : `${integerPart}.${decimalParts.join('')}`;
};

export const formatQuickMealQuantity = (quantity: number): string => {
  const rounded = Math.round(quantity * 10) / 10;
  return Number.isInteger(rounded) ? `${rounded}` : rounded.toFixed(1);
};

export const buildQuickMealIngredientInputs = (
  items: readonly MealItem[],
  quantityInputs: Readonly<Record<string, string>>,
  excludedIds: ReadonlySet<string> = new Set(),
): IngredientInput[] | null => {
  const inputs: IngredientInput[] = [];

  for (const item of items) {
    if (excludedIds.has(item.id)) continue;

    const quantity = parseQuickMealQuantity(quantityInputs[item.id] ?? formatQuickMealQuantity(item.quantity_g));
    if (quantity == null) return null;

    inputs.push({
      name: item.name,
      quantity_g: quantity,
      source: item.source,
      source_ref: item.source_ref ?? undefined,
      kcal_100: item.per_100g_kcal,
      protein_g_100: item.per_100g_protein_g,
      carbs_g_100: item.per_100g_carbs_g,
      fat_g_100: item.per_100g_fats_g,
    });
  }

  return inputs;
};
