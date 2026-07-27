import assert from 'node:assert/strict';

import {
  DEFAULT_NUTRITION_DAY_ROLLOVER_TIME,
  buildTimePickerDate,
  formatNutritionDayDate,
  getMillisecondsUntilNextNutritionDayRollover,
  getNutritionDayDate,
  normalizeNutritionDayRolloverTime,
} from './nutritionDay';

process.env.TZ = 'Europe/Madrid';

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

  assert.equal(getMillisecondsUntilNextNutritionDayRollover(new Date(2026, 5, 30, 2, 59, 59, 999), '03:00'), 1);
  assert.equal(
    getMillisecondsUntilNextNutritionDayRollover(new Date(2026, 5, 30, 3, 0, 0, 0), '03:00'),
    24 * 60 * 60 * 1000,
  );
  assert.equal(
    getMillisecondsUntilNextNutritionDayRollover(new Date(2026, 5, 30, 3, 0, 0, 1), '03:00'),
    24 * 60 * 60 * 1000 - 1,
  );
  assert.equal(getMillisecondsUntilNextNutritionDayRollover(new Date(2026, 5, 30, 2, 59, 59, 999), 'invalid'), 1);

  assert.equal(getMillisecondsUntilNextNutritionDayRollover(new Date('2026-03-29T00:59:59.999Z'), '02:30'), 1);
  assert.equal(
    getMillisecondsUntilNextNutritionDayRollover(new Date('2026-03-29T01:00:00.000Z'), '02:30'),
    23.5 * 60 * 60 * 1000,
  );

  assert.equal(
    getMillisecondsUntilNextNutritionDayRollover(new Date('2026-10-25T00:30:00.000Z'), '02:30'),
    30 * 60 * 1000,
  );
  assert.equal(getMillisecondsUntilNextNutritionDayRollover(new Date('2026-10-25T00:59:59.999Z'), '02:30'), 1);
  assert.equal(
    getMillisecondsUntilNextNutritionDayRollover(new Date('2026-10-25T01:00:00.000Z'), '02:30'),
    30 * 60 * 1000,
  );
  assert.equal(getMillisecondsUntilNextNutritionDayRollover(new Date('2026-10-25T01:29:59.999Z'), '02:30'), 1);
  assert.equal(
    getMillisecondsUntilNextNutritionDayRollover(new Date('2026-10-25T01:30:00.000Z'), '02:30'),
    24 * 60 * 60 * 1000,
  );

  const pickerDate = buildTimePickerDate('04:15', new Date(2026, 5, 30, 9, 0));
  assert.equal(pickerDate.getHours(), 4);
  assert.equal(pickerDate.getMinutes(), 15);
}

run();
