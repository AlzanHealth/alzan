import { useQuery } from '@tanstack/react-query';
import { endOfDay, format, parseISO, startOfWeek } from 'date-fns';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabaseClient';

type DateRow = { date: string };
type TimestampRow = { measured_at: string };
type WorkoutRow = { id: string };

export type HomeWeeklySummary = {
  workoutsCount: number;
  nutritionDays: number;
  healthDays: number;
};

const toDateKeyFromTimestamp = (value: string): string => format(parseISO(value), 'yyyy-MM-dd');

export const useHomeWeeklySummary = () => {
  const { user } = useAuth();
  const today = new Date();
  const weekStart = startOfWeek(today, { weekStartsOn: 1 });
  const weekEnd = endOfDay(today);
  const weekStartDate = format(weekStart, 'yyyy-MM-dd');
  const weekEndDate = format(weekEnd, 'yyyy-MM-dd');

  return useQuery({
    queryKey: ['home', 'weekly-summary', user?.id, weekStartDate, weekEndDate],
    queryFn: async (): Promise<HomeWeeklySummary> => {
      if (!user) return { workoutsCount: 0, nutritionDays: 0, healthDays: 0 };

      const [workoutsResult, mealLogsResult, weightLogsResult, sleepResult, hydrationResult] = await Promise.all([
        supabase
          .from('activity_sessions')
          .select('id')
          .eq('user_id', user.id)
          .gte('start_time', weekStart.toISOString())
          .lte('start_time', weekEnd.toISOString())
          .returns<WorkoutRow[]>(),
        supabase
          .from('meal_logs')
          .select('date')
          .eq('user_id', user.id)
          .gte('date', weekStartDate)
          .lte('date', weekEndDate)
          .returns<DateRow[]>(),
        supabase
          .from('weight_logs')
          .select('measured_at')
          .eq('user_id', user.id)
          .gte('measured_at', weekStart.toISOString())
          .lte('measured_at', weekEnd.toISOString())
          .returns<TimestampRow[]>(),
        supabase
          .from('sleep_sessions')
          .select('date')
          .eq('user_id', user.id)
          .gte('date', weekStartDate)
          .lte('date', weekEndDate)
          .returns<DateRow[]>(),
        supabase
          .from('daily_hydration')
          .select('date')
          .eq('user_id', user.id)
          .gte('date', weekStartDate)
          .lte('date', weekEndDate)
          .returns<DateRow[]>(),
      ]);

      const queryError = [
        workoutsResult.error,
        mealLogsResult.error,
        weightLogsResult.error,
        sleepResult.error,
        hydrationResult.error,
      ].find(Boolean);
      if (queryError) throw queryError;

      const nutritionDates = new Set((mealLogsResult.data ?? []).map(row => row.date));
      const healthDates = new Set<string>();
      (weightLogsResult.data ?? []).forEach(row => healthDates.add(toDateKeyFromTimestamp(row.measured_at)));
      (sleepResult.data ?? []).forEach(row => healthDates.add(row.date));
      (hydrationResult.data ?? []).forEach(row => healthDates.add(row.date));

      return {
        workoutsCount: workoutsResult.data?.length ?? 0,
        nutritionDays: nutritionDates.size,
        healthDays: healthDates.size,
      };
    },
    enabled: !!user,
  });
};
