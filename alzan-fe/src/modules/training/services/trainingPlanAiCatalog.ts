import type { TrainingExerciseAiCatalogRow } from './trainingPlanAiPrompt';

export const TRAINING_EXERCISE_AI_CATALOG_TIMEOUT_MS = 15_000;

export class TrainingExerciseAiCatalogTimeoutError extends Error {
  constructor() {
    super('Training exercise AI catalog request timed out');
    this.name = 'TrainingExerciseAiCatalogTimeoutError';
  }
}

export type TrainingExerciseAiCatalogRequest = (signal: AbortSignal) => Promise<TrainingExerciseAiCatalogRow[]>;

export const loadTrainingExerciseAiCatalogWithTimeout = async (
  fetchCatalog: TrainingExerciseAiCatalogRequest,
  timeoutMs = TRAINING_EXERCISE_AI_CATALOG_TIMEOUT_MS,
): Promise<TrainingExerciseAiCatalogRow[]> => {
  const controller = new AbortController();
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new TrainingExerciseAiCatalogTimeoutError());
      controller.abort();
    }, timeoutMs);
  });

  try {
    const catalog = await Promise.race([fetchCatalog(controller.signal), timeout]);
    if (catalog.length === 0) throw new Error('Training exercise AI catalog is empty');
    return catalog;
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  }
};

export type TrainingExerciseAiCatalogLoader = {
  preload: () => Promise<TrainingExerciseAiCatalogRow[]>;
};

export const createTrainingExerciseAiCatalogLoader = (
  fetchCatalog: () => Promise<TrainingExerciseAiCatalogRow[]>,
): TrainingExerciseAiCatalogLoader => {
  let cachedCatalog: TrainingExerciseAiCatalogRow[] | null = null;
  let inFlightRequest: Promise<TrainingExerciseAiCatalogRow[]> | null = null;

  const preload = (): Promise<TrainingExerciseAiCatalogRow[]> => {
    if (cachedCatalog) return Promise.resolve(cachedCatalog);
    if (inFlightRequest) return inFlightRequest;

    const request = fetchCatalog()
      .then(catalog => {
        if (catalog.length === 0) throw new Error('Training exercise AI catalog is empty');
        cachedCatalog = catalog;
        return catalog;
      })
      .finally(() => {
        if (inFlightRequest === request) inFlightRequest = null;
      });
    inFlightRequest = request;
    return request;
  };

  return { preload };
};

export type TrainingExerciseAiCatalogRelation = { code: string } | null;

export type TrainingExerciseAiCatalogPage = {
  id: string;
  base_name_es: string;
  base_name_en: string | null;
  exercise_type: TrainingExerciseAiCatalogRelation;
  load_type: string | null;
  primary_muscle: TrainingExerciseAiCatalogRelation;
  secondary_muscle: TrainingExerciseAiCatalogRelation;
  equipment: TrainingExerciseAiCatalogRelation;
  is_custom: boolean;
};

export type TrainingExerciseAiCatalogPageFetcher = (
  from: number,
  to: number,
) => Promise<{ data: TrainingExerciseAiCatalogPage[]; error: Error | null }>;

const mapCatalogPage = (page: TrainingExerciseAiCatalogPage[]): TrainingExerciseAiCatalogRow[] =>
  page.map(exercise => ({
    exercise_id: exercise.id,
    exercise_name_es: exercise.base_name_es,
    exercise_name_en: exercise.base_name_en,
    exercise_type: exercise.exercise_type?.code ?? null,
    load_type: exercise.load_type,
    primary_muscle: exercise.primary_muscle?.code ?? null,
    secondary_muscle: exercise.secondary_muscle?.code ?? null,
    equipment: exercise.equipment?.code ?? null,
    is_custom: exercise.is_custom,
  }));

export const fetchAllTrainingExerciseAiCatalog = async (
  fetchPage: TrainingExerciseAiCatalogPageFetcher,
  pageSize = 1000,
): Promise<TrainingExerciseAiCatalogRow[]> => {
  const rows: TrainingExerciseAiCatalogRow[] = [];

  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await fetchPage(offset, offset + pageSize - 1);
    if (error) throw error;

    rows.push(...mapCatalogPage(data));
    if (data.length < pageSize) break;
  }

  return rows;
};
