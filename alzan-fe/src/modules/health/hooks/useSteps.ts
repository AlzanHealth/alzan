import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { useAuth } from '../../../context/AuthContext';
import { aggregateStepsByDate } from '../services/stepsAggregation';
import { stepsApi } from '../services/stepsApi';
import { healthQueryKeys } from './healthQueryKeys';

/**
 * Daily step rows for the last `days` days (oldest first). Used by the chart.
 */
export const useStepsRange = (days = 366) => {
  const { user } = useAuth();
  return useQuery({
    queryKey: [...healthQueryKeys.steps(user?.id), 'range', days],
    queryFn: () => {
      const from = new Date();
      from.setDate(from.getDate() - days);
      return stepsApi.getRange(user!.id, format(from, 'yyyy-MM-dd'));
    },
    enabled: !!user?.id,
  });
};

/**
 * Aggregated step total for today (manual value preferred), or null if none.
 */
export const useTodaySteps = () => {
  const { user } = useAuth();
  const today = format(new Date(), 'yyyy-MM-dd');
  return useQuery({
    queryKey: [...healthQueryKeys.steps(user?.id), 'today', today],
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
    queryKey: [...healthQueryKeys.steps(user?.id), 'manual', dateKey],
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
        date: format(params.date, 'yyyy-MM-dd'),
        steps: params.steps,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: healthQueryKeys.steps(user?.id) });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
};
