import { QueryClient, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../../lib/supabaseClient';
import { Database } from '../../../types/database.types';
import {
  createCustomExercise,
  CreateCustomExerciseInput,
  deleteCustomExercise,
  findExactExerciseCatalogMatch,
  resetExerciseUserOverride,
  restoreCustomExercise,
  updateExerciseForUser,
} from '../services/exerciseCatalogService';
import { exerciseCatalogQueryKey } from '../helpers/exerciseCatalogMatching';
import { loadAllPages } from '../helpers/loadAllPages';

export interface ExerciseUsageSummary {
  setCount: number;
  latestAt: string;
  latestWeightKg: number | null;
  latestReps: number | null;
  bestWeightKg: number | null;
}

export interface ExerciseCatalogUsedPage {
  exerciseIds: string[];
  usage: Record<string, ExerciseUsageSummary>;
  totalItems: number;
  currentPage: number;
  totalPages: number;
}

type UsedExerciseCatalogPageRow = Database['public']['Functions']['get_used_exercise_catalog_page']['Returns'][number];
type ExerciseCatalogUsageSummaryRow =
  Database['public']['Functions']['get_exercise_catalog_usage_summaries']['Returns'][number];

export interface ExerciseCatalogIndexItem {
  id: string;
  base_name_es: string;
  base_name_en: string;
  primary_muscle_id: number | null;
  secondary_muscle_id: number | null;
  equipment_id: number | null;
  primary_muscle: {
    code: string;
    muscle_group_translations: Array<{ name: string; language_code: string | null }> | null;
  } | null;
  secondary_muscle: {
    code: string;
    muscle_group_translations: Array<{ name: string; language_code: string | null }> | null;
  } | null;
  equipment: {
    code: string;
    equipment_translations: Array<{ name: string; language_code: string | null }> | null;
  } | null;
  is_personalized?: boolean;
}

const EXERCISE_CATALOG_FAVORITES_KEY = 'exercise-catalog-favorites';
const EXERCISE_CATALOG_USAGE_KEY = 'exercise-catalog-usage';

// These queries embed exercise fields and must refresh when personalization changes.
const invalidateExerciseConsumers = (queryClient: QueryClient) =>
  Promise.all(
    [
      'sessionDetail',
      'activeSession',
      'routine',
      'completeExercisesTemplate',
      'scheduledWorkoutPreview',
      'exercise-alternatives',
    ].map(key => queryClient.invalidateQueries({ queryKey: [key] })),
  );

const mapUsageSummary = (row: UsedExerciseCatalogPageRow | ExerciseCatalogUsageSummaryRow): ExerciseUsageSummary => ({
  setCount: row.set_count,
  latestAt: row.latest_at,
  latestWeightKg: row.latest_weight_kg ?? null,
  latestReps: row.latest_reps ?? null,
  bestWeightKg: row.best_weight_kg ?? null,
});

export const useUsedExerciseCatalogPage = (
  userId: string | undefined,
  options: {
    page: number;
    pageSize: number;
    query: string;
    muscleId: number | null;
    equipmentId: number | null;
    favoritesOnly: boolean;
    enabled?: boolean;
  },
) =>
  useQuery({
    queryKey: [
      EXERCISE_CATALOG_USAGE_KEY,
      userId,
      'used-page',
      options.page,
      options.pageSize,
      options.query.trim(),
      options.muscleId,
      options.equipmentId,
      options.favoritesOnly,
    ],
    queryFn: async (): Promise<ExerciseCatalogUsedPage> => {
      if (!userId) throw new Error('exercise_catalog_requires_auth');

      const { data, error } = await supabase.rpc('get_used_exercise_catalog_page', {
        p_page: options.page,
        p_page_size: options.pageSize,
        p_query: options.query.trim(),
        p_muscle_id: options.muscleId ?? undefined,
        p_equipment_id: options.equipmentId ?? undefined,
        p_favorites_only: options.favoritesOnly,
      });

      if (error) throw error;

      const rows: UsedExerciseCatalogPageRow[] = data ?? [];
      const first = rows[0];
      const usage: Record<string, ExerciseUsageSummary> = {};
      rows.forEach(row => {
        usage[row.exercise_id] = mapUsageSummary(row);
      });
      const totalItems = first?.total_items ?? 0;
      const totalPages = Math.ceil(totalItems / options.pageSize);

      return {
        exerciseIds: rows.map(row => row.exercise_id),
        usage,
        totalItems,
        currentPage: first?.current_page ?? 1,
        totalPages,
      };
    },
    enabled: !!userId && options.enabled !== false,
    staleTime: 1000 * 60,
  });

export const useExerciseCatalogUsage = (userId?: string, requestedExerciseIds: string[] = []) =>
  useQuery({
    queryKey: [EXERCISE_CATALOG_USAGE_KEY, userId, 'summaries', requestedExerciseIds.join(',')],
    queryFn: async () => {
      if (!userId) throw new Error('exercise_catalog_requires_auth');

      const exerciseIds = [...new Set(requestedExerciseIds)];
      const rows: ExerciseCatalogUsageSummaryRow[] = [];
      // Each ID yields at most one summary; stay below PostgREST's row cap.
      for (let offset = 0; offset < exerciseIds.length; offset += 500) {
        const { data, error } = await supabase.rpc('get_exercise_catalog_usage_summaries', {
          p_exercise_ids: exerciseIds.slice(offset, offset + 500),
        });
        if (error) throw error;
        rows.push(...(data ?? []));
      }

      return rows.reduce<Record<string, ExerciseUsageSummary>>((usage, row) => {
        usage[row.exercise_id] = mapUsageSummary(row);
        return usage;
      }, {});
    },
    enabled: !!userId && requestedExerciseIds.length > 0,
    staleTime: 1000 * 60,
  });

export const useExerciseFavorites = (userId?: string) =>
  useQuery({
    queryKey: [EXERCISE_CATALOG_FAVORITES_KEY, userId],
    queryFn: async () => {
      const rows = await loadAllPages(async (from, to) => {
        const { data, error } = await supabase
          .from('exercise_favorites')
          .select('exercise_id')
          .eq('user_id', userId!)
          .order('exercise_id', { ascending: true })
          .range(from, to);
        if (error) throw error;
        return data ?? [];
      });

      return new Set(rows.map(row => row.exercise_id));
    },
    enabled: !!userId,
    staleTime: 1000 * 60 * 5,
  });

export const useToggleExerciseFavorite = (userId?: string) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ exerciseId, isFavorite }: { exerciseId: string; isFavorite: boolean }) => {
      if (!userId) {
        throw new Error('exercise_favorite_requires_auth');
      }

      const result = isFavorite
        ? await supabase.from('exercise_favorites').delete().eq('user_id', userId).eq('exercise_id', exerciseId)
        : await supabase.from('exercise_favorites').insert({ user_id: userId, exercise_id: exerciseId });

      if (result.error) {
        throw result.error;
      }
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: [EXERCISE_CATALOG_FAVORITES_KEY, userId] }),
        queryClient.invalidateQueries({ queryKey: [EXERCISE_CATALOG_USAGE_KEY, userId, 'used-page'] }),
      ]);
    },
  });
};

