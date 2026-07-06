import assert from 'node:assert/strict';

import {
  createVacationDateSet,
  diffVacationDateSelection,
  getNutritionExportAverageDayCount,
  shouldShowPendingPlannedMeals,
} from './nutritionVacation';

function run() {
  const vacationDates = createVacationDateSet([
    { date: '2026-07-01', status: 'vacation' },
    { date: '2026-07-02', status: 'normal' },
    { date: '2026-07-03', status: 'vacation' },
  ]);

  assert.deepEqual(Array.from(vacationDates).sort(), ['2026-07-01', '2026-07-03']);

  const diff = diffVacationDateSelection(
    new Set(['2026-07-01', '2026-07-02']),
    new Set(['2026-07-02', '2026-07-03', '2026-07-04']),
  );

  assert.deepEqual(diff.addDates, ['2026-07-03', '2026-07-04']);
  assert.deepEqual(diff.removeDates, ['2026-07-01']);

  assert.equal(shouldShowPendingPlannedMeals(false), true);
  assert.equal(shouldShowPendingPlannedMeals(true), false);

  assert.equal(
    getNutritionExportAverageDayCount([
      { isVacation: false, loggedMealCount: 0 },
      { isVacation: true, loggedMealCount: 0 },
      { isVacation: true, loggedMealCount: 2 },
    ]),
    2,
  );

  assert.equal(getNutritionExportAverageDayCount([{ isVacation: true, loggedMealCount: 0 }]), 1);
}

run();
