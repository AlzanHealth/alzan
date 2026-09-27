import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, spacing, typography, borderRadius, shadows } from '../../theme';
import { useSettingsStyles } from '../../hooks/useSettingsStyles';
import { usePrivacy } from '../../hooks/settings/usePrivacy';
import { Download, CheckCircle } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { formLayout } from '../../components/common/formLayout';

export const DataExportScreen = () => {
  const { t } = useTranslation();
  const { styles: dynamicStyles, colors: themeColors } = useSettingsStyles();
  const { handleExportData, loading } = usePrivacy();
  const [success, setSuccess] = useState(false);
  const [failed, setFailed] = useState(false);

  const onExport = async () => {
    setSuccess(false);
    setFailed(false);
    try {
      const exported = await handleExportData();
      setSuccess(exported);
      setFailed(!exported);
    } catch {
      setFailed(true);
    }
  };

  return (
    <LinearGradient colors={dynamicStyles.gradientColors} style={styles.container}>
      <View style={[styles.container, dynamicStyles.container]}>
        <View style={[styles.card, dynamicStyles.card]}>
          <Download size={48} color={themeColors.primary} style={styles.icon} />
          <Text style={[styles.title, { color: themeColors.textPrimary }]}>{t('settings.dataPortability')}</Text>
          <Text style={[styles.description, { color: themeColors.textSecondary }]}>
            {t('settings.gdprRightsInfo')}
            {'\n\n'}
            {t('settings.jsonExportInfo')}
          </Text>

          <TouchableOpacity
            style={[styles.button, { backgroundColor: themeColors.primary }]}
            onPress={onExport}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color={themeColors.white} />
            ) : (
              <Text style={[styles.buttonText, { color: themeColors.white }]}>{t('settings.downloadMyData')}</Text>
            )}
          </TouchableOpacity>

          {failed && !loading && (
            <Text accessibilityRole="alert" style={[styles.successText, { color: themeColors.danger }]}>
              {t('settings.dataExportRetry')}
            </Text>
          )}

          {success && !loading && (
            <View style={styles.successContainer}>
              <CheckCircle size={20} color={themeColors.success} />
              <Text style={[styles.successText, { color: themeColors.success }]}>
                {t('settings.fileGeneratedSuccess')}
              </Text>
            </View>
          )}
        </View>
      </View>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: spacing.m,
    justifyContent: 'center',
  },
  card: {
    ...formLayout.settings,
    borderRadius: borderRadius.l,
    padding: spacing.xl,
    alignItems: 'center',
    ...shadows.soft,
  },
  icon: {
    marginBottom: spacing.m,
  },
  title: {
    ...typography.h3,
    marginBottom: spacing.m,
    textAlign: 'center',
  },
  description: {
    ...typography.body,
    textAlign: 'center',
    marginBottom: spacing.xl,
  },
  button: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.m,
    paddingHorizontal: spacing.xl,
    borderRadius: borderRadius.full,
    width: '100%',
    alignItems: 'center',
  },
  buttonText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: '600',
  },
  successContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.m,
    gap: spacing.s,
  },
  successText: {
    fontWeight: '500',
  },
});