export const useCreateCustomExercise = (userId?: string) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateCustomExerciseInput) => {
      if (!userId) {
        throw new Error('exercise_create_requires_auth');
      }

      return createCustomExercise(userId, input);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['exercises'] });
      await queryClient.invalidateQueries({ queryKey: ['exercise-alternatives', userId] });
      await queryClient.invalidateQueries({ queryKey: ['exercise-catalog-index'] });
      await queryClient.invalidateQueries({ queryKey: ['exercise-catalog-exact-match', userId] });
      await queryClient.invalidateQueries({ queryKey: [EXERCISE_CATALOG_FAVORITES_KEY, userId] });
    },
  });
};

export const useExactExerciseCatalogMatch = (name: string, userId?: string, excludeExerciseId?: string) => {
  const queryName = name.trim().replace(/\s+/g, ' ');

  return useQuery({
    queryKey: ['exercise-catalog-exact-match', userId, exerciseCatalogQueryKey(queryName), excludeExerciseId],
    queryFn: () => findExactExerciseCatalogMatch(name, excludeExerciseId),
    enabled: !!userId && queryName.length >= 2,
    staleTime: 1000 * 30,
    retry: false,
  });
};

export const useUpdateExerciseForUser = (userId?: string) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ exerciseId, input }: { exerciseId: string; input: CreateCustomExerciseInput }) => {
      if (!userId) throw new Error('exercise_edit_requires_auth');
      return updateExerciseForUser(userId, exerciseId, input);
    },
    onSuccess: async (_data, variables) => {
      await Promise.all([
        invalidateExerciseConsumers(queryClient),
        queryClient.invalidateQueries({ queryKey: ['exercises'] }),
        queryClient.invalidateQueries({ queryKey: ['exercise-by-id', userId, variables.exerciseId] }),
        queryClient.invalidateQueries({ queryKey: ['exercise-catalog-index', userId] }),
        queryClient.invalidateQueries({ queryKey: ['exercise-catalog-exact-match', userId] }),
        queryClient.invalidateQueries({ queryKey: [EXERCISE_CATALOG_USAGE_KEY, userId] }),
      ]);
    },
  });
};

