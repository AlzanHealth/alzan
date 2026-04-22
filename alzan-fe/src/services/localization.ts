import i18n, { getValidLocale, Locale } from '../i18n';

export interface LocalizedRecipeFields {
  name_es: string;
  name_en: string | null;
  description_es: string | null;
  description_en: string | null;
}

export interface LocalizedIngredientFields {
  name_es: string;
  name_en: string | null;
  notes_es?: string | null;
  notes_en?: string | null;
  notes?: string | null;
}

export interface LocalizedExerciseFields {
  base_name?: string;
  base_name_es?: string | null;
  base_name_en?: string | null;
  description?: string | null;
  description_es?: string | null;
  description_en?: string | null;
}

export type NormalizedExerciseDifficulty = 'beginner' | 'intermediate' | 'advanced';
export type ExerciseLoadType = 'bodyweight' | 'external' | 'assisted' | 'mixed';
export type ExerciseProgressDisplayMetric = 'weight' | 'reps' | 'time';
const SEARCH_STOP_WORDS = new Set([
  'de',
  'del',
  'la',
  'las',
  'el',
  'los',
  'y',
  'e',
  'en',
  'con',
  'por',
  'para',
  'the',
  'of',
  'and',
  'to',
  'a',
  'an',
  'da',
  'do',
]);

