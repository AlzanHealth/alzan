import assert from 'node:assert/strict';
import type { MealItem, MealLog, MealType, DietTemplateMeal } from '../../../types/requests.types';
import { buildMealCopyDraft, validateMealCopyDestination, type MealCopySource } from './mealCopyPlanner';

const userId = 'user-1';

const loggedMeal: MealLog = {
  id: 'log-1',
  user_id: userId,
  date: '2026-08-05',
  meal_type: 'dinner',
  name: 'Hamburguesa de ternera',
  notes: 'Sin cebolla',
  kcal: 373,
  protein_g: 51,
  carbs_g: 0,
  fats_g: 17,
  adherence_status: 'done_with_changes',
  calc_version: 'nutrition_v1',
  data_quality: 'computed',
  logged_at: '2026-08-05T20:00:00.000Z',
  origin: 'user',
  origin_confidence: null,
  source: 'manual',
  source_recipe_id: null,
  diet_template_meal_id: null,
};

const loggedItem: MealItem = {
  id: 'item-1',
  meal_log_id: loggedMeal.id,
  user_id: userId,
  name: 'Ternera magra picada',
  quantity_g: 240,
  source: 'manual',
  source_ref: null,
  kcal: 300,
  protein_g: 48,
  carbs_g: 0,
  fats_g: 12,
  per_100g_kcal: 125,
  per_100g_protein_g: 20,
  per_100g_carbs_g: 0,
  per_100g_fats_g: 5,
  data_quality: 'manual',
  origin: 'user',
  confidence: null,
  created_at: '2026-08-05T20:00:00.000Z',
};

const plannedMeal: DietTemplateMeal = {
  id: 'template-meal-1',
  diet_template_id: 'template-1',
  user_id: userId,
  day_of_week: 3,
  meal_type: 'dinner',
  base_name: 'Cena planificada',
  notes: 'Plan semanal',
  order_index: 2,
  target_kcal: 500,
  target_protein_g: 35,
  target_carbs_g: 40,
  target_fats_g: 15,
};

const loggedSource: MealCopySource = { log: loggedMeal, items: [loggedItem] };
const plannedSource: MealCopySource = { templateMeal: plannedMeal };

const testDestination = { date: '2026-08-10', mealType: 'lunch' as MealType };

const testDraft = () => buildMealCopyDraft(loggedSource, testDestination, userId);

const testBuildsRegisteredCopy = () => {
  const draft = testDraft();

  assert.equal(draft.log.id, undefined);
  assert.equal(draft.log.user_id, userId);
  assert.equal(draft.log.date, testDestination.date);
  assert.equal(draft.log.meal_type, testDestination.mealType);
  assert.equal(draft.log.name, loggedMeal.name);
  assert.equal(draft.log.adherence_status, 'extra_meal');
  assert.equal(draft.log.diet_template_meal_id, null);
  assert.deepEqual(draft.items, [
    {
      user_id: userId,
      name: loggedItem.name,
      quantity_g: loggedItem.quantity_g,
      source: loggedItem.source,
      source_ref: loggedItem.source_ref,
      kcal: loggedItem.kcal,
      protein_g: loggedItem.protein_g,
      carbs_g: loggedItem.carbs_g,
      fats_g: loggedItem.fats_g,
      per_100g_kcal: loggedItem.per_100g_kcal,
      per_100g_protein_g: loggedItem.per_100g_protein_g,
      per_100g_carbs_g: loggedItem.per_100g_carbs_g,
      per_100g_fats_g: loggedItem.per_100g_fats_g,
      data_quality: loggedItem.data_quality,
      origin: loggedItem.origin,
      confidence: loggedItem.confidence,
    },
  ]);
};

const testBuildsPlannedCopyWithoutInventingItems = () => {
  const draft = buildMealCopyDraft(plannedSource, { date: '2026-08-10', mealType: 'breakfast' }, userId);

  assert.equal(draft.log.name, plannedMeal.base_name);
  assert.equal(draft.log.kcal, plannedMeal.target_kcal);
  assert.equal(draft.log.protein_g, plannedMeal.target_protein_g);
  assert.equal(draft.log.carbs_g, plannedMeal.target_carbs_g);
  assert.equal(draft.log.fats_g, plannedMeal.target_fats_g);
  assert.equal(draft.log.diet_template_meal_id, null);
  assert.deepEqual(draft.items, []);
};

const testValidatesDestinationAtTheServiceBoundary = () => {
  const referenceDate = new Date(2026, 7, 5, 12);
  assert.doesNotThrow(() => validateMealCopyDestination(testDestination, referenceDate));
  assert.throws(
    () => validateMealCopyDestination({ ...testDestination, date: '2027-01-01' }, referenceDate),
    /outside the nutrition calendar range/,
  );
};

const run = async () => {
  testBuildsRegisteredCopy();
  testBuildsPlannedCopyWithoutInventingItems();
  testValidatesDestinationAtTheServiceBoundary();
  console.log('mealCopyPlanner: all tests passed');
};

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
