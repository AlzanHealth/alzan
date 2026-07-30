import assert from 'node:assert/strict';
import { MENU_IMPORT_FORMAT, MENU_IMPORT_VERSION, MenuImportDocument } from './menuImportContract';
import {
  buildMenuImportPreview,
  isMenuImportPreviewReady,
  MenuImportIngredientCandidate,
  resolveMenuImportIngredients,
  selectMenuImportIngredient,
  setMenuImportConflictDecision,
} from './menuImportPlanner';

const banana: MenuImportIngredientCandidate = {
  id: 'ingredient-banana',
  name: 'Plátano',
  kcal_100: 100,
  protein_g_100: 2,
  carbs_g_100: 20,
  fat_g_100: 1,
};

const rice: MenuImportIngredientCandidate = {
  id: 'ingredient-rice',
  name: 'Arroz integral',
  kcal_100: 200,
  protein_g_100: 10,
  carbs_g_100: 20,
  fat_g_100: 5,
};

const createDocument = (ingredientNames: string[], quantitiesInGrams?: number[]): MenuImportDocument => ({
  format: MENU_IMPORT_FORMAT,
  version: MENU_IMPORT_VERSION,
  menu_name: 'Menú de prueba',
  days: [
    {
      date: '2026-08-03',
      meals: [
        {
          meal_type: 'lunch',
          name: 'Comida',
          ingredients: ingredientNames.map((name, index) => ({
            name,
            quantity_g: quantitiesInGrams?.[index] ?? (index === 0 ? 150 : 50),
          })),
        },
      ],
    },
  ],
});

const calendarSnapshot = {
  token: 'snapshot-token',
  dates: ['2026-08-03'],
};

async function testUniqueSearchAndExactSelection() {
  const searchedNames: string[] = [];
  const document = createDocument(['Plátano', ' PLÁTANO ', 'Arroz']);
  const candidatesByName: Record<string, MenuImportIngredientCandidate[]> = {
    platano: [
      { ...rice, id: 'ingredient-plantain', name: 'Plátano macho' },
      banana,
      { ...banana, id: 'ingredient-banana-2', name: 'Banana' },
      { ...banana, id: 'ingredient-banana-3', name: 'Banana pequeña' },
      { ...banana, id: 'ingredient-banana-4', name: 'Banana madura' },
      { ...banana, id: 'ingredient-banana-5', name: 'Banana deshidratada' },
    ],
    arroz: [{ ...rice, name: 'Arroz largo' }],
  };

  const resolutions = await resolveMenuImportIngredients(document, async name => {
    searchedNames.push(name);
    return candidatesByName[name] ?? [];
  });

  assert.deepEqual(searchedNames.sort(), ['arroz', 'platano']);
  assert.equal(resolutions.length, 2);

  const bananaResolution = resolutions.find(resolution => resolution.ingredientKey === 'platano');
  assert.equal(bananaResolution?.selectedCandidate?.id, banana.id);
  assert.equal(bananaResolution?.candidates.length, 5);

  const riceResolution = resolutions.find(resolution => resolution.ingredientKey === 'arroz');
  assert.equal(riceResolution?.selectedCandidate, null);
  assert.equal(riceResolution?.candidates[0]?.name, 'Arroz largo');
}

async function testRejectsMalformedNutritionCandidates() {
  const document = createDocument(['Arroz integral']);
  const invalidCandidates: MenuImportIngredientCandidate[] = [
    { ...rice, id: '', name: 'Arroz integral' },
    { ...rice, id: 'negative-kcal', name: 'Arroz integral', kcal_100: -1 },
    { ...rice, id: 'nan-protein', name: 'Arroz integral', protein_g_100: Number.NaN },
    { ...rice, id: 'infinite-carbs', name: 'Arroz integral', carbs_g_100: Number.POSITIVE_INFINITY },
    { ...rice, id: 'blank-name', name: '  ' },
    rice,
  ];

  const resolutions = await resolveMenuImportIngredients(document, async () => invalidCandidates);

  assert.deepEqual(
    resolutions[0]?.candidates.map(candidate => candidate.id),
    [rice.id],
  );
  assert.equal(resolutions[0]?.selectedCandidate?.id, rice.id);
}

async function testUniqueSearchAcrossDaysAndMeals() {
  const document: MenuImportDocument = {
    format: MENU_IMPORT_FORMAT,
    version: MENU_IMPORT_VERSION,
    menu_name: 'Menú repetido',
    days: [
      {
        date: '2026-08-03',
        meals: [
          {
            meal_type: 'breakfast',
            name: 'Desayuno',
            ingredients: [{ name: 'Plátano', quantity_g: 100 }],
          },
          {
            meal_type: 'snack',
            name: 'Tentempié',
            ingredients: [{ name: ' PLATANO ', quantity_g: 80 }],
          },
        ],
      },
      {
        date: '2026-08-04',
        meals: [
          {
            meal_type: 'breakfast',
            name: 'Desayuno siguiente',
            ingredients: [{ name: 'plátano', quantity_g: 120 }],
          },
        ],
      },
    ],
  };
  const searchedNames: string[] = [];

  const resolutions = await resolveMenuImportIngredients(document, async name => {
    searchedNames.push(name);
    return [banana];
  });

  assert.deepEqual(searchedNames, ['platano']);
  assert.equal(resolutions.length, 1);
  assert.equal(resolutions[0]?.selectedCandidate?.id, banana.id);
}

