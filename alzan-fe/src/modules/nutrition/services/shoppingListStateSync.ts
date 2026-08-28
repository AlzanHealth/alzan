import { supabase } from '../../../lib/supabaseClient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  getShoppingListStateStorageKey,
  mergeShoppingListStates,
  serializeShoppingListState,
  type ShoppingListState,
} from './shoppingListState';
import type { ShoppingListDateRange } from './shoppingListPlanner';

type ShoppingListStateRow = {
  ingredient_key: string;
  completed: boolean;
  hidden: boolean;
  purchase_quantity_g: number | null;
  updated_at: string;
};

type ShoppingListStateUpsertRow = ShoppingListStateRow & {
  user_id: string;
  range_start: string;
  range_end: string;
};

type ShoppingListStateResponse = { data: unknown; error: { message?: string } | null };

type ShoppingListStatesQuery = {
  select: (columns: string) => ShoppingListStatesQuery;
  eq: (column: string, value: string) => ShoppingListStatesQuery;
  upsert: (values: ShoppingListStateUpsertRow[], options: { onConflict: string }) => Promise<ShoppingListStateResponse>;
  then: PromiseLike<ShoppingListStateResponse>['then'];
};

const getShoppingListStatesTable = (): ShoppingListStatesQuery =>
  (supabase as unknown as { from: (table: string) => ShoppingListStatesQuery }).from('shopping_list_states');

const stateFromRow = (row: ShoppingListStateRow) => ({
  completed: row.completed,
  hidden: row.hidden,
  ...(typeof row.purchase_quantity_g === 'number' && Number.isFinite(row.purchase_quantity_g)
    ? { purchaseQuantityGrams: row.purchase_quantity_g }
    : {}),
  updatedAt: row.updated_at,
});

export const loadShoppingListStateFromServer = async (
  userId: string,
  range: ShoppingListDateRange,
): Promise<ShoppingListState | null> => {
  try {
    const response = await getShoppingListStatesTable()
      .select('ingredient_key, completed, hidden, purchase_quantity_g, updated_at')
      .eq('user_id', userId)
      .eq('range_start', range.startDate)
      .eq('range_end', range.endDate);
    if (response.error || !Array.isArray(response.data)) return null;
    return Object.fromEntries(
      response.data.flatMap(rawRow => {
        if (!rawRow || typeof rawRow !== 'object') return [];
        const row = rawRow as Partial<ShoppingListStateRow>;
        if (
          typeof row.ingredient_key !== 'string' ||
          typeof row.updated_at !== 'string' ||
          typeof row.completed !== 'boolean' ||
          typeof row.hidden !== 'boolean'
        )
          return [];
        return [[row.ingredient_key, stateFromRow(row as ShoppingListStateRow)]];
      }),
    );
  } catch {
    return null;
  }
};

export const syncShoppingListStateToServer = async (
  userId: string,
  range: ShoppingListDateRange,
  state: ShoppingListState,
): Promise<boolean> => {
  const rows = Object.entries(state).map(([ingredientKey, itemState]) => ({
    ingredient_key: ingredientKey,
    completed: itemState.completed,
    hidden: itemState.hidden,
    purchase_quantity_g: itemState.purchaseQuantityGrams ?? null,
    updated_at: itemState.updatedAt,
    user_id: userId,
    range_start: range.startDate,
    range_end: range.endDate,
  }));
  if (rows.length === 0) return true;
  try {
    const response = await getShoppingListStatesTable().upsert(rows, {
      onConflict: 'user_id,range_start,range_end,ingredient_key',
    });
    return !response.error;
  } catch {
    return false;
  }
};

export const persistShoppingListState = async (
  userId: string,
  range: ShoppingListDateRange,
  state: ShoppingListState,
): Promise<boolean> => {
  const storageKey = getShoppingListStateStorageKey(userId, range);
  const remoteState = await loadShoppingListStateFromServer(userId, range);
  const mergedState = remoteState ? mergeShoppingListStates(state, remoteState) : state;
  await AsyncStorage.setItem(storageKey, serializeShoppingListState(mergedState));
  return syncShoppingListStateToServer(userId, range, mergedState);
};

export { mergeShoppingListStates };
