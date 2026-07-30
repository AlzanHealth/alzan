import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../context/AuthContext';
import { propagateTrainingPlans } from '../modules/training/services/trainingCopyService';
import { deleteFuturePlansOutsideGymRecurrence } from '../modules/training/services/templateLifecycleService';
import {
  getCurrentAppLocale,
  getLocalizedExerciseDescription,
  getLocalizedExerciseName,
} from '../services/localization';
import { Exercise, WorkoutTemplateExercise } from '../types/requests.types';
import { buildUserEditedTemplateIdentity } from '../modules/training/helpers/templateEditorIdentity.helper';
import {
  buildStrengthExerciseReconciliationPlan,
  buildStrengthProgressionTargetPatch,
  type StrengthProgressionTargets,
} from '../modules/training/helpers/strengthExerciseReconciliation.helper';

export type PopulatedRoutineData = NonNullable<ReturnType<typeof useGymRoutineEditor>['routineData']>;
export type RoutineDataExercise = PopulatedRoutineData['exercises'][number];
export type RoutineEditorData = {
  id?: string;
  base_name: string;
  description: string | null;
  workout_goal?: string | null;
  modality?: string | null;
  suggested_day_of_week?: number | null;
  recurrence_start_date?: string | null;
  recurrence_end_date?: string | null;
  auto_delete_after_end?: boolean;
  template_family_key?: string | null;
  original_template_family_key?: string | null;
  source?: string | null;
  exercises: RoutineDataExercise[];
  supersetLinks?: number[];
};

interface RoutineExerciseLookupRow extends Exercise {
  exercise_type: {
    id: number;
    code: string;
  } | null;
}

type WorkoutTemplateExerciseLookupRow = WorkoutTemplateExercise & {
  exercise: RoutineExerciseLookupRow | null;
};

