import React, { useState } from 'react';
import { ScrollView, TextInput, Text } from 'react-native';
import { supabase } from '../../lib/supabaseClient';
import { PrimaryButton } from '../../components/PrimaryButton';

import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../../types/navigation.types';

import { useAuth } from '../../context/AuthContext';
import { Alert } from '../../components/common/Alert';
import { useTranslation } from 'react-i18next';
import { useAuthStyles } from '../../hooks/useAuthStyles';
import { FormError } from '../../components/common/FormError';

export const ResetPasswordScreen = () => {
  const { t } = useTranslation();
  const navigation = useNavigation<StackNavigationProp<RootStackParamList>>();
  const { setIsPasswordRecovery } = useAuth();
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const { styles, colors } = useAuthStyles();

  const handleUpdatePassword = async () => {
    if (loading) return;
    setFormError(null);
    setLoading(true);
    try {
      if (password.length < 8) {
        setFormError(t('auth.passwordMinLengthError'));
        return;
      }

      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;

      Alert.alert(t('common.done'), t('auth.passwordUpdatedSuccess'), [
        {
          text: t('common.ok'),
          onPress: () => {
            // Si estamos en el stack logueado, vamos a Home/Main
            setIsPasswordRecovery(false);
            navigation.navigate('Main');
          },
        },
      ]);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : t('auth.unknownError');
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
      <Text style={styles.title}>{t('auth.newPassword')}</Text>
      <TextInput
        placeholder={t('auth.setNewPassword')}
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoCapitalize="none"
        placeholderTextColor={colors.textSecondary}
        style={styles.input}
      />
      <FormError message={formError} />
      <PrimaryButton title={t('auth.savePassword')} onPress={handleUpdatePassword} loading={loading} />
    </ScrollView>
  );
};
