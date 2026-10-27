import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../../context/AuthContext';
import { weightApi } from '../services/weightApi';
import { bodyCompositionService } from '../services/bodyCompositionService';
import { healthQueryKeys } from './healthQueryKeys';
import { reportCompositionRefreshFailure } from '../helpers/compositionRequestGuard';

export const useWeightLogs = (limit = 100) => {
  const { user } = useAuth();
  return useQuery({
    queryKey: healthQueryKeys.weights(user?.id, limit),
    queryFn: () => weightApi.getLogs(user!.id, limit),
    enabled: !!user?.id,
  });
};

export const useAddWeightLog = () => {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (log: {
      weight_kg: number;
      bodyfat_percent?: number;
      muscle_mass_kg?: number;
      measured_at?: string;
    }) => {
      let userId = user?.id;

      if (!userId) {
        // Fallback: Check Supabase session directly
        const { data } = await import('../../../lib/supabaseClient').then(m => m.supabase.auth.getSession());
        userId = data.session?.user?.id;
      }

      if (!userId) throw new Error('No hay usuario autenticado');

      const targetDate = log.measured_at ? new Date(log.measured_at) : new Date();
      const startOfDay = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate()).toISOString();
      const endOfDay = new Date(
        targetDate.getFullYear(),
        targetDate.getMonth(),
        targetDate.getDate() + 1,
      ).toISOString();

      // Check if a weight log already exists for this day
      const { data: existingLogs } = await import('../../../lib/supabaseClient').then(m =>
        m.supabase
          .from('weight_logs')
          .select('id, weight_kg, bodyfat_percent, muscle_mass_kg')
          .eq('user_id', userId)
          .gte('measured_at', startOfDay)
          .lt('measured_at', endOfDay)
          .order('measured_at', { ascending: false })
          .limit(1),
      );

      const existingLog = existingLogs?.[0];

      if (existingLog) {
        // Overwrite the existing real weight log for this day if the weight changed.
        const updatedWeight = log.weight_kg;
        const currentWeight = existingLog.weight_kg;
        const weightDiff = Math.abs(updatedWeight - currentWeight);

        if (weightDiff >= 0.05 || log.bodyfat_percent !== undefined || log.muscle_mass_kg !== undefined) {
          console.log('[useAddWeightLog] Overwriting same-day weight record:', existingLog.id);
          const result = await weightApi.updateLog(existingLog.id, {
            weight_kg: updatedWeight,
            bodyfat_percent: log.bodyfat_percent ?? existingLog.bodyfat_percent,
            muscle_mass_kg: log.muscle_mass_kg ?? existingLog.muscle_mass_kg,
          });
          void bodyCompositionService
            .invalidateAndRecalculateFromInput(userId, targetDate.toISOString())
            .then(() => queryClient.invalidateQueries({ queryKey: healthQueryKeys.all(user?.id) }))
            .catch(reportCompositionRefreshFailure);
          return result;
        }

        void bodyCompositionService
          .invalidateAndRecalculateFromInput(userId, targetDate.toISOString())
          .then(() => queryClient.invalidateQueries({ queryKey: healthQueryKeys.all(user?.id) }))
          .catch(reportCompositionRefreshFailure);
        return existingLog;
      }

      // Normal insert if no log exists for the day
      const result = await weightApi.addLog({
        user_id: userId,
        measured_at: targetDate.toISOString(),
        source: 'manual',
        ...log,
      });

      // Auto-calculate daily composition without duplicating weight history.
      void bodyCompositionService
        .invalidateAndRecalculateFromInput(userId, result.measured_at)
        .then(() => queryClient.invalidateQueries({ queryKey: healthQueryKeys.all(user?.id) }))
        .catch(reportCompositionRefreshFailure);

      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: healthQueryKeys.all(user?.id) });
    },
  });
};

export const useDeleteWeightLog = () => {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (id: string) => {
      const deleted = await weightApi.deleteLog(id);
      void bodyCompositionService
        .invalidateAndRecalculateFromInput(deleted.user_id, deleted.measured_at)
        .then(() => queryClient.invalidateQueries({ queryKey: healthQueryKeys.all(user?.id) }))
        .catch(reportCompositionRefreshFailure);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: healthQueryKeys.all(user?.id) });
    },
  });
};
