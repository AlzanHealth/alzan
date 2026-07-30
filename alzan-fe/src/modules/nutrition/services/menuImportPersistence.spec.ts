import assert from 'node:assert/strict';
import { createSecureUuidV4, executeMenuImport, MenuImportSnapshotStaleError } from './menuImportPersistence';
import type { MenuImportAtomicImportInput, MenuImportPersistenceAdapter } from './menuImportPersistence';
import type {
  MenuImportConflictDecision,
  MenuImportIngredientCandidate,
  MenuImportPreview,
  MenuImportPreviewMeal,
} from './menuImportPlanner';

const selectedIngredient: MenuImportIngredientCandidate = {
  id: 'ingredient-rice',
  name: 'Arroz integral',
  kcal_100: 200,
  protein_g_100: 10,
  carbs_g_100: 20,
  fat_g_100: 5,
};

const formatDate = (dayIndex: number): string => new Date(Date.UTC(2026, 7, 1 + dayIndex)).toISOString().slice(0, 10);

const createMeal = (
  key: string,
  date: string,
  decision: MenuImportConflictDecision | null = null,
  existingLogIds: string[] = [],
  ingredientCount = 1,
): MenuImportPreviewMeal => ({
  key,
  date,
  meal_type: 'almuerzo',
  name: `Meal ${key}`,
  ingredients: Array.from({ length: ingredientCount }, (_, index) => ({
    ingredientKey: `arroz integral ${index}`,
    name: `Arroz del documento ${index}`,
    quantity_g: 150,
    selectedCandidate: {
      ...selectedIngredient,
      id: `${selectedIngredient.id}-${index}`,
    },
    macros: {
      kcal: 300,
      protein_g: 15,
      carbs_g: 30,
      fats_g: 7.5,
    },
  })),
  macros: {
    kcal: 300 * ingredientCount,
    protein_g: 15 * ingredientCount,
    carbs_g: 30 * ingredientCount,
    fats_g: 7.5 * ingredientCount,
  },
  conflict:
    existingLogIds.length === 0
      ? null
      : {
          existingLogs: existingLogIds.map(id => ({
            id,
            date,
            meal_type: 'almuerzo',
            name: `Existing ${id}`,
          })),
          decision,
        },
});

const createPreview = (meals: MenuImportPreviewMeal[]): MenuImportPreview => ({
  menuName: 'Menu persistence test',
  calendarSnapshot: {
    token: '0123456789abcdef0123456789abcdef',
    dates: Array.from(new Set(meals.map(meal => meal.date))).sort(),
  },
  resolutions: [],
  meals,
});

const createIdFactory = () => {
  let sequence = 0;

  return () => {
    sequence += 1;
    return `00000000-0000-4000-8000-${sequence.toString(16).padStart(12, '0')}`;
  };
};

class InMemoryAdapter implements MenuImportPersistenceAdapter {
  readonly calls: MenuImportAtomicImportInput[] = [];
  failWithStaleSnapshot = false;

  async importMenuAtomically(input: MenuImportAtomicImportInput): Promise<void> {
    if (this.failWithStaleSnapshot) {
      throw new MenuImportSnapshotStaleError();
    }
    this.calls.push(input);
  }
}

const executeWithTestIds = (userId: string, preview: MenuImportPreview, adapter: MenuImportPersistenceAdapter) =>
  executeMenuImport(userId, preview, adapter, { createId: createIdFactory() });

function testCreatesUuidV4FromSecureRandomBytes() {
  const uuid = createSecureUuidV4(bytes => {
    bytes.fill(0xff);
    return bytes;
  });

  assert.equal(uuid, 'ffffffff-ffff-4fff-bfff-ffffffffffff');
}

async function testBuildsImportedRowsAndSkipsIgnoredMeals() {
  const adapter = new InMemoryAdapter();
  const preview = createPreview([
    createMeal('ignored', '2026-08-02', 'ignore', ['existing-ignored']),
    createMeal('created', '2026-08-03'),
  ]);

  const result = await executeWithTestIds('user-1', preview, adapter);
  const input = adapter.calls[0];
  const createdId = result.createdMealIds[0];

  assert.equal(result.firstDate, '2026-08-03');
  assert.equal(adapter.calls.length, 1);
  assert.deepEqual(input.meals, [
    {
      id: createdId,
      user_id: 'user-1',
      date: '2026-08-03',
      meal_type: 'almuerzo',
      name: 'Meal created',
      kcal: 300,
      protein_g: 15,
      carbs_g: 30,
      fats_g: 7.5,
      adherence_status: 'done_as_planned',
      source: 'menu_import_v1',
      data_quality: 'computed',
      calc_version: 'nutrition_v1',
      origin: 'imported',
      source_recipe_id: null,
    },
  ]);
  assert.equal(input.items[0]?.meal_log_id, createdId);
  assert.equal(input.items[0]?.origin, 'imported');
  assert.deepEqual(input.replacementIds, []);
}

