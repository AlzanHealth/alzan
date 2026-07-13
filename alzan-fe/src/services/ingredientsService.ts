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

interface IngredientRankedRow extends IngredientRuntimeFields {
  search_rank: number;
}

type SearchIngredientsRpc = {
  rpc: (
    fn: 'search_ingredients_ranked',
    args: {
      p_query: string;
      p_category: IngredientsCategory | null;
      p_locale: string;
      p_limit: number;
    },
  ) => Promise<{ data: IngredientRankedRow[] | null; error: { message: string } | null }>;
};

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

// "Strong" clauses represent the WHOLE query: prefix, in-order substring and
// in-order loose match. They match few rows, so fetching them first guarantees
// that what the user typed always surfaces, instead of being crowded out of the
// limited candidate window by higher quality_score rows that merely share a token.
const buildIngredientStrongClauses = (query: string): string[] => {
  // Commas/parentheses are PostgREST `.or()` control characters; a raw one in the
  // pattern breaks the whole query. Strip them so an accidental "(" never returns
  // zero results.
  const normQuery = normalizeInput(query).replace(/[(),]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!normQuery) return [];

  const likePattern = buildLooseIlikePattern(query).replace(/['"()]/g, '');
  return Array.from(
    new Set([
      `name_norm_es.ilike.${normQuery}%`,
      `name_es.ilike.${likePattern}%`,
      `name_en.ilike.${likePattern}%`,
      `name_norm_es.ilike.%${normQuery}%`,
      `name_es.ilike.%${likePattern}%`,
      `name_en.ilike.%${likePattern}%`,
    ]),
  );
};

// "Broad" clauses match each token independently (order-independent recall, e.g.
// "pollo pechuga" still finding "Pechuga de pollo"). Used only to top up results.
const buildIngredientBroadClauses = (query: string): string[] =>
  buildTokenIlikeClauses(query, ['name_norm_es', 'name_es', 'name_en']);

interface IngredientRowQueryOptions {
  category?: IngredientsCategory | 'todas';
  excludeIds?: string[];
  candidateLimit: number;
}

const fetchIngredientRows = async (
  orClauses: string[],
  { category, excludeIds, candidateLimit }: IngredientRowQueryOptions,
): Promise<IngredientRuntimeFields[]> => {
  if (orClauses.length === 0) return [];

  let supabaseQuery = supabase.from('ingredients').select('*');

  if (category && category !== 'todas') {
    supabaseQuery = supabaseQuery.eq('category', category);
  }

  supabaseQuery = supabaseQuery.or(orClauses.join(','));

  if (excludeIds && excludeIds.length > 0) {
    supabaseQuery = supabaseQuery.not('id', 'in', `(${excludeIds.join(',')})`);
  }

  supabaseQuery = supabaseQuery.order('quality_score', { ascending: false }).limit(candidateLimit);

  const { data, error } = await withTimeout(
    supabaseQuery.returns<IngredientRuntimeFields[]>(),
    INGREDIENT_SEARCH_TIMEOUT_MS,
  );

  if (error) {
    console.error('[ingredientsService] Candidate fetch error:', error);
    return [];
  }

  return data ?? [];
};

const matchesLetter = (ingredient: IngredientSearchResult, letter: string): boolean => {
  const firstLetterEs = (ingredient.name_es || '').trim().charAt(0).toLowerCase();
  const firstLetterEn = (ingredient.name_en || '').trim().charAt(0).toLowerCase();
  return firstLetterEs === letter || firstLetterEn === letter;
};

// Two-phase candidate fetch shared by the query-based searches: strong matches
// first (always surface), then broad token matches to fill the remaining slots.
const fetchRankedIngredients = async (
  query: string,
  languageCode: Locale,
  maxResults: number,
  options: { category?: IngredientsCategory | 'todas'; letter?: string } = {},
): Promise<IngredientSearchResult[]> => {
  const baseCandidateLimit = Math.max(maxResults * INGREDIENT_CANDIDATE_MULTIPLIER, INGREDIENT_CANDIDATE_FLOOR);
  const candidateLimit = options.letter ? baseCandidateLimit * 2 : baseCandidateLimit;

  const toLocalized = (rows: IngredientRuntimeFields[]): IngredientSearchResult[] =>
    rows
      .filter(item => !isRecipeOnlyIngredientSource(item.source_primary))
      .map(item => mapIngredientResult(item, languageCode))
      .filter(ing => matchesLoosely(query, ing.name_es, ing.name_en, ing.notes_es, ing.notes_en))
      .filter(ing => !options.letter || matchesLetter(ing, options.letter));

  try {
    const strongRows = await fetchIngredientRows(buildIngredientStrongClauses(query), {
      category: options.category,
      candidateLimit,
    });

    const byId = new Map<string, IngredientSearchResult>();
    toLocalized(strongRows).forEach(item => byId.set(item.id, item));

    if (byId.size < maxResults) {
      const broadRows = await fetchIngredientRows(buildIngredientBroadClauses(query), {
        category: options.category,
        excludeIds: Array.from(byId.keys()),
        candidateLimit,
      });
      toLocalized(broadRows).forEach(item => {
        if (!byId.has(item.id)) byId.set(item.id, item);
      });
    }

    return sortIngredientResults(Array.from(byId.values()), query).slice(0, maxResults);
  } catch (err) {
    console.error('[ingredientsService] Unexpected error:', err);
    return [];
  }
};

export const searchIngredients = async (
  query: string,
  locale?: Locale,
  maxResults = 10,
): Promise<IngredientSearchResult[]> => {
  const languageCode = locale ?? getCurrentAppLocale();
  const normQuery = normalizeInput(query);
  if (!normQuery || normQuery.length < 2) return [];

  const { data, error } = await (supabase as unknown as SearchIngredientsRpc).rpc('search_ingredients_ranked', {
    p_query: query,
    p_category: null,
    p_locale: languageCode,
    p_limit: maxResults,
  });

  if (error || !data) {
    if (error) console.error('[ingredientsService] search RPC error:', error);
    return fetchRankedIngredients(query, languageCode, maxResults);
  }

  return data.map(item => mapIngredientResult(item, languageCode));
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

  // Text search: two-phase (strong-first) fetch so the typed term always surfaces.
  if (hasQuery && query) {
    const rpcLimit = hasLetterFilter ? Math.max(maxResults * 4, 40) : maxResults;
    const { data, error } = await (supabase as unknown as SearchIngredientsRpc).rpc('search_ingredients_ranked', {
      p_query: query,
      p_category: category && category !== 'todas' ? category : null,
      p_locale: languageCode,
      p_limit: rpcLimit,
    });

    if (error || !data) {
      if (error) console.error('[ingredientsService] filtered search RPC error:', error);
      return fetchRankedIngredients(query, languageCode, maxResults, {
        category,
        letter: hasLetterFilter ? normalizedLetter : undefined,
      });
    }

    return data
      .map(item => mapIngredientResult(item, languageCode))
      .filter(ing => !hasLetterFilter || matchesLetter(ing, normalizedLetter))
      .slice(0, maxResults);
  }

  // Filter-only browsing (category and/or letter), ordered by quality.
  let supabaseQuery = supabase.from('ingredients').select('*');

  if (category && category !== 'todas') {
    supabaseQuery = supabaseQuery.eq('category', category);
  }

  if (hasLetterFilter) {
    supabaseQuery = supabaseQuery.or(`name_es.ilike.${normalizedLetter}%,name_en.ilike.${normalizedLetter}%`);
  }

  const candidateLimit = Math.max(maxResults * INGREDIENT_CANDIDATE_MULTIPLIER, INGREDIENT_CANDIDATE_FLOOR);
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

    return data
      .filter(item => !isRecipeOnlyIngredientSource(item.source_primary))
      .map(item => mapIngredientResult(item, languageCode))
      .filter(ing => !hasLetterFilter || matchesLetter(ing, normalizedLetter))
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
