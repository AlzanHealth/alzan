import { useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../context/AuthContext';

const STORAGE_KEY = '@training_settings';

export interface TrainingSettings {
  autoTimer: boolean;
  autoPlayEnabled: boolean;
  soundEnabled: boolean;
  hapticsEnabled: boolean;
  autoDeleteExpiredTemplates: boolean;
}

const DEFAULT_SETTINGS: TrainingSettings = {
  autoTimer: true,
  autoPlayEnabled: false,
  soundEnabled: true,
  hapticsEnabled: true,
  autoDeleteExpiredTemplates: true,
};

export const useTrainingSettings = () => {
  const { user } = useAuth();
  const [settings, setSettings] = useState<TrainingSettings>(DEFAULT_SETTINGS);
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingAutoDelete, setIsSavingAutoDelete] = useState(false);

  // Load settings on mount
  useEffect(() => {
    void loadSettings();
  }, [user?.id]);

  const loadSettings = async () => {
    try {
      const jsonValue = await AsyncStorage.getItem(STORAGE_KEY);
      if (jsonValue != null) {
        const localSettings = JSON.parse(jsonValue) as Partial<TrainingSettings>;
        setSettings({ ...DEFAULT_SETTINGS, ...localSettings });
      }

      if (user) {
        const { data, error } = await supabase
          .from('user_preferences')
          .select('training_settings')
          .eq('user_id', user.id)
          .maybeSingle();

        if (error) throw error;

        const remoteSettings = (data as unknown as { training_settings?: unknown } | null)?.training_settings;
        if (remoteSettings && typeof remoteSettings === 'object' && !Array.isArray(remoteSettings)) {
          const value = (remoteSettings as { auto_delete_expired_templates?: unknown }).auto_delete_expired_templates;
          if (typeof value === 'boolean') {
            setSettings(previous => ({ ...previous, autoDeleteExpiredTemplates: value }));
          }
        }
      }
    } catch (e) {
      console.error('Failed to load training settings', e);
    } finally {
      setIsLoading(false);
    }
  };

  const saveSettings = async (newSettings: TrainingSettings) => {
    try {
      const jsonValue = JSON.stringify(newSettings);
      await AsyncStorage.setItem(STORAGE_KEY, jsonValue);
      setSettings(newSettings);
    } catch (e) {
      console.error('Failed to save training settings', e);
    }
  };

  const toggleSetting = (key: keyof TrainingSettings) => {
    if (key === 'autoDeleteExpiredTemplates') return;
    const newSettings = { ...settings, [key]: !settings[key] };
    void saveSettings(newSettings);
  };

  const setAutoDeleteExpiredTemplates = async (value: boolean) => {
    if (!user) return;

    const previous = settings.autoDeleteExpiredTemplates;
    setSettings(current => ({ ...current, autoDeleteExpiredTemplates: value }));
    setIsSavingAutoDelete(true);

    try {
      const { error } = await supabase
        .from('user_preferences')
        .update({ training_settings: { auto_delete_expired_templates: value } } as never)
        .eq('user_id', user.id);
      if (error) throw error;
    } catch (error) {
      console.error('Failed to save automatic template deletion setting', error);
      setSettings(current => ({ ...current, autoDeleteExpiredTemplates: previous }));
    } finally {
      setIsSavingAutoDelete(false);
    }
  };

  return {
    settings,
    isLoading,
    toggleSetting,
    setAutoDeleteExpiredTemplates,
    isSavingAutoDelete,
  };
};
