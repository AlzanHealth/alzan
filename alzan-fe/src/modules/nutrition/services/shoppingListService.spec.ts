import assert from 'node:assert/strict';
import {
  aggregateShoppingIngredients,
  formatShoppingQuantity,
  formatShoppingListForExport,
  getActiveShoppingMealLogIds,
  getShoppingCustomRange,
  getShoppingMealTime,
  getShoppingMealState,
  getShoppingRange,
  isShoppingMealPast,
  planShoppingMealLogs,
  getShoppingCycleRange,
  groupShoppingIngredientsByCategory,
  adjustShoppingPurchaseQuantity,
  filterShoppingIngredients,
  getShoppingPurchaseQuantity,
  roundShoppingPurchaseQuantity,
  type ShoppingMealLogInput,
  type ShoppingIngredientInput,
  type ShoppingListRequest,
} from './shoppingListPlanner';
import { getShoppingListCacheKey, parseShoppingListResult, serializeShoppingListResult } from './shoppingListCache';
import {
  getShoppingListCompletionStorageKey,
  parseShoppingListCompletionKeys,
  serializeShoppingListCompletionKeys,
} from './shoppingListCompletion';
import {
  mergeShoppingListStates,
  parseShoppingListState,
  serializeShoppingListState,
  type ShoppingListState,
} from './shoppingListState';
import type { IngredientsCategory } from '../../../types/requests.types';

function run() {
  testSupportsEveryCycleStartDay();
  testHandlesMonthAndYearBoundaries();
  testAggregatesCanonicalAndNormalizedIngredients();
  testFormatsShoppingQuantities();
  testFormatsShoppingListForExport();
  testPersistsShoppingListCompletionKeys();
  testGroupsIngredientsByDatabaseCategory();
  testExcludesSkippedMealsAndScalesToLargeMenus();
  testPlansUpcomingMealsByLocalSchedule();
  testSupportsAllShoppingRangesAndLimits();
  testSupportsPurchaseQuantitiesAndFilters();

  const cachedShoppingList = {
    range: { startDate: '2026-08-24', endDate: '2026-08-30' },
    ingredients: [
      {
        key: 'id:ingredient-1',
        name: 'Arroz',
        quantity_g: 250,
        purchase_quantity_g: 500,
        category: 'cereal' as const,
      },
    ],
    totalMealCount: 2,
    visibleMealCount: 1,
    hiddenMealCount: 1,
  };
  assert.deepEqual(parseShoppingListResult(serializeShoppingListResult(cachedShoppingList)), cachedShoppingList);
  assert.equal(parseShoppingListResult('{"range":{}}'), null);
  assert.ok(
    getShoppingListCacheKey({
      userId: 'user-1',
      mode: 'upcoming',
      rangeStart: '2026-08-24',
      rangeEnd: '2026-08-30',
      startDay: 1,
      timezone: 'Europe/Madrid',
      mealTimes: {},
      showPast: false,
    }).includes('alzan.shopping-list.result.'),
  );
  testPersistsIndependentShoppingListState();
  console.log('shoppingListService: all assertions passed');
}

function testSupportsPurchaseQuantitiesAndFilters() {
  const ingredients = [
    { key: 'a', name: 'Arroz', quantity_g: 620, category: 'cereal' as IngredientsCategory },
    { key: 'b', name: 'Pan', quantity_g: 220, category: 'cereal' as IngredientsCategory },
  ];
  assert.equal(roundShoppingPurchaseQuantity(620, 500), 1000);
  assert.equal(adjustShoppingPurchaseQuantity(ingredients[0], 'round_1kg'), 1000);
  assert.equal(getShoppingPurchaseQuantity({ ...ingredients[0], purchase_quantity_g: 750 }), 750);
  assert.deepEqual(
    filterShoppingIngredients(ingredients, new Set(['a']), 'pending').map(item => item.key),
    ['b'],
  );
  assert.deepEqual(
    filterShoppingIngredients(ingredients, new Set(['a']), 'purchased').map(item => item.key),
    ['a'],
  );
}

