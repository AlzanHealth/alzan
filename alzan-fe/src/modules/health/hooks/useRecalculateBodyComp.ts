import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../../context/AuthContext';
import { healthQueryKeys } from './healthQueryKeys';
import { bodyCompositionService, ManualRecalculateResult } from '../services/bodyCompositionService';

/**
 * Hook for manually recalculating body composition
 * Limited to 2 recalculations per day
 */
export const useRecalculateBodyComp = () => {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (): Promise<ManualRecalculateResult> => {
      if (!user?.id) {
        return { success: false, errorCode: 'user_not_found' };
      }
      return bodyCompositionService.manualRecalculate(user.id);
    },
    onSuccess: async result => {
      if (result.success) {
        // Refresh weight logs and health insights
        await queryClient.invalidateQueries({ queryKey: healthQueryKeys.all(user?.id) });
      }
    },
  });
};
