import assert from 'node:assert/strict';
import {
  calculateWeeklyEndDate,
  getFirstWeeklyOccurrenceOnOrAfter,
  getNextWeeklyOccurrence,
  isValidDateOnly,
  parsePositiveWholeWeeks,
} from './weeklyRecurrence.helper';

assert.equal(isValidDateOnly('2026-09-03'), true);
assert.equal(isValidDateOnly('2026-02-29'), false);
assert.equal(isValidDateOnly('2026-9-3'), false);
assert.equal(isValidDateOnly(null), false);

// JavaScript uses Sunday=0 through Saturday=6. Tuesday is 2.
assert.equal(getNextWeeklyOccurrence(new Date('2026-09-03T12:00:00'), 2), '2026-09-08');
assert.equal(getNextWeeklyOccurrence(new Date('2026-09-08T12:00:00'), 2), '2026-09-08');
assert.equal(getNextWeeklyOccurrence(new Date('2026-09-06T12:00:00'), 2), '2026-09-08');
assert.equal(getNextWeeklyOccurrence(new Date('2026-09-09T12:00:00'), 2), '2026-09-15');
assert.equal(getNextWeeklyOccurrence(new Date('2026-09-03T12:00:00'), null), null);
assert.equal(getNextWeeklyOccurrence(new Date('2026-09-03T12:00:00'), 7), null);

assert.equal(getFirstWeeklyOccurrenceOnOrAfter('2026-09-07', 2), '2026-09-08');
assert.equal(getFirstWeeklyOccurrenceOnOrAfter('2026-09-08', 2), '2026-09-08');
assert.equal(getFirstWeeklyOccurrenceOnOrAfter('2026-09-09', 2), '2026-09-15');
assert.equal(getFirstWeeklyOccurrenceOnOrAfter('2026-09-03', null), null);
assert.equal(getFirstWeeklyOccurrenceOnOrAfter('not-a-date', 2), null);

assert.equal(calculateWeeklyEndDate('2026-09-08', 2, 1), '2026-09-08');
assert.equal(calculateWeeklyEndDate('2026-09-08', 2, 2), '2026-09-15');
assert.equal(calculateWeeklyEndDate('2026-09-08', 2, 3), '2026-09-22');
assert.equal(calculateWeeklyEndDate('2026-09-07', 2, 2), '2026-09-15');
assert.equal(calculateWeeklyEndDate('2026-09-08', null, 1), null);
assert.equal(calculateWeeklyEndDate('2026-09-08', 7, 1), null);
assert.equal(calculateWeeklyEndDate('2026-09-08', 2.5, 1), null);
assert.equal(calculateWeeklyEndDate('not-a-date', 2, 1), null);

assert.equal(parsePositiveWholeWeeks('1'), 1);
assert.equal(parsePositiveWholeWeeks('003'), 3);
assert.equal(parsePositiveWholeWeeks(''), null);
assert.equal(parsePositiveWholeWeeks('0'), null);
assert.equal(parsePositiveWholeWeeks('-1'), null);
assert.equal(parsePositiveWholeWeeks('1.5'), null);
assert.equal(parsePositiveWholeWeeks(3), 3);
assert.equal(parsePositiveWholeWeeks(null), null);
