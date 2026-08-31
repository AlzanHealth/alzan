import assert from 'node:assert/strict';
import type { MealType } from '../../../types/requests.types';
import {
  buildDayDuplicationPlan,
  buildMealSelectionPlan,
  buildRangeTransferPlan,
  validateMealRange,
} from './mealBatchPlanner';

const sources = [
  { id: 'meal-1', date: '2026-08-13', meal_type: 'breakfast' as MealType },
  { id: 'meal-2', date: '2026-08-13', meal_type: 'lunch' as MealType },
  { id: 'meal-3', date: '2026-08-14', meal_type: 'dinner' as MealType },
];

const selection = buildMealSelectionPlan(sources.slice(0, 2), '2026-08-20');
assert.deepEqual(
  selection.map(item => [item.logId, item.destination.date, item.destination.mealType]),
  [
    ['meal-1', '2026-08-20', 'breakfast'],
    ['meal-2', '2026-08-20', 'lunch'],
  ],
);

const range = buildRangeTransferPlan(sources, { startDate: '2026-08-13', endDate: '2026-08-14' }, '2026-08-20');
assert.deepEqual(
  range.map(item => [item.logId, item.destination.date]),
  [
    ['meal-1', '2026-08-20'],
    ['meal-2', '2026-08-20'],
    ['meal-3', '2026-08-21'],
  ],
);

assert.deepEqual(
  buildDayDuplicationPlan(sources.slice(0, 2), '2026-08-20'),
  buildRangeTransferPlan(sources.slice(0, 2), { startDate: '2026-08-13', endDate: '2026-08-13' }, '2026-08-20'),
);

assert.doesNotThrow(() => validateMealRange({ startDate: '2026-08-01', endDate: '2026-08-30' }));
assert.throws(() => validateMealRange({ startDate: '2026-08-01', endDate: '2026-08-31' }), /maximum of 30 days/);
assert.throws(
  () => validateMealRange({ startDate: '2026-08-31', endDate: '2026-08-01' }),
  /before or equal to the end date/,
);

console.log('mealBatchPlanner: all tests passed');
