import { useMemo } from 'react';
import { StyleSheet } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { typography, spacing, borderRadius } from '../theme';
import { formLayout } from '../components/common/formLayout';

export type AuthColors = ReturnType<typeof useAuthStyles>['colors'];

export const useAuthStyles = () => {
  const { colors: themeColors, isDark } = useTheme();
  const colors = useMemo(
    () => ({ ...themeColors, textSecondary: isDark ? '#AEAEB6' : '#5C5C63' }),
    [themeColors, isDark],
  );

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: {
          flex: 1,
          backgroundColor: colors.background,
        },
        scrollContent: {
          ...formLayout.auth,
          flexGrow: 1,
          justifyContent: 'center',
          padding: spacing.l,
        },
        header: {
          alignItems: 'center',
          marginBottom: spacing.xl,
        },
        // For screens with a back button and title in a row
        headerRow: {
          flexDirection: 'row',
          alignItems: 'center',
          marginBottom: spacing.xl,
        },
        title: {
          ...typography.h1,
          color: colors.textPrimary,
          marginBottom: spacing.s,
        },
        subtitle: {
          ...typography.body,
          color: colors.textSecondary,
          textAlign: 'center',
        },
        formCard: {
          padding: spacing.l,
        },
        inputContainer: {
          marginBottom: spacing.m,
        },
        label: {
          ...typography.caption,
          marginBottom: spacing.xs,
          marginLeft: spacing.xs,
          color: colors.textSecondary,
        },
        input: {
          minHeight: 50,
          backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(255, 255, 255, 0.5)',
          borderRadius: borderRadius.m,
          padding: spacing.m,
          fontSize: 16,
          color: colors.textPrimary,
          borderWidth: 1,
          borderColor: colors.textSecondary,
        },
        inputPlaceholder: {
          color: colors.textSecondary,
        },
        button: {
          marginTop: spacing.m,
        },
        switchButton: {
          marginTop: spacing.s,
          backgroundColor: 'transparent',
        },
        forgotPasswordButton: {
          minHeight: 44,
          justifyContent: 'center',
          alignItems: 'center',
          paddingVertical: spacing.s,
        },
        forgotPasswordText: {
          ...typography.caption,
          color: colors.primary,
        },
        socialContainer: {
          marginTop: spacing.l,
          marginBottom: spacing.s,
        },
        divider: {
          flexDirection: 'row',
          alignItems: 'center',
          marginBottom: spacing.m,
        },
        line: {
          flex: 1,
          height: 1,
          backgroundColor: colors.border,
        },
        orText: {
          ...typography.caption,
          marginHorizontal: spacing.s,
          color: colors.textSecondary,
        },
        socialButton: {
          marginBottom: spacing.s,
          borderColor: colors.border,
        },
        backButton: {
          minWidth: 44,
          minHeight: 44,
          justifyContent: 'center',
          marginRight: spacing.m,
        },
        description: {
          ...typography.body,
          color: colors.textSecondary,
          marginBottom: spacing.l,
        },
        // Onboarding specific (Removed)
        // Kept empty structure if needed or remove specific styles
      }),
    [colors, isDark],
  );

  return { styles, colors, isDark };
};
