export type ShoppingLocalSaveStatus = 'unknown' | 'saving' | 'saved' | 'error';

// Only local writes are serialized here: a slow network must never delay durability.
export function createShoppingListLocalStorage(write: (key: string, value: string) => Promise<void>) {
  const pending = new Map<string, Promise<void>>();
  const statuses = new Map<string, ShoppingLocalSaveStatus>();
  const listeners = new Set<() => void>();
  const notify = (key: string, status: ShoppingLocalSaveStatus) => {
    statuses.set(key, status);
    listeners.forEach(listener => listener());
  };
  return {
    getStatus: (key: string | null): ShoppingLocalSaveStatus => (key ? (statuses.get(key) ?? 'unknown') : 'unknown'),
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    setItem(key: string, value: string): Promise<void> {
      const previous = pending.get(key) ?? Promise.resolve();
      const next = previous.catch(() => undefined).then(() => write(key, value));
      pending.set(key, next);
      notify(key, 'saving');
      const finish = (status: ShoppingLocalSaveStatus) => {
        if (pending.get(key) !== next) return;
        pending.delete(key);
        notify(key, status);
      };
      void next.then(
        () => finish('saved'),
        () => finish('error'),
      );
      return next;
    },
  };
}
