import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../context/AuthContext';
import {
  ActivitySession,
  ActivitySessionSupersetLink,
  Exercise,
  WorkoutSet,
  WorkoutSetInsert,
  WorkoutTemplateExercise,
} from '../types/requests.types';
import {
  getCurrentAppLocale,
  getLocalizedExerciseDescription,
  getLocalizedExerciseName,
} from '../services/localization';
import { getDefaultGymExerciseTargets } from '../modules/training/helpers/gymExerciseDefaults.helper';
import { getStrengthProgressionDate } from '../modules/training/helpers/strengthProgression.helper';
import { applyStrengthProgressionsForPlannedDate } from '../modules/training/services/strengthProgressionService';
import { format } from 'date-fns';

export type FinishSession = {
  id: string;
  duration_s: number;
  rpe: number;
  notes: string;
};

export type ExerciseWithType =
  | (Exercise & {
      exercise_type?: {
        code: string;
        id: string | number;
      } | null;
      exercise_type_code?: string | null;
    })
  | null;

export type SaveSessionSupersetLinks = {
  sessionId: string;
  links: Array<{
    fromExerciseId: string;
    fromOrderIndex: number;
    toExerciseId: string;
    toOrderIndex: number;
  }>;
};

interface ActiveWorkoutExerciseLookupRow {
  id: string;
  base_name_es: string;
  base_name_en: string | null;
  description_es: string | null;
  description_en: string | null;
  exercise_type: {
    code: string;
    id: string | number;
  } | null;
}

type WorkoutTemplateExerciseLookupRow = WorkoutTemplateExercise & {
  exercise: ActiveWorkoutExerciseLookupRow | null;
};
type WorkoutTemplateExerciseWithExercise = WorkoutTemplateExercise & { exercise: ExerciseWithType };

type HistoryItem = Pick<WorkoutSet, 'exercise_id' | 'weight_kg' | 'reps' | 'set_number' | 'session_id' | 'created_at'>;

type ActiveWorkoutCoreData = {
  session: ActivitySession;
  exercises: WorkoutTemplateExerciseWithExercise[];
  completedSets: WorkoutSet[];
  sessionSupersetLinks: ActivitySessionSupersetLink[];
};

type ActiveWorkoutSupplementalData = {
  history: Record<string, HistoryItem[]>;
  prs: Record<string, { weight_kg: number; reps: number }>;
};

export type ActiveWorkoutData = ActiveWorkoutCoreData & ActiveWorkoutSupplementalData;

export class ActiveGymSessionAlreadyStartedError extends Error {
  sessionId: string;

  constructor(sessionId: string) {
    super('A gym session is already active');
    this.name = 'ActiveGymSessionAlreadyStartedError';
    this.sessionId = sessionId;
  }
}