type ExistingRoutineExerciseRow = {
  id: string;
  order_index: number;
} & StrengthProgressionTargets;

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

      // Preserve imported rep ranges until the user explicitly edits the single-value reps field.
      const exercises = (exercisesRaw || []).map(te => {
        const repsMin = te.target_reps_min ?? te.target_reps_max ?? 8;
        const repsMax = te.target_reps_max ?? te.target_reps_min ?? 8;

        return {
          ...te,
          target_reps_min: repsMin,
          target_reps_max: repsMax,
          is_warmup: te.is_warmup ?? false,
          drop_set_mode: te.drop_set_mode ?? 'none',
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

      const invalidExercise = data.exercises.find(exercise => !exercise.exercise_id);
      if (invalidExercise) {
        throw new Error('All routine exercises must include exercise_id');
      }

      const editorIdentity = buildUserEditedTemplateIdentity(
        data.template_family_key,
        data.source,
        data.original_template_family_key,
      );
      let existingExercises: ExistingRoutineExerciseRow[] = [];

      if (data.id) {
        const { data: existingRows, error: existingError } = await supabase
          .from('workout_template_exercises')
          .select(
            `
              id,
              order_index,
              target_sets,
              target_reps_min,
              target_reps_max,
              target_weight_kg,
              target_rpe,
              rest_seconds
            `,
          )
          .eq('workout_template_id', data.id)
          .order('order_index')
          .returns<ExistingRoutineExerciseRow[]>();

        if (existingError) throw existingError;
        existingExercises = existingRows ?? [];
      }

      const reconciliation = buildStrengthExerciseReconciliationPlan({
        editedExercises: data.exercises,
        existingExercises,
      });

      // 1. Upsert template
      const { data: template, error: tError } = await supabase
        .from('workout_templates')
        .upsert({
          id: data.id,
          user_id: user.id,
          base_name: data.base_name,
          description: data.description,
          workout_goal: data.workout_goal,
          modality: data.modality,
          suggested_day_of_week: data.suggested_day_of_week,
          recurrence_start_date: data.recurrence_start_date ?? null,
          recurrence_end_date: data.recurrence_end_date ?? null,
          auto_delete_after_end: data.auto_delete_after_end ?? true,
          ...editorIdentity,
          updated_at: new Date().toISOString(),
        } as never)
        .select()
        .single();

      if (tError) throw tError;

      const toExerciseValues = (index: number) => {
        const exercise = data.exercises[index];
        const repsMin = normalizePositiveInteger(exercise.target_reps_min ?? exercise.target_reps_max, 8);
        const repsMax = normalizePositiveInteger(exercise.target_reps_max ?? exercise.target_reps_min, repsMin);
        return {
          exercise_id: exercise.exercise_id,
          order_index: index,
          is_warmup: !!exercise.is_warmup,
          drop_set_mode: exercise.is_warmup ? 'none' : exercise.drop_set_mode || 'none',
          target_sets: normalizePositiveInteger(exercise.target_sets, 3),
          target_reps_min: repsMin,
          target_reps_max: repsMax,
          target_weight_kg: exercise.target_weight_kg,
          target_rpe: exercise.target_rpe,
          notes: exercise.notes,
          rest_seconds: exercise.rest_seconds,
          superset_next_exercise_id: null,
        };
      };

      const persistedByEditorIndex = new Map<number, { id: string; order_index: number }>();
      const createdExerciseIds: string[] = [];

      try {
        const existingById = new Map(existingExercises.map(exercise => [exercise.id, exercise] as const));
        const targetUpdates = reconciliation.retained.flatMap(item => {
          const previous = existingById.get(item.existingId);
          if (!previous) return [];
          const patch = buildStrengthProgressionTargetPatch(previous, toExerciseValues(item.editorIndex));
          return Object.keys(patch).length > 0 ? [{ exerciseId: item.existingId, patch }] : [];
        });
        if (targetUpdates.length > 0) {
          const progressionUpdates = await Promise.all(
            targetUpdates.map(update =>
              supabase
                .from('workout_template_exercise_progressions')
                .update(update.patch)
                .eq('workout_template_id', template.id)
                .eq('workout_template_exercise_id', update.exerciseId),
            ),
          );
          const progressionUpdateError = progressionUpdates.find(result => result.error);
          if (progressionUpdateError?.error) throw progressionUpdateError.error;
        }

        if (reconciliation.staged.length > 0) {
          const temporaryMoves = await Promise.all(
            reconciliation.staged.map(item =>
              supabase
                .from('workout_template_exercises')
                .update({
                  superset_next_exercise_id: null,
                  order_index: item.temporaryOrder,
                })
                .eq('id', item.existingId)
                .eq('workout_template_id', template.id),
            ),
          );
          const temporaryMoveError = temporaryMoves.find(result => result.error);
          if (temporaryMoveError?.error) throw temporaryMoveError.error;
        }

        const retainedResults = await Promise.all(
          reconciliation.retained.map(async item => {
            const { data: updated, error: updateError } = await supabase
              .from('workout_template_exercises')
              .update(toExerciseValues(item.editorIndex))
              .eq('id', item.existingId)
              .eq('workout_template_id', template.id)
              .select('id, order_index')
              .single();
            if (updateError) throw updateError;
            return { editorIndex: item.editorIndex, exercise: updated };
          }),
        );
        retainedResults.forEach(result => persistedByEditorIndex.set(result.editorIndex, result.exercise));

        if (reconciliation.added.length > 0) {
          const rowsToInsert = reconciliation.added.map(item => ({
            workout_template_id: template.id,
            ...toExerciseValues(item.editorIndex),
          }));
          const { data: inserted, error: insertError } = await supabase
            .from('workout_template_exercises')
            .insert(rowsToInsert)
            .select('id, order_index');
          if (insertError) throw insertError;
          (inserted ?? []).forEach(exercise => {
            createdExerciseIds.push(exercise.id);
            persistedByEditorIndex.set(exercise.order_index, exercise);
          });
        }

        const persistedExercises = data.exercises.map((_, index) => persistedByEditorIndex.get(index));
        if (persistedExercises.some(exercise => !exercise)) {
          throw new Error('Not all routine exercises were persisted');
        }
        const requestedSupersetLinks = new Set(data.supersetLinks || []);
        const linkUpdates = persistedExercises
          .map((exercise, index) => {
            if (!exercise || !requestedSupersetLinks.has(index)) return null;
            const nextExercise = persistedExercises[index + 1];
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

        if (reconciliation.removedIds.length > 0) {
          const { error: removeError } = await supabase
            .from('workout_template_exercises')
            .delete()
            .eq('workout_template_id', template.id)
            .in('id', reconciliation.removedIds);
          if (removeError) throw removeError;
        }
      } catch (error) {
        if (createdExerciseIds.length > 0) {
          const { error: cleanupError } = await supabase
            .from('workout_template_exercises')
            .delete()
            .eq('workout_template_id', template.id)
            .in('id', createdExerciseIds);
          if (cleanupError) {
            console.error('Failed to clean up newly inserted routine exercises:', cleanupError);
          }
        }
        throw error;
      }

      await deleteFuturePlansOutsideGymRecurrence({
        userId: user.id,
        templateId: template.id,
        recurrenceEndDate: data.recurrence_end_date,
      });

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
