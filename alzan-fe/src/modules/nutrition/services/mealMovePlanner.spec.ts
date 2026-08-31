import assert from 'node:assert/strict';
import type { MealType } from '../../../types/requests.types';
import { buildMealMoveUpdate, findMealDestinationConflict } from './mealMovePlanner';

const referenceDate = new Date(2026, 7, 13, 12);

const source = {
  id: 'meal-log-1',
  date: '2026-08-13',
  meal_type: 'lunch' as MealType,
};

const testBuildsMoveUpdateForExistingLog = () => {
  const result = buildMealMoveUpdate(source, { date: '2026-08-12', mealType: 'almuerzo' }, referenceDate);

  assert.deepEqual(result, {
    logId: 'meal-log-1',
    updates: {
      date: '2026-08-12',
      meal_type: 'almuerzo',
    },
  });
};

const testRejectsMissingLog = () => {
  assert.throws(
    () => buildMealMoveUpdate(null, { date: '2026-08-12', mealType: 'lunch' }, referenceDate),
    /meal log is required/,
  );
};

const testReusesDestinationValidation = () => {
  assert.throws(
    () => buildMealMoveUpdate(source, { date: '2027-01-01', mealType: 'lunch' }, referenceDate),
    /outside the nutrition calendar range/,
  );

  assert.throws(
    () => buildMealMoveUpdate(source, { date: '2026-08-12', mealType: 'invalid' as MealType }, referenceDate),
    /Invalid meal copy type/,
  );
};

const testFindsOnlyRealDestinationConflicts = () => {
  const logs = [
    { id: 'source', date: '2026-08-13', meal_type: 'lunch' as MealType, name: 'Comida que se mueve' },
    { id: 'other', date: '2026-08-12', meal_type: 'lunch' as MealType, name: 'Otra comida' },
  ];

  assert.equal(
    findMealDestinationConflict(logs, 'source', { date: '2026-08-12', mealType: 'lunch' }, 'move')?.count,
    1,
  );
  assert.deepEqual(
    findMealDestinationConflict(logs, 'source', { date: '2026-08-12', mealType: 'lunch' }, 'move')?.existingMealNames,
    ['Otra comida'],
  );
  assert.equal(findMealDestinationConflict(logs, 'source', { date: '2026-08-13', mealType: 'lunch' }, 'move'), null);
  assert.equal(
    findMealDestinationConflict(logs, 'source', { date: '2026-08-12', mealType: 'lunch' }, 'copy')?.count,
    1,
  );
};

const run = async () => {
  testBuildsMoveUpdateForExistingLog();
  testRejectsMissingLog();
  testReusesDestinationValidation();
  testFindsOnlyRealDestinationConflicts();
  console.log('mealMovePlanner: all tests passed');
};

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
