import React, { useState, useRef, useEffect } from 'react';
import { formLayout } from '../../components/common/formLayout';
import { FormError } from '../../components/common/FormError';
import {
  View,
  Text,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  TouchableOpacity,
  TouchableWithoutFeedback,
  Keyboard,
  Pressable,
} from 'react-native';
import { useRoute, RouteProp } from '@react-navigation/native';
import { AuthStackParamList } from '../../types/navigation.types';
import { supabase } from '../../lib/supabaseClient';
import { typography, spacing, borderRadius } from '../../theme';
import { PrimaryButton } from '../../components/PrimaryButton';
import { useAuthStyles } from '../../hooks/useAuthStyles';
import { Ionicons } from '@expo/vector-icons';
import { Alert } from '../../components/common/Alert';
import { useTranslation } from 'react-i18next';

const CODE_LENGTH = 6;

export const VerifyEmailScreen = () => {
  const { t } = useTranslation();
  const route = useRoute<RouteProp<AuthStackParamList, 'VerifyEmail'>>();
  const { styles, colors } = useAuthStyles();
  const email = route.params?.email || '';

  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [resendCooldown, setResendCooldown] = useState(0);
  const inputRef = useRef<TextInput>(null);

  // Cooldown timer for resend button
  useEffect(() => {
    if (resendCooldown > 0) {
      const timer = setTimeout(() => setResendCooldown(resendCooldown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [resendCooldown]);

  const handleCodeChange = (text: string) => {
    // Only allow digits
    const cleaned = text.replace(/\D/g, '').slice(0, CODE_LENGTH);
    setCode(cleaned);
  };

  const handleVerify = async () => {
    if (loading) return;
    setFormError(null);
    if (code.length !== CODE_LENGTH) {
      setFormError(t('auth.enterCodeDigits', { count: CODE_LENGTH }));
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.verifyOtp({
        email,
        token: code,
        type: 'signup',
      });

      if (error) throw error;

      // Success! AuthContext will detect the new session automatically
      // and RootNavigator will redirect to Onboarding.
      console.log('[VerifyEmail] OTP verified successfully');
    } catch (error: unknown) {
      console.error('[VerifyEmail] Error:', error);
      const message = error instanceof Error ? error.message : t('auth.verifyCodeError');
      setFormError(message);
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (resendCooldown > 0 || loading) return;
    setFormError(null);

    setLoading(true);
    try {
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email,
      });

      if (error) throw error;

      Alert.alert(t('auth.codeResent'), t('auth.checkInbox'));
      setResendCooldown(60); // 60 second cooldown
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : t('auth.couldNotResendCode');
      setFormError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.container}>
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <View style={localStyles.content}>
          <View style={localStyles.iconContainer}>
            <Ionicons name="mail-open-outline" size={64} color={colors.primary} />
          </View>

          <Text style={[typography.h1, { color: colors.textPrimary, textAlign: 'center', marginBottom: spacing.s }]}>
            {t('auth.verifyEmail')}
          </Text>
          <Text
            style={[typography.body, { color: colors.textSecondary, textAlign: 'center', marginBottom: spacing.xl }]}
          >
            {t('auth.verificationSentMessage')}
            {CODE_LENGTH}
            {t('auth.digitsPlaceholder')}
            {'\n'}
            <Text style={{ fontWeight: '600', color: colors.textPrimary }}>{email}</Text>
          </Text>

          {/* Code Input Wrapper */}
          <Pressable style={localStyles.inputWrapper} onPress={() => inputRef.current?.focus()}>
            {/* Visual Boxes */}
            <View style={localStyles.codeContainer}>
              {Array.from({ length: CODE_LENGTH }).map((_, index) => (
                <View
                  key={index}
                  style={[
                    localStyles.codeBox,
                    {
                      backgroundColor: colors.surface,
                      borderColor: code[index] ? colors.primary : colors.border,
                    },
                  ]}
                >
                  <Text style={[localStyles.codeDigit, { color: colors.textPrimary }]}>{code[index] || ''}</Text>
                </View>
              ))}
            </View>

            {/* Invisible Input */}
            <TextInput
              ref={inputRef}
              style={localStyles.hiddenInput}
              value={code}
              onChangeText={handleCodeChange}
              keyboardType="number-pad"
              autoFocus={true}
              maxLength={CODE_LENGTH}
              caretHidden={true}
              autoComplete="one-time-code"
              textContentType="oneTimeCode"
              importantForAutofill="yes"
              accessible={true}
              accessibilityLabel={t('auth.verificationCode')}
            />
          </Pressable>

          <FormError message={formError} />
          <PrimaryButton
            title={t('auth.verify')}
            onPress={handleVerify}
            loading={loading}
            disabled={code.length !== CODE_LENGTH}
            style={{ marginTop: spacing.l }}
          />

          <TouchableOpacity
            style={localStyles.resendButton}
            onPress={handleResend}
            disabled={resendCooldown > 0 || loading}
          >
            <Text
              style={[localStyles.resendText, { color: resendCooldown > 0 ? colors.textSecondary : colors.primary }]}
            >
              {resendCooldown > 0 ? `${t('auth.resendCodeIn')} ${resendCooldown}s` : t('auth.resendCode')}
            </Text>
          </TouchableOpacity>
        </View>
      </TouchableWithoutFeedback>
    </KeyboardAvoidingView>
  );
};

const localStyles = StyleSheet.create({
  content: {
    ...formLayout.auth,
    flex: 1,
    paddingHorizontal: spacing.l,
    justifyContent: 'center',
  },
  iconContainer: {
    alignItems: 'center',
    marginBottom: spacing.l,
  },
  inputWrapper: {
    alignItems: 'center',
    position: 'relative',
  },
  codeContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  codeBox: {
    width: 48,
    height: 56,
    borderRadius: borderRadius.m,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  codeDigit: {
    fontSize: 24,
    fontWeight: '600',
  },
  hiddenInput: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    opacity: 0,
    width: '100%',
    height: '100%',
  },
  resendButton: {
    marginTop: spacing.l,
    alignItems: 'center',
  },
  resendText: {
    fontSize: 14,
  },
});
