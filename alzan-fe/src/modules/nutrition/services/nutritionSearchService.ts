// src/modules/nutrition/services/nutritionSearchService.ts
// Service for searching ingredients from the database and barcode scanning

import { supabase } from '../../../lib/supabaseClient';
import { DbIngredient, RecipeUsageContext } from '../../../types/requests.types';
import {
  normalizeInput,
  searchIngredientsWithFilters,
  IngredientSearchFilters,
} from '../../../services/ingredientsService';
import { getFoodNutritionById, warmNutritionApiHeaders } from '../../../services/nutritionApi';
import { FoodSearchResult, MealComponent } from '../types/ingredients';
import {
  buildTokenIlikeClauses,
  buildLooseIlikePattern,
  getCurrentAppLocale,
  getLocalizedIngredientName,
  getLocalizedIngredientNotes,
  getLocalizedRecipeDescription,
  getLocalizedRecipeName,
  getSearchRelevanceScore,
  matchesLoosely,
} from '../../../services/localization';
import { Locale } from '../../../i18n';

interface RecipeSearchRow {
  id: string;
  name_es: string;
  name_en: string | null;
  name_norm_es: string;
  description_es: string | null;
  description_en: string | null;
  quality_score: number;
  source: 'system' | 'user';
  owner_user_id: string | null;
  visibility: 'private' | 'public';
  kcal_100: number;
  protein_g_100: number;
  carbs_g_100: number;
  fat_g_100: number;
  popularity_score: number;
  favorites_total: number;
  saves_total: number;
  uses_7d: number;
  uses_30d: number;
  uses_total: number;
  public_slug: string | null;
  origin_recipe_id: string | null;
}

interface IngredientSearchRow extends DbIngredient {
  notes_es: string | null;
  notes_en: string | null;
}

export type RecipeLibrarySourceFilter = 'all' | 'users' | 'system';
export type RecipeSearchScope = 'source' | 'all' | 'users' | 'saved' | 'favorites';

interface SearchMealByNameOptions {
  locale?: Locale;
  recipeScope?: RecipeSearchScope;
  currentUserId?: string | null;
  favoriteRecipeIds?: string[];
}

interface RecipeLibraryPageParams {
  query: string;
  sourceFilter: RecipeLibrarySourceFilter;
  page: number;
  pageSize: number;
}

interface RecipeLibraryPageResult {
  recipes: MealComponent[];
  total: number;
}

const RECIPES_SELECT_FIELDS = `
  id,
  name_es,
  name_en,
  name_norm_es,
  description_es,
  description_en,
  quality_score,
  source,
  owner_user_id,
  visibility,
  kcal_100,
  protein_g_100,
  carbs_g_100,
  fat_g_100,
  popularity_score,
  favorites_total,
  saves_total,
  uses_7d,
  uses_30d,
  uses_total,
  public_slug,
  origin_recipe_id
`;

function roundToOneDecimal(value: number): number {
  return Math.round(value * 10) / 10;
}

function toRecipeDisplayName(rawName: string): string {
  return rawName.replace(/\s*\((?:copia|copy)(?:\s+\d+)?\)\s*$/i, '').trim();
}

function mapRecipeToMealComponent(recipe: RecipeSearchRow): MealComponent {
  const localizedName = getLocalizedRecipeName(recipe);

  return {
    id: `recipe_${recipe.id}`,
    name: toRecipeDisplayName(localizedName),
    description: getLocalizedRecipeDescription(recipe) ?? undefined,
    source: 'database',
    external_id: recipe.id,
    itemType: 'recipe',
    quality_score: recipe.quality_score,
    recipe_source: recipe.source,
    recipe_owner_user_id: recipe.owner_user_id,
    recipe_visibility: recipe.visibility,
    recipe_public_slug: recipe.public_slug,
    recipe_origin_id: recipe.origin_recipe_id,
    recipe_popularity_score: recipe.popularity_score,
    recipe_favorites_total: recipe.favorites_total,
    recipe_saves_total: recipe.saves_total,
    recipe_uses_7d: recipe.uses_7d,
    recipe_uses_30d: recipe.uses_30d,
    recipe_uses_total: recipe.uses_total,
    kcal_100: Math.round(recipe.kcal_100 || 0),
    protein_g_100: roundToOneDecimal(recipe.protein_g_100 || 0),
    carbs_g_100: roundToOneDecimal(recipe.carbs_g_100 || 0),
    fat_g_100: roundToOneDecimal(recipe.fat_g_100 || 0),
  };
}

