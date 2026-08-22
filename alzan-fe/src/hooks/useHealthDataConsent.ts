import { useCallback } from 'react';
import { Alert } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { usePreferencesContext } from '../context/PreferencesContext';
import { supabase } from '../lib/supabaseClient';
import { UserPreferenceInsert } from '../types/requests.types';

const HEALTH_DATA_CONSENT_VERSION = 'health_integrations_v2_2026_08_22';

const promptForHealthDataConsent = ({
  title,
  message,
  cancelLabel,
  acceptLabel,
}: {
  title: string;
  message: string;
  cancelLabel: string;
  acceptLabel: string;
}): Promise<boolean> =>
  new Promise(resolve => {
    Alert.alert(title, message, [
      { text: cancelLabel, style: 'cancel', onPress: () => resolve(false) },
      { text: acceptLabel, onPress: () => resolve(true) },
    ]);
  });

export function useHealthDataConsent() {
  const { user } = useAuth();
  const { preferences, refetch } = usePreferencesContext();
  const { t } = useTranslation();

  const ensureHealthDataConsent = useCallback(async (): Promise<boolean> => {
    if (!user) throw new Error('User not authenticated');
    if (preferences?.health_data_consent && preferences.health_data_consent_version === HEALTH_DATA_CONSENT_VERSION)
      return true;

    const accepted = await promptForHealthDataConsent({
      title: t('settings.healthDataConsentTitle'),
      message: t('settings.healthDataConsentMessage'),
      cancelLabel: t('common.cancel'),
      acceptLabel: t('common.accept'),
    });

    if (!accepted) return false;

    const now = new Date().toISOString();
    const payload: UserPreferenceInsert = {
      user_id: user.id,
      health_data_consent: true,
      health_data_consent_at: now,
      health_data_consent_version: HEALTH_DATA_CONSENT_VERSION,
      import_health_metrics: true,
    };

    const { error } = await supabase.from('user_preferences').upsert(payload, { onConflict: 'user_id' });
    if (error) throw new Error(t('settings.healthDataConsentSaveError'));

    await refetch(true);
    return true;
  }, [preferences?.health_data_consent, preferences?.health_data_consent_version, refetch, t, user]);

  return { ensureHealthDataConsent };
}
