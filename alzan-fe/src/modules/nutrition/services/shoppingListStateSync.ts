import AsyncStorage from '@react-native-async-storage/async-storage';

import { supabase } from '../../../lib/supabaseClient';
import {
  getShoppingListStateStorageKey,
  mergeShoppingListStates,
  resetShoppingListState,
  serializeShoppingListState,
  type ShoppingListState,
} from './shoppingListState';
import type { ShoppingListDateRange } from './shoppingListPlanner';
import {
  clearShoppingListStateWithAdapter,
  createShoppingListStateSyncQueue,
  syncShoppingListStateWithAdapter,
  type ShoppingListStateSyncAdapter,
} from './shoppingListStateSyncCore';
import {
  buildShoppingListStateUpsertRows,
  parseShoppingListStateRows,
  type ShoppingListStateUpsertRow,
} from './shoppingListStateSyncSerializer';

export {
  clearShoppingListStateWithAdapter,
  createShoppingListStateSyncQueue,
  syncShoppingListStateWithAdapter,
} from './shoppingListStateSyncCore';
export type { ShoppingListStateSyncAdapter } from './shoppingListStateSyncCore';

type ShoppingListStateResponse = { data: unknown; error: { message?: string } | null };

type ShoppingListStatesQuery = {
  select: (columns: string) => ShoppingListStatesQuery;
  eq: (column: string, value: string) => ShoppingListStatesQuery;
  delete: () => ShoppingListStatesQuery;
  upsert: (values: ShoppingListStateUpsertRow[], options: { onConflict: string }) => Promise<ShoppingListStateResponse>;
  then: PromiseLike<ShoppingListStateResponse>['then'];
};

const getShoppingListStatesTable = (): ShoppingListStatesQuery =>
  (supabase as unknown as { from: (table: string) => ShoppingListStatesQuery }).from('shopping_list_states');

const upsertShoppingListStateInSupabase = async (
  userId: string,
  range: ShoppingListDateRange,
  state: ShoppingListState,
): Promise<void> => {
  const rows = buildShoppingListStateUpsertRows(userId, range, state);
  if (rows.length === 0) return;
  const response = await getShoppingListStatesTable().upsert(rows, {
    onConflict: 'user_id,range_start,range_end,ingredient_key',
  });
  if (response.error) throw new Error(response.error.message || 'Could not save shopping list state');
};

const clearShoppingListStateInSupabase = async (userId: string, range: ShoppingListDateRange): Promise<void> => {
  const response = await getShoppingListStatesTable()
    .delete()
    .eq('user_id', userId)
    .eq('range_start', range.startDate)
    .eq('range_end', range.endDate);
  if (response.error) throw new Error(response.error.message || 'Could not reset shopping list state');
};

const supabaseShoppingListStateAdapter: ShoppingListStateSyncAdapter = {
  async load(userId, range) {
    const response = await getShoppingListStatesTable()
      .select('ingredient_key, completed, hidden, available_quantity_g, updated_at')
      .eq('user_id', userId)
      .eq('range_start', range.startDate)
      .eq('range_end', range.endDate);
    if (response.error) throw new Error(response.error.message || 'Could not load shopping list state');
    const state = parseShoppingListStateRows(response.data);
    if (!state) throw new Error('Shopping list state response was malformed');
    return state;
  },
  upsert: upsertShoppingListStateInSupabase,
  clear: clearShoppingListStateInSupabase,
};

export const loadShoppingListStateFromServer = async (
  userId: string,
  range: ShoppingListDateRange,
): Promise<ShoppingListState | null> => {
  try {
    return await supabaseShoppingListStateAdapter.load(userId, range);
  } catch {
    return null;
  }
};

const syncQueue = createShoppingListStateSyncQueue();
const getRangeKey = (userId: string, range: ShoppingListDateRange): string =>
  `${userId}:${range.startDate}:${range.endDate}`;

export const syncShoppingListStateToServer = async (
  userId: string,
  range: ShoppingListDateRange,
  state: ShoppingListState,
): Promise<boolean> =>
  syncQueue.enqueue(getRangeKey(userId, range), () =>
    syncShoppingListStateWithAdapter(supabaseShoppingListStateAdapter, userId, range, state),
  );

export const clearShoppingListStateOnServer = async (userId: string, range: ShoppingListDateRange): Promise<boolean> =>
  syncQueue.enqueue(getRangeKey(userId, range), () =>
    clearShoppingListStateWithAdapter(supabaseShoppingListStateAdapter, userId, range),
  );

export const resetShoppingListStatePersisted = async (userId: string, range: ShoppingListDateRange): Promise<boolean> =>
  syncQueue.enqueue(getRangeKey(userId, range), async () => {
    const localSaved = await AsyncStorage.setItem(
      getShoppingListStateStorageKey(userId, range),
      serializeShoppingListState(resetShoppingListState()),
    )
      .then(() => true)
      .catch(() => false);
    const remoteCleared = await clearShoppingListStateWithAdapter(supabaseShoppingListStateAdapter, userId, range);
    return localSaved && remoteCleared;
  });

export const persistShoppingListState = async (
  userId: string,
  range: ShoppingListDateRange,
  state: ShoppingListState,
): Promise<boolean> =>
  syncQueue.enqueue(getRangeKey(userId, range), async () => {
    try {
      await AsyncStorage.setItem(getShoppingListStateStorageKey(userId, range), serializeShoppingListState(state));
      await supabaseShoppingListStateAdapter.upsert(userId, range, state);
      return true;
    } catch {
      return false;
    }
  });

export { mergeShoppingListStates };
