import { supabase } from '../lib/supabaseClient';
import { DbIngredient, IngredientsCategory, Insert } from '../types/requests.types';
import {
  buildTokenIlikeClauses,
  buildLooseIlikePattern,
  getCurrentAppLocale,
  getLocalizedIngredientName,
  getLocalizedIngredientNotes,
  getSearchRelevanceScore,
  matchesLoosely,
  normalizeSearchText,
} from './localization';
import { Locale } from '../i18n';

export interface CalculatedMacros {
  energy_kcal: number;
  protein_g: number;
  carbs_g: number;
  fats_g: number;
}

interface IngredientRuntimeFields extends DbIngredient {
  notes_es: string | null;
  notes_en: string | null;
}

export interface IngredientSearchResult extends IngredientRuntimeFields {
  name: string;
  notes: string | null;
}

const INGREDIENT_SEARCH_TIMEOUT_MS = 7000;
const INGREDIENT_CANDIDATE_MULTIPLIER = 6;
const INGREDIENT_CANDIDATE_FLOOR = 60;

export function isRecipeOnlyIngredientSource(source: DbIngredient['source_primary']): boolean {
  if (!source || typeof source !== 'object') {
    return false;
  }

  return source.recipe_only === true || source.recipe_only === 'true';
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
function mapIngredientResult(ingredient: IngredientRuntimeFields, languageCode: Locale): IngredientSearchResult {
  return {
    ...ingredient,
    name: getLocalizedIngredientName(ingredient, languageCode),
    notes: getLocalizedIngredientNotes(ingredient, languageCode),
  };
}

function sortIngredientResults(results: IngredientSearchResult[], query: string): IngredientSearchResult[] {
  return results.sort((a, b) => {
    const scoreA = getSearchRelevanceScore(query, a.name, a.name_es, a.name_en, a.notes, a.notes_es, a.notes_en);
    const scoreB = getSearchRelevanceScore(query, b.name, b.name_es, b.name_en, b.notes, b.notes_es, b.notes_en);

    if (scoreA !== scoreB) return scoreB - scoreA;

    const qualityDiff = (b.quality_score || 0) - (a.quality_score || 0);
    if (qualityDiff !== 0) return qualityDiff;

    return normalizeSearchText(a.name).localeCompare(normalizeSearchText(b.name));
  });
}

const withTimeout = async <T>(promiseLike: PromiseLike<T>, timeoutMs: number): Promise<T> => {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  try {
    const timeoutPromise = new Promise<T>((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(new Error('Ingredient search timed out'));
      }, timeoutMs);
    });

    return await Promise.race([Promise.resolve(promiseLike), timeoutPromise]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
};

const buildIngredientSearchClauses = (query: string): string[] => {
  const normQuery = normalizeInput(query);
  if (!normQuery) return [];

  const likePattern = buildLooseIlikePattern(query).replace(/['"()]/g, '');
  const startsWithNormPattern = `${normQuery}%`;
  const startsWithLoosePattern = `${likePattern}%`;
  const tokenClauses = buildTokenIlikeClauses(query, ['name_norm_es', 'name_es', 'name_en']);

  return Array.from(
    new Set([
      `name_norm_es.ilike.${startsWithNormPattern}`,
      `name_es.ilike.${startsWithLoosePattern}`,
      `name_en.ilike.${startsWithLoosePattern}`,
      `name_norm_es.ilike.%${normQuery}%`,
      `name_es.ilike.%${likePattern}%`,
      `name_en.ilike.%${likePattern}%`,
      ...tokenClauses,
    ]),
  );
};

export const searchIngredients = async (
  query: string,
  locale?: Locale,
  maxResults = 10,
): Promise<IngredientSearchResult[]> => {
  const languageCode = locale ?? getCurrentAppLocale();
  const normQuery = normalizeInput(query);
  if (!normQuery || normQuery.length < 2) return [];

  const orClauses = buildIngredientSearchClauses(query);

  try {
    const candidateLimit = Math.max(maxResults * INGREDIENT_CANDIDATE_MULTIPLIER, INGREDIENT_CANDIDATE_FLOOR);
    const { data, error } = await withTimeout(
      supabase
        .from('ingredients')
        .select('*')
        .or(orClauses.join(','))
        .order('quality_score', { ascending: false })
        .limit(candidateLimit)
        .returns<IngredientRuntimeFields[]>(),
      INGREDIENT_SEARCH_TIMEOUT_MS,
    );

    if (error) {
      console.error('[ingredientsService] Search error:', JSON.stringify(error));
      return [];
    }

    if (!data || data.length === 0) {
      return [];
    }

    const localizedResults = data
      .filter(item => !isRecipeOnlyIngredientSource(item.source_primary))
      .map(item => mapIngredientResult(item, languageCode))
      .filter(ing => matchesLoosely(query, ing.name_es, ing.name_en, ing.notes_es, ing.notes_en));

    return sortIngredientResults(localizedResults, query).slice(0, maxResults);
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
  locale?: Locale,
  maxResults = 10,
): Promise<IngredientSearchResult[]> => {
  const languageCode = locale ?? getCurrentAppLocale();
  const { query, category, letter } = filters;
  const hasQuery = !!query && query.length >= 2;
  const normalizedLetter = letter?.toLowerCase() ?? 'todas';
  const hasLetterFilter = normalizedLetter !== 'todas';
  const orClauses = hasQuery ? buildIngredientSearchClauses(query) : [];

  // Build query
  let supabaseQuery = supabase.from('ingredients').select('*');

  // Filter by category
  if (category && category !== 'todas') {
    supabaseQuery = supabaseQuery.eq('category', category);
  }

  // Filter by text query (partial match)
  if (hasQuery && orClauses.length > 0) {
    supabaseQuery = supabaseQuery.or(orClauses.join(','));
  }

  // When only letter filter is active, keep filtering at DB level for better coverage.
  if (!hasQuery && hasLetterFilter) {
    supabaseQuery = supabaseQuery.or(`name_es.ilike.${normalizedLetter}%,name_en.ilike.${normalizedLetter}%`);
  }

  const baseCandidateLimit = Math.max(maxResults * INGREDIENT_CANDIDATE_MULTIPLIER, INGREDIENT_CANDIDATE_FLOOR);
  const candidateLimit = hasQuery && hasLetterFilter ? baseCandidateLimit * 2 : baseCandidateLimit;

  // Order and limit
  supabaseQuery = supabaseQuery.order('quality_score', { ascending: false }).limit(candidateLimit);

  try {
    const { data, error } = await withTimeout(
      supabaseQuery.returns<IngredientRuntimeFields[]>(),
      INGREDIENT_SEARCH_TIMEOUT_MS,
    );

    if (error) {
      console.error('[ingredientsService] Filter search error:', error);
      return [];
    }

    if (!data || data.length === 0) {
      return [];
    }

    const localizedResults = data
      .filter(item => !isRecipeOnlyIngredientSource(item.source_primary))
      .map(item => mapIngredientResult(item, languageCode))
      .filter(ing => {
        if (!hasLetterFilter) return true;

        const firstLetterEs = (ing.name_es || '').trim().charAt(0).toLowerCase();
        const firstLetterEn = (ing.name_en || '').trim().charAt(0).toLowerCase();
        return firstLetterEs === normalizedLetter || firstLetterEn === normalizedLetter;
      })
      .filter(ing => !hasQuery || matchesLoosely(query, ing.name_es, ing.name_en, ing.notes_es, ing.notes_en));

    // If there's a query, prioritize items that start with it
    if (hasQuery) {
      return sortIngredientResults(localizedResults, query).slice(0, maxResults);
    }

    return localizedResults
      .sort((a, b) => {
        const qualityDiff = (b.quality_score || 0) - (a.quality_score || 0);
        if (qualityDiff !== 0) return qualityDiff;
        return normalizeSearchText(a.name).localeCompare(normalizeSearchText(b.name));
      })
      .slice(0, maxResults);
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
