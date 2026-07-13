import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../../context/AuthContext';
import { healthQueryKeys } from './healthQueryKeys';
import { supabase } from '../../../lib/supabaseClient';

// Fetch basic profile info: height, sex, dob
export const useUserProfile = () => {
  const { user } = useAuth();
  return useQuery({
    queryKey: healthQueryKeys.profile(user?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('users')
        .select('height_cm, sex, date_of_birth')
        .eq('id', user!.id)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
  });
};
