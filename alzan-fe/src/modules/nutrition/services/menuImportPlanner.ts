import { MenuImportDocument, MenuImportMealType, MenuImportMealTypeInput } from './menuImportContract';

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
  meal_type: MenuImportMealTypeInput;
  name: string;
  ingredients: MenuImportPreviewIngredient[];
  macros: MenuImportMacros;
  conflict: MenuImportMealConflict | null;
};

export type MenuImportPreview = {
  menuName: string;
  calendarSnapshot: MenuImportCalendarSnapshotRef;
  existingLogs: MenuImportExistingLog[];
  resolutions: MenuImportIngredientResolution[];
  meals: MenuImportPreviewMeal[];
};

export type MenuImportIngredientProgress = {
  completed: number;
  total: number;
};

export type ResolveMenuImportIngredientsOptions = {
  onProgress?: (progress: MenuImportIngredientProgress) => void;
};

const MAX_CANDIDATES = 5;
const SEARCH_CONCURRENCY = 4;
const MIN_SAFE_VARIANT_SCORE_MARGIN = 200;

const EMPTY_MACROS: MenuImportMacros = {
  kcal: 0,
  protein_g: 0,
  carbs_g: 0,
  fats_g: 0,
};

const SEARCH_STOP_WORDS = new Set(['de', 'del', 'la', 'las', 'el', 'los', 'y', 'e', 'en', 'con', 'por', 'para']);
const INGREDIENT_TOKEN_ALIASES: Record<string, string> = {
  baja: 'bajo',
  bajas: 'bajo',
  bajo: 'bajo',
  bajos: 'bajo',
  reducida: 'bajo',
  reducidas: 'bajo',
  reducido: 'bajo',
  reducidos: 'bajo',
  encurtido: 'vinagre',
  encurtida: 'vinagre',
  copo: 'cereal',
};
const SAL_REDUCTION_TOKENS = new Set([
  'baja',
  'bajo',
  'bajas',
  'bajos',
  'reducida',
  'reducidas',
  'reducido',
  'reducidos',
]);
const NON_DISCRIMINATING_VARIANT_TOKENS = new Set([
  'alto',
  'alta',
  'botella',
  'botellas',
  'carne',
  'gallina',
  'hsn',
  'lata',
  'latas',
  'liquida',
  'liquido',
  'pack',
  'packs',
  'pasteurizada',
  'pasteurizado',
  'mesh',
  'unidad',
  'unidades',
]);
const PACKAGING_OR_TECHNICAL_TOKENS = new Set([
  'botella',
  'botellas',
  'hsn',
  'lata',
  'latas',
  'mesh',
  'pack',
  'packs',
  'unidad',
  'unidades',
]);

const normalizeIngredientName = (name: string): string =>
  name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const tokenizeIngredientName = (name: string): string[] => {
  const stemmedTokens = normalizeIngredientName(name)
    .split(' ')
    .filter(Boolean)
    .map(token => {
      if (token.length > 4 && token.endsWith('es')) return token.slice(0, -2);
      if (token.length > 3 && token.endsWith('s')) return token.slice(0, -1);
      return token;
    });
  const hasSaltReductionQualifier = stemmedTokens.some(token => SAL_REDUCTION_TOKENS.has(token));
  const tokens = stemmedTokens.map(token => {
    if (token === 'sal' && hasSaltReductionQualifier) return 'sodio';
    return INGREDIENT_TOKEN_ALIASES[token] ?? token;
  });
  const meaningfulTokens = tokens.filter(token => !SEARCH_STOP_WORDS.has(token));
  return Array.from(new Set(meaningfulTokens.length > 0 ? meaningfulTokens : tokens));
};

const getIngredientCandidateScore = (query: string, candidateName: string): number => {
  const normalizedQuery = normalizeIngredientName(query);
  const normalizedCandidate = normalizeIngredientName(candidateName);
  const queryTokens = tokenizeIngredientName(query);
  const candidateTokens = tokenizeIngredientName(candidateName);
  let score = 0;

  if (normalizedCandidate === normalizedQuery) score += 1200;
  if (normalizedCandidate.startsWith(normalizedQuery)) score += 700;
  if (normalizedCandidate.includes(normalizedQuery)) score += 520;

  const matchingTokens = queryTokens.filter(queryToken =>
    candidateTokens.some(
      candidateToken =>
        candidateToken === queryToken || candidateToken.includes(queryToken) || queryToken.includes(candidateToken),
    ),
  ).length;
  if (matchingTokens === queryTokens.length && queryTokens.length > 0) score += 640;
  score += matchingTokens * 140;
  score -= Math.max(0, candidateTokens.length - queryTokens.length) * 20;

  return score;
};

const getMealSlotKey = (date: string, mealType: MenuImportMealTypeInput): string => `${date}:${mealType}`;

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
  const orderedCandidates = [...validCandidates].sort((first, second) => {
    const scoreDifference =
      getIngredientCandidateScore(ingredientKey, second.name) - getIngredientCandidateScore(ingredientKey, first.name);
    if (scoreDifference !== 0) return scoreDifference;

    return normalizeIngredientName(first.name).localeCompare(normalizeIngredientName(second.name));
  });
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

