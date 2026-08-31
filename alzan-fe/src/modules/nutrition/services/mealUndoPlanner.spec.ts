import assert from 'node:assert/strict';
import type { MealItem, MealLog, MealType } from '../../../types/requests.types';
import { createDeletedMealUndoAction, createMovedMealUndoAction, isMealUndoAvailable } from './mealUndoPlanner';

const expiresAt = 10_000;
const mealType: MealType = 'lunch';

const log = {
  id: 'meal-1',
  date: '2026-08-31',
  meal_type: mealType,
  user_id: 'user-1',
  name: 'Comida de prueba',
} as MealLog;

const item = {
  id: 'item-1',
  meal_log_id: 'meal-1',
  user_id: 'user-1',
  name: 'Arroz',
  quantity_g: 100,
} as MealItem;

const moved = createMovedMealUndoAction({
  logId: 'meal-1',
  previous: { date: '2026-08-31', mealType },
  current: { date: '2026-09-01', mealType: 'dinner' },
  expiresAt,
});
assert.deepEqual(moved, {
  kind: 'move',
  logId: 'meal-1',
  previous: { date: '2026-08-31', mealType },
  current: { date: '2026-09-01', mealType: 'dinner' },
  expiresAt,
});

const deleted = createDeletedMealUndoAction({ log, items: [item] }, expiresAt);
assert.equal(deleted.kind, 'delete');
if (deleted.kind === 'delete') {
  assert.deepEqual(deleted.snapshot, { log, items: [item] });
}

assert.equal(isMealUndoAvailable(moved, 9_999), true);
assert.equal(isMealUndoAvailable(moved, expiresAt), false);
assert.equal(isMealUndoAvailable(moved, expiresAt + 1), false);
