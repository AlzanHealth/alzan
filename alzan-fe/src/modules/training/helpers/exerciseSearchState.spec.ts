import assert from 'node:assert/strict';
import { canReuseExerciseSearchPage, getExerciseSearchFields, orderExerciseCatalogItems } from './exerciseSearchState';

const exercise = {
  name: 'Mi empuje',
  base_name_es: 'Mi empuje',
  base_name_en: 'Mi empuje',
  canonical_name_es: 'Press banca',
  canonical_name_en: 'Bench press',
};
assert.ok(getExerciseSearchFields(exercise).includes('Press banca'));
assert.ok(getExerciseSearchFields(exercise).includes('Bench press'));
assert.ok(getExerciseSearchFields(exercise).includes('Mi empuje'));
const key = ['exercises', 'user-a', 'es', '', null, null, 'all', 'all-owners', 30, false];
const largerPage = [...key];
largerPage[8] = 60;
assert.equal(canReuseExerciseSearchPage(key, largerPage), true);
assert.equal(canReuseExerciseSearchPage(largerPage, key), false);
assert.equal(canReuseExerciseSearchPage(undefined, largerPage), false);
for (const index of [1, 2, 3, 4, 5, 6, 7, 9]) {
  const changedFilter = [...largerPage];
  changedFilter[index] = 'changed';
  assert.equal(canReuseExerciseSearchPage(key, changedFilter), false, `rejects changed key field ${index}`);
}

const aliasOrderedRows = [
  { id: 'a', name: 'Zulu personal alias' },
  { id: 'b', name: 'Beta' },
  { id: 'c', name: 'Alpha personal alias' },
];
assert.deepEqual(
  orderExerciseCatalogItems(aliasOrderedRows, 'catalog', {}).map(item => item.id),
  ['a', 'b', 'c'],
  'catalog preserves canonical page order even when personal names sort differently',
);
assert.deepEqual(
  orderExerciseCatalogItems(aliasOrderedRows.slice(0, 2), 'catalog', {}),
  orderExerciseCatalogItems(aliasOrderedRows, 'catalog', {}).slice(0, 2),
  'loading another canonical page keeps the visible prefix unchanged',
);
assert.deepEqual(
  orderExerciseCatalogItems([...aliasOrderedRows].reverse(), 'catalog', {}).map(item => item.id),
  ['c', 'b', 'a'],
  'catalog preserves relevance order supplied by search',
);
assert.deepEqual(
  orderExerciseCatalogItems(aliasOrderedRows, 'mine', {}).map(item => item.id),
  ['c', 'b', 'a'],
  'fully loaded personal exercises sort by their displayed names',
);
assert.deepEqual(
  orderExerciseCatalogItems(aliasOrderedRows, 'used', {
    a: { latestAt: '2026-10-01' },
    b: { latestAt: '2026-10-21' },
    c: { latestAt: '2026-10-10' },
  }).map(item => item.id),
  ['b', 'c', 'a'],
  'used exercises remain ordered by latest usage',
);

console.log('exerciseSearchState regression checks passed');
