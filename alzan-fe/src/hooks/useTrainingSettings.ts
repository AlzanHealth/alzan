import { useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../context/AuthContext';
import {
  DEFAULT_ENDURANCE_METRIC_PRIORITY,
  normalizeEnduranceMetricPriority,
  type EnduranceMetricPriority,
} from '../modules/training/helpers/enduranceMetricPriority.helper';

const STORAGE_KEY = '@training_settings';

const getStorageKey = (userId: string | undefined) => `${STORAGE_KEY}:${userId ?? 'anonymous'}`;

export interface TrainingSettings {
  autoTimer: boolean;
  autoPlayEnabled: boolean;
  soundEnabled: boolean;
  hapticsEnabled: boolean;
  autoDeleteExpiredTemplates: boolean;
  metricPriority: EnduranceMetricPriority;
}

const DEFAULT_SETTINGS: TrainingSettings = {
  autoTimer: true,
  autoPlayEnabled: false,
  soundEnabled: true,
  hapticsEnabled: true,
  autoDeleteExpiredTemplates: true,
  metricPriority: DEFAULT_ENDURANCE_METRIC_PRIORITY,
};

export const useTrainingSettings = () => {
  const { user } = useAuth();
  const [settings, setSettings] = useState<TrainingSettings>(DEFAULT_SETTINGS);
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingAutoDelete, setIsSavingAutoDelete] = useState(false);
  const [isSavingMetricPriority, setIsSavingMetricPriority] = useState(false);

  // Load settings on mount
  useEffect(() => {
    void loadSettings();
  }, [user?.id]);

  const loadSettings = async () => {
    try {
      const jsonValue = await AsyncStorage.getItem(getStorageKey(user?.id));
      if (jsonValue != null) {
        const localSettings = JSON.parse(jsonValue) as Partial<TrainingSettings>;
        setSettings({
          ...DEFAULT_SETTINGS,
          ...localSettings,
          metricPriority: normalizeEnduranceMetricPriority(localSettings.metricPriority),
        });
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
          const typedSettings = remoteSettings as {
            auto_delete_expired_templates?: unknown;
            metric_priority?: unknown;
          };
          setSettings(previous => ({
            ...previous,
            ...(typeof typedSettings.auto_delete_expired_templates === 'boolean'
              ? { autoDeleteExpiredTemplates: typedSettings.auto_delete_expired_templates }
              : {}),
            metricPriority: normalizeEnduranceMetricPriority(typedSettings.metric_priority ?? previous.metricPriority),
          }));
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
      await AsyncStorage.setItem(getStorageKey(user?.id), jsonValue);
      setSettings(newSettings);
    } catch (e) {
      console.error('Failed to save training settings', e);
    }
  };

  const toggleSetting = (
    key: keyof Pick<TrainingSettings, 'autoTimer' | 'autoPlayEnabled' | 'soundEnabled' | 'hapticsEnabled'>,
  ) => {
    const newSettings = { ...settings, [key]: !settings[key] };
    void saveSettings(newSettings);
  };

  const setAutoDeleteExpiredTemplates = async (value: boolean) => {
    if (!user) return;

    const previous = settings.autoDeleteExpiredTemplates;
    setSettings(current => ({ ...current, autoDeleteExpiredTemplates: value }));
    setIsSavingAutoDelete(true);

    try {
      const { error } = await supabase.from('user_preferences').upsert(
        {
          user_id: user.id,
          training_settings: {
            auto_delete_expired_templates: value,
            metric_priority: settings.metricPriority,
          },
        } as never,
        { onConflict: 'user_id' },
      );
      if (error) throw error;
      await AsyncStorage.setItem(
        getStorageKey(user.id),
        JSON.stringify({ ...settings, autoDeleteExpiredTemplates: value }),
      );
    } catch (error) {
      console.error('Failed to save automatic template deletion setting', error);
      setSettings(current => ({ ...current, autoDeleteExpiredTemplates: previous }));
    } finally {
      setIsSavingAutoDelete(false);
    }
  };

  const setMetricPriority = async (priority: EnduranceMetricPriority) => {
    const normalizedPriority = normalizeEnduranceMetricPriority(priority);
    const previous = settings.metricPriority;
    const nextSettings = { ...settings, metricPriority: normalizedPriority };
    setSettings(nextSettings);
    setIsSavingMetricPriority(true);

    try {
      await AsyncStorage.setItem(getStorageKey(user?.id), JSON.stringify(nextSettings));
      if (user) {
        const { error } = await supabase.from('user_preferences').upsert(
          {
            user_id: user.id,
            training_settings: {
              auto_delete_expired_templates: nextSettings.autoDeleteExpiredTemplates,
              metric_priority: normalizedPriority,
            },
          } as never,
          { onConflict: 'user_id' },
        );
        if (error) throw error;
      }
    } catch (error) {
      console.error('Failed to save metric priority', error);
      await AsyncStorage.setItem(getStorageKey(user?.id), JSON.stringify({ ...settings, metricPriority: previous }));
      setSettings(current => ({ ...current, metricPriority: previous }));
    } finally {
      setIsSavingMetricPriority(false);
    }
  };

  return {
    settings,
    isLoading,
    toggleSetting,
    setAutoDeleteExpiredTemplates,
    isSavingAutoDelete,
    setMetricPriority,
    isSavingMetricPriority,
  };
};
