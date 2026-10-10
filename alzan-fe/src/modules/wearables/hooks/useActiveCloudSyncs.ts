import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../../context/AuthContext';
import { wearablesLocalHealthApi } from '../localHealthSyncApi';

const ACTIVE_SYNC_QUERY_KEY = 'activeCloudSyncs';

export const useActiveCloudSyncs = (isScreenFocused = false, isSyncRequestPending = false) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const activeSyncsQuery = useQuery({
    queryKey: [ACTIVE_SYNC_QUERY_KEY, user?.id],
    queryFn: async () => wearablesLocalHealthApi.listActiveCloudSyncs(),
    enabled: !!user?.id,
    refetchInterval: query => (isScreenFocused || isSyncRequestPending || query.state.data?.jobs.length ? 2500 : false),
  });

  const cancelMutation = useMutation({
    mutationFn: wearablesLocalHealthApi.cancelActiveCloudSyncs,
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: [ACTIVE_SYNC_QUERY_KEY, user?.id] });
    },
  });

  const jobs = activeSyncsQuery.data?.jobs ?? [];

  return {
    jobs,
    hasActiveSyncs: jobs.length > 0,
    isLoading: activeSyncsQuery.isLoading,
    isCancelling: cancelMutation.isPending,
    allCancellationRequested: jobs.length > 0 && jobs.every(job => job.cancellation_requested),
    cancel: cancelMutation.mutateAsync,
  };
};