async function testBoundedSearchConcurrency() {
  const ingredientNames = Array.from({ length: 48 }, (_, index) => `Ingrediente ${index}`);
  const document: MenuImportDocument = {
    format: MENU_IMPORT_FORMAT,
    version: MENU_IMPORT_VERSION,
    menu_name: 'Menú amplio',
    days: [
      {
        date: '2026-08-03',
        meals: [
          {
            meal_type: 'lunch',
            name: 'Comida uno',
            ingredients: ingredientNames.slice(0, 24).map(name => ({ name, quantity_g: 50 })),
          },
        ],
      },
      {
        date: '2026-08-04',
        meals: [
          {
            meal_type: 'lunch',
            name: 'Comida dos',
            ingredients: ingredientNames.slice(24).map(name => ({ name, quantity_g: 50 })),
          },
        ],
      },
    ],
  };
  let activeSearches = 0;
  let maximumActiveSearches = 0;

  await resolveMenuImportIngredients(document, async name => {
    activeSearches += 1;
    maximumActiveSearches = Math.max(maximumActiveSearches, activeSearches);
    await new Promise(resolve => setTimeout(resolve, 2));
    activeSearches -= 1;
    return [{ ...rice, id: name, name }];
  });

  assert.ok(maximumActiveSearches > 1);
  assert.ok(maximumActiveSearches <= 4);
}

async function testReportsIngredientProgress() {
  const document = createDocument(['Uno', 'Dos', 'Tres', 'Cuatro', 'Cinco']);
  const progress: Array<{ completed: number; total: number }> = [];

  await resolveMenuImportIngredients(document, async name => [{ ...rice, id: name, name }], {
    onProgress: value => progress.push(value),
  });

  assert.deepEqual(progress[0], { completed: 0, total: 5 });
  assert.equal(progress.at(-1)?.completed, 5);
  assert.equal(progress.at(-1)?.total, 5);
  assert.deepEqual(
    progress.map(value => value.completed),
    [0, 1, 2, 3, 4, 5],
  );
}

async function testNonTrivialMacroRounding() {
  const preciseCandidate: MenuImportIngredientCandidate = {
    id: 'ingredient-precise',
    name: 'Precisión',
    kcal_100: 123,
    protein_g_100: 7.77,
    carbs_g_100: 13.33,
    fat_g_100: 4.44,
  };
  const document = createDocument(['PRECISION'], [37]);
  const resolutions = await resolveMenuImportIngredients(document, async () => [preciseCandidate]);
  const preview = buildMenuImportPreview(document, resolutions, [], calendarSnapshot);

  assert.deepEqual(preview.meals[0]?.ingredients[0]?.macros, {
    kcal: 46,
    protein_g: 2.9,
    carbs_g: 4.9,
    fats_g: 1.6,
  });
  assert.deepEqual(preview.meals[0]?.macros, {
    kcal: 46,
    protein_g: 2.9,
    carbs_g: 4.9,
    fats_g: 1.6,
  });
}

async function testMacrosAndConflictDetection() {
  const document = createDocument(['Arroz integral']);
  const resolutions = await resolveMenuImportIngredients(document, async () => [rice]);
  const preview = buildMenuImportPreview(
    document,
    resolutions,
    [
      {
        id: 'same-slot',
        date: '2026-08-03',
        meal_type: 'lunch',
        name: 'Comida existente',
      },
      {
        id: 'same-date-different-type',
        date: '2026-08-03',
        meal_type: 'dinner',
        name: 'Cena existente',
      },
      {
        id: 'same-type-different-date',
        date: '2026-08-04',
        meal_type: 'lunch',
        name: 'Comida de mañana',
      },
    ],
    calendarSnapshot,
  );

  const meal = preview.meals[0];
  assert.deepEqual(meal?.ingredients[0]?.macros, {
    kcal: 300,
    protein_g: 15,
    carbs_g: 30,
    fats_g: 7.5,
  });
  assert.deepEqual(meal?.macros, {
    kcal: 300,
    protein_g: 15,
    carbs_g: 30,
    fats_g: 7.5,
  });
  assert.deepEqual(
    meal?.conflict?.existingLogs.map(log => log.id),
    ['same-slot'],
  );
  assert.equal(meal?.conflict?.decision, null);
}

