import assert from 'node:assert/strict';
import type { MealItem } from '../../../types/requests.types';
import {
  buildQuickMealIngredientInputs,
  formatQuickMealQuantity,
  parseQuickMealQuantity,
  sanitizeQuickMealQuantity,
} from './quickMealEditPlanner';

const item = (overrides: Partial<MealItem> = {}): MealItem => ({
  id: 'item-1',
  meal_log_id: 'log-1',
  user_id: 'user-1',
  name: 'Arroz blanco',
  source: 'database',
  source_ref: 'ingredient-1',
  quantity_g: 150,
  per_100g_kcal: 130,
  per_100g_protein_g: 2.7,
  per_100g_carbs_g: 28,
  per_100g_fats_g: 0.3,
  kcal: 195,
  protein_g: 4.1,
  carbs_g: 42,
  fats_g: 0.5,
  data_quality: 'automatic',
  origin: 'user',
  confidence: null,
  created_at: '2026-08-31T10:00:00.000Z',
  ...overrides,
});

const run = () => {
  assert.equal(parseQuickMealQuantity('125,5'), 125.5);
  assert.equal(parseQuickMealQuantity('0'), null);
  assert.equal(parseQuickMealQuantity('1000,1'), null);
  assert.equal(sanitizeQuickMealQuantity('12a,5g'), '12.5');
  assert.equal(formatQuickMealQuantity(125.5), '125.5');

  assert.deepEqual(buildQuickMealIngredientInputs([item()], { 'item-1': '200' }), [
    {
      name: 'Arroz blanco',
      quantity_g: 200,
      source: 'database',
      source_ref: 'ingredient-1',
      kcal_100: 130,
      protein_g_100: 2.7,
      carbs_g_100: 28,
      fat_g_100: 0.3,
    },
  ]);
  assert.deepEqual(buildQuickMealIngredientInputs([item()], {}, new Set(['item-1'])), []);
  assert.equal(buildQuickMealIngredientInputs([item()], { 'item-1': '0' }), null);
  console.log('quickMealEditPlanner: all assertions passed');
};

run();
