import { useCallback } from 'react';
import { Alert } from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as WebBrowser from 'expo-web-browser';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../context/AuthContext';
import { Providers } from '../openapi/generated/alzan-be/sdk.gen';

const STRAVA_PROVIDER = 'strava';
const QUERY_KEY = ['stravaConnection'];

export function useStravaConnection() {
  const { user, session } = useAuth();
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  // ── 1. Connection status ─────────────────────────────────────────────────
  const connectionQuery = useQuery({
    queryKey: [...QUERY_KEY, user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data, error } = await supabase
        .from('user_connections')
        .select('id, created_at')
        .eq('user_id', user.id)
        .eq('provider', STRAVA_PROVIDER)
        .maybeSingle();

      if (error) throw error;
      return data;
    },
    enabled: !!user,
    staleTime: 1000 * 60 * 2, // 2 minutes
  });

  // ── 2. Connect ───────────────────────────────────────────────────────────
  const connectMutation = useMutation({
    mutationFn: async () => {
      if (!user || !session?.access_token) throw new Error('User not authenticated');

      const redirectUri = 'alzan://oauth/success';
      const { data } = await Providers.getAuthorizationUrl({
        path: { provider: STRAVA_PROVIDER },
        query: { user_id: user.id, redirect_uri: redirectUri },
      });

      if (!data?.authorization_url) {
        throw new Error('Failed to get authorization URL from backend');
      }

      const result = await WebBrowser.openAuthSessionAsync(data.authorization_url, redirectUri, {
        showInRecents: true,
      });

      // On iOS/Android the result type is 'success' when the redirect URI matches.
      // On web or if the user dismisses, it returns 'dismiss' or 'cancel'.
      if (result.type !== 'success' && result.type !== 'dismiss') {
        throw new Error('OAuth flow was cancelled or failed.');
      }
      // Even on 'dismiss', the backend may have succeeded — always refetch.
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [...QUERY_KEY, user?.id] });
    },
    onError: (error: Error) => {
      Alert.alert(t('common.error'), t('settings.stravaConnectError') + '\n' + error.message);
    },
  });

  // ── 3. Disconnect ────────────────────────────────────────────────────────
  const disconnectMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('User not authenticated');
      const { error } = await supabase
        .from('user_connections')
        .delete()
        .eq('user_id', user.id)
        .eq('provider', STRAVA_PROVIDER);

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

  const disconnect = useCallback(() => {
    Alert.alert(t('settings.stravaDisconnectTitle'), t('settings.stravaDisconnectMessage'), [
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
    isDisconnecting: disconnectMutation.isPending,
    connectedSince: connectionQuery.data?.created_at ?? null,
    connect,
    disconnect,
  };
}
