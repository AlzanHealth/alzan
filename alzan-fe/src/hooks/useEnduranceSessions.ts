import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../context/AuthContext';
import { ActivitySessionInsert, ActivitySessionUpdate, ActivitySession } from '../types/requests.types';

interface UseEnduranceSessionsOptions {
  startDate?: string; // ISO 8601 format YYYY-MM-DD
  endDate?: string; // ISO 8601 format YYYY-MM-DD
  sportType?: ActivitySession['sport_type'] | 'gym' | 'volleyball' | 'all';
  limit?: number;
  enabled?: boolean;
}

export const useEnduranceSessions = (options?: UseEnduranceSessionsOptions) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const queryEnabled = !!user && (options?.enabled ?? true);

  const fetchSessions = async () => {
    try {
      if (!user) return [];
      let query = supabase.from('activity_sessions').select('*').eq('user_id', user.id);

      // Apply date filters if provided
      if (options?.startDate) {
        query = query.gte('start_time', options.startDate);
      }
      if (options?.endDate) {
        // Add one day to include the entire end date
        const endDateTime = new Date(options.endDate);
        endDateTime.setDate(endDateTime.getDate() + 1);
        query = query.lt('start_time', endDateTime.toISOString());
      }
      if (options?.sportType && options.sportType !== 'all') {
        if (options.sportType === 'gym') {
          query = query.in('sport_type', ['strength', 'gym']);
        } else {
          query = query.eq('sport_type', options.sportType as ActivitySession['sport_type']);
        }
      }

      query = query.order('start_time', { ascending: false });

      if (typeof options?.limit === 'number' && options.limit > 0) {
        query = query.limit(options.limit);
      }

      const { data, error } = await query;

      if (error) {
        console.error('[useEnduranceSessions.fetch] Error:', error);
        throw error;
      }
      return data ?? [];
    } catch (err) {
      console.error('[useEnduranceSessions.fetch] Exception:', err);
      throw err;
    }
  };

  const fetchSessionsCount = async () => {
    if (!user) return 0;

    let query = supabase.from('activity_sessions').select('*', { count: 'exact', head: true }).eq('user_id', user.id);

    if (options?.startDate) {
      query = query.gte('start_time', options.startDate);
    }

    if (options?.endDate) {
      const endDateTime = new Date(options.endDate);
      endDateTime.setDate(endDateTime.getDate() + 1);
      query = query.lt('start_time', endDateTime.toISOString());
    }

    if (options?.sportType && options.sportType !== 'all') {
      if (options.sportType === 'gym') {
        query = query.in('sport_type', ['strength', 'gym']);
      } else {
        query = query.eq('sport_type', options.sportType as ActivitySession['sport_type']);
      }
    }

    const { count, error } = await query;

    if (error) {
      console.error('[useEnduranceSessions.count] Error:', error);
      throw error;
    }

    return count ?? 0;
  };

  const {
    data: sessions = [],
    isLoading,
    isFetching,
  } = useQuery({
    queryKey: [
      'enduranceSessions',
      user?.id,
      options?.startDate,
      options?.endDate,
      options?.sportType ?? 'all',
      options?.limit ?? 'all',
    ],
    queryFn: fetchSessions,
    enabled: queryEnabled,
    placeholderData: previousData => previousData,
  });

  const { data: totalCount = sessions.length } = useQuery({
    queryKey: ['enduranceSessions-count', user?.id, options?.startDate, options?.endDate, options?.sportType ?? 'all'],
    queryFn: fetchSessionsCount,
    enabled: queryEnabled && typeof options?.limit === 'number' && options.limit > 0,
    staleTime: 1000 * 30,
  });

  const hasMore = typeof options?.limit === 'number' && options.limit > 0 ? totalCount > sessions.length : false;

  const createSession = useMutation({
    mutationFn: async (sessionData: ActivitySessionInsert) => {
      try {
        if (!user) throw new Error('No user');
        const { data, error } = await supabase
          .from('activity_sessions')
          .insert({
            ...sessionData,
            user_id: user.id,
            source: 'manual',
            created_at: new Date().toISOString(),
          })
          .select()
          .single();
        if (error) {
          console.error('[useEnduranceSessions.create] Error:', error);
          throw error;
        }
        return data;
      } catch (err) {
        console.error('[useEnduranceSessions.create] Exception:', err);
        throw err;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['enduranceSessions'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['completedSessions'] });
      queryClient.invalidateQueries({ queryKey: ['dailyPlans'] });
      queryClient.invalidateQueries({ queryKey: ['calendarDots'] });
    },
  });

  const deleteSession = useMutation({
    mutationFn: async (sessionId: string) => {
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

        if (planError) {
          console.error('[useEnduranceSessions.delete] Plan unlink error:', planError);
          throw planError;
        }

        // 2. Delete related sets first if any
        await supabase.from('workout_sets').delete().eq('session_id', sessionId);

        const { error } = await supabase.from('activity_sessions').delete().eq('id', sessionId);

        if (error) throw error;
      } catch (err) {
        console.error('[useEnduranceSessions.delete] Error:', err);
        throw err;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['enduranceSessions'] });
      queryClient.invalidateQueries({ queryKey: ['activeSessionBanner'] });
      queryClient.invalidateQueries({ queryKey: ['activeSession'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['completedSessions'] });
      queryClient.invalidateQueries({ queryKey: ['dailyPlans'] });
      queryClient.invalidateQueries({ queryKey: ['calendarDots'] });
    },
  });

  const updateSession = useMutation({
    mutationFn: async ({ sessionId, updates }: { sessionId: string; updates: ActivitySessionUpdate }) => {
      try {
        const { data, error } = await supabase
          .from('activity_sessions')
          .update(updates)
          .eq('id', sessionId)
          .select()
          .single();
        if (error) {
          console.error('[useEnduranceSessions.update] Error:', error);
          throw error;
        }
        return data;
      } catch (err) {
        console.error('[useEnduranceSessions.update] Exception:', err);
        throw err;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['enduranceSessions'] });
      queryClient.invalidateQueries({ queryKey: ['activeSessionBanner'] });
      queryClient.invalidateQueries({ queryKey: ['activeSession'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['completedSessions'] });
      queryClient.invalidateQueries({ queryKey: ['dailyPlans'] });
      queryClient.invalidateQueries({ queryKey: ['calendarDots'] });
    },
  });

  return {
    sessions,
    isLoading,
    isFetching,
    hasMore,
    totalCount,
    createSession,
    updateSession,
    deleteSession,
  };
};

export const useEnduranceTemplateSteps = (templateId?: string | null) => {
  return useQuery({
    queryKey: ['enduranceTemplateSteps', templateId],
    queryFn: async () => {
      if (!templateId) return [];

      const { data, error } = await supabase
        .from('endurance_workout_steps')
        .select('*')
        .eq('template_id', templateId)
        .order('order_index');

      if (error) throw error;
      return data;
    },
    enabled: !!templateId,
  });
};
