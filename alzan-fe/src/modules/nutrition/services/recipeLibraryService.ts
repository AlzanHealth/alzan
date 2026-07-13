// src/modules/nutrition/services/recipeLibraryService.ts
// Data layer for the standalone Recipe Library ("Recetario") screen.
//
// "Descubrir" reuses the already-clean, popularity-ranked, de-duplicated
// pagination from nutritionSearchService (no more redundant 7d/30d/all-time
// rows). "Mías" and "Favoritas" read the user's own recipes / favorites.

import { supabase } from '../../../lib/supabaseClient';
import { getLocalizedRecipeDescription, getLocalizedRecipeName } from '../../../services/localization';
import { normalizeInput } from '../../../services/ingredientsService';
import { MealComponent } from '../types/ingredients';
import { buildRecipeSoftDeletePayload } from './recipeEditing';

// Discovery sorting lens (all backed by aggregate columns already on `recipes`).
export type DiscoverSort = 'recommended' | 'week' | 'month' | 'saved';
// Macro-based category filter (derived from the per-100g columns on `recipes`).
export type DiscoverCategory = 'all' | 'high_protein' | 'low_cal' | 'high_carb';
export type PersonalRecipeSort = 'recently_used' | 'most_used' | 'alphabetical';

const HIGH_PROTEIN_MIN_G = 15;
const LOW_CAL_MAX_KCAL = 120;
const HIGH_CARB_MIN_G = 45;

interface RecipeRow {
  id: string;
  name_es: string;
  name_en: string | null;
  description_es: string | null;
  description_en: string | null;
  source: 'system' | 'user';
  owner_user_id: string | null;
  visibility: 'private' | 'public';
  updated_at: string;
  kcal_100: number | null;
  protein_g_100: number | null;
  carbs_g_100: number | null;
  fat_g_100: number | null;
  popularity_score: number | null;
  favorites_total: number | null;
  saves_total: number | null;
  uses_7d: number | null;
  uses_30d: number | null;
  uses_total: number | null;
}

export interface RankedRecipeRow extends RecipeRow {
  search_rank: number | null;
}

type RankedRecipePageRow = {
  items: RankedRecipeRow[] | null;
  total_count: number | null;
};

export type SearchRecipesRpc = {
  rpc: (
    fn: 'search_recipes_ranked',
    args: {
      p_query: string;
      p_scope: 'all' | 'source' | 'users' | 'saved' | 'favorites';
      p_user_id: string | null;
      p_category: DiscoverCategory;
      p_sort: DiscoverSort;
      p_limit: number;
      p_offset: number;
    },
  ) => Promise<{ data: RankedRecipePageRow[] | null; error: { message: string } | null }>;
};

interface RecipeFavoriteRow {
  recipe_id: string;
}

interface UserNameRow {
  id: string;
  username: string | null;
  display_name: string | null;
}

interface RecipeUsageEventRow {
  recipe_id: string;
  used_at: string;
}

export interface RecipePersonalUsageSummary {
  recipeId: string;
  lastUsedAt: string | null;
  useCount: number;
}

const RECIPE_CARD_FIELDS =
  'id, name_es, name_en, description_es, description_en, source, owner_user_id, visibility, updated_at, kcal_100, protein_g_100, carbs_g_100, fat_g_100, popularity_score, favorites_total, saves_total, uses_7d, uses_30d, uses_total';

const roundToOneDecimal = (value: number): number => Math.round(value * 10) / 10;

const stripCopySuffix = (rawName: string): string =>
  rawName.replace(/\s*\((?:copia|copy)(?:\s+\d+)?\)\s*$/i, '').trim();

export const recipeMatchesCategory = (recipe: MealComponent, category: DiscoverCategory): boolean => {
  if (category === 'all') return true;
  if (category === 'high_protein') return (recipe.protein_g_100 ?? 0) >= HIGH_PROTEIN_MIN_G;
  if (category === 'low_cal') return (recipe.kcal_100 ?? 0) <= LOW_CAL_MAX_KCAL;
  return (recipe.carbs_g_100 ?? 0) >= HIGH_CARB_MIN_G;
};

const mapRecipeRow = (row: RecipeRow): MealComponent => ({
  id: `recipe_${row.id}`,
  external_id: row.id,
  name: stripCopySuffix(getLocalizedRecipeName({ name_es: row.name_es, name_en: row.name_en })),
  description:
    getLocalizedRecipeDescription({ description_es: row.description_es, description_en: row.description_en }) ??
    undefined,
  source: 'database',
  itemType: 'recipe',
  recipe_source: row.source,
  recipe_owner_user_id: row.owner_user_id,
  recipe_visibility: row.visibility,
  recipe_updated_at: row.updated_at,
  recipe_popularity_score: row.popularity_score ?? 0,
  recipe_favorites_total: row.favorites_total ?? 0,
  recipe_saves_total: row.saves_total ?? 0,
  recipe_uses_7d: row.uses_7d ?? 0,
  recipe_uses_30d: row.uses_30d ?? 0,
  recipe_uses_total: row.uses_total ?? 0,
  kcal_100: Math.round(row.kcal_100 ?? 0),
  protein_g_100: roundToOneDecimal(row.protein_g_100 ?? 0),
  carbs_g_100: roundToOneDecimal(row.carbs_g_100 ?? 0),
  fat_g_100: roundToOneDecimal(row.fat_g_100 ?? 0),
});

