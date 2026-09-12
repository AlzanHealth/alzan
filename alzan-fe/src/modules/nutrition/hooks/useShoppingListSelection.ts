import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useRef, useState } from 'react';
import type { ShoppingListMode } from '../services/shoppingListPlanner';

type Selection = {
  selectedDate: string;
  mode: ShoppingListMode;
  customStartDate: string;
  customEndDate: string;
  showPast: boolean;
};

// Restore the same list after a browser reload, including a custom shopping period.
export function useShoppingListSelection(userId: string | undefined, defaults: Selection, explicitDate?: string) {
  const key = userId ? `alzan.shopping-list.selection.v1.${userId}` : null;
  const [selection, setSelection] = useState(defaults);
  const selectionRef = useRef(selection);
  const defaultsRef = useRef(defaults);
  defaultsRef.current = defaults;
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const isReady = key !== null && loadedKey === key;
  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    selectionRef.current = defaultsRef.current;
    setSelection(defaultsRef.current);
    void AsyncStorage.getItem(key)
      .then(value => {
        if (cancelled || !value) return;
        const parsed: unknown = JSON.parse(value);
        if (!parsed || typeof parsed !== 'object') return;
        const saved = parsed as Partial<Selection>;
        const validDate = (date: unknown): date is string =>
          typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date);
        if (!validDate(saved.selectedDate) || !validDate(saved.customStartDate) || !validDate(saved.customEndDate))
          return;
        if (saved.mode !== 'upcoming' && saved.mode !== 'cycle' && saved.mode !== 'custom') return;
        if (explicitDate && explicitDate !== saved.selectedDate) return;
        const restored: Selection = {
          selectedDate: saved.selectedDate,
          customStartDate: saved.customStartDate,
          customEndDate: saved.customEndDate,
          mode: saved.mode,
          showPast: saved.showPast === true,
        };
        selectionRef.current = restored;
        setSelection(restored);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setLoadedKey(key);
      });
    return () => {
      cancelled = true;
    };
  }, [explicitDate, key]);

  const updateSelection = (patch: Partial<Selection>) => {
    const next = { ...selectionRef.current, ...patch };
    selectionRef.current = next;
    setSelection(next);
    if (key && isReady) void AsyncStorage.setItem(key, JSON.stringify(next)).catch(() => undefined);
  };
  return { selection, updateSelection, isReady };
}
