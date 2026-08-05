import assert from 'node:assert/strict';
import {
  getCurrentWeekDateForWeekday,
  getCurrentWeekdayForDate,
  isScheduledWeekday,
  isValidIsoDate,
  resolveOneOffDate,
} from './templateScheduling.helper';

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

const referenceDate = new Date('2026-08-05T12:00:00');
assert.equal(getCurrentWeekDateForWeekday(1, referenceDate), '2026-08-03');
assert.equal(getCurrentWeekDateForWeekday(0, referenceDate), '2026-08-09');
assert.equal(getCurrentWeekDateForWeekday(7, referenceDate), null);
assert.equal(getCurrentWeekdayForDate('2026-08-05', referenceDate), 3);
assert.equal(getCurrentWeekdayForDate('2026-08-09', referenceDate), 0);
assert.equal(getCurrentWeekdayForDate('2026-08-10', referenceDate), null);
