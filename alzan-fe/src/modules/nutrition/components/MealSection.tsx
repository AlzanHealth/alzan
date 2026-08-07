import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Plus } from 'lucide-react-native';
import { DailyMealItem } from '../types';
import { MealRow } from './MealRow';
import { useNutritionStyles } from '../../../hooks/useNutritionStyles';
import { borderRadius } from '../../../theme';
import { useTranslation } from 'react-i18next';

interface MealSectionProps {
  title: string;
  meals: DailyMealItem[];
  onAdd: () => void;
  onEditMeal: (item: DailyMealItem) => void;
  onCopyMeal: (item: DailyMealItem) => void;
  onCheckMeal: (item: DailyMealItem) => void;
  onDeleteMeal?: (item: DailyMealItem) => void;
  isSecondary?: boolean;
  showMacros?: boolean;
}

export const MealSection: React.FC<MealSectionProps> = ({
  title,
  meals,
  onAdd,
  onEditMeal,
  onCopyMeal,
  onCheckMeal,
  onDeleteMeal,
  isSecondary = false,
  showMacros = true,
}) => {
  const { t } = useTranslation();
  const { styles: dynamicStyles, colors: themeColors, isDark } = useNutritionStyles();

  // Calculate totals for this section
  const totalKcal = meals.reduce(
    (acc, m) => acc + (m.status === 'pending' ? m.targetMacros?.kcal || 0 : m.macros.kcal),
    0,
  );

  return (
    <View
      style={[
        styles.container,
        isSecondary && styles.containerSecondary,
        { backgroundColor: isDark ? themeColors.surfaceSolid : isSecondary ? '#FAFAFA' : '#FFF' },
      ]}
    >
      <View style={styles.header}>
        <Text
          style={[
            styles.title,
            isSecondary && styles.titleSecondary,
            { color: isSecondary && !isDark ? '#666' : themeColors.textPrimary },
          ]}
        >
          {title}
        </Text>
        <Text style={[styles.total, isSecondary && styles.totalSecondary, { color: themeColors.textSecondary }]}>
          {Math.round(totalKcal)}
          {t('nutrition.kcal')}
        </Text>
      </View>

      {meals.map((meal, index) => (
        <View key={meal.logId || meal.templateMealId || index} style={styles.rowWrapper}>
          <MealRow
            item={meal}
            onEdit={() => onEditMeal(meal)}
            onCopy={() => onCopyMeal(meal)}
            onCheck={() => onCheckMeal(meal)}
            onDelete={onDeleteMeal ? () => onDeleteMeal(meal) : undefined}
            showMacros={showMacros}
          />
        </View>
      ))}

      <TouchableOpacity style={[styles.addButton, isSecondary && styles.addButtonSecondary]} onPress={onAdd}>
        <Plus size={isSecondary ? 16 : 18} color={isSecondary ? themeColors.textSecondary : themeColors.primary} />
        <Text
          style={[
            styles.addText,
            isSecondary && styles.addTextSecondary,
            { color: isSecondary ? themeColors.textSecondary : themeColors.primary },
          ]}
        >
          {isSecondary ? t('nutrition.addSnack') : t('nutrition.addMeal')}
        </Text>
      </TouchableOpacity>

      <View style={[styles.divider, dynamicStyles.divider]} />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: 8,
    backgroundColor: '#FFF',
    paddingHorizontal: 16,
    paddingTop: 16,
    borderRadius: borderRadius.l,
    overflow: 'hidden',
  },
  containerSecondary: {
    backgroundColor: '#FAFAFA',
    paddingTop: 12,
    paddingBottom: 4,
    marginTop: -4,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#000',
  },
  titleSecondary: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
  },
  total: {
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
  },
  totalSecondary: {
    fontSize: 12,
    color: '#999',
  },
  rowWrapper: {
    marginBottom: 0,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    marginTop: 4,
  },
  addButtonSecondary: {
    paddingVertical: 8,
    marginTop: 2,
  },
  addText: {
    color: '#007AFF',
    fontWeight: '700',
    marginLeft: 8,
    fontSize: 14,
    letterSpacing: 0.5,
  },
  addTextSecondary: {
    color: '#888',
    fontWeight: '600',
    fontSize: 12,
    letterSpacing: 0,
  },
  divider: {
    height: 1,
    backgroundColor: '#F0F0F0',
    marginTop: 8,
  },
});
