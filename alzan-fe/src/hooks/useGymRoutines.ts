import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../context/AuthContext';
import { expireTrainingTemplates } from '../modules/training/services/templateLifecycleService';

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
        .order('created_at', { ascending: false });

      if (error) {
        console.error('[useGymRoutines.fetch] Error:', error);
        throw error;
      }
      console.log('[useGymRoutines.fetch] Éxito - rutinas:', data?.length);
      return data;
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
        // 1. Delete only NON-COMPLETED workout_plans that reference this template
        const { error: plansError } = await supabase
          .from('workout_plans')
          .delete()
          .eq('gym_template_id', id)
          .is('completed_at', null);

        if (plansError) {
          console.error('[useGymRoutines.delete] Error deleting plans:', plansError);
          // Continue anyway
        }

        // 1.5 Unlink COMPLETED workout_plans (keep history but remove reference)
        const { error: unlinkPlansError } = await supabase
          .from('workout_plans')
          .update({ gym_template_id: null })
          .eq('gym_template_id', id);

        if (unlinkPlansError) {
          console.error('[useGymRoutines.delete] Error unlinking completed plans:', unlinkPlansError);
        }

        // 2. Unlink activity_sessions (set workout_template_id to null instead of deleting)
        const { error: sessionsError } = await supabase
          .from('activity_sessions')
          .update({ workout_template_id: null })
          .eq('workout_template_id', id);

        if (sessionsError) {
          console.error('[useGymRoutines.delete] Error unlinking sessions:', sessionsError);
          // Continue anyway, might be no sessions
        }

        // 3. Now delete the template itself
        const { error } = await supabase.from('workout_templates').delete().eq('id', id);
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
