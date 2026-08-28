import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  getShoppingListCompletionStorageKey,
  parseShoppingListCompletionKeys,
} from '../services/shoppingListCompletion';
import {
  createShoppingListItemState,
  areShoppingListStatesEqual,
  getShoppingListStateStorageKey,
  getShoppingListResetStorageKey,
  mergeShoppingListStateWithLegacy,
  mergeShoppingListStates,
  parseShoppingListState,
  resetShoppingListState,
  serializeShoppingListState,
  SHOPPING_LIST_RESET_PENDING_VALUE,
  type ShoppingListState,
} from '../services/shoppingListState';
import {
  loadShoppingListStateFromServer,
  persistShoppingListState,
  resetShoppingListStatePersisted,
} from '../services/shoppingListStateSync';
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
  const [syncError, setSyncError] = useState<Error | null>(null);
  const mutationVersionRef = useRef(0);
  const syncOperationRef = useRef(0);
  const resetPendingRef = useRef<string | null>(null);
  const resetStorageKey = useMemo(
    () => (userId ? getShoppingListResetStorageKey(userId, range) : null),
    [range.endDate, range.startDate, userId],
  );

  const runSync = useCallback(async (operation: () => Promise<boolean>): Promise<boolean> => {
    const operationId = ++syncOperationRef.current;
    setIsSyncing(true);
    const ok = await operation().catch(() => false);
    if (operationId === syncOperationRef.current) {
      setIsSyncing(false);
      setSyncError(ok ? null : new Error('Shopping list synchronization failed'));
    }
    return ok;
  }, []);

  useEffect(() => {
    let cancelled = false;
    setIsHydrated(false);
    setIsSyncing(false);
    setSyncError(null);

    if (!userId || !storageKey) {
      resetPendingRef.current = null;
      stateRef.current = {};
      setState({});
      setIsHydrated(true);
      return () => {
        cancelled = true;
      };
    }

    const hydrationMutationVersion = mutationVersionRef.current;
    void (async () => {
      const localValue = await AsyncStorage.getItem(storageKey).catch(() => null);
      const localState = parseShoppingListState(localValue);
      const legacyValue = await AsyncStorage.getItem(
        getShoppingListCompletionStorageKey(userId, range.startDate),
      ).catch(() => null);
      const legacyKeys = parseShoppingListCompletionKeys(legacyValue);
      const migratedState = mergeShoppingListStateWithLegacy(localState, legacyKeys);
      const resetPending =
        resetStorageKey !== null &&
        (await AsyncStorage.getItem(resetStorageKey).catch(() => null)) === SHOPPING_LIST_RESET_PENDING_VALUE;

      if (cancelled) return;
      if (resetPending) resetPendingRef.current = resetStorageKey;
      stateRef.current = resetPending ? resetShoppingListState() : migratedState;
      setState(stateRef.current);
      setIsHydrated(true);

      if (resetPending) {
        const cleared = await runSync(() => resetShoppingListStatePersisted(userId, range));
        if (cancelled || !cleared) return;
        await AsyncStorage.removeItem(resetStorageKey!).catch(() => undefined);
        resetPendingRef.current = null;
        await AsyncStorage.removeItem(getShoppingListCompletionStorageKey(userId, range.startDate)).catch(
          () => undefined,
        );
        return;
      }

      const migratedStorageSaved = await AsyncStorage.setItem(storageKey, serializeShoppingListState(migratedState))
        .then(() => true)
        .catch(() => false);
      if (migratedStorageSaved && legacyKeys.size > 0) {
        await AsyncStorage.removeItem(getShoppingListCompletionStorageKey(userId, range.startDate)).catch(
          () => undefined,
        );
      }

      const remoteState = await loadShoppingListStateFromServer(userId, range);
      if (cancelled || mutationVersionRef.current !== hydrationMutationVersion || !remoteState) return;
      const merged = mergeShoppingListStates(migratedState, remoteState);
      stateRef.current = merged;
      setState(merged);
      if (!areShoppingListStatesEqual(merged, remoteState)) {
        await runSync(() => persistShoppingListState(userId, range, merged));
      } else {
        await AsyncStorage.setItem(storageKey, serializeShoppingListState(merged)).catch(() => undefined);
      }
    })().catch(() => {
      if (cancelled) return;
      stateRef.current = {};
      setState({});
      setIsHydrated(true);
    });

    return () => {
      cancelled = true;
    };
  }, [range.endDate, range.startDate, resetStorageKey, runSync, storageKey, userId]);

  const updateState = useCallback(
    (updater: (previous: ShoppingListState) => ShoppingListState) => {
      if (!userId || !isHydrated) return;
      mutationVersionRef.current += 1;
      const next = updater(stateRef.current);
      stateRef.current = next;
      setState(next);
      void runSync(() => persistShoppingListState(userId, range, next));
    },
    [isHydrated, range, runSync, userId],
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

  const resetRange = useCallback(async (): Promise<boolean> => {
    if (!userId || !isHydrated || !storageKey || !resetStorageKey) return false;
    mutationVersionRef.current += 1;
    const emptyState = resetShoppingListState();
    stateRef.current = emptyState;
    setState(emptyState);
    resetPendingRef.current = resetStorageKey;
    const markerSaved = await AsyncStorage.setItem(resetStorageKey, SHOPPING_LIST_RESET_PENDING_VALUE)
      .then(() => true)
      .catch(() => false);
    const cleared = await runSync(() => resetShoppingListStatePersisted(userId, range));
    if (!cleared || !markerSaved) return false;
    const markerRemoved = await AsyncStorage.removeItem(resetStorageKey)
      .then(() => true)
      .catch(() => false);
    if (markerRemoved) {
      resetPendingRef.current = null;
      await AsyncStorage.removeItem(getShoppingListCompletionStorageKey(userId, range.startDate)).catch(
        () => undefined,
      );
    }
    return markerRemoved;
  }, [isHydrated, range, resetStorageKey, runSync, storageKey, userId]);

  const retrySync = useCallback(async (): Promise<boolean> => {
    if (!userId || !storageKey || !resetStorageKey) return false;
    const resetPending =
      resetPendingRef.current === resetStorageKey ||
      (await AsyncStorage.getItem(resetStorageKey).catch(() => null)) === SHOPPING_LIST_RESET_PENDING_VALUE;
    if (resetPending) {
      const cleared = await runSync(() => resetShoppingListStatePersisted(userId, range));
      if (!cleared) return false;
      const markerRemoved = await AsyncStorage.removeItem(resetStorageKey)
        .then(() => true)
        .catch(() => false);
      if (markerRemoved) {
        resetPendingRef.current = null;
        await AsyncStorage.removeItem(getShoppingListCompletionStorageKey(userId, range.startDate)).catch(
          () => undefined,
        );
      }
      return markerRemoved;
    }
    return runSync(() => persistShoppingListState(userId, range, stateRef.current));
  }, [range, resetStorageKey, runSync, storageKey, userId]);

  const completedKeys = useMemo(
    () =>
      new Set(
        Object.entries(state)
          .filter(([, item]) => item.completed)
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
    purchaseQuantities,
    filter,
    setFilter,
    isHydrated,
    isSyncing,
    syncError,
    toggleIngredient,
    setCategoryCompleted,
    clearCompleted,
    setPurchaseQuantity,
    resetRange,
    retrySync,
  };
}
