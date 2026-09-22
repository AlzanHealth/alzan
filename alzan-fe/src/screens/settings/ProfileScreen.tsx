import React, { useEffect, useState } from 'react';
import { formLayout } from '../../components/common/formLayout';
import { View, Text, StyleSheet, TextInput, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../../context/ThemeContext';
import { colors, spacing, typography, borderRadius, shadows } from '../../theme';
import { useProfile } from '../../hooks/settings/useProfile';
import { isValid, parse, format } from 'date-fns';
import { User } from '../../types/requests.types';
import { Alert } from '../../components/common/Alert';
import { useTranslation } from 'react-i18next';

export const ProfileScreen = () => {
  const { t } = useTranslation();
  const { colors: themeColors } = useTheme();
  const { profile, loading, updating, updateProfile } = useProfile();

  const [displayName, setDisplayName] = useState('');
  const [dob, setDob] = useState('');
  const [height, setHeight] = useState('');
  const [sex, setSex] = useState<User['sex']>('prefer_not_to_say');

  // Populate form when profile loads
  useEffect(() => {
    if (profile) {
      setDisplayName(profile.display_name || '');
      setDob(profile.date_of_birth || '');
      setHeight(profile.height_cm ? profile.height_cm.toString() : '');
      setSex(profile.sex || 'prefer_not_to_say');
    }
  }, [profile]);

  const handleSave = async () => {
    // Validation
    const heightNum = parseInt(height, 10);
    if (height && (isNaN(heightNum) || heightNum < 100 || heightNum > 250)) {
      Alert.alert(t('common.error'), t('onboarding.validHeightRange'));
      return;
    }

    if (dob) {
      const parsedDate = parse(dob, 'yyyy-MM-dd', new Date());
      if (!isValid(parsedDate)) {
        Alert.alert(t('common.error'), t('settings.invalidDateFormatYmd'));
        return;
      }
      if (parsedDate > new Date()) {
        Alert.alert(t('common.error'), t('settings.birthDateFutureError'));
        return;
      }
    }

    const success = await updateProfile({
      display_name: displayName,
      date_of_birth: dob || null,
      height_cm: height ? heightNum : null,
      sex,
    });

    if (success) {
      Alert.alert(t('common.done'), t('settings.profileUpdatedSuccess'));
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const handleDateChange = (text: string) => {
    // Strip non-numeric chars
    const cleaned = text.replace(/[^0-9]/g, '');

    let formatted = cleaned;
    if (cleaned.length > 4) {
      formatted = cleaned.slice(0, 4) + '-' + cleaned.slice(4);
    }
    if (cleaned.length > 6) {
      formatted = formatted.slice(0, 7) + '-' + formatted.slice(7);
    }

    // Limit to YYYY-MM-DD length (10 chars)
    if (formatted.length > 10) {
      formatted = formatted.slice(0, 10);
    }

    setDob(formatted);
  };

  return (
    <LinearGradient
      colors={[themeColors.gradientStart || themeColors.background, themeColors.gradientEnd || themeColors.background]}
      style={styles.container}
    >
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.section}>
            <Text style={styles.label}>{t('settings.displayName')}</Text>
            <TextInput
              style={styles.input}
              value={displayName}
              onChangeText={setDisplayName}
              placeholder={t('settings.yourName')}
            />
          </View>

          <View style={styles.section}>
            <Text style={styles.label}>{t('settings.emailReadOnly')}</Text>
            <TextInput style={[styles.input, styles.disabledInput]} value={profile?.email || ''} editable={false} />
          </View>

          <View style={styles.section}>
            <Text style={styles.label}>{t('settings.birthDateFmt')}</Text>
            <TextInput
              style={styles.input}
              value={dob}
              onChangeText={handleDateChange}
              placeholder="YYYY-MM-DD"
              keyboardType="numeric"
              maxLength={10}
            />
          </View>

          <View style={styles.section}>
            <Text style={styles.label}>{t('onboarding.sex')}</Text>
            <View style={styles.sexContainer}>
              {(['male', 'female', 'other', 'prefer_not_to_say'] as const).map(option => (
                <TouchableOpacity
                  key={option}
                  style={[styles.sexOption, sex === option && styles.sexOptionSelected]}
                  onPress={() => setSex(option)}
                >
                  <Text style={[styles.sexText, sex === option && styles.sexTextSelected]}>
                    {option === 'male'
                      ? t('settings.genderMale')
                      : option === 'female'
                        ? t('settings.genderFemaleAlt')
                        : option === 'other'
                          ? t('constants.other')
                          : t('settings.preferNotToSay')}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.label}>{t('onboarding.heightCm')}</Text>
            <TextInput
              style={styles.input}
              value={height}
              onChangeText={setHeight}
              placeholder="175"
              keyboardType="numeric"
            />
          </View>

          <View style={styles.section}>
            <Text style={styles.infoText}>
              {t('settings.memberSince')}
              {profile?.created_at ? format(new Date(profile.created_at), 'dd/MM/yyyy') : '-'}
            </Text>
          </View>

          <TouchableOpacity
            style={[styles.button, updating && styles.buttonDisabled]}
            onPress={handleSave}
            disabled={updating}
          >
            {updating ? (
              <ActivityIndicator color={colors.white} />
            ) : (
              <Text style={styles.buttonText}>{t('settings.saveChanges')}</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    // backgroundColor: colors.background, // Removed for gradient
  },
  safeArea: {
    flex: 1,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    ...formLayout.settings,
    padding: spacing.m,
  },
  section: {
    marginBottom: spacing.l,
  },
  label: {
    ...typography.body,
    fontWeight: '600',
    marginBottom: spacing.s,
    color: colors.textPrimary,
  },
  input: {
    backgroundColor: colors.white,
    borderRadius: borderRadius.m,
    padding: spacing.m,
    fontSize: 16,
    color: colors.textPrimary,
    ...shadows.soft,
  },
  disabledInput: {
    backgroundColor: colors.surface,
    color: colors.textSecondary,
  },
  sexContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.s,
  },
  sexOption: {
    paddingVertical: spacing.s,
    paddingHorizontal: spacing.m,
    borderRadius: borderRadius.full,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sexOptionSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  sexText: {
    color: colors.textPrimary,
    fontSize: 14,
  },
  sexTextSelected: {
    color: colors.white,
    fontWeight: '600',
  },
  button: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.m,
    paddingVertical: spacing.m,
    alignItems: 'center',
    marginTop: spacing.m,
    ...shadows.soft,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: '600',
  },
  infoText: {
    ...typography.caption,
    textAlign: 'center',
    marginTop: spacing.s,
  },
});
