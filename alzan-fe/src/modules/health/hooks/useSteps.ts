import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { useAuth } from '../../../context/AuthContext';
import { stepsApi, StepsRow } from '../services/stepsApi';

const STEPS_QUERY_KEY = 'dailySteps';

/**
 * Daily step rows for the last `days` days (oldest first). Used by the chart.
 */
export const useStepsRange = (days = 366) => {
  const { user } = useAuth();
  return useQuery({
    queryKey: [STEPS_QUERY_KEY, user?.id, days],
    queryFn: () => {
      const from = new Date();
      from.setDate(from.getDate() - days);
      return stepsApi.getRange(user!.id, format(from, 'yyyy-MM-dd'));
    },
    enabled: !!user?.id,
  });
};

/**
 * Collapse multiple sources for the same day into a single value per date.
 * Prefers the manual value, otherwise the largest reported total.
 */
export const aggregateStepsByDate = (rows: StepsRow[]): Map<string, number> => {
  const byDate = new Map<string, { value: number; manual: boolean }>();
  for (const row of rows) {
    const existing = byDate.get(row.date);
    if (!existing) {
      byDate.set(row.date, { value: row.total_steps, manual: row.is_manual });
      continue;
    }
    // Manual wins; otherwise keep the highest total.
    if (row.is_manual && !existing.manual) {
      byDate.set(row.date, { value: row.total_steps, manual: true });
    } else if (row.is_manual === existing.manual && row.total_steps > existing.value) {
      byDate.set(row.date, { value: row.total_steps, manual: existing.manual });
    }
  }
  return new Map(Array.from(byDate.entries()).map(([date, v]) => [date, v.value]));
};

/**
 * Aggregated step total for today (manual value preferred), or null if none.
 */
export const useTodaySteps = () => {
  const { user } = useAuth();
  const today = format(new Date(), 'yyyy-MM-dd');
  return useQuery({
    queryKey: [STEPS_QUERY_KEY, 'today', user?.id, today],
    queryFn: async () => {
      const rows = await stepsApi.getRange(user!.id, today);
      const byDate = aggregateStepsByDate(rows);
      return byDate.get(today) ?? null;
    },
    enabled: !!user?.id,
  });
};

export const useManualStepsForDate = (date: Date) => {
  const { user } = useAuth();
  const dateKey = format(date, 'yyyy-MM-dd');

  return useQuery({
    queryKey: [STEPS_QUERY_KEY, 'manual', user?.id, dateKey],
    queryFn: () => stepsApi.getManualForDate(user!.id, dateKey),
    enabled: !!user?.id,
  });
};

export const useUpsertManualSteps = () => {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (params: { date: Date; steps: number }) => {
      if (!user?.id) throw new Error('No authenticated user');
      await stepsApi.upsertManual({
        userId: user.id,
        date: format(params.date, 'yyyy-MM-dd'),
        steps: params.steps,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [STEPS_QUERY_KEY] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
};
