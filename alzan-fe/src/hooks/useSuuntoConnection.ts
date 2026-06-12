import { useCallback } from 'react';
import { Alert } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as WebBrowser from 'expo-web-browser';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabaseClient';
import { Providers } from '../openapi/generated/alzan-be/sdk.gen';
import { wearablesLocalHealthApi } from '../modules/wearables';

const SUUNTO_PROVIDER = 'suunto';
const QUERY_KEY = ['suuntoConnection'];

export function useSuuntoConnection() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  const connectionQuery = useQuery({
    queryKey: [...QUERY_KEY, user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data, error } = await supabase
        .from('user_connections')
        .select('id, created_at, last_synced_at, status')
        .eq('user_id', user.id)
        .eq('provider', SUUNTO_PROVIDER)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!user,
    staleTime: 1000 * 60 * 2,
  });

  const syncMutation = useMutation({
    mutationFn: async () => wearablesLocalHealthApi.syncSuuntoActivities(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [...QUERY_KEY, user?.id] });
    },
    onError: (error: Error) => {
      Alert.alert(t('common.error'), error.message);
    },
  });

  const connectMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('User not authenticated');
      const redirectUri = 'alzan://oauth/success';
      const { data } = await Providers.getAuthorizationUrl({
        path: { provider: SUUNTO_PROVIDER },
        query: { user_id: user.id, redirect_uri: redirectUri },
      });
      if (!data?.authorization_url) throw new Error('Failed to get authorization URL from backend');
      const result = await WebBrowser.openAuthSessionAsync(data.authorization_url, redirectUri, {
        showInRecents: true,
      });
      if (result.type !== 'success') throw new Error('OAuth flow was cancelled or failed.');
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
