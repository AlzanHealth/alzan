import type { ShoppingListDateRange } from './shoppingListPlanner';
import type { ShoppingListState } from './shoppingListState';

export type ShoppingListStateSyncAdapter = {
  load: (userId: string, range: ShoppingListDateRange) => Promise<ShoppingListState>;
  upsert: (userId: string, range: ShoppingListDateRange, state: ShoppingListState) => Promise<void>;
  clear: (userId: string, range: ShoppingListDateRange) => Promise<void>;
};

export const syncShoppingListStateWithAdapter = async (
  adapter: ShoppingListStateSyncAdapter,
  userId: string,
  range: ShoppingListDateRange,
  state: ShoppingListState,
): Promise<boolean> => {
  try {
    await adapter.upsert(userId, range, state);
    return true;
  } catch {
    return false;
  }
};

export const clearShoppingListStateWithAdapter = async (
  adapter: ShoppingListStateSyncAdapter,
  userId: string,
  range: ShoppingListDateRange,
): Promise<boolean> => {
  try {
    await adapter.clear(userId, range);
    return true;
  } catch {
    return false;
  }
};

export const createShoppingListStateSyncQueue = () => {
  const pending = new Map<string, Promise<unknown>>();
  return {
    enqueue<T>(key: string, operation: () => Promise<T>): Promise<T> {
      const previous = pending.get(key) || Promise.resolve();
      const next = previous.catch(() => undefined).then(operation);
      const cleanup = () => {
        if (pending.get(key) === next) pending.delete(key);
      };
      pending.set(key, next);
      void next.then(cleanup, cleanup);
      return next;
    },
  };
};

// Local durability must never wait behind a network request.
export const persistShoppingListLocallyFirst = async (
  saveLocal: () => Promise<void>,
  saveRemote: () => Promise<boolean>,
): Promise<boolean> => {
  const localSaved = await saveLocal()
    .then(() => true)
    .catch(() => false);
  const remoteSaved = await saveRemote().catch(() => false);
  return localSaved && remoteSaved;
};
