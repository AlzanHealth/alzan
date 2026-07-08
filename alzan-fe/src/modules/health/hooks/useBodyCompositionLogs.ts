import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../../context/AuthContext';
import { supabase } from '../../../lib/supabaseClient';
import { BodyCompositionLog } from '../services/bodyCompositionService';

export const useBodyCompositionLogs = (limit = 100) => {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['bodyCompositionLogs', user?.id, limit],
    queryFn: async (): Promise<BodyCompositionLog[]> => {
      const { data, error } = await supabase
        .from('body_composition_logs')
        .select('*')
        .eq('user_id', user!.id)
        .order('calculated_for_date', { ascending: false })
        .limit(limit);

      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
  });
};