async function testRejectsInvalidPreviewsWithoutCallingPersistence() {
  const emptyUserAdapter = new InMemoryAdapter();
  await assert.rejects(executeWithTestIds('  ', createPreview([createMeal('new', '2026-08-03')]), emptyUserAdapter), {
    message: 'Authenticated user is required',
  });
  assert.equal(emptyUserAdapter.calls.length, 0);

  const ignoredAdapter = new InMemoryAdapter();
  await assert.rejects(
    executeWithTestIds(
      'user-1',
      createPreview([createMeal('ignored', '2026-08-03', 'ignore', ['existing'])]),
      ignoredAdapter,
    ),
    { message: 'Menu import contains no meals to create' },
  );
  assert.equal(ignoredAdapter.calls.length, 0);

  const contradictoryAdapter = new InMemoryAdapter();
  await assert.rejects(
    executeWithTestIds(
      'user-1',
      createPreview([
        createMeal('replace', '2026-08-03', 'replace', ['existing']),
        createMeal('keep', '2026-08-03', 'keep_both', ['existing']),
      ]),
      contradictoryAdapter,
    ),
    { message: 'Menu import contains conflicting decisions for the same time slot' },
  );
  assert.equal(contradictoryAdapter.calls.length, 0);
}

async function testSupportsMaximumIngredientPayload() {
  const adapter = new InMemoryAdapter();
  const meals = Array.from({ length: 300 }, (_, index) => {
    const day = String(Math.floor(index / 10) + 1).padStart(2, '0');
    return createMeal(`meal-${index}`, `2026-08-${day}`, null, [], 5);
  });

  await executeWithTestIds('user-1', createPreview(meals), adapter);

  assert.equal(adapter.calls[0]?.meals.length, 300);
  assert.equal(adapter.calls[0]?.items.length, 1500);
  assert.equal(adapter.calls[0]?.snapshot.dates.length, 30);
}

async function testSupportsMaximumDayAndMealPayload() {
  const adapter = new InMemoryAdapter();
  const meals = Array.from({ length: 450 }, (_, index) => {
    const date = formatDate(Math.floor(index / 10));
    return createMeal(`meal-${index}`, date);
  });

  await executeWithTestIds('user-1', createPreview(meals), adapter);

  assert.equal(adapter.calls[0]?.meals.length, 450);
  assert.equal(adapter.calls[0]?.items.length, 450);
  assert.equal(adapter.calls[0]?.snapshot.dates.length, 45);
}

async function testReplacementTargetsAndStaleSnapshotAreAtomic() {
  const adapter = new InMemoryAdapter();
  const preview = createPreview([
    createMeal('first', '2026-08-03', 'replace', ['existing-shared', 'existing-first']),
    createMeal('second', '2026-08-03', 'replace', ['existing-shared']),
    createMeal('keep', '2026-08-04', 'keep_both', ['existing-kept']),
  ]);

  await executeWithTestIds('user-1', preview, adapter);
  assert.deepEqual(adapter.calls[0]?.replacementIds, ['existing-shared', 'existing-first']);
  assert.equal(adapter.calls[0]?.meals.length, 3);

  const staleAdapter = new InMemoryAdapter();
  staleAdapter.failWithStaleSnapshot = true;
  await assert.rejects(executeWithTestIds('user-1', preview, staleAdapter), MenuImportSnapshotStaleError);
  assert.equal(staleAdapter.calls.length, 0);
}

async function main() {
  testCreatesUuidV4FromSecureRandomBytes();
  await testBuildsImportedRowsAndSkipsIgnoredMeals();
  await testRejectsInvalidPreviewsWithoutCallingPersistence();
  await testSupportsMaximumIngredientPayload();
  await testSupportsMaximumDayAndMealPayload();
  await testReplacementTargetsAndStaleSnapshotAreAtomic();
  console.log('menuImportPersistence: all assertions passed');
}

void main();
