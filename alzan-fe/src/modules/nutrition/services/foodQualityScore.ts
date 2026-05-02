import { IngredientsCategory } from '../../../types/requests.types';

export const FOOD_QUALITY_SCORE_VERSION = 'food_quality_v2_balanced';

export type FoodCategory = IngredientsCategory;

export type IngredientMacros = {
  energyKcal?: number;
  protein_g?: number;
  carbs_g?: number;
  fat_g?: number;
};

export type IngredientInput = {
  category: FoodCategory;
  weight_g: number;
  macros?: IngredientMacros;
};

export type TotalMacros = {
  energyKcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
};

export type FoodScoreInput = {
  ingredients: IngredientInput[];
  totalMacros: TotalMacros;
};

export type FoodScoreGrade = 'A' | 'B' | 'C' | 'D' | 'E';

type CategoryShare = {
  category: FoodCategory;
  weight_g: number;
  share: number;
};

type NormalizedIngredient = {
  category: FoodCategory;
  weight_g: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  energyKcal: number;
};

type NormalizedIngredientMacrosResult = {
  available: boolean;
  rescaled: boolean;
  items: NormalizedIngredient[];
};

export type FoodScoreBreakdown = {
  ingredientQualityScore: number;
  macroProfileScore: number;
  macroSourceQualityScore: number;
  processingScore: number;
};

export type FoodScoreDebug = {
  positiveShare: number;
  negativeShare: number;
  strongNegativeShare: number;
  negativeEnergyShare: number | null;
  macroDensityFactor: number;
  rescaledIngredientMacros: boolean;
};

export type FoodScoreResult = {
  score: number;
  score01: number;
  grade: FoodScoreGrade;
  version: string;
  breakdown: FoodScoreBreakdown;
  debug: FoodScoreDebug;
};

const CATEGORY_QUALITY: Record<FoodCategory, number> = {
  proteina_animal: 70,
  proteina_vegetal: 90,
  cereal: 62,
  tuberculo: 70,
  legumbre: 96,
  verdura: 100,
  fruta: 90,
  lacteo: 65,
  grasa: 58,
  fruto_seco: 85,
  semilla: 82,
  bebida: 30,
  condimento: 28,
  otro: 35,
  dulce: 8,
  precocinado: 0,
  snack: 0,
};

const PROTEIN_SOURCE_QUALITY: Record<FoodCategory, number> = {
  proteina_animal: 78,
  proteina_vegetal: 96,
  cereal: 52,
  tuberculo: 30,
  legumbre: 98,
  verdura: 62,
  fruta: 20,
  lacteo: 72,
  grasa: 5,
  fruto_seco: 84,
  semilla: 80,
  bebida: 18,
  condimento: 12,
  otro: 20,
  dulce: 5,
  precocinado: 10,
  snack: 5,
};

const CARB_SOURCE_QUALITY: Record<FoodCategory, number> = {
  proteina_animal: 10,
  proteina_vegetal: 62,
  cereal: 70,
  tuberculo: 82,
  legumbre: 96,
  verdura: 76,
  fruta: 92,
  lacteo: 48,
  grasa: 5,
  fruto_seco: 56,
  semilla: 50,
  bebida: 22,
  condimento: 12,
  otro: 22,
  dulce: 5,
  precocinado: 10,
  snack: 5,
};

const FAT_SOURCE_QUALITY: Record<FoodCategory, number> = {
  proteina_animal: 60,
  proteina_vegetal: 80,
  cereal: 35,
  tuberculo: 15,
  legumbre: 68,
  verdura: 38,
  fruta: 32,
  lacteo: 48,
  grasa: 70,
  fruto_seco: 94,
  semilla: 92,
  bebida: 18,
  condimento: 14,
  otro: 20,
  dulce: 6,
  precocinado: 10,
  snack: 5,
};

const POSITIVE_CATEGORIES = new Set<FoodCategory>([
  'verdura',
  'fruta',
  'legumbre',
  'proteina_vegetal',
  'fruto_seco',
  'semilla',
  'tuberculo',
]);

const NEGATIVE_CATEGORIES = new Set<FoodCategory>(['dulce', 'precocinado', 'snack']);
const STRONG_NEGATIVE_CATEGORIES = new Set<FoodCategory>(['precocinado', 'snack']);
const VALID_FOOD_CATEGORIES = new Set<FoodCategory>(Object.keys(CATEGORY_QUALITY) as FoodCategory[]);

