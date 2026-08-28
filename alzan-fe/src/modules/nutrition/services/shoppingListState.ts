import type { ShoppingListDateRange } from './shoppingListPlanner';

export type ShoppingListItemState = {
  completed: boolean;
  hidden: boolean;
  purchaseQuantityGrams?: number;
  updatedAt: string;
};

export type ShoppingListState = Record<string, ShoppingListItemState>;

const SHOPPING_LIST_STATE_STORAGE_PREFIX = 'alzan.shopping-list.state';

export const getShoppingListStateStorageKey = (userId: string, range: ShoppingListDateRange): string =>
  `${SHOPPING_LIST_STATE_STORAGE_PREFIX}.${userId}.${range.startDate}.${range.endDate}`;

export const createShoppingListItemState = (overrides: Partial<ShoppingListItemState> = {}): ShoppingListItemState => ({
  completed: false,
  hidden: false,
  updatedAt: new Date(0).toISOString(),
  ...overrides,
});

export const parseShoppingListState = (value: string | null): ShoppingListState => {
  if (!value) return {};

  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};

    return Object.fromEntries(
      Object.entries(parsed).flatMap(([key, rawState]) => {
        if (!rawState || typeof rawState !== 'object' || Array.isArray(rawState)) return [];
        const candidate = rawState as Record<string, unknown>;
        const updatedAt = typeof candidate.updatedAt === 'string' ? candidate.updatedAt : new Date(0).toISOString();
        const purchaseQuantityGrams = candidate.purchaseQuantityGrams;
        return [
          [
            key,
            createShoppingListItemState({
              completed: candidate.completed === true,
              hidden: candidate.hidden === true,
              purchaseQuantityGrams:
                typeof purchaseQuantityGrams === 'number' && Number.isFinite(purchaseQuantityGrams)
                  ? purchaseQuantityGrams
                  : undefined,
              updatedAt,
            }),
          ],
        ];
      }),
    );
  } catch {
    return {};
  }
};

export const serializeShoppingListState = (state: ShoppingListState): string => JSON.stringify(state);

export const resetShoppingListState = (): ShoppingListState => ({});

export const mergeShoppingListStates = (local: ShoppingListState, remote: ShoppingListState): ShoppingListState => {
  const merged: ShoppingListState = { ...local };
  Object.entries(remote).forEach(([key, remoteState]) => {
    const localState = merged[key];
    if (!localState || remoteState.updatedAt > localState.updatedAt) merged[key] = remoteState;
  });
  return merged;
};