function getRecipeSearchTier(recipe: RecipeSearchRow, normQuery: string): number {
  const normalizedCandidates = [recipe.name_es, recipe.name_en || '']
    .map(value => normalizeInput(value))
    .filter(value => value.length > 0);

  if (normalizedCandidates.some(value => value === normQuery)) {
    return 0;
  }

  if (normalizedCandidates.some(value => value.startsWith(normQuery))) {
    return 1;
  }

  if (normalizedCandidates.some(value => value.includes(normQuery))) {
    return 2;
  }

  return 3;
}

function rankRecipesByTextAndPopularity(recipes: RecipeSearchRow[], query: string): RecipeSearchRow[] {
  const normQuery = normalizeInput(query);

  return recipes
    .filter(recipe =>
      matchesLoosely(query, recipe.name_es, recipe.name_en, recipe.description_es, recipe.description_en),
    )
    .sort((a, b) => {
      const tierDiff = getRecipeSearchTier(a, normQuery) - getRecipeSearchTier(b, normQuery);
      if (tierDiff !== 0) {
        return tierDiff;
      }

      const popularityDiff = (b.popularity_score || 0) - (a.popularity_score || 0);
      if (popularityDiff !== 0) {
        return popularityDiff;
      }

      const qualityDiff = (b.quality_score || 0) - (a.quality_score || 0);
      if (qualityDiff !== 0) {
        return qualityDiff;
      }

      return (b.uses_7d || 0) - (a.uses_7d || 0);
    });
}

async function fetchDiscoveryRecipes(
  limit: number,
  primaryOrder: 'uses_7d' | 'uses_30d' | 'uses_total',
): Promise<MealComponent[]> {
  try {
    const effectiveLimit = Math.max(1, limit);
    const { data: recipes, error } = await supabase
      .from('recipes')
      .select(RECIPES_SELECT_FIELDS)
      .is('deleted_at', null)
      .or('source.eq.system,visibility.eq.public')
      .order(primaryOrder, { ascending: false })
      .order('popularity_score', { ascending: false })
      .order('quality_score', { ascending: false })
      .limit(effectiveLimit)
      .returns<RecipeSearchRow[]>();

    if (error || !recipes) {
      return [];
    }

    return recipes.map(mapRecipeToMealComponent);
  } catch (error) {
    console.error('[nutritionSearchService] Discovery recipe fetch error:', error);
    return [];
  }
}

/**
 * Search for ingredients with filters (category, letter, text)
 * Used by IngredientSearchPanel - includes ALL ingredient categories
 */
export async function searchFoodsWithFilters(
  filters: IngredientSearchFilters,
  locale?: Locale,
  options?: { maxResults?: number },
): Promise<MealComponent[]> {
  const languageCode = locale ?? getCurrentAppLocale();
  const maxResults = options?.maxResults ?? 10;
  try {
    const ingredients = await searchIngredientsWithFilters(filters, languageCode, maxResults);

    return ingredients.map(ing => ({
      id: `ingredient_${ing.id}`,
      name: getLocalizedIngredientName(ing, languageCode),
      source: 'database' as const,
      external_id: ing.id,
      category: ing.category,
      itemType: 'ingredient' as const,
      kcal_100: Math.round(ing.kcal_100 || 0),
      protein_g_100: roundToOneDecimal(ing.protein_g_100 || 0),
      carbs_g_100: roundToOneDecimal(ing.carbs_g_100 || 0),
      fat_g_100: roundToOneDecimal(ing.fat_g_100 || 0),
      // Extended info for detail modal
      fiber_g_100: ing.fiber_g_100,
      sugar_g_100: ing.sugar_g_100,
      sodium_mg_100: ing.sodium_mg_100,
      salt_g_100: ing.salt_g_100,
      quality_score: ing.quality_score,
      notes: getLocalizedIngredientNotes(ing, languageCode) ?? undefined,
      source_primary: ing.source_primary,
      source_secondary: ing.source_secondary,
    }));
  } catch (error) {
    console.error('[Search] Filtered search failed:', error);
    return [];
  }
}

/**
 * Search for meals by name - searches BOTH recipes and precooked ingredients
 * Used by MealLogFormScreen meal name input
 */
