import React from 'react';
import { View, StyleSheet, Text, TouchableOpacity } from 'react-native';
import { Edit2, Trash2 } from 'lucide-react-native';
import { DailyMealItem } from '../types';
import { useMealItems } from '../hooks/useNutritionData';
import { useNutritionStyles } from '../../../hooks/useNutritionStyles';
import { useTranslation } from 'react-i18next';

interface MealRowProps {
  item: DailyMealItem;
  onCheck: () => void;
  onEdit: () => void;
  onCopy: () => void;
  onDelete?: () => void;
  onSkip?: () => void;
  showMacros?: boolean;
}

export const MealRow: React.FC<MealRowProps> = ({ item, onEdit, onCopy, onDelete, showMacros = true }) => {
  const { t } = useTranslation();
  const { styles: dynamicStyles, colors: themeColors, isDark } = useNutritionStyles();
  const isPending = item.status === 'pending';
  const hasLog = !!item.log?.id;

  const macros = isPending ? item.targetMacros || item.macros : item.macros;

  // Load ingredients if we have a log
  const { data: ingredients } = useMealItems(item.log?.id);

  return (
    <View
      style={[
        styles.container,
        dynamicStyles.border,
        { borderBottomColor: isDark ? 'rgba(255,255,255,0.1)' : '#F0F0F0' },
      ]}
    >
      <View style={styles.info}>
        <TouchableOpacity
          onPress={onCopy}
          accessibilityRole="button"
          accessibilityLabel={t('nutrition.copyMealAccessibility', { mealName: item.displayName })}
          style={styles.nameButton}
        >
          <Text style={[styles.name, { color: themeColors.textPrimary }]}>{item.displayName}</Text>
        </TouchableOpacity>
        <View style={styles.macros}>
          <Text style={[styles.kcalText, { color: themeColors.textPrimary }]}>
            {Math.round(macros.kcal)}
            {t('nutrition.kcal')}
          </Text>
          {showMacros && (
            <Text style={[styles.macroDetails, { color: themeColors.textSecondary }]}>
              {Math.round(macros.protein_g)}P {Math.round(macros.carbs_g)}C {Math.round(macros.fats_g)}G
            </Text>
          )}
        </View>

        {/* Show ingredients if showMacros is true and we have ingredients */}
        {showMacros && ingredients && ingredients.length > 0 && (
          <View style={styles.ingredientsContainer}>
            {ingredients.map((ing, idx) => (
              <Text key={idx} style={[styles.ingredientText, { color: themeColors.textSecondary }]}>
                • {ing.localized_name || ing.name} {ing.quantity_g ? `(${ing.quantity_g}g)` : ''}
              </Text>
            ))}
          </View>
        )}
      </View>

      <View style={styles.actions}>
        <TouchableOpacity
          onPress={onEdit}
          style={[styles.iconButton, { backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : '#F5F5F5' }]}
        >
          <Edit2 size={16} color={themeColors.textSecondary} />
        </TouchableOpacity>
        {hasLog && onDelete && (
          <TouchableOpacity
            onPress={onDelete}
            style={[styles.iconButton, { backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : '#F5F5F5' }]}
          >
            <Trash2 size={16} color={themeColors.danger} />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  info: {
    flex: 1,
  },
  nameButton: {
    alignSelf: 'flex-start',
    minHeight: 24,
    justifyContent: 'center',
  },
  name: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
    marginBottom: 4,
  },
  macros: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  kcalText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#000',
    marginRight: 8,
  },
  macroDetails: {
    fontSize: 13,
    color: '#888',
    fontWeight: '400',
  },
  ingredientsContainer: {
    marginTop: 6,
    paddingLeft: 4,
  },
  ingredientText: {
    fontSize: 12,
    color: '#666',
    marginBottom: 2,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  iconButton: {
    padding: 8,
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
  },
});