const hasEquivalentMeaningfulTokens = (first: string, second: string): boolean => {
  const firstTokens = tokenizeIngredientName(first);
  const secondTokens = tokenizeIngredientName(second);

  return (
    firstTokens.length > 0 &&
    firstTokens.length === secondTokens.length &&
    firstTokens.every(token => secondTokens.includes(token))
  );
};

const getExtraTokens = (container: string[], contained: string[]): string[] | null => {
  let containedIndex = 0;
  const extraTokens: string[] = [];

  for (const token of container) {
    if (token === contained[containedIndex]) {
      containedIndex += 1;
    } else {
      extraTokens.push(token);
    }
  }

  return containedIndex === contained.length ? extraTokens : null;
};

const isSafeAdditionalToken = (token: string, contextTokens: string[]): boolean =>
  NON_DISCRIMINATING_VARIANT_TOKENS.has(token) ||
  (/^\d+$/.test(token) && contextTokens.some(contextToken => PACKAGING_OR_TECHNICAL_TOKENS.has(contextToken)));

const areSafeVariantTokens = (extras: string[], sourceTokens: string[], candidateTokens: string[]): boolean => {
  const contextTokens = [...new Set([...sourceTokens, ...candidateTokens])];
  if (extras.every(token => isSafeAdditionalToken(token, contextTokens))) return true;

  const isCornCereal = sourceTokens.includes('cereal') && sourceTokens.includes('maiz');
  const isNoFillingQualifier = extras.includes('sin') && extras.includes('relleno');
  return isCornCereal && isNoFillingQualifier && extras.every(token => token === 'sin' || token === 'relleno');
};

const isSafeVariantMatch = (sourceName: string, candidateName: string): boolean => {
  const sourceTokens = tokenizeIngredientName(sourceName);
  const candidateTokens = tokenizeIngredientName(candidateName);
  if (sourceTokens.length < 2 || candidateTokens.length < 2) return false;

  const candidateExtras = getExtraTokens(candidateTokens, sourceTokens);
  if (candidateExtras !== null && areSafeVariantTokens(candidateExtras, sourceTokens, candidateTokens)) {
    return true;
  }

  const sourceExtras = getExtraTokens(sourceTokens, candidateTokens);
  return sourceExtras !== null && areSafeVariantTokens(sourceExtras, sourceTokens, candidateTokens);
};

const matchesEverySourceToken = (sourceName: string, candidateName: string): boolean => {
  const sourceTokens = tokenizeIngredientName(sourceName);
  const candidateTokens = tokenizeIngredientName(candidateName);
  return sourceTokens.length >= 2 && getExtraTokens(candidateTokens, sourceTokens) !== null;
};

const selectBestSafeVariant = (
  ingredientKey: string,
  safeVariants: MenuImportIngredientCandidate[],
): MenuImportIngredientCandidate | null => {
  const sourceTokens = tokenizeIngredientName(ingredientKey);
  const candidatesPreservingSource = safeVariants.filter(
    candidate => getExtraTokens(tokenizeIngredientName(candidate.name), sourceTokens) !== null,
  );

  if (candidatesPreservingSource.length === 1) return candidatesPreservingSource[0] ?? null;
  if (candidatesPreservingSource.length === 0) {
    return safeVariants.length === 1 ? (safeVariants[0] ?? null) : null;
  }

  const rankedCandidates = [...candidatesPreservingSource].sort(
    (first, second) =>
      getIngredientCandidateScore(ingredientKey, second.name) - getIngredientCandidateScore(ingredientKey, first.name),
  );
  const bestCandidate = rankedCandidates[0];
  const secondCandidate = rankedCandidates[1];
  if (!bestCandidate || !secondCandidate) return null;

  const scoreMargin =
    getIngredientCandidateScore(ingredientKey, bestCandidate.name) -
    getIngredientCandidateScore(ingredientKey, secondCandidate.name);
  return scoreMargin >= MIN_SAFE_VARIANT_SCORE_MARGIN ? bestCandidate : null;
};

const selectSafeCandidate = (
  ingredientKey: string,
  candidates: MenuImportIngredientCandidate[],
): MenuImportIngredientCandidate | null => {
  const exactCandidates = candidates.filter(candidate => normalizeIngredientName(candidate.name) === ingredientKey);
  if (exactCandidates.length === 1) return exactCandidates[0] ?? null;
  if (exactCandidates.length > 1) return null;

  const equivalentCandidates = candidates.filter(candidate =>
    hasEquivalentMeaningfulTokens(ingredientKey, candidate.name),
  );
  if (equivalentCandidates.length === 1) return equivalentCandidates[0] ?? null;
  if (equivalentCandidates.length > 1) return null;

  const safeVariants = candidates.filter(candidate => isSafeVariantMatch(ingredientKey, candidate.name));
  const selectedVariant = selectBestSafeVariant(ingredientKey, safeVariants);
  if (!selectedVariant) return null;

  const hasMeaningfulCompetingVariant = candidates.some(
    candidate =>
      candidate.id !== selectedVariant.id &&
      matchesEverySourceToken(ingredientKey, candidate.name) &&
      !isSafeVariantMatch(ingredientKey, candidate.name),
  );
  return hasMeaningfulCompetingVariant ? null : selectedVariant;
};

