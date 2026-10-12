import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { useAuth } from '../../../context/AuthContext';
import { aggregateStepsByDate } from '../services/stepsAggregation';
import { stepsApi } from '../services/stepsApi';
import { healthQueryKeys } from './healthQueryKeys';
import { isManualStepsRangeValid } from '../helpers/stepsRange.helper';
import { invalidateStepsRelatedQueries } from './stepsQueryInvalidation';

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
 * Highest step total recorded across sources for today, or null if none.
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

export const useManualStepsForRange = (fromDate: Date, toDate: Date, enabled = true) => {
  const { user } = useAuth();
  const fromDateKey = format(fromDate, 'yyyy-MM-dd');
  const toDateKey = format(toDate, 'yyyy-MM-dd');

  return useQuery({
    queryKey: [...healthQueryKeys.steps(user?.id), 'manual-range', fromDateKey, toDateKey],
    queryFn: () => stepsApi.getManualForRange(user!.id, fromDateKey, toDateKey),
    enabled: enabled && !!user?.id && isManualStepsRangeValid(fromDate, toDate),
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
      invalidateStepsRelatedQueries(queryClient, user?.id);
    },
  });
};

export type ManualStepsRangeRow = { date: Date; steps: number };

export const useUpsertManualStepsRange = () => {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (params: { rows: ManualStepsRangeRow[] }) => {
      if (!user?.id) throw new Error('No authenticated user');
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      await Promise.all(
        params.rows.map(row =>
          stepsApi.upsertManual({
            date: format(row.date, 'yyyy-MM-dd'),
            steps: row.steps,
            timezone,
          }),
        ),
      );
    },
    onSuccess: () => {
      invalidateStepsRelatedQueries(queryClient, user?.id);
    },
  });
};