export const useResetExerciseUserOverride = (userId?: string) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ exerciseId }: { exerciseId: string }) => {
      if (!userId) throw new Error('exercise_edit_requires_auth');
      return resetExerciseUserOverride(userId, exerciseId);
    },
    onSuccess: async (_data, variables) => {
      await Promise.all([
        invalidateExerciseConsumers(queryClient),
        queryClient.invalidateQueries({ queryKey: ['exercises'] }),
        queryClient.invalidateQueries({ queryKey: ['exercise-by-id', userId, variables.exerciseId] }),
        queryClient.invalidateQueries({ queryKey: ['exercise-catalog-index', userId] }),
        queryClient.invalidateQueries({ queryKey: ['exercise-catalog-exact-match', userId] }),
        queryClient.invalidateQueries({ queryKey: [EXERCISE_CATALOG_USAGE_KEY, userId] }),
      ]);
    },
  });
};

export const useDeleteCustomExercise = (userId?: string) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ exerciseId }: { exerciseId: string }) => {
      if (!userId) {
        throw new Error('exercise_delete_requires_auth');
      }

      return deleteCustomExercise(exerciseId, userId);
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['exercise-by-id', userId] }),
        queryClient.invalidateQueries({ queryKey: ['exercise-alternatives', userId] }),
        queryClient.invalidateQueries({ queryKey: ['exercises'] }),
        queryClient.invalidateQueries({ queryKey: [EXERCISE_CATALOG_FAVORITES_KEY, userId] }),
        queryClient.invalidateQueries({ queryKey: ['exercise-catalog-exact-match', userId] }),
        queryClient.invalidateQueries({ queryKey: [EXERCISE_CATALOG_USAGE_KEY, userId] }),
      ]);
    },
  });
};

export const useRestoreCustomExercise = (userId?: string) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ exerciseId }: { exerciseId: string }) => {
      if (!userId) {
        throw new Error('exercise_restore_requires_auth');
      }

      return restoreCustomExercise(exerciseId, userId);
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['exercise-by-id', userId] }),
        queryClient.invalidateQueries({ queryKey: ['exercise-alternatives', userId] }),
        queryClient.invalidateQueries({ queryKey: ['exercises'] }),
        queryClient.invalidateQueries({ queryKey: [EXERCISE_CATALOG_FAVORITES_KEY, userId] }),
        queryClient.invalidateQueries({ queryKey: ['exercise-catalog-exact-match', userId] }),
        queryClient.invalidateQueries({ queryKey: [EXERCISE_CATALOG_USAGE_KEY, userId] }),
      ]);
    },
  });
};
