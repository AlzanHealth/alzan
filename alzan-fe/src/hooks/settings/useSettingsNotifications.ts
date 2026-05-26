import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { Alert } from '../../components/common/Alert';
import { NotificationService } from '../../services/NotificationService';
import { useAuth } from '../../context/AuthContext';
import { useTranslation } from 'react-i18next';
import { NotificationSettingsJson } from '../../types/requests.types';

export interface MealReminder {
  enabled: boolean;
  time: string; // HH:mm format
}

export interface NotificationSettings extends NotificationSettingsJson {
  // Comidas
  meals: {
    breakfast: MealReminder;
    almuerzo: MealReminder; // Mid-morning
    lunch: MealReminder;
    merienda: MealReminder; // Afternoon
    dinner: MealReminder;
  };

  // Entrenamiento
  training: {
    scheduled_reminder: boolean;
    scheduled_reminder_time: string; // HH:mm format
    inactivity_days: number | null;
    post_workout_summary: boolean;
  };

  // Salud
  health: {
    weight_reminder: 'weekly' | 'custom' | null;
    weight_time: string; // HH:mm format
    weight_days: number[]; // 0=Sun, 1=Mon, etc.
    hydration: boolean;
    hydration_time: string; // HH:mm format
    sleep: boolean;
    sleep_time: string; // HH:mm format
  };

  // App
  app: {
    general: boolean;
    news: boolean;
    smart_reminders: boolean;
  };
}

const DEFAULT_SETTINGS: NotificationSettings = {
  meals: {
    breakfast: { enabled: false, time: '08:00' },
    almuerzo: { enabled: false, time: '11:00' },
    lunch: { enabled: false, time: '14:00' },
    merienda: { enabled: false, time: '17:30' },
    dinner: { enabled: false, time: '21:00' },
  },
  training: {
    scheduled_reminder: true,
    scheduled_reminder_time: '18:00',
    inactivity_days: null,
    post_workout_summary: true,
  },
  health: {
    weight_reminder: null,
    weight_time: '09:00',
    weight_days: [],
    hydration: false,
    hydration_time: '10:00',
    sleep: false,
    sleep_time: '09:00',
  },
  app: {
    general: true,
    news: false,
    smart_reminders: false,
  },
};

const getStoredMealReminder = (defaultReminder: MealReminder, storedReminder?: Partial<MealReminder>): MealReminder => {
  const time = storedReminder?.time;
  return {
    ...defaultReminder,
    ...storedReminder,
    time: typeof time === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(time) ? time : defaultReminder.time,
  };
};

