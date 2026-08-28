import React, { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import {
  adjustShoppingPurchaseQuantity,
  formatShoppingQuantity,
  getShoppingPurchaseQuantity,
  parseShoppingQuantityInput,
  type ShoppingListIngredient,
} from '../services/shoppingListPlanner';

type ShoppingListQuantityModalProps = {
  visible: boolean;
  ingredient: ShoppingListIngredient | null;
  colors: {
    primary: string;
    surfaceSolid: string;
    textPrimary: string;
    textSecondary: string;
    white: string;
  };
  onCancel: () => void;
  onConfirm: (quantityGrams: number) => void;
};

export const ShoppingListQuantityModal = ({
  visible,
  ingredient,
  colors,
  onCancel,
  onConfirm,
}: ShoppingListQuantityModalProps) => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [value, setValue] = useState('');
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!visible || !ingredient) return;
    setValue(String(getShoppingPurchaseQuantity(ingredient)));
    setError(false);
  }, [ingredient, visible]);

  if (!ingredient) return null;

  const chooseQuantity = (quantity: number) => {
    setError(false);
    onConfirm(quantity);
  };

  const handleConfirm = () => {
    const quantity = parseShoppingQuantityInput(value);
    if (quantity === null) {
      setError(true);
      return;
    }
    onConfirm(quantity);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel} statusBarTranslucent>
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onCancel} />
        <View
          style={[styles.content, { backgroundColor: colors.surfaceSolid, paddingBottom: Math.max(insets.bottom, 16) }]}
        >
          <View style={styles.header}>
            <TouchableOpacity style={styles.headerButton} onPress={onCancel} accessibilityRole="button">
              <Text style={[styles.cancelText, { color: colors.textSecondary }]}>{t('common.cancel')}</Text>
            </TouchableOpacity>
            <Text style={[styles.title, { color: colors.textPrimary }]}>
              {t('nutrition.shoppingListCustomQuantityTitle')}
            </Text>
            <TouchableOpacity style={styles.headerButton} onPress={handleConfirm} accessibilityRole="button">
              <Text style={[styles.doneText, { color: colors.primary }]}>{t('common.done')}</Text>
            </TouchableOpacity>
          </View>
          <Text style={[styles.ingredient, { color: colors.textPrimary }]}>{ingredient.name}</Text>
          <Text style={[styles.message, { color: colors.textSecondary }]}>
            {t('nutrition.shoppingListCustomQuantityMessage')}
          </Text>
          <View style={styles.quickOptions}>
            <TouchableOpacity
              style={[styles.quickOption, { borderColor: colors.primary }]}
              onPress={() => chooseQuantity(adjustShoppingPurchaseQuantity(ingredient, 'exact'))}
              accessibilityRole="button"
            >
              <Text style={[styles.quickOptionText, { color: colors.primary }]}>
                {t('nutrition.shoppingListExactQuantity')}
              </Text>
              <Text style={[styles.quickOptionValue, { color: colors.textSecondary }]}>
                {formatShoppingQuantity(ingredient.quantity_g)}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.quickOption, { borderColor: colors.primary }]}
              onPress={() => chooseQuantity(adjustShoppingPurchaseQuantity(ingredient, 'round_500g'))}
              accessibilityRole="button"
            >
              <Text style={[styles.quickOptionText, { color: colors.primary }]}>500 g</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.quickOption, { borderColor: colors.primary }]}
              onPress={() => chooseQuantity(adjustShoppingPurchaseQuantity(ingredient, 'round_1kg'))}
              accessibilityRole="button"
            >
              <Text style={[styles.quickOptionText, { color: colors.primary }]}>1 kg</Text>
            </TouchableOpacity>
          </View>
          <TextInput
            value={value}
            onChangeText={nextValue => {
              setValue(nextValue);
              setError(false);
            }}
            keyboardType="decimal-pad"
            inputMode="decimal"
            selectTextOnFocus
            returnKeyType="done"
            onSubmitEditing={handleConfirm}
            placeholder={String(getShoppingPurchaseQuantity(ingredient))}
            placeholderTextColor={colors.textSecondary}
            style={[styles.input, { color: colors.textPrimary, borderColor: error ? '#ef4444' : colors.primary }]}
            accessibilityLabel={t('nutrition.shoppingListCustomQuantityMessage')}
          />
          {error && <Text style={styles.error}>{t('nutrition.shoppingListCustomQuantityInvalid')}</Text>}
          <TouchableOpacity
            style={[styles.confirmButton, { backgroundColor: colors.primary }]}
            onPress={handleConfirm}
            accessibilityRole="button"
          >
            <Text style={[styles.confirmButtonText, { color: colors.white }]}>{t('common.save')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.42)' },
  content: { paddingHorizontal: 20, paddingTop: 16, borderTopLeftRadius: 26, borderTopRightRadius: 26, gap: 12 },
  header: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerButton: { minWidth: 64, minHeight: 44, justifyContent: 'center' },
  cancelText: { fontSize: 16, fontWeight: '600' },
  doneText: { fontSize: 16, fontWeight: '800', textAlign: 'right' },
  title: { flex: 1, fontSize: 18, fontWeight: '800', textAlign: 'center' },
  ingredient: { fontSize: 20, fontWeight: '800', textAlign: 'center' },
  message: { fontSize: 14, lineHeight: 20, textAlign: 'center' },
  quickOptions: { flexDirection: 'row', gap: 8 },
  quickOption: {
    flex: 1,
    minHeight: 54,
    borderWidth: 1.5,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  quickOptionText: { fontSize: 12, fontWeight: '800', textAlign: 'center' },
  quickOptionValue: { fontSize: 11, marginTop: 2 },
  input: {
    minHeight: 52,
    borderWidth: 1.5,
    borderRadius: 14,
    paddingHorizontal: 16,
    fontSize: 18,
    textAlign: 'center',
  },
  error: { color: '#ef4444', fontSize: 13, textAlign: 'center' },
  confirmButton: { minHeight: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  confirmButtonText: { fontSize: 16, fontWeight: '800' },
});
