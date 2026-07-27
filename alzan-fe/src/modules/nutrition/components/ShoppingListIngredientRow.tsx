import React, { useCallback } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Check } from 'lucide-react-native';

import { formatShoppingQuantity, type ShoppingListIngredient } from '../services/shoppingListPlanner';

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
    white: string;
  };
  onToggle: (key: string) => void;
};

export const ShoppingListIngredientRow = ({
  item,
  isCompleted,
  disabled,
  isLast,
  colors,
  onToggle,
}: ShoppingListIngredientRowProps) => {
  const handlePress = useCallback(() => onToggle(item.key), [item.key, onToggle]);

  return (
    <TouchableOpacity
      style={[
        styles.row,
        isLast && styles.lastRow,
        { backgroundColor: colors.surfaceSolid, borderBottomColor: colors.border },
      ]}
      onPress={handlePress}
      disabled={disabled}
      activeOpacity={0.75}
      accessibilityRole="checkbox"
      accessibilityLabel={`${item.name}, ${formatShoppingQuantity(item.quantity_g)}`}
      accessibilityState={{ checked: isCompleted, disabled }}
    >
      <View
        style={[styles.checkbox, { borderColor: colors.primary }, isCompleted && { backgroundColor: colors.primary }]}
      >
        {isCompleted && <Check size={15} color={colors.white} strokeWidth={3} />}
      </View>
      <Text style={[styles.name, { color: colors.textPrimary }, isCompleted && styles.completedText]}>{item.name}</Text>
      <Text style={[styles.quantity, { color: colors.primary }, isCompleted && styles.completedText]}>
        {formatShoppingQuantity(item.quantity_g)}
      </Text>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  row: {
    minHeight: 58,
    paddingHorizontal: 16,
    paddingVertical: 9,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  lastRow: {
    borderBottomWidth: 0,
    borderBottomLeftRadius: 18,
    borderBottomRightRadius: 18,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 8,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  name: { flex: 1, fontSize: 16, fontWeight: '600' },
  quantity: { fontSize: 15, fontWeight: '800' },
  completedText: { opacity: 0.52, textDecorationLine: 'line-through' },
});
