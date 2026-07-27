import { addDays, format, getISODay, parseISO, subDays } from 'date-fns';

import type { MealItem } from '../../../types/requests.types';

export type ShoppingListStartDay = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export type ShoppingListDateRange = {
  startDate: string;
  endDate: string;
};

export type ShoppingIngredientInput = Pick<MealItem, 'name' | 'quantity_g' | 'source' | 'source_ref'>;

export type ShoppingListIngredient = {
  key: string;
  name: string;
  quantity_g: number;
};

export type ShoppingMealLogInput = {
  id: string;
  adherence_status: string | null;
};

export const DEFAULT_SHOPPING_LIST_START_DAY: ShoppingListStartDay = 1;

export const normalizeShoppingListStartDay = (startDay: number | null | undefined): ShoppingListStartDay =>
  typeof startDay === 'number' && Number.isInteger(startDay) && startDay >= 1 && startDay <= 7
    ? (startDay as ShoppingListStartDay)
    : DEFAULT_SHOPPING_LIST_START_DAY;

export const getShoppingCycleRange = (selectedDate: Date | string, startDay: number): ShoppingListDateRange => {
  const date = typeof selectedDate === 'string' ? parseISO(selectedDate) : selectedDate;
  const normalizedStartDay = normalizeShoppingListStartDay(startDay);
  const daysSinceCycleStart = (getISODay(date) - normalizedStartDay + 7) % 7;
  const start = subDays(date, daysSinceCycleStart);
  const end = addDays(start, 6);

  return {
    startDate: format(start, 'yyyy-MM-dd'),
    endDate: format(end, 'yyyy-MM-dd'),
  };
};

export const getActiveShoppingMealLogIds = (logs: ShoppingMealLogInput[]): string[] =>
  logs.filter(log => log.adherence_status !== 'skipped').map(log => log.id);

const getIngredientKey = (item: ShoppingIngredientInput): string | null => {
  const sourceRef = item.source_ref?.trim();
  if (sourceRef) return `id:${sourceRef}`;

  const normalizedName = item.name
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return normalizedName ? `name:${normalizedName}` : null;
};

export const aggregateShoppingIngredients = (
  items: ShoppingIngredientInput[],
  localizedNamesById: ReadonlyMap<string, string> = new Map(),
): ShoppingListIngredient[] => {
  const aggregated = new Map<string, ShoppingListIngredient>();

  for (const item of items) {
    const key = getIngredientKey(item);
    if (!key) continue;

    const sourceRef = item.source_ref?.trim();
    const name = sourceRef ? localizedNamesById.get(sourceRef) || item.name.trim() : item.name.trim();
    const existing = aggregated.get(key);

    if (existing) {
      existing.quantity_g += Number(item.quantity_g) || 0;
    } else {
      aggregated.set(key, {
        key,
        name,
        quantity_g: Number(item.quantity_g) || 0,
      });
    }
  }

  return Array.from(aggregated.values())
    .map(item => ({ ...item, quantity_g: Math.round(item.quantity_g * 100) / 100 }))
    .sort((left, right) => left.name.localeCompare(right.name));
};

export const formatShoppingQuantity = (quantityGrams: number): string => {
  const roundedGrams = Math.round(Math.max(0, quantityGrams) * 100) / 100;
  if (roundedGrams >= 1000) {
    const kilograms = Math.round((roundedGrams / 1000) * 100) / 100;
    return `${kilograms} kg`;
  }

  return `${roundedGrams} g`;
};
