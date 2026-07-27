import assert from 'node:assert/strict';

import {
  DailyMealMacroLog,
  getDailyMealMacros,
  getMealSaveProvenance,
  getMenuImportMealState,
  MenuImportStatusLog,
} from './menuImportStatus';

const createLog = (overrides: Partial<MenuImportStatusLog> = {}): MenuImportStatusLog => ({
  date: '2026-07-24',
  source: 'menu_import_v1',
  origin: 'imported',
  adherence_status: 'planned',
  ...overrides,
});

function run() {
  const currentNutritionDate = '2026-07-24';

  assert.equal(getMenuImportMealState(createLog(), currentNutritionDate), 'planned');
  assert.equal(getMenuImportMealState(createLog({ date: '2026-07-25' }), currentNutritionDate), 'planned');
  assert.equal(getMenuImportMealState(createLog({ date: '2026-07-23' }), currentNutritionDate), 'assumed_eaten');
  assert.equal(
    getMenuImportMealState(createLog({ adherence_status: 'done_as_planned' }), currentNutritionDate),
    'assumed_eaten',
  );
  assert.equal(
    getMenuImportMealState(createLog({ date: '2026-07-23', adherence_status: 'skipped' }), currentNutritionDate),
    'skipped',
  );
  assert.equal(
    getMenuImportMealState(createLog({ source: 'manual', origin: 'user' }), currentNutritionDate),
    'not_imported',
  );
  assert.equal(
    getMenuImportMealState(createLog({ source: 'menu_import_v1', origin: 'user' }), currentNutritionDate),
    'not_imported',
  );

  const skippedMeal: DailyMealMacroLog = {
    adherence_status: 'skipped',
    kcal: 640,
    protein_g: 32,
    carbs_g: 75,
    fats_g: 18,
  };
  assert.deepEqual(getDailyMealMacros(skippedMeal), {
    kcal: 0,
    protein_g: 0,
    carbs_g: 0,
    fats_g: 0,
  });
  assert.deepEqual(getDailyMealMacros({ ...skippedMeal, adherence_status: 'done_with_changes' }), {
    kcal: 640,
    protein_g: 32,
    carbs_g: 75,
    fats_g: 18,
  });

  const importedLog = createLog();
  assert.deepEqual(getMealSaveProvenance(importedLog), {
    source: 'menu_import_v1',
    origin: 'imported',
    adherence_status: 'planned',
  });
  assert.deepEqual(importedLog, createLog());
}

run();
