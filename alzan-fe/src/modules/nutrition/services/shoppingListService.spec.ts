import assert from 'node:assert/strict';
import {
  aggregateShoppingIngredients,
  formatShoppingQuantity,
  getActiveShoppingMealLogIds,
  getShoppingCycleRange,
  groupShoppingIngredientsByCategory,
  type ShoppingMealLogInput,
  type ShoppingIngredientInput,
} from './shoppingListPlanner';
import type { IngredientsCategory } from '../../../types/requests.types';

function run() {
  testSupportsEveryCycleStartDay();
  testHandlesMonthAndYearBoundaries();
  testAggregatesCanonicalAndNormalizedIngredients();
  testFormatsShoppingQuantities();
  testGroupsIngredientsByDatabaseCategory();
  testExcludesSkippedMealsAndScalesToLargeMenus();
  console.log('shoppingListService: all assertions passed');
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

run();
