import { useCallback } from 'react';
import { corosAvailability } from '../modules/wearables/corosAvailability';
import { Platform } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as WebBrowser from 'expo-web-browser';
import type { DocumentPickerAsset } from 'expo-document-picker';
import { useTranslation } from 'react-i18next';
import { Alert } from '../components/common/Alert';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabaseClient';
import { invalidateTrainingCalendar } from '../lib/trainingQueryKeys';
import { wearablesLocalHealthApi } from '../modules/wearables';
import type { CorosHistoryImportResult } from '../modules/wearables/localHealthSync.types';
import { Providers } from '../openapi/generated/alzan-be/sdk.gen';
import { appendDocumentAsset, postActivityImportForm } from '../services/activityImportApi';

const COROS_PROVIDER = 'coros';
const QUERY_KEY = ['corosConnection'];
const CAPABILITY_QUERY_KEY = ['corosCapability'];
const WEB_CONNECT_TIMEOUT_MS = 90_000;
const WEB_CONNECT_POLL_MS = 1500;

type CorosConnection = {
  id: string;
  created_at: string | null;
  last_synced_at: string | null;
  status: string | null;
  updated_at: string | null;
};

type AuthSessionResult = Awaited<ReturnType<typeof WebBrowser.openAuthSessionAsync>>;

const delay = (milliseconds: number) => new Promise<void>(resolve => setTimeout(resolve, milliseconds));

const getRedirectUri = (): string => {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return 'alzan://oauth/success';
  return `${window.location.origin}/oauth/coros/success`;
};

const getOAuthErrorMessage = (url?: string): string | null => {
  if (!url) return null;
  try {
    return new URL(url).searchParams.get('oauth_error');
  } catch {
    return null;
  }
};

const getConnection = async (userId: string): Promise<CorosConnection | null> => {
  const { data, error } = await supabase
    .from('user_connections')
    .select('id, created_at, last_synced_at, status, updated_at')
    .eq('user_id', userId)
    .eq('provider', COROS_PROVIDER)
    .maybeSingle();
  if (error) throw error;
  return data;
};

const connectOnWeb = async (userId: string, authorizationUrl: string, redirectUri: string): Promise<void> => {
  const baseline = await getConnection(userId);
  const isFreshConnection = (connection: CorosConnection | null): boolean =>
    !!connection && (!baseline || connection.updated_at !== baseline.updated_at);
  const auth: { result: AuthSessionResult | null; error: Error | null } = { result: null, error: null };
  void WebBrowser.openAuthSessionAsync(authorizationUrl, redirectUri, { showInRecents: true })
    .then(result => {
      auth.result = result;
    })
    .catch((error: unknown) => {
      auth.error = error instanceof Error ? error : new Error(String(error));
    });

  const deadline = Date.now() + WEB_CONNECT_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (isFreshConnection(await getConnection(userId))) return;
    if (auth.error) throw auth.error;
    if (auth.result) {
      const oauthError = getOAuthErrorMessage(auth.result.type === 'success' ? auth.result.url : undefined);
      if (oauthError) throw new Error(oauthError);
      if (isFreshConnection(await getConnection(userId))) return;
      throw new Error('OAuth flow was cancelled or failed.');
    }
    await delay(WEB_CONNECT_POLL_MS);
  }
  throw new Error('OAuth connection timed out. Please try again.');
};