export async function searchMealByName(query: string, options: SearchMealByNameOptions = {}): Promise<MealComponent[]> {
  const languageCode = options.locale ?? getCurrentAppLocale();
  if (!query || query.length < 2) return [];

  const normQuery = normalizeInput(query);
  const likePattern = buildLooseIlikePattern(query);
  const recipeTokenClauses = buildTokenIlikeClauses(query, ['name_norm_es', 'name_es', 'name_en']);
  const ingredientTokenClauses = buildTokenIlikeClauses(query, ['name_norm_es', 'name_es', 'name_en']);
  const results: MealComponent[] = [];
  const recipeScope = options.recipeScope ?? 'source';
  const currentUserId = options.currentUserId ?? null;
  const favoriteRecipeIds = options.favoriteRecipeIds ?? [];

  // ===== 1. SEARCH RECIPES (partial match) =====
  try {
    let shouldSearchRecipes = true;
    let recipesQuery = supabase
      .from('recipes')
      .select(RECIPES_SELECT_FIELDS)
      .is('deleted_at', null)
      .or(
        Array.from(
          new Set([
            `name_norm_es.ilike.%${normQuery}%`,
            `name_es.ilike.%${likePattern}%`,
            `name_en.ilike.%${likePattern}%`,
            ...recipeTokenClauses,
          ]),
        ).join(','),
      );

    if (recipeScope === 'source') {
      recipesQuery = recipesQuery.eq('source', 'system');
    } else if (recipeScope === 'users') {
      recipesQuery = recipesQuery.eq('source', 'user').eq('visibility', 'public');
    } else if (recipeScope === 'saved') {
      if (!currentUserId) {
        shouldSearchRecipes = false;
      } else {
        recipesQuery = recipesQuery.eq('owner_user_id', currentUserId).eq('source', 'user');
      }
    } else if (recipeScope === 'favorites') {
      if (favoriteRecipeIds.length === 0) {
        shouldSearchRecipes = false;
      } else {
        recipesQuery = recipesQuery.in('id', favoriteRecipeIds);
      }
    }

    if (shouldSearchRecipes) {
      const { data: recipes, error } = await recipesQuery
        .order('popularity_score', { ascending: false })
        .order('quality_score', { ascending: false })
        .limit(60)
        .returns<RecipeSearchRow[]>();

      if (!error && recipes) {
        const rankedRecipes = rankRecipesByTextAndPopularity(recipes, query).slice(0, 15);
        results.push(...rankedRecipes.map(mapRecipeToMealComponent));
      }
    }
  } catch (err) {
    console.error('[nutritionSearchService] Recipe search error:', err);
  }

  // ===== 2. SEARCH PRECOOKED INGREDIENTS ONLY =====
  try {
    const { data: ingredients, error } = await supabase
      .from('ingredients')
      .select(
        `
          id,
          name_es,
          name_en,
          name_norm_es,
          category,
          unit_basis,
          kcal_100,
          protein_g_100,
          carbs_g_100,
          fat_g_100,
          fiber_g_100,
          sugar_g_100,
          sodium_mg_100,
          salt_g_100,
          source_primary,
          source_secondary,
          quality_score,
          notes_es,
          notes_en,
          created_at,
          updated_at
        `,
      )
      .eq('category', 'precocinado')
      .or(
        Array.from(
          new Set([
            `name_norm_es.ilike.%${normQuery}%`,
            `name_es.ilike.%${likePattern}%`,
            `name_en.ilike.%${likePattern}%`,
            ...ingredientTokenClauses,
          ]),
        ).join(','),
      )
      .order('quality_score', { ascending: false })
      .limit(15)
      .returns<IngredientSearchRow[]>();

    if (!error && ingredients) {
      ingredients
        .filter(ing => matchesLoosely(query, ing.name_es, ing.name_en, ing.notes_es, ing.notes_en))
        .forEach(ing => {
          results.push({
            id: `ingredient_${ing.id}`,
            name: getLocalizedIngredientName(ing, languageCode),
            source: 'database',
            external_id: ing.id,
            itemType: 'ingredient',
            category: ing.category,
            quality_score: ing.quality_score,
            source_primary: ing.source_primary,
            source_secondary: ing.source_secondary,
            notes: getLocalizedIngredientNotes(ing, languageCode) ?? undefined,
            kcal_100: Math.round(ing.kcal_100 || 0),
            protein_g_100: roundToOneDecimal(ing.protein_g_100 || 0),
            carbs_g_100: roundToOneDecimal(ing.carbs_g_100 || 0),
            fat_g_100: roundToOneDecimal(ing.fat_g_100 || 0),
          });
        });
    }
  } catch (err) {
    console.error('[nutritionSearchService] Precooked search error:', err);
  }

  // Sort: starts-with first, then recipe popularity/quality
  results.sort((a, b) => {
    const scoreA = getSearchRelevanceScore(query, a.name, a.description ?? null);
    const scoreB = getSearchRelevanceScore(query, b.name, b.description ?? null);

    if (scoreA !== scoreB) return scoreB - scoreA;

    if (a.itemType === 'recipe' && b.itemType === 'recipe') {
      const popularityDiff = (b.recipe_popularity_score || 0) - (a.recipe_popularity_score || 0);
      if (popularityDiff !== 0) return popularityDiff;
    }
    return (b.quality_score || 0) - (a.quality_score || 0);
  });

  return results;
}

