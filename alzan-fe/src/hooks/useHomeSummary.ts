import { useQuery } from '@tanstack/react-query';
import { endOfDay, format, parseISO, startOfDay, startOfWeek } from 'date-fns';
import { useAuth } from '../context/AuthContext';
import { usePreferencesContext } from '../context/PreferencesContext';
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
      p_timezone: string;
    },
  ) => Promise<{ data: HomeSummaryRpcRow[] | null; error: { message: string } | null }>;
};

const getDeviceTimezone = (): string => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
};

export const useHomeSummary = () => {
  const { user } = useAuth();
  const { preferences } = usePreferencesContext();
  const today = new Date();
  const start = startOfDay(today).toISOString();
  const end = endOfDay(today).toISOString();
  const todayStr = format(today, 'yyyy-MM-dd');
  const weekStart = startOfWeek(today, { weekStartsOn: 1 });
  const weekEnd = endOfDay(today);
  const weekStartDate = format(weekStart, 'yyyy-MM-dd');
  const weekEndDate = format(weekEnd, 'yyyy-MM-dd');
  const timezone = preferences?.timezone || getDeviceTimezone();

  return useQuery({
    queryKey: ['dashboard', 'home-summary', user?.id, todayStr, weekStartDate, weekEndDate, timezone],
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
        p_timezone: timezone,
      });

      if (error) {
        console.error('[useHomeSummary] get_home_summary error:', error);
        const [
          workoutsResult,
          scheduledResult,
          activeResult,
          weightResult,
          weeklyWeightResult,
          weeklyWorkoutsResult,
          mealLogsResult,
          sleepResult,
          hydrationResult,
        ] = await Promise.all([
          supabase
            .from('activity_sessions')
            .select('id')
            .eq('user_id', user.id)
            .gte('start_time', start)
            .lte('start_time', end),
          supabase
            .from('workout_plans')
            .select('*, workout_templates(base_name), endurance_workout_templates(base_name, sport_type)')
            .eq('user_id', user.id)
            .eq('planned_date', todayStr)
            .eq('status', 'planned'),
          supabase
            .from('activity_sessions')
            .select('id, sport_type, sport_subtype, name, start_time')
            .eq('user_id', user.id)
            .is('end_time', null)
            .gte('start_time', start)
            .lte('start_time', end)
            .order('start_time', { ascending: false })
            .limit(1)
            .maybeSingle(),
          supabase
            .from('weight_logs')
            .select('weight_kg, measured_at')
            .eq('user_id', user.id)
            .order('measured_at', { ascending: false })
            .limit(2),
          supabase
            .from('weight_logs')
            .select('measured_at')
            .eq('user_id', user.id)
            .gte('measured_at', weekStart.toISOString())
            .lte('measured_at', weekEnd.toISOString()),
          supabase
            .from('activity_sessions')
            .select('id')
            .eq('user_id', user.id)
            .gte('start_time', weekStart.toISOString())
            .lte('start_time', weekEnd.toISOString()),
          supabase
            .from('meal_logs')
            .select('date')
            .eq('user_id', user.id)
            .gte('date', weekStartDate)
            .lte('date', weekEndDate),
          supabase
            .from('sleep_sessions')
            .select('date')
            .eq('user_id', user.id)
            .gte('date', weekStartDate)
            .lte('date', weekEndDate),
          supabase
            .from('daily_hydration')
            .select('date')
            .eq('user_id', user.id)
            .gte('date', weekStartDate)
            .lte('date', weekEndDate),
        ]);

        const fallbackError = [
          workoutsResult.error,
          scheduledResult.error,
          activeResult.error,
          weightResult.error,
          weeklyWeightResult.error,
          weeklyWorkoutsResult.error,
          mealLogsResult.error,
          sleepResult.error,
          hydrationResult.error,
        ].find(Boolean);
        if (fallbackError) throw fallbackError;

        const currentWeight = weightResult.data?.[0] ?? null;
        const previousWeight = weightResult.data?.[1] ?? null;
        const nutritionDates = new Set((mealLogsResult.data ?? []).map(row => row.date));
        const healthDates = new Set<string>();
        (weeklyWeightResult.data ?? []).forEach(row =>
          healthDates.add(format(parseISO(row.measured_at), 'yyyy-MM-dd')),
        );
        (sleepResult.data ?? []).forEach(row => healthDates.add(row.date));
        (hydrationResult.data ?? []).forEach(row => healthDates.add(row.date));

        return {
          completedWorkoutsCount: workoutsResult.data?.length ?? 0,
          scheduledWorkouts: scheduledResult.data ?? [],
          activeTodayWorkout: (activeResult.data as HomeSummaryActiveWorkout) ?? null,
          health: {
            weight: currentWeight,
            weight_trend: currentWeight && previousWeight ? currentWeight.weight_kg - previousWeight.weight_kg : 0,
            steps: 0,
          },
          weeklySummary: {
            workoutsCount: weeklyWorkoutsResult.data?.length ?? 0,
            nutritionDays: nutritionDates.size,
            healthDays: healthDates.size,
          },
        };
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
