import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { TrendingUp, Plus } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { useNutritionStyles } from '../../../hooks/useNutritionStyles';
import { borderRadius } from '../../../theme';
import { MealType } from '../../../types/requests.types';
import { usePersonalFoodTrends } from '../hooks/usePersonalFoodTrends';
import { MealComponent } from '../types/ingredients';

interface PersonalFoodTrendsProps {
  mealType?: MealType;
  onPick: (food: MealComponent) => void;
}

/**
 * Horizontal row of the user's most-used recipes and foods.
 */
export const PersonalFoodTrends: React.FC<PersonalFoodTrendsProps> = ({ mealType, onPick }) => {
  const { t } = useTranslation();
  const { colors: themeColors, isDark } = useNutritionStyles();
  const { data: trends } = usePersonalFoodTrends(mealType);

  if (!trends || trends.length === 0) return null;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TrendingUp size={15} color={themeColors.primary} strokeWidth={2.4} />
        <Text style={[styles.title, { color: themeColors.textSecondary }]}>{t('nutrition.trendsForYou')}</Text>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipRow}
        keyboardShouldPersistTaps="handled"
      >
        {trends.map(food => {
          const isRecipe = food.itemType === 'recipe';
          const kcal = Math.round(food.calculated_macros?.kcal ?? 0);
          const portion = food.amount_g ?? 100;
          return (
            <TouchableOpacity
              key={food.id}
              onPress={() => onPick(food)}
              activeOpacity={0.7}
              style={[
                styles.chip,
                {
                  backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
                  borderColor: themeColors.primary + '33',
                },
              ]}
            >
              <View style={styles.chipTextBlock}>
                <Text style={[styles.chipName, { color: themeColors.textPrimary }]} numberOfLines={1}>
                  {food.name}
                </Text>
                <Text style={[styles.chipMeta, { color: themeColors.textSecondary }]} numberOfLines={1}>
                  {isRecipe
                    ? t('nutrition.recipeTrendChipMeta', { kcal: Math.round(food.kcal_100 ?? 0) })
                    : t('nutrition.trendChipMeta', { portion, kcal })}
                </Text>
              </View>
              <View style={[styles.chipAdd, { backgroundColor: themeColors.primary + '22' }]}>
                <Plus size={14} color={themeColors.primary} strokeWidth={2.6} />
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: 14,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
    paddingHorizontal: 2,
  },
  title: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  chipRow: {
    gap: 8,
    paddingRight: 8,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    paddingLeft: 12,
    paddingRight: 8,
    borderRadius: borderRadius.l,
    borderWidth: 1,
    maxWidth: 220,
  },
  chipTextBlock: {
    flexShrink: 1,
  },
  chipName: {
    fontSize: 14,
    fontWeight: '600',
  },
  chipMeta: {
    fontSize: 12,
    marginTop: 1,
  },
  chipAdd: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