export const useActiveWorkout = (sessionId?: string) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const languageCode = getCurrentAppLocale();

  // Start a new session from a template
  const startSession = useMutation({
    mutationFn: async ({
      templateId,
      customStartTime,
      plannedDate,
      planId,
    }: {
      templateId: string;
      customStartTime?: string;
      plannedDate?: string;
      planId?: string;
    }) => {
      console.log(
        '[useActiveWorkout.startSession] Iniciando - templateId:',
        templateId,
        'date:',
        customStartTime,
        'plannedDate:',
        plannedDate,
        'planId:',
        planId,
      );
      try {
        if (!user) throw new Error('No user');

        const { data: activeGymSession, error: activeGymSessionError } = await supabase
          .from('activity_sessions')
          .select('id')
          .eq('user_id', user.id)
          .or('sport_type.eq.strength,sport_type.eq.gym,source.eq.gym_session')
          .is('end_time', null)
          .order('start_time', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (activeGymSessionError) {
          console.error('[useActiveWorkout.startSession] Error checking active gym session:', activeGymSessionError);
          throw activeGymSessionError;
        }

        if (activeGymSession?.id) {
          throw new ActiveGymSessionAlreadyStartedError(activeGymSession.id);
        }

        // Fetch template details to get name
        const { data: template } = await supabase.from('workout_templates').select('*').eq('id', templateId).single();
        console.log('[useActiveWorkout.startSession] Template obtenido:', template?.id);

        const startTime = customStartTime || new Date().toISOString();
        const startInstant = new Date(startTime);
        const localDate = plannedDate || format(startInstant, 'yyyy-MM-dd');
        const startedAtLocal = `${localDate}T${format(startInstant, 'HH:mm:ss')}`;
        let timezone: string | null = null;
        try {
          timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || null;
        } catch {
          timezone = null;
        }

        // 2. Create activity_session
        const { data: session, error } = await supabase
          .from('activity_sessions')
          .insert({
            user_id: user.id,
            sport_type: 'strength',
            workout_template_id: templateId,
            start_time: startTime,
            started_at_local: startedAtLocal,
            timezone,
            source: 'manual',
            name: template?.base_name || 'Entreno de Fuerza',
          })
          .select()
          .single();

        if (error) {
          console.error('[useActiveWorkout.startSession] Error:', error);
          throw error;
        }
        console.log('[useActiveWorkout.startSession] Éxito - sessionId:', session?.id);

        // ✅ FIX #2: Update workout_plan if this session was started from a plan
        if (planId && session?.id) {
          const { error: planError } = await supabase
            .from('workout_plans')
            .update({
              activity_session_id: session.id,
              status: 'completed',
              completed_at: new Date().toISOString(),
            })
            .eq('id', planId);

          if (planError) {
            console.error('[useActiveWorkout.startSession] Error updating plan:', planError);
            // Don't throw, session was created successfully
          } else {
            console.log('[useActiveWorkout.startSession] Plan actualizado:', planId);
          }
        }

        return session;
      } catch (err) {
        console.error('[useActiveWorkout.startSession] Exception:', err);
        throw err;
      }
    },
    onSuccess: () => {
      // Invalidate queries to update UI instantly (Banner and HomeScreen Resume button)
      queryClient.invalidateQueries({ queryKey: ['activeSessionBanner'] });
      queryClient.invalidateQueries({ queryKey: ['dailyPlans'] });
    },
  });

  // Fetch active session data
  // In a real app complexity is higher (re-hydrating state from sets logged in DB + template plan)
  // For now, we will fetch the session + the template it was based on to build the "Plan".
  const { data: activeSessionCoreData, isLoading } = useQuery({
    queryKey: ['activeSession', sessionId, languageCode],
    queryFn: async () => {
      console.log('[useActiveWorkout.fetchSession] Iniciando - sessionId:', sessionId);
      try {
        if (!sessionId) return null;

        // Fetch session
        const { data: sessions, error: sError } = await supabase
          .from('activity_sessions')
          .select('*')
          .eq('id', sessionId)
          .limit(1);

        if (sError) {
          console.error('[useActiveWorkout.fetchSession] Error sesión:', sError);
          throw sError;
        }

        const session = sessions?.[0] || null;

        if (!session) {
          // Session deleted or not found
          return null;
        }

        console.log('[useActiveWorkout.fetchSession] Sesión obtenida (safe-mode)');

        // Fetch template exercises (The Plan)
        let exercises: WorkoutTemplateExerciseWithExercise[] = [];
        if (session.workout_template_id) {
          const { data: templateExercises } = await supabase
            .from('workout_template_exercises')
            .select(
              `
                *,
                exercise:exercises(
                  *,
                  base_name_es,
                  base_name_en,
                  description_es,
                  description_en,
                  exercise_type:exercise_types(id, code)
                )
              `,
            )
            .eq('workout_template_id', session.workout_template_id)
            .order('order_index')
            .returns<WorkoutTemplateExerciseLookupRow[]>();

          // Transform to include exercise_type_code at exercise level
          exercises = (templateExercises || []).map(te => ({
            ...te,
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
          })) as WorkoutTemplateExerciseWithExercise[];

          const { data: linkedPlan, error: linkedPlanError } = await supabase
            .from('workout_plans')
            .select('planned_date')
            .eq('activity_session_id', session.id)
            .maybeSingle();
          if (linkedPlanError) {
            console.warn('[useActiveWorkout.fetchSession] Could not load linked plan date:', linkedPlanError);
          }

          const progressionDate = getStrengthProgressionDate({
            linkedPlannedDate: linkedPlan?.planned_date,
            startedAtLocal: session.started_at_local,
            startTime: session.start_time,
          });
          exercises = await applyStrengthProgressionsForPlannedDate(
            session.workout_template_id,
            progressionDate,
            exercises,
          );
          console.log('[useActiveWorkout.fetchSession] Ejercicios:', exercises.length);
        }

        // Fetch already completed sets in this session
        const { data: completedSets } = await supabase
          .from('workout_sets')
          .select('*')
          .eq('session_id', sessionId)
          .order('created_at');
        console.log('[useActiveWorkout.fetchSession] Sets completados:', completedSets?.length);

        const { data: sessionSupersetLinks } = await supabase
          .from('activity_session_superset_links')
          .select('*')
          .eq('session_id', sessionId)
          .order('from_order_index', { ascending: true });

        // Detect Adhoc Exercises (present in sets but not in template)
        const templateExerciseIds = new Set(exercises.map(e => e.exercise_id));
        const adhocExerciseIds = new Set<string>();

        completedSets?.forEach(s => {
          if (!templateExerciseIds.has(s.exercise_id)) {
            adhocExerciseIds.add(s.exercise_id);
          }
        });

        if (adhocExerciseIds.size > 0) {
          const { data: adhocExercisesData } = await supabase
            .from('exercises')
            .select('*, exercise_type:exercise_types(id, code)')
            .in('id', Array.from(adhocExerciseIds));

          if (adhocExercisesData) {
            // Build session exercise entries for adhoc exercises logged directly in this session.
            const sessionAdhocExercises: WorkoutTemplateExerciseWithExercise[] = adhocExercisesData.map(
              (exerciseData, index) => {
                const defaultTargets = getDefaultGymExerciseTargets(exerciseData.exercise_type?.code);

                return {
                  id: `adhoc-${exerciseData.id}`,
                  exercise_id: exerciseData.id,
                  workout_template_id: session.workout_template_id || '',
                  user_id: user?.id || null,
                  notes: null,
                  target_rpe: null,
                  order_index: (exercises.length || 0) + index,
                  target_sets: 3,
                  target_reps_min: defaultTargets.target_reps_min,
                  target_reps_max: defaultTargets.target_reps_max,
                  target_weight_kg: 0,
                  rest_seconds: 60,
                  superset_next_exercise_id: null,
                  is_warmup: false,
                  drop_set_mode: 'none',
                  exercise: {
                    ...exerciseData,
                    exercise_type_code: exerciseData.exercise_type?.code || null,
                  },
                };
              },
            );
            exercises = [...exercises, ...sessionAdhocExercises];
          }
        }

        return {
          session,
          exercises,
          completedSets: completedSets || [],
          sessionSupersetLinks: sessionSupersetLinks || [],
        };
      } catch (err) {
        console.error('[useActiveWorkout.fetchSession] Exception:', err);
        throw err;
      }
    },
    enabled: !!sessionId,
  });

  const allExerciseIds = activeSessionCoreData
    ? Array.from(new Set(activeSessionCoreData.exercises.map(exercise => exercise.exercise_id)))
    : [];
  const exerciseIdsKey = allExerciseIds.join(',');

  const { data: activeSessionSupplementalData } = useQuery({
    queryKey: ['activeSessionSupplemental', sessionId, exerciseIdsKey],
    queryFn: async () => {
      if (!sessionId || allExerciseIds.length === 0) {
        return {
          history: {},
          prs: {},
        } satisfies ActiveWorkoutSupplementalData;
      }

      const prs: Record<string, { weight_kg: number; reps: number }> = {};
      const history: Record<string, HistoryItem[]> = {};

      const { data: historyData } = await supabase
        .from('workout_sets')
        .select('exercise_id, weight_kg, reps, set_number, session_id, created_at')
        .in('exercise_id', allExerciseIds)
        .neq('session_id', sessionId)
        .order('created_at', { ascending: false })
        .limit(500);

      if (historyData) {
        const historyMap: Record<string, { sessionId: string; sets: HistoryItem[] }> = {};

        historyData.forEach(set => {
          if (!historyMap[set.exercise_id]) {
            historyMap[set.exercise_id] = { sessionId: set.session_id, sets: [set] };
            return;
          }

          if (historyMap[set.exercise_id].sessionId === set.session_id) {
            historyMap[set.exercise_id].sets.push(set);
          }
        });

        Object.keys(historyMap).forEach(exerciseId => {
          history[exerciseId] = historyMap[exerciseId].sets.sort((a, b) => a.set_number - b.set_number);
        });
      }

      const prResults = await Promise.all(
        allExerciseIds.map(async exerciseId => {
          const { data } = await supabase
            .from('workout_sets')
            .select('weight_kg, reps')
            .eq('exercise_id', exerciseId)
            .order('weight_kg', { ascending: false })
            .limit(1)
            .maybeSingle();

          return { exerciseId, data };
        }),
      );

      prResults.forEach(result => {
        if (result.data) {
          prs[result.exerciseId] = { weight_kg: result.data.weight_kg, reps: result.data.reps };
        }
      });

      return {
        history,
        prs,
      } satisfies ActiveWorkoutSupplementalData;
    },
    enabled: !!sessionId && !!activeSessionCoreData,
  });

  const activeSessionData: ActiveWorkoutData | null = activeSessionCoreData
    ? {
        ...activeSessionCoreData,
        history: activeSessionSupplementalData?.history || {},
        prs: activeSessionSupplementalData?.prs || {},
      }
    : null;

  const logSet = useMutation({
    mutationFn: async (setData: Omit<WorkoutSetInsert, 'user_id'>) => {
      console.log(
        '[useActiveWorkout.logSet] Iniciando - exerciseId:',
        setData.exercise_id,
        'reps:',
        setData.reps,
        'weight:',
        setData.weight_kg,
      );
      try {
        const { data, error } = await supabase
          .from('workout_sets')
          .insert({
            ...setData,
            user_id: user?.id ?? '',
            created_at: new Date().toISOString(),
          })
          .select()
          .single();
        if (error) {
          console.error('[useActiveWorkout.logSet] Error:', error);
          throw error;
        }
        console.log('[useActiveWorkout.logSet] Éxito - id:', data?.id);
        return data;
      } catch (err) {
        console.error('[useActiveWorkout.logSet] Exception:', err);
        throw err;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['activeSession', sessionId] });
    },
  });

  const finishSession = useMutation({
    mutationFn: async ({ id, duration_s, rpe, notes }: FinishSession) => {
      console.log('[useActiveWorkout.finishSession] Iniciando - id:', id, 'duration:', duration_s, 's');
      try {
        // Fetch current start_time to calculate correct end_time (preserving backdating)
        const { data: currentSession } = await supabase
          .from('activity_sessions')
          .select('start_time')
          .eq('id', id)
          .single();

        let endTime = new Date().toISOString();
        if (currentSession?.start_time) {
          const startDate = new Date(currentSession.start_time);
          // End time = Start Time + Duration
          endTime = new Date(startDate.getTime() + duration_s * 1000).toISOString();
        }

        const { error } = await supabase
          .from('activity_sessions')
          .update({
            end_time: endTime,
            duration_s,
            rpe,
            description: notes,
          })
          .eq('id', id);
        if (error) {
          console.error('[useActiveWorkout.finishSession] Error:', error);
          throw error;
        }
        console.log('[useActiveWorkout.finishSession] Éxito');
      } catch (err) {
        console.error('[useActiveWorkout.finishSession] Exception:', err);
        throw err;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['activeSession'] });
      queryClient.invalidateQueries({ queryKey: ['completedSessions'] }); // Update 'Terminado' button
      queryClient.invalidateQueries({ queryKey: ['dailyPlans'] }); // Update plan status
      queryClient.invalidateQueries({ queryKey: ['activeSessionBanner'] }); // Hide Banner instantly
    },
  });

  const cancelSession = useMutation({
    mutationFn: async (sessionId: string) => {
      console.log('[useActiveWorkout.cancelSession] Cancelando sesión:', sessionId);
      try {
        // 1. Unlink from workout_plans if exists
        const { error: planError } = await supabase
          .from('workout_plans')
          .update({
            activity_session_id: null,
            status: 'planned',
            completed_at: null,
          })
          .eq('activity_session_id', sessionId);

        if (planError) throw planError;

        // 2. Delete sets first (cascade might handle checking local DB constraint, but better safe)
        await supabase.from('workout_sets').delete().eq('session_id', sessionId);

        const { error } = await supabase.from('activity_sessions').delete().eq('id', sessionId);

        if (error) throw error;
      } catch (err) {
        console.error('[useActiveWorkout.cancelSession] Error:', err);
        throw err;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['activeSession'] });
      queryClient.invalidateQueries({ queryKey: ['activeSessionBanner'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['dailyPlans'] }); // Reset "Resume" to "Start" instantly
    },
  });

  const deleteLastSet = useMutation({
    mutationFn: async ({ sessionId, exerciseId }: { sessionId: string; exerciseId: string }) => {
      console.log('[useActiveWorkout.deleteLastSet] Deleting last set for ex:', exerciseId);
      try {
        // Find the last set
        const { data: sets } = await supabase
          .from('workout_sets')
          .select('id, set_number')
          .eq('session_id', sessionId)
          .eq('exercise_id', exerciseId)
          .order('set_number', { ascending: false })
          .limit(1);

        if (sets && sets.length > 0) {
          const lastSet = sets[0];
          const { error } = await supabase.from('workout_sets').delete().eq('id', lastSet.id);

          if (error) throw error;
        }
      } catch (err) {
        console.error('[useActiveWorkout.deleteLastSet] Error:', err);
        throw err;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['activeSession', sessionId] });
    },
  });

  const deleteSpecificSet = useMutation({
    mutationFn: async ({
      sessionId,
      exerciseId,
      setNumber,
    }: {
      sessionId: string;
      exerciseId: string;
      setNumber: number;
    }) => {
      console.log('[useActiveWorkout.deleteSpecificSet] Deleting set:', setNumber, 'for ex:', exerciseId);
      try {
        const { error } = await supabase
          .from('workout_sets')
          .delete()
          .eq('session_id', sessionId)
          .eq('exercise_id', exerciseId)
          .eq('set_number', setNumber);

        if (error) throw error;
      } catch (err) {
        console.error('[useActiveWorkout.deleteSpecificSet] Error:', err);
        throw err;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['activeSession', sessionId] });
    },
  });

  const saveSessionSupersetLinks = useMutation({
    mutationFn: async ({ sessionId: sessionToSave, links }: SaveSessionSupersetLinks) => {
      if (!user) throw new Error('No user');

      const { error: deleteError } = await supabase
        .from('activity_session_superset_links')
        .delete()
        .eq('session_id', sessionToSave);
      if (deleteError) throw deleteError;

      if (links.length === 0) return;

      const { error: insertError } = await supabase.from('activity_session_superset_links').insert(
        links.map(link => ({
          session_id: sessionToSave,
          from_exercise_id: link.fromExerciseId,
          from_order_index: link.fromOrderIndex,
          to_exercise_id: link.toExerciseId,
          to_order_index: link.toOrderIndex,
        })),
      );
      if (insertError) {
        throw insertError;
      }
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['activeSession', sessionId] });
      queryClient.invalidateQueries({ queryKey: ['sessionDetail', variables.sessionId] });
    },
  });

  return {
    startSession,
    activeSessionData,
    isLoading,
    logSet,
    finishSession,
    cancelSession,
    deleteLastSet,
    deleteSpecificSet,
    saveSessionSupersetLinks,
  };
};
