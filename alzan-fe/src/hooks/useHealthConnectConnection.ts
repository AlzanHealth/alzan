import { useCallback } from 'react';
import { Alert, Platform } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabaseClient';
import { signOutHealthConnect, syncHealthConnectNow } from '../modules/health-connect';
import { wearablesLocalHealthApi } from '../modules/wearables';
import { useHealthDataConsent } from './useHealthDataConsent';

const HEALTH_CONNECT_PROVIDER = 'health_connect';
const QUERY_KEY = ['healthConnectConnection'];

export function useHealthConnectConnection() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const { ensureHealthDataConsent } = useHealthDataConsent();
  const isAndroid = Platform.OS === 'android';

  const connectionQuery = useQuery({
    queryKey: [...QUERY_KEY, user?.id],
    queryFn: async () => {
      if (!user) return null;
      const [{ data: connection, error }, selection] = await Promise.all([
        supabase
          .from('user_connections')
          .select('id, last_synced_at, status')
          .eq('user_id', user.id)
          .eq('provider', HEALTH_CONNECT_PROVIDER)
          .maybeSingle(),
        wearablesLocalHealthApi.getHealthConnectSelection(),
      ]);
      if (error) throw error;
      return { connection, selection };
    },
    enabled: !!user && isAndroid,
    retry: false,
    staleTime: 1000 * 60 * 2,
  });

  const syncMutation = useMutation({
    mutationFn: async () => {
      if (Platform.OS !== 'android') throw new Error('Health Connect is only available on Android');
      const hasConsent = await ensureHealthDataConsent();
      if (!hasConsent) return;
      await syncHealthConnectNow({
        selectedPackageName: connectionQuery.data?.selection?.source_package,
        syncDaysBack: 90,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [...QUERY_KEY, user?.id] });
    },
    onError: (error: Error) => {
      Alert.alert(t('common.error'), error.message);
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('User not authenticated');
      await signOutHealthConnect().catch(() => undefined);
      const { error } = await supabase
        .from('user_connections')
        .delete()
        .eq('user_id', user.id)
        .eq('provider', HEALTH_CONNECT_PROVIDER);
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
    syncMutation.mutate();
  }, [syncMutation]);

  const sync = useCallback(() => {
    syncMutation.mutate();
  }, [syncMutation]);

  const disconnect = useCallback(() => {
    Alert.alert(t('settings.disconnect'), 'Health Connect', [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('settings.disconnect'),
        style: 'destructive',
        onPress: () => disconnectMutation.mutate(),
      },
    ]);
  }, [disconnectMutation, t]);

  return {
    isConnected: isAndroid && !!connectionQuery.data?.connection,
    isLoading: isAndroid && connectionQuery.isLoading,
    isConnecting: syncMutation.isPending,
    isSyncing: syncMutation.isPending,
    isDisconnecting: disconnectMutation.isPending,
    selectedOriginName: connectionQuery.data?.selection?.display_name ?? null,
    selectedPackageName: connectionQuery.data?.selection?.source_package ?? null,
    lastSyncedAt: connectionQuery.data?.connection?.last_synced_at ?? null,
    connect,
    sync,
    disconnect,
  };
}
