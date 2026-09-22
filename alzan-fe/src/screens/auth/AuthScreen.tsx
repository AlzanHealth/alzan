import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TouchableOpacity,
  Image,
  StyleSheet,
  Keyboard,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import { AuthScreenNavigationProp } from '../../types/navigation.types';
import { supabase } from '../../lib/supabaseClient';
import { typography, spacing } from '../../theme';
import { PrimaryButton } from '../../components/PrimaryButton';
import { useAuthStyles } from '../../hooks/useAuthStyles';
import { signInWithProvider } from '../../services/oauth';
import APP_LOGO from '../../../assets/iconA.png';
import { Alert } from '../../components/common/Alert';
import { FormError } from '../../components/common/FormError';
import { formLayout } from '../../components/common/formLayout';

const ENABLE_OAUTH = false; // <-- cuando actives Google/Apple lo pones en true

export const AuthScreen = () => {
  const { t } = useTranslation();
  const navigation = useNavigation<AuthScreenNavigationProp>();
  const { styles, colors, isDark } = useAuthStyles();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [keyboardVisible, setKeyboardVisible] = useState(false);

  React.useEffect(() => {
    const keyboardWillShowListener = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      () => setKeyboardVisible(true),
    );
    const keyboardWillHideListener = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => setKeyboardVisible(false),
    );

    return () => {
      keyboardWillShowListener.remove();
      keyboardWillHideListener.remove();
    };
  }, []);

  const handleLogin = async () => {
    if (loading) return;
    setFormError(null);
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) {
        // Check if user exists but email not confirmed
        if (
          error.message.toLowerCase().includes('email not confirmed') ||
          error.message.toLowerCase().includes('email_not_confirmed')
        ) {
          // Redirect to verify email screen
          navigation.navigate('VerifyEmail', { email });
          return;
        }
        throw error;
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : t('auth.unknownError');
      setFormError(message);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateAccount = () => {
    navigation.navigate('SignUpEmail');
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <View style={localStyles.topContent}>
            <View style={styles.header}>
              <Image source={APP_LOGO} style={localStyles.logo} resizeMode="contain" fadeDuration={0} />
            </View>

            <View style={styles.inputContainer}>
              <Text style={styles.label}>{t('auth.userOrEmail')}</Text>
              <TextInput
                style={styles.input}
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
                placeholder={t('auth.userOrEmail')}
                placeholderTextColor={colors.textSecondary}
              />
            </View>

            <View style={styles.inputContainer}>
              <Text style={styles.label}>{t('auth.password')}</Text>
              <TextInput
                style={[styles.input, { paddingRight: 56 }]}
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                placeholder={t('auth.password')}
                placeholderTextColor={colors.textSecondary}
              />
              <TouchableOpacity
                style={localStyles.eyeIcon}
                onPress={() => setShowPassword(!showPassword)}
                accessibilityRole="button"
                accessibilityLabel={t('auth.password')}
                accessibilityState={{ selected: showPassword }}
              >
                <Ionicons name={showPassword ? 'eye-off' : 'eye'} size={24} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <FormError message={formError} />
            <PrimaryButton title={t('auth.signIn')} onPress={handleLogin} loading={loading} style={styles.button} />

            <TouchableOpacity onPress={() => navigation.navigate('ForgotPassword')} style={styles.forgotPasswordButton}>
              <Text style={[styles.forgotPasswordText, { color: colors.textPrimary, fontWeight: '600' }]}>
                {t('auth.forgotPassword')}
              </Text>
            </TouchableOpacity>

            {ENABLE_OAUTH && (
              <>
                <PrimaryButton
                  title={t('auth.continueWithGoogle')}
                  variant="secondary"
                  onPress={async () => {
                    try {
                      await signInWithProvider('google');
                    } catch (e: unknown) {
                      const message = e instanceof Error ? e.message : t('auth.unknownError');
                      Alert.alert(t('auth.error'), message);
                    }
                  }}
                  style={{
                    marginTop: spacing.m,
                    backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : '#F5F5F5',
                  }}
                />

                <PrimaryButton
                  title={t('auth.continueWithApple')}
                  variant="secondary"
                  onPress={async () => {
                    try {
                      await signInWithProvider('apple');
                    } catch (e: unknown) {
                      const message = e instanceof Error ? e.message : t('auth.unknownError');
                      Alert.alert(t('auth.error'), message);
                    }
                  }}
                  style={{
                    marginTop: spacing.s,
                    backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : '#F5F5F5',
                  }}
                />
              </>
            )}
          </View>
        </ScrollView>

        {!keyboardVisible && (
          <View style={localStyles.bottomContainer}>
            <TouchableOpacity
              onPress={handleCreateAccount}
              accessibilityRole="button"
              style={[localStyles.createAccountButton, { borderColor: colors.primary }]}
            >
              <Text style={[localStyles.createAccountText, { color: colors.primary }]}>{t('auth.createAccount')}</Text>
            </TouchableOpacity>

            <View style={localStyles.footerLogoContainer}>
              <Text style={{ color: colors.textSecondary, fontWeight: 'bold' }}>{t('auth.appName')}</Text>
            </View>
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const localStyles = StyleSheet.create({
  topContent: {
    flex: 1,
    justifyContent: 'center',
    paddingTop: 60,
  },
  logo: {
    width: 80,
    height: 80,
    borderRadius: 20,
  },

  bottomContainer: {
    ...formLayout.auth,
    padding: spacing.l,
    paddingBottom: Platform.OS === 'ios' ? 0 : spacing.l,
    alignItems: 'center',
  },
  createAccountButton: {
    width: '100%',
    paddingVertical: 12,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
    marginBottom: spacing.l,
  },
  createAccountText: {
    ...typography.body,
    fontWeight: '600',
  },
  footerLogoContainer: {
    marginTop: spacing.s,
    alignItems: 'center',
    opacity: 0.6,
  },
  eyeIcon: {
    position: 'absolute',
    right: 4,
    bottom: 3,
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
