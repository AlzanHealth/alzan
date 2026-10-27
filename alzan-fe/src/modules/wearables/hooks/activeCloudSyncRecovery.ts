export interface CloudSyncRecoveryState {
  userId: string | undefined;
  isScreenFocused: boolean;
  isSyncRequestPending: boolean;
}

/** Mounts and account changes already receive React Query's normal initial fetch. */
export const shouldRecoverCloudSyncPolling = (
  previous: CloudSyncRecoveryState | undefined,
  current: CloudSyncRecoveryState,
): boolean =>
  !!current.userId &&
  previous?.userId === current.userId &&
  ((!previous.isScreenFocused && current.isScreenFocused) ||
    (!previous.isSyncRequestPending && current.isSyncRequestPending));
