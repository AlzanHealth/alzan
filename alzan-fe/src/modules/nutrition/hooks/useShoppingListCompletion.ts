import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  getShoppingListCompletionStorageKey,
  parseShoppingListCompletionKeys,
  serializeShoppingListCompletionKeys,
} from '../services/shoppingListCompletion';

export function useShoppingListCompletion(userId: string | undefined, cycleStartDate: string) {
  const storageKey = useMemo(
    () => (userId ? getShoppingListCompletionStorageKey(userId, cycleStartDate) : null),
    [cycleStartDate, userId],
  );
  const [completedKeys, setCompletedKeys] = useState<Set<string>>(() => new Set());
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setIsHydrated(false);

    if (!storageKey) {
      setCompletedKeys(new Set());
      setIsHydrated(true);
      return () => {
        cancelled = true;
      };
    }

    void AsyncStorage.getItem(storageKey)
      .then(value => {
        if (cancelled) return;
        setCompletedKeys(parseShoppingListCompletionKeys(value));
        setIsHydrated(true);
      })
      .catch(() => {
        if (cancelled) return;
        setCompletedKeys(new Set());
        setIsHydrated(true);
      });

    return () => {
      cancelled = true;
    };
  }, [storageKey]);

  const toggleIngredient = useCallback(
    (ingredientKey: string) => {
      if (!storageKey || !isHydrated) return;

      setCompletedKeys(previous => {
        const next = new Set(previous);
        if (next.has(ingredientKey)) next.delete(ingredientKey);
        else next.add(ingredientKey);
        void AsyncStorage.setItem(storageKey, serializeShoppingListCompletionKeys(next));
        return next;
      });
    },
    [isHydrated, storageKey],
  );

  const clearCompleted = useCallback(() => {
    if (!storageKey || !isHydrated) return;

    setCompletedKeys(new Set());
    void AsyncStorage.removeItem(storageKey);
  }, [isHydrated, storageKey]);

  return { completedKeys, isHydrated, toggleIngredient, clearCompleted };
}
