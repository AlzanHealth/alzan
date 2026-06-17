import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { supabase } from '../lib/supabaseClient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { UserPreference, UserPreferenceInsert } from '../types/requests.types';
import { useAuth } from './AuthContext';
import { changeLanguage, DEFAULT_LOCALE, isValidLocale } from '../i18n';
import {
  DEFAULT_HOME_MODE,
  DEFAULT_HOME_PDF_SECTION_ORDER,
  DEFAULT_HOME_PRIMARY_ACTION,
  DEFAULT_HOME_CARDS_ORDER,
} from '../constants/homeSettings';
import {
  AppearanceSettingsJson,
  NotificationSettingsJson,
  NutritionSettingsJson,
  PrivacySettingsJson,
} from '../types/requests.types';

const PREFERENCES_STORAGE_KEY = 'user_preferences_cache';

const DEFAULT_APPEARANCE_SETTINGS: AppearanceSettingsJson = {
  theme: 'system',
  accessibility: {
    reduceMotion: false,
    largeText: false,
  },
  home_cards: DEFAULT_HOME_CARDS_ORDER,
  home_mode: DEFAULT_HOME_MODE,
  home_primary_action: DEFAULT_HOME_PRIMARY_ACTION,
  home_pdf_section_order: DEFAULT_HOME_PDF_SECTION_ORDER,
};

const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettingsJson = {
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

const DEFAULT_NUTRITION_PREFS: NutritionSettingsJson = {
  enabled_meals: {
    breakfast: true,
    almuerzo: true,
    lunch: true,
    merienda: true,
    dinner: true,
    snack: true,
  },
  snack_behavior: {
    treat_as_meal: true,
    show_only_if_content: false,
  },
  macro_display: 'per_meal',
  copy_mode: 'none',
  default_recipe_visibility: 'private',
  recipe_search_scope: 'source',
};

const DEFAULT_PRIVACY_SETTINGS: PrivacySettingsJson = {
  profile_public: false,
  default_workout_visibility: 'private',
};

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const mergeNutritionPrefs = (
  currentValue: UserPreference['nutrition_prefs'],
  incomingValue: UserPreference['nutrition_prefs'],
): UserPreference['nutrition_prefs'] => {
  if (incomingValue === undefined) {
    return currentValue;
  }

  if (isPlainObject(currentValue) && isPlainObject(incomingValue)) {
    return {
      ...currentValue,
      ...incomingValue,
    };
  }

  return incomingValue;
};

const buildOptimisticPreferences = (
  current: UserPreference | null,
  updates: Partial<UserPreference>,
  userId: string,
): UserPreference => {
  const base: UserPreference = current ?? {
    appearance_settings: DEFAULT_APPEARANCE_SETTINGS,
    distance_unit: 'km',
    energy_unit: 'kcal',
    health_data_consent: false,
    health_data_consent_at: null,
    health_data_consent_version: null,
    import_health_metrics: false,
    language_code: DEFAULT_LOCALE,
    notification_settings: DEFAULT_NOTIFICATION_SETTINGS,
    nutrition_prefs: DEFAULT_NUTRITION_PREFS,
    pace_unit: 'min_km',
    privacy_settings: DEFAULT_PRIVACY_SETTINGS,
    temperature_unit: 'celsius',
    timezone: null,
    user_id: userId,
    weight_unit: 'kg',
  };

  return {
    ...base,
    ...updates,
    user_id: userId,
    nutrition_prefs:
      updates.nutrition_prefs !== undefined
        ? mergeNutritionPrefs(base.nutrition_prefs, updates.nutrition_prefs)
        : base.nutrition_prefs,
  };
};

interface PreferencesContextType {
  preferences: UserPreference | null;
  loading: boolean;
  updating: boolean;
  updatePreferences: (updates: Partial<UserPreference>) => Promise<boolean>;
  refetch: (silent?: boolean) => Promise<void>;
}

const PreferencesContext = createContext<PreferencesContextType | undefined>(undefined);

export const PreferencesProvider = ({ children }: { children: ReactNode }) => {
  const [preferences, setPreferences] = useState<UserPreference | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const { user } = useAuth();

  const fetchPreferences = async (silent = false) => {
    console.log(`[PreferencesContext] Fetching preferences... (silent: ${silent})`);
    try {
      if (!silent) setLoading(true);

      // 1. Try cache first for immediate UI
      const cached = await AsyncStorage.getItem(PREFERENCES_STORAGE_KEY);
      if (cached) {
        const parsed: UserPreference = JSON.parse(cached);
        console.log('[PreferencesContext] Loaded cached preferences');
        setPreferences(parsed);
        if (isValidLocale(parsed?.language_code)) {
          changeLanguage(parsed?.language_code);
        }
      }

      // 2. Fetch from Supabase (using useUser hook data if available)
      if (!user) {
        if (!silent) setLoading(false);
        return;
      }

      const { data, error } = await supabase.from('user_preferences').select('*').eq('user_id', user.id).maybeSingle();

      if (error) {
        console.log('[PreferencesContext] No preferences found or error:', error);
      }

      if (data) {
        console.log('[PreferencesContext] Loaded fresh preferences');
        setPreferences(data);
        await AsyncStorage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify(data));

        if (isValidLocale(data.language_code)) {
          changeLanguage(data.language_code);
        }
      }
    } catch (err) {
      console.error('[PreferencesContext] Error fetching preferences:', err);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  const updatePreferences = async (updates: Partial<UserPreference>): Promise<boolean> => {
    if (!user) {
      console.error('[PreferencesContext] No user for update');
      return false;
    }

    console.log('[PreferencesContext] Updating preferences OPTIMISTICALLY:', JSON.stringify(updates));

    // STEP 1: Optimistic update IMMEDIATELY (synchronous state update)
    let nextPrefs: UserPreference | null = null;

    setPreferences(prev => {
      nextPrefs = buildOptimisticPreferences(prev, updates, user.id);
      return nextPrefs;
    });

    // Apply language change immediately
    if (isValidLocale(updates.language_code)) {
      changeLanguage(updates.language_code);
    }

    // Update cache immediately (fire and forget)
    if (nextPrefs) {
      AsyncStorage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify(nextPrefs));
    }

    // STEP 2: Update database in background (fire and forget - don't block UI)
    setUpdating(true);
    (async () => {
      try {
        const payload: UserPreferenceInsert = {
          user_id: user.id,
          ...updates,
        } as UserPreferenceInsert;

        const { error } = await supabase.from('user_preferences').upsert(payload, {
          onConflict: 'user_id',
        });

        if (error) {
          console.error('[PreferencesContext] DB update failed:', error);
          fetchPreferences();
        } else {
          console.log('[PreferencesContext] DB update succeeded');
        }
      } catch (err) {
        console.error('[PreferencesContext] DB update exception:', err);
        fetchPreferences();
      } finally {
        setUpdating(false);
      }
    })();

    return true;
  };

  useEffect(() => {
    if (user) {
      fetchPreferences();
    }
  }, [user]);

  return (
    <PreferencesContext.Provider
      value={{
        preferences,
        loading,
        updating,
        updatePreferences,
        refetch: fetchPreferences,
      }}
    >
      {children}
    </PreferencesContext.Provider>
  );
};

export const usePreferencesContext = () => {
  const context = useContext(PreferencesContext);
  if (context === undefined) {
    throw new Error('usePreferencesContext must be used within a PreferencesProvider');
  }
  return context;
};
