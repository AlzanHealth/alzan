// SHOPPING_TEST_RUNTIME must contain React and react-test-renderer (same version).
// Loads the real hook/services; only platform storage and the network boundary are replaced.
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve, dirname } = require('node:path');
const { createRequire } = require('node:module');
const { runInNewContext } = require('node:vm');
const ts = require('typescript');
const runtime = createRequire(resolve(process.env.SHOPPING_TEST_RUNTIME || '.', 'package.json'));
const React = runtime('react');
const { create, act } = runtime('react-test-renderer');
global.IS_REACT_ACT_ENVIRONMENT = true;

async function run() {
  const storage = new Map();
  const old = { completed: false, hidden: false, availableQuantityGrams: 0, updatedAt: '2026-09-12T10:00:00Z' };
  let server = { rice: old };
  let waitForRead = Promise.resolve();
  const listeners = new Map();
  const modules = new Map();
  const row = (key, item) => ({ ingredient_key: key, completed: item.completed, hidden: item.hidden,
    available_quantity_g: item.availableQuantityGrams ?? null, updated_at: item.updatedAt });
  const supabase = { from: () => {
    const query = {
      select: () => query, eq: () => query,
      then: (fulfilled, rejected) => waitForRead.then(() => ({ data: Object.entries(server).map(([key, value]) => row(key, value)), error: null })).then(fulfilled, rejected),
      upsert: async rows => {
        for (const value of rows) {
          if (!server[value.ingredient_key] || Date.parse(value.updated_at) >= Date.parse(server[value.ingredient_key].updatedAt)) {
            server[value.ingredient_key] = { completed: value.completed, hidden: value.hidden,
              availableQuantityGrams: value.available_quantity_g, updatedAt: value.updated_at };
          }
        }
        return { data: null, error: null };
      },
      delete: () => { server = {}; return query; },
    };
    return query;
  } };
  function load(filename) {
    if (modules.has(filename)) return modules.get(filename).exports;
    const module = { exports: {} };
    modules.set(filename, module);
    const code = ts.transpileModule(readFileSync(filename, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    }).outputText;
    const localRequire = name => {
      if (name === 'react') return React;
      if (name === '@react-native-async-storage/async-storage') return {
        getItem: async key => storage.get(key) ?? null,
        setItem: async (key, value) => { storage.set(key, value); },
        removeItem: async key => { storage.delete(key); },
      };
      if (name.endsWith('/lib/supabaseClient')) return { supabase };
      if (name.startsWith('.')) return load(resolve(dirname(filename), `${name}.ts`));
      throw new Error(`Unexpected dependency: ${name}`);
    };
    runInNewContext(code, { module, exports: module.exports, require: localRequire,
      window: { addEventListener: (name, fn) => listeners.set(name, fn), removeEventListener: name => listeners.delete(name) },
      console, Date, Set, Map, Promise });
    return module.exports;
  }
  const { useShoppingListState } = load(resolve(__dirname, '../src/modules/nutrition/hooks/useShoppingListState.ts'));
  const { getShoppingListStateStorageKey } = load(resolve(__dirname, '../src/modules/nutrition/services/shoppingListState.ts'));
  const range = { startDate: '2026-09-12', endDate: '2026-09-18' };
  const key = getShoppingListStateStorageKey('user-a', range);
  storage.set(key, JSON.stringify({ rice: old }));
  let current;
  function Harness() { current = useShoppingListState('user-a', range); return null; }
  let renderer;
  await act(async () => { renderer = create(React.createElement(Harness)); });
  assert.equal(current.isHydrated, true);
  server = { rice: { ...old, completed: true, availableQuantityGrams: 500, updatedAt: '2026-09-12T10:01:00Z' } };
  await act(async () => { await current.retrySync(); });
  assert.equal(current.completedKeys.has('rice'), true, 'reconnect must update the visible checkmark');
  assert.equal(current.availableQuantities.get('rice'), 500);
  assert.equal(JSON.parse(storage.get(key)).rice.availableQuantityGrams, 500, 'reconnect must persist remote winners locally');

  let release;
  waitForRead = new Promise(resolve => { release = resolve; });
  let syncing;
  await act(async () => { syncing = current.retrySync(); });
  await act(async () => { current.setAvailableQuantity('rice', 250); });
  assert.equal(JSON.parse(storage.get(key)).rice.availableQuantityGrams, 250, 'local edits persist while network is blocked');
  await act(async () => { release(); await syncing; });
  assert.equal(current.availableQuantities.get('rice'), 250, 'late response cannot replace newer edits');
  assert.equal(current.completedKeys.has('rice'), true, 'editing quantity retains the synchronized checkmark');
  assert.equal(server.rice.availableQuantityGrams, 250);
  // A server timestamp ahead of this device must not make intentional edits impossible.
  server = { rice: { ...server.rice, updatedAt: '2099-01-01T00:00:00Z' } };
  await act(async () => { await current.retrySync(); });
  await act(async () => { current.toggleIngredient('rice'); });
  assert.equal(server.rice.completed, false, 'a deliberate uncheck must be newer than the version it edits');
  assert.equal(current.completedKeys.has('rice'), false);
  assert.ok(Date.parse(server.rice.updatedAt) > Date.parse('2099-01-01T00:00:00Z'));

  // A pending acknowledgment must not resurrect the list after an explicit reset.
  waitForRead = new Promise(resolve => { release = resolve; });
  await act(async () => { syncing = current.retrySync(); });
  let resetting;
  await act(async () => { resetting = current.resetRange(); });
  await act(async () => { release(); await syncing; await resetting; });
  assert.deepEqual(JSON.parse(storage.get(key)), {});
  assert.equal(current.availableQuantities.size, 0);
  await act(async () => { renderer.unmount(); });
  console.log('Shopping hook: real sync pipeline preserves remote winners, local persistence and edits during reconnect');
}
void run().catch(error => { console.error(error); process.exitCode = 1; });
