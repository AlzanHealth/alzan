import assert from 'node:assert/strict';
import {
  getSelectedTemplateIdsForBulkDelete,
  sortTemplateList,
  TemplateListSort,
  toggleTemplateSelection,
} from './templateList.helper';

const items = [
  { id: 'b', name: 'Zancadas', createdAt: '2026-08-02T10:00:00.000Z', usageCount: 1 },
  { id: 'a', name: 'Fuerza', createdAt: '2026-08-01T10:00:00.000Z', usageCount: 3 },
  { id: 'c', name: 'Fuerza', createdAt: '2026-08-03T10:00:00.000Z', usageCount: 3 },
];

const idsFor = (sort: TemplateListSort) => sortTemplateList(items, sort, 'es').map(item => item.id);

assert.deepEqual(idsFor('name'), ['a', 'c', 'b']);
assert.deepEqual(idsFor('created'), ['c', 'b', 'a']);
assert.deepEqual(idsFor('usage'), ['c', 'a', 'b']);
assert.notStrictEqual(sortTemplateList(items, 'name', 'es'), items);

const selected = new Set(['b']);
const withSelected = toggleTemplateSelection(selected, 'a');
assert.deepEqual(Array.from(withSelected), ['b', 'a']);
assert.deepEqual(Array.from(selected), ['b'], 'toggling should not mutate the previous selection');
assert.deepEqual(Array.from(toggleTemplateSelection(withSelected, 'a')), ['b']);
assert.deepEqual(getSelectedTemplateIdsForBulkDelete(items, new Set(['a', 'missing', 'c'])), ['a', 'c']);
assert.deepEqual(getSelectedTemplateIdsForBulkDelete(items, new Set()), []);

console.log('templateList.helper.spec.ts: ok');
