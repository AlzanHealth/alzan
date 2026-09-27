import { useState } from 'react';
import { exportUserData } from '../../utils/gdpr/exportData';
import { deleteUserAccount } from '../../utils/gdpr/deleteUser';
import { supabase } from '../../lib/supabaseClient';
import { Alert } from '../../components/common/Alert';
import { useAuth } from '../../context/AuthContext';
import { useTranslation } from 'react-i18next';

export const usePrivacy = () => {
  const { t } = useTranslation();
  const { user, signOut } = useAuth();
  const [loading, setLoading] = useState(false);

  const handleExportData = async () => {
    setLoading(true);
    try {
      if (user) {
        return await exportUserData(user.id, user.email);
      }
      return false;
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteAccount = async () => {
    setLoading(true);
    try {
      const deleted = await deleteUserAccount();
      if (!deleted) {
        throw new Error('No se pudo completar la eliminación de cuenta');
      }

      await signOut();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : t('auth.unknownError');
      Alert.alert(t('common.error'), `${t('settings.deleteAccountError')} ${message}`);
    } finally {
      setLoading(false);
    }
  };

  const revokeConsent = async () => {
    // In reality, this might flag the user or force logout
    // This was useSettingsPrivacy.ts before. I need to be careful.
    // usePrivacy.ts is likely DIFFERENT.
    Alert.alert(t('settings.revokeConsentTitle'), t('settings.revokeConsentMessage'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('settings.revokeAndLogoutAction'),
        style: 'destructive',
        onPress: async () => {
          try {
            if (user) {
              await supabase.from('user_preferences').update({ health_data_consent: false }).eq('user_id', user.id);
            }
          } catch (e) {
            console.error('Error updating consent', e);
          }
          await supabase.auth.signOut();
        },
      },
    ]);
  };

  return {
    loading,
    handleExportData,
    handleDeleteAccount,
    revokeConsent,
  };
};
