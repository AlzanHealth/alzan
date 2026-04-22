import { useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = '@training_settings';

export interface TrainingSettings {
  autoTimer: boolean;
  autoPlayEnabled: boolean;
  soundEnabled: boolean;
  hapticsEnabled: boolean;
}

const DEFAULT_SETTINGS: TrainingSettings = {
  autoTimer: true,
  autoPlayEnabled: false,
  soundEnabled: true,
  hapticsEnabled: true,
};

export const useTrainingSettings = () => {
  const [settings, setSettings] = useState<TrainingSettings>(DEFAULT_SETTINGS);
  const [isLoading, setIsLoading] = useState(true);

  // Load settings on mount
  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const jsonValue = await AsyncStorage.getItem(STORAGE_KEY);
      if (jsonValue != null) {
        setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(jsonValue) });
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
    const newSettings = { ...settings, [key]: !settings[key] };
    saveSettings(newSettings);
  };

  return {
    settings,
    isLoading,
    toggleSetting,
  };
};
