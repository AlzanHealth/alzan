import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../context/AuthContext';
import { expireTrainingTemplates } from '../modules/training/services/templateLifecycleService';

export interface EnduranceTemplate {
  id: string;
  user_id: string;
  base_name: string;
  description: string | null;
  sport_type: string;
  workout_goal: string | null;
  total_duration_s: number | null;
  total_distance_m: number | null;
  created_at: string;
  updated_at: string;
}

export const useEnduranceTemplates = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const fetchTemplates = async () => {
    console.log('[useEnduranceTemplates.fetch] Iniciando');
    try {
      if (!user) return [];
      await expireTrainingTemplates(user.id);
      const { data, error } = await supabase
        .from('endurance_workout_templates')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('[useEnduranceTemplates.fetch] Error:', error);
        throw error;
      }
      console.log('[useEnduranceTemplates.fetch] Éxito - templates:', data?.length);
      return data as EnduranceTemplate[];
    } catch (err) {
      console.error('[useEnduranceTemplates.fetch] Exception:', err);
      throw err;
    }
  };

  const {
    data: templates = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ['enduranceTemplates', user?.id],
    queryFn: fetchTemplates,
    enabled: !!user,
  });

  const deleteTemplate = useMutation({
    mutationFn: async (id: string) => {
      console.log('[useEnduranceTemplates.delete] Iniciando - id:', id);
      try {
        // 1. Delete only NON-COMPLETED workout_plans that reference this template
        const { error: plansError } = await supabase
          .from('workout_plans')
          .delete()
          .eq('endurance_template_id', id)
          .is('completed_at', null);

        if (plansError) {
          console.error('[useEnduranceTemplates.delete] Error deleting plans:', plansError);
        }

        // 2. Unlink COMPLETED workout_plans (keep history but remove reference)
        const { error: unlinkPlansError } = await supabase
          .from('workout_plans')
          .update({ endurance_template_id: null })
          .eq('endurance_template_id', id);

        if (unlinkPlansError) {
          console.error('[useEnduranceTemplates.delete] Error unlinking completed plans:', unlinkPlansError);
        }

        // 3. Unlink activity_sessions
        const { error: sessionsError } = await supabase
          .from('activity_sessions')
          .update({ endurance_template_id: null })
          .eq('endurance_template_id', id);

        if (sessionsError) {
          console.error('[useEnduranceTemplates.delete] Error unlinking sessions:', sessionsError);
        }

        // 4. Delete steps (cascade)
        const { error: stepsError } = await supabase.from('endurance_workout_steps').delete().eq('template_id', id);

        if (stepsError) {
          console.error('[useEnduranceTemplates.delete] Error deleting steps:', stepsError);
        }

        // 5. Delete template
        const { error } = await supabase.from('endurance_workout_templates').delete().eq('id', id);

        if (error) {
          console.error('[useEnduranceTemplates.delete] Error:', error);
          throw error;
        }
        console.log('[useEnduranceTemplates.delete] Éxito');
      } catch (err) {
        console.error('[useEnduranceTemplates.delete] Exception:', err);
        throw err;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['enduranceTemplates'] });
      queryClient.invalidateQueries({ queryKey: ['enduranceWorkouts'] });
      queryClient.invalidateQueries({ queryKey: ['dailyPlans'] });
      queryClient.invalidateQueries({ queryKey: ['weekDots'] });
    },
  });

  return {
    templates,
    isLoading,
    error,
    deleteTemplate,
  };
};
