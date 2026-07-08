import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../context/AuthContext';
import { startOfDay, endOfDay, format } from 'date-fns';
import { ActivitySession } from '../types/requests.types';

type DashboardActiveWorkout = Pick<ActivitySession, 'id' | 'sport_type' | 'sport_subtype' | 'name' | 'start_time'>;

export type UseDashboardDataScheduledWorkout = ReturnType<typeof useDashboardData>['scheduledWorkouts'][number];
export type UseDashboardDataActiveTodayWorkout = DashboardActiveWorkout | null;

export const useDashboardData = () => {
  const { user } = useAuth();
  const today = new Date();
  const start = startOfDay(today).toISOString();
  const end = endOfDay(today).toISOString();
  const todayStr = format(today, 'yyyy-MM-dd');

  const { data: workouts, isLoading: workoutsLoading } = useQuery({
    queryKey: ['dashboard', 'workouts', user?.id, todayStr],
    queryFn: async () => {
      try {
        if (!user) return [];
        const { data, error } = await supabase
          .from('activity_sessions')
          .select('id')
          .eq('user_id', user.id)
          .gte('start_time', start)
          .lte('start_time', end);

        if (error) throw error;
        return data;
      } catch (err) {
        console.error('[useDashboardData.workouts] Exception:', err);
        throw err;
      }
    },
    enabled: !!user,
  });

  const { data: scheduledWorkouts, isLoading: scheduledLoading } = useQuery({
    queryKey: ['dashboard', 'scheduled_workouts', user?.id, todayStr],
    queryFn: async () => {
      try {
        if (!user) return [];
        // Fetch Planned workouts for today
        const { data, error } = await supabase
          .from('workout_plans')
          .select('*, workout_templates(base_name), endurance_workout_templates(base_name, sport_type)')
          .eq('user_id', user.id)
          .eq('planned_date', todayStr)
          .eq('status', 'planned');

        if (error) throw error;
        return data;
      } catch (err) {
        console.error('[useDashboardData.scheduled] Exception:', err);
        throw err;
      }
    },
    enabled: !!user,
  });

  const { data: activeTodayWorkout, isLoading: activeTodayLoading } = useQuery({
    queryKey: ['dashboard', 'active_today_workout', user?.id, todayStr],
    queryFn: async () => {
      try {
        if (!user) return null;

        const { data, error } = await supabase
          .from('activity_sessions')
          .select('id, sport_type, sport_subtype, name, start_time')
          .eq('user_id', user.id)
          .is('end_time', null)
          .gte('start_time', start)
          .lte('start_time', end)
          .order('start_time', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (error) throw error;
        return data as DashboardActiveWorkout | null;
      } catch (err) {
        console.error('[useDashboardData.activeTodayWorkout] Exception:', err);
        throw err;
      }
    },
    enabled: !!user,
  });

  const { data: health, isLoading: healthLoading } = useQuery({
    queryKey: ['dashboard', 'health', user?.id],
    queryFn: async () => {
      try {
        if (!user) return null;

        // Latest weight (fetch 2 for trend)
        const { data: weightData } = await supabase
          .from('weight_logs')
          .select('weight_kg, measured_at')
          .eq('user_id', user.id)
          .order('measured_at', { ascending: false })
          .limit(2);

        const currentWeight = weightData?.[0] || null;
        const previousWeight = weightData?.[1] || null;
        const weightTrend = currentWeight && previousWeight ? currentWeight.weight_kg - previousWeight.weight_kg : 0;

        return {
          weight: currentWeight,
          weight_trend: weightTrend,
          // Placeholder for Steps
          steps: 0,
        };
      } catch (err) {
        console.error('[useDashboardData.health] Exception:', err);
        throw err;
      }
    },
    enabled: !!user,
  });

  const completedWorkoutsCount = workouts?.length || 0;

  return {
    workouts,
    scheduledWorkouts: scheduledWorkouts || [],
    activeTodayWorkout: activeTodayWorkout || null,
    completedWorkoutsCount,
    health,
    isLoading: workoutsLoading || healthLoading || scheduledLoading || activeTodayLoading,
  };
};