const getCurrentUserId = async (): Promise<string | null> => {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
};

// Batch-resolve the author display name for user recipes so the card can show
// "by <name>" instead of a generic "Users" badge. One query for the whole list.
async function attachAuthorNames(recipes: MealComponent[]): Promise<MealComponent[]> {
  const ownerIds = Array.from(
    new Set(
      recipes
        .filter(recipe => recipe.recipe_source === 'user' && recipe.recipe_owner_user_id)
        .map(recipe => recipe.recipe_owner_user_id as string),
    ),
  );
  if (ownerIds.length === 0) return recipes;

  const { data, error } = await supabase
    .from('users')
    .select('id, username, display_name')
    .in('id', ownerIds)
    .returns<UserNameRow[]>();

  if (error || !data) {
    if (error) console.error('[recipeLibraryService] attachAuthorNames error:', error);
    return recipes;
  }

  const nameById = new Map(data.map(user => [user.id, user.display_name?.trim() || user.username?.trim() || null]));

  return recipes.map(recipe =>
    recipe.recipe_source === 'user' && recipe.recipe_owner_user_id
      ? { ...recipe, recipe_author_name: nameById.get(recipe.recipe_owner_user_id) ?? undefined }
      : recipe,
  );
}

export interface DiscoverPageResult {
  recipes: MealComponent[];
  total: number;
}

export interface DiscoverOptions {
  query: string;
  page: number;
  pageSize: number;
  sort: DiscoverSort;
  category: DiscoverCategory;
}

/**
 * Global discovery over the public/system catalog, with a sorting "lens"
 * (recommended / week / month / saved) and a macro-based category filter, all
 * backed by aggregate + per-100g columns already stored on `recipes`.
 */
export async function getDiscoverRecipes({
  query,
  page,
  pageSize,
  sort,
  category,
}: DiscoverOptions): Promise<DiscoverPageResult> {
  const from = (Math.max(1, page) - 1) * pageSize;
  const userId = await getCurrentUserId();

  const { data: rankedData, error: rankedError } = await (supabase as unknown as SearchRecipesRpc).rpc(
    'search_recipes_ranked',
    {
      p_query: query,
      p_scope: 'all',
      p_user_id: userId,
      p_category: category,
      p_sort: sort,
      p_limit: pageSize,
      p_offset: from,
    },
  );

  if (!rankedError && rankedData) {
    const page = rankedData[0];
    const items = page?.items ?? [];
    return {
      recipes: await attachAuthorNames(items.map(mapRecipeRow)),
      total: page?.total_count ?? 0,
    };
  }

  if (rankedError) console.error('[recipeLibraryService] search_recipes_ranked error:', rankedError);

  let builder = supabase
    .from('recipes')
    .select(RECIPE_CARD_FIELDS, { count: 'exact' })
    .is('deleted_at', null)
    .or('source.eq.system,visibility.eq.public');

  const trimmed = query.trim();
  if (trimmed.length >= 2) {
    const norm = normalizeInput(trimmed);
    builder = builder.or(`name_norm_es.ilike.%${norm}%,name_es.ilike.%${trimmed}%,name_en.ilike.%${trimmed}%`);
  }

  if (category === 'high_protein') builder = builder.gte('protein_g_100', HIGH_PROTEIN_MIN_G);
  else if (category === 'low_cal') builder = builder.lte('kcal_100', LOW_CAL_MAX_KCAL);
  else if (category === 'high_carb') builder = builder.gte('carbs_g_100', HIGH_CARB_MIN_G);

  if (sort === 'week') builder = builder.order('uses_7d', { ascending: false });
  else if (sort === 'month') builder = builder.order('uses_30d', { ascending: false });
  else if (sort === 'saved')
    builder = builder.order('saves_total', { ascending: false }).order('favorites_total', { ascending: false });
  else builder = builder.order('popularity_score', { ascending: false }).order('uses_7d', { ascending: false });

  const to = from + pageSize - 1;
  const { data, error, count } = await builder
    .order('quality_score', { ascending: false })
    .range(from, to)
    .returns<RecipeRow[]>();

  if (error || !data) {
    if (error) console.error('[recipeLibraryService] getDiscoverRecipes error:', error);
    return { recipes: [], total: 0 };
  }

  return { recipes: await attachAuthorNames(data.map(mapRecipeRow)), total: count ?? 0 };
}

/**
 * A recipe is "rising" when its last-7-days usage clearly outpaces its own
 * monthly weekly-average — i.e. momentum, not just all-time popularity.
 */
export function isRecipeRising(recipe: MealComponent): boolean {
  const week = recipe.recipe_uses_7d ?? 0;
  const month = recipe.recipe_uses_30d ?? 0;
  if (week < 3) return false;
  const weeklyAverage = month / 4;
  return week > weeklyAverage * 1.5;
}