const CATEGORY_ALIASES: Record<string, FoodCategory> = {
  protein_animal: 'proteina_animal',
  animal_protein: 'proteina_animal',
  protein_vegetal: 'proteina_vegetal',
  protein_plant: 'proteina_vegetal',
  vegetal_protein: 'proteina_vegetal',
  vegetable: 'verdura',
  vegetables: 'verdura',
  fruit: 'fruta',
  fruits: 'fruta',
  dairy: 'lacteo',
  fats: 'grasa',
  fat: 'grasa',
  nuts: 'fruto_seco',
  nut: 'fruto_seco',
  seeds: 'semilla',
  seed: 'semilla',
  sweet: 'dulce',
  sweets: 'dulce',
  ultraprocessed: 'precocinado',
  ultra_processed: 'precocinado',
  pre_cooked: 'precocinado',
  pre_cooked_food: 'precocinado',
  processed_snack: 'snack',
};

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function linearHigherBetter(value: number, minValue: number, maxValue: number, maxPoints: number): number {
  if (value <= minValue) return 0;
  if (value >= maxValue) return maxPoints;
  return ((value - minValue) / (maxValue - minValue)) * maxPoints;
}

function linearLowerBetter(value: number, goodMax: number, badMin: number, maxPoints: number): number {
  if (value <= goodMax) return maxPoints;
  if (value >= badMin) return 0;
  return (1 - (value - goodMax) / (badMin - goodMax)) * maxPoints;
}

function getValidIngredients(ingredients: IngredientInput[]): IngredientInput[] {
  return ingredients.filter(
    ing => ing && typeof ing.weight_g === 'number' && Number.isFinite(ing.weight_g) && ing.weight_g > 0,
  );
}

function getTotalWeight(ingredients: IngredientInput[]): number {
  return ingredients.reduce((acc, ing) => acc + ing.weight_g, 0);
}

function getPer100g(totalMacros: TotalMacros, totalWeight_g: number): TotalMacros {
  const factor = 100 / totalWeight_g;
  return {
    energyKcal: round2(totalMacros.energyKcal * factor),
    protein_g: round2(totalMacros.protein_g * factor),
    carbs_g: round2(totalMacros.carbs_g * factor),
    fat_g: round2(totalMacros.fat_g * factor),
  };
}

function getCategoryShares(ingredients: IngredientInput[], totalWeight_g: number): CategoryShare[] {
  const map = new Map<FoodCategory, number>();
  for (const ing of ingredients) {
    map.set(ing.category, (map.get(ing.category) ?? 0) + ing.weight_g);
  }

  return Array.from(map.entries())
    .map(([category, weight_g]) => ({ category, weight_g: round2(weight_g), share: weight_g / totalWeight_g }))
    .sort((a, b) => b.share - a.share);
}

function getShareSum(categoryShares: CategoryShare[], categories: Set<FoodCategory>): number {
  return categoryShares.reduce((acc, item) => acc + (categories.has(item.category) ? item.share : 0), 0);
}

function getIngredientQualityScore(categoryShares: CategoryShare[]): number {
  const average = categoryShares.reduce((acc, item) => acc + item.share * CATEGORY_QUALITY[item.category], 0);
  const positiveShare = getShareSum(categoryShares, POSITIVE_CATEGORIES);
  const strongNegativeShare = getShareSum(categoryShares, STRONG_NEGATIVE_CATEGORIES);
  const leadShare = categoryShares[0]?.share ?? 1;

  let raw = (average / 100) * 32;

  if (categoryShares.length >= 2) raw += 1;
  if (categoryShares.length >= 4) raw += 1;
  if (positiveShare >= 0.3) raw += 1;
  if (leadShare <= 0.75) raw += 1;
  if (strongNegativeShare >= 0.4) raw -= 4;

  return Math.round(clamp(raw, 0, 35));
}

function getMacroProfileScore(per100g: TotalMacros): { score: number; densityFactor: number } {
  const proteinDensityScore = linearHigherBetter(per100g.protein_g, 5, 25, 8);
  const energyDensityScore = linearLowerBetter(per100g.energyKcal, 140, 520, 6);
  const fatModerationScore = linearLowerBetter(per100g.fat_g, 8, 35, 4);
  const carbModerationScore = linearLowerBetter(per100g.carbs_g, 20, 80, 2);

  let proteinEfficiencyBonus = 0;
  if (per100g.protein_g >= 12 && per100g.energyKcal <= 330) {
    proteinEfficiencyBonus = 3;
  } else if (per100g.protein_g >= 9 && per100g.energyKcal <= 380) {
    proteinEfficiencyBonus = 1.5;
  }

  const raw =
    proteinDensityScore + energyDensityScore + fatModerationScore + carbModerationScore + proteinEfficiencyBonus;

  const macroMass = per100g.protein_g + per100g.carbs_g + per100g.fat_g;
  const densityFactor = clamp(macroMass / 8, 0.6, 1);

  return {
    score: Math.round(clamp(raw * densityFactor, 0, 25)),
    densityFactor: round2(densityFactor),
  };
}

