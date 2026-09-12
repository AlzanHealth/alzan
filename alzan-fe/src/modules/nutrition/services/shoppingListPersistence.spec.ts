import assert from 'node:assert/strict';
import { createShoppingListStateSyncQueue, persistShoppingListLocallyFirst } from './shoppingListStateSyncCore';
import {
  createShoppingListItemState,
  getShoppingListStateStorageKey,
  mergeShoppingListStates,
  parseShoppingListState,
  serializeShoppingListState,
  type ShoppingListState,
} from './shoppingListState';

async function run() {
  const queue = createShoppingListStateSyncQueue();
  const local = new Map<string, string>();
  const remote = new Map<string, ShoppingListState>();
  const range = { startDate: '2026-09-12', endDate: '2026-09-18' };
  const key = getShoppingListStateStorageKey('user-a', range);
  let releaseNetwork = () => {};
  const network = new Promise<void>(resolve => {
    releaseNetwork = resolve;
  });
  const first = {
    rice: createShoppingListItemState({
      completed: true,
      availableQuantityGrams: undefined,
      updatedAt: '2026-09-12T10:00:00Z',
    }),
  };
  const latest = {
    ...first,
    milk: createShoppingListItemState({ availableQuantityGrams: 500, updatedAt: '2026-09-12T10:01:00Z' }),
  };
  const save = (storageKey: string, state: ShoppingListState) =>
    persistShoppingListLocallyFirst(
      async () => {
        local.set(storageKey, serializeShoppingListState(state));
      },
      () =>
        queue.enqueue(storageKey, async () => {
          await network;
          remote.set(storageKey, state);
          return true;
        }),
    );
  const firstSave = save(key, first);
  const latestSave = save(key, latest);
  // Simulate a reload while the first network operation is still blocked.
  assert.deepEqual(parseShoppingListState(local.get(key) ?? null), latest);
  const otherKey = getShoppingListStateStorageKey('user-b', range);
  const otherSave = save(otherKey, {});
  assert.deepEqual(parseShoppingListState(local.get(key) ?? null), latest);
  assert.notEqual(getShoppingListStateStorageKey('user-a', { ...range, endDate: '2026-09-19' }), key);
  releaseNetwork();
  assert.deepEqual(await Promise.all([firstSave, latestSave, otherSave]), [true, true, true]);
  assert.deepEqual(remote.get(key), latest);

  const failedRemote = await persistShoppingListLocallyFirst(
    async () => {
      local.set(key, serializeShoppingListState(latest));
    },
    async () => {
      throw new Error('offline');
    },
  );
  assert.equal(failedRemote, false);
  assert.deepEqual(parseShoppingListState(local.get(key) ?? null), latest);
  assert.equal(
    await persistShoppingListLocallyFirst(
      async () => {
        throw new Error('storage full');
      },
      async () => true,
    ),
    false,
  );

  // A late initial response keeps edits made while loading, and adds remote-only items.
  const merged = mergeShoppingListStates(latest, { ...first, bread: createShoppingListItemState({ completed: true }) });
  assert.equal(merged.milk.availableQuantityGrams, 500);
  assert.equal(merged.rice.completed, true);
  assert.equal(merged.bread.completed, true);
  const newerLocal = { rice: createShoppingListItemState({ completed: false, updatedAt: '2026-09-12T10:00:00.500Z' }) };
  const olderRemote = { rice: createShoppingListItemState({ completed: true, updatedAt: '2026-09-12T10:00:00Z' }) };
  assert.equal(mergeShoppingListStates(newerLocal, olderRemote).rice.completed, false);
  console.log(
    'Shopping list persistence: blocked network, reload, offline, storage failure, scopes and late responses passed',
  );
}
void run();
