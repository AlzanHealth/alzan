import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../context/AuthContext';
import { expireTrainingTemplates } from '../modules/training/services/templateLifecycleService';

const emptyUsageCounts: Record<string, number> = {};

const getGymTemplateUsageCounts = async (
  userId: string,
  templateIds: readonly string[],
): Promise<Record<string, number>> => {
  const counts = Object.fromEntries(templateIds.map(id => [id, 0]));
  if (templateIds.length === 0) return counts;

  const [{ data: plans, error: plansError }, { data: sessions, error: sessionsError }] = await Promise.all([
    supabase.from('workout_plans').select('gym_template_id').eq('user_id', userId).in('gym_template_id', templateIds),
    supabase
      .from('activity_sessions')
      .select('workout_template_id')
      .eq('user_id', userId)
      .in('workout_template_id', templateIds),
  ]);

  if (plansError) throw plansError;
  if (sessionsError) throw sessionsError;

  plans?.forEach(plan => {
    if (plan.gym_template_id) counts[plan.gym_template_id] = (counts[plan.gym_template_id] ?? 0) + 1;
  });
  sessions?.forEach(session => {
    if (session.workout_template_id)
      counts[session.workout_template_id] = (counts[session.workout_template_id] ?? 0) + 1;
  });

  return counts;
};

export const useGymRoutines = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const fetchRoutines = async () => {
    console.log('[useGymRoutines.fetch] Iniciando');
    try {
      if (!user) return [];
      await expireTrainingTemplates(user.id);
      const { data, error } = await supabase
        .from('workout_templates')
        .select('*')
        .eq('user_id', user.id)
        .or('source.is.null,source.neq.importing')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('[useGymRoutines.fetch] Error:', error);
        throw error;
      }
      const usageCounts = await getGymTemplateUsageCounts(
        user.id,
        (data ?? []).map(routine => routine.id),
      ).catch(usageError => {
        console.error('[useGymRoutines.fetch] Error loading usage counts:', usageError);
        return emptyUsageCounts;
      });
      console.log('[useGymRoutines.fetch] Éxito - rutinas:', data?.length);
      return (data ?? []).map(routine => ({ ...routine, usage_count: usageCounts[routine.id] ?? 0 }));
    } catch (err) {
      console.error('[useGymRoutines.fetch] Exception:', err);
      throw err;
    }
  };

  const {
    data: routines,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['gymRoutines', user?.id],
    queryFn: fetchRoutines,
    enabled: !!user,
  });

  const deleteRoutine = useMutation({
    mutationFn: async (id: string) => {
      console.log('[useGymRoutines.delete] Iniciando - id:', id);
      try {
        if (!user) throw new Error('No user');
        const { error } = await supabase.rpc('delete_training_template', {
          p_template_kind: 'gym',
          p_template_id: id,
        });
        if (error) {
          console.error('[useGymRoutines.delete] Error:', error);
          throw error;
        }
        console.log('[useGymRoutines.delete] Éxito');
      } catch (err) {
        console.error('[useGymRoutines.delete] Exception:', err);
        throw err;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['gymRoutines'] });
      queryClient.invalidateQueries({ queryKey: ['scheduledTemplates'] });
      queryClient.invalidateQueries({ queryKey: ['calendarDots'] });
    },
  });

  return {
    routines,
    isLoading,
    error,
    deleteRoutine,
  };
};
