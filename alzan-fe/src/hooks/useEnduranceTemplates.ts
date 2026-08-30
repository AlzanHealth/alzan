import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../context/AuthContext';
import { expireTrainingTemplates } from '../modules/training/services/templateLifecycleService';

const emptyUsageCounts: Record<string, number> = {};

const getEnduranceTemplateUsageCounts = async (
  userId: string,
  templateIds: readonly string[],
): Promise<Record<string, number>> => {
  const counts = Object.fromEntries(templateIds.map(id => [id, 0]));
  if (templateIds.length === 0) return counts;

  const [{ data: plans, error: plansError }, { data: sessions, error: sessionsError }] = await Promise.all([
    supabase
      .from('workout_plans')
      .select('endurance_template_id')
      .eq('user_id', userId)
      .in('endurance_template_id', templateIds),
    supabase
      .from('activity_sessions')
      .select('endurance_template_id')
      .eq('user_id', userId)
      .in('endurance_template_id', templateIds),
  ]);

  if (plansError) throw plansError;
  if (sessionsError) throw sessionsError;

  plans?.forEach(plan => {
    if (plan.endurance_template_id) counts[plan.endurance_template_id] = (counts[plan.endurance_template_id] ?? 0) + 1;
  });
  sessions?.forEach(session => {
    if (session.endurance_template_id) {
      counts[session.endurance_template_id] = (counts[session.endurance_template_id] ?? 0) + 1;
    }
  });

  return counts;
};

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
  usage_count?: number;
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
        .or('source.is.null,source.neq.importing')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('[useEnduranceTemplates.fetch] Error:', error);
        throw error;
      }
      const usageCounts = await getEnduranceTemplateUsageCounts(
        user.id,
        (data ?? []).map(template => template.id),
      ).catch(usageError => {
        console.error('[useEnduranceTemplates.fetch] Error loading usage counts:', usageError);
        return emptyUsageCounts;
      });
      console.log('[useEnduranceTemplates.fetch] Éxito - templates:', data?.length);
      return (data ?? []).map(template => ({
        ...template,
        usage_count: usageCounts[template.id] ?? 0,
      })) as EnduranceTemplate[];
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
        if (!user) throw new Error('No user');
        const { error } = await supabase.rpc('delete_training_template', {
          p_template_kind: 'endurance',
          p_template_id: id,
        });
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