export function useCorosConnection() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  const capabilityQuery = useQuery({
    queryKey: [...CAPABILITY_QUERY_KEY, user?.id],
    queryFn: () => wearablesLocalHealthApi.getCorosCapability(),
    enabled: !!user,
    staleTime: 5 * 60_000,
  });

  const connectionQuery = useQuery({
    queryKey: [...QUERY_KEY, user?.id],
    queryFn: () => (user ? getConnection(user.id) : null),
    // Read existing connections even when rollout blocks new connections so
    // users can still see and revoke an already-authorized COROS account.
    enabled: !!user,
    staleTime: 2 * 60_000,
  });

  const syncMutation = useMutation({
    mutationFn: () => wearablesLocalHealthApi.syncCoros(),
    onSuccess: result => {
      queryClient.invalidateQueries({ queryKey: [...QUERY_KEY, user?.id] });
      if (result.status === 'running') {
        Alert.alert(t('settings.syncAlreadyRunningTitle'), t('settings.syncAlreadyRunningMessage'));
        return;
      }
      invalidateTrainingCalendar(queryClient);
      queryClient.invalidateQueries({ queryKey: ['enduranceSessions'] });
      queryClient.invalidateQueries({ queryKey: ['importReviewQueue'] });
      Alert.alert(
        result.status === 'partial' ? t('settings.syncPartialTitle') : t('settings.syncCompleteTitle'),
        [
          t('settings.corosSyncSummary', {
            imported: result.activities_imported,
            skipped: result.activities_skipped ?? 0,
            failed: result.activities_failed ?? 0,
            healthDays: result.health_days_imported ?? 0,
          }),
          result.backfill_complete === false
            ? t('settings.corosBackfillInProgress', { date: result.backfill_next_date ?? '—' })
            : result.backfill_complete === true
              ? t('settings.corosBackfillComplete')
              : null,
          typeof result.fit_pending === 'number' && result.fit_pending > 0
            ? t('settings.corosFitPending', { count: result.fit_pending })
            : null,
        ]
          .filter((message): message is string => !!message)
          .join('\n'),
      );
    },
    onError: (error: Error) => Alert.alert(t('common.error'), error.message),
  });

  const importHistoryMutation = useMutation({
    mutationFn: async (assets: DocumentPickerAsset[]): Promise<CorosHistoryImportResult> => {
      if (assets.length === 0) throw new Error('COROS_HISTORY_FILES_REQUIRED');
      const { data, error } = await supabase.auth.getSession();
      if (error) throw error;
      const token = data.session?.access_token;
      if (!token) throw new Error('User not authenticated');
      const formData = new FormData();
      for (const asset of assets) await appendDocumentAsset(formData, 'files', asset);
      return postActivityImportForm<CorosHistoryImportResult>('/activity-imports/coros/history', token, formData);
    },
    onSuccess: result => {
      invalidateTrainingCalendar(queryClient);
      queryClient.invalidateQueries({ queryKey: ['enduranceSessions'] });
      queryClient.invalidateQueries({ queryKey: ['importReviewQueue'] });
      const failedFiles = result.errorsByFile.map(file => `${file.fileName}: ${file.code}`).join('\n');
      Alert.alert(
        t('settings.corosHistoryImportTitle'),
        [
          t('settings.corosHistoryImportSummary', {
            imported: result.filesImported,
            skipped: result.filesSkipped,
            failed: result.filesFailed,
          }),
          failedFiles ? t('settings.corosHistoryImportErrors', { errors: failedFiles }) : null,
        ]
          .filter((message): message is string => !!message)
          .join('\n'),
      );
    },
    onError: (error: Error) => Alert.alert(t('common.error'), error.message),
  });

  const connectMutation = useMutation({
    mutationFn: async (): Promise<boolean> => {
      if (!user) throw new Error('User not authenticated');
      const redirectUri = getRedirectUri();
      const { data } = await Providers.getAuthorizationUrl({
        path: { provider: COROS_PROVIDER },
        query: { user_id: user.id, redirect_uri: redirectUri },
      });
      if (!data?.authorization_url) throw new Error('Failed to get authorization URL from backend');
      if (Platform.OS === 'web') {
        await connectOnWeb(user.id, data.authorization_url, redirectUri);
        return true;
      }
      const result = await WebBrowser.openAuthSessionAsync(data.authorization_url, redirectUri, {
        showInRecents: true,
      });
      const oauthError = getOAuthErrorMessage(result.type === 'success' ? result.url : undefined);
      if (oauthError) throw new Error(oauthError);
      if (result.type !== 'success') throw new Error('OAuth flow was cancelled or failed.');
      return true;
    },
    onSuccess: connected => {
      if (!connected) return;
      queryClient.invalidateQueries({ queryKey: [...QUERY_KEY, user?.id] });
      syncMutation.mutate();
    },
    onError: (error: Error) => Alert.alert(t('common.error'), error.message),
  });

  const disconnectMutation = useMutation({
    mutationFn: () => wearablesLocalHealthApi.disconnectCoros(),
    onSuccess: result => {
      queryClient.invalidateQueries({ queryKey: [...QUERY_KEY, user?.id] });
      invalidateTrainingCalendar(queryClient);
      if (result.remote_deauthorization_pending) {
        Alert.alert(t('settings.corosDisconnectPendingTitle'), t('settings.corosDisconnectPendingMessage'));
      }
    },
    onError: (error: Error) => Alert.alert(t('common.error'), error.message),
  });

  const connect = useCallback(() => connectMutation.mutate(), [connectMutation]);
  const sync = useCallback(() => syncMutation.mutate(), [syncMutation]);
  const importHistory = useCallback(
    (assets: DocumentPickerAsset[]) => importHistoryMutation.mutate(assets),
    [importHistoryMutation],
  );
  const disconnect = useCallback(() => {
    Alert.alert(t('settings.disconnect'), 'COROS', [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('settings.disconnect'),
        style: 'destructive',
        onPress: () => disconnectMutation.mutate(),
      },
    ]);
  }, [disconnectMutation, t]);

  const availability = corosAvailability({
    loading: capabilityQuery.isLoading,
    error: capabilityQuery.isError,
    capability: capabilityQuery.data,
  });
  return {
    isAvailable: availability === 'ready',
    capabilityError: availability === 'error',
    capabilityReason: availability,
    retryCapability: () => {
      void capabilityQuery.refetch();
    },
    isConnected: !!connectionQuery.data,
    isLoading: capabilityQuery.isLoading || connectionQuery.isLoading,
    isConnecting: connectMutation.isPending,
    isSyncing: syncMutation.isPending,
    isImportingHistory: importHistoryMutation.isPending,
    isDisconnecting: disconnectMutation.isPending,
    lastSyncedAt: connectionQuery.data?.last_synced_at ?? null,
    connect,
    sync,
    importHistory,
    disconnect,
  };
}
