import assert from 'node:assert/strict';
import { addWeeks, endOfWeek, startOfWeek } from 'date-fns';
import { getNutritionCalendarRange } from './nutritionCalendarRange';

const referenceDate = new Date(2026, 7, 5, 12);
const range = getNutritionCalendarRange(referenceDate);
const currentWeek = startOfWeek(referenceDate, { weekStartsOn: 1 });

assert.equal(range.weeks.length, 9);
assert.equal(range.currentWeekIndex, 4);
assert.equal(range.weeks[0].getTime(), addWeeks(currentWeek, -4).getTime());
assert.equal(range.weeks[8].getTime(), addWeeks(currentWeek, 4).getTime());
assert.equal(range.minimumDate.getTime(), range.weeks[0].getTime());
assert.equal(range.maximumDate.getTime(), endOfWeek(range.weeks[8], { weekStartsOn: 1 }).getTime());
assert.ok(referenceDate >= range.minimumDate && referenceDate <= range.maximumDate);

console.log('nutritionCalendarRange: all tests passed');
