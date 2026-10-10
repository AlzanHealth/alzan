import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../context/AuthContext';
import { ActivitySessionSupersetLink, WorkoutSet } from '../types/requests.types';
import { getCurrentAppLocale, getLocalizedExerciseName } from '../services/localization';
import { healthQueryKeys } from '../modules/health/hooks/healthQueryKeys';

export interface ExerciseGroup {
  exercise_id: string;
  exercise_name: string;
  sets: WorkoutSet[];
}

export interface SessionDetailData {
  exerciseGroups: ExerciseGroup[];
  supersetLinks: ActivitySessionSupersetLink[];
}

export const useSessionDetail = (sessionId?: string) => {
  const { user } = useAuth();
  const languageCode = getCurrentAppLocale();

  return useQuery({
    queryKey: ['sessionDetail', sessionId, languageCode],
    queryFn: async () => {
      if (!sessionId) {
        return {
          exerciseGroups: [],
          supersetLinks: [],
        } satisfies SessionDetailData;
      }

      console.log('[useSessionDetail] Fetching sets for session:', sessionId);

      const [{ data: sets, error }, { data: supersetLinks, error: linksError }, { data: sessionMeta }] =
        await Promise.all([
          supabase
            .from('workout_sets')
            .select(
              `
              *,
              exercise:exercises(
                *
              )
            `,
            )
            .eq('session_id', sessionId)
            .order('created_at'),
          supabase
            .from('activity_session_superset_links')
            .select('*')
            .eq('session_id', sessionId)
            .order('from_order_index', { ascending: true }),
          supabase.from('activity_sessions').select('workout_template_id').eq('id', sessionId).maybeSingle(),
        ]);

      if (error || linksError) {
        console.error('[useSessionDetail] Error fetching sets:', error);
        console.error('[useSessionDetail] Error fetching superset links:', linksError);
        throw error || linksError;
      }

      console.log('[useSessionDetail] Fetched sets:', sets?.length);

      // Group sets by exercise
      const grouped = (sets || []).reduce(
        (acc, set) => {
          const exerciseId = set.exercise_id;
          if (!acc[exerciseId]) {
            const exerciseData = set.exercise;
            const exerciseName = exerciseData
              ? getLocalizedExerciseName(exerciseData, languageCode)
              : 'Unknown Exercise';

            acc[exerciseId] = {
              exercise_id: exerciseId,
              exercise_name: exerciseName,
              sets: [],
            };
          }
          acc[exerciseId].sets.push(set);
          return acc;
        },
        {} as Record<string, ExerciseGroup>,
      );

      // Convert to array and sort sets within each exercise by set_number
      const exerciseGroups = Object.values(grouped).map(group => ({
        ...group,
        sets: group.sets.sort((a, b) => a.set_number - b.set_number),
      }));

      let resolvedSupersetLinks: ActivitySessionSupersetLink[] = supersetLinks || [];

      if (resolvedSupersetLinks.length === 0 && sessionMeta?.workout_template_id) {
        const { data: templateExercises, error: templateLinksError } = await supabase
          .from('workout_template_exercises')
          .select('id, exercise_id, order_index, superset_next_exercise_id')
          .eq('workout_template_id', sessionMeta.workout_template_id)
          .order('order_index', { ascending: true });

        if (!templateLinksError && templateExercises) {
          const templateById = new Map<string, (typeof templateExercises)[number]>();
          templateExercises.forEach(exercise => {
            templateById.set(exercise.id, exercise);
          });

          resolvedSupersetLinks = templateExercises
            .map(exercise => {
              if (!exercise.superset_next_exercise_id) return null;

              const nextExercise = templateById.get(exercise.superset_next_exercise_id);
              if (!nextExercise) return null;

              return {
                id: `template-${exercise.id}`,
                session_id: sessionId,
                from_exercise_id: exercise.exercise_id,
                from_order_index: exercise.order_index,
                to_exercise_id: nextExercise.exercise_id,
                to_order_index: nextExercise.order_index,
                created_at: new Date(0).toISOString(),
              } satisfies ActivitySessionSupersetLink;
            })
            .filter((link): link is ActivitySessionSupersetLink => link !== null);
        }
      }

      return {
        exerciseGroups,
        supersetLinks: resolvedSupersetLinks,
      } satisfies SessionDetailData;
    },
    enabled: !!sessionId && !!user,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
};

export const useUpdateWorkoutSet = () => {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ setId, reps, weight_kg }: { setId: string; reps: number; weight_kg: number }) => {
      console.log(`[useUpdateWorkoutSet] Updating set ${setId} to ${reps} reps @ ${weight_kg}kg`);
      const { data, error } = await supabase
        .from('workout_sets')
        .update({ reps, weight_kg })
        .eq('id', setId)
        .select()
        .single();

      if (error) {
        console.error('[useUpdateWorkoutSet] Error:', error);
        throw error;
      }
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: healthQueryKeys.all(user?.id) });
      queryClient.invalidateQueries({ queryKey: ['sessionDetail'] });
      queryClient.invalidateQueries({ queryKey: ['enduranceSessions'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
};
