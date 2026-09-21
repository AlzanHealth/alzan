import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  emptyActiveWorkoutDraft,
  getActiveWorkoutDraftStore,
  activeWorkoutDraftKey,
  validateActiveWorkoutDraft,
} from './activeWorkoutDraft';

const storedDraft = (value: string) => {
  const draft: unknown = JSON.parse(value);
  validateActiveWorkoutDraft(draft);
  return draft;
};

function storage() {
  const values = new Map<string, string>();
  let fail = false;
  let wait: Promise<void> = Promise.resolve();
  return {
    values,
    fail(value: boolean) {
      fail = value;
    },
    delay(value: Promise<void>) {
      wait = value;
    },
    async getItem(key: string) {
      return values.get(key) ?? null;
    },
    async setItem(key: string, value: string) {
      await wait;
      if (fail) throw new Error('disk');
      values.set(key, value);
    },
    async removeItem(key: string) {
      values.delete(key);
    },
  };
}

test('hydrates once and preserves synchronous updates across mounts and retries', async () => {
  const adapter = storage();
  const store = getActiveWorkoutDraftStore(adapter, 'u', 's');
  await store.hydrate(emptyActiveWorkoutDraft());
  adapter.fail(true);
  store.update(prev => ({ ...prev, completedSets: ['a-1'] }));
  assert.deepEqual(store.getSnapshot().draft.completedSets, ['a-1']);
  await assert.rejects(store.flush(), /disk/);
  const remount = getActiveWorkoutDraftStore(adapter, 'u', 's');
  assert.equal(remount, store);
  await remount.hydrate(emptyActiveWorkoutDraft());
  assert.deepEqual(remount.getSnapshot().draft.completedSets, ['a-1']);
  adapter.fail(false);
  remount.retry();
  await remount.flush();
  assert.equal(remount.getSnapshot().error, null);
  assert.deepEqual(storedDraft(adapter.values.get(activeWorkoutDraftKey('u', 's'))!).completedSets, ['a-1']);
});

test('serializes slow writes, isolates users, and clear prevents resurrection', async () => {
  const adapter = storage();
  const store = getActiveWorkoutDraftStore(adapter, 'u', 's');
  await store.hydrate(emptyActiveWorkoutDraft());
  let release = () => {};
  adapter.delay(
    new Promise<void>(resolve => {
      release = resolve;
    }),
  );
  store.update(prev => ({ ...prev, completedSets: ['a-1'] }));
  store.update(prev => ({ ...prev, completedSets: ['a-1', 'a-2'] }));
  assert.notEqual(getActiveWorkoutDraftStore(adapter, 'other', 's'), store);
  const clearing = store.clear();
  assert.throws(() => store.update(prev => prev));
  release();
  await clearing;
  assert.equal(adapter.values.has(activeWorkoutDraftKey('u', 's')), false);
});

test('migrates legacy indices and preserves explicit empty values', async () => {
  const adapter = storage();
  adapter.values.set('active_session_inputs_s', JSON.stringify({ '0-1': { weight: '', reps: '' } }));
  adapter.values.set('active_session_warmup_sets_s', JSON.stringify({ '0-1': true }));
  adapter.values.set('active_session_superset_links_s', '[0]');
  adapter.values.set('active_session_hidden_s', '[1]');
  const seed = {
    ...emptyActiveWorkoutDraft(),
    exerciseOrder: ['a', 'b'],
    inputs: { 'a-1': { weight: '5', reps: '8' } },
  };
  const store = getActiveWorkoutDraftStore(adapter, 'u', 's');
  await store.hydrate(seed);
  await store.flush();
  assert.deepEqual(store.getSnapshot().draft.inputs['a-1'], { weight: '', reps: '' });
  assert.deepEqual(store.getSnapshot().draft.supersetLinks, ['a|b']);
  assert.deepEqual(store.getSnapshot().draft.hiddenExercises, ['b']);
  assert.equal(store.getSnapshot().draft.setModes['a-1'], 'warmup');
  assert.equal(adapter.values.has('active_session_inputs_s'), true);
});

test('corrupt storage blocks hydration and writes until repaired and retried', async () => {
  const adapter = storage();
  const key = activeWorkoutDraftKey('u', 's');
  adapter.values.set(key, '{"version":2}');
  const store = getActiveWorkoutDraftStore(adapter, 'u', 's');
  await store.hydrate(emptyActiveWorkoutDraft());
  assert.equal(store.getSnapshot().ready, false);
  assert.throws(() => store.update(prev => prev));
  await assert.rejects(store.flush());
  assert.equal(adapter.values.get(key), '{"version":2}');
  adapter.values.set(key, JSON.stringify(emptyActiveWorkoutDraft()));
  store.retry();
  await store.flush();
  assert.equal(store.getSnapshot().ready, true);
});

