import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../context/AuthContext';
// import { Database } from '../types/database.types';

export const useRoutines = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const {
    data: routines,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['routines', user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from('workout_templates')
        .select('*')
        .eq('user_id', user.id)
        .or('source.is.null,source.neq.importing')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const deleteRoutineMutation = useMutation({
    mutationFn: async (id: string) => {
      if (!user) throw new Error('No user');
      const { error } = await supabase.rpc('delete_training_template', {
        p_template_kind: 'gym',
        p_template_id: id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['routines'] });
    },
  });

  return {
    routines,
    isLoading,
    error,
    deleteRoutine: deleteRoutineMutation.mutate,
  };
};
