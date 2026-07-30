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
        .or('source.is.null,source.neq.importing')
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