function normalizeText(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function resolveLocale(locale?: Locale): Locale {
  return locale ? getValidLocale(locale) : getCurrentAppLocale();
}

export function getCurrentAppLocale(): Locale {
  const [languageCode] = i18n.language.split('-');
  return getValidLocale(languageCode);
}

export function normalizeSearchText(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function compactSearchText(value: string): string {
  return normalizeSearchText(value).replace(/\s+/g, '');
}

function singularizeToken(token: string): string {
  if (token.length <= 3) return token;
  if (token.endsWith('es') && token.length > 4) return token.slice(0, -2);
  if (token.endsWith('s') && token.length > 3) return token.slice(0, -1);
  return token;
}

export function tokenizeSearchTerms(value: string): string[] {
  const normalized = normalizeSearchText(value);
  if (!normalized) return [];

  const baseTokens = normalized.split(' ').filter(Boolean).map(singularizeToken);
  const filteredTokens = baseTokens.filter(token => !SEARCH_STOP_WORDS.has(token));

  return Array.from(new Set(filteredTokens.length > 0 ? filteredTokens : baseTokens));
}

export function buildTokenIlikeClauses(query: string, columns: string[]): string[] {
  const tokens = tokenizeSearchTerms(query);
  if (tokens.length === 0) return [];

  return tokens.flatMap(token => columns.map(column => `${column}.ilike.%${token}%`));
}

export function buildLooseIlikePattern(value: string): string {
  return value
    .trim()
    .replace(/[%_,]+/g, ' ')
    .replace(/\s+/g, '%');
}

export function matchesLoosely(query: string, ...candidates: Array<string | null | undefined>): boolean {
  const normalizedQuery = normalizeSearchText(query);
  const compactQuery = compactSearchText(query);
  const queryTokens = tokenizeSearchTerms(query);

  if (!normalizedQuery) return true;

  return candidates.some(candidate => {
    const normalizedCandidate = normalizeSearchText(candidate ?? '');
    const compactCandidate = compactSearchText(candidate ?? '');

    if (!normalizedCandidate) return false;

    if (normalizedCandidate.includes(normalizedQuery) || compactCandidate.includes(compactQuery)) {
      return true;
    }

    if (queryTokens.length === 0) {
      return false;
    }

    const candidateTokens = tokenizeSearchTerms(candidate ?? '');
    if (candidateTokens.length === 0) {
      return false;
    }

    return queryTokens.every(queryToken =>
      candidateTokens.some(
        candidateToken =>
          candidateToken === queryToken || candidateToken.includes(queryToken) || queryToken.includes(candidateToken),
      ),
    );
  });
}

function calculateCandidateRelevance(
  normalizedQuery: string,
  compactQuery: string,
  queryTokens: string[],
  candidate: string | null | undefined,
): number {
  const normalizedCandidate = normalizeSearchText(candidate ?? '');
  if (!normalizedCandidate) {
    return Number.NEGATIVE_INFINITY;
  }

  const compactCandidate = compactSearchText(candidate ?? '');
  const candidateTokens = tokenizeSearchTerms(candidate ?? '');
  let score = 0;

  if (normalizedCandidate === normalizedQuery) score += 1200;
  if (compactCandidate === compactQuery) score += 1050;
  if (normalizedCandidate.startsWith(normalizedQuery)) score += 700;
  if (normalizedCandidate.includes(normalizedQuery)) score += 520;
  if (compactCandidate.includes(compactQuery)) score += 460;

  if (queryTokens.length > 0 && candidateTokens.length > 0) {
    const exactTokenMatches = queryTokens.filter(queryToken => candidateTokens.includes(queryToken)).length;
    const partialTokenMatches = queryTokens.filter(queryToken =>
      candidateTokens.some(
        candidateToken =>
          candidateToken === queryToken || candidateToken.includes(queryToken) || queryToken.includes(candidateToken),
      ),
    ).length;

    if (exactTokenMatches === queryTokens.length) score += 640;
    else if (partialTokenMatches === queryTokens.length) score += 560;

    score += exactTokenMatches * 140;
    score += Math.max(0, partialTokenMatches - exactTokenMatches) * 70;
  }

  return score;
}

export function getSearchRelevanceScore(query: string, ...candidates: Array<string | null | undefined>): number {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return 0;

  const compactQuery = compactSearchText(query);
  const queryTokens = tokenizeSearchTerms(query);

  let bestScore = Number.NEGATIVE_INFINITY;
  candidates.forEach(candidate => {
    const candidateScore = calculateCandidateRelevance(normalizedQuery, compactQuery, queryTokens, candidate);
    if (candidateScore > bestScore) {
      bestScore = candidateScore;
    }
  });

  return Number.isFinite(bestScore) ? bestScore : 0;
}

export function getLocalizedRecipeName(
  recipe: Pick<LocalizedRecipeFields, 'name_es' | 'name_en'>,
  locale?: Locale,
): string {
  const resolvedLocale = resolveLocale(locale);
  const spanishName = normalizeText(recipe.name_es);
  const englishName = normalizeText(recipe.name_en);

  return resolvedLocale === 'en' ? (englishName ?? spanishName ?? '') : (spanishName ?? englishName ?? '');
}

export function getLocalizedRecipeDescription(
  recipe: Pick<LocalizedRecipeFields, 'description_es' | 'description_en'>,
  locale?: Locale,
): string | null {
  const resolvedLocale = resolveLocale(locale);
  const spanishDescription = normalizeText(recipe.description_es);
  const englishDescription = normalizeText(recipe.description_en);

  return resolvedLocale === 'en'
    ? (englishDescription ?? spanishDescription)
    : (spanishDescription ?? englishDescription);
}

export function getLocalizedIngredientName(
  ingredient: Pick<LocalizedIngredientFields, 'name_es' | 'name_en'>,
  locale?: Locale,
): string {
  const resolvedLocale = resolveLocale(locale);
  const spanishName = normalizeText(ingredient.name_es);
  const englishName = normalizeText(ingredient.name_en);

  return resolvedLocale === 'en' ? (englishName ?? spanishName ?? '') : (spanishName ?? englishName ?? '');
}

export function getLocalizedIngredientNotes(
  ingredient: Pick<LocalizedIngredientFields, 'notes_es' | 'notes_en' | 'notes'>,
  locale?: Locale,
): string | null {
  const resolvedLocale = resolveLocale(locale);
  const spanishNotes = normalizeText(ingredient.notes_es);
  const englishNotes = normalizeText(ingredient.notes_en);
  const legacyNotes = normalizeText(ingredient.notes);

  return resolvedLocale === 'en'
    ? (englishNotes ?? spanishNotes ?? legacyNotes)
    : (spanishNotes ?? englishNotes ?? legacyNotes);
}

export function getLocalizedExerciseName(
  exercise: Pick<LocalizedExerciseFields, 'base_name' | 'base_name_es' | 'base_name_en'>,
  locale?: Locale,
): string {
  const resolvedLocale = resolveLocale(locale);
  const legacyName = normalizeText(exercise.base_name);
  const spanishName = normalizeText(exercise.base_name_es);
  const englishName = normalizeText(exercise.base_name_en);

  return resolvedLocale === 'en'
    ? (englishName ?? spanishName ?? legacyName ?? '')
    : (spanishName ?? englishName ?? legacyName ?? '');
}

export function getLocalizedExerciseDescription(
  exercise: Pick<LocalizedExerciseFields, 'description' | 'description_es' | 'description_en'>,
  locale?: Locale,
): string | null {
  const resolvedLocale = resolveLocale(locale);
  const legacyDescription = normalizeText(exercise.description);
  const spanishDescription = normalizeText(exercise.description_es);
  const englishDescription = normalizeText(exercise.description_en);

  return resolvedLocale === 'en'
    ? (englishDescription ?? spanishDescription ?? legacyDescription)
    : (spanishDescription ?? englishDescription ?? legacyDescription);
}

export function normalizeExerciseDifficulty(
  difficulty: string | null | undefined,
): NormalizedExerciseDifficulty | null {
  const normalizedDifficulty = normalizeSearchText(difficulty ?? '');

  switch (normalizedDifficulty) {
    case 'beginner':
    case 'principiante':
      return 'beginner';
    case 'intermediate':
    case 'intermedio':
      return 'intermediate';
    case 'advanced':
    case 'avanzado':
      return 'advanced';
    default:
      return null;
  }
}

export function isTimeBasedExerciseType(exerciseTypeCode: string | null | undefined): boolean {
  const normalizedExerciseType = normalizeSearchText(exerciseTypeCode ?? '');
  return ['tiempo', 'time', 'duration', 'duracion'].includes(normalizedExerciseType);
}

export function normalizeExerciseLoadType(loadType: string | null | undefined): ExerciseLoadType | null {
  const normalizedLoadType = normalizeSearchText(loadType ?? '');

  switch (normalizedLoadType) {
    case 'bodyweight':
      return 'bodyweight';
    case 'external':
      return 'external';
    case 'assisted':
      return 'assisted';
    case 'mixed':
      return 'mixed';
    default:
      return null;
  }
}

export function getStrengthExerciseProgressMetric(loadType: ExerciseLoadType | null): 'weight' | 'reps' {
  return loadType === 'bodyweight' ? 'reps' : 'weight';
}
