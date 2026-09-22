import React, { useState } from 'react';
import { formLayout } from '../../components/common/formLayout';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { spacing, typography, borderRadius } from '../../theme';
import { useNavigation } from '@react-navigation/native';
import { SettingsScreenNavigationProp } from '../../types/navigation.types';
import { useGoals } from '../../hooks/settings/useGoals';
import { useSettingsStyles } from '../../hooks/useSettingsStyles';
import { Alert } from '../../components/common/Alert';
import { useTranslation } from 'react-i18next';
import { TranslationKey } from '../../i18n/locales/en';

const GOAL_TYPES: Array<{ value: string; labelKey: TranslationKey }> = [
  { value: 'Running', labelKey: 'constants.running' },
  { value: 'Fuerza', labelKey: 'constants.strength' },
  { value: 'Salud', labelKey: 'tabs.health' },
  { value: 'Otro', labelKey: 'constants.other' },
];

export const GoalsDetailScreen = () => {
  const { t } = useTranslation();
  const navigation = useNavigation<SettingsScreenNavigationProp>();
  const { addGoal } = useGoals();
  const { styles: dynamicStyles, colors: themeColors, isDark } = useSettingsStyles();
  const [type, setType] = useState(GOAL_TYPES[0].value);
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSave = async () => {
    if (!description.trim()) {
      Alert.alert(t('common.error'), t('settings.descriptionRequired'));
      return;
    }

    setSubmitting(true);
    const success = await addGoal({
      goal_type: type,
      description,
    });
    setSubmitting(false);

    if (success) {
      navigation.goBack();
    }
  };

  return (
    <LinearGradient colors={dynamicStyles.gradientColors} style={styles.container}>
      <ScrollView style={[styles.container, dynamicStyles.container]} contentContainerStyle={styles.content}>
        <View style={styles.section}>
          <Text style={[styles.label, { color: themeColors.textPrimary }]}>{t('settings.goalType')}</Text>
          <View style={styles.chipContainer}>
            {GOAL_TYPES.map(goalType => (
              <TouchableOpacity
                key={goalType.value}
                style={[
                  styles.chip,
                  {
                    backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : themeColors.white,
                    borderColor: themeColors.border,
                  },
                  type === goalType.value && {
                    backgroundColor: themeColors.primary,
                    borderColor: themeColors.primary,
                  },
                ]}
                onPress={() => setType(goalType.value)}
              >
                <Text
                  style={[
                    styles.chipText,
                    { color: themeColors.textPrimary },
                    type === goalType.value && { color: themeColors.white, fontWeight: '600' },
                  ]}
                >
                  {t(goalType.labelKey)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={[styles.label, { color: themeColors.textPrimary }]}>{t('settings.description')}</Text>
          <TextInput
            style={[styles.input, dynamicStyles.input, { color: themeColors.textPrimary }]}
            value={description}
            onChangeText={setDescription}
            placeholder={t('settings.goalPlaceholder')}
            placeholderTextColor={themeColors.textSecondary}
            multiline
          />
        </View>

        <TouchableOpacity
          style={[styles.button, submitting && styles.buttonDisabled, { backgroundColor: themeColors.primary }]}
          onPress={handleSave}
          disabled={submitting}
        >
          {submitting ? (
            <ActivityIndicator color={themeColors.white} />
          ) : (
            <Text style={[styles.buttonText, { color: themeColors.white }]}>{t('settings.saveGoal')}</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
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
  section: {
    marginBottom: spacing.l,
  },
  label: {
    ...typography.body,
    fontWeight: '600',
    marginBottom: spacing.s,
  },
  input: {
    borderRadius: borderRadius.m,
    padding: spacing.m,
    minHeight: 100,
    textAlignVertical: 'top',
    fontSize: 16,
  },
  chipContainer: {
    flexDirection: 'row',
    gap: spacing.s,
    flexWrap: 'wrap',
  },
  chip: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: borderRadius.full,
    borderWidth: 1,
  },
  chipText: {
    // color handled dynamically
  },
  button: {
    borderRadius: borderRadius.m,
    paddingVertical: spacing.m,
    alignItems: 'center',
    marginTop: spacing.xl,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '600',
  },
});
