import assert from 'node:assert/strict';
import { calculateRoutineTotalSets, normalizeTargetSetsInput } from './gymRoutineEditorTotals.helper';

assert.equal(calculateRoutineTotalSets([{ target_sets: 2 }, { target_sets: 2 }, { target_sets: 3 }]), 7);
assert.equal(calculateRoutineTotalSets([{ target_sets: '2' }, { target_sets: '2' }]), 4);
assert.equal(calculateRoutineTotalSets([{ target_sets: '' }, { target_sets: null }, { target_sets: 'abc' }]), 0);
assert.equal(calculateRoutineTotalSets([{ target_sets: -2 }, { target_sets: '4' }]), 4);
assert.equal(normalizeTargetSetsInput('12'), 12);
assert.equal(normalizeTargetSetsInput(''), 0);
assert.equal(normalizeTargetSetsInput('abc'), 0);

console.log('gymRoutineEditorTotals.helper tests passed');
