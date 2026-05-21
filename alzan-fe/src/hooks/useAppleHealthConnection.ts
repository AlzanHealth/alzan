import { useCallback } from 'react';
import { Alert, Platform } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabaseClient';
import { signOutAppleHealth, syncAppleHealthNow } from '../modules/apple-health';
import { useHealthDataConsent } from './useHealthDataConsent';
import { useIntegrationPermissionPrompt } from './useIntegrationPermissionPrompt';

const APPLE_HEALTH_PROVIDER = 'apple_health';
const QUERY_KEY = ['appleHealthConnection'];

export function useAppleHealthConnection() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const { ensureHealthDataConsent } = useHealthDataConsent();
  const { confirmPermissionRequest } = useIntegrationPermissionPrompt();

  const connectionQuery = useQuery({
    queryKey: [...QUERY_KEY, user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data, error } = await supabase
        .from('user_connections')
        .select('id, last_synced_at, status')
        .eq('user_id', user.id)
        .eq('provider', APPLE_HEALTH_PROVIDER)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!user,
    staleTime: 1000 * 60 * 2,
  });

  const syncMutation = useMutation({
    mutationFn: async () => {
      if (Platform.OS !== 'ios') throw new Error('Apple Health is only available on iOS');
      const hasConsent = await ensureHealthDataConsent();
      if (!hasConsent) return;
      const canRequestPermissions = await confirmPermissionRequest('Apple Health');
      if (!canRequestPermissions) return;
      await syncAppleHealthNow({ syncDaysBack: 90 });
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
      await signOutAppleHealth().catch(() => undefined);
      const { error } = await supabase
        .from('user_connections')
        .delete()
        .eq('user_id', user.id)
        .eq('provider', APPLE_HEALTH_PROVIDER);
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
    Alert.alert(t('settings.disconnect'), 'Apple Health', [
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
    isConnecting: syncMutation.isPending,
    isSyncing: syncMutation.isPending,
    isDisconnecting: disconnectMutation.isPending,
    lastSyncedAt: connectionQuery.data?.last_synced_at ?? null,
    connect,
    sync,
    disconnect,
  };
}
