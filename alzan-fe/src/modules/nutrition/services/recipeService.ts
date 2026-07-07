// src/modules/nutrition/services/recipeService.ts
import { supabase } from '../../../lib/supabaseClient';
import { RecipeItemsUnit } from '../../../types/requests.types';
import {
  buildLooseIlikePattern,
  getCurrentAppLocale,
  getLocalizedIngredientName,
  getLocalizedRecipeDescription,
  getLocalizedRecipeName,
  matchesLoosely,
} from '../../../services/localization';
import { Locale } from '../../../i18n';

/**
 * Normalize a string for matching: lowercase, trim, remove accents
 */
export function normalizeString(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export interface RecipeMatch {
  id: string;
  name: string;
  name_es: string;
  name_en: string | null;
  description: string | null;
  description_es: string | null;
  description_en: string | null;
}

export interface RecipeIngredient {
  id: string;
  ingredient_id: string;
  ingredient_name: string;
  ingredient_name_es: string;
  ingredient_name_en: string;
  quantity: number;
  unit: RecipeItemsUnit;
  order_index: number;
  // Nutritional data per 100g from ingredients table
  kcal_100: number | null;
  protein_g_100: number | null;
  carbs_g_100: number | null;
  fat_g_100: number | null;
}

interface RecipeRow {
  id: string;
  name_es: string;
  name_en: string | null;
  name_norm_es: string;
  description_es: string | null;
  description_en: string | null;
  quality_score?: number;
}

interface EditableUserRecipeRow {
  id: string;
  name_es: string;
  name_en: string | null;
  source: 'system' | 'user';
  owner_user_id: string | null;
  updated_at: string;
}

interface RecipeAliasLookupRow {
  recipe_id: string;
  recipes: RecipeRow | RecipeRow[] | null;
}

interface RecipeIngredientRow {
  id: string;
  ingredient_id: string;
  quantity: number;
  unit: RecipeItemsUnit;
  order_index: number;
  ingredients: {
    name_es: string;
    name_en: string | null;
    kcal_100: number | null;
    protein_g_100: number | null;
    carbs_g_100: number | null;
    fat_g_100: number | null;
  } | null;
}

function mapRecipeMatch(recipe: RecipeRow, languageCode: Locale): RecipeMatch {
  return {
    id: recipe.id,
    name: getLocalizedRecipeName(recipe, languageCode),
    name_es: recipe.name_es,
    name_en: recipe.name_en,
    description: getLocalizedRecipeDescription(recipe, languageCode),
    description_es: recipe.description_es,
    description_en: recipe.description_en,
  };
}

/**
 * Search for a recipe by name (normalized matching)
 * Returns the best match if found
 */
export async function searchRecipeByName(name: string, locale?: Locale): Promise<RecipeMatch | null> {
  const languageCode = locale ?? getCurrentAppLocale();
  const normalized = normalizeString(name);
  const likePattern = buildLooseIlikePattern(name);
  console.log(`[recipeService] Searching for: "${name}" -> Normalized: "${normalized}"`);

  if (!normalized || normalized.length < 3) {
    console.log('[recipeService] Search term too short');
    return null;
  }

  try {
    // First try exact match on normalized name
    console.log('[recipeService] Attempting exact match...');
    const { data: exactMatches, error: exactError } = await supabase
      .from('recipes')
      .select('id, name_es, name_en, name_norm_es, description_es, description_en')
      .eq('name_norm_es', normalized)
      .limit(1)
      .returns<RecipeRow[]>();

    if (exactError) {
      // Log the FULL error to see what's happening
      console.error('[recipeService] FULL ERROR for "recipes":', JSON.stringify(exactError, null, 2));
      return null;
    }

    const exactMatch = exactMatches?.[0];
    if (exactMatch) {
      console.log('[recipeService] Exact match found:', exactMatch);
      return mapRecipeMatch(exactMatch, languageCode);
    } else {
      console.log('[recipeService] No exact match found');
    }

    // Try to find by alias
    console.log('[recipeService] Attempting alias match...');
    const { data: aliasMatches, error: aliasError } = await supabase
      .from('recipe_aliases')
      .select('recipe_id, recipes(id, name_es, name_en, name_norm_es, description_es, description_en)')
      .eq('alias_norm_es', normalized)
      .limit(1)
      .returns<RecipeAliasLookupRow[]>();

    if (aliasError && aliasError.code !== 'PGRST205') {
      console.error('[recipeService] Error searching recipe alias:', aliasError);
    }

    const aliasMatch = aliasMatches?.[0];
    if (aliasMatch && aliasMatch.recipes) {
      console.log('[recipeService] Alias match found:', aliasMatch);
      const recipe = Array.isArray(aliasMatch.recipes) ? aliasMatch.recipes[0] : aliasMatch.recipes;
      return recipe ? mapRecipeMatch(recipe, languageCode) : null;
    } else {
      console.log('[recipeService] No alias match found');
    }

    // If no exact match, try partial match (starts with)
    console.log('[recipeService] Attempting partial match...');
    const { data: partialMatches, error: partialError } = await supabase
      .from('recipes')
      .select('id, name_es, name_en, name_norm_es, description_es, description_en')
      .or(`name_norm_es.ilike.%${normalized}%,name_es.ilike.%${likePattern}%,name_en.ilike.%${likePattern}%`)
      .limit(10)
      .returns<RecipeRow[]>();

    if (partialError && partialError.code !== 'PGRST205') {
      console.error('[recipeService] Error searching partial recipe:', partialError);
    }

    const bestPartialMatch = partialMatches?.find(recipe =>
      matchesLoosely(name, recipe.name_es, recipe.name_en, recipe.description_es, recipe.description_en),
    );

    if (bestPartialMatch) {
      console.log('[recipeService] Partial match found:', bestPartialMatch);
      return mapRecipeMatch(bestPartialMatch, languageCode);
    } else {
      console.log('[recipeService] No partial match found');
    }

    return null;
  } catch (error) {
    // Silent fail for unexpected errors during search to avoid spam
    console.error('[recipeService] Unexpected error:', error);
    return null;
  }
}

/**
 * Get all ingredients for a recipe
 */
export async function getRecipeIngredients(recipeId: string, locale?: Locale) {
  const languageCode = locale ?? getCurrentAppLocale();
  console.log('[recipeService] Fetching ingredients for recipeId:', recipeId);
  try {
    const { data, error } = await supabase
      .from('recipe_items')
      .select(
        `
                id,
                ingredient_id,
                quantity,
                unit,
                order_index,
                ingredients (
                    name_es,
                    name_en,
                    kcal_100,
                    protein_g_100,
                    carbs_g_100,
                    fat_g_100
                )
            `,
      )
      .eq('recipe_id', recipeId)
      .order('order_index', { ascending: true })
      .returns<RecipeIngredientRow[]>();

    console.log(
      '[recipeService] recipe_items query result - data:',
      JSON.stringify(data),
      'error:',
      JSON.stringify(error),
    );

    if (error) {
      console.error('[recipeService] Error fetching recipe ingredients:', JSON.stringify(error));
      return [];
    }

    if (!data || data.length === 0) {
      console.warn('[recipeService] No recipe_items found for this recipe');
      return [];
    }

    return data.map(item => ({
      id: item.id,
      ingredient_id: item.ingredient_id,
      ingredient_name: getLocalizedIngredientName(
        {
          name_es: item.ingredients?.name_es || '',
          name_en: item.ingredients?.name_en || null,
        },
        languageCode,
      ),
      ingredient_name_es: item.ingredients?.name_es || 'Unknown',
      ingredient_name_en: item.ingredients?.name_en || '',
      quantity: item.quantity,
      unit: item.unit,
      order_index: item.order_index,
      kcal_100: item.ingredients?.kcal_100 || null,
      protein_g_100: item.ingredients?.protein_g_100 || null,
      carbs_g_100: item.ingredients?.carbs_g_100 || null,
      fat_g_100: item.ingredients?.fat_g_100 || null,
    }));
  } catch (error) {
    console.error('[recipeService] Unexpected error fetching ingredients:', error);
    return [];
  }
}

export type RecipeVisibility = 'private' | 'public';

export interface EditableUserRecipe {
  id: string;
  name: string;
  updated_at: string;
  ingredients: RecipeIngredient[];
}

export async function getEditableUserRecipe(
  recipeId: string,
  currentUserId: string,
  locale?: Locale,
): Promise<EditableUserRecipe | null> {
  const languageCode = locale ?? getCurrentAppLocale();
  const { data: recipe, error } = await supabase
    .from('recipes')
    .select('id, name_es, name_en, source, owner_user_id, updated_at')
    .eq('id', recipeId)
    .is('deleted_at', null)
    .maybeSingle<EditableUserRecipeRow>();

  if (error) {
    console.error('[recipeService] Error loading editable recipe:', error);
    throw error;
  }

  if (!recipe || recipe.source !== 'user' || recipe.owner_user_id !== currentUserId) {
    return null;
  }

  return {
    id: recipe.id,
    name: getLocalizedRecipeName(recipe, languageCode),
    updated_at: recipe.updated_at,
    ingredients: await getRecipeIngredients(recipe.id, languageCode),
  };
}

/**
 * Set the visibility of all of a user's own (source = 'user', not deleted) recipes.
 */
export const setUserRecipesVisibility = async (
  userId: string,
  visibility: RecipeVisibility,
): Promise<{ success: boolean; error?: string }> => {
  const { error } = await supabase
    .from('recipes')
    .update({
      visibility,
      updated_at: new Date().toISOString(),
    })
    .eq('owner_user_id', userId)
    .eq('source', 'user')
    .is('deleted_at', null);

  if (error) {
    console.error('[recipeService] Error updating recipe visibility:', error);
    return { success: false, error: error.message };
  }

  return { success: true };
};
