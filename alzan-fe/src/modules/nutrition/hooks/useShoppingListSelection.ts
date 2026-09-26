import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useRef, useState } from 'react';
import type { ShoppingListMode } from '../services/shoppingListPlanner';
import { shoppingListLocalStorage } from '../services/shoppingListLocalStorage';
import { useShoppingLocalSaveStatus } from './useShoppingLocalSaveStatus';

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
  const localSaveStatus = useShoppingLocalSaveStatus(key);
  const [selection, setSelection] = useState(defaults);
  const selectionRef = useRef(selection);
  const defaultsRef = useRef(defaults);
  defaultsRef.current = defaults;
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [readFailed, setReadFailed] = useState(false);
  const [readAttempt, setReadAttempt] = useState(0);
  const isReady = key !== null && loadedKey === key;
  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    let readSucceeded = false;
    setReadFailed(false);
    selectionRef.current = defaultsRef.current;
    setSelection(defaultsRef.current);
    void AsyncStorage.getItem(key)
      .then(value => {
        if (cancelled) return;
        if (!value) {
          readSucceeded = true;
          return;
        }
        const parsed: unknown = JSON.parse(value);
        if (!parsed || typeof parsed !== 'object') throw new Error('Invalid shopping period');
        const saved = parsed as Partial<Selection>;
        const validDate = (date: unknown): date is string =>
          typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date);
        if (!validDate(saved.selectedDate) || !validDate(saved.customStartDate) || !validDate(saved.customEndDate))
          throw new Error('Invalid shopping dates');
        if (saved.mode !== 'upcoming' && saved.mode !== 'cycle' && saved.mode !== 'custom')
          throw new Error('Invalid shopping mode');
        readSucceeded = true;
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
      .catch(() => {
        if (!cancelled) setReadFailed(true);
      })
      .finally(() => {
        if (!cancelled) {
          setLoadedKey(key);
          if (readSucceeded)
            void shoppingListLocalStorage.setItem(key, JSON.stringify(selectionRef.current)).catch(() => undefined);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [explicitDate, key, readAttempt]);

  const updateSelection = (patch: Partial<Selection>) => {
    if (!isReady || readFailed) return;
    const next = { ...selectionRef.current, ...patch };
    selectionRef.current = next;
    setSelection(next);
    if (key && isReady) void shoppingListLocalStorage.setItem(key, JSON.stringify(next)).catch(() => undefined);
  };
  const retryLocalSave = () => {
    if (readFailed) {
      setReadAttempt(value => value + 1);
      return Promise.resolve();
    }
    return key && isReady
      ? shoppingListLocalStorage.setItem(key, JSON.stringify(selectionRef.current)).catch(() => undefined)
      : Promise.resolve();
  };
  return {
    selection,
    updateSelection,
    isReady,
    localSaveStatus: readFailed ? ('error' as const) : localSaveStatus,
    retryLocalSave,
  };
}
