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
  const activeStorageKeyRef = useRef(storageKey);
  activeStorageKeyRef.current = storageKey;
  const stateRef = useRef<ShoppingListState>({});
  const [filter, setFilter] = useState<ShoppingListIngredientFilter>('all');
  const [hydratedKey, setHydratedKey] = useState<string | null>(null);
  const isHydrated = storageKey !== null && hydratedKey === storageKey;
  const [hydrationAttempt, setHydrationAttempt] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncError, setSyncError] = useState<Error | null>(null);
  const resetVersionRef = useRef(0);
  const syncOperationRef = useRef(0);
  const resetPendingRef = useRef<string | null>(null);
  const resetStorageKey = useMemo(
    () => (userId ? getShoppingListResetStorageKey(userId, range) : null),
    [range.endDate, range.startDate, userId],
  );

  const runSync = useCallback(
    async (operation: () => Promise<boolean>): Promise<boolean> => {
      if (activeStorageKeyRef.current !== storageKey) return false;
      const operationId = ++syncOperationRef.current;
      setIsSyncing(true);
      const ok = await operation().catch(() => false);
      if (activeStorageKeyRef.current === storageKey && operationId === syncOperationRef.current) {
        setIsSyncing(false);
        setSyncError(ok ? null : new Error('Shopping list synchronization failed'));
      }
      return ok;
    },
    [storageKey],
  );

  const persistState = useCallback(
    async (next: ShoppingListState): Promise<boolean> => {
      if (!userId || !storageKey) return false;
      const resetVersion = resetVersionRef.current;
      return persistShoppingListState(userId, range, next, async confirmed => {
        if (
          activeStorageKeyRef.current !== storageKey ||
          resetPendingRef.current ||
          resetVersionRef.current !== resetVersion
        )
          return;
        // Reconcile with edits made while the request was in flight, not its old snapshot.
        const merged = mergeShoppingListStates(stateRef.current, confirmed);
        stateRef.current = merged;
        setState(merged);
        await AsyncStorage.setItem(storageKey, serializeShoppingListState(merged));
      });
    },
    [userId, range.startDate, range.endDate, storageKey],
  );

  useEffect(() => {
    let cancelled = false;
    setHydratedKey(null);
    setIsSyncing(false);
    setSyncError(null);

    if (!userId || !storageKey) {
      resetPendingRef.current = null;
      stateRef.current = {};
      setState({});
      return () => {
        cancelled = true;
      };
    }

    const hydrationResetVersion = resetVersionRef.current;
    void (async () => {
      const localValue = await AsyncStorage.getItem(storageKey);
      const localState = parseShoppingListState(localValue);
      const legacyValue = await AsyncStorage.getItem(getShoppingListCompletionStorageKey(userId, range.startDate));
      const legacyKeys = parseShoppingListCompletionKeys(legacyValue);
      const migratedState = mergeShoppingListStateWithLegacy(localState, legacyKeys);
      const resetPending =
        resetStorageKey !== null && (await AsyncStorage.getItem(resetStorageKey)) === SHOPPING_LIST_RESET_PENDING_VALUE;

      if (cancelled) return;
      resetPendingRef.current = resetPending ? resetStorageKey : null;
      stateRef.current = resetPending ? resetShoppingListState() : migratedState;
      setState(stateRef.current);

      if (resetPending) {
        const cleared = await runSync(() => resetShoppingListStatePersisted(userId, range));
        if (cancelled || !cleared) return;
        await AsyncStorage.removeItem(resetStorageKey!);
        if (cancelled) return;
        resetPendingRef.current = null;
        await AsyncStorage.removeItem(getShoppingListCompletionStorageKey(userId, range.startDate)).catch(
          () => undefined,
        );
        if (!cancelled) setHydratedKey(storageKey);
        return;
      }

      const migratedStorageSaved = await AsyncStorage.setItem(storageKey, serializeShoppingListState(migratedState))
        .then(() => true)
        .catch(() => false);
      if (!migratedStorageSaved && !cancelled) setSyncError(new Error('Could not save shopping list locally'));
      if (migratedStorageSaved && legacyKeys.size > 0) {
        await AsyncStorage.removeItem(getShoppingListCompletionStorageKey(userId, range.startDate)).catch(
          () => undefined,
        );
      }
      if (cancelled) return;
      setHydratedKey(storageKey);

      const remoteState = await loadShoppingListStateFromServer(userId, range);
      if (cancelled || resetPendingRef.current || resetVersionRef.current !== hydrationResetVersion) return;
      if (!remoteState) {
        setSyncError(new Error('Shopping list synchronization failed'));
        return;
      }
      const merged = mergeShoppingListStates(stateRef.current, remoteState);
      stateRef.current = merged;
      setState(merged);
      if (!areShoppingListStatesEqual(merged, remoteState)) {
        await runSync(() => persistState(merged));
      } else {
        await AsyncStorage.setItem(storageKey, serializeShoppingListState(merged)).catch(() => undefined);
      }
    })().catch(() => {
      if (cancelled) return;
      setSyncError(new Error('Could not restore shopping list'));
    });

    return () => {
      cancelled = true;
      syncOperationRef.current += 1;
      resetVersionRef.current += 1;
    };
  }, [hydrationAttempt, range.endDate, range.startDate, resetStorageKey, runSync, storageKey, userId, persistState]);

  const updateState = useCallback(
    (updater: (previous: ShoppingListState) => ShoppingListState) => {
      if (!userId || !isHydrated || resetPendingRef.current) return;
      const previous = stateRef.current;
      const next = updater(previous);
      for (const [key, item] of Object.entries(next)) {
        const previousTime = Date.parse(previous[key]?.updatedAt ?? '');
        if (item !== previous[key] && Date.parse(item.updatedAt) <= previousTime) {
          // An intentional edit must advance the version, even with equal ticks or clock skew.
          next[key] = { ...item, updatedAt: new Date(previousTime + 1).toISOString() };
        }
      }
      stateRef.current = next;
      setState(next);
      void runSync(() => persistState(next));
    },
    [isHydrated, persistState, runSync, userId],
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

  const setAvailableQuantity = useCallback(
    (ingredientKey: string, quantityGrams: number) => {
      if (!Number.isFinite(quantityGrams) || quantityGrams < 0) return;
      updateState(previous => ({
        ...previous,
        [ingredientKey]: createShoppingListItemState({
          ...previous[ingredientKey],
          availableQuantityGrams: Math.round(quantityGrams * 100) / 100,
          updatedAt: new Date().toISOString(),
        }),
      }));
    },
    [updateState],
  );

  const resetRange = useCallback(async (): Promise<boolean> => {
    if (!userId || !isHydrated || !storageKey || !resetStorageKey) return false;
    resetVersionRef.current += 1;
    resetPendingRef.current = resetStorageKey;
    setHydratedKey(null);
    const markerSaved = await AsyncStorage.setItem(resetStorageKey, SHOPPING_LIST_RESET_PENDING_VALUE)
      .then(() => true)
      .catch(() => false);
    if (!markerSaved) {
      if (activeStorageKeyRef.current === storageKey) {
        resetPendingRef.current = null;
        setHydratedKey(storageKey);
        setSyncError(new Error('Could not persist shopping list reset'));
      }
      return false;
    }
    if (activeStorageKeyRef.current !== storageKey) return false;
    const emptyState = resetShoppingListState();
    stateRef.current = emptyState;
    setState(emptyState);
    const cleared = await runSync(() => resetShoppingListStatePersisted(userId, range));
    if (!cleared || !markerSaved) return false;
    const markerRemoved = await AsyncStorage.removeItem(resetStorageKey)
      .then(() => true)
      .catch(() => false);
    if (markerRemoved) {
      if (activeStorageKeyRef.current !== storageKey) return true;
      resetPendingRef.current = null;
      setHydratedKey(storageKey);
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
        if (activeStorageKeyRef.current !== storageKey) return true;
        resetPendingRef.current = null;
        setHydratedKey(storageKey);
        await AsyncStorage.removeItem(getShoppingListCompletionStorageKey(userId, range.startDate)).catch(
          () => undefined,
        );
      }
      return markerRemoved;
    }
    if (!isHydrated) {
      setHydrationAttempt(attempt => attempt + 1);
      return false;
    }
    return runSync(() => persistState(stateRef.current));
  }, [isHydrated, range, resetStorageKey, runSync, storageKey, userId, persistState]);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return;
    const reconnect = () => {
      void retrySync();
    };
    window.addEventListener('online', reconnect);
    return () => window.removeEventListener('online', reconnect);
  }, [retrySync]);

  const completedKeys = useMemo(
    () =>
      new Set(
        Object.entries(state)
          .filter(([, item]) => item.completed)
          .map(([key]) => key),
      ),
    [state],
  );
  const availableQuantities = useMemo(
    () =>
      new Map(
        Object.entries(state).flatMap(([key, item]) =>
          item.availableQuantityGrams !== undefined ? [[key, item.availableQuantityGrams]] : [],
        ),
      ),
    [state],
  );

  return {
    completedKeys,
    availableQuantities,
    filter,
    setFilter,
    isHydrated,
    isSyncing,
    syncError,
    toggleIngredient,
    setCategoryCompleted,
    clearCompleted,
    setAvailableQuantity,
    resetRange,
    retrySync,
  };
}
