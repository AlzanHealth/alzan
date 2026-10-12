import { QueryClient } from '@tanstack/react-query';
import { healthQueryKeys } from './healthQueryKeys';

export const invalidateStepsRelatedQueries = (queryClient: QueryClient, userId: string | undefined): void => {
  void queryClient.invalidateQueries({ queryKey: healthQueryKeys.all(userId) });
  void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
};
