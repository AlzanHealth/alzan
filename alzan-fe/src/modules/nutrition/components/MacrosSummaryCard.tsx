// src/modules/nutrition/components/MacrosSummaryCard.tsx
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LiquidGlassFooter } from '../../../components/common/LiquidGlassFooter';
import { TAB_BAR_CLEARANCE, useTabBarLayout } from '../../../navigation/tabBarLayout';
import { useUnitConversion } from '../../../hooks/useUnitConversion';
import { useNutritionStyles } from '../../../hooks/useNutritionStyles';
import { useTranslation } from 'react-i18next';

interface MacrosSummaryCardProps {
  totals: {
    kcal: number;
    protein_g: number;
    carbs_g: number;
    fats_g: number;
  };
  itemCount: number;
  hasIncompleteData?: boolean;
}

export const MacrosSummaryCard: React.FC<MacrosSummaryCardProps> = ({
  totals,
  itemCount,
  hasIncompleteData = false,
}) => {
  const { t } = useTranslation();
  const { convertEnergyToUi } = useUnitConversion();
  const { colors, isDark } = useNutritionStyles();
  const { topFromScreenBottom, setSummaryOverlayHeight } = useTabBarLayout();
  const ingredientLabel = itemCount === 1 ? t('nutrition.ingredientSingular') : `${t('nutrition.ingredientSingular')}s`;
  const titleText = `${t('nutrition.mealWith')} ${itemCount} ${ingredientLabel}`;

  // Sit just above the MEASURED top edge of the floating tab bar (reported by
  // TabBarLayoutProvider). This adapts to any device/orientation/web/tablet
  // without hardcoding the bar height or margin, so the summary never enters
  // the tab bar zone.
  const bottomPosition = topFromScreenBottom + TAB_BAR_CLEARANCE;

  return (
    <View
      testID="nutrition-macros-summary"
      onLayout={event => {
        const { height } = event.nativeEvent.layout;
        setSummaryOverlayHeight(height);
      }}
      style={[styles.summaryFooterContainer, { bottom: bottomPosition }]}
    >
      <LiquidGlassFooter style={styles.summaryGlass} borderRadius={30}>
        <View style={styles.summaryContent}>
          <Text style={[styles.title, { color: colors.textPrimary }]}>{titleText}</Text>

          <View style={styles.macrosGrid}>
            <View style={styles.macroItem}>
              <Text style={[styles.macroValue, { color: colors.textPrimary }]}>
                {convertEnergyToUi(totals.kcal).value}
              </Text>
              <Text style={[styles.macroLabel, { color: colors.textSecondary }]}>
                {convertEnergyToUi(totals.kcal).unit.toUpperCase()}
              </Text>
            </View>

            <View style={[styles.divider, { backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)' }]} />

            <View style={styles.macroItem}>
              <Text style={[styles.macroValue, { color: '#FF6B6B' }]}>{totals.protein_g.toFixed(1)}g</Text>
              <Text style={[styles.macroLabel, { color: colors.textSecondary }]}>{t('nutrition.proteinCaps')}</Text>
            </View>

            <View style={[styles.divider, { backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)' }]} />

            <View style={styles.macroItem}>
              <Text style={[styles.macroValue, { color: '#FFA500' }]}>{totals.carbs_g.toFixed(1)}g</Text>
              <Text style={[styles.macroLabel, { color: colors.textSecondary }]}>{t('nutrition.carbsAllCaps')}</Text>
            </View>

            <View style={[styles.divider, { backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)' }]} />

            <View style={styles.macroItem}>
              <Text style={[styles.macroValue, { color: '#4ECDC4' }]}>{totals.fats_g.toFixed(1)}g</Text>
              <Text style={[styles.macroLabel, { color: colors.textSecondary }]}>{t('nutrition.fatsAllCaps')}</Text>
            </View>
          </View>

          {hasIncompleteData && <Text style={styles.warningText}>{t('nutrition.incompleteDataWarning')}</Text>}
        </View>
      </LiquidGlassFooter>
    </View>
  );
};

const styles = StyleSheet.create({
  summaryFooterContainer: {
    position: 'absolute',
    // bottom is set dynamically based on device safe area
    left: 16,
    right: 16,
    zIndex: 100,
  },
  summaryGlass: {
    borderRadius: 30,
  },
  summaryContent: {
    paddingVertical: 20,
    paddingHorizontal: 20,
  },
  title: {
    fontSize: 13,
    fontWeight: '600',
    color: '#333',
    marginBottom: 16,
    textAlign: 'center',
  },
  macrosGrid: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  macroItem: {
    alignItems: 'center',
    flex: 1,
  },
  macroValue: {
    fontSize: 20,
    fontWeight: '700',
    color: '#000',
    marginBottom: 4,
    letterSpacing: -0.5,
  },
  macroLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: '#666',
    letterSpacing: 0.5,
  },
  divider: {
    width: 1,
    height: 40,
    backgroundColor: 'rgba(0,0,0,0.1)',
  },
  warningText: {
    fontSize: 12,
    color: '#FF9500',
    textAlign: 'center',
    marginTop: 12,
  },
});
