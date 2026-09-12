import type { ShoppingListDateRange } from './shoppingListPlanner';

export type ShoppingListItemState = {
  completed: boolean;
  hidden: boolean;
  availableQuantityGrams?: number;
  updatedAt: string;
};

export type ShoppingListState = Record<string, ShoppingListItemState>;

const SHOPPING_LIST_STATE_STORAGE_PREFIX = 'alzan.shopping-list.state.v2';
const SHOPPING_LIST_RESET_STORAGE_PREFIX = 'alzan.shopping-list.reset';

export const SHOPPING_LIST_RESET_PENDING_VALUE = '1';

export const getShoppingListStateStorageKey = (userId: string, range: ShoppingListDateRange): string =>
  `${SHOPPING_LIST_STATE_STORAGE_PREFIX}.${userId}.${range.startDate}.${range.endDate}`;

export const getShoppingListResetStorageKey = (userId: string, range: ShoppingListDateRange): string =>
  `${SHOPPING_LIST_RESET_STORAGE_PREFIX}.${userId}.${range.startDate}.${range.endDate}`;

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
        const updatedAt =
          typeof candidate.updatedAt === 'string' && Number.isFinite(Date.parse(candidate.updatedAt))
            ? candidate.updatedAt
            : new Date(0).toISOString();
        const availableQuantityGrams = candidate.availableQuantityGrams;
        return [
          [
            key,
            createShoppingListItemState({
              completed: candidate.completed === true,
              hidden: candidate.hidden === true,
              availableQuantityGrams:
                typeof availableQuantityGrams === 'number' &&
                Number.isFinite(availableQuantityGrams) &&
                availableQuantityGrams >= 0
                  ? availableQuantityGrams
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

export const mergeShoppingListStateWithLegacy = (
  local: ShoppingListState,
  legacyKeys: ReadonlySet<string>,
  updatedAt = new Date().toISOString(),
): ShoppingListState => {
  const merged = { ...local };
  legacyKeys.forEach(key => {
    if (!merged[key]) merged[key] = createShoppingListItemState({ completed: true, updatedAt });
  });
  return merged;
};

export const mergeShoppingListStates = (local: ShoppingListState, remote: ShoppingListState): ShoppingListState => {
  const merged: ShoppingListState = { ...local };
  Object.entries(remote).forEach(([key, remoteState]) => {
    const localState = merged[key];
    if (!localState || Date.parse(remoteState.updatedAt) > Date.parse(localState.updatedAt)) merged[key] = remoteState;
  });
  return merged;
};

export const areShoppingListStatesEqual = (left: ShoppingListState, right: ShoppingListState): boolean => {
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  if (leftKeys.length !== rightKeys.length) return false;

  return leftKeys.every(key => {
    const leftItem = left[key];
    const rightItem = right[key];
    return (
      !!rightItem &&
      leftItem.completed === rightItem.completed &&
      leftItem.hidden === rightItem.hidden &&
      leftItem.availableQuantityGrams === rightItem.availableQuantityGrams &&
      leftItem.updatedAt === rightItem.updatedAt
    );
  });
};
