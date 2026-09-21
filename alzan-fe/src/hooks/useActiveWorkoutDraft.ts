import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useMemo, useSyncExternalStore } from 'react';
import {
  emptyActiveWorkoutDraft,
  getActiveWorkoutDraftStore,
  type ActiveWorkoutDraft,
} from '../screens/training/helpers/activeWorkoutDraft';

const unavailable = { draft: emptyActiveWorkoutDraft(), ready: false, error: null };
const subscribeUnavailable = () => () => {};
const getUnavailable = () => unavailable;

export function useActiveWorkoutDraft(
  userId: string | undefined,
  sessionId: string | undefined,
  seed: ActiveWorkoutDraft | undefined,
): {
  draft: ActiveWorkoutDraft;
  ready: boolean;
  error: unknown;
  update: (fn: (prev: ActiveWorkoutDraft) => ActiveWorkoutDraft) => void;
  retry: () => void;
  flush: () => Promise<void>;
  clear: () => Promise<void>;
} {
  const store = useMemo(
    () => (userId && sessionId ? getActiveWorkoutDraftStore(AsyncStorage, userId, sessionId) : undefined),
    [userId, sessionId],
  );
  const snapshot = useSyncExternalStore(
    store?.subscribe ?? subscribeUnavailable,
    store?.getSnapshot ?? getUnavailable,
    getUnavailable,
  );
  useEffect(() => {
    if (store && seed) void store.hydrate(seed);
  }, [store, seed]);
  const update = useCallback(
    (fn: (prev: ActiveWorkoutDraft) => ActiveWorkoutDraft) => {
      if (!store) throw new Error('Active workout draft scope is unavailable');
      store.update(fn);
    },
    [store],
  );
  const retry = useCallback(() => {
    store?.retry();
  }, [store]);
  const flush = useCallback(async () => {
    if (!store) throw new Error('Active workout draft scope is unavailable');
    await store.flush();
  }, [store]);
  const clear = useCallback(async () => {
    if (!store) throw new Error('Active workout draft scope is unavailable');
    await store.clear();
  }, [store]);
  return { ...snapshot, update, retry, flush, clear };
}
