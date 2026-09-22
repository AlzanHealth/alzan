import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import { AuthScreenNavigationProp } from '../../types/navigation.types';
import { supabase } from '../../lib/supabaseClient';
import { typography } from '../../theme';
import { PrimaryButton } from '../../components/PrimaryButton';
import { GlassCard } from '../../components/GlassCard';
import { ArrowLeft } from 'lucide-react-native';
import { useAuthStyles } from '../../hooks/useAuthStyles';
import { CONFIG } from '../../constants/environment';
import { Alert } from '../../components/common/Alert';
import { FormError } from '../../components/common/FormError';

export const ForgotPasswordScreen = () => {
  const { t } = useTranslation();
  const navigation = useNavigation<AuthScreenNavigationProp>();
  const { styles, colors } = useAuthStyles();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const handleResetPassword = async () => {
    if (loading) return;
    setFormError(null);
    if (!email) {
      setFormError(t('auth.enterEmailAddressError'));
      return;
    }

    setLoading(true);
    try {
      // Redirigimos a la web para el cambio de contraseña
      const websiteUrl = CONFIG.baseUrl;
      const redirectTo = `${websiteUrl}/reset-password`;

      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo,
      });

      if (error) throw error;

      Alert.alert(t('auth.emailSentTitle'), t('auth.checkInbox'));
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : t('auth.unknownError');
      setFormError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.scrollContent}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.headerRow}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <ArrowLeft size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.title, typography.h2, { marginBottom: 0 }]}>{t('auth.recoverPassword')}</Text>
      </View>

      <GlassCard style={styles.formCard}>
        <Text style={styles.description}>{t('auth.resetPasswordInstructions')}</Text>

        <View style={styles.inputContainer}>
          <Text style={styles.label}>{t('auth.email')}</Text>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            placeholder={t('auth.emailPlaceholder')}
            placeholderTextColor={colors.textSecondary}
          />
        </View>

        <FormError message={formError} />
        <PrimaryButton
          title={t('auth.sendLink')}
          onPress={handleResetPassword}
          loading={loading}
          style={styles.button}
        />
      </GlassCard>
    </ScrollView>
  );
};
