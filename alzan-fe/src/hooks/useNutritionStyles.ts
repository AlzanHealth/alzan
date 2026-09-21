import { useMemo } from 'react';
import { useTheme } from '../context/ThemeContext';

/**
 * Hook that provides consistent dynamic styles for all nutrition screens
 * Works with useTheme to provide dark mode support
 */
export const useNutritionStyles = () => {
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

      // Card styles - Apple Liquid Glass effect with solid backgrounds for readability
      card: {
        backgroundColor: isDark ? colors.surfaceSolid : colors.white,
        shadowColor: isDark ? 'rgba(0,0,0,0.4)' : 'rgba(0,0,0,0.08)',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 1,
        shadowRadius: 8,
        elevation: 3,
      },
      glassCard: {
        // Higher opacity for better content readability - Liquid Glass style
        backgroundColor: isDark ? 'rgba(30,30,32,0.92)' : 'rgba(255,255,255,0.95)',
        borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.6)',
        borderWidth: 1,
        shadowColor: isDark ? 'rgba(0,0,0,0.5)' : 'rgba(0,0,0,0.1)',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 1,
        shadowRadius: 12,
        elevation: 4,
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

      // Day items (for Nutrition Dashboard/Home)
      dayItem: {
        backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)',
      },
      dayNumber: { color: colors.textPrimary },
      dayName: { color: colors.textSecondary },
      selectedDayItem: { backgroundColor: colors.primary },
      selectedDayText: { color: '#FFFFFF' },

      // Interactive elements
      iconContainer: { backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : colors.background },
      divider: { backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : colors.border },

      // Modal styles
      modalOverlay: { backgroundColor: 'rgba(0, 0, 0, 0.5)' },
      modalContent: { backgroundColor: isDark ? colors.surfaceSolid : colors.white },

      // Button styles
      primaryButton: { backgroundColor: colors.primary },
      secondaryButton: {
        backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : colors.background,
        borderColor: colors.border,
      },
      dangerButton: { backgroundColor: isDark ? 'rgba(255,69,58,0.15)' : '#FFF5F5' },

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
