import React, { useState } from 'react';
import { formLayout } from '../../components/common/formLayout';
import { View, Text, TextInput, KeyboardAvoidingView, Platform, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { AuthScreenNavigationProp } from '../../types/navigation.types';
import { typography, spacing } from '../../theme';
import { PrimaryButton } from '../../components/PrimaryButton';
import { useAuthStyles } from '../../hooks/useAuthStyles';
import { useTranslation } from 'react-i18next';

export const SignUpEmailScreen = () => {
  const { t } = useTranslation();
  const navigation = useNavigation<AuthScreenNavigationProp>();
  const { styles, colors } = useAuthStyles();
  const [email, setEmail] = useState('');

  const handleNext = () => {
    if (!email) return;
    navigation.navigate('SignUpPassword', { email });
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.container}>
      <View style={localStyles.content}>
        <Text style={[typography.h1, { color: colors.textPrimary, marginBottom: spacing.s }]}>
          {t('auth.whatIsYourEmail')}
        </Text>
        <Text style={[typography.body, { color: colors.textSecondary, marginBottom: spacing.xl }]}>
          {t('auth.contactEmailInstructions')}
        </Text>

        <View style={styles.inputContainer}>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            placeholder={t('auth.email')}
            placeholderTextColor={colors.textSecondary}
            autoFocus={true}
          />
        </View>

        <PrimaryButton title={t('common.next')} onPress={handleNext} style={styles.button} disabled={!email} />
      </View>
    </KeyboardAvoidingView>
  );
};

const localStyles = StyleSheet.create({
  header: {
    paddingHorizontal: spacing.m,
    paddingTop: spacing.xl, // Adjust for safe area if needed
    marginBottom: spacing.m,
  },
  content: {
    ...formLayout.auth,
    flex: 1,
    paddingHorizontal: spacing.l,
  },
});
