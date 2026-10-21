export interface ExerciseCatalogMatchCandidate {
  id: string;
  names: readonly string[];
}

export interface ExerciseCatalogSuggestion extends ExerciseCatalogMatchCandidate {
  matchedName: string;
  score: number;
}

export const normalizeExerciseCatalogName = (value: string): string =>
  value
    .toLowerCase()
    // PostgreSQL's unaccent dictionary transliterates several letters that
    // Unicode NFD leaves intact. Keep the client-side suggestions aligned.
    .replace(/[æǽ]/g, 'ae')
    .replace(/œ/g, 'oe')
    .replace(/[øǿ]/g, 'o')
    .replace(/ß/g, 'ss')
    .replace(/ł/g, 'l')
    .replace(/[đð]/g, 'd')
    .replace(/þ/g, 'th')
    .replace(/ħ/g, 'h')
    .replace(/ı/g, 'i')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

// Keep meaningful Unicode distinctions in the query cache key. The database
// normalizes names with PostgreSQL's unaccent dictionary, which is broader
// than JavaScript's NFD normalization and can otherwise collide in React Query.
export const exerciseCatalogQueryKey = (value: string): string => value.trim().replace(/\s+/g, ' ').toLowerCase();

const getTrigrams = (value: string): Set<string> => {
  const paddedValue = `  ${value} `;
  const trigrams = new Set<string>();

  for (let index = 0; index <= paddedValue.length - 3; index += 1) {
    trigrams.add(paddedValue.slice(index, index + 3));
  }

  return trigrams;
};

const getDiceSimilarity = (left: string, right: string): number => {
  const leftTrigrams = getTrigrams(left);
  const rightTrigrams = getTrigrams(right);
  let sharedTrigrams = 0;

  leftTrigrams.forEach(trigram => {
    if (rightTrigrams.has(trigram)) sharedTrigrams += 1;
  });

  return (2 * sharedTrigrams) / (leftTrigrams.size + rightTrigrams.size);
};

const getTokenSimilarity = (query: string, candidate: string): number => {
  const queryTokens = new Set(query.split(' ').filter(Boolean));
  const candidateTokens = new Set(candidate.split(' ').filter(Boolean));
  if (queryTokens.size === 0 || candidateTokens.size === 0) return 0;

  let sharedTokens = 0;
  queryTokens.forEach(token => {
    const queryVariants = getExerciseTokenVariants(token);
    if (
      Array.from(candidateTokens).some(candidateToken =>
        Array.from(getExerciseTokenVariants(candidateToken)).some(variant => queryVariants.has(variant)),
      )
    ) {
      sharedTokens += 1;
    }
  });

  return (2 * sharedTokens) / (queryTokens.size + candidateTokens.size);
};

const getExerciseTokenVariants = (token: string): Set<string> => {
  const variants = new Set([token]);

  if (token.length > 4 && token.endsWith('ies')) variants.add(`${token.slice(0, -3)}y`);
  if (token.length > 4 && token.endsWith('ves')) {
    variants.add(`${token.slice(0, -3)}f`);
    variants.add(`${token.slice(0, -3)}fe`);
  }
  if (token.length > 4 && token.endsWith('es')) variants.add(token.slice(0, -2));
  if (token.length > 3 && token.endsWith('f')) variants.add(`${token.slice(0, -1)}ves`);
  if (token.length > 4 && token.endsWith('fe')) variants.add(`${token.slice(0, -2)}ves`);
  if (token.length > 3 && token.endsWith('s') && !token.endsWith('ss')) variants.add(token.slice(0, -1));

  return variants;
};

const EXERCISE_SEARCH_STOPWORDS = new Set([
  'a',
  'al',
  'an',
  'and',
  'at',
  'by',
  'con',
  'de',
  'del',
  'e',
  'el',
  'en',
  'for',
  'from',
  'in',
  'la',
  'las',
  'los',
  'of',
  'on',
  'or',
  'para',
  'por',
  'sin',
  'the',
  'to',
  'y',
]);

export const normalizeExerciseCatalogSearchQuery = (value: string): string =>
  normalizeExerciseCatalogName(value)
    .split(' ')
    .filter(token => token.length > 1 && !EXERCISE_SEARCH_STOPWORDS.has(token))
    .join(' ');

export const hasMeaningfulExerciseCatalogSearchQuery = (value: string): boolean =>
  normalizeExerciseCatalogSearchQuery(value).replace(/\s/g, '').length >= 3;

const scoreNameSimilarity = (query: string, candidate: string): number => {
  const trigramScore = getDiceSimilarity(query, candidate);
  const tokenScore = getTokenSimilarity(query, candidate);

  // Token overlap finds reordered names; trigrams catch small spelling differences.
  return Math.max(trigramScore, tokenScore * 0.75 + trigramScore * 0.25);
};

export const rankExerciseCatalogSuggestions = (
  query: string,
  candidates: readonly ExerciseCatalogMatchCandidate[],
  options?: { excludeIds?: ReadonlySet<string>; limit?: number; minimumScore?: number },
): ExerciseCatalogSuggestion[] => {
  const exactNormalizedQuery = normalizeExerciseCatalogName(query);
  const normalizedQuery = normalizeExerciseCatalogSearchQuery(query);
  if (!hasMeaningfulExerciseCatalogSearchQuery(query)) return [];

  const minimumScore = options?.minimumScore ?? 0.38;
  const limit = options?.limit ?? 4;

  return candidates
    .filter(candidate => !options?.excludeIds?.has(candidate.id))
    .flatMap(candidate => {
      const bestName = candidate.names
        .map(name => ({
          name,
          exactNormalized: normalizeExerciseCatalogName(name),
          normalized: normalizeExerciseCatalogSearchQuery(name),
        }))
        .filter(name => name.normalized && name.exactNormalized !== exactNormalizedQuery)
        .map(name => ({ ...name, score: scoreNameSimilarity(normalizedQuery, name.normalized) }))
        .sort((left, right) => right.score - left.score)[0];

      return bestName && bestName.score >= minimumScore
        ? [{ ...candidate, matchedName: bestName.name, score: bestName.score }]
        : [];
    })
    .sort((left, right) => right.score - left.score || left.id.localeCompare(right.id))
    .slice(0, Math.max(0, limit));
};
