import type { TrainingExerciseAiCatalogRow } from './trainingPlanAiPrompt';

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