export async function getTrendingRecipes(limit = 12): Promise<MealComponent[]> {
  return fetchDiscoveryRecipes(limit, 'uses_7d');
}

export async function getMostUsedRecipes(limit = 12): Promise<MealComponent[]> {
  return fetchDiscoveryRecipes(limit, 'uses_30d');
}

export async function getTopHistoricalRecipes(limit = 12): Promise<MealComponent[]> {
  return fetchDiscoveryRecipes(limit, 'uses_total');
}

// Backward-compatible alias used by existing UI.
export async function getFeaturedRecipes(limit = 12): Promise<MealComponent[]> {
  return getTopHistoricalRecipes(limit);
}

export async function getRecipeLibraryPage({
  query,
  sourceFilter,
  page,
  pageSize,
}: RecipeLibraryPageParams): Promise<RecipeLibraryPageResult> {
  try {
    const safePage = Math.max(1, page);
    const safePageSize = Math.max(1, pageSize);
    const from = (safePage - 1) * safePageSize;
    const to = from + safePageSize - 1;
    const trimmedQuery = query.trim();

    if (trimmedQuery.length >= 2) {
      const normQuery = normalizeInput(trimmedQuery);
      const likePattern = buildLooseIlikePattern(trimmedQuery);
      let queryBuilder = supabase
        .from('recipes')
        .select(RECIPES_SELECT_FIELDS)
        .is('deleted_at', null)
        .or(`name_norm_es.ilike.%${normQuery}%,name_es.ilike.%${likePattern}%,name_en.ilike.%${likePattern}%`);

      if (sourceFilter === 'users') {
        queryBuilder = queryBuilder.eq('source', 'user').eq('visibility', 'public');
      } else if (sourceFilter === 'system') {
        queryBuilder = queryBuilder.eq('source', 'system');
      }

      const { data: recipes, error } = await queryBuilder
        .order('popularity_score', { ascending: false })
        .order('quality_score', { ascending: false })
        .limit(150)
        .returns<RecipeSearchRow[]>();

      if (error || !recipes) {
        return { recipes: [], total: 0 };
      }

      const scopedRecipes =
        sourceFilter === 'all'
          ? recipes.filter(recipe => recipe.source === 'system' || recipe.visibility === 'public')
          : recipes;
      const rankedRecipes = rankRecipesByTextAndPopularity(scopedRecipes, trimmedQuery);
      const pagedRecipes = rankedRecipes.slice(from, to + 1).map(mapRecipeToMealComponent);

      return { recipes: pagedRecipes, total: rankedRecipes.length };
    }

    let queryBuilder = supabase
      .from('recipes')
      .select(RECIPES_SELECT_FIELDS, { count: 'exact' })
      .is('deleted_at', null);

    if (sourceFilter === 'users') {
      queryBuilder = queryBuilder.eq('source', 'user').eq('visibility', 'public');
    } else if (sourceFilter === 'system') {
      queryBuilder = queryBuilder.eq('source', 'system');
    } else {
      queryBuilder = queryBuilder.or('source.eq.system,visibility.eq.public');
    }

    const {
      data: recipes,
      error,
      count,
    } = await queryBuilder
      .order('popularity_score', { ascending: false })
      .order('uses_7d', { ascending: false })
      .order('quality_score', { ascending: false })
      .range(from, to)
      .returns<RecipeSearchRow[]>();

    if (error || !recipes) {
      return { recipes: [], total: 0 };
    }

    return { recipes: recipes.map(mapRecipeToMealComponent), total: count ?? 0 };
  } catch (error) {
    console.error('[nutritionSearchService] Recipe library page fetch error:', error);
    return { recipes: [], total: 0 };
  }
}

