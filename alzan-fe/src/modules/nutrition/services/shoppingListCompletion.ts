const SHOPPING_LIST_COMPLETION_STORAGE_PREFIX = 'alzan.shopping-list.completed';

export const getShoppingListCompletionStorageKey = (userId: string, cycleStartDate: string): string =>
  `${SHOPPING_LIST_COMPLETION_STORAGE_PREFIX}.${userId}.${cycleStartDate}`;

export const serializeShoppingListCompletionKeys = (keys: ReadonlySet<string>): string =>
  JSON.stringify(Array.from(keys).sort());

export const parseShoppingListCompletionKeys = (value: string | null): Set<string> => {
  if (!value) return new Set();

  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return new Set();

    return new Set(parsed.filter((key): key is string => typeof key === 'string' && key.length > 0));
  } catch {
    return new Set();
  }
};
