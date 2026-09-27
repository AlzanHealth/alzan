import { deleteUserAccount } from '../../utils/gdpr/deleteUser';
import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabaseClient';
import { Alert } from '../../components/common/Alert';
import { useQueryClient } from '@tanstack/react-query';
import { clearTemporaryQueryCache } from '../../utils/gdpr/clearTemporaryQueryCache';
import { Visibility } from '../../types/requests.types';
import { useTranslation } from 'react-i18next';

export interface PrivacySettings {
  profile_public: boolean;
  default_workout_visibility: Visibility;
}

const DEFAULT_SETTINGS: PrivacySettings = {
  profile_public: false,
  default_workout_visibility: 'private',
};

export const useSettingsPrivacy = () => {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const { user, signOut } = useAuth();
  const [settings, setSettings] = useState<PrivacySettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);

  const fetchSettings = useCallback(async () => {
    try {
      setLoading(true);
      if (!user) return;

      const { data, error } = await supabase
        .from('user_preferences')
        .select('privacy_settings')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error) {
        console.log('Error fetching privacy settings:', error);
      }

      if (data?.privacy_settings) {
        const stored = data.privacy_settings as Partial<PrivacySettings>;
        setSettings({ ...DEFAULT_SETTINGS, ...stored });
      }
    } catch (err) {
      console.error('Error fetching privacy settings:', err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  const updateSettings = async (updates: Partial<PrivacySettings>) => {
    try {
      setUpdating(true);
      if (!user) throw new Error('No user');

      const newSettings = { ...settings, ...updates };

      // Optimistic update
      setSettings(newSettings);

      const { error } = await supabase.from('user_preferences').upsert(
        {
          user_id: user.id,
          privacy_settings: newSettings,
        },
        { onConflict: 'user_id' },
      );

      if (error) throw error;

      return true;
    } catch (err: unknown) {
      console.error('Error updating privacy settings:', err);
      Alert.alert(t('common.error'), t('settings.saveSettingsError'));
      await fetchSettings();
      return false;
    } finally {
      setUpdating(false);
    }
  };

  const clearLocalCache = async () => {
    try {
      clearTemporaryQueryCache(queryClient);
      Alert.alert(t('settings.thanksTitle'), t('settings.cacheClearedSuccess'));
      return true;
    } catch (err: unknown) {
      console.error('Error clearing cache:', err);
      Alert.alert(t('common.error'), t('settings.cacheClearError'));
      return false;
    }
  };

  const deleteAllData = async () => {
    try {
      setUpdating(true);
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error('No user');

      // Call RPC to reset data (keeps profile + last weight)
      const { error } = await supabase.rpc('reset_user_data');

      if (error) {
        console.error('Error resetting data:', error);
        throw error;
      }

      Alert.alert(t('settings.thanksTitle'), t('settings.allDataDeletedSuccess'));
      return true;
    } catch (err: unknown) {
      console.error('Error deleting all data:', err);
      Alert.alert(t('common.error'), t('settings.deleteAllDataError'));
      return false;
    } finally {
      setUpdating(false);
    }
  };

  const deleteAccount = async () => {
    try {
      setUpdating(true);

      // Usar la utilidad que invoca la Edge Function
      // (Ya no intentamos borrar manualmente desde el cliente)
      const deleted = await deleteUserAccount();
      if (!deleted) return false;

      await signOut();
      return true;
    } catch (err: unknown) {
      console.error('Error deleting account:', err);
      Alert.alert(t('common.error'), t('settings.deleteAccountError'));
      return false;
    } finally {
      setUpdating(false);
    }
  };

  useEffect(() => {
    if (user) {
      fetchSettings();
    }
  }, [fetchSettings, user]);

  return {
    settings,
    loading,
    updating,
    updateSettings,
    clearLocalCache,
    deleteAllData,
    deleteAccount,
    refetch: fetchSettings,
  };
};