export const useSettingsNotifications = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [settings, setSettings] = useState<NotificationSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);

  const fetchSettings = useCallback(async () => {
    try {
      setLoading(true);
      if (!user) return;

      const { data, error } = await supabase
        .from('user_preferences')
        .select('notification_settings')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error) {
        console.log('Error fetching notification settings:', error);
      }

      if (data?.notification_settings) {
        // Deep merge with defaults
        const stored = data.notification_settings;
        setSettings({
          meals: {
            breakfast: getStoredMealReminder(DEFAULT_SETTINGS.meals.breakfast, stored.meals?.breakfast),
            almuerzo: getStoredMealReminder(DEFAULT_SETTINGS.meals.almuerzo, stored.meals?.almuerzo),
            lunch: getStoredMealReminder(DEFAULT_SETTINGS.meals.lunch, stored.meals?.lunch),
            merienda: getStoredMealReminder(DEFAULT_SETTINGS.meals.merienda, stored.meals?.merienda),
            dinner: getStoredMealReminder(DEFAULT_SETTINGS.meals.dinner, stored.meals?.dinner),
          },
          training: { ...DEFAULT_SETTINGS.training, ...stored.training },
          health: { ...DEFAULT_SETTINGS.health, ...stored.health },
          app: { ...DEFAULT_SETTINGS.app, ...stored.app },
        });
      }
    } catch (err) {
      console.error('Error fetching notification settings:', err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  const rescheduleAllNotifications = async (currentSettings: NotificationSettings) => {
    try {
      console.log('[Notifications] Rescheduling all notifications...');
      await NotificationService.cancelAllNotifications();

      // If master switch is off, stop here (all reminders cancelled)
      if (!currentSettings.app.general) {
        console.log('[Notifications] General notifications disabled. All reminders cancelled.');
        return;
      }

      // Training
      if (currentSettings.training.scheduled_reminder) {
        console.log(
          '[Notifications] Scheduling training reminder at',
          currentSettings.training.scheduled_reminder_time,
        );
        await NotificationService.scheduleTrainingReminder(currentSettings.training.scheduled_reminder_time);
      }

      // Inactivity reminder
      if (currentSettings.training.inactivity_days !== null && currentSettings.training.inactivity_days > 0) {
        console.log(
          '[Notifications] Scheduling inactivity reminder for',
          currentSettings.training.inactivity_days,
          'days',
        );
        await NotificationService.scheduleInactivityReminder(currentSettings.training.inactivity_days);
      }

      // Meals
      console.log('[Notifications] Scheduling meal reminders:', {
        breakfast: currentSettings.meals.breakfast.enabled,
        almuerzo: currentSettings.meals.almuerzo.enabled,
        lunch: currentSettings.meals.lunch.enabled,
        merienda: currentSettings.meals.merienda.enabled,
        dinner: currentSettings.meals.dinner.enabled,
      });
      await NotificationService.scheduleMealReminder('breakfast', currentSettings.meals.breakfast);
      await NotificationService.scheduleMealReminder('almuerzo', currentSettings.meals.almuerzo);
      await NotificationService.scheduleMealReminder('lunch', currentSettings.meals.lunch);
      await NotificationService.scheduleMealReminder('merienda', currentSettings.meals.merienda);
      await NotificationService.scheduleMealReminder('dinner', currentSettings.meals.dinner);

      // Health
      console.log('[Notifications] Scheduling health reminders:', {
        weight: currentSettings.health.weight_reminder !== null,
        weight_days: currentSettings.health.weight_days,
        sleep: currentSettings.health.sleep,
        hydration: currentSettings.health.hydration,
      });
      await NotificationService.scheduleHealthReminder(
        'weight',
        currentSettings.health.weight_time,
        currentSettings.health.weight_reminder !== null,
        currentSettings.health.weight_days, // Pass selected days
      );
      await NotificationService.scheduleHealthReminder(
        'sleep',
        currentSettings.health.sleep_time,
        currentSettings.health.sleep,
      );
      await NotificationService.scheduleHealthReminder(
        'hydration',
        currentSettings.health.hydration_time,
        currentSettings.health.hydration,
      );

      console.log('[Notifications] All notifications rescheduled successfully');
    } catch (error) {
      console.error('Error rescheduling notifications:', error);
    }
  };

  const updateSettings = async (updates: Partial<NotificationSettings>) => {
    try {
      setUpdating(true);
      if (!user) throw new Error('No user');

      // Merge with current settings
      const newSettings = {
        meals: { ...settings.meals, ...updates.meals },
        training: { ...settings.training, ...updates.training },
        health: { ...settings.health, ...updates.health },
        app: { ...settings.app, ...updates.app },
      };

      // Optimistic update
      setSettings(newSettings);

      const { error } = await supabase.from('user_preferences').upsert(
        {
          user_id: user.id,
          notification_settings: newSettings,
        },
        { onConflict: 'user_id' },
      );

      if (error) throw error;

      // Reschedule local notifications
      await rescheduleAllNotifications(newSettings);

      return true;
    } catch (err: unknown) {
      console.error('Error updating notification settings:', err);
      Alert.alert(t('common.error'), t('settings.saveSettingsError'));
      await fetchSettings(); // Revert
      return false;
    } finally {
      setUpdating(false);
    }
  };

  // Convenience methods for updating specific sections
  const updateMealReminder = (meal: keyof NotificationSettings['meals'], reminder: Partial<MealReminder>) => {
    return updateSettings({
      meals: {
        ...settings.meals,
        [meal]: { ...settings.meals[meal], ...reminder },
      },
    });
  };

  const updateTrainingSettings = (updates: Partial<NotificationSettings['training']>) => {
    return updateSettings({
      training: { ...settings.training, ...updates },
    });
  };

  const updateHealthSettings = (updates: Partial<NotificationSettings['health']>) => {
    return updateSettings({
      health: { ...settings.health, ...updates },
    });
  };

  const updateAppSettings = (updates: Partial<NotificationSettings['app']>) => {
    return updateSettings({
      app: { ...settings.app, ...updates },
    });
  };

  useEffect(() => {
    if (user) {
      fetchSettings();
    }
    // Request permissions on mount (or first entry to settings)
    NotificationService.registerForPushNotificationsAsync();
  }, [fetchSettings, user]);

  return {
    settings,
    loading,
    updating,
    updateSettings,
    updateMealReminder,
    updateTrainingSettings,
    updateHealthSettings,
    updateAppSettings,
    refetch: fetchSettings,
  };
};
