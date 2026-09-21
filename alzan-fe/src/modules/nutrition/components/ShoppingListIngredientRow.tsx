import React, { useCallback } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Check, House, Pencil, ShoppingBasket } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { parseISO } from 'date-fns';
import { formatLocalizedDate } from '../../../i18n/dateLocale';

import {
  formatShoppingQuantity,
  getShoppingAvailableQuantity,
  getShoppingQuantityToBuy,
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
  const availableQuantity = getShoppingAvailableQuantity(item);
  const quantityToBuy = getShoppingQuantityToBuy(item);
  const isAvailableAtHome = quantityToBuy === 0;
  const statusLabel = t(
    isAvailableAtHome
      ? 'nutrition.shoppingListStatusAtHome'
      : isCompleted
        ? 'nutrition.shoppingListStatusPurchased'
        : 'nutrition.shoppingListStatusPending',
  );
  const StatusIcon = isAvailableAtHome ? House : isCompleted ? Check : ShoppingBasket;
  const handlePress = useCallback(() => {
    if (quantityToBuy > 0) onToggle(item.key);
    else onAdjust(item);
  }, [item, onAdjust, onToggle, quantityToBuy]);
  const sourceLabels = (item.sources || []).map(source => {
    const mealLabel = source.mealName || (source.mealType ? String(t(`settings.${source.mealType}` as never)) : null);
    return `${mealLabel || t('nutrition.shoppingListUnknownMeal')} · ${formatLocalizedDate(parseISO(source.date), { en: 'd MMM', es: 'd MMM' })}`;
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
        accessibilityRole={isAvailableAtHome ? 'button' : 'checkbox'}
        accessibilityLabel={`${item.name}, ${statusLabel}, ${t('nutrition.shoppingListRequiredAmount', { quantity: formatShoppingQuantity(item.quantity_g) })}, ${t('nutrition.shoppingListAvailableAmount', { quantity: formatShoppingQuantity(availableQuantity) })}, ${t(isCompleted && !isAvailableAtHome ? 'nutrition.shoppingListPurchasedAmount' : 'nutrition.shoppingListToBuy', { quantity: formatShoppingQuantity(quantityToBuy) })}`}
        accessibilityState={isAvailableAtHome ? { disabled } : { checked: isCompleted, disabled }}
      >
        <View
          style={[styles.checkbox, { borderColor: colors.primary }, isCompleted && { backgroundColor: colors.primary }]}
        >
          {isAvailableAtHome ? (
            <House size={15} color={colors.white} strokeWidth={2.5} />
          ) : isCompleted ? (
            <Check size={15} color={colors.white} strokeWidth={3} />
          ) : null}
        </View>
        <View style={styles.copy}>
          <Text style={[styles.name, { color: colors.textPrimary }, isCompleted && styles.completedText]}>
            {item.name}
          </Text>
          <View style={styles.status}>
            <StatusIcon size={14} color={colors.textSecondary} />
            <Text style={[styles.statusText, { color: colors.textSecondary }]}>{statusLabel}</Text>
          </View>
          <Text style={[styles.needed, { color: colors.textSecondary }]}>
            {t('nutrition.shoppingListRequiredAmount', { quantity: formatShoppingQuantity(item.quantity_g) })}
          </Text>
          <Text style={[styles.available, { color: colors.textSecondary }]}>
            {t('nutrition.shoppingListAvailableAmount', { quantity: formatShoppingQuantity(availableQuantity) })}
          </Text>
          <View style={[styles.amountBadge, { backgroundColor: colors.primary + (isCompleted ? '08' : '12') }]}>
            <Text style={[styles.amountText, { color: colors.textPrimary }]}>
              {t(
                isCompleted && !isAvailableAtHome
                  ? 'nutrition.shoppingListPurchasedAmount'
                  : 'nutrition.shoppingListToBuy',
                { quantity: formatShoppingQuantity(quantityToBuy) },
              )}
            </Text>
          </View>
          {sourceLabels.length > 0 && (
            <Text style={[styles.sources, { color: colors.textSecondary }]} numberOfLines={2}>
              {t('nutrition.shoppingListUsedIn', { meals: sourceLabels.join(' · ') })}
            </Text>
          )}
        </View>
      </TouchableOpacity>
      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.actionButton, { borderColor: colors.border }]}
          onPress={() => onAdjust(item)}
          disabled={disabled}
          accessibilityRole="button"
          accessibilityLabel={`${t('nutrition.shoppingListSetAvailableQuantity')} ${item.name}`}
        >
          <Pencil size={15} color={colors.primary} />
          <Text style={[styles.actionText, { color: colors.primary }]}>
            {t('nutrition.shoppingListAvailableShort')}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  row: {
    minHeight: 76,
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  lastRow: { borderBottomWidth: 0, borderBottomLeftRadius: 18, borderBottomRightRadius: 18 },
  checkTarget: { flex: 1, minWidth: 0, minHeight: 56, flexDirection: 'row', alignItems: 'flex-start' },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 8,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    marginTop: 2,
  },
  copy: { flex: 1 },
  name: { fontSize: 16, fontWeight: '600' },
  status: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 5, marginBottom: 5 },
  statusText: { fontSize: 12, fontWeight: '600', flexShrink: 1 },
  needed: { fontSize: 13, marginTop: 3, fontVariant: ['tabular-nums'] },
  available: { fontSize: 13, marginTop: 3, fontVariant: ['tabular-nums'] },
  sources: { fontSize: 12, lineHeight: 17, marginTop: 7 },
  amountBadge: { alignSelf: 'flex-start', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 5, marginTop: 7 },
  amountText: { fontSize: 13, fontWeight: '700', fontVariant: ['tabular-nums'] },
  completedText: { textDecorationLine: 'line-through', fontWeight: '400' },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  actionButton: {
    minWidth: 44,
    maxWidth: 72,
    minHeight: 44,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    borderWidth: 1,
    borderRadius: 10,
  },
  actionText: { fontSize: 12, fontWeight: '700', textAlign: 'center' },
});
