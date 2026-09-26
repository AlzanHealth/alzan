import { useCallback, useEffect, useRef, useState } from 'react';

// Presentation only. Save immediately; briefly keep resolved rows in the pending filter.
export function useShoppingRowFeedback(scope: string) {
  const [retained, setRetained] = useState<{ scope: string; keys: Set<string> }>({ scope, keys: new Set() });
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  useEffect(() => {
    setRetained({ scope, keys: new Set() });
    const activeTimers = timers.current;
    return () => {
      activeTimers.forEach(clearTimeout);
      activeTimers.clear();
    };
  }, [scope]);
  const retain = useCallback(
    (keys: string[]) => {
      setRetained(previous => ({
        scope,
        keys: new Set([...(previous.scope === scope ? previous.keys : []), ...keys]),
      }));
      keys.forEach(key => {
        clearTimeout(timers.current.get(key));
        timers.current.set(
          key,
          setTimeout(() => {
            timers.current.delete(key);
            setRetained(previous => {
              if (previous.scope !== scope) return previous;
              const next = new Set(previous.keys);
              next.delete(key);
              return { scope, keys: next };
            });
          }, 1000),
        );
      });
    },
    [scope],
  );
  return { retainedKeys: retained.scope === scope ? retained.keys : new Set<string>(), retain };
}
