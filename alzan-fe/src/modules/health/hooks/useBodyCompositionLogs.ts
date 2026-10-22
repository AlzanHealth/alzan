import { useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../../context/AuthContext';
import { bodyCompositionService } from '../services/bodyCompositionService';
import { healthQueryKeys } from './healthQueryKeys';

export const useBodyCompositionLogs = (limit = 100) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const lastInputRevision = useRef<{ userId: string; revision: number } | null>(null);
  return useQuery({
    queryKey: healthQueryKeys.composition(user?.id, limit),
    queryFn: async () => {
      const userId = user!.id;
      const logs = await bodyCompositionService.refreshSnapshots(userId, limit, () => {
        void queryClient.invalidateQueries({ queryKey: healthQueryKeys.composition(userId, limit) });
      });
      const revision = Math.max(0, ...logs.map(log => log.input_revision));
      if (lastInputRevision.current?.userId !== userId || lastInputRevision.current.revision !== revision) {
        lastInputRevision.current = { userId, revision };
        for (const source of ['weights', 'measurements', 'profile']) {
          void queryClient.invalidateQueries({ queryKey: ['health', userId, source] });
        }
        void queryClient.invalidateQueries({ queryKey: ['userProfile', userId] });
      }
      return logs;
    },
    enabled: !!user?.id,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    // Expiring inputs and provider imports are repaired while the screen is open.
    refetchInterval: 60_000,
  });
};
