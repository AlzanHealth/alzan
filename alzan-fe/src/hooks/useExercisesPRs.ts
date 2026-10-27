import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabaseClient';

export type ExercisePR = {
  weight_kg: number;
  reps: number | null;
};

export const useExercisesPRs = (exerciseIds: string[]) => {
  return useQuery({
    queryKey: ['exercises-prs', exerciseIds],
    queryFn: async () => {
      if (!exerciseIds || exerciseIds.length === 0) return {};

      // Remove duplicates
      const uniqueIds = Array.from(new Set(exerciseIds));

      const prPromises = uniqueIds.map(async exId => {
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
      const prs: Record<string, ExercisePR> = {};

      prResults.forEach(res => {
        if (res.data) {
          prs[res.exerciseId] = { weight_kg: res.data.weight_kg, reps: res.data.reps };
        }
      });

      return prs;
    },
    enabled: exerciseIds.length > 0,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
};