function normalizeIngredientMacroContributions(
  ingredients: IngredientInput[],
  totalMacros: TotalMacros,
): NormalizedIngredientMacrosResult {
  const baseItems = ingredients.map(ing => {
    const protein_g = Math.max(ing.macros?.protein_g ?? 0, 0);
    const carbs_g = Math.max(ing.macros?.carbs_g ?? 0, 0);
    const fat_g = Math.max(ing.macros?.fat_g ?? 0, 0);
    const energyKcal = Math.max(ing.macros?.energyKcal ?? protein_g * 4 + carbs_g * 4 + fat_g * 9, 0);
    return { category: ing.category, weight_g: ing.weight_g, protein_g, carbs_g, fat_g, energyKcal };
  });

  const hasAnyMacro = baseItems.some(i => i.protein_g > 0 || i.carbs_g > 0 || i.fat_g > 0 || i.energyKcal > 0);
  if (!hasAnyMacro) return { available: false, rescaled: false, items: baseItems };

  const sumProtein = baseItems.reduce((acc, i) => acc + i.protein_g, 0);
  const sumCarbs = baseItems.reduce((acc, i) => acc + i.carbs_g, 0);
  const sumFat = baseItems.reduce((acc, i) => acc + i.fat_g, 0);

  const proteinFactor = sumProtein > 0 ? totalMacros.protein_g / sumProtein : 0;
  const carbsFactor = sumCarbs > 0 ? totalMacros.carbs_g / sumCarbs : 0;
  const fatFactor = sumFat > 0 ? totalMacros.fat_g / sumFat : 0;
  const rescaled =
    (sumProtein > 0 && Math.abs(proteinFactor - 1) > 0.05) ||
    (sumCarbs > 0 && Math.abs(carbsFactor - 1) > 0.05) ||
    (sumFat > 0 && Math.abs(fatFactor - 1) > 0.05);

  const items: NormalizedIngredient[] = baseItems.map(i => {
    const protein_g = sumProtein > 0 ? i.protein_g * proteinFactor : 0;
    const carbs_g = sumCarbs > 0 ? i.carbs_g * carbsFactor : 0;
    const fat_g = sumFat > 0 ? i.fat_g * fatFactor : 0;
    const energyKcal = protein_g * 4 + carbs_g * 4 + fat_g * 9;
    return { category: i.category, weight_g: i.weight_g, protein_g, carbs_g, fat_g, energyKcal };
  });

  return { available: true, rescaled, items };
}

function weightedAverageFromMacro(
  items: NormalizedIngredient[],
  macroKey: 'protein_g' | 'carbs_g' | 'fat_g',
  qualityMap: Record<FoodCategory, number>,
): number | null {
  const total = items.reduce((acc, i) => acc + i[macroKey], 0);
  if (total <= 0) return null;
  const weighted = items.reduce((acc, i) => acc + i[macroKey] * qualityMap[i.category], 0);
  return weighted / total;
}

function getMacroSourceQualityScore(normalized: NormalizedIngredientMacrosResult): number {
  if (!normalized.available) return 0;

  const proteinAvg = weightedAverageFromMacro(normalized.items, 'protein_g', PROTEIN_SOURCE_QUALITY);
  const carbAvg = weightedAverageFromMacro(normalized.items, 'carbs_g', CARB_SOURCE_QUALITY);
  const fatAvg = weightedAverageFromMacro(normalized.items, 'fat_g', FAT_SOURCE_QUALITY);

  const proteinScore = proteinAvg == null ? 0 : (proteinAvg / 100) * 12;
  const carbScore = carbAvg == null ? 0 : (carbAvg / 100) * 6;
  const fatScore = fatAvg == null ? 0 : (fatAvg / 100) * 7;

  return Math.round(clamp(proteinScore + carbScore + fatScore, 0, 25));
}

function getNegativeEnergyShare(normalized: NormalizedIngredientMacrosResult): number | null {
  if (!normalized.available) return null;
  const totalEnergy = normalized.items.reduce((acc, i) => acc + i.energyKcal, 0);
  if (totalEnergy <= 0) return null;
  const negativeEnergy = normalized.items.reduce(
    (acc, i) => acc + (NEGATIVE_CATEGORIES.has(i.category) ? i.energyKcal : 0),
    0,
  );
  return negativeEnergy / totalEnergy;
}

