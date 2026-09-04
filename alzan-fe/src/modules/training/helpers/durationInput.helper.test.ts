import assert from 'node:assert/strict';
import { parseDurationInput } from './durationInput.helper';

assert.equal(parseDurationInput('15'), 900);
assert.equal(parseDurationInput('15,5'), 930);
assert.equal(parseDurationInput('15:00'), 900);
assert.equal(parseDurationInput('1:05'), 65);
assert.equal(parseDurationInput('1:02:03'), 3723);
assert.equal(parseDurationInput('4:60'), null);
assert.equal(parseDurationInput(''), null);

console.log('durationInput helper tests passed');
