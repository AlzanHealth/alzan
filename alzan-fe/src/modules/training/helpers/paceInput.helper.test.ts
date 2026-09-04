import assert from 'node:assert/strict';
import { parsePaceInput } from './paceInput.helper';

assert.deepEqual(parsePaceInput('3,5'), { ok: true, totalSeconds: 230, normalized: '3:50' });
assert.deepEqual(parsePaceInput('3,05'), { ok: true, totalSeconds: 185, normalized: '3:05' });
assert.deepEqual(parsePaceInput('15,5'), { ok: true, totalSeconds: 950, normalized: '15:50' });
assert.deepEqual(parsePaceInput('3.5'), { ok: true, totalSeconds: 230, normalized: '3:50' });
assert.deepEqual(parsePaceInput('3.05'), { ok: true, totalSeconds: 185, normalized: '3:05' });
assert.deepEqual(parsePaceInput('15.5'), { ok: true, totalSeconds: 950, normalized: '15:50' });
assert.deepEqual(parsePaceInput('3:05'), { ok: true, totalSeconds: 185, normalized: '3:05' });
assert.deepEqual(parsePaceInput('3:5'), { ok: true, totalSeconds: 185, normalized: '3:05' });
assert.deepEqual(parsePaceInput('3'), { ok: true, totalSeconds: 180, normalized: '3:00' });

assert.deepEqual(parsePaceInput('3,6'), { ok: false, reason: 'seconds-out-of-range' });
assert.deepEqual(parsePaceInput('3.6'), { ok: false, reason: 'seconds-out-of-range' });
assert.deepEqual(parsePaceInput('3,60'), { ok: false, reason: 'seconds-out-of-range' });
assert.deepEqual(parsePaceInput('3:60'), { ok: false, reason: 'seconds-out-of-range' });
assert.deepEqual(parsePaceInput('3,050'), { ok: false, reason: 'invalid-format' });
assert.deepEqual(parsePaceInput('3,5,0'), { ok: false, reason: 'invalid-format' });
assert.deepEqual(parsePaceInput("3'05"), { ok: false, reason: 'invalid-format' });
assert.deepEqual(parsePaceInput('0'), { ok: false, reason: 'non-positive' });
assert.deepEqual(parsePaceInput('0:00'), { ok: false, reason: 'non-positive' });

console.log('pace input tests passed');
