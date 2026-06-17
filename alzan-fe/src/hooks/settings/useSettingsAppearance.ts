import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { Alert } from '../../components/common/Alert';
import { useTranslation } from 'react-i18next';
import { AppearanceSettingsJson, UserPreferenceInsert } from '../../types/requests.types';
import { useAuth } from '../../context/AuthContext';
import { changeLanguage, Locale } from '../../i18n';

export type ThemeMode = 'light' | 'dark' | 'system';

export interface AppearanceSettings {
  language: Locale;
  theme: ThemeMode;
  accessibility: {
    reduceMotion: boolean;
    largeText: boolean;
  };
}

const DEFAULT_SETTINGS: AppearanceSettings = {
  language: 'es',
  theme: 'system',
  accessibility: {
    reduceMotion: false,
    largeText: false,
  },
};

export const useSettingsAppearance = () => {
  const { user } = useAuth();
  const [settings, setSettings] = useState<AppearanceSettings>(DEFAULT_SETTINGS);
  const [storedAppearance, setStoredAppearance] = useState<Partial<AppearanceSettingsJson>>({});
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const { i18n, t } = useTranslation();

  const fetchSettings = useCallback(async () => {
    try {
      setLoading(true);
      if (!user) return;

      const { data, error } = await supabase
        .from('user_preferences')
        .select('language_code, appearance_settings')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error) {
        console.log('Error fetching appearance settings:', error);
      }

      if (data) {
        const stored = (data.appearance_settings as Partial<AppearanceSettingsJson>) || {};
        setStoredAppearance(stored);
        setSettings({
          language: data.language_code || 'es',
          theme: stored.theme || 'system',
          accessibility: { ...DEFAULT_SETTINGS.accessibility, ...stored.accessibility },
        });
      }
    } catch (err) {
      console.error('Error fetching appearance settings:', err);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  const updateSettings = async (updates: Partial<AppearanceSettings>) => {
    try {
      setUpdating(true);
      if (!user) throw new Error('No user');

      // Merge settings
      const newSettings = { ...settings, ...updates };
      if (updates.accessibility) {
        newSettings.accessibility = { ...settings.accessibility, ...updates.accessibility };
      }

      // Optimistic update
      setSettings(newSettings);

      // Apply language change immediately
      if (updates.language && updates.language !== i18n.language) {
        await changeLanguage(updates.language);
      }

      // Prepare DB update
      const dbUpdate: Omit<UserPreferenceInsert, 'user_id'> = {};

      if (updates.language) {
        dbUpdate.language_code = updates.language;
      }

      // Store theme and accessibility in appearance_settings jsonb
      const nextAppearance: AppearanceSettingsJson = {
        ...storedAppearance,
        theme: newSettings.theme,
        accessibility: newSettings.accessibility,
      };
      dbUpdate.appearance_settings = nextAppearance;
      setStoredAppearance(nextAppearance);

      const { error } = await supabase.from('user_preferences').upsert(
        {
          user_id: user.id,
          ...dbUpdate,
        },
        { onConflict: 'user_id' },
      );

      if (error) throw error;

      return true;
    } catch (err: unknown) {
      console.error('Error updating appearance settings:', err);
      Alert.alert(t('common.error'), t('settings.saveSettingsError'));
      await fetchSettings();
      return false;
    } finally {
      setUpdating(false);
    }
  };

  const setLanguage = (language: Locale) => updateSettings({ language });
  const setTheme = (theme: ThemeMode) => updateSettings({ theme });

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
    setLanguage,
    setTheme,
    refetch: fetchSettings,
  };
};
