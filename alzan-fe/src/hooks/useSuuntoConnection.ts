import { useCallback } from 'react';
import { Platform } from 'react-native';
import { Alert } from '../components/common/Alert';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as WebBrowser from 'expo-web-browser';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabaseClient';
import { Providers } from '../openapi/generated/alzan-be/sdk.gen';
import { wearablesLocalHealthApi } from '../modules/wearables';
import { invalidateTrainingCalendar } from '../lib/trainingQueryKeys';

const SUUNTO_PROVIDER = 'suunto';
const QUERY_KEY = ['suuntoConnection'];

// On web the OAuth popup may lose its window.opener across the cross-origin
// redirect chain (helmet sets COOP: same-origin on the backend callback), which
// prevents expo-web-browser from messaging us back / auto-closing the popup. To
// stay robust we poll the backend for the connection the callback creates.
const WEB_CONNECT_TIMEOUT_MS = 90_000;
const WEB_CONNECT_POLL_MS = 1500;

const delay = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

interface SuuntoConnection {
  id: string;
  created_at: string | null;
  last_synced_at: string | null;
  status: string | null;
  updated_at: string | null;
}

const getSuuntoRedirectUri = (): string => {
  if (Platform.OS !== 'web') return 'alzan://oauth/success';
  if (typeof window === 'undefined') return 'alzan://oauth/success';
  return `${window.location.origin}/oauth/suunto/success`;
};

const getOAuthErrorMessage = (url?: string): string | null => {
  if (!url) return null;
  try {
    const parsedUrl = new URL(url);
    return parsedUrl.searchParams.get('oauth_error');
  } catch {
    return null;
  }
};

const getSuuntoConnection = async (userId: string): Promise<SuuntoConnection | null> => {
  const { data, error } = await supabase
    .from('user_connections')
    .select('id, created_at, last_synced_at, status, updated_at')
    .eq('user_id', userId)
    .eq('provider', SUUNTO_PROVIDER)
    .maybeSingle();
  if (error) throw error;
  return data;
};

type AuthSessionResult = Awaited<ReturnType<typeof WebBrowser.openAuthSessionAsync>>;

/**
 * Web OAuth completion that doesn't depend on the popup being able to message
 * the opener back. We open the auth session and poll the backend until the
 * connection the callback creates shows up (or the popup reports an error /
 * cancellation), so a severed window.opener no longer leaves us hanging.
 */
const connectSuuntoOnWeb = async (userId: string, authorizationUrl: string, redirectUri: string): Promise<void> => {
  const baseline = await getSuuntoConnection(userId);
  const isFreshConnection = (connection: SuuntoConnection | null): boolean =>
    !!connection && (!baseline || connection.updated_at !== baseline.updated_at);

  // Held in an object so TS keeps the union types after the async callbacks.
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
    if (isFreshConnection(await getSuuntoConnection(userId))) return;

    if (auth.error) throw auth.error;
    if (auth.result) {
      const oauthError = getOAuthErrorMessage(auth.result.type === 'success' ? auth.result.url : undefined);
      if (oauthError) throw new Error(oauthError);
      // Popup finished (closed/dismissed): give the callback a final moment.
      if (isFreshConnection(await getSuuntoConnection(userId))) return;
      throw new Error('OAuth flow was cancelled or failed.');
    }

    await delay(WEB_CONNECT_POLL_MS);
  }

  throw new Error('OAuth connection timed out. Please try again.');
};

export function useSuuntoConnection() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  const connectionQuery = useQuery({
    queryKey: [...QUERY_KEY, user?.id],
    queryFn: async () => {
      if (!user) return null;
      return getSuuntoConnection(user.id);
    },
    enabled: !!user,
    staleTime: 1000 * 60 * 2,
  });

  const syncMutation = useMutation({
    mutationFn: async () => wearablesLocalHealthApi.syncSuuntoActivities(),
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
        t('settings.syncActivitiesSummary', {
          imported: result.activities_imported,
          skipped: result.activities_skipped ?? 0,
          repaired: result.activities_repaired ?? 0,
          failed: result.activities_failed ?? 0,
        }),
      );
    },
    onError: (error: Error) => {
      Alert.alert(t('common.error'), error.message);
    },
  });

  const connectMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('User not authenticated');
      const redirectUri = getSuuntoRedirectUri();
      const { data } = await Providers.getAuthorizationUrl({
        path: { provider: SUUNTO_PROVIDER },
        query: { user_id: user.id, redirect_uri: redirectUri },
      });
      if (!data?.authorization_url) throw new Error('Failed to get authorization URL from backend');

      if (Platform.OS === 'web') {
        await connectSuuntoOnWeb(user.id, data.authorization_url, redirectUri);
        return;
      }

      // Native: the deep-link redirect resolves the auth session directly.
      const result = await WebBrowser.openAuthSessionAsync(data.authorization_url, redirectUri, {
        showInRecents: true,
      });
      const oauthError = getOAuthErrorMessage(result.type === 'success' ? result.url : undefined);
      if (oauthError) throw new Error(oauthError);
      if (result.type !== 'success') {
        throw new Error('OAuth flow was cancelled or failed.');
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [...QUERY_KEY, user?.id] });
      syncMutation.mutate();
    },
    onError: (error: Error) => {
      Alert.alert(t('common.error'), error.message);
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('User not authenticated');
      const { error } = await supabase
        .from('user_connections')
        .delete()
        .eq('user_id', user.id)
        .eq('provider', SUUNTO_PROVIDER);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [...QUERY_KEY, user?.id] });
    },
    onError: (error: Error) => {
      Alert.alert(t('common.error'), error.message);
    },
  });

  const connect = useCallback(() => {
    connectMutation.mutate();
  }, [connectMutation]);

  const sync = useCallback(() => {
    syncMutation.mutate();
  }, [syncMutation]);

  const disconnect = useCallback(() => {
    Alert.alert(t('settings.disconnect'), 'Suunto', [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('settings.disconnect'),
        style: 'destructive',
        onPress: () => disconnectMutation.mutate(),
      },
    ]);
  }, [disconnectMutation, t]);

  return {
    isConnected: !!connectionQuery.data,
    isLoading: connectionQuery.isLoading,
    isConnecting: connectMutation.isPending,
    isSyncing: syncMutation.isPending,
    isDisconnecting: disconnectMutation.isPending,
    lastSyncedAt: connectionQuery.data?.last_synced_at ?? null,
    connect,
    sync,
    disconnect,
  };
}
