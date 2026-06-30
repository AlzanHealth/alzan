import assert from 'node:assert/strict';

import {
  DEFAULT_NUTRITION_DAY_ROLLOVER_TIME,
  buildTimePickerDate,
  formatNutritionDayDate,
  getNutritionDayDate,
  normalizeNutritionDayRolloverTime,
} from './nutritionDay';

const assertDateKey = (actual: Date, expected: string) => {
  assert.equal(actual.getFullYear(), Number(expected.slice(0, 4)));
  assert.equal(actual.getMonth(), Number(expected.slice(5, 7)) - 1);
  assert.equal(actual.getDate(), Number(expected.slice(8, 10)));
  assert.equal(actual.getHours(), 12);
  assert.equal(actual.getMinutes(), 0);
};

function run() {
  assert.equal(normalizeNutritionDayRolloverTime(null), DEFAULT_NUTRITION_DAY_ROLLOVER_TIME);
  assert.equal(normalizeNutritionDayRolloverTime('bad'), DEFAULT_NUTRITION_DAY_ROLLOVER_TIME);
  assert.equal(normalizeNutritionDayRolloverTime('24:00'), DEFAULT_NUTRITION_DAY_ROLLOVER_TIME);
  assert.equal(normalizeNutritionDayRolloverTime('02:30'), '02:30');

  assertDateKey(getNutritionDayDate(new Date(2026, 5, 30, 2, 59), '03:00'), '2026-06-29');
  assertDateKey(getNutritionDayDate(new Date(2026, 5, 30, 3, 0), '03:00'), '2026-06-30');
  assertDateKey(getNutritionDayDate(new Date(2026, 5, 30, 0, 15), '00:00'), '2026-06-30');
  assertDateKey(getNutritionDayDate(new Date(2026, 5, 30, 2, 29), '02:30'), '2026-06-29');
  assertDateKey(getNutritionDayDate(new Date(2026, 5, 30, 2, 30), '02:30'), '2026-06-30');

  assert.equal(formatNutritionDayDate(new Date(2026, 5, 30, 1, 0), '03:00'), '2026-06-29');

  const pickerDate = buildTimePickerDate('04:15', new Date(2026, 5, 30, 9, 0));
  assert.equal(pickerDate.getHours(), 4);
  assert.equal(pickerDate.getMinutes(), 15);
}

run();