/** The user's own saved/created recipes. */
export async function getMySavedRecipes(): Promise<MealComponent[]> {
  const userId = await getCurrentUserId();
  if (!userId) return [];

  const { data, error } = await supabase
    .from('recipes')
    .select(RECIPE_CARD_FIELDS)
    .eq('owner_user_id', userId)
    .eq('source', 'user')
    .is('deleted_at', null)
    .order('updated_at', { ascending: false })
    .returns<RecipeRow[]>();

  if (error || !data) {
    if (error) console.error('[recipeLibraryService] getMySavedRecipes error:', error);
    return [];
  }

  return attachAuthorNames(data.map(mapRecipeRow));
}

/** Ids the user has favorited (used to drive the heart state in the UI). */
export async function getFavoriteRecipeIds(): Promise<string[]> {
  const userId = await getCurrentUserId();
  if (!userId) return [];

  const { data, error } = await supabase
    .from('recipe_favorites')
    .select('recipe_id')
    .eq('user_id', userId)
    .returns<RecipeFavoriteRow[]>();

  if (error || !data) {
    if (error) console.error('[recipeLibraryService] getFavoriteRecipeIds error:', error);
    return [];
  }

  return data.map(row => row.recipe_id);
}

/** Full recipe cards for the user's favorites. */
export async function getFavoriteRecipes(favoriteIds: string[]): Promise<MealComponent[]> {
  if (favoriteIds.length === 0) return [];

  const { data, error } = await supabase
    .from('recipes')
    .select(RECIPE_CARD_FIELDS)
    .in('id', favoriteIds)
    .is('deleted_at', null)
    .returns<RecipeRow[]>();

  if (error || !data) {
    if (error) console.error('[recipeLibraryService] getFavoriteRecipes error:', error);
    return [];
  }

  const byId = new Map(data.map(row => [row.id, row]));
  const ordered = favoriteIds
    .map(id => byId.get(id))
    .filter((row): row is RecipeRow => Boolean(row))
    .map(mapRecipeRow);
  return attachAuthorNames(ordered);
}

/** Per-user usage summary for local sorting in Mine/Favorites. */
export async function getRecipePersonalUsageSummaries(recipeIds: string[]): Promise<RecipePersonalUsageSummary[]> {
  const userId = await getCurrentUserId();
  const uniqueRecipeIds = Array.from(new Set(recipeIds.filter(Boolean)));
  if (!userId || uniqueRecipeIds.length === 0) return [];

  const { data, error } = await supabase
    .from('recipe_usage_events')
    .select('recipe_id, used_at')
    .eq('user_id', userId)
    .in('recipe_id', uniqueRecipeIds)
    .order('used_at', { ascending: false })
    .returns<RecipeUsageEventRow[]>();

  if (error || !data) {
    if (error) console.error('[recipeLibraryService] getRecipePersonalUsageSummaries error:', error);
    return [];
  }

  const summaries = new Map<string, RecipePersonalUsageSummary>();

  for (const event of data) {
    const current = summaries.get(event.recipe_id);
    if (current) {
      current.useCount += 1;
      if (!current.lastUsedAt || Date.parse(event.used_at) > Date.parse(current.lastUsedAt)) {
        current.lastUsedAt = event.used_at;
      }
    } else {
      summaries.set(event.recipe_id, {
        recipeId: event.recipe_id,
        lastUsedAt: event.used_at,
        useCount: 1,
      });
    }
  }

  return Array.from(summaries.values());
}

/** Toggle a favorite; returns the new favorite state (true = now favorited). */
export async function toggleFavoriteRecipe(recipeId: string, isCurrentlyFavorite: boolean): Promise<boolean> {
  const userId = await getCurrentUserId();
  if (!userId) return isCurrentlyFavorite;

  if (isCurrentlyFavorite) {
    const { error } = await supabase.from('recipe_favorites').delete().eq('user_id', userId).eq('recipe_id', recipeId);
    if (error) {
      console.error('[recipeLibraryService] remove favorite error:', error);
      return true;
    }
    return false;
  }

  const { error } = await supabase.from('recipe_favorites').insert({ user_id: userId, recipe_id: recipeId });
  if (error) {
    console.error('[recipeLibraryService] add favorite error:', error);
    return false;
  }
  return true;
}

export async function softDeleteOwnRecipe(
  recipeId: string,
  userId: string,
): Promise<{ success: boolean; error?: string }> {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('recipes')
    .update(buildRecipeSoftDeletePayload(now))
    .eq('id', recipeId)
    .eq('owner_user_id', userId)
    .eq('source', 'user')
    .is('deleted_at', null)
    .select('id')
    .maybeSingle<{ id: string }>();

  if (error) {
    console.error('[recipeLibraryService] soft delete recipe error:', error);
    return { success: false, error: error.message };
  }

  if (!data) {
    return { success: false, error: 'recipe_not_found_or_not_owned' };
  }

  return { success: true };
}
