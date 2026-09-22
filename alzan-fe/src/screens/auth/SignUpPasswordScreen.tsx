import React, { useState } from 'react';
import { formLayout } from '../../components/common/formLayout';
import { View, Text, TextInput, KeyboardAvoidingView, Platform, StyleSheet, TouchableOpacity } from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { AuthScreenNavigationProp, AuthStackParamList } from '../../types/navigation.types';
import { supabase } from '../../lib/supabaseClient';
import { typography, spacing } from '../../theme';
import { PrimaryButton } from '../../components/PrimaryButton';
import { AuthColors, useAuthStyles } from '../../hooks/useAuthStyles';
import { Ionicons } from '@expo/vector-icons';
import { LegalModal } from '../../components/LegalModal';
import { TERMS_AND_CONDITIONS, PRIVACY_POLICY } from '../../utils/gdpr/legalTexts';
import { FormError } from '../../components/common/FormError';
import { useTranslation } from 'react-i18next';

export const SignUpPasswordScreen = () => {
  const { t } = useTranslation();
  const navigation = useNavigation<AuthScreenNavigationProp>();
  const route = useRoute<RouteProp<AuthStackParamList, 'SignUpPassword'>>();
  const { styles, colors } = useAuthStyles();

  // State
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const email = route.params?.email;

  // Validation State
  const [errors, setErrors] = useState<string[]>([]);
  const [showPassword, setShowPassword] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [modalContent, setModalContent] = useState({ title: '', content: '' });

  const openLegal = (title: string, content: string) => {
    setModalContent({ title, content });
    setModalVisible(true);
  };

  const validatePassword = (pwd: string) => {
    const newErrors: string[] = [];
    if (pwd.length < 8) newErrors.push(t('auth.reqMinLength'));
    if (!/[A-Z]/.test(pwd)) newErrors.push(t('auth.reqUpper'));
    if (!/[0-9]/.test(pwd)) newErrors.push(t('auth.reqNumber'));
    if (!/[!@#$%^&*(),.?":{}|<>\-_]/.test(pwd)) newErrors.push(t('auth.reqSymbol'));

    setErrors(newErrors);
    return newErrors.length === 0;
  };

  const handlePasswordChange = (text: string) => {
    setPassword(text);
    validatePassword(text);
  };

  const handleSignUp = async () => {
    if (loading) return;
    setFormError(null);
    if (!validatePassword(password)) {
      setFormError(t('auth.fixPasswordErrors'));
      return;
    }

    setLoading(true);
    try {
      // Sign up user. Supabase sends OTP email automatically.
      const { error, data } = await supabase.auth.signUp({
        email,
        password,
        // No emailRedirectTo needed for OTP flow
      });

      if (error) throw error;

      console.log('[SignUp] Success, navigating to verify screen. User:', data.user?.id);

      // Navigate to OTP verification screen
      navigation.navigate('VerifyEmail', { email });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : t('auth.verifyCodeError');
      setFormError(message);
    } finally {
      setLoading(false);
    }
  };

  const isValid = password.length > 0 && errors.length === 0;

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.container}>
      <View style={localStyles.content}>
        <Text style={[typography.h1, { color: colors.textPrimary, marginBottom: spacing.s }]}>
          {t('auth.createSecurePassword')}
        </Text>
        <Text style={[typography.body, { color: colors.textSecondary, marginBottom: spacing.xl }]}>
          {t('auth.securePasswordReason')}
        </Text>

        <View style={styles.inputContainer}>
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={handlePasswordChange}
            secureTextEntry={!showPassword}
            placeholder={t('auth.password')}
            placeholderTextColor={colors.textSecondary}
            autoFocus={true}
          />
          <TouchableOpacity style={localStyles.eyeIcon} onPress={() => setShowPassword(!showPassword)}>
            <Ionicons name={showPassword ? 'eye-off' : 'eye'} size={24} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>

        {/* Validation Feedback */}
        <View style={localStyles.validationContainer}>
          {password.length > 0 && (
            <>
              <ValidationItem label={t('auth.reqMinLength')} satisfied={password.length >= 8} colors={colors} />
              <ValidationItem label={t('auth.reqUpper')} satisfied={/[A-Z]/.test(password)} colors={colors} />
              <ValidationItem label={t('auth.reqNumber')} satisfied={/[0-9]/.test(password)} colors={colors} />
              <ValidationItem
                label={t('auth.reqSymbol')}
                satisfied={/[!@#$%^&*(),.?":{}|<>\-_]/.test(password)}
                colors={colors}
              />
            </>
          )}
        </View>

        <FormError message={formError} />
        <PrimaryButton
          title={t('auth.register')}
          onPress={handleSignUp}
          loading={loading}
          style={styles.button}
          disabled={!isValid}
        />

        <Text style={[localStyles.legalDisclaimer, { color: colors.textSecondary }]}>
          {t('auth.termsAcceptanceLabel')}{' '}
          <Text
            style={{ color: colors.primary, fontWeight: '600' }}
            onPress={() => openLegal(t('auth.terms'), TERMS_AND_CONDITIONS)}
          >
            {t('auth.terms')}
          </Text>{' '}
          {t('auth.and')}{' '}
          <Text
            style={{ color: colors.primary, fontWeight: '600' }}
            onPress={() => openLegal(t('auth.privacyPolicy'), PRIVACY_POLICY)}
          >
            {t('auth.privacyPolicy')}
          </Text>
          .
        </Text>
      </View>

      <LegalModal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        title={modalContent.title}
        content={modalContent.content}
      />
    </KeyboardAvoidingView>
  );
};

// Helper Component for Validation Points
const ValidationItem = ({ label, satisfied, colors }: { label: string; satisfied: boolean; colors: AuthColors }) => (
  <View style={localStyles.validationItem}>
    <Ionicons
      name={satisfied ? 'checkmark-circle' : 'ellipse-outline'}
      size={16}
      color={satisfied ? '#4CAF50' : colors.textSecondary}
    />
    <Text style={[typography.caption, { color: satisfied ? '#4CAF50' : colors.textSecondary, marginLeft: spacing.xs }]}>
      {label}
    </Text>
  </View>
);

const localStyles = StyleSheet.create({
  header: {
    paddingHorizontal: spacing.m,
    paddingTop: spacing.xl,
    marginBottom: spacing.m,
  },
  content: {
    ...formLayout.auth,
    flex: 1,
    paddingHorizontal: spacing.l,
  },
  eyeIcon: {
    position: 'absolute',
    right: spacing.m,
    top: 14, // align center roughly based on input height
  },
  validationContainer: {
    marginTop: spacing.m,
    marginBottom: spacing.xl,
  },
  validationItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  legalDisclaimer: {
    ...typography.caption,
    textAlign: 'center',
    marginTop: spacing.m,
    lineHeight: 20,
  },
});
