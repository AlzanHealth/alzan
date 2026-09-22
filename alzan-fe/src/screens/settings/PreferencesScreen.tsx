import React from 'react';
import { formLayout } from '../../components/common/formLayout';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { colors, spacing, typography, borderRadius } from '../../theme';
import { usePreferences } from '../../hooks/settings/usePreferences';
import { Styles, useSettingsStyles } from '../../hooks/useSettingsStyles';
import { Check } from 'lucide-react-native';
import { ThemeColors } from '../../context/ThemeContext';
import { useTranslation } from 'react-i18next';

const PreferenceOption = ({
  label,
  selected,
  onSelect,
  themeColors,
  dynamicStyles,
}: {
  label: string;
  selected: boolean;
  onSelect: () => void;
  themeColors: ThemeColors;
  dynamicStyles: Styles;
}) => (
  <TouchableOpacity
    style={[
      styles.option,
      { backgroundColor: dynamicStyles.card.backgroundColor, borderColor: 'transparent' },
      selected && [styles.optionSelected, dynamicStyles.optionSelected, { borderColor: themeColors.primary }],
    ]}
    onPress={onSelect}
    accessibilityRole="radio"
    accessibilityState={{ checked: selected }}
  >
    <Text
      style={[
        styles.optionText,
        { color: themeColors.textPrimary },
        selected && [styles.optionTextSelected, { color: themeColors.primary }],
      ]}
    >
      {label}
    </Text>
    {selected && <Check size={16} color={themeColors.primary} />}
  </TouchableOpacity>
);

export const PreferencesScreen = () => {
  const { t } = useTranslation();
  const { preferences, loading, updatePreferences } = usePreferences();
  const { styles: dynamicStyles, colors: themeColors, isDark } = useSettingsStyles();

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={themeColors.primary} />
      </View>
    );
  }

  return (
    <ScrollView style={[styles.container, dynamicStyles.container]} contentContainerStyle={styles.content}>
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: themeColors.textPrimary }]}>{t('onboarding.units')}</Text>
        <View style={[styles.card, dynamicStyles.card]}>
          <View style={styles.row}>
            <Text style={[styles.label, { color: themeColors.textPrimary }]}>{t('settings.weight')}</Text>
            <View style={[styles.selector, { backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : colors.background }]}>
              <TouchableOpacity
                style={[
                  styles.option,
                  { backgroundColor: 'transparent', padding: spacing.s, borderWidth: 0 },
                  preferences?.weight_unit === 'kg' && [styles.optionSelected, dynamicStyles.optionSelected],
                ]}
                onPress={() => updatePreferences({ weight_unit: 'kg' })}
              >
                <Text
                  style={[
                    styles.optionText,
                    { color: themeColors.textPrimary },
                    preferences?.weight_unit === 'kg' && [styles.optionTextSelected, { color: themeColors.primary }],
                  ]}
                >
                  {t('settings.kg')}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.option,
                  { backgroundColor: 'transparent', padding: spacing.s, borderWidth: 0 },
                  preferences?.weight_unit === 'lb' && [styles.optionSelected, dynamicStyles.optionSelected],
                ]}
                onPress={() => updatePreferences({ weight_unit: 'lb' })}
              >
                <Text
                  style={[
                    styles.optionText,
                    { color: themeColors.textPrimary },
                    preferences?.weight_unit === 'lb' && [styles.optionTextSelected, { color: themeColors.primary }],
                  ]}
                >
                  {t('settings.lb')}
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={[styles.divider, dynamicStyles.divider]} />

          <View style={styles.row}>
            <Text style={[styles.label, { color: themeColors.textPrimary }]}>{t('settings.distance')}</Text>
            <View style={[styles.selector, { backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : colors.background }]}>
              <TouchableOpacity
                style={[
                  styles.option,
                  { backgroundColor: 'transparent', padding: spacing.s, borderWidth: 0 },
                  preferences?.distance_unit === 'km' && [styles.optionSelected, dynamicStyles.optionSelected],
                ]}
                onPress={() => updatePreferences({ distance_unit: 'km' })}
              >
                <Text
                  style={[
                    styles.optionText,
                    { color: themeColors.textPrimary },
                    preferences?.distance_unit === 'km' && [styles.optionTextSelected, { color: themeColors.primary }],
                  ]}
                >
                  {t('settings.unitKm')}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.option,
                  { backgroundColor: 'transparent', padding: spacing.s, borderWidth: 0 },
                  preferences?.distance_unit === 'miles' && [styles.optionSelected, dynamicStyles.optionSelected],
                ]}
                onPress={() => updatePreferences({ distance_unit: 'miles' })}
              >
                <Text
                  style={[
                    styles.optionText,
                    { color: themeColors.textPrimary },
                    preferences?.distance_unit === 'miles' && [
                      styles.optionTextSelected,
                      { color: themeColors.primary },
                    ],
                  ]}
                >
                  {t('settings.mi')}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: themeColors.textPrimary }]}>{t('settings.language')}</Text>
        <View style={styles.optionsRow}>
          <PreferenceOption
            label={t('settings.langEs')}
            selected={preferences?.language_code === 'es'}
            onSelect={() => updatePreferences({ language_code: 'es' })}
            themeColors={themeColors}
            dynamicStyles={dynamicStyles}
          />
          <PreferenceOption
            label={t('settings.langEn')}
            selected={preferences?.language_code === 'en'}
            onSelect={() => updatePreferences({ language_code: 'en' })}
            themeColors={themeColors}
            dynamicStyles={dynamicStyles}
          />
        </View>
      </View>

      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: themeColors.textPrimary }]}>{t('settings.timezone')}</Text>
        <View style={[styles.card, dynamicStyles.card]}>
          <Text style={[styles.valueText, { color: themeColors.textPrimary }]}>
            {preferences?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone}
          </Text>
          <Text style={[styles.helpText, { color: themeColors.textSecondary }]}>{t('settings.autoDetected')}</Text>
        </View>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
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
    marginBottom: spacing.xl,
  },
  sectionTitle: {
    ...typography.h4,
    marginBottom: spacing.m,
  },
  optionsRow: {
    flexDirection: 'column',
    gap: spacing.s,
  },
  option: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.m,
    borderRadius: borderRadius.m,
    borderWidth: 1,
  },
  optionSelected: {
    // dynamicStyles handles background
  },
  optionText: {
    fontSize: 16,
  },
  optionTextSelected: {
    fontWeight: '600',
  },
  card: {
    padding: spacing.m,
    borderRadius: borderRadius.m,
  },
  valueText: {
    fontSize: 16,
    fontWeight: '500',
  },
  helpText: {
    marginTop: spacing.xs,
    fontSize: 14,
  },
  switchCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    padding: spacing.m,
    borderRadius: borderRadius.m,
  },
  switchLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.m,
    marginRight: spacing.m,
  },
  switchTextContainer: {
    flex: 1,
  },
  switchLabel: {
    fontSize: 16,
    fontWeight: '500',
  },
  switchDescription: {
    marginTop: spacing.xs,
    fontSize: 13,
    lineHeight: 18,
  },
  // New Styles
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.s,
  },
  label: {
    fontSize: 16,
    fontWeight: '500',
  },
  selector: {
    flexDirection: 'row',
    borderRadius: borderRadius.m,
    padding: 4,
  },
  divider: {
    height: 1,
    marginVertical: spacing.s,
  },
});
