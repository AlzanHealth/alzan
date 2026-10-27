import { useEffect, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../../context/AuthContext';
import { wearablesLocalHealthApi } from '../localHealthSyncApi';
import { pollingIntervalAfterError } from '../../../lib/querySafety';
import { CloudSyncRecoveryState, shouldRecoverCloudSyncPolling } from './activeCloudSyncRecovery';

const ACTIVE_SYNC_QUERY_KEY = 'activeCloudSyncs';

export const useActiveCloudSyncs = (isScreenFocused = false, isSyncRequestPending = false) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const activeSyncsQuery = useQuery({
    queryKey: [ACTIVE_SYNC_QUERY_KEY, user?.id],
    queryFn: async () => wearablesLocalHealthApi.listActiveCloudSyncs(),
    enabled: !!user?.id,
    refetchInterval: query =>
      pollingIntervalAfterError(
        query.state.error,
        isScreenFocused || isSyncRequestPending || query.state.data?.jobs.length ? 2500 : false,
      ),
  });

  const recoveryState = useRef<CloudSyncRecoveryState | undefined>(undefined);
  const { isError, refetch } = activeSyncsQuery;
  useEffect(() => {
    const current = { userId: user?.id, isScreenFocused, isSyncRequestPending };
    const recover = shouldRecoverCloudSyncPolling(recoveryState.current, current);
    recoveryState.current = current;
    if (recover && isError) void refetch({ cancelRefetch: false });
  }, [user?.id, isScreenFocused, isSyncRequestPending, isError, refetch]);

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
