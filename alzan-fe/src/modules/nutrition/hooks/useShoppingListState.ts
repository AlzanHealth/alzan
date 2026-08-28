import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  getShoppingListCompletionStorageKey,
  parseShoppingListCompletionKeys,
} from '../services/shoppingListCompletion';
import {
  createShoppingListItemState,
  getShoppingListStateStorageKey,
  mergeShoppingListStates,
  parseShoppingListState,
  resetShoppingListState,
  type ShoppingListState,
} from '../services/shoppingListState';
import { loadShoppingListStateFromServer, persistShoppingListState } from '../services/shoppingListStateSync';
import type {
  ShoppingListDateRange,
  ShoppingListIngredient,
  ShoppingListIngredientFilter,
} from '../services/shoppingListPlanner';

export function useShoppingListState(userId: string | undefined, range: ShoppingListDateRange) {
  const storageKey = useMemo(
    () => (userId ? getShoppingListStateStorageKey(userId, range) : null),
    [range.endDate, range.startDate, userId],
  );
  const [state, setState] = useState<ShoppingListState>({});
  const stateRef = useRef<ShoppingListState>({});
  const [filter, setFilter] = useState<ShoppingListIngredientFilter>('all');
  const [isHydrated, setIsHydrated] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setIsHydrated(false);
    setIsSyncing(false);

    if (!userId || !storageKey) {
      stateRef.current = {};
      setState({});
      setIsHydrated(true);
      return () => {
        cancelled = true;
      };
    }

    void (async () => {
      const localValue = await AsyncStorage.getItem(storageKey).catch(() => null);
      let localState = parseShoppingListState(localValue);

      if (Object.keys(localState).length === 0) {
        const legacyValue = await AsyncStorage.getItem(
          getShoppingListCompletionStorageKey(userId, range.startDate),
        ).catch(() => null);
        const legacyKeys = parseShoppingListCompletionKeys(legacyValue);
        localState = Object.fromEntries(
          Array.from(legacyKeys, key => [
            key,
            createShoppingListItemState({ completed: true, updatedAt: new Date().toISOString() }),
          ]),
        );
      }

      if (cancelled) return;
      stateRef.current = localState;
      setState(localState);
      setIsHydrated(true);

      const remoteState = await loadShoppingListStateFromServer(userId, range);
      if (cancelled || !remoteState) return;
      const merged = mergeShoppingListStates(stateRef.current, remoteState);
      stateRef.current = merged;
      setState(merged);
      void AsyncStorage.setItem(storageKey, JSON.stringify(merged));
    })().catch(() => {
      if (cancelled) return;
      stateRef.current = {};
      setState({});
      setIsHydrated(true);
    });

    return () => {
      cancelled = true;
    };
  }, [range.endDate, range.startDate, storageKey, userId]);

  const updateState = useCallback(
    (updater: (previous: ShoppingListState) => ShoppingListState) => {
      if (!userId || !isHydrated) return;
      const next = updater(stateRef.current);
      stateRef.current = next;
      setState(next);
      setIsSyncing(true);
      void persistShoppingListState(userId, range, next).finally(() => setIsSyncing(false));
    },
    [isHydrated, range, userId],
  );

  const toggleIngredient = useCallback(
    (ingredientKey: string) => {
      updateState(previous => ({
        ...previous,
        [ingredientKey]: createShoppingListItemState({
          ...previous[ingredientKey],
          completed: !previous[ingredientKey]?.completed,
          updatedAt: new Date().toISOString(),
        }),
      }));
    },
    [updateState],
  );

  const setCategoryCompleted = useCallback(
    (ingredients: ShoppingListIngredient[], completed: boolean) => {
      updateState(previous => {
        const now = new Date().toISOString();
        const next = { ...previous };
        ingredients.forEach(ingredient => {
          next[ingredient.key] = createShoppingListItemState({ ...next[ingredient.key], completed, updatedAt: now });
        });
        return next;
      });
    },
    [updateState],
  );

  const clearCompleted = useCallback(() => {
    updateState(previous => {
      const next = { ...previous };
      Object.entries(next).forEach(([key, item]) => {
        if (item.completed) next[key] = { ...item, completed: false, updatedAt: new Date().toISOString() };
      });
      return next;
    });
  }, [updateState]);

  const hideIngredient = useCallback(
    (ingredientKey: string) => {
      updateState(previous => ({
        ...previous,
        [ingredientKey]: createShoppingListItemState({
          ...previous[ingredientKey],
          hidden: true,
          updatedAt: new Date().toISOString(),
        }),
      }));
    },
    [updateState],
  );

  const undoHideIngredient = useCallback(
    (ingredientKey: string) => {
      updateState(previous => ({
        ...previous,
        [ingredientKey]: createShoppingListItemState({
          ...previous[ingredientKey],
          hidden: false,
          updatedAt: new Date().toISOString(),
        }),
      }));
    },
    [updateState],
  );

  const setPurchaseQuantity = useCallback(
    (ingredientKey: string, quantityGrams: number) => {
      if (!Number.isFinite(quantityGrams) || quantityGrams <= 0) return;
      updateState(previous => ({
        ...previous,
        [ingredientKey]: createShoppingListItemState({
          ...previous[ingredientKey],
          purchaseQuantityGrams: Math.round(quantityGrams * 100) / 100,
          updatedAt: new Date().toISOString(),
        }),
      }));
    },
    [updateState],
  );

  const resetRange = useCallback(() => {
    updateState(resetShoppingListState);
  }, [updateState]);

  const completedKeys = useMemo(
    () =>
      new Set(
        Object.entries(state)
          .filter(([, item]) => item.completed)
          .map(([key]) => key),
      ),
    [state],
  );
  const hiddenKeys = useMemo(
    () =>
      new Set(
        Object.entries(state)
          .filter(([, item]) => item.hidden)
          .map(([key]) => key),
      ),
    [state],
  );
  const purchaseQuantities = useMemo(
    () =>
      new Map(
        Object.entries(state).flatMap(([key, item]) =>
          item.purchaseQuantityGrams ? [[key, item.purchaseQuantityGrams]] : [],
        ),
      ),
    [state],
  );

  return {
    completedKeys,
    hiddenKeys,
    purchaseQuantities,
    filter,
    setFilter,
    isHydrated,
    isSyncing,
    toggleIngredient,
    setCategoryCompleted,
    clearCompleted,
    hideIngredient,
    undoHideIngredient,
    setPurchaseQuantity,
    resetRange,
  };
}
