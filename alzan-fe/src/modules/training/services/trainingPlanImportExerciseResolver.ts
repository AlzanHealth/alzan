import type { TrainingPlanStrengthExercise } from './trainingPlanImportContract';

export type TrainingExerciseCatalogRow = {
  id: string;
  base_name_es: string | null;
  base_name_en: string | null;
  exercise_type?: string | null;
  load_type?: string | null;
  primary_muscle?: string | null;
  secondary_muscle?: string | null;
  equipment?: string | null;
};

export type TrainingExerciseCandidate = TrainingExerciseCatalogRow;

export type TrainingExerciseResolution = {
  resolutionKey: string;
  sourceName: string;
  candidates: TrainingExerciseCandidate[];
  selectedCandidate: TrainingExerciseCandidate | null;
};

export const normalizeTrainingExerciseName = (value: string): string =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');

export const getTrainingExerciseResolutionKey = (
  exercise: Pick<TrainingPlanStrengthExercise, 'exercise_id' | 'exercise_name' | 'order_index'>,
): string =>
  `${exercise.order_index}:${normalizeTrainingExerciseName(exercise.exercise_name ?? exercise.exercise_id ?? '')}`;

const tokenizeTrainingExerciseName = (value: string): string[] =>
  normalizeTrainingExerciseName(value)
    .split(' ')
    .filter(Boolean)
    .map(token => {
      if (token.length > 4 && token.endsWith('es')) return token.slice(0, -2);
      if (token.length > 3 && token.endsWith('s')) return token.slice(0, -1);
      return token;
    });

const scoreTrainingExerciseCandidate = (query: string, candidate: TrainingExerciseCatalogRow): number => {
  const normalizedQuery = normalizeTrainingExerciseName(query);
  const normalizedCandidate = normalizeTrainingExerciseName(candidate.base_name_es ?? candidate.base_name_en ?? '');
  const queryTokens = tokenizeTrainingExerciseName(query);
  const candidateTokens = tokenizeTrainingExerciseName(normalizedCandidate);
  const matchingTokens = queryTokens.filter(token => candidateTokens.includes(token)).length;
  let score = 0;

  if (normalizedCandidate === normalizedQuery) score += 2000;
  if (normalizedCandidate.startsWith(normalizedQuery)) score += 600;
  if (normalizedCandidate.includes(normalizedQuery)) score += 300;
  if (queryTokens.length > 0 && matchingTokens === queryTokens.length) score += 700;
  score += matchingTokens * 120;
  score -= Math.max(0, candidateTokens.length - queryTokens.length) * 30;

  return score;
};

const getCandidateName = (candidate: TrainingExerciseCatalogRow): string =>
  candidate.base_name_es ?? candidate.base_name_en ?? '';

const prepareTrainingExerciseCandidates = (
  sourceName: string,
  catalog: TrainingExerciseCatalogRow[],
): TrainingExerciseCandidate[] => {
  const uniqueById = new Map<string, TrainingExerciseCandidate>();
  [...catalog]
    .filter(candidate => getCandidateName(candidate).trim().length > 0)
    .filter(candidate => scoreTrainingExerciseCandidate(sourceName, candidate) > 0)
    .sort((left, right) => {
      const scoreDifference =
        scoreTrainingExerciseCandidate(sourceName, right) - scoreTrainingExerciseCandidate(sourceName, left);
      if (scoreDifference !== 0) return scoreDifference;
      return normalizeTrainingExerciseName(getCandidateName(left)).localeCompare(
        normalizeTrainingExerciseName(getCandidateName(right)),
      );
    })
    .slice(0, 5)
    .forEach(candidate => uniqueById.set(candidate.id, candidate));

  return [...uniqueById.values()];
};

export const searchTrainingExerciseCandidates = (
  query: string,
  catalog: TrainingExerciseCatalogRow[],
): TrainingExerciseCandidate[] => prepareTrainingExerciseCandidates(query, catalog);

const selectHighConfidenceCandidate = (
  sourceName: string,
  candidates: TrainingExerciseCandidate[],
): TrainingExerciseCandidate | null => {
  const ranked = [...candidates].sort(
    (left, right) =>
      scoreTrainingExerciseCandidate(sourceName, right) - scoreTrainingExerciseCandidate(sourceName, left),
  );
  const first = ranked[0];
  if (!first) return null;
  const firstScore = scoreTrainingExerciseCandidate(sourceName, first);
  const secondScore = ranked[1] ? scoreTrainingExerciseCandidate(sourceName, ranked[1]) : 0;
  const exactMatches = candidates.filter(
    candidate =>
      normalizeTrainingExerciseName(getCandidateName(candidate)) === normalizeTrainingExerciseName(sourceName),
  );

  if (exactMatches.length === 1) return exactMatches[0] ?? null;
  if (exactMatches.length > 1) return null;
  return firstScore >= 850 && firstScore - secondScore >= 160 ? first : null;
};

