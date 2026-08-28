import React, { useCallback } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Check, Pencil } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { format, parseISO } from 'date-fns';

import {
  formatShoppingQuantity,
  getShoppingPurchaseQuantity,
  type ShoppingListIngredient,
} from '../services/shoppingListPlanner';

type ShoppingListIngredientRowProps = {
  item: ShoppingListIngredient;
  isCompleted: boolean;
  disabled: boolean;
  isLast: boolean;
  colors: {
    border: string;
    primary: string;
    surfaceSolid: string;
    textPrimary: string;
    textSecondary: string;
    white: string;
  };
  onToggle: (key: string) => void;
  onAdjust: (item: ShoppingListIngredient) => void;
};

export const ShoppingListIngredientRow = ({
  item,
  isCompleted,
  disabled,
  isLast,
  colors,
  onToggle,
  onAdjust,
}: ShoppingListIngredientRowProps) => {
  const { t } = useTranslation();
  const handlePress = useCallback(() => onToggle(item.key), [item.key, onToggle]);
  const sourceLabels = (item.sources || []).map(source => {
    const mealLabel = source.mealName || (source.mealType ? String(t(`settings.${source.mealType}` as never)) : null);
    return `${mealLabel || t('nutrition.shoppingListUnknownMeal')} · ${format(parseISO(source.date), 'd MMM')}`;
  });
  return (
    <View
      style={[
        styles.row,
        isLast && styles.lastRow,
        { backgroundColor: colors.surfaceSolid, borderBottomColor: colors.border },
      ]}
    >
      <TouchableOpacity
        style={styles.checkTarget}
        onPress={handlePress}
        disabled={disabled}
        activeOpacity={0.75}
        accessibilityRole="checkbox"
        accessibilityLabel={`${item.name}, ${formatShoppingQuantity(getShoppingPurchaseQuantity(item))}`}
        accessibilityState={{ checked: isCompleted, disabled }}
      >
        <View
          style={[styles.checkbox, { borderColor: colors.primary }, isCompleted && { backgroundColor: colors.primary }]}
        >
          {isCompleted && <Check size={15} color={colors.white} strokeWidth={3} />}
        </View>
        <View style={styles.copy}>
          <Text style={[styles.name, { color: colors.textPrimary }, isCompleted && styles.completedText]}>
            {item.name}
          </Text>
          <Text style={[styles.needed, { color: colors.textSecondary }]}>
            {formatShoppingQuantity(item.quantity_g)}{' '}
            {item.purchase_quantity_g && item.purchase_quantity_g !== item.quantity_g
              ? `· ${formatShoppingQuantity(item.purchase_quantity_g)} ${t('nutrition.shoppingListPurchaseQuantity')}`
              : ''}
          </Text>
          {sourceLabels.length > 0 && (
            <Text style={[styles.sources, { color: colors.textSecondary }]} numberOfLines={2}>
              {t('nutrition.shoppingListUsedIn', { meals: sourceLabels.join(' · ') })}
            </Text>
          )}
        </View>
      </TouchableOpacity>
      <View style={styles.actions}>
        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => onAdjust(item)}
          disabled={disabled}
          accessibilityRole="button"
          accessibilityLabel={`${t('nutrition.shoppingListAdjustQuantity')} ${item.name}`}
        >
          <Pencil size={15} color={colors.primary} />
          <Text style={[styles.actionText, { color: colors.primary }]}>{t('nutrition.shoppingListAdjustShort')}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  row: {
    minHeight: 76,
    paddingHorizontal: 16,
    paddingVertical: 9,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  lastRow: { borderBottomWidth: 0, borderBottomLeftRadius: 18, borderBottomRightRadius: 18 },
  checkTarget: { flex: 1, minHeight: 56, flexDirection: 'row', alignItems: 'center' },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 8,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  copy: { flex: 1 },
  name: { fontSize: 16, fontWeight: '600' },
  needed: { fontSize: 12, marginTop: 3 },
  sources: { fontSize: 11, marginTop: 3 },
  completedText: { opacity: 0.52, textDecorationLine: 'line-through' },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  actionButton: {
    minWidth: 40,
    minHeight: 44,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  actionText: { fontSize: 10, fontWeight: '700' },
});
