import { MenuImportDocument, MenuImportMealType } from './menuImportContract';

export type MenuImportConflictDecision = 'replace' | 'keep_both' | 'ignore';

export type MenuImportMacros = {
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fats_g: number;
};

export type MenuImportIngredientCandidate = {
  id: string;
  name: string;
  kcal_100: number;
  protein_g_100: number;
  carbs_g_100: number;
  fat_g_100: number;
};

export type MenuImportIngredientResolution = {
  ingredientKey: string;
  sourceName: string;
  candidates: MenuImportIngredientCandidate[];
  selectedCandidate: MenuImportIngredientCandidate | null;
};

export type MenuImportExistingLog = {
  id: string;
  date: string;
  meal_type: MenuImportMealType;
  name: string | null;
};

export type MenuImportCalendarSnapshotRef = {
  token: string;
  dates: string[];
};

export type MenuImportPreviewIngredient = {
  ingredientKey: string;
  name: string;
  quantity_g: number;
  selectedCandidate: MenuImportIngredientCandidate | null;
  macros: MenuImportMacros | null;
};

export type MenuImportMealConflict = {
  existingLogs: MenuImportExistingLog[];
  decision: MenuImportConflictDecision | null;
};

export type MenuImportPreviewMeal = {
  key: string;
  date: string;
  meal_type: MenuImportMealType;
  name: string;
  ingredients: MenuImportPreviewIngredient[];
  macros: MenuImportMacros;
  conflict: MenuImportMealConflict | null;
};

export type MenuImportPreview = {
  menuName: string;
  calendarSnapshot: MenuImportCalendarSnapshotRef;
  resolutions: MenuImportIngredientResolution[];
  meals: MenuImportPreviewMeal[];
};

const MAX_CANDIDATES = 5;
const SEARCH_CONCURRENCY = 4;

const EMPTY_MACROS: MenuImportMacros = {
  kcal: 0,
  protein_g: 0,
  carbs_g: 0,
  fats_g: 0,
};

const normalizeIngredientName = (name: string): string =>
  name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

const getMealSlotKey = (date: string, mealType: MenuImportMealType): string => `${date}:${mealType}`;

const getUniqueIngredientNames = (document: MenuImportDocument): Map<string, string> => {
  const names = new Map<string, string>();

  for (const day of document.days) {
    for (const meal of day.meals) {
      for (const ingredient of meal.ingredients) {
        const ingredientKey = normalizeIngredientName(ingredient.name);
        if (!names.has(ingredientKey)) {
          names.set(ingredientKey, ingredient.name);
        }
      }
    }
  }

  return names;
};

const isValidCandidate = (candidate: MenuImportIngredientCandidate): boolean => {
  const nutrients = [candidate.kcal_100, candidate.protein_g_100, candidate.carbs_g_100, candidate.fat_g_100];

  return (
    candidate.id.trim().length > 0 &&
    candidate.id.length <= 200 &&
    candidate.name.trim().length > 0 &&
    candidate.name.length <= 160 &&
    nutrients.every(value => Number.isFinite(value) && value >= 0)
  );
};

const prepareCandidates = (
  candidates: MenuImportIngredientCandidate[],
  ingredientKey: string,
): MenuImportIngredientCandidate[] => {
  const validCandidates = candidates.filter(isValidCandidate);
  const exactCandidate = validCandidates.find(candidate => normalizeIngredientName(candidate.name) === ingredientKey);
  const orderedCandidates = exactCandidate ? [exactCandidate, ...validCandidates] : validCandidates;
  const candidateIds = new Set<string>();
  const uniqueCandidates: MenuImportIngredientCandidate[] = [];

  for (const candidate of orderedCandidates) {
    if (!candidateIds.has(candidate.id)) {
      candidateIds.add(candidate.id);
      uniqueCandidates.push(candidate);
    }
    if (uniqueCandidates.length === MAX_CANDIDATES) {
      break;
    }
  }

  return uniqueCandidates;
};

export async function resolveMenuImportIngredients(
  document: MenuImportDocument,
  search: (name: string) => Promise<MenuImportIngredientCandidate[]>,
): Promise<MenuImportIngredientResolution[]> {
  const ingredientNames = Array.from(getUniqueIngredientNames(document).entries());
  let resolutions: MenuImportIngredientResolution[] = [];

  for (let index = 0; index < ingredientNames.length; index += SEARCH_CONCURRENCY) {
    const batch = ingredientNames.slice(index, index + SEARCH_CONCURRENCY);
    const batchResolutions = await Promise.all(
      batch.map(async ([ingredientKey, sourceName]) => {
        const searchResults = await search(ingredientKey);
        const candidates = prepareCandidates(searchResults, ingredientKey);
        const selectedCandidate =
          candidates.find(candidate => normalizeIngredientName(candidate.name) === ingredientKey) ?? null;

        return {
          ingredientKey,
          sourceName,
          candidates,
          selectedCandidate,
        };
      }),
    );
    resolutions = [...resolutions, ...batchResolutions];
  }

  return resolutions;
}

const roundToOneDecimal = (value: number): number => Math.round(value * 10) / 10;

