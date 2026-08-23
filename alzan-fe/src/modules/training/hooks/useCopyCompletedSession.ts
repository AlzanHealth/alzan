import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../../context/AuthContext';
import {
  copyCompletedSession,
  countActivitySessionsOnDate,
  type CopyCompletedSessionInput,
} from '../services/copyCompletedSessionService';

export const useCopyCompletedSession = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CopyCompletedSessionInput) => copyCompletedSession(input),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['enduranceSessions'] }),
        queryClient.invalidateQueries({ queryKey: ['activitySession'] }),
        queryClient.invalidateQueries({ queryKey: ['calendarDots'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
        queryClient.invalidateQueries({ queryKey: ['completedSessions'] }),
        queryClient.invalidateQueries({ queryKey: ['dailyPlans'] }),
        queryClient.invalidateQueries({ queryKey: ['activeSessionBanner'] }),
      ]);
    },
  });
};

export const useCopyTargetSessionCount = (targetDate: string | null) => {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['copyCompletedSessionTargetCount', user?.id, targetDate],
    queryFn: () => countActivitySessionsOnDate(user!.id, targetDate!),
    enabled: !!user && !!targetDate,
    staleTime: 10_000,
  });
};