export async function resolveMenuImportIngredients(
  document: MenuImportDocument,
  search: (name: string) => Promise<MenuImportIngredientCandidate[]>,
  options: ResolveMenuImportIngredientsOptions = {},
): Promise<MenuImportIngredientResolution[]> {
  const ingredientNames = Array.from(getUniqueIngredientNames(document).entries());
  let completed = 0;
  options.onProgress?.({ completed, total: ingredientNames.length });
  let resolutions: MenuImportIngredientResolution[] = [];

  for (let index = 0; index < ingredientNames.length; index += SEARCH_CONCURRENCY) {
    const batch = ingredientNames.slice(index, index + SEARCH_CONCURRENCY);
    const batchResolutions = await Promise.all(
      batch.map(async ([ingredientKey, sourceName]) => {
        try {
          const searchResults = await search(ingredientKey);
          const candidates = prepareCandidates(searchResults, ingredientKey);
          const selectedCandidate = selectSafeCandidate(ingredientKey, candidates);

          return {
            ingredientKey,
            sourceName,
            candidates,
            selectedCandidate,
          };
        } finally {
          completed += 1;
          options.onProgress?.({ completed, total: ingredientNames.length });
        }
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
      const conflictingLogs =
        meal.meal_type === 'unspecified'
          ? []
          : existingLogs.filter(
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
    existingLogs,
    resolutions,
    meals,
  };
}

export function setMenuImportMealType(
  preview: MenuImportPreview,
  mealKey: string,
  mealType: MenuImportMealType,
): MenuImportPreview {
  const selectedMeal = preview.meals.find(meal => meal.key === mealKey);
  if (!selectedMeal) return preview;

  const conflictingLogs = preview.existingLogs.filter(
    existingLog => existingLog.date === selectedMeal.date && existingLog.meal_type === mealType,
  );
  const meals = preview.meals.map(meal =>
    meal.key === mealKey
      ? {
          ...meal,
          meal_type: mealType,
          conflict: conflictingLogs.length > 0 ? { existingLogs: conflictingLogs, decision: null } : null,
        }
      : meal,
  );

  return { ...preview, meals };
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

export function updateMenuImportIngredientCandidates(
  preview: MenuImportPreview,
  ingredientKey: string,
  candidates: MenuImportIngredientCandidate[],
): MenuImportPreview {
  const normalizedIngredientKey = normalizeIngredientName(ingredientKey);
  const resolution = preview.resolutions.find(item => item.ingredientKey === normalizedIngredientKey);
  if (!resolution) return preview;

  const preparedCandidates = prepareCandidates(candidates, normalizedIngredientKey);
  const resolutions = preview.resolutions.map(item =>
    item.ingredientKey === normalizedIngredientKey
      ? { ...item, candidates: preparedCandidates, selectedCandidate: null }
      : item,
  );
  const meals = preview.meals.map(meal => {
    const ingredients = meal.ingredients.map(ingredient =>
      ingredient.ingredientKey === normalizedIngredientKey
        ? { ...ingredient, selectedCandidate: null, macros: null }
        : ingredient,
    );

    return {
      ...meal,
      ingredients,
      macros: calculateMealMacros(ingredients),
    };
  });

  return { ...preview, resolutions, meals };
}

export function removeMenuImportIngredient(
  preview: MenuImportPreview,
  mealKey: string,
  ingredientIndex: number,
): MenuImportPreview {
  const selectedMeal = preview.meals.find(meal => meal.key === mealKey);
  if (!selectedMeal || ingredientIndex < 0 || ingredientIndex >= selectedMeal.ingredients.length) {
    return preview;
  }

  const meals = preview.meals.map(meal => {
    if (meal.key !== mealKey) return meal;

    const ingredients = meal.ingredients.filter((_, index) => index !== ingredientIndex);
    return {
      ...meal,
      ingredients,
      macros: calculateMealMacros(ingredients),
    };
  });
  const remainingIngredientKeys = new Set(
    meals.flatMap(meal => meal.ingredients.map(ingredient => ingredient.ingredientKey)),
  );
  const resolutions = preview.resolutions.filter(resolution => remainingIngredientKeys.has(resolution.ingredientKey));

  return { ...preview, resolutions, meals };
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
  const everyMealTypeIsResolved = preview.meals.every(meal => meal.meal_type !== 'unspecified');
  const everyIngredientIsResolved = preview.meals.every(meal =>
    meal.conflict?.decision === 'ignore'
      ? true
      : meal.ingredients.every(ingredient => ingredient.selectedCandidate !== null),
  );
  const everyConflictHasDecision = preview.meals.every(
    meal => meal.conflict === null || meal.conflict.decision !== null,
  );

  return everyMealTypeIsResolved && everyIngredientIsResolved && everyConflictHasDecision;
}