const calculateIngredientMacros = (
  candidate: MenuImportIngredientCandidate,
  quantityInGrams: number,
): MenuImportMacros => {
  const quantityFactor = quantityInGrams / 100;

  return {
    kcal: Math.round(candidate.kcal_100 * quantityFactor),
    protein_g: roundToOneDecimal(candidate.protein_g_100 * quantityFactor),
    carbs_g: roundToOneDecimal(candidate.carbs_g_100 * quantityFactor),
    fats_g: roundToOneDecimal(candidate.fat_g_100 * quantityFactor),
  };
};

const calculateMealMacros = (ingredients: MenuImportPreviewIngredient[]): MenuImportMacros =>
  ingredients.reduce<MenuImportMacros>(
    (totals, ingredient) => ({
      kcal: totals.kcal + (ingredient.macros?.kcal ?? 0),
      protein_g: roundToOneDecimal(totals.protein_g + (ingredient.macros?.protein_g ?? 0)),
      carbs_g: roundToOneDecimal(totals.carbs_g + (ingredient.macros?.carbs_g ?? 0)),
      fats_g: roundToOneDecimal(totals.fats_g + (ingredient.macros?.fats_g ?? 0)),
    }),
    EMPTY_MACROS,
  );

const buildPreviewIngredient = (
  name: string,
  quantityInGrams: number,
  resolution: MenuImportIngredientResolution | undefined,
): MenuImportPreviewIngredient => {
  const selectedCandidate = resolution?.selectedCandidate ?? null;

  return {
    ingredientKey: normalizeIngredientName(name),
    name,
    quantity_g: quantityInGrams,
    selectedCandidate,
    macros: selectedCandidate === null ? null : calculateIngredientMacros(selectedCandidate, quantityInGrams),
  };
};

export function buildMenuImportPreview(
  document: MenuImportDocument,
  resolutions: MenuImportIngredientResolution[],
  existingLogs: MenuImportExistingLog[],
  calendarSnapshot: MenuImportCalendarSnapshotRef,
): MenuImportPreview {
  const resolutionsByKey = new Map(resolutions.map(resolution => [resolution.ingredientKey, resolution]));
  const meals: MenuImportPreviewMeal[] = [];

  document.days.forEach((day, dayIndex) => {
    day.meals.forEach((meal, mealIndex) => {
      const ingredients = meal.ingredients.map(ingredient => {
        const ingredientKey = normalizeIngredientName(ingredient.name);
        return buildPreviewIngredient(ingredient.name, ingredient.quantity_g, resolutionsByKey.get(ingredientKey));
      });
      const conflictingLogs = existingLogs.filter(
        existingLog => existingLog.date === day.date && existingLog.meal_type === meal.meal_type,
      );

      meals.push({
        key: `days[${dayIndex}].meals[${mealIndex}]`,
        date: day.date,
        meal_type: meal.meal_type,
        name: meal.name,
        ingredients,
        macros: calculateMealMacros(ingredients),
        conflict: conflictingLogs.length > 0 ? { existingLogs: conflictingLogs, decision: null } : null,
      });
    });
  });

  return {
    menuName: document.menu_name,
    calendarSnapshot,
    resolutions,
    meals,
  };
}

export function selectMenuImportIngredient(
  preview: MenuImportPreview,
  ingredientKey: string,
  ingredientId: string,
): MenuImportPreview {
  const normalizedIngredientKey = normalizeIngredientName(ingredientKey);
  const resolution = preview.resolutions.find(item => item.ingredientKey === normalizedIngredientKey);
  const selectedCandidate = resolution?.candidates.find(candidate => candidate.id === ingredientId);

  if (!resolution || !selectedCandidate) {
    return preview;
  }

  const resolutions = preview.resolutions.map(item =>
    item.ingredientKey === normalizedIngredientKey ? { ...item, selectedCandidate } : item,
  );
  const meals = preview.meals.map(meal => {
    const ingredients = meal.ingredients.map(ingredient =>
      ingredient.ingredientKey === normalizedIngredientKey
        ? {
            ...ingredient,
            selectedCandidate,
            macros: calculateIngredientMacros(selectedCandidate, ingredient.quantity_g),
          }
        : ingredient,
    );

    return {
      ...meal,
      ingredients,
      macros: calculateMealMacros(ingredients),
    };
  });

  return {
    ...preview,
    resolutions,
    meals,
  };
}

export function setMenuImportConflictDecision(
  preview: MenuImportPreview,
  mealKey: string,
  decision: MenuImportConflictDecision,
): MenuImportPreview {
  const selectedMeal = preview.meals.find(meal => meal.key === mealKey && meal.conflict !== null);
  if (!selectedMeal) {
    return preview;
  }
  const selectedSlotKey = getMealSlotKey(selectedMeal.date, selectedMeal.meal_type);
  const meals = preview.meals.map(meal =>
    meal.conflict !== null && getMealSlotKey(meal.date, meal.meal_type) === selectedSlotKey
      ? {
          ...meal,
          conflict: {
            ...meal.conflict,
            decision,
          },
        }
      : meal,
  );

  return {
    ...preview,
    meals,
  };
}

export function isMenuImportPreviewReady(preview: MenuImportPreview): boolean {
  const everyIngredientIsResolved = preview.meals.every(meal =>
    meal.ingredients.every(ingredient => ingredient.selectedCandidate !== null),
  );
  const everyConflictHasDecision = preview.meals.every(
    meal => meal.conflict === null || meal.conflict.decision !== null,
  );

  return everyIngredientIsResolved && everyConflictHasDecision;
}
