import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../../context/AuthContext';
import { hrApi } from '../services/hrApi';
import { healthQueryKeys } from './healthQueryKeys';

export const useRestingHRLogs = () => {
  const { user } = useAuth();
  return useQuery({
    queryKey: healthQueryKeys.restingHeartRate(user?.id),
    queryFn: () => hrApi.getLogs(user!.id),
    enabled: !!user?.id,
  });
};

export const useAddRestingHRLog = () => {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: (data: { resting_hr_bpm: number; measured_at?: string }) =>
      hrApi.addLog({
        user_id: user!.id,
        measured_at: new Date().toISOString(),
        source: 'manual',
        ...data,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: healthQueryKeys.all(user?.id) });
    },
  });
};

export const useDeleteRestingHRLog = () => {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: hrApi.deleteLog,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: healthQueryKeys.all(user?.id) });
    },
  });
};