async function testReadinessRequiresResolutionAndConflictDecision() {
  const document = createDocument(['Arroz integral']);
  const resolutions = await resolveMenuImportIngredients(document, async () => [
    { ...rice, id: 'manual-rice', name: 'Arroz largo' },
  ]);
  const preview = buildMenuImportPreview(
    document,
    resolutions,
    [
      {
        id: 'same-slot',
        date: '2026-08-03',
        meal_type: 'lunch',
        name: null,
      },
    ],
    calendarSnapshot,
  );

  assert.equal(isMenuImportPreviewReady(preview), false);

  const selected = selectMenuImportIngredient(preview, 'arroz integral', 'manual-rice');
  assert.notEqual(selected, preview);
  assert.notEqual(selected.resolutions, preview.resolutions);
  assert.notEqual(selected.meals, preview.meals);
  assert.equal(preview.resolutions[0]?.selectedCandidate, null);
  assert.equal(preview.meals[0]?.ingredients[0]?.selectedCandidate, null);
  assert.equal(preview.meals[0]?.ingredients[0]?.macros, null);
  assert.equal(selected.resolutions[0]?.selectedCandidate?.id, 'manual-rice');
  assert.deepEqual(selected.meals[0]?.ingredients[0]?.macros, {
    kcal: 300,
    protein_g: 15,
    carbs_g: 30,
    fats_g: 7.5,
  });
  assert.equal(isMenuImportPreviewReady(selected), false);

  const decided = setMenuImportConflictDecision(selected, 'days[0].meals[0]', 'keep_both');
  assert.notEqual(decided, selected);
  assert.notEqual(decided.meals, selected.meals);
  assert.equal(selected.meals[0]?.conflict?.decision, null);
  assert.equal(decided.meals[0]?.conflict?.decision, 'keep_both');
  assert.equal(isMenuImportPreviewReady(decided), true);
}

async function testConflictDecisionAppliesToEveryMealInTheSameSlot() {
  const document = createDocument(['Arroz integral']);
  document.days[0].meals.push({
    meal_type: 'lunch',
    name: 'Segunda comida',
    ingredients: [{ name: 'Arroz integral', quantity_g: 100 }],
  });
  const resolutions = await resolveMenuImportIngredients(document, async () => [rice]);
  const existingLog = {
    id: 'same-slot',
    date: '2026-08-03',
    meal_type: 'lunch' as const,
    name: 'Comida existente',
  };
  const preview = buildMenuImportPreview(document, resolutions, [existingLog], calendarSnapshot);

  const replaced = setMenuImportConflictDecision(preview, preview.meals[0].key, 'replace');
  assert.deepEqual(
    replaced.meals.map(meal => meal.conflict?.decision),
    ['replace', 'replace'],
  );

  const kept = setMenuImportConflictDecision(replaced, replaced.meals[1].key, 'keep_both');
  assert.deepEqual(
    kept.meals.map(meal => meal.conflict?.decision),
    ['keep_both', 'keep_both'],
  );
}

async function testIgnoredMealsDoNotRequireIngredientResolution() {
  const document = createDocument(['Ingrediente ambiguo']);
  document.days[0].meals.push({
    meal_type: 'dinner',
    name: 'Cena resoluble',
    ingredients: [{ name: 'Arroz integral', quantity_g: 100 }],
  });
  const resolutions = await resolveMenuImportIngredients(document, async normalizedName =>
    normalizedName === 'arroz integral'
      ? [rice]
      : [
          { ...rice, id: 'ambiguous-one', name: 'Ingrediente ambiguo uno' },
          { ...rice, id: 'ambiguous-two', name: 'Ingrediente ambiguo dos' },
        ],
  );
  const preview = buildMenuImportPreview(
    document,
    resolutions,
    [
      {
        id: 'same-slot',
        date: '2026-08-03',
        meal_type: 'lunch',
        name: 'Comida existente',
      },
    ],
    calendarSnapshot,
  );

  assert.equal(isMenuImportPreviewReady(preview), false);
  const ignored = setMenuImportConflictDecision(preview, preview.meals[0].key, 'ignore');
  assert.equal(ignored.meals[0].ingredients[0].selectedCandidate, null);
  assert.equal(isMenuImportPreviewReady(ignored), true);
}

async function main() {
  await testUniqueSearchAndExactSelection();
  await testRejectsMalformedNutritionCandidates();
  await testUniqueSearchAcrossDaysAndMeals();
  await testBoundedSearchConcurrency();
  await testReportsIngredientProgress();
  await testNonTrivialMacroRounding();
  await testMacrosAndConflictDetection();
  await testReadinessRequiresResolutionAndConflictDecision();
  await testConflictDecisionAppliesToEveryMealInTheSameSlot();
  await testIgnoredMealsDoNotRequireIngredientResolution();
  console.log('menuImportPlanner: all assertions passed');
}

void main();
