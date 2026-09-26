import { useSyncExternalStore } from 'react';
import { shoppingListLocalStorage } from '../services/shoppingListLocalStorage';

export function useShoppingLocalSaveStatus(key: string | null) {
  return useSyncExternalStore(
    shoppingListLocalStorage.subscribe,
    () => shoppingListLocalStorage.getStatus(key),
    () => shoppingListLocalStorage.getStatus(null),
  );
}
