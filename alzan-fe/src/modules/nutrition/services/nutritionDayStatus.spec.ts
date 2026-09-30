import assert from 'node:assert/strict';
import { getNextNutritionDayStatus, getNutritionDayStatus, getNutritionDayStatusDates } from './nutritionDayStatus';

const rows = [
  { date: '2026-09-28', status: 'vacation' },
  { date: '2026-09-29', status: 'over_target' },
];

assert.equal(getNutritionDayStatus(rows, '2026-09-28'), 'vacation');
assert.equal(getNutritionDayStatus(rows, '2026-09-29'), 'over_target');
assert.equal(getNutritionDayStatus(rows, '2026-09-30'), 'normal');
assert.equal(getNutritionDayStatus([{ date: '2026-09-30', status: 'unexpected' }], '2026-09-30'), 'normal');
assert.deepEqual(Array.from(getNutritionDayStatusDates(rows, 'vacation')), ['2026-09-28']);
assert.deepEqual(Array.from(getNutritionDayStatusDates(rows, 'over_target')), ['2026-09-29']);
assert.equal(getNextNutritionDayStatus('normal'), 'over_target');
assert.equal(getNextNutritionDayStatus('over_target'), 'vacation');
assert.equal(getNextNutritionDayStatus('vacation'), 'normal');
