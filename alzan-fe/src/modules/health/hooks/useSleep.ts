import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../../context/AuthContext';
import { sleepApi } from '../services/sleepApi';
import { healthQueryKeys } from './healthQueryKeys';

// ── Legacy sleep_logs hooks ─────────────────────────────────
export const useSleepLogs = () => {
  const { user } = useAuth();
  return useQuery({
    queryKey: [...healthQueryKeys.all(user?.id), 'legacy-sleep-logs'],
    queryFn: () => sleepApi.getLogs(user!.id),
    enabled: !!user?.id,
  });
};

export const useAddSleepLog = () => {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: (data: {
      date: string;
      duration_min: number;
      quality_score?: number;
      sleep_start?: string;
      sleep_end?: string;
    }) =>
      sleepApi.addLog({
        user_id: user!.id,
        source: 'manual',
        ...data,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: healthQueryKeys.all(user?.id) });
    },
  });
};

export const useDeleteSleepLog = () => {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: sleepApi.deleteLog,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: healthQueryKeys.all(user?.id) });
    },
  });
};

// ── New sleep_sessions hooks ────────────────────────────────
export const useSleepSessions = () => {
  const { user } = useAuth();
  return useQuery({
    queryKey: healthQueryKeys.sleepSessions(user?.id),
    queryFn: () => sleepApi.getSessions(user!.id),
    enabled: !!user?.id,
  });
};

export const useAddSleepSession = () => {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: (data: {
      date: string;
      total_sleep_min: number;
      sleep_score?: number;
      start_time: string;
      end_time: string;
    }) =>
      sleepApi.addSession({
        user_id: user!.id,
        source: 'manual',
        is_main_sleep: true,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        ...data,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: healthQueryKeys.all(user?.id) });
    },
  });
};

export const useSleepSessionDetail = (sessionId: string | null) => {
  const { user } = useAuth();
  return useQuery({
    queryKey: healthQueryKeys.sleepSession(user?.id, sessionId),
    queryFn: () => sleepApi.getSessionWithStages(sessionId!),
    enabled: !!sessionId,
  });
};

export const useDeleteSleepSession = () => {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: sleepApi.deleteSession,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: healthQueryKeys.all(user?.id) });
    },
  });
};
