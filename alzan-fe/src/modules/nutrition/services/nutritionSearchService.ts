// src/modules/nutrition/services/nutritionSearchService.ts
// Service for searching ingredients from the database and barcode scanning

import { supabase } from '../../../lib/supabaseClient';
import { DbIngredient } from '../../../types/requests.types';
import {
  normalizeInput,
  searchIngredientsWithFilters,
  IngredientSearchFilters,
} from '../../../services/ingredientsService';
import { getFoodNutritionById, warmNutritionApiHeaders } from '../../../services/nutritionApi';
import { FoodSearchResult, MealComponent } from '../types/ingredients';
import {
  buildLooseIlikePattern,
  getLocalizedIngredientName,
  getLocalizedIngredientNotes,
  getLocalizedRecipeDescription,
  getLocalizedRecipeName,
  matchesLoosely,
} from '../../../services/localization';

interface RecipeSearchRow {
  id: string;
  name_es: string;
  name_en: string | null;
  name_norm_es: string;
  description_es: string | null;
  description_en: string | null;
  quality_score: number;
}

interface IngredientSearchRow extends DbIngredient {
  notes_es: string | null;
  notes_en: string | null;
}

/**
 * Search for ingredients with filters (category, letter, text)
 * Used by IngredientSearchPanel - includes ALL ingredient categories
 */
export async function searchFoodsWithFilters(filters: IngredientSearchFilters): Promise<MealComponent[]> {
  try {
    const ingredients = await searchIngredientsWithFilters(filters);

    return ingredients.map(ing => ({
      id: `ingredient_${ing.id}`,
      name: getLocalizedIngredientName(ing),
      source: 'database' as const,
      external_id: ing.id,
      category: ing.category,
      itemType: 'ingredient' as const,
      kcal_100: Math.round(ing.kcal_100 || 0),
      protein_g_100: Math.round((ing.protein_g_100 || 0) * 10) / 10,
      carbs_g_100: Math.round((ing.carbs_g_100 || 0) * 10) / 10,
      fat_g_100: Math.round((ing.fat_g_100 || 0) * 10) / 10,
      // Extended info for detail modal
      fiber_g_100: ing.fiber_g_100,
      sugar_g_100: ing.sugar_g_100,
      sodium_mg_100: ing.sodium_mg_100,
      salt_g_100: ing.salt_g_100,
      quality_score: ing.quality_score,
      notes_es: ing.notes_es,
      notes_en: ing.notes_en,
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
export async function searchMealByName(query: string): Promise<MealComponent[]> {
  if (!query || query.length < 2) return [];

  const normQuery = normalizeInput(query);
  const likePattern = buildLooseIlikePattern(query);
  const results: MealComponent[] = [];

  // ===== 1. SEARCH RECIPES (partial match) =====
  try {
    const { data: recipes, error } = await supabase
      .from('recipes')
      .select(
        `
                id,
                name_es,
                name_en,
                name_norm_es,
                description_es,
                description_en,
                quality_score
            `,
      )
      .or(`name_norm_es.ilike.%${normQuery}%,name_es.ilike.%${likePattern}%,name_en.ilike.%${likePattern}%`)
      .order('quality_score', { ascending: false })
      .limit(15)
      .returns<RecipeSearchRow[]>();

    if (!error && recipes) {
      const filteredRecipes = recipes.filter(recipe =>
        matchesLoosely(query, recipe.name_es, recipe.name_en, recipe.description_es, recipe.description_en),
      );

      for (const recipe of filteredRecipes) {
        // Calculate macros from recipe_items
        const { data: items } = await supabase
          .from('recipe_items')
          .select(
            `
                        quantity,
                        ingredients (
                            kcal_100,
                            protein_g_100,
                            carbs_g_100,
                            fat_g_100
                        )
                    `,
          )
          .eq('recipe_id', recipe.id);

        let totalKcal = 0,
          totalProtein = 0,
          totalCarbs = 0,
          totalFat = 0;
        let totalWeight = 0;

        if (items && items.length > 0) {
          items.forEach(item => {
            const q = item.quantity || 0;
            totalWeight += q;
            if (item.ingredients) {
              totalKcal += ((item.ingredients.kcal_100 || 0) * q) / 100;
              totalProtein += ((item.ingredients.protein_g_100 || 0) * q) / 100;
              totalCarbs += ((item.ingredients.carbs_g_100 || 0) * q) / 100;
              totalFat += ((item.ingredients.fat_g_100 || 0) * q) / 100;
            }
          });
        }

        const factor = totalWeight > 0 ? 100 / totalWeight : 0;
        results.push({
          id: `recipe_${recipe.id}`,
          name: getLocalizedRecipeName(recipe),
          description: getLocalizedRecipeDescription(recipe) ?? undefined,
          source: 'database',
          external_id: recipe.id,
          itemType: 'recipe',
          quality_score: recipe.quality_score,
          kcal_100: Math.round(totalKcal * factor),
          protein_g_100: Math.round(totalProtein * factor * 10) / 10,
          carbs_g_100: Math.round(totalCarbs * factor * 10) / 10,
          fat_g_100: Math.round(totalFat * factor * 10) / 10,
        });
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
      .or(`name_norm_es.ilike.%${normQuery}%,name_es.ilike.%${likePattern}%,name_en.ilike.%${likePattern}%`)
      .order('quality_score', { ascending: false })
      .limit(15)
      .returns<IngredientSearchRow[]>();

    if (!error && ingredients) {
      ingredients
        .filter(ing => matchesLoosely(query, ing.name_es, ing.name_en, ing.notes_es, ing.notes_en))
        .forEach(ing => {
          results.push({
            id: `ingredient_${ing.id}`,
            name: getLocalizedIngredientName(ing),
            source: 'database',
            external_id: ing.id,
            itemType: 'ingredient',
            category: ing.category,
            quality_score: ing.quality_score,
            source_primary: ing.source_primary,
            source_secondary: ing.source_secondary,
            notes_es: ing.notes_es,
            notes_en: ing.notes_en,
            kcal_100: Math.round(ing.kcal_100 || 0),
            protein_g_100: Math.round((ing.protein_g_100 || 0) * 10) / 10,
            carbs_g_100: Math.round((ing.carbs_g_100 || 0) * 10) / 10,
            fat_g_100: Math.round((ing.fat_g_100 || 0) * 10) / 10,
          });
        });
    }
  } catch (err) {
    console.error('[nutritionSearchService] Precooked search error:', err);
  }

  // Sort: prioritize items that start with the query
  results.sort((a, b) => {
    const aNorm = normalizeInput(a.name);
    const bNorm = normalizeInput(b.name);
    const startA = aNorm.startsWith(normQuery);
    const startB = bNorm.startsWith(normQuery);

    if (startA && !startB) return -1;
    if (!startA && startB) return 1;
    return (b.quality_score || 0) - (a.quality_score || 0);
  });

  return results;
}

// ...

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
  fetchByBarcode,
  warmBarcodeLookup,
};
