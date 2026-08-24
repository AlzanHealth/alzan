import assert from 'node:assert/strict';
import {
  MENU_IMPORT_MAX_TEXT_LENGTH,
  MENU_IMPORT_MEAL_TYPES,
  parseMenuImportJson,
  type MenuImportDocument,
  type MenuImportMealType,
} from './menuImportContract';
import {
  buildMenuImportPreview,
  isMenuImportPreviewReady,
  resolveMenuImportIngredients,
  setMenuImportConflictDecision,
  type MenuImportIngredientCandidate,
  type MenuImportPreview,
} from './menuImportPlanner';
import {
  executeMenuImport,
  type MenuImportAtomicImportInput,
  type MenuImportPersistenceAdapter,
} from './menuImportPersistence';

const DAYS_IN_FOUR_WEEKS = 28;
const INGREDIENTS_PER_MEAL = 8;
const UNIQUE_INGREDIENTS = 24;

const formatDate = (dayIndex: number): string => {
  const date = new Date(Date.UTC(2026, 7, 3 + dayIndex));
  return date.toISOString().slice(0, 10);
};

const createFourWeekDocument = (): MenuImportDocument => ({
  format: 'alzan-menu-plan',
  version: 1,
  menu_name: 'Menú completo de cuatro semanas',
  days: Array.from({ length: DAYS_IN_FOUR_WEEKS }, (_, dayIndex) => ({
    date: formatDate(dayIndex),
    meals: MENU_IMPORT_MEAL_TYPES.map((mealType, mealIndex) => ({
      meal_type: mealType,
      name: `${mealType} del día ${dayIndex + 1}`,
      ingredients: Array.from({ length: INGREDIENTS_PER_MEAL }, (_, ingredientIndex) => ({
        name: `Ingrediente ${((dayIndex * INGREDIENTS_PER_MEAL + mealIndex + ingredientIndex) % UNIQUE_INGREDIENTS) + 1}`,
        quantity_g: 25 + ingredientIndex * 10,
      })),
    })),
  })),
});

class CapturingAdapter implements MenuImportPersistenceAdapter {
  input: MenuImportAtomicImportInput | null = null;

  async importMenuAtomically(input: MenuImportAtomicImportInput): Promise<void> {
    this.input = input;
  }
}

const createIdFactory = () => {
  let sequence = 0;
  return () => {
    sequence += 1;
    return `00000000-0000-4000-8000-${sequence.toString(16).padStart(12, '0')}`;
  };
};

const createCandidate = (normalizedName: string): MenuImportIngredientCandidate => ({
  id: `ingredient-${normalizedName.replace(/\s+/g, '-')}`,
  name: normalizedName,
  kcal_100: 100,
  protein_g_100: 10,
  carbs_g_100: 20,
  fat_g_100: 5,
});

async function testFourCompleteWeeksFromJsonToAtomicPayload() {
  const rawJson = JSON.stringify(createFourWeekDocument());
  assert.ok(rawJson.length <= MENU_IMPORT_MAX_TEXT_LENGTH);

  const parsed = parseMenuImportJson(rawJson);
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;

  const searchedNames: string[] = [];
  const resolutions = await resolveMenuImportIngredients(parsed.value, async normalizedName => {
    searchedNames.push(normalizedName);
    return [createCandidate(normalizedName)];
  });
  const dates = parsed.value.days.map(day => day.date);
  const preview = buildMenuImportPreview(parsed.value, resolutions, [], {
    token: '0123456789abcdef0123456789abcdef',
    dates,
  });

  assert.equal(new Set(searchedNames).size, UNIQUE_INGREDIENTS);
  assert.equal(searchedNames.length, UNIQUE_INGREDIENTS);
  assert.equal(preview.meals.length, DAYS_IN_FOUR_WEEKS * MENU_IMPORT_MEAL_TYPES.length);
  assert.equal(
    preview.meals.reduce((total, meal) => total + meal.ingredients.length, 0),
    DAYS_IN_FOUR_WEEKS * MENU_IMPORT_MEAL_TYPES.length * INGREDIENTS_PER_MEAL,
  );
  assert.deepEqual(new Set(preview.meals.map(meal => meal.meal_type)), new Set(MENU_IMPORT_MEAL_TYPES));
  assert.equal(isMenuImportPreviewReady(preview), true);

  const adapter = new CapturingAdapter();
  const result = await executeMenuImport('00000000-0000-4000-8000-000000000001', preview, adapter, {
    createId: createIdFactory(),
  });
  const input = adapter.input;

  assert.ok(input);
  assert.equal(result.firstDate, '2026-08-03');
  assert.equal(result.createdMealIds.length, DAYS_IN_FOUR_WEEKS * MENU_IMPORT_MEAL_TYPES.length);
  assert.equal(input.meals.length, DAYS_IN_FOUR_WEEKS * MENU_IMPORT_MEAL_TYPES.length);
  assert.equal(input.items.length, DAYS_IN_FOUR_WEEKS * MENU_IMPORT_MEAL_TYPES.length * INGREDIENTS_PER_MEAL);
  assert.equal(input.snapshot.dates.length, DAYS_IN_FOUR_WEEKS);
  assert.equal(new Set(input.meals.map(meal => meal.id)).size, input.meals.length);
  assert.ok(JSON.stringify({ meals: input.meals, items: input.items }).length < 2_000_000);
}

async function testFourWeeksWithEveryConflictDecision() {
  const document = createFourWeekDocument();
  const resolutions = await resolveMenuImportIngredients(document, async normalizedName => [
    createCandidate(normalizedName),
  ]);
  const dates = document.days.map(day => day.date);
  const existingLogs = document.days.flatMap(day =>
    day.meals.map(meal => ({
      id: `existing-${day.date}-${meal.meal_type}`,
      date: day.date,
      meal_type: meal.meal_type as MenuImportMealType,
      name: `Existente ${meal.meal_type}`,
    })),
  );
  let preview: MenuImportPreview = buildMenuImportPreview(document, resolutions, existingLogs, {
    token: '0123456789abcdef0123456789abcdef',
    dates,
  });

  assert.equal(isMenuImportPreviewReady(preview), false);
  const decisions = ['replace', 'keep_both', 'ignore'] as const;
  preview.meals.forEach((meal, index) => {
    preview = setMenuImportConflictDecision(preview, meal.key, decisions[index % decisions.length]);
  });
  assert.equal(isMenuImportPreviewReady(preview), true);

  const adapter = new CapturingAdapter();
  await executeMenuImport('00000000-0000-4000-8000-000000000001', preview, adapter, {
    createId: createIdFactory(),
  });
  const input = adapter.input;

  assert.ok(input);
  assert.equal(input.meals.length, 112);
  assert.equal(input.items.length, 896);
  assert.equal(input.replacementIds.length, 56);
  assert.equal(new Set(input.replacementIds).size, 56);
}

void Promise.all([testFourCompleteWeeksFromJsonToAtomicPayload(), testFourWeeksWithEveryConflictDecision()]).then(
  () => {
    console.log('menuImportFourWeek: all assertions passed');
  },
);
