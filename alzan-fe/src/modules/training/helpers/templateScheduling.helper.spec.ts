import assert from 'node:assert/strict';
import { isScheduledWeekday } from './templateScheduling.helper';

assert.equal(isScheduledWeekday(0), true);
assert.equal(isScheduledWeekday(1), true);
assert.equal(isScheduledWeekday(6), true);
assert.equal(isScheduledWeekday(null), false);
assert.equal(isScheduledWeekday(undefined), false);
assert.equal(isScheduledWeekday(-1), false);
assert.equal(isScheduledWeekday(7), false);
assert.equal(isScheduledWeekday(Number.NaN), false);
