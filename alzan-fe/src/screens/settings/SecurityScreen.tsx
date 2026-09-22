import React, { useState } from 'react';
import { formLayout } from '../../components/common/formLayout';
import { View, Text, StyleSheet, TextInput, ScrollView } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { spacing, typography, borderRadius } from '../../theme';
import { supabase } from '../../lib/supabaseClient';
import { useSettingsStyles } from '../../hooks/useSettingsStyles';
import { useTranslation } from 'react-i18next';
import { Alert } from '../../components/common/Alert';
import { FormError } from '../../components/common/FormError';
import { PrimaryButton } from '../../components/PrimaryButton';

export const SecurityScreen = () => {
  const { t } = useTranslation();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const { styles: dynamicStyles, colors: themeColors } = useSettingsStyles();

  const handleUpdatePassword = async () => {
    if (loading) return;
    setFormError(null);
    if (password.length < 8) {
      setFormError(t('auth.passwordMinLengthError'));
      return;
    }
    if (password !== confirmPassword) {
      setFormError(t('settings.passwordsDoNotMatch'));
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      Alert.alert(t('common.done'), t('auth.passwordUpdatedSuccess'));
      setPassword('');
      setConfirmPassword('');
    } catch (error: unknown) {
      setFormError(error instanceof Error ? error.message : t('auth.unknownError'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <LinearGradient colors={dynamicStyles.gradientColors} style={{ flex: 1 }}>
      <SafeAreaView style={[styles.container, dynamicStyles.container]} edges={['bottom']}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={[styles.title, { color: themeColors.textPrimary }]}>{t('settings.changePassword')}</Text>

          <View style={styles.form}>
            <Text style={[styles.label, { color: themeColors.textPrimary }]}>{t('settings.newPassword')}</Text>
            <TextInput
              style={[styles.input, dynamicStyles.input, { borderColor: themeColors.border }]}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              placeholder={t('auth.reqMinLength')}
              placeholderTextColor={themeColors.textSecondary}
            />

            <Text style={[styles.label, { color: themeColors.textPrimary }]}>{t('settings.confirmPassword')}</Text>
            <TextInput
              style={[styles.input, dynamicStyles.input, { borderColor: themeColors.border }]}
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry
              placeholder={t('settings.repeatPassword')}
              placeholderTextColor={themeColors.textSecondary}
            />

            <Text style={[styles.hint, { color: themeColors.textSecondary }]}>
              {t('settings.passwordRequirements')}
            </Text>

            <FormError message={formError} />
            <PrimaryButton title={t('settings.update')} onPress={handleUpdatePassword} loading={loading} />
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
  content: {
    ...formLayout.settings,
    padding: spacing.m,
  },
  title: {
    ...typography.h4,
    marginBottom: spacing.l,
  },
  form: {
    gap: spacing.m,
  },
  label: {
    ...typography.body,
    fontWeight: '600',
  },
  input: {
    padding: spacing.m,
    borderRadius: borderRadius.m,
    borderWidth: 1,
    fontSize: 16,
  },
  hint: {
    ...typography.caption,
  },
  button: {
    padding: spacing.m,
    borderRadius: borderRadius.m,
    alignItems: 'center',
    marginTop: spacing.m,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '600',
  },
});
