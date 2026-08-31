import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { RefreshCw, Trash2, Undo2, X } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { useNutritionStyles } from '../../../hooks/useNutritionStyles';
import { borderRadius } from '../../../theme';
import { DECIMAL_INPUT_PROPS } from '../../../utils/numericInput';
import type { MealItem } from '../../../types/requests.types';
import type { DailyMealItem } from '../types';
import { useMealItems } from '../hooks/useNutritionData';
import type { IngredientInput } from '../types/db';
import {
  buildQuickMealIngredientInputs,
  formatQuickMealQuantity,
  parseQuickMealQuantity,
  sanitizeQuickMealQuantity,
} from '../services/quickMealEditPlanner';

type QuickMealItem = MealItem & { localized_name?: string };

type QuickMealEditModalProps = {
  visible: boolean;
  meal: DailyMealItem | null;
  onCancel: () => void;
  onSave: (ingredients: IngredientInput[]) => Promise<void>;
  onOpenFullEditor: () => void;
};

export const QuickMealEditModal = ({ visible, meal, onCancel, onSave, onOpenFullEditor }: QuickMealEditModalProps) => {
  const { t } = useTranslation();
  const { colors: themeColors, isDark } = useNutritionStyles();
  const logId = meal?.log?.id;
  const { data: mealItems, isLoading, isError, refetch } = useMealItems(logId);
  const [quantityInputs, setQuantityInputs] = useState<Record<string, string>>({});
  const [excludedIds, setExcludedIds] = useState<Set<string>>(new Set());
  const [isSaving, setIsSaving] = useState(false);
  const [formErrorKey, setFormErrorKey] = useState<
    'nutrition.quickEditSaveError' | 'nutrition.quickEditAtLeastOneIngredient' | null
  >(null);

  const items = useMemo(() => (mealItems ?? []) as QuickMealItem[], [mealItems]);

  useEffect(() => {
    if (!visible) return;
    setQuantityInputs({});
    setExcludedIds(new Set());
    setFormErrorKey(null);
    setIsSaving(false);
  }, [logId, visible]);

  useEffect(() => {
    if (!visible || !mealItems) return;
    setQuantityInputs(Object.fromEntries(mealItems.map(item => [item.id, formatQuickMealQuantity(item.quantity_g)])));
  }, [mealItems, visible]);

  if (!meal?.log?.id) return null;

  const updateQuantity = (item: QuickMealItem, value: string) => {
    setFormErrorKey(null);
    setQuantityInputs(previous => ({ ...previous, [item.id]: sanitizeQuickMealQuantity(value) }));
  };

  const toggleExcluded = (itemId: string) => {
    setExcludedIds(previous => {
      const next = new Set(previous);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  };

  const handleSave = async () => {
    const ingredients = buildQuickMealIngredientInputs(items, quantityInputs, excludedIds);
    if (ingredients == null) {
      setFormErrorKey('nutrition.quickEditSaveError');
      return;
    }
    if (ingredients.length === 0) {
      setFormErrorKey('nutrition.quickEditAtLeastOneIngredient');
      return;
    }

    setIsSaving(true);
    setFormErrorKey(null);
    try {
      await onSave(ingredients);
    } catch {
      setFormErrorKey('nutrition.quickEditSaveError');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel} statusBarTranslucent>
      <View style={styles.overlay}>
        <View style={[styles.content, { backgroundColor: themeColors.surfaceSolid }]}>
          <View style={styles.header}>
            <View style={styles.headerCopy}>
              <Text style={[styles.title, { color: themeColors.textPrimary }]}>{t('nutrition.quickEditTitle')}</Text>
              <Text style={[styles.mealName, { color: themeColors.textSecondary }]} numberOfLines={2}>
                {meal.displayName}
              </Text>
            </View>
            <TouchableOpacity
              onPress={onCancel}
              disabled={isSaving}
              style={styles.closeButton}
              accessibilityRole="button"
              accessibilityLabel={t('common.close')}
            >
              <X size={22} color={themeColors.textSecondary} />
            </TouchableOpacity>
          </View>

          <Text style={[styles.description, { color: themeColors.textSecondary }]}>
            {t('nutrition.quickEditDescription')}
          </Text>

          {isLoading ? (
            <ActivityIndicator color={themeColors.primary} style={styles.loader} />
          ) : isError ? (
            <View style={styles.centerState}>
              <Text style={[styles.stateText, { color: themeColors.textSecondary }]}>
                {t('nutrition.quickEditLoadError')}
              </Text>
              <TouchableOpacity
                style={[styles.outlineButton, { borderColor: themeColors.primary + '55' }]}
                onPress={() => void refetch()}
                activeOpacity={0.85}
              >
                <RefreshCw size={15} color={themeColors.primary} />
                <Text style={[styles.outlineButtonText, { color: themeColors.primary }]}>{t('nutrition.retry')}</Text>
              </TouchableOpacity>
            </View>
          ) : items.length === 0 ? (
            <View style={styles.centerState}>
              <Text style={[styles.stateText, { color: themeColors.textSecondary }]}>
                {t('nutrition.quickEditNoIngredients')}
              </Text>
              <TouchableOpacity
                style={[styles.primaryButton, { backgroundColor: themeColors.primary }]}
                onPress={onOpenFullEditor}
                activeOpacity={0.85}
              >
                <Text style={styles.primaryButtonText}>{t('nutrition.quickEditOpenFullEditor')}</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <ScrollView
                style={styles.list}
                contentContainerStyle={styles.listContent}
                keyboardShouldPersistTaps="handled"
              >
                {items.map(item => {
                  const isExcluded = excludedIds.has(item.id);
                  const value = quantityInputs[item.id] ?? '';
                  const isValid = parseQuickMealQuantity(value) != null;
                  return (
                    <View
                      key={item.id}
                      style={[
                        styles.itemRow,
                        {
                          borderColor: themeColors.border,
                          backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#F8F9FC',
                        },
                        isExcluded && styles.itemRowExcluded,
                      ]}
                    >
                      <View style={styles.itemCopy}>
                        <Text
                          style={[
                            styles.itemName,
                            { color: isExcluded ? themeColors.textSecondary : themeColors.textPrimary },
                          ]}
                          numberOfLines={2}
                        >
                          {item.localized_name || item.name}
                        </Text>
                        {!isExcluded && !isValid ? (
                          <Text style={[styles.validationText, { color: themeColors.danger }]}>
                            {t('nutrition.quickEditInvalidQuantity')}
                          </Text>
                        ) : null}
                      </View>
                      {isExcluded ? (
                        <TouchableOpacity
                          onPress={() => toggleExcluded(item.id)}
                          style={styles.itemAction}
                          accessibilityRole="button"
                          accessibilityLabel={t('nutrition.quickEditUndoRemove')}
                        >
                          <Undo2 size={18} color={themeColors.primary} />
                        </TouchableOpacity>
                      ) : (
                        <>
                          <View style={styles.quantityField}>
                            <TextInput
                              value={value}
                              onChangeText={nextValue => updateQuantity(item, nextValue)}
                              style={[
                                styles.quantityInput,
                                {
                                  color: themeColors.textPrimary,
                                  borderColor: isValid ? themeColors.border : themeColors.danger,
                                },
                              ]}
                              {...DECIMAL_INPUT_PROPS}
                              selectTextOnFocus
                              accessibilityLabel={t('nutrition.quickEditQuantityLabel', {
                                name: item.localized_name || item.name,
                              })}
                            />
                            <Text style={[styles.unit, { color: themeColors.textSecondary }]}>g</Text>
                          </View>
                          <TouchableOpacity
                            onPress={() => toggleExcluded(item.id)}
                            style={styles.itemAction}
                            accessibilityRole="button"
                            accessibilityLabel={t('nutrition.quickEditRemoveIngredient', {
                              name: item.localized_name || item.name,
                            })}
                          >
                            <Trash2 size={18} color={themeColors.danger} />
                          </TouchableOpacity>
                        </>
                      )}
                    </View>
                  );
                })}
              </ScrollView>

              {formErrorKey ? (
                <Text style={[styles.validationText, styles.formError, { color: themeColors.danger }]}>
                  {t(formErrorKey)}
                </Text>
              ) : null}

              <TouchableOpacity
                onPress={onOpenFullEditor}
                disabled={isSaving}
                style={styles.fullEditorButton}
                accessibilityRole="button"
              >
                <Text style={[styles.fullEditorButtonText, { color: themeColors.primary }]}>
                  {t('nutrition.quickEditOpenFullEditor')}
                </Text>
              </TouchableOpacity>

              <View style={styles.actions}>
                <TouchableOpacity onPress={onCancel} disabled={isSaving} style={styles.secondaryButton}>
                  <Text style={[styles.secondaryButtonText, { color: themeColors.textSecondary }]}>
                    {t('common.cancel')}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => void handleSave()}
                  disabled={isSaving}
                  style={[styles.primaryButton, { backgroundColor: themeColors.primary }, isSaving && styles.disabled]}
                >
                  {isSaving ? (
                    <ActivityIndicator color="#FFFFFF" size="small" />
                  ) : (
                    <Text style={styles.primaryButtonText}>{t('nutrition.quickEditSave')}</Text>
                  )}
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.42)' },
  content: {
    width: '100%',
    maxWidth: 560,
    maxHeight: '88%',
    alignSelf: 'center',
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    paddingHorizontal: 22,
    paddingTop: 20,
    paddingBottom: 30,
  },
  header: { flexDirection: 'row', alignItems: 'flex-start' },
  headerCopy: { flex: 1 },
  title: { fontSize: 22, fontWeight: '800' },
  mealName: { fontSize: 14, marginTop: 5 },
  closeButton: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  description: { fontSize: 13, lineHeight: 18, marginTop: 8, marginBottom: 14 },
  loader: { marginVertical: 40 },
  centerState: { alignItems: 'center', paddingVertical: 24 },
  stateText: { fontSize: 14, textAlign: 'center', lineHeight: 20, marginBottom: 14 },
  list: { maxHeight: 380 },
  listContent: { gap: 10, paddingBottom: 4 },
  itemRow: {
    minHeight: 68,
    borderWidth: 1,
    borderRadius: borderRadius.m,
    paddingLeft: 14,
    paddingRight: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  itemRowExcluded: { opacity: 0.62 },
  itemCopy: { flex: 1, paddingVertical: 8, paddingRight: 8 },
  itemName: { fontSize: 15, fontWeight: '600' },
  quantityField: { flexDirection: 'row', alignItems: 'center' },
  quantityInput: {
    width: 78,
    height: 44,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 9,
    textAlign: 'right',
    fontSize: 16,
    fontWeight: '700',
  },
  unit: { fontSize: 13, marginLeft: 4, width: 14 },
  itemAction: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  validationText: { fontSize: 12, marginTop: 4 },
  formError: { marginTop: 10, textAlign: 'center' },
  outlineButton: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    borderWidth: 1,
    borderRadius: borderRadius.m,
    paddingHorizontal: 16,
  },
  outlineButtonText: { fontSize: 14, fontWeight: '700' },
  fullEditorButton: { minHeight: 44, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  fullEditorButtonText: { fontSize: 14, fontWeight: '700' },
  actions: { flexDirection: 'row', gap: 12, marginTop: 14 },
  secondaryButton: { minHeight: 48, minWidth: 92, alignItems: 'center', justifyContent: 'center' },
  secondaryButtonText: { fontSize: 15, fontWeight: '700' },
  primaryButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  primaryButtonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
  disabled: { opacity: 0.55 },
});
