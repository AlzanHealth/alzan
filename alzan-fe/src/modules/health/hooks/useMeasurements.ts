import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../../context/AuthContext';
import { measurementApi } from '../services/measurementApi';
import { MeasurementType } from '../../../types/requests.types';
import { bodyCompositionService } from '../services/bodyCompositionService';
import { healthQueryKeys } from './healthQueryKeys';

export const useMeasurements = (type?: MeasurementType, limit = 100) => {
  const { user } = useAuth();

  return useQuery({
    queryKey: healthQueryKeys.measurements(user?.id, Array.isArray(type) ? type.join(',') : type, limit),
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

      // Recalculate this day and every later snapshot that can reuse this measurement.
      try {
        await bodyCompositionService.invalidateAndRecalculateFromInput(user.id, targetDate.toISOString());
      } catch (err) {
        console.error('[useAddMeasurement] Error in trigger recalculate:', err);
      }

      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: healthQueryKeys.all(user?.id) });
    },
  });
};

export const useDeleteMeasurement = () => {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (id: string) => {
      const deleted = await measurementApi.deleteMeasurement(id);
      await bodyCompositionService.invalidateAndRecalculateFromInput(deleted.user_id, deleted.measured_at);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: healthQueryKeys.all(user?.id) });
    },
  });
};
