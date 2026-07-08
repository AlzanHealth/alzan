import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../../context/AuthContext';
import { measurementApi } from '../services/measurementApi';
import { MeasurementType } from '../../../types/requests.types';
import { bodyCompositionService } from '../services/bodyCompositionService';

export const useMeasurements = (type?: MeasurementType, limit = 100) => {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['measurements', user?.id, type, limit], // Keep original type in key to avoid cache thrashing if needed, or update to queryType
    queryFn: () => measurementApi.getMeasurements(user!.id, type, limit),
    enabled: !!user?.id,
  });
};

export const useAddMeasurement = () => {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (data: {
      measurement_type: MeasurementType;
      value_cm: number;
      measured_at?: string;
      notes?: string;
    }) => {
      if (!user?.id) throw new Error('No hay usuario autenticado');

      // Check if this measurement type already exists for this day
      const targetDate = data.measured_at ? new Date(data.measured_at) : new Date();
      const exists = await measurementApi.checkExistsForDay(user.id, data.measurement_type, targetDate);
      if (exists) {
        const error = new Error('DUPLICATE_DAY') as Error & { type: string; measurementType: string };
        error.type = 'DUPLICATE_DAY';
        error.measurementType = data.measurement_type;
        throw error;
      }

      const result = await measurementApi.addMeasurement({
        user_id: user.id,
        measured_at: targetDate.toISOString(),
        ...data,
      });

      // Trigger automatic recalculation for this day using the best available recent weight and measurements.
      try {
        const dateStr = `${targetDate.getFullYear()}-${String(targetDate.getMonth() + 1).padStart(2, '0')}-${String(targetDate.getDate()).padStart(2, '0')}`;
        await bodyCompositionService.checkAndTriggerRecalculateForMeasurements(user.id, dateStr);
      } catch (err) {
        console.error('[useAddMeasurement] Error in trigger recalculate:', err);
      }

      return result;
    },
    onSuccess: () => {
      // Invalidate measurements and weight logs for this user
      queryClient.invalidateQueries({ queryKey: ['measurements', user?.id] });
      queryClient.invalidateQueries({ queryKey: ['weightLogs'] });
      queryClient.invalidateQueries({ queryKey: ['bodyCompositionLogs'] });
      queryClient.invalidateQueries({ queryKey: ['healthInsights'] });
    },
  });
};

export const useDeleteMeasurement = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: measurementApi.deleteMeasurement,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['measurements'] });
    },
  });
};