export async function publishRecipe(recipeId: string): Promise<void> {
  const { error } = await supabase.rpc('publish_recipe', { p_recipe_id: recipeId });
  if (error) {
    throw error;
  }
}

export async function unpublishRecipe(recipeId: string): Promise<void> {
  const { error } = await supabase.rpc('unpublish_recipe', { p_recipe_id: recipeId });
  if (error) {
    throw error;
  }
}

export async function duplicateRecipe(recipeId: string): Promise<string> {
  const { data, error } = await supabase.rpc('duplicate_recipe', { p_recipe_id: recipeId });
  if (error) {
    throw error;
  }

  if (!data || typeof data !== 'string') {
    throw new Error('duplicate_recipe_empty_result');
  }

  return data;
}

export async function logRecipeUsage(recipeId: string, context: RecipeUsageContext): Promise<void> {
  const { error } = await supabase.rpc('log_recipe_usage', {
    p_recipe_id: recipeId,
    p_context: context,
  });

  if (error) {
    console.error(
      '[nutritionSearchService] logRecipeUsage RPC failed:',
      { recipeId, context, code: error.code },
      error.message,
      error.details,
      error.hint,
    );
    throw error;
  }
}

/**
 * Manually triggers the popularity aggregate refresh.
 * Normally pg_cron runs this every 15 min; this allows immediate updates
 * after usage/favorite/duplicate actions during testing.
 */
export async function refreshRecipeAggregates(): Promise<void> {
  const { error } = await supabase.rpc('refresh_recipe_popularity_aggregates');
  if (error) {
    console.error('[nutritionSearchService] refreshRecipeAggregates RPC failed:', error.message);
  }
}

const barcodeCache = new Map<string, FoodSearchResult | null>();
const inFlightBarcodeLookups = new Map<string, Promise<FoodSearchResult | null>>();

export function warmBarcodeLookup(): void {
  warmNutritionApiHeaders();
}

export async function fetchByBarcode(barcode: string): Promise<FoodSearchResult | null> {
  if (!barcode) return null;

  const sanitizedBarcode = barcode.trim();
  if (!sanitizedBarcode) return null;
  if (barcodeCache.has(sanitizedBarcode)) {
    return barcodeCache.get(sanitizedBarcode) ?? null;
  }

  const inFlightLookup = inFlightBarcodeLookups.get(sanitizedBarcode);
  if (inFlightLookup) {
    return inFlightLookup;
  }

  const lookupPromise = (async (): Promise<FoodSearchResult | null> => {
    try {
      const food = await getFoodNutritionById(sanitizedBarcode);

      if (!food) {
        barcodeCache.set(sanitizedBarcode, null);
        return null;
      }

      const result: FoodSearchResult = {
        id: `off_${food.id || sanitizedBarcode}`,
        name: food.name,
        brand: food.brand ?? undefined,
        source: 'openfoodfacts',
        external_id: food.id || sanitizedBarcode,
        itemType: 'ingredient',
        kcal_100: food.per_100g.kcal,
        protein_g_100: food.per_100g.protein_g,
        carbs_g_100: food.per_100g.carbs_g,
        fat_g_100: food.per_100g.fats_g,
        barcode: sanitizedBarcode,
      };

      barcodeCache.set(sanitizedBarcode, result);
      return result;
    } catch (error) {
      console.error('Barcode fetch failed:', error);
      throw error;
    } finally {
      inFlightBarcodeLookups.delete(sanitizedBarcode);
    }
  })();

  inFlightBarcodeLookups.set(sanitizedBarcode, lookupPromise);
  return lookupPromise;
}

export const nutritionSearchService = {
  searchFoodsWithFilters,
  searchMealByName,
  getRecipeLibraryPage,
  getFeaturedRecipes,
  getTrendingRecipes,
  getMostUsedRecipes,
  getTopHistoricalRecipes,
  publishRecipe,
  unpublishRecipe,
  duplicateRecipe,
  logRecipeUsage,
  refreshRecipeAggregates,
  fetchByBarcode,
  warmBarcodeLookup,
};
