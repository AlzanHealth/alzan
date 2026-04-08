import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../context/AuthContext';
import { propagateTrainingPlans } from '../modules/training/services/trainingCopyService';
import {
  getCurrentAppLocale,
  getLocalizedExerciseDescription,
  getLocalizedExerciseName,
} from '../services/localization';
import { Exercise, WorkoutTemplateExercise } from '../types/requests.types';

export type PopulatedRoutineData = NonNullable<ReturnType<typeof useGymRoutineEditor>['routineData']>;
export type RoutineDataExercise = PopulatedRoutineData['exercises'][number];
export type RoutineEditorData = {
  id?: string;
  base_name: string;
  description: string | null;
  suggested_day_of_week?: number | null;
  exercises: RoutineDataExercise[];
  supersetLinks?: number[];
};

interface RoutineExerciseLookupRow extends Exercise {
  base_name_es?: string | null;
  base_name_en?: string | null;
  description_es?: string | null;
  description_en?: string | null;
  exercise_type: {
    id: number;
    code: string;
  } | null;
}

type WorkoutTemplateExerciseLookupRow = WorkoutTemplateExercise & {
  exercise: RoutineExerciseLookupRow | null;
};

export const useGymRoutineEditor = (routineId?: string) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const languageCode = getCurrentAppLocale();

  // Fetch existing routine if ID provided
  const { data: routineData, isLoading } = useQuery({
    queryKey: ['routine', routineId, languageCode],
    queryFn: async () => {
      if (!routineId) return null;

      const { data: template, error: tError } = await supabase
        .from('workout_templates')
        .select('*')
        .eq('id', routineId)
        .single();

      if (tError) throw tError;

      const { data: exercisesRaw, error: eError } = await supabase
        .from('workout_template_exercises')
        .select(
          `
            *,
            exercise:exercises(
              *,
              exercise_type:exercise_types(id, code)
            )
          `,
        )
        .eq('workout_template_id', routineId)
        .order('order_index')
        .returns<WorkoutTemplateExerciseLookupRow[]>();

      if (eError) throw eError;

      // Transform to include exercise_type_code and normalize reps to a single value.
      const exercises = (exercisesRaw || []).map(te => {
        const repsValue = te.target_reps_min ?? te.target_reps_max ?? 8;

        return {
          ...te,
          target_reps_min: repsValue,
          target_reps_max: repsValue,
          is_warmup: te.is_warmup ?? false,
          exercise: te.exercise
            ? {
                ...te.exercise,
                base_name: getLocalizedExerciseName(te.exercise, languageCode),
                description: getLocalizedExerciseDescription(te.exercise, languageCode),
                exercise_type_code: te.exercise.exercise_type?.code || null,
              }
            : null,
        };
      });

      // Fetch PRs for each exercise
      const exerciseIds = exercises?.map(e => e.exercise_id).filter(Boolean) || [];
      const prs: Record<string, { weight_kg: number; reps: number }> = {};

      if (exerciseIds.length > 0) {
        const prPromises = exerciseIds.map(async (exId: string) => {
          const { data } = await supabase
            .from('workout_sets')
            .select('weight_kg, reps')
            .eq('exercise_id', exId)
            .order('weight_kg', { ascending: false })
            .limit(1)
            .maybeSingle();

          return { exerciseId: exId, data };
        });

        const prResults = await Promise.all(prPromises);
        prResults.forEach(res => {
          if (res.data) {
            prs[res.exerciseId] = { weight_kg: res.data.weight_kg, reps: res.data.reps };
          }
        });
      }

      return {
        ...template,
        exercises,
        prs,
      };
    },
    enabled: !!routineId,
  });

  const saveRoutine = useMutation({
    mutationFn: async (data: RoutineEditorData) => {
      if (!user) throw new Error('No user');

      const normalizePositiveInteger = (value: unknown, fallback: number) => {
        if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
          return Math.round(value);
        }

        if (typeof value === 'string') {
          const parsed = Number.parseInt(value, 10);
          if (Number.isFinite(parsed) && parsed > 0) {
            return parsed;
          }
        }

        return fallback;
      };

      // 1. Upsert template
      const { data: template, error: tError } = await supabase
        .from('workout_templates')
        .upsert({
          id: data.id,
          user_id: user.id,
          base_name: data.base_name,
          description: data.description,
          suggested_day_of_week: data.suggested_day_of_week,
          updated_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (tError) throw tError;

      // 2. Handle exercises
      // Simpler approach: Delete all for this template and re-insert.
      // Better for order management.
      if (data.id) {
        const { error: dError } = await supabase
          .from('workout_template_exercises')
          .delete()
          .eq('workout_template_id', template.id);
        if (dError) throw dError;
      }

      if (data.exercises.length > 0) {
        const invalidExercise = data.exercises.find(ex => !ex.exercise_id);
        if (invalidExercise) {
          throw new Error('All routine exercises must include exercise_id');
        }

        const exercisesToInsert = data.exercises.map((ex, index) => {
          const repsValue = normalizePositiveInteger(ex.target_reps_min ?? ex.target_reps_max, 8);

          return {
            workout_template_id: template.id,
            exercise_id: ex.exercise_id,
            order_index: index,
            is_warmup: !!ex.is_warmup,
            target_sets: normalizePositiveInteger(ex.target_sets, 3),
            target_reps_min: repsValue,
            target_reps_max: repsValue,
            target_weight_kg: ex.target_weight_kg,
            target_rpe: ex.target_rpe,
            notes: ex.notes,
            rest_seconds: ex.rest_seconds,
          };
        });

        const { data: insertedExercises, error: iError } = await supabase
          .from('workout_template_exercises')
          .insert(exercisesToInsert)
          .select('id, order_index');
        if (iError) throw iError;

        const sortedInsertedExercises = [...(insertedExercises || [])].sort((a, b) => a.order_index - b.order_index);
        const requestedSupersetLinks = new Set(data.supersetLinks || []);

        const linkUpdates = sortedInsertedExercises
          .map((exercise, index) => {
            if (!requestedSupersetLinks.has(index)) return null;
            const nextExercise = sortedInsertedExercises[index + 1];
            if (!nextExercise) return null;
            return {
              currentExerciseId: exercise.id,
              nextExerciseId: nextExercise.id,
            };
          })
          .filter(link => link !== null);

        if (linkUpdates.length > 0) {
          const updateResults = await Promise.all(
            linkUpdates.map(link =>
              supabase
                .from('workout_template_exercises')
                .update({ superset_next_exercise_id: link.nextExerciseId })
                .eq('id', link.currentExerciseId),
            ),
          );

          const updateError = updateResults.find(result => result.error);
          if (updateError?.error) {
            throw updateError.error;
          }
        }
      }

      return template;
    },
    onSuccess: async () => {
      if (user) {
        // Ensure new recurrences are generated immediately
        try {
          await propagateTrainingPlans(user.id);
        } catch (err) {
          console.error('Failed to propagate plans on save:', err);
        }
      }

      queryClient.invalidateQueries({ queryKey: ['gymRoutines'] });
      if (routineId) queryClient.invalidateQueries({ queryKey: ['routine', routineId] });

      // Fix keys to match TrainingHomeScreen
      queryClient.invalidateQueries({ queryKey: ['dailyPlans'] });
      queryClient.invalidateQueries({ queryKey: ['weekDots'] });
    },
  });

  return {
    routineData,
    isLoading,
    saveRoutine,
  };
};
