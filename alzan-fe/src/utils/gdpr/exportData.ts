import { supabase } from '../../lib/supabaseClient';
import { Paths, File } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Alert } from 'react-native';
import i18n from '../../i18n';

export const exportUserData = async (userId: string, email?: string) => {
  console.log('[gdpr.exportUserData] Iniciando exportación');
  try {
    if (!userId) throw new Error('Usuario no autenticado');
    console.log('[gdpr.exportUserData] Usuario:', userId.slice(0, 8));

    // Parallel fetch of all related data
    console.log('[gdpr.exportUserData] Obteniendo datos...');
    const [profile, goals, preferences, externalAccounts, nutritionDayStatuses] = await Promise.all([
      supabase.from('users').select('*').eq('id', userId).single(),
      supabase.from('user_goals').select('*').eq('user_id', userId),
      supabase.from('user_preferences').select('*').eq('user_id', userId).single(),
      supabase.from('external_accounts').select('*').eq('user_id', userId),
      supabase.from('nutrition_day_statuses').select('*').eq('user_id', userId).order('date', { ascending: true }),
    ]);
    console.log('[gdpr.exportUserData] Datos obtenidos');

    const exportObject = {
      export_date: new Date().toISOString(),
      user_id: userId,
      email: email,
      profile: profile.data,
      preferences: preferences.data,
      goals: goals.data,
      external_accounts: externalAccounts.data,
      nutrition_day_statuses: nutritionDayStatuses.data,
    };

    const jsonString = JSON.stringify(exportObject, null, 2);
    const fileName = `alzan_data_export_${userId.slice(0, 8)}.json`;

    // Using new expo-file-system v19 API
    const file = new File(Paths.document, fileName);
    await file.write(jsonString);
    console.log('[gdpr.exportUserData] Archivo creado:', fileName);

    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(file.uri);
      console.log('[gdpr.exportUserData] Compartido');
    } else {
      Alert.alert(i18n.t('common.done'), i18n.t('settings.fileSavedAt', { uri: file.uri }));
    }

    console.log('[gdpr.exportUserData] Éxito');
    return true;
  } catch (error: unknown) {
    console.error('[gdpr.exportUserData] Error:', error);
    const msg = error instanceof Error ? error.message : i18n.t('settings.dataExportUnknownError');
    Alert.alert(i18n.t('settings.dataExportErrorTitle'), msg);
    return false;
  }
};
