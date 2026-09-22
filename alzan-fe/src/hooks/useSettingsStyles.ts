import { useMemo } from 'react';
import { useTheme } from '../context/ThemeContext';

export type Styles = ReturnType<typeof useSettingsStyles>['styles'];
/**
 * Hook that provides common dynamic styles for settings screens
 * Use this to ensure consistent dark mode styling across all settings screens
 */
export const useSettingsStyles = () => {
  const { colors: themeColors, isDark } = useTheme();
  const colors = useMemo(
    () => ({ ...themeColors, textSecondary: isDark ? '#AEAEB6' : '#5C5C63' }),
    [themeColors, isDark],
  );

  const styles = useMemo(
    () => ({
      // Container styles
      container: { backgroundColor: colors.background },
      gradientColors: isDark
        ? ([colors.background, colors.surfaceSolid || '#1C1C1E'] as const)
        : (['#F2F5F9', '#EFF2F7'] as const),

      // Card styles
      card: { backgroundColor: isDark ? colors.surfaceSolid : colors.white },
      glassCard: {
        backgroundColor: isDark ? colors.surfaceSolid : 'rgba(255,255,255,0.9)',
        borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.5)',
      },

      // Text styles
      headerTitle: { color: colors.textPrimary },
      sectionHeader: { color: colors.textSecondary },
      label: { color: colors.textPrimary },
      sublabel: { color: colors.textSecondary },

      // Input styles
      input: {
        backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : colors.background,
        color: colors.textPrimary,
      },
      inputPlaceholder: colors.textSecondary,
      disabledInput: { color: colors.textSecondary },

      // Interactive elements
      iconContainer: { backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : colors.background },
      optionSelected: { backgroundColor: isDark ? 'rgba(59,130,246,0.2)' : '#E8F4FD' },
      divider: { backgroundColor: colors.border },

      // Modal styles
      modalOverlay: { backgroundColor: 'rgba(0, 0, 0, 0.5)' },
      modalContent: { backgroundColor: isDark ? colors.surfaceSolid : colors.white },

      // Button styles
      primaryButton: { backgroundColor: colors.primary },
      dangerButton: { backgroundColor: isDark ? 'rgba(255,69,58,0.15)' : '#FFF5F5' },

      // Misc
      chevron: { color: colors.textSecondary },
    }),
    [colors, isDark],
  );

  return { styles, colors, isDark };
};
