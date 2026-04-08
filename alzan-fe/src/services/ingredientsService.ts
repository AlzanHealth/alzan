import { supabase } from '../lib/supabaseClient';
import { DbIngredient, IngredientsCategory, Insert } from '../types/requests.types';
import {
  buildLooseIlikePattern,
  getLocalizedIngredientName,
  getLocalizedIngredientNotes,
  matchesLoosely,
  normalizeSearchText,
} from './localization';

export interface CalculatedMacros {
  energy_kcal: number;
  protein_g: number;
  carbs_g: number;
  fats_g: number;
}

interface IngredientRuntimeFields extends DbIngredient {}

export interface IngredientSearchResult extends IngredientRuntimeFields {
  name: string;
  notes: string | null;
}

// 1. Normalization
export const normalizeInput = (str: string): string => {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
};

// 2. Search
function mapIngredientResult(ingredient: IngredientRuntimeFields): IngredientSearchResult {
  return {
    ...ingredient,
    name: getLocalizedIngredientName(ingredient),
    notes: getLocalizedIngredientNotes(ingredient),
  };
}

function sortIngredientResults(results: IngredientSearchResult[], query: string): IngredientSearchResult[] {
  const normalizedQuery = normalizeSearchText(query);

  return results.sort((a, b) => {
    const startA = [a.name_es, a.name_en]
      .map(name => normalizeSearchText(name ?? ''))
      .some(name => name.startsWith(normalizedQuery));
    const startB = [b.name_es, b.name_en]
      .map(name => normalizeSearchText(name ?? ''))
      .some(name => name.startsWith(normalizedQuery));

    if (startA && !startB) return -1;
    if (!startA && startB) return 1;

    return (b.quality_score || 0) - (a.quality_score || 0);
  });
}

export const searchIngredients = async (query: string): Promise<IngredientSearchResult[]> => {
  const normQuery = normalizeInput(query);
  const likePattern = buildLooseIlikePattern(query);
  if (!normQuery) return [];

  console.log(`[ingredientsService] Searching for normalized query: "${normQuery}"`);

  try {
    console.log(`[ingredientsService] Trying similar match with ILIKE...`);
    const { data, error } = await supabase
      .from('ingredients')
      .select('*')
      .or(`name_norm_es.ilike.%${normQuery}%,name_es.ilike.%${likePattern}%,name_en.ilike.%${likePattern}%`)
      .order('quality_score', { ascending: false })
      .limit(25)
      .returns<IngredientRuntimeFields[]>();

    if (error) {
      console.error('[ingredientsService] Similar match error:', JSON.stringify(error));
      return [];
    }

    if (!data || data.length === 0) {
      console.log(`[ingredientsService] No results found for: "${normQuery}"`);
      return [];
    }

    const localizedResults = data
      .map(mapIngredientResult)
      .filter(ing => matchesLoosely(query, ing.name_es, ing.name_en, ing.notes_es, ing.notes_en));

    console.log(`[ingredientsService] Found ${localizedResults.length} similar matches`);
    localizedResults.forEach((ing, i) => {
      console.log(`  ${i + 1}. ${ing.name_es} (norm: ${ing.name_norm_es})`);
    });

    return sortIngredientResults(localizedResults, query);
  } catch (err) {
    console.error('[ingredientsService] Unexpected error:', err);
    return [];
  }
};

// 3. Create (Manual)
export const createIngredient = async (ingredient: Insert<'ingredients'>) => {
  // Ensure normalization
  ingredient.name_norm_es = normalizeInput(ingredient.name_es);

  const { data, error } = await supabase.from('ingredients').insert(ingredient).select().single();

  if (error) {
    console.error('Error creating ingredient:', error);
    return null;
  }
  return data;
};

// 4. Search with Filters (for enhanced Buscar mode)
export interface IngredientSearchFilters {
  query?: string;
  category?: IngredientsCategory | 'todas';
  letter?: string; // A-Z
}

export const searchIngredientsWithFilters = async (
  filters: IngredientSearchFilters,
): Promise<IngredientSearchResult[]> => {
  const { query, category, letter } = filters;
  const likePattern = query ? buildLooseIlikePattern(query) : '';

  // Build query
  let supabaseQuery = supabase.from('ingredients').select('*');

  // Filter by category
  if (category && category !== 'todas') {
    supabaseQuery = supabaseQuery.eq('category', category);
  }

  // Filter by first letter
  if (letter && letter !== 'todas') {
    // Use ILIKE to match names starting with the letter (case-insensitive)
    supabaseQuery = supabaseQuery.or(`name_es.ilike.${letter}%,name_en.ilike.${letter}%`);
  }

  // Filter by text query (partial match)
  if (query && query.length >= 2) {
    const normQuery = normalizeInput(query);
    supabaseQuery = supabaseQuery.or(
      `name_norm_es.ilike.%${normQuery}%,name_es.ilike.%${likePattern}%,name_en.ilike.%${likePattern}%`,
    );
  }

  // Order and limit
  supabaseQuery = supabaseQuery.order('quality_score', { ascending: false }).limit(100);

  try {
    const { data, error } = await supabaseQuery.returns<IngredientRuntimeFields[]>();

    if (error) {
      console.error('[ingredientsService] Filter search error:', error);
      return [];
    }

    if (!data || data.length === 0) {
      return [];
    }

    const localizedResults = data
      .map(mapIngredientResult)
      .filter(
        ing =>
          !query || query.length < 2 || matchesLoosely(query, ing.name_es, ing.name_en, ing.notes_es, ing.notes_en),
      );

    // If there's a query, prioritize items that start with it
    if (query && query.length >= 2) {
      return sortIngredientResults(localizedResults, query);
    }

    return localizedResults;
  } catch (err) {
    console.error('[ingredientsService] Unexpected error in filter search:', err);
    return [];
  }
};

// 5. Calculate Macros
export const calculateMacros = (ingredient: DbIngredient, amount: number): CalculatedMacros => {
  const ratio = amount / 100;
  return {
    energy_kcal: Math.round((ingredient.kcal_100 || 0) * ratio),
    protein_g: Number(((ingredient.protein_g_100 || 0) * ratio).toFixed(1)),
    carbs_g: Number(((ingredient.carbs_g_100 || 0) * ratio).toFixed(1)),
    fats_g: Number(((ingredient.fat_g_100 || 0) * ratio).toFixed(1)),
  };
};