export const resolveTrainingPlanExerciseResolutions = (
  exercises: TrainingPlanStrengthExercise[],
  catalog: TrainingExerciseCatalogRow[],
): TrainingExerciseResolution[] =>
  exercises.map(exercise => {
    const sourceName = exercise.exercise_name ?? exercise.exercise_id ?? '';
    const catalogById = exercise.exercise_id
      ? catalog.find(candidate => candidate.id === exercise.exercise_id)
      : undefined;
    const rankedCandidates = prepareTrainingExerciseCandidates(sourceName, catalog);
    const candidates =
      catalogById && !rankedCandidates.some(candidate => candidate.id === catalogById.id)
        ? [catalogById, ...rankedCandidates].slice(0, 5)
        : rankedCandidates;
    const selectedCandidate = catalogById
      ? exercise.exercise_name &&
        normalizeTrainingExerciseName(getCandidateName(catalogById)) !==
          normalizeTrainingExerciseName(exercise.exercise_name)
        ? null
        : catalogById
      : selectHighConfidenceCandidate(sourceName, candidates);

    return {
      resolutionKey: getTrainingExerciseResolutionKey(exercise),
      sourceName,
      candidates,
      selectedCandidate,
    };
  });

export const selectTrainingPlanExerciseCandidate = (
  resolutions: TrainingExerciseResolution[],
  resolutionKey: string | undefined,
  candidateId: string,
): TrainingExerciseResolution[] =>
  resolutions.map(resolution => {
    if (resolution.resolutionKey !== resolutionKey) return resolution;
    const selectedCandidate = resolution.candidates.find(candidate => candidate.id === candidateId) ?? null;
    return selectedCandidate ? { ...resolution, selectedCandidate } : resolution;
  });

export const areTrainingPlanExerciseResolutionsReady = (resolutions: TrainingExerciseResolution[]): boolean =>
  resolutions.every(resolution => resolution.selectedCandidate !== null);

export const resolveTrainingPlanExercisesFromCatalog = (
  exercises: TrainingPlanStrengthExercise[],
  catalog: TrainingExerciseCatalogRow[],
): Map<string, string> => {
  const byId = new Map(catalog.map(exercise => [exercise.id, exercise] as const));
  const idsByName = new Map<string, Set<string>>();

  catalog.forEach(exercise => {
    [exercise.base_name_es, exercise.base_name_en]
      .filter((name): name is string => Boolean(name))
      .forEach(name => {
        const normalizedName = normalizeTrainingExerciseName(name);
        const ids = idsByName.get(normalizedName) ?? new Set<string>();
        ids.add(exercise.id);
        idsByName.set(normalizedName, ids);
      });
  });

  const resolveExactName = (name: string): string | undefined => {
    const ids = idsByName.get(normalizeTrainingExerciseName(name));
    if (!ids || ids.size === 0) return undefined;
    if (ids.size > 1) throw new Error(`El ejercicio "${name}" coincide con más de un ejercicio del catálogo`);
    return [...ids][0];
  };

  const resolved = new Map<string, string>();
  exercises.forEach(exercise => {
    const explicitId = exercise.exercise_id;
    const explicitName = exercise.exercise_name;
    const catalogExercise = explicitId ? byId.get(explicitId) : undefined;
    let resolvedId: string | undefined;

    if (catalogExercise) {
      if (explicitName) {
        const validNames = [catalogExercise.base_name_es, catalogExercise.base_name_en]
          .filter((name): name is string => Boolean(name))
          .map(normalizeTrainingExerciseName);
        if (!validNames.includes(normalizeTrainingExerciseName(explicitName))) {
          throw new Error(`El exercise_id "${explicitId}" no coincide con "${explicitName}"`);
        }
      }
      resolvedId = catalogExercise.id;
    } else if (explicitName) {
      resolvedId = resolveExactName(explicitName);
    }

    if (!resolvedId) {
      const identifier = explicitName ?? explicitId ?? '';
      throw new Error(`No se ha encontrado el ejercicio "${identifier}"`);
    }

    resolved.set(getTrainingExerciseResolutionKey(exercise), resolvedId);
  });

  return resolved;
};