function getProcessingScore(
  categoryShares: CategoryShare[],
  normalized: NormalizedIngredientMacrosResult,
): {
  score: number;
  positiveShare: number;
  negativeShare: number;
  strongNegativeShare: number;
  negativeEnergyShare: number | null;
} {
  const positiveShare = getShareSum(categoryShares, POSITIVE_CATEGORIES);
  const negativeShare = getShareSum(categoryShares, NEGATIVE_CATEGORIES);
  const strongNegativeShare = getShareSum(categoryShares, STRONG_NEGATIVE_CATEGORIES);
  const negativeEnergyShare = getNegativeEnergyShare(normalized);

  let raw = 10;

  if (positiveShare >= 0.65) raw += 3;
  else if (positiveShare >= 0.4) raw += 2;
  else if (positiveShare >= 0.2) raw += 1;

  const mildNegativePenalty = negativeShare <= 0.25 ? negativeShare * 3 : 0.75 + (negativeShare - 0.25) * 6;
  raw -= mildNegativePenalty;

  if (strongNegativeShare > 0.15) {
    raw -= strongNegativeShare * 5;
  } else {
    raw -= strongNegativeShare * 2.5;
  }

  if (negativeEnergyShare != null && negativeEnergyShare > 0.25) {
    raw -= (negativeEnergyShare - 0.25) * 3;
  }

  return {
    score: Math.round(clamp(raw, 0, 15)),
    positiveShare: round2(positiveShare),
    negativeShare: round2(negativeShare),
    strongNegativeShare: round2(strongNegativeShare),
    negativeEnergyShare: negativeEnergyShare == null ? null : round2(negativeEnergyShare),
  };
}

function getGrade(score: number): FoodScoreGrade {
  if (score >= 84) return 'A';
  if (score >= 68) return 'B';
  if (score >= 52) return 'C';
  if (score >= 36) return 'D';
  return 'E';
}

function normalizeCategoryInput(category: string): string {
  return category
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '_');
}

export function toFoodCategory(category: string | null | undefined): FoodCategory {
  const fallback: FoodCategory = 'otro';
  if (!category) return fallback;

  const normalized = normalizeCategoryInput(category);
  if (VALID_FOOD_CATEGORIES.has(normalized as FoodCategory)) {
    return normalized as FoodCategory;
  }

  return CATEGORY_ALIASES[normalized] ?? fallback;
}

export function calculateFoodQualityScore(input: FoodScoreInput): FoodScoreResult {
  if (!input || !Array.isArray(input.ingredients) || input.ingredients.length === 0) {
    throw new Error('ingredients está vacío.');
  }

  const validIngredients = getValidIngredients(input.ingredients);
  if (validIngredients.length === 0) {
    throw new Error('No hay ingredientes válidos con weight_g > 0.');
  }

  const totalWeight_g = getTotalWeight(validIngredients);
  if (totalWeight_g <= 0) {
    throw new Error('El peso total debe ser > 0.');
  }

  const totalMacros = {
    energyKcal: Math.max(input.totalMacros.energyKcal, 0),
    protein_g: Math.max(input.totalMacros.protein_g, 0),
    carbs_g: Math.max(input.totalMacros.carbs_g, 0),
    fat_g: Math.max(input.totalMacros.fat_g, 0),
  };

  const per100g = getPer100g(totalMacros, totalWeight_g);
  const categoryShares = getCategoryShares(validIngredients, totalWeight_g);
  const ingredientQualityScore = getIngredientQualityScore(categoryShares);
  const macroProfile = getMacroProfileScore(per100g);
  const normalizedIngredientMacros = normalizeIngredientMacroContributions(validIngredients, totalMacros);
  const macroSourceQualityScore = getMacroSourceQualityScore(normalizedIngredientMacros);
  const processing = getProcessingScore(categoryShares, normalizedIngredientMacros);

  const score = Math.round(
    clamp(ingredientQualityScore + macroProfile.score + macroSourceQualityScore + processing.score, 0, 100),
  );

  return {
    score,
    score01: round2(score / 100),
    grade: getGrade(score),
    version: FOOD_QUALITY_SCORE_VERSION,
    breakdown: {
      ingredientQualityScore,
      macroProfileScore: macroProfile.score,
      macroSourceQualityScore,
      processingScore: processing.score,
    },
    debug: {
      positiveShare: processing.positiveShare,
      negativeShare: processing.negativeShare,
      strongNegativeShare: processing.strongNegativeShare,
      negativeEnergyShare: processing.negativeEnergyShare,
      macroDensityFactor: macroProfile.densityFactor,
      rescaledIngredientMacros: normalizedIngredientMacros.rescaled,
    },
  };
}
