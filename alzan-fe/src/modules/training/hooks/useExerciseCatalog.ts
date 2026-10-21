import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../../lib/supabaseClient';
import { Tables } from '../../../types/database.types';
import {
  createCustomExercise,
  CreateCustomExerciseInput,
  deleteCustomExercise,
  restoreCustomExercise,
} from '../services/exerciseCatalogService';

export interface ExerciseUsageSummary {
  setCount: number;
  latestAt: string;
  latestWeightKg: number | null;
  latestReps: number | null;
  bestWeightKg: number | null;
}

type WorkoutSetSummary = Pick<Tables<'workout_sets'>, 'exercise_id' | 'weight_kg' | 'reps' | 'created_at'>;

const EXERCISE_CATALOG_FAVORITES_KEY = 'exercise-catalog-favorites';
const EXERCISE_CATALOG_USAGE_KEY = 'exercise-catalog-usage';

const loadExerciseUsage = async (userId: string): Promise<Record<string, ExerciseUsageSummary>> => {
  const pageSize = 1000;
  const rows: WorkoutSetSummary[] = [];
  let rangeStart = 0;

  while (true) {
    const { data, error } = await supabase
      .from('workout_sets')
      .select('exercise_id, weight_kg, reps, created_at')
      .eq('user_id', userId)
      .eq('is_warmup', false)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .range(rangeStart, rangeStart + pageSize - 1)
      .returns<WorkoutSetSummary[]>();

    if (error) {
      throw error;
    }

    rows.push(...(data ?? []));
    if (!data || data.length < pageSize) {
      break;
    }

    rangeStart += pageSize;
  }

  const usage: Record<string, ExerciseUsageSummary> = {};

  for (const row of rows) {
    const summary = usage[row.exercise_id];
    if (!summary) {
      usage[row.exercise_id] = {
        setCount: 1,
        latestAt: row.created_at,
        latestWeightKg: row.weight_kg > 0 ? row.weight_kg : null,
        latestReps: row.reps > 0 ? row.reps : null,
        bestWeightKg: row.weight_kg > 0 ? row.weight_kg : null,
      };
      continue;
    }

    summary.setCount += 1;
    if (row.weight_kg > 0 && (summary.bestWeightKg === null || row.weight_kg > summary.bestWeightKg)) {
      summary.bestWeightKg = row.weight_kg;
    }
    if (summary.latestWeightKg === null && row.weight_kg > 0) {
      summary.latestWeightKg = row.weight_kg;
    }
    if (summary.latestReps === null && row.reps > 0) {
      summary.latestReps = row.reps;
    }
  }

  return usage;
};

export const useExerciseCatalogUsage = (userId?: string) =>
  useQuery({
    queryKey: [EXERCISE_CATALOG_USAGE_KEY, userId],
    queryFn: () => loadExerciseUsage(userId!),
    enabled: !!userId,
    staleTime: 1000 * 60,
  });

export const useExerciseFavorites = (userId?: string) =>
  useQuery({
    queryKey: [EXERCISE_CATALOG_FAVORITES_KEY, userId],
    queryFn: async () => {
      const { data, error } = await supabase.from('exercise_favorites').select('exercise_id').eq('user_id', userId!);

      if (error) {
        throw error;
      }

      return new Set((data ?? []).map(row => row.exercise_id));
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
      await queryClient.invalidateQueries({ queryKey: [EXERCISE_CATALOG_FAVORITES_KEY, userId] });
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
      await queryClient.invalidateQueries({ queryKey: [EXERCISE_CATALOG_FAVORITES_KEY, userId] });
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
      await queryClient.invalidateQueries({ queryKey: ['exercises'] });
      await queryClient.invalidateQueries({ queryKey: [EXERCISE_CATALOG_FAVORITES_KEY, userId] });
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
      await queryClient.invalidateQueries({ queryKey: ['exercises'] });
      await queryClient.invalidateQueries({ queryKey: [EXERCISE_CATALOG_FAVORITES_KEY, userId] });
    },
  });
};
