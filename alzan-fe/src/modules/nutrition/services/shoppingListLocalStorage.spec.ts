import assert from 'node:assert/strict';
import { createShoppingListLocalStorage } from './shoppingListLocalStorageCore';

async function run() {
  const values = new Map<string, string>();
  let release = () => {};
  let releaseLatest = () => {};
  let fail = false;
  const blocked = new Promise<void>(resolve => {
    release = resolve;
  });
  const blockedLatest = new Promise<void>(resolve => {
    releaseLatest = resolve;
  });
  const storage = createShoppingListLocalStorage(async (key, value) => {
    if (value === 'old') await blocked;
    if (value === 'latest') await blockedLatest;
    if (fail) throw new Error('Storage full');
    values.set(key, value);
  });
  let notifications = 0;
  const unsubscribe = storage.subscribe(() => {
    notifications += 1;
  });
  assert.equal(storage.getStatus('a'), 'unknown');
  const first = storage.setItem('a', 'old');
  const latest = storage.setItem('a', 'latest');
  assert.equal(storage.getStatus('a'), 'saving');
  await storage.setItem('b', 'other account');
  assert.equal(storage.getStatus('a'), 'saving');
  assert.equal(storage.getStatus('b'), 'saved');
  release();
  await first;
  assert.equal(storage.getStatus('a'), 'saving', 'an older success must not confirm the latest edit');
  releaseLatest();
  await Promise.all([first, latest]);
  assert.equal(values.get('a'), 'latest');
  assert.equal(storage.getStatus('a'), 'saved');
  fail = true;
  await assert.rejects(storage.setItem('a', 'failed'));
  assert.equal(storage.getStatus('a'), 'error');
  assert.equal(values.get('a'), 'latest');
  fail = false;
  await storage.setItem('a', 'retry');
  assert.equal(storage.getStatus('a'), 'saved');
  assert.equal(values.get('a'), 'retry');
  assert.ok(notifications > 0);
  unsubscribe();
  console.log('Local shopping storage: ordering, isolation, failure and retry passed');
}
void run();
