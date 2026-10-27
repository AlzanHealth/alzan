import assert from 'node:assert/strict';
import { QueryClient, QueryObserver } from '@tanstack/react-query';
import { shouldRecoverCloudSyncPolling, CloudSyncRecoveryState } from './activeCloudSyncRecovery';
import { pollingIntervalAfterError } from '../../../lib/querySafety';

const verify = async () => {
  const client = new QueryClient();
  let requests = 0;
  let previous: CloudSyncRecoveryState | undefined;
  const observer = new QueryObserver(client, {
    queryKey: ['cloud-sync-recovery', 'alice'],
    queryFn: async () => {
      requests++;
      throw new Error('temporarily offline');
    },
    retry: false,
    refetchInterval: query => pollingIntervalAfterError(query.state.error, 10),
  });
  const unsubscribe = observer.subscribe(() => {});
  const update = async (state: CloudSyncRecoveryState) => {
    const recover = shouldRecoverCloudSyncPolling(previous, state);
    previous = state;
    if (recover && observer.getCurrentResult().isError) await observer.refetch({ cancelRefetch: false });
  };
  try {
    const focused = { userId: 'alice', isScreenFocused: true, isSyncRequestPending: false };
    await update(focused);
    await observer.refetch({ cancelRefetch: false });
    assert.equal(requests, 1, 'mount must share the existing initial request');
    await update(focused);
    assert.equal(requests, 1, 'a failed request must stay paused without a new user action');
    await update({ ...focused, isScreenFocused: false });
    await update(focused);
    assert.equal(requests, 2, 'returning to the screen must retry a failed status query once');
    await update(focused);
    assert.equal(requests, 2, 'another failure must not create a retry loop');
    await update({ ...focused, isSyncRequestPending: true });
    assert.equal(requests, 3, 'starting a fresh sync must retry failed status polling');
    await update({ ...focused, isSyncRequestPending: true });
    assert.equal(requests, 3, 'a pending sync must not retry on every render');
    assert.equal(shouldRecoverCloudSyncPolling(undefined, focused), false);
    assert.equal(shouldRecoverCloudSyncPolling(focused, { ...focused, userId: undefined }), false);
    assert.equal(shouldRecoverCloudSyncPolling({ ...focused, userId: 'bob', isScreenFocused: false }, focused), false);
  } finally {
    unsubscribe();
    client.clear();
  }
  console.log('Cloud sync recovery: mount deduplication, focus/request recovery and bounded failures passed');
};
void verify().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
