import assert from 'node:assert/strict';
import { isScheduledWeekday, isValidIsoDate, resolveOneOffDate } from './templateScheduling.helper';

assert.equal(isScheduledWeekday(0), true);
assert.equal(isScheduledWeekday(1), true);
assert.equal(isScheduledWeekday(6), true);
assert.equal(isScheduledWeekday(null), false);
assert.equal(isScheduledWeekday(undefined), false);
assert.equal(isScheduledWeekday(-1), false);
assert.equal(isScheduledWeekday(7), false);
assert.equal(isScheduledWeekday(Number.NaN), false);

assert.equal(isValidIsoDate('2026-08-05'), true);
assert.equal(isValidIsoDate('2026-02-29'), false);
assert.equal(isValidIsoDate('2026-8-5'), false);
assert.equal(resolveOneOffDate(false, '2026-08-05'), '2026-08-05');
assert.equal(resolveOneOffDate(true, '2026-08-05'), null);
assert.equal(resolveOneOffDate(false, null), null);