function testPersistsIndependentShoppingListState() {
  const state: ShoppingListState = {
    'name:arroz': {
      completed: true,
      hidden: false,
      purchaseQuantityGrams: 1000,
      updatedAt: '2026-08-28T10:00:00.000Z',
    },
  };
  const parsed = parseShoppingListState(serializeShoppingListState(state));
  assert.deepEqual(parsed, state);
  assert.equal(
    mergeShoppingListStates(state, {
      'name:arroz': { ...state['name:arroz'], completed: false, updatedAt: '2026-08-28T09:00:00.000Z' },
      'name:pan': { completed: false, hidden: true, updatedAt: '2026-08-28T11:00:00.000Z' },
    })['name:arroz'].completed,
    true,
  );
}

function testSupportsEveryCycleStartDay() {
  const selectedDate = '2026-07-29';
  const expectedRanges: Record<number, { startDate: string; endDate: string }> = {
    1: { startDate: '2026-07-27', endDate: '2026-08-02' },
    2: { startDate: '2026-07-28', endDate: '2026-08-03' },
    3: { startDate: '2026-07-29', endDate: '2026-08-04' },
    4: { startDate: '2026-07-23', endDate: '2026-07-29' },
    5: { startDate: '2026-07-24', endDate: '2026-07-30' },
    6: { startDate: '2026-07-25', endDate: '2026-07-31' },
    7: { startDate: '2026-07-26', endDate: '2026-08-01' },
  };

  for (const [startDay, expected] of Object.entries(expectedRanges)) {
    assert.deepEqual(getShoppingCycleRange(selectedDate, Number(startDay)), expected);
  }
}

function testHandlesMonthAndYearBoundaries() {
  assert.deepEqual(getShoppingCycleRange('2026-01-01', 1), {
    startDate: '2025-12-29',
    endDate: '2026-01-04',
  });
  assert.deepEqual(getShoppingCycleRange('2026-12-31', 4), {
    startDate: '2026-12-31',
    endDate: '2027-01-06',
  });
}

function testAggregatesCanonicalAndNormalizedIngredients() {
  const items: ShoppingIngredientInput[] = [
    { name: 'Tomate', quantity_g: 120, source: 'database', source_ref: 'tomato-id' },
    { name: 'Tomate rojo', quantity_g: 80, source: 'database', source_ref: 'tomato-id' },
    { name: 'Aceite de oliva', quantity_g: 10, source: 'manual', source_ref: null },
    { name: ' aceite  DE  oliva ', quantity_g: 15, source: 'custom', source_ref: null },
  ];

  assert.deepEqual(
    aggregateShoppingIngredients(items, new Map([['tomato-id', 'Tomato']])).map(item => ({
      name: item.name,
      quantity_g: item.quantity_g,
    })),
    [
      { name: 'Aceite de oliva', quantity_g: 25 },
      { name: 'Tomato', quantity_g: 200 },
    ],
  );
}

function testFormatsShoppingQuantities() {
  assert.equal(formatShoppingQuantity(0), '0 g');
  assert.equal(formatShoppingQuantity(850), '850 g');
  assert.equal(formatShoppingQuantity(1000), '1 kg');
  assert.equal(formatShoppingQuantity(1250), '1.25 kg');
}

function testFormatsShoppingListForExport() {
  assert.equal(
    formatShoppingListForExport([
      { key: 'id:chicken', name: 'Pechuga de pollo', quantity_g: 400, category: 'proteina_animal' },
      { key: 'id:oil', name: 'Aceite de oliva', quantity_g: 1250, category: 'grasa' },
    ]),
    'Pechuga de pollo - 400 g\nAceite de oliva - 1.25 kg',
  );
}

function testPersistsShoppingListCompletionKeys() {
  assert.equal(
    getShoppingListCompletionStorageKey('user-1', '2026-07-27'),
    'alzan.shopping-list.completed.user-1.2026-07-27',
  );
  const serialized = serializeShoppingListCompletionKeys(new Set(['id:tomato', 'id:chicken', 'id:tomato']));
  assert.equal(serialized, '["id:chicken","id:tomato"]');
  assert.deepEqual(parseShoppingListCompletionKeys(serialized), new Set(['id:chicken', 'id:tomato']));
  assert.deepEqual(parseShoppingListCompletionKeys('not-json'), new Set());
}

