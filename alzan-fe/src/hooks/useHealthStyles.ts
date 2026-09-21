import { useMemo } from 'react';
import { useTheme } from '../context/ThemeContext';

export type HealthStyles = ReturnType<typeof useHealthStyles>['styles'];

/**
 * Hook that provides consistent dynamic styles for all health screens
 * Works with useTheme to provide dark mode support
 */
export const useHealthStyles = () => {
  const { colors: themeColors, isDark } = useTheme();
  const colors = useMemo(
    () => ({ ...themeColors, textSecondary: isDark ? '#AEAEB6' : '#5C5C63' }),
    [themeColors, isDark],
  );

  const styles = useMemo(
    () => ({
      // Container styles
      container: { backgroundColor: colors.background },
      gradientColors: isDark ? ([colors.background, colors.surfaceSolid] as const) : (['#F2F5F9', '#EFF2F7'] as const),

      // Card styles
      card: { backgroundColor: isDark ? colors.surfaceSolid : colors.white },
      glassCard: {
        backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.9)',
        borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.5)',
      },

      // Text styles
      headerTitle: { color: colors.textPrimary },
      sectionTitle: { color: colors.textPrimary },
      title: { color: colors.textPrimary },
      subtitle: { color: colors.textSecondary },
      label: { color: colors.textPrimary },
      sublabel: { color: colors.textSecondary },

      // Input styles
      input: {
        backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : colors.white,
        borderColor: isDark ? 'rgba(255,255,255,0.1)' : colors.border,
        color: colors.textPrimary,
      },
      inputPlaceholder: colors.textSecondary,

      // Interactive elements
      iconContainer: { backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : colors.background },
      divider: { backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : colors.border },

      // Modal / Sheet styles
      modalOverlay: { backgroundColor: 'rgba(0, 0, 0, 0.5)' },
      modalContent: { backgroundColor: isDark ? colors.surfaceSolid : colors.white },
      sheetContent: { backgroundColor: isDark ? colors.surfaceSolid : colors.white },

      // Button styles
      primaryButton: { backgroundColor: colors.primary },
      secondaryButton: {
        backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : colors.background,
        borderColor: colors.border,
      },
      dangerButton: { backgroundColor: isDark ? 'rgba(255,69,58,0.15)' : '#FFF5F5' },

      // Chip / Badge styles
      chip: {
        backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : '#F2F2F7',
      },
      chipActive: {
        backgroundColor: colors.primary + '15',
        borderColor: colors.primary,
      },
      chipText: { color: isDark ? colors.textPrimary : '#3C3C43' },
      chipTextActive: { color: colors.primary },

      // Empty state
      emptyState: {
        backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)',
      },
      emptyStateText: { color: colors.textSecondary },

      // Misc
      chevron: { color: colors.textSecondary },
      border: { borderColor: colors.border },
    }),
    [colors, isDark],
  );

  return { styles, colors, isDark };
};
