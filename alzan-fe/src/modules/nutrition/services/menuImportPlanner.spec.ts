import assert from 'node:assert/strict';
import { MENU_IMPORT_FORMAT, MENU_IMPORT_VERSION, MenuImportDocument } from './menuImportContract';
import {
  buildMenuImportPreview,
  isMenuImportPreviewReady,
  removeMenuImportIngredient,
  MenuImportIngredientCandidate,
  resolveMenuImportIngredients,
  selectMenuImportIngredient,
  updateMenuImportIngredientCandidates,
  setMenuImportConflictDecision,
  setMenuImportMealType,
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

async function testSelectsSafeSingularPluralMatchesButLeavesVariantsUnresolved() {
  const document = createDocument(['Huevo', 'Fartón', 'Galletas Digestive']);
  const egg = { ...banana, id: 'ingredient-eggs', name: 'Huevos' };
  const fartons = { ...banana, id: 'ingredient-fartons', name: 'Fartons' };
  const digestive = [
    { ...banana, id: 'ingredient-digestive-brand', name: 'Galletas Digestive Hacendado' },
    { ...banana, id: 'ingredient-digestive-chocolate', name: 'Galletas Digestive con Chocolate' },
  ];

  const resolutions = await resolveMenuImportIngredients(document, async name => {
    if (name === 'huevo') return [egg, { ...egg, id: 'ingredient-fried-egg', name: 'Huevo frito' }];
    if (name === 'farton') return [fartons];
    return digestive;
  });

  assert.equal(resolutions.find(item => item.ingredientKey === 'huevo')?.selectedCandidate?.id, egg.id);
  assert.equal(resolutions.find(item => item.ingredientKey === 'farton')?.selectedCandidate?.id, fartons.id);
  assert.equal(resolutions.find(item => item.ingredientKey === 'galletas digestive')?.selectedCandidate, null);
  assert.deepEqual(
    new Set(resolutions.find(item => item.ingredientKey === 'galletas digestive')?.candidates.map(item => item.id)),
    new Set(digestive.map(item => item.id)),
  );
}

async function testSelectsClearCatalogVariantsAndSemanticEquivalents() {
  const document = createDocument([
    'Clara de huevo pasteurizada',
    'Atún al natural',
    'Salsa de soja reducida en sal',
    'Fiambre de pavo alto en carne',
  ]);
  const resolutions = await resolveMenuImportIngredients(document, async name => {
    if (name === 'clara de huevo pasteurizada') {
      return [
        { ...banana, id: 'egg-white', name: 'Clara de huevo líquida pasteurizada' },
        { ...banana, id: 'plain-egg-white', name: 'Clara de huevo' },
        { ...banana, id: 'powdered-egg-white', name: 'Clara de huevo en polvo' },
      ];
    }
    if (name === 'atun al natural') {
      return [
        { ...banana, id: 'tuna-pack', name: 'Atún al natural (Pack 6)' },
        { ...banana, id: 'tuna-can', name: 'Atún en lata al natural' },
      ];
    }
    if (name === 'salsa de soja reducida en sal') {
      return [
        { ...banana, id: 'soy-sauce', name: 'Salsa de soja' },
        { ...banana, id: 'low-sodium-soy-sauce', name: 'Salsa de soja baja en sodio' },
      ];
    }
    return [
      { ...banana, id: 'mixed-poultry', name: 'Carne picada de pollo y pavo' },
      { ...banana, id: 'turkey-cold-cut', name: 'Fiambre de pavo' },
    ];
  });

  assert.equal(
    resolutions.find(item => item.ingredientKey === 'clara de huevo pasteurizada')?.selectedCandidate?.id,
    'egg-white',
  );
  assert.equal(resolutions.find(item => item.ingredientKey === 'atun al natural')?.selectedCandidate?.id, 'tuna-pack');
  assert.equal(
    resolutions.find(item => item.ingredientKey === 'salsa de soja reducida en sal')?.selectedCandidate?.id,
    'low-sodium-soy-sauce',
  );
  assert.equal(
    resolutions.find(item => item.ingredientKey === 'fiambre de pavo alto en carne')?.selectedCandidate?.id,
    'turkey-cold-cut',
  );
}

async function testDoesNotAutoSelectNutritionallyMeaningfulVariants() {
  const document = createDocument(['Arroz integral']);
  const resolutions = await resolveMenuImportIngredients(document, async () => [
    { ...rice, id: 'brown-rice', name: 'Arroz integral cocido' },
    { ...rice, id: 'long-rice', name: 'Arroz largo' },
  ]);

  assert.equal(resolutions[0]?.selectedCandidate, null);
}

async function testResolvesEquivalentCornCerealTerminology() {
  const document = createDocument(['Cereales de maíz sin relleno']);
  const resolutions = await resolveMenuImportIngredients(document, async () => [
    { ...banana, id: 'corn-flakes', name: 'Copos de Maíz (Cereales)' },
    { ...banana, id: 'filled-cereal', name: 'Cereales rellenos de Leche' },
  ]);

  assert.equal(resolutions[0]?.selectedCandidate?.id, 'corn-flakes');
}

async function testLeavesSafeVariantUnresolvedWhenACompetingVariantIsMeaningful() {
  const document = createDocument(['Atún al natural']);
  const resolutions = await resolveMenuImportIngredients(document, async () => [
    { ...banana, id: 'tuna-pack', name: 'Atún al natural (Pack 6)' },
    { ...banana, id: 'tuna-oil', name: 'Atún al natural en aceite' },
  ]);

  assert.equal(resolutions[0]?.selectedCandidate, null);
}

async function testResolvesCommonPreparationAndProductQualifiers() {
  const document = createDocument(['Pepinillos encurtidos', 'HSN creatina monohidrato 200 mesh']);
  const resolutions = await resolveMenuImportIngredients(document, async name => {
    if (name === 'pepinillos encurtidos') {
      return [
        { ...banana, id: 'pickles', name: 'Pepinillos' },
        { ...banana, id: 'pickles-vinegar', name: 'Pepinillos en vinagre' },
      ];
    }
    return [{ ...banana, id: 'creatine', name: 'Creatina monohidrato' }];
  });

  assert.equal(
    resolutions.find(item => item.ingredientKey === 'pepinillos encurtidos')?.selectedCandidate?.id,
    'pickles-vinegar',
  );
  assert.equal(
    resolutions.find(item => item.ingredientKey === 'hsn creatina monohidrato 200 mesh')?.selectedCandidate?.id,
    'creatine',
  );
}

async function testDoesNotConfuseSaltWithSodiumWithoutAReductionQualifier() {
  const document = createDocument(['Sal']);
  const resolutions = await resolveMenuImportIngredients(document, async () => [
    { ...banana, id: 'sodium', name: 'Sodio' },
  ]);

  assert.equal(resolutions[0]?.selectedCandidate, null);
}

async function testDoesNotDropNutritionallyMeaningfulNumericQualifiers() {
  const document = createDocument(['Queso fresco batido 0%']);
  const resolutions = await resolveMenuImportIngredients(document, async () => [
    { ...banana, id: 'plain-whipped-cheese', name: 'Queso fresco batido' },
  ]);

  assert.equal(resolutions[0]?.selectedCandidate, null);
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

async function testUnspecifiedMealRequiresSelectionAndRecalculatesConflict() {
  const document = createDocument(['Arroz integral']);
  document.days[0].meals[0].meal_type = 'unspecified';
  const resolutions = await resolveMenuImportIngredients(document, async () => [rice]);
  const existingDinner = {
    id: 'existing-dinner',
    date: '2026-08-03',
    meal_type: 'dinner' as const,
    name: 'Cena existente',
  };
  const preview = buildMenuImportPreview(document, resolutions, [existingDinner], calendarSnapshot);

  assert.equal(preview.meals[0].meal_type, 'unspecified');
  assert.equal(preview.meals[0].conflict, null);
  assert.equal(isMenuImportPreviewReady(preview), false);

  const selected = setMenuImportMealType(preview, preview.meals[0].key, 'dinner');
  assert.equal(selected.meals[0].meal_type, 'dinner');
  assert.deepEqual(
    selected.meals[0].conflict?.existingLogs.map(log => log.id),
    ['existing-dinner'],
  );
  assert.equal(selected.meals[0].conflict?.decision, null);
  assert.equal(isMenuImportPreviewReady(selected), false);

  const decided = setMenuImportConflictDecision(selected, selected.meals[0].key, 'keep_both');
  assert.equal(isMenuImportPreviewReady(decided), true);
}

async function testUpdatesCandidatesAndRemovesOnlyOneIngredientOccurrence() {
  const document = createDocument(['Ingrediente ambiguo', 'Arroz integral']);
  document.days.push({
    date: '2026-08-04',
    meals: [
      {
        meal_type: 'dinner',
        name: 'Cena',
        ingredients: [{ name: 'Ingrediente ambiguo', quantity_g: 100 }],
      },
    ],
  });
  const resolutions = await resolveMenuImportIngredients(document, async name =>
    name === 'arroz integral' ? [rice] : [],
  );
  const preview = buildMenuImportPreview(document, resolutions, [], {
    token: 'snapshot-token',
    dates: ['2026-08-03', '2026-08-04'],
  });
  const replacement = { ...banana, id: 'ingredient-replacement', name: 'Ingrediente elegido' };
  const searched = updateMenuImportIngredientCandidates(preview, 'ingrediente ambiguo', [replacement]);

  assert.equal(
    searched.resolutions.find(item => item.ingredientKey === 'ingrediente ambiguo')?.selectedCandidate,
    null,
  );
  assert.deepEqual(searched.resolutions.find(item => item.ingredientKey === 'ingrediente ambiguo')?.candidates, [
    replacement,
  ]);

  const selected = selectMenuImportIngredient(searched, 'ingrediente ambiguo', replacement.id);
  const removed = removeMenuImportIngredient(selected, selected.meals[0]!.key, 0);

  assert.equal(removed.meals[0]?.ingredients.length, 1);
  assert.equal(removed.meals[0]?.ingredients[0]?.name, 'Arroz integral');
  assert.equal(removed.meals[1]?.ingredients.length, 1);
  assert.equal(removed.meals[1]?.ingredients[0]?.selectedCandidate?.id, replacement.id);
  assert.equal(removed.meals[1]?.macros.kcal, 100);
}

async function main() {
  await testUniqueSearchAndExactSelection();
  await testSelectsSafeSingularPluralMatchesButLeavesVariantsUnresolved();
  await testSelectsClearCatalogVariantsAndSemanticEquivalents();
  await testDoesNotAutoSelectNutritionallyMeaningfulVariants();
  await testResolvesEquivalentCornCerealTerminology();
  await testLeavesSafeVariantUnresolvedWhenACompetingVariantIsMeaningful();
  await testResolvesCommonPreparationAndProductQualifiers();
  await testDoesNotConfuseSaltWithSodiumWithoutAReductionQualifier();
  await testDoesNotDropNutritionallyMeaningfulNumericQualifiers();
  await testRejectsMalformedNutritionCandidates();
  await testUniqueSearchAcrossDaysAndMeals();
  await testBoundedSearchConcurrency();
  await testReportsIngredientProgress();
  await testNonTrivialMacroRounding();
  await testMacrosAndConflictDetection();
  await testReadinessRequiresResolutionAndConflictDecision();
  await testConflictDecisionAppliesToEveryMealInTheSameSlot();
  await testIgnoredMealsDoNotRequireIngredientResolution();
  await testUnspecifiedMealRequiresSelectionAndRecalculatesConflict();
  await testUpdatesCandidatesAndRemovesOnlyOneIngredientOccurrence();
  console.log('menuImportPlanner: all assertions passed');
}

void main();
