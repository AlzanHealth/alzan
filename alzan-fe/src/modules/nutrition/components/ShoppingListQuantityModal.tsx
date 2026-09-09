import React, { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import {
  getShoppingAvailableQuantity,
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
    setValue(String(getShoppingAvailableQuantity(ingredient)));
    setError(false);
  }, [ingredient, visible]);

  if (!ingredient) return null;

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
              {t('nutrition.shoppingListAvailableQuantityTitle')}
            </Text>
            <TouchableOpacity style={styles.headerButton} onPress={handleConfirm} accessibilityRole="button">
              <Text style={[styles.doneText, { color: colors.primary }]}>{t('common.done')}</Text>
            </TouchableOpacity>
          </View>
          <Text style={[styles.ingredient, { color: colors.textPrimary }]}>{ingredient.name}</Text>
          <Text style={[styles.message, { color: colors.textSecondary }]}>
            {t('nutrition.shoppingListAvailableQuantityMessage')}
          </Text>
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
            placeholder={String(getShoppingAvailableQuantity(ingredient))}
            placeholderTextColor={colors.textSecondary}
            style={[styles.input, { color: colors.textPrimary, borderColor: error ? '#ef4444' : colors.primary }]}
            accessibilityLabel={t('nutrition.shoppingListAvailableQuantityMessage')}
          />
          {error && <Text style={styles.error}>{t('nutrition.shoppingListAvailableQuantityInvalid')}</Text>}
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