function testGroupsIngredientsByDatabaseCategory() {
  const ingredients = aggregateShoppingIngredients(
    [
      { name: 'Arroz', quantity_g: 100, source: 'database', source_ref: 'rice-id' },
      { name: 'Pollo', quantity_g: 200, source: 'database', source_ref: 'chicken-id' },
      { name: 'Aceite casero', quantity_g: 10, source: 'manual', source_ref: null },
    ],
    new Map(),
    new Map<string, IngredientsCategory>([
      ['rice-id', 'cereal'],
      ['chicken-id', 'proteina_animal'],
    ]),
  );

  assert.deepEqual(
    groupShoppingIngredientsByCategory(ingredients).map(group => ({
      category: group.category,
      names: group.ingredients.map(item => item.name),
    })),
    [
      { category: 'proteina_animal', names: ['Pollo'] },
      { category: 'cereal', names: ['Arroz'] },
      { category: 'otro', names: ['Aceite casero'] },
    ],
  );
}

function testExcludesSkippedMealsAndScalesToLargeMenus() {
  const logs: ShoppingMealLogInput[] = [
    { id: 'active-1', adherence_status: 'done_as_planned' },
    { id: 'planned-1', adherence_status: 'planned' },
    { id: 'skipped-1', adherence_status: 'skipped' },
  ];
  assert.deepEqual(getActiveShoppingMealLogIds(logs), ['active-1', 'planned-1']);

  const largeMenu = Array.from({ length: 320 }, (_, index) => ({
    name: 'Arroz',
    quantity_g: index + 1,
    source: 'manual' as const,
    source_ref: null,
  }));
  assert.deepEqual(
    aggregateShoppingIngredients(largeMenu).map(item => item.quantity_g),
    [51360],
  );
}

function testPlansUpcomingMealsByLocalSchedule() {
  const now = new Date('2026-08-25T10:30:00.000Z');
  const mealTimes = { breakfast: '08:00', lunch: '14:00', dinner: '21:00' } as const;
  const logs: ShoppingMealLogInput[] = [
    { id: 'yesterday', date: '2026-08-24', meal_type: 'dinner', adherence_status: 'planned' },
    { id: 'breakfast', date: '2026-08-25', meal_type: 'breakfast', adherence_status: 'planned' },
    { id: 'lunch', date: '2026-08-25', meal_type: 'lunch', adherence_status: 'planned' },
    { id: 'unknown', date: '2026-08-25', meal_type: 'snack', adherence_status: 'planned' },
    {
      id: 'future',
      date: '2026-08-26',
      meal_type: 'dinner',
      adherence_status: 'done_as_planned',
      source: 'menu_import_v1',
      origin: 'imported',
    },
    { id: 'completed-future', date: '2026-08-26', meal_type: 'lunch', adherence_status: 'done_as_planned' },
    { id: 'skipped', date: '2026-08-26', meal_type: 'dinner', adherence_status: 'skipped' },
  ];
  const request: ShoppingListRequest = {
    mode: 'upcoming',
    selectedDate: '2026-08-25',
    now,
    timezone: 'Europe/Madrid',
    mealTimes,
  };

  assert.equal(getShoppingMealTime('breakfast', mealTimes), '08:00');
  assert.equal(getShoppingMealTime('snack', mealTimes), null);
  assert.equal(isShoppingMealPast(logs[1], request), true);
  assert.equal(isShoppingMealPast(logs[2], request), false);
  assert.equal(getShoppingMealState(logs[3], request), 'pending');
  assert.equal(getShoppingMealState(logs[4], request), 'pending');
  assert.equal(getShoppingMealState(logs[5], request), 'performed');
  assert.deepEqual(
    planShoppingMealLogs(logs, request).map(log => log.id),
    ['lunch', 'unknown', 'future'],
  );
}

function testSupportsAllShoppingRangesAndLimits() {
  assert.deepEqual(getShoppingRange({ mode: 'cycle', selectedDate: '2026-08-25' }, 1), {
    startDate: '2026-08-24',
    endDate: '2026-08-30',
  });
  assert.deepEqual(getShoppingCustomRange('2026-08-25', '2026-08-25'), {
    startDate: '2026-08-25',
    endDate: '2026-08-25',
  });
  assert.deepEqual(getShoppingCustomRange('2026-08-25', '2026-09-23'), {
    startDate: '2026-08-25',
    endDate: '2026-09-23',
  });
  assert.throws(() => getShoppingCustomRange('2026-08-25', '2026-09-24'), /30 days/);
  assert.throws(() => getShoppingCustomRange('2026-08-26', '2026-08-25'), /after/);
}

run();
