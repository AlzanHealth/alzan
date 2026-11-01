import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../../context/AuthContext';
import {
  createRunningShoe,
  getRunningShoes,
  RunningShoeInput,
  RunningShoeUpdateInput,
  setDefaultRunningShoe,
  updateRunningShoe,
} from '../services/runningShoesService';

export const runningShoeQueryKeys = {
  all: ['runningShoes'] as const,
  forUser: (userId: string | undefined) => ['runningShoes', userId] as const,
};

export const useRunningShoes = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const queryKey = runningShoeQueryKeys.forUser(user?.id);

  const shoesQuery = useQuery({
    queryKey,
    queryFn: () => {
      if (!user) throw new Error('RUNNING_SHOE_USER_REQUIRED');
      return getRunningShoes(user.id);
    },
    enabled: !!user,
  });

  const invalidateShoeData = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey }),
      queryClient.invalidateQueries({ queryKey: ['enduranceSessions'] }),
      queryClient.invalidateQueries({ queryKey: ['activitySession'] }),
    ]);
  };

  const createMutation = useMutation({
    mutationFn: (input: RunningShoeInput) => createRunningShoe(input),
    onSuccess: invalidateShoeData,
  });

  const updateMutation = useMutation({
    mutationFn: async ({ shoeId, updates }: { shoeId: string; updates: RunningShoeUpdateInput }) => {
      if (!user) throw new Error('RUNNING_SHOE_USER_REQUIRED');
      return updateRunningShoe(shoeId, updates);
    },
    onSuccess: invalidateShoeData,
  });

  const setDefaultMutation = useMutation({
    mutationFn: ({ shoeId, makeDefault }: { shoeId: string; makeDefault: boolean }) =>
      setDefaultRunningShoe(shoeId, makeDefault),
    onSuccess: invalidateShoeData,
  });

  return {
    shoes: shoesQuery.data ?? [],
    isLoading: shoesQuery.isLoading,
    isError: shoesQuery.isError,
    error: shoesQuery.error,
    refetch: shoesQuery.refetch,
    createRunningShoe: createMutation,
    updateRunningShoe: updateMutation,
    setDefaultRunningShoe: setDefaultMutation,
  };
};
