import assert from 'node:assert/strict';
import { isStrengthExerciseSession } from './exerciseSessionFilter';

assert.equal(isStrengthExerciseSession('strength'), true, 'accepts canonical strength sessions');
assert.equal(isStrengthExerciseSession('gym'), true, 'accepts legacy/local gym sessions');
assert.equal(isStrengthExerciseSession(null), true, 'keeps sets without a joined session');
assert.equal(isStrengthExerciseSession(undefined), true, 'keeps sets without session metadata');
assert.equal(isStrengthExerciseSession('running'), false, 'excludes running sessions');
assert.equal(isStrengthExerciseSession('cycling'), false, 'excludes cycling sessions');

console.log('Exercise session filtering checks passed.');
