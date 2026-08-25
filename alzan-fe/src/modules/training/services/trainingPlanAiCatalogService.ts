import { supabase } from '../../../lib/supabaseClient';
import {
  createTrainingExerciseAiCatalogLoader,
  fetchAllTrainingExerciseAiCatalog,
  loadTrainingExerciseAiCatalogWithTimeout,
  type TrainingExerciseAiCatalogPage,
} from './trainingPlanAiCatalog';
import type { TrainingExerciseAiCatalogRow } from './trainingPlanAiPrompt';

const EXERCISE_AI_CATALOG_SELECT = `
  id,
  base_name_es,
  base_name_en,
  load_type,
  is_custom,
  exercise_type:exercise_types(code),
  primary_muscle:muscle_groups!exercises_primary_muscle_id_fkey(code),
  secondary_muscle:muscle_groups!exercises_secondary_muscle_id_fkey(code),
  equipment(code)
`;

export const fetchTrainingExerciseAiCatalog = async (): Promise<TrainingExerciseAiCatalogRow[]> =>
  loadTrainingExerciseAiCatalogWithTimeout(signal =>
    fetchAllTrainingExerciseAiCatalog(async (from, to) => {
      const { data, error } = await supabase
        .from('exercises')
        .select(EXERCISE_AI_CATALOG_SELECT)
        .order('base_name_es', { ascending: true })
        .order('id', { ascending: true })
        .range(from, to)
        .abortSignal(signal);

      return {
        data: (data ?? []) as unknown as TrainingExerciseAiCatalogPage[],
        error,
      };
    }),
  );

const trainingExerciseAiCatalogLoader = createTrainingExerciseAiCatalogLoader(fetchTrainingExerciseAiCatalog);

export const preloadTrainingExerciseAiCatalog = (): Promise<TrainingExerciseAiCatalogRow[]> =>
  trainingExerciseAiCatalogLoader.preload();
