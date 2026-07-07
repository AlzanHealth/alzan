import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, ScrollView, ActivityIndicator } from 'react-native';
import { X, Plus, Pencil, Trash2 } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { useNutritionStyles } from '../../../hooks/useNutritionStyles';
import { borderRadius } from '../../../theme';
import { getCurrentAppLocale } from '../../../services/localization';
import { getRecipeIngredients } from '../services/recipeService';
import { MealComponent } from '../types/ingredients';

type RecipeIngredientItem = Awaited<ReturnType<typeof getRecipeIngredients>>[number];

interface RecipeDetailModalProps {
  recipe: MealComponent | null;
  visible: boolean;
  onClose: () => void;
  onUse: (recipe: MealComponent) => void;
  onEdit?: (recipe: MealComponent) => void;
  onDelete?: (recipe: MealComponent) => void;
  isDeleting?: boolean;
}

export const RecipeDetailModal: React.FC<RecipeDetailModalProps> = ({
  recipe,
  visible,
  onClose,
  onUse,
  onEdit,
  onDelete,
  isDeleting = false,
}) => {
  const { t } = useTranslation();
  const { colors: themeColors, isDark } = useNutritionStyles();
  const [ingredients, setIngredients] = useState<RecipeIngredientItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!visible || !recipe?.external_id) {
      setIngredients([]);
      return;
    }

    let cancelled = false;
    setLoading(true);
    getRecipeIngredients(recipe.external_id, getCurrentAppLocale())
      .then(items => {
        if (!cancelled) setIngredients(items);
      })
      .catch(error => console.error('[RecipeDetailModal] ingredients load error:', error))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [visible, recipe?.external_id]);

  if (!recipe) return null;

  const isSystem = recipe.recipe_source === 'system';
  const badgeLabel = isSystem
    ? t('nutrition.recipeBadgeSystem')
    : recipe.recipe_author_name || t('nutrition.recipeBadgeUser');

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.sheet, { backgroundColor: isDark ? themeColors.surfaceSolid : '#FFF' }]}>
          <View style={styles.handleRow}>
            <View style={[styles.handle, { backgroundColor: isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.15)' }]} />
          </View>

          <View style={styles.headerRow}>
            <Text style={[styles.title, { color: themeColors.textPrimary }]} numberOfLines={2}>
              {recipe.name}
            </Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <X size={22} color={themeColors.textSecondary} />
            </TouchableOpacity>
          </View>

          <View
            style={[
              styles.badge,
              { backgroundColor: isSystem ? themeColors.primary + '20' : 'rgba(120,120,128,0.16)' },
            ]}
          >
            <Text style={[styles.badgeText, { color: isSystem ? themeColors.primary : themeColors.textSecondary }]}>
              {badgeLabel}
            </Text>
          </View>

          <Text style={[styles.macroLine, { color: themeColors.textSecondary }]}>
            {t('nutrition.recipeMacroLine', {
              kcal: recipe.kcal_100 ?? 0,
              p: recipe.protein_g_100 ?? 0,
              c: recipe.carbs_g_100 ?? 0,
              f: recipe.fat_g_100 ?? 0,
            })}
          </Text>

          <Text style={[styles.sectionTitle, { color: themeColors.textPrimary }]}>
            {t('nutrition.recipeDetailIngredients')}
          </Text>

          {loading ? (
            <ActivityIndicator color={themeColors.primary} style={styles.loader} />
          ) : (
            <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
              {ingredients.length === 0 ? (
                <Text style={[styles.emptyText, { color: themeColors.textSecondary }]}>
                  {t('nutrition.recipeDetailEmpty')}
                </Text>
              ) : (
                ingredients.map(item => {
                  const kcal = Math.round(((item.kcal_100 ?? 0) * item.quantity) / 100);
                  return (
                    <View
                      key={item.id}
                      style={[
                        styles.ingredientRow,
                        { borderBottomColor: isDark ? 'rgba(255,255,255,0.08)' : '#F0F0F0' },
                      ]}
                    >
                      <Text style={[styles.ingredientName, { color: themeColors.textPrimary }]} numberOfLines={1}>
                        {item.ingredient_name}
                      </Text>
                      <Text style={[styles.ingredientMeta, { color: themeColors.textSecondary }]}>
                        {t('nutrition.recipeDetailItemMeta', { qty: item.quantity, kcal })}
                      </Text>
                    </View>
                  );
                })
              )}
            </ScrollView>
          )}

          {(onEdit || onDelete) && (
            <View style={styles.manageActionsRow}>
              {onEdit && (
                <TouchableOpacity
                  style={[styles.manageButton, { borderColor: themeColors.primary + '55' }]}
                  onPress={() => {
                    onEdit(recipe);
                    onClose();
                  }}
                  activeOpacity={0.85}
                >
                  <Pencil size={16} color={themeColors.primary} strokeWidth={2.4} />
                  <Text style={[styles.manageButtonText, { color: themeColors.primary }]}>
                    {t('nutrition.editRecipeAction')}
                  </Text>
                </TouchableOpacity>
              )}
              {onDelete && (
                <TouchableOpacity
                  style={[
                    styles.manageButton,
                    { borderColor: themeColors.danger + '55' },
                    isDeleting && { opacity: 0.5 },
                  ]}
                  onPress={() => onDelete(recipe)}
                  disabled={isDeleting}
                  activeOpacity={0.85}
                >
                  {isDeleting ? (
                    <ActivityIndicator size="small" color={themeColors.danger} />
                  ) : (
                    <Trash2 size={16} color={themeColors.danger} strokeWidth={2.4} />
                  )}
                  <Text style={[styles.manageButtonText, { color: themeColors.danger }]}>
                    {t('nutrition.deleteRecipeAction')}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          <TouchableOpacity
            style={[styles.useButton, { backgroundColor: themeColors.primary }]}
            onPress={() => {
              onUse(recipe);
              onClose();
            }}
            activeOpacity={0.85}
          >
            <Plus size={16} color="#FFFFFF" strokeWidth={2.6} />
            <Text style={styles.useButtonText}>{t('nutrition.recipeUse')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingBottom: 32,
    maxHeight: '80%',
  },
  handleRow: { alignItems: 'center', paddingVertical: 10 },
  handle: { width: 40, height: 5, borderRadius: 3 },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  title: { flex: 1, fontSize: 20, fontWeight: '700' },
  badge: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, marginTop: 10 },
  badgeText: { fontSize: 13, fontWeight: '600' },
  macroLine: { fontSize: 14, marginTop: 10 },
  sectionTitle: { fontSize: 15, fontWeight: '700', marginTop: 20, marginBottom: 4 },
  loader: { marginTop: 24 },
  list: { marginTop: 4 },
  listContent: { paddingBottom: 8 },
  ingredientRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 11,
    borderBottomWidth: 1,
  },
  ingredientName: { flex: 1, fontSize: 15 },
  ingredientMeta: { fontSize: 13 },
  emptyText: { fontSize: 14, paddingVertical: 16 },
  manageActionsRow: { flexDirection: 'row', gap: 8, marginTop: 16 },
  manageButton: {
    flex: 1,
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: borderRadius.m,
  },
  manageButtonText: { fontSize: 14, fontWeight: '700' },
  useButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 16,
    paddingVertical: 13,
    borderRadius: borderRadius.m,
  },
  useButtonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
});
