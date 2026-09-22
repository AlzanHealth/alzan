import React from 'react';
import { formLayout } from '../../components/common/formLayout';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { spacing, typography, borderRadius, shadows } from '../../theme';
import { useTheme } from '../../context/ThemeContext';
import { Check, Moon, Sun, Smartphone } from 'lucide-react-native';
import { TouchableOpacity } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';

export const AppearanceSettingsScreen = () => {
  const { t } = useTranslation();
  const { colors, themePreference, setTheme, isDark } = useTheme();

  // Dynamic styles based on theme
  const dynamicStyles = {
    container: { backgroundColor: colors.background },
    card: { backgroundColor: isDark ? colors.surfaceSolid : colors.white },
    sectionHeader: { color: colors.textSecondary },
    themeOptionSelected: { backgroundColor: colors.selectedOptionBackground },
    themeLabel: { color: colors.textPrimary },
    placeholderText: { color: colors.textSecondary },
    checkCircle: { backgroundColor: colors.primary },
  };

  return (
    <LinearGradient
      colors={[colors.gradientStart || colors.background, colors.gradientEnd || colors.background]}
      style={styles.container}
    >
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <ScrollView contentContainerStyle={styles.content}>
          {/* Theme Section */}
          <View style={styles.section}>
            <Text style={[styles.sectionHeader, dynamicStyles.sectionHeader]}>{t('settings.modeAllCaps')}</Text>
            <View style={[styles.card, dynamicStyles.card]}>
              <TouchableOpacity
                style={[
                  styles.themeOption,
                  themePreference === 'light' && [styles.themeOptionSelected, dynamicStyles.themeOptionSelected],
                ]}
                onPress={() => setTheme('light')}
                accessibilityRole="radio"
                accessibilityState={{ checked: themePreference === 'light' }}
              >
                <Sun size={24} color={themePreference === 'light' ? colors.primary : colors.textSecondary} />
                <Text
                  style={[
                    styles.themeLabel,
                    dynamicStyles.themeLabel,
                    themePreference === 'light' && styles.themeLabelSelected,
                  ]}
                >
                  {t('settings.light')}
                </Text>
                {themePreference === 'light' && (
                  <View style={[styles.checkCircle, dynamicStyles.checkCircle]}>
                    <Check size={14} color={colors.white} />
                  </View>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.themeOption,
                  themePreference === 'dark' && [styles.themeOptionSelected, dynamicStyles.themeOptionSelected],
                ]}
                onPress={() => setTheme('dark')}
                accessibilityRole="radio"
                accessibilityState={{ checked: themePreference === 'dark' }}
              >
                <Moon size={24} color={themePreference === 'dark' ? colors.primary : colors.textSecondary} />
                <Text
                  style={[
                    styles.themeLabel,
                    dynamicStyles.themeLabel,
                    themePreference === 'dark' && styles.themeLabelSelected,
                  ]}
                >
                  {t('settings.dark')}
                </Text>
                {themePreference === 'dark' && (
                  <View style={[styles.checkCircle, dynamicStyles.checkCircle]}>
                    <Check size={14} color={colors.white} />
                  </View>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.themeOption,
                  themePreference === 'system' && [styles.themeOptionSelected, dynamicStyles.themeOptionSelected],
                ]}
                onPress={() => setTheme('system')}
                accessibilityRole="radio"
                accessibilityState={{ checked: themePreference === 'system' }}
              >
                <Smartphone size={24} color={themePreference === 'system' ? colors.primary : colors.textSecondary} />
                <Text
                  style={[
                    styles.themeLabel,
                    dynamicStyles.themeLabel,
                    themePreference === 'system' && styles.themeLabelSelected,
                  ]}
                >
                  {t('settings.system')}
                </Text>
                {themePreference === 'system' && (
                  <View style={[styles.checkCircle, dynamicStyles.checkCircle]}>
                    <Check size={14} color={colors.white} />
                  </View>
                )}
              </TouchableOpacity>
            </View>
          </View>

          {/* Accessibility Section (Placeholder) */}
          <View style={styles.section}>
            <Text style={[styles.sectionHeader, dynamicStyles.sectionHeader]}>
              {t('settings.accessibilityAllCaps')}
            </Text>
            <View style={[styles.card, dynamicStyles.card]}>
              <Text style={[styles.placeholderText, dynamicStyles.placeholderText]}>
                {t('settings.accessibilityComingSoon')}
              </Text>
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    // Background handled by LinearGradient
  },
  safeArea: {
    flex: 1,
  },
  content: {
    ...formLayout.settings,
    padding: spacing.m,
    paddingBottom: 120,
  },
  section: {
    marginBottom: spacing.l,
  },
  sectionHeader: {
    ...typography.caption,
    marginBottom: spacing.s,
    marginLeft: spacing.xs,
  },
  card: {
    borderRadius: borderRadius.m,
    padding: spacing.m,
    ...shadows.soft,
  },
  themeOption: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.m,
    paddingHorizontal: spacing.s,
    borderRadius: borderRadius.s,
    gap: spacing.m,
    marginBottom: spacing.xs,
  },
  themeOptionSelected: {},
  themeLabel: {
    flex: 1,
    fontSize: 16,
  },
  themeLabelSelected: {
    fontWeight: '600',
  },
  checkCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderText: {
    fontSize: 14,
    fontStyle: 'italic',
    textAlign: 'center',
    paddingVertical: spacing.m,
  },
});
