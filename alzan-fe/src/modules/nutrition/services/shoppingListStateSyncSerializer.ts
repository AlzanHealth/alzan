import type { ShoppingListDateRange } from './shoppingListPlanner';
import type { ShoppingListState } from './shoppingListState';

export type ShoppingListStateRow = {
  ingredient_key: string;
  completed: boolean;
  hidden: boolean;
  available_quantity_g: number | null;
  updated_at: string;
};

export type ShoppingListStateUpsertRow = ShoppingListStateRow & {
  user_id: string;
  range_start: string;
  range_end: string;
};

const stateFromRow = (row: ShoppingListStateRow) => ({
  completed: row.completed,
  hidden: row.hidden,
  ...(typeof row.available_quantity_g === 'number' && Number.isFinite(row.available_quantity_g)
    ? { availableQuantityGrams: row.available_quantity_g }
    : {}),
  updatedAt: row.updated_at,
});

export const parseShoppingListStateRows = (value: unknown): ShoppingListState | null => {
  if (!Array.isArray(value)) return null;
  const parsed: ShoppingListState = {};
  for (const rawRow of value) {
    if (!rawRow || typeof rawRow !== 'object' || Array.isArray(rawRow)) return null;
    const row = rawRow as Partial<ShoppingListStateRow>;
    if (
      typeof row.ingredient_key !== 'string' ||
      row.ingredient_key.trim().length === 0 ||
      typeof row.updated_at !== 'string' ||
      !Number.isFinite(Date.parse(row.updated_at)) ||
      typeof row.completed !== 'boolean' ||
      typeof row.hidden !== 'boolean' ||
      (row.available_quantity_g !== null &&
        (typeof row.available_quantity_g !== 'number' ||
          !Number.isFinite(row.available_quantity_g) ||
          row.available_quantity_g < 0))
    )
      return null;
    parsed[row.ingredient_key] = stateFromRow(row as ShoppingListStateRow);
  }
  return parsed;
};

export const buildShoppingListStateUpsertRows = (
  userId: string,
  range: ShoppingListDateRange,
  state: ShoppingListState,
): ShoppingListStateUpsertRow[] =>
  Object.entries(state).map(([ingredientKey, itemState]) => ({
    ingredient_key: ingredientKey,
    completed: itemState.completed,
    hidden: itemState.hidden,
    available_quantity_g: itemState.availableQuantityGrams ?? null,
    updated_at: itemState.updatedAt,
    user_id: userId,
    range_start: range.startDate,
    range_end: range.endDate,
  }));