test('latest snapshot wins a slow queue and seed refetch cannot overwrite it', async () => {
  const adapter = storage();
  const store = getActiveWorkoutDraftStore(adapter, 'u', 's');
  await store.hydrate(emptyActiveWorkoutDraft());
  await store.flush();
  let release = () => {};
  adapter.delay(
    new Promise<void>(resolve => {
      release = resolve;
    }),
  );
  store.update(prev => ({ ...prev, completedSets: ['a-1'] }));
  await Promise.resolve();
  store.update(prev => ({ ...prev, completedSets: [...prev.completedSets, 'a-2'] }));
  await store.hydrate({ ...emptyActiveWorkoutDraft(), completedSets: ['server'] });
  release();
  await store.flush();
  assert.deepEqual(storedDraft(adapter.values.get(activeWorkoutDraftKey('u', 's'))!).completedSets, ['a-1', 'a-2']);
});

test('failed migration retains legacy and dirty snapshot for retry', async () => {
  const adapter = storage();
  adapter.values.set('active_session_completed_sets_s', '["0-1"]');
  adapter.values.set('active_session_extra_sets_s', '{"0":2}');
  adapter.values.set('active_session_set_modes_s', '{}');
  adapter.values.set('active_session_order_s', '[1,0]');
  adapter.fail(true);
  const store = getActiveWorkoutDraftStore(adapter, 'u', 's');
  await store.hydrate({ ...emptyActiveWorkoutDraft(), exerciseOrder: ['a', 'b'], setModes: { 'a-1': 'warmup' } });
  await assert.rejects(store.flush(), /disk/);
  assert.deepEqual(store.getSnapshot().draft.completedSets, ['a-1']);
  assert.deepEqual(store.getSnapshot().draft.extraSets, { a: 2 });
  assert.deepEqual(store.getSnapshot().draft.setModes, {});
  assert.deepEqual(store.getSnapshot().draft.exerciseOrder, ['b', 'a']);
  assert.equal(adapter.values.has('active_session_completed_sets_s'), true);
  adapter.fail(false);
  store.retry();
  await store.flush();
  await store.clear();
  assert.equal(adapter.values.size, 0);
});

test('invalid legacy adhoc data cannot be silently replaced by seed', async () => {
  const adapter = storage();
  adapter.values.set('active_session_adhoc_s', 'null');
  const store = getActiveWorkoutDraftStore(adapter, 'u', 's');
  await store.hydrate(emptyActiveWorkoutDraft());
  assert.equal(store.getSnapshot().ready, false);
  assert.equal(adapter.values.has(activeWorkoutDraftKey('u', 's')), false);
});

test('migrates the incomplete adhoc shape written by older active workouts and appends its order', async () => {
  const adapter = storage();
  adapter.values.set(
    'active_session_adhoc_s',
    JSON.stringify([
      {
        id: 'local-x',
        exercise_id: 'x',
        exercise: null,
        is_warmup: false,
        drop_set_mode: 'none',
        target_sets: 3,
        target_reps_min: 8,
        target_reps_max: 8,
        target_weight_kg: 0,
        rest_seconds: 60,
        start_order: 9999,
      },
    ]),
  );
  adapter.values.set('active_session_order_s', '["a"]');
  const store = getActiveWorkoutDraftStore(adapter, 'u', 's');
  await store.hydrate({ ...emptyActiveWorkoutDraft(), exerciseOrder: ['a'] });
  await store.flush();
  assert.deepEqual(store.getSnapshot().draft.exerciseOrder, ['a', 'x']);
  assert.equal(store.getSnapshot().draft.adhocExercises[0].order_index, 1);
});

test('a UUID beginning with digits is not a legacy numeric exercise index', async () => {
  const adapter = storage();
  const key = '12345678-aaaa-bbbb-cccc-123456789012-1';
  adapter.values.set('active_session_inputs_s', JSON.stringify({ [key]: { weight: '20', reps: '8' } }));
  const store = getActiveWorkoutDraftStore(adapter, 'u', 's');
  await store.hydrate(emptyActiveWorkoutDraft());
  await store.flush();
  assert.equal(store.getSnapshot().draft.inputs[key].weight, '20');
});

test('legacy one-field inputs remain editable after migration without losing typed values', async () => {
  const adapter = storage();
  adapter.values.set(
    'active_session_inputs_s',
    JSON.stringify({ 'a-1': { weight: '20' }, 'b-1': { reps: '12' }, 'c-1': { weight: '', reps: '' } }),
  );
  const store = getActiveWorkoutDraftStore(adapter, 'u', 's');
  await store.hydrate(emptyActiveWorkoutDraft());
  await store.flush();
  assert.deepEqual(store.getSnapshot().draft.inputs, {
    'a-1': { weight: '20', reps: '' },
    'b-1': { weight: '', reps: '12' },
    'c-1': { weight: '', reps: '' },
  });
});
