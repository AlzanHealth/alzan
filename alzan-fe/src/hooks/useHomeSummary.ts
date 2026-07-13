import { useQuery } from '@tanstack/react-query';
import { endOfDay, format, startOfWeek } from 'date-fns';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabaseClient';

export type HomeSummaryScheduledWorkout = {
  id: string;
  planned_date: string;
  gym_template_id: string | null;
  endurance_template_id: string | null;
  workout_templates?: {
    base_name: string | null;
  } | null;
  endurance_workout_templates?: {
    base_name: string | null;
    sport_type: string | null;
  } | null;
};

export type HomeSummaryActiveWorkout = {
  id: string;
  sport_type: string;
  sport_subtype: string | null;
  name: string | null;
  start_time: string;
} | null;

type HomeSummaryWeight = {
  weight_kg: number;
  measured_at: string;
} | null;

export type HomeWeeklySummary = {
  workoutsCount: number;
  nutritionDays: number;
  healthDays: number;
};

type HomeSummaryRpcRow = {
  completed_workouts_today: number;
  scheduled_workouts_today: HomeSummaryScheduledWorkout[] | null;
  active_today_workout: HomeSummaryActiveWorkout;
  weight: HomeSummaryWeight;
  weight_trend: number;
  weekly_workouts_count: number;
  weekly_nutrition_days: number;
  weekly_health_days: number;
};

type HomeSummaryRpc = {
  rpc: (
    fn: 'get_home_summary',
    args: {
      p_user_id: string;
      p_today: string;
      p_week_start: string;
      p_week_end: string;
    },
  ) => Promise<{ data: HomeSummaryRpcRow[] | null; error: { message: string } | null }>;
};

export const useHomeSummary = () => {
  const { user } = useAuth();
  const today = new Date();
  const todayStr = format(today, 'yyyy-MM-dd');
  const weekStart = startOfWeek(today, { weekStartsOn: 1 });
  const weekEnd = endOfDay(today);
  const weekStartDate = format(weekStart, 'yyyy-MM-dd');
  const weekEndDate = format(weekEnd, 'yyyy-MM-dd');

  return useQuery({
    queryKey: ['dashboard', 'home-summary', user?.id, todayStr, weekStartDate, weekEndDate],
    queryFn: async () => {
      if (!user) {
        return {
          completedWorkoutsCount: 0,
          scheduledWorkouts: [],
          activeTodayWorkout: null,
          health: { weight: null, weight_trend: 0, steps: 0 },
          weeklySummary: { workoutsCount: 0, nutritionDays: 0, healthDays: 0 },
        };
      }

      const { data, error } = await (supabase as unknown as HomeSummaryRpc).rpc('get_home_summary', {
        p_user_id: user.id,
        p_today: todayStr,
        p_week_start: weekStartDate,
        p_week_end: weekEndDate,
      });

      if (error) {
        console.error('[useHomeSummary] get_home_summary error:', error);
        throw error;
      }

      const summary = data?.[0];

      return {
        completedWorkoutsCount: summary?.completed_workouts_today ?? 0,
        scheduledWorkouts: summary?.scheduled_workouts_today ?? [],
        activeTodayWorkout: summary?.active_today_workout ?? null,
        health: {
          weight: summary?.weight ?? null,
          weight_trend: summary?.weight_trend ?? 0,
          steps: 0,
        },
        weeklySummary: {
          workoutsCount: summary?.weekly_workouts_count ?? 0,
          nutritionDays: summary?.weekly_nutrition_days ?? 0,
          healthDays: summary?.weekly_health_days ?? 0,
        },
      };
    },
    enabled: !!user,
    staleTime: 1000 * 60,
  });
};
