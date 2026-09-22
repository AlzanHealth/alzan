import React, { useState } from 'react';
import { formLayout } from '../../components/common/formLayout';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ActivityIndicator, ScrollView } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';
import { colors, spacing, typography, borderRadius } from '../../theme';
import { useSettingsStyles } from '../../hooks/useSettingsStyles';
import { usePrivacy } from '../../hooks/settings/usePrivacy';
import { useSettingsProfile } from '../../hooks/settings/useSettingsProfile';
import { AlertTriangle } from 'lucide-react-native';
import { Alert } from '../../components/common/Alert';
import { useTranslation } from 'react-i18next';

export const DeleteAccountScreen = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { styles: dynamicStyles, colors: themeColors, isDark } = useSettingsStyles();
  const { handleDeleteAccount, loading } = usePrivacy();
  const { profile, loading: loadingProfile } = useSettingsProfile();
  const [confirmationPhrase, setConfirmationPhrase] = useState('');
  const [email, setEmail] = useState('');
  const [usernameInput, setUsernameInput] = useState('');

  const expectedEmail = user?.email || '';
  const expectedUsername = profile?.username || '';
  const expectedPhrase = t('settings.deleteAccountConfirmationPhrase');

  const emailMatches = expectedEmail.length > 0 && email.trim() === expectedEmail;
  const hasUsername = expectedUsername.length > 0;
  const usernameMatches = hasUsername && usernameInput.trim() === expectedUsername;
  const phraseMatches = confirmationPhrase.trim() === expectedPhrase;

  const isReadyToDelete = !loadingProfile && emailMatches && (!hasUsername || usernameMatches) && phraseMatches;

  const handleDelete = () => {
    if (!isReadyToDelete) {
      Alert.alert(t('common.error'), t('settings.deleteConfirmationErrorDetailed'));
      return;
    }

    Alert.alert(t('settings.areYouSure'), t('settings.irreversibleDeleteWarning'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('settings.deletePermanentlyAction'), style: 'destructive', onPress: handleDeleteAccount },
    ]);
  };

  return (
    <LinearGradient colors={dynamicStyles.gradientColors} style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <ScrollView
          style={[styles.container, dynamicStyles.container]}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <View
            style={[
              styles.warningCard,
              isDark ? styles.warningCardDark : { backgroundColor: '#FFF5F5', borderColor: '#FECACA' },
            ]}
          >
            <AlertTriangle size={40} color={themeColors.danger} style={styles.icon} />
            <Text style={[styles.warningTitle, { color: themeColors.danger }]}>{t('settings.dangerZone')}</Text>
            <Text style={[styles.warningText, { color: themeColors.danger }]}>
              {t('settings.deleteAccountConsequences')}
              {'\n\n'}
              {t('settings.cannotRecoverInfo')}
            </Text>
          </View>

          <View style={styles.form}>
            <Text style={[styles.label, { color: themeColors.textPrimary }]}>{t('settings.typeEmailToConfirm')}</Text>
            <Text style={[styles.expectedValue, { color: themeColors.textSecondary }]}>
              {t('settings.mustTypeExactly', { value: expectedEmail || '-' })}
            </Text>
            <TextInput
              style={[styles.input, dynamicStyles.input]}
              placeholder={expectedEmail || t('settings.emailReadOnly')}
              placeholderTextColor={themeColors.textSecondary}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
            />

            {hasUsername && (
              <>
                <Text style={[styles.label, { color: themeColors.textPrimary }]}>
                  {t('settings.typeUsernameToConfirm')}
                </Text>
                <Text style={[styles.expectedValue, { color: themeColors.textSecondary }]}>
                  {t('settings.mustTypeExactly', { value: expectedUsername })}
                </Text>
                <TextInput
                  style={[styles.input, dynamicStyles.input]}
                  placeholder={expectedUsername}
                  placeholderTextColor={themeColors.textSecondary}
                  value={usernameInput}
                  onChangeText={setUsernameInput}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </>
            )}

            <Text style={[styles.label, { color: themeColors.textPrimary }]}>{t('settings.typePhraseToConfirm')}</Text>
            <Text style={[styles.expectedValue, { color: themeColors.textSecondary }]}>
              {t('settings.mustTypeExactly', { value: expectedPhrase })}
            </Text>
            <TextInput
              style={[styles.input, dynamicStyles.input]}
              placeholder={expectedPhrase}
              placeholderTextColor={themeColors.textSecondary}
              value={confirmationPhrase}
              onChangeText={setConfirmationPhrase}
              autoCapitalize="characters"
            />

            <View style={[styles.checklistCard, { borderColor: themeColors.border }]}>
              <Text
                style={[styles.checkRow, { color: emailMatches ? themeColors.success : themeColors.textSecondary }]}
              >
                {emailMatches ? '✓' : '•'} {t('settings.checkEmailMatch')}
              </Text>
              {hasUsername && (
                <Text
                  style={[
                    styles.checkRow,
                    { color: usernameMatches ? themeColors.success : themeColors.textSecondary },
                  ]}
                >
                  {usernameMatches ? '✓' : '•'} {t('settings.checkUsernameMatch')}
                </Text>
              )}
              <Text
                style={[styles.checkRow, { color: phraseMatches ? themeColors.success : themeColors.textSecondary }]}
              >
                {phraseMatches ? '✓' : '•'} {t('settings.checkPhraseMatch')}
              </Text>
            </View>

            <TouchableOpacity
              style={[styles.deleteButton, loading && styles.disabledButton, { backgroundColor: themeColors.danger }]}
              onPress={handleDelete}
              disabled={loading || !isReadyToDelete}
            >
              {loading ? (
                <ActivityIndicator color={themeColors.white} />
              ) : (
                <Text style={[styles.deleteButtonText, { color: themeColors.white }]}>
                  {t('settings.deleteAccountPermanent')}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  content: {
    ...formLayout.settings,
    padding: spacing.m,
    paddingBottom: 120,
  },
  warningCard: {
    backgroundColor: '#FFF5F5',
    padding: spacing.l,
    borderRadius: borderRadius.m,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#FECACA',
    marginBottom: spacing.xl,
  },
  warningCardDark: {
    backgroundColor: 'rgba(255,69,58,0.15)',
    borderColor: 'rgba(255,69,58,0.3)',
  },
  icon: {
    marginBottom: spacing.m,
  },
  warningTitle: {
    ...typography.h3,
    marginBottom: spacing.s,
  },
  warningText: {
    ...typography.body,
    textAlign: 'center',
  },
  form: {
    gap: spacing.m,
  },
  expectedValue: {
    ...typography.caption,
    marginTop: -spacing.s,
  },
  label: {
    ...typography.body,
    fontWeight: '600',
  },
  input: {
    padding: spacing.m,
    borderRadius: borderRadius.m,
    borderWidth: 1,
    borderColor: colors.border,
    fontSize: 16,
  },
  deleteButton: {
    backgroundColor: colors.danger,
    padding: spacing.m,
    borderRadius: borderRadius.m,
    alignItems: 'center',
    marginTop: spacing.m,
  },
  checklistCard: {
    borderWidth: 1,
    borderRadius: borderRadius.m,
    padding: spacing.m,
    gap: spacing.s,
    marginTop: spacing.xs,
  },
  checkRow: {
    ...typography.caption,
    fontWeight: '600',
  },
  disabledButton: {
    opacity: 0.5,
  },
  deleteButtonText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: 'bold',
  },
});
