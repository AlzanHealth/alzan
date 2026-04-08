// src/modules/nutrition/components/IngredientDetailModal.tsx
// Modal to display full nutritional information of an ingredient

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, ScrollView } from 'react-native';
import { X } from 'lucide-react-native';
import { useNutritionStyles } from '../../../hooks/useNutritionStyles';
import { FoodSearchResult } from '../types/ingredients';
import { CATEGORY_LABELS } from './IngredientCategoryFilter';
import { IngredientSource } from '../../../types/requests.types';
import { useTranslation } from 'react-i18next';
import { getLocaleTag } from '../../../i18n/dateLocale';
import { getLocalizedIngredientNotes } from '../../../services/localization';

interface IngredientDetailModalProps {
  visible: boolean;
  ingredient: FoodSearchResult | null;
  onClose: () => void;
  onSelect: (food: FoodSearchResult) => void;
}

// Quality score to Nutri-Score mapping
const getQualityLabel = (score?: number): { letter: string; color: string } => {
  if (score === undefined || score === null) return { letter: '?', color: '#999' };
  if (score >= 0.8) return { letter: 'A', color: '#038141' };
  if (score >= 0.6) return { letter: 'B', color: '#85BB2F' };
  if (score >= 0.4) return { letter: 'C', color: '#FECB02' };
  if (score >= 0.2) return { letter: 'D', color: '#EE8100' };
  return { letter: 'E', color: '#E63E11' };
};

// Parse source_primary which might be string JSON or object
const parseSourcePrimary = (source?: IngredientSource | null): { provider?: string; retrieved_at?: string } | null => {
  if (!source) return null;
  if (typeof source === 'string') {
    try {
      return JSON.parse(source);
    } catch {
      return null;
    }
  }
  return source;
};

export const IngredientDetailModal: React.FC<IngredientDetailModalProps> = ({
  visible,
  ingredient,
  onClose,
  onSelect,
}) => {
  const { t } = useTranslation();
  const { colors: themeColors, isDark } = useNutritionStyles();

  if (!ingredient) return null;

  const qualityInfo = getQualityLabel(ingredient.quality_score);
  const sourcePrimary = parseSourcePrimary(ingredient.source_primary);

  const handleSelect = () => {
    onSelect(ingredient);
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.modal, { backgroundColor: isDark ? '#1C1C1E' : '#FFFFFF' }]}>
          {/* Header */}
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.title, { color: themeColors.textPrimary }]} numberOfLines={2}>
                {ingredient.name}
              </Text>
              {ingredient.category && (
                <View style={[styles.categoryBadge, { backgroundColor: themeColors.primary + '20' }]}>
                  <Text style={[styles.categoryText, { color: themeColors.primary }]}>
                    {CATEGORY_LABELS[ingredient.category]
                      ? String(t(CATEGORY_LABELS[ingredient.category]))
                      : ingredient.category}
                  </Text>
                </View>
              )}
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <X size={24} color={themeColors.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} style={styles.content}>
            {/* Quality Score / Nutri-Score */}
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: themeColors.textSecondary }]}>
                {t('nutrition.qualityScore')}
              </Text>
              <View style={styles.qualityRow}>
                <View style={[styles.qualityBadge, { backgroundColor: qualityInfo.color }]}>
                  <Text style={styles.qualityLetter}>{qualityInfo.letter}</Text>
                </View>
                <Text style={[styles.qualityScore, { color: themeColors.textPrimary }]}>
                  {ingredient.quality_score !== undefined
                    ? `${Math.round(ingredient.quality_score * 100)}%`
                    : t('nutrition.unavailable')}
                </Text>
              </View>
            </View>

            {/* Main Macros */}
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: themeColors.textSecondary }]}>
                {t('nutrition.nutritionInfo100g')}
              </Text>
              <View
                style={[styles.macrosCard, { backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)' }]}
              >
                <View style={styles.macroRow}>
                  <Text style={[styles.macroLabel, { color: themeColors.textPrimary }]}>{t('nutrition.energy')}</Text>
                  <Text style={[styles.macroValue, { color: themeColors.primary }]}>
                    {ingredient.kcal_100}
                    {t('nutrition.kcal')}
                  </Text>
                </View>
                <View style={styles.macroRow}>
                  <Text style={[styles.macroLabel, { color: themeColors.textPrimary }]}>{t('nutrition.proteins')}</Text>
                  <Text style={[styles.macroValue, { color: themeColors.textPrimary }]}>
                    {ingredient.protein_g_100} g
                  </Text>
                </View>
                <View style={styles.macroRow}>
                  <Text style={[styles.macroLabel, { color: themeColors.textPrimary }]}>{t('nutrition.carbs')}</Text>
                  <Text style={[styles.macroValue, { color: themeColors.textPrimary }]}>
                    {ingredient.carbs_g_100} g
                  </Text>
                </View>
                <View style={styles.macroRow}>
                  <Text style={[styles.macroLabel, { color: themeColors.textPrimary }]}>{t('nutrition.fats')}</Text>
                  <Text style={[styles.macroValue, { color: themeColors.textPrimary }]}>{ingredient.fat_g_100} g</Text>
                </View>
                {ingredient.fiber_g_100 !== undefined && ingredient.fiber_g_100 !== null && (
                  <View style={styles.macroRow}>
                    <Text style={[styles.macroLabel, { color: themeColors.textPrimary }]}>{t('nutrition.fiber')}</Text>
                    <Text style={[styles.macroValue, { color: themeColors.textPrimary }]}>
                      {ingredient.fiber_g_100} g
                    </Text>
                  </View>
                )}
                {ingredient.sugar_g_100 !== undefined && ingredient.sugar_g_100 !== null && (
                  <View style={styles.macroRow}>
                    <Text style={[styles.macroLabel, { color: themeColors.textPrimary }]}>{t('nutrition.sugars')}</Text>
                    <Text style={[styles.macroValue, { color: themeColors.textPrimary }]}>
                      {ingredient.sugar_g_100} g
                    </Text>
                  </View>
                )}
                {ingredient.sodium_mg_100 !== undefined && ingredient.sodium_mg_100 !== null && (
                  <View style={styles.macroRow}>
                    <Text style={[styles.macroLabel, { color: themeColors.textPrimary }]}>{t('nutrition.sodium')}</Text>
                    <Text style={[styles.macroValue, { color: themeColors.textPrimary }]}>
                      {ingredient.sodium_mg_100}
                      {t('nutrition.mg')}
                    </Text>
                  </View>
                )}
                {ingredient.salt_g_100 !== undefined && ingredient.salt_g_100 !== null && (
                  <View style={styles.macroRow}>
                    <Text style={[styles.macroLabel, { color: themeColors.textPrimary }]}>{t('nutrition.salt')}</Text>
                    <Text style={[styles.macroValue, { color: themeColors.textPrimary }]}>
                      {ingredient.salt_g_100} g
                    </Text>
                  </View>
                )}
              </View>
            </View>

            {/* Notes */}
            {getLocalizedIngredientNotes(ingredient) && (
              <View style={styles.section}>
                <Text style={[styles.sectionTitle, { color: themeColors.textSecondary }]}>{t('nutrition.notes')}</Text>
                <Text style={[styles.notesText, { color: themeColors.textPrimary }]}>
                  {getLocalizedIngredientNotes(ingredient)}
                </Text>
              </View>
            )}

            {/* Source Info - Simplified */}
            {sourcePrimary && (
              <View style={styles.section}>
                <Text style={[styles.sectionTitle, { color: themeColors.textSecondary }]}>{t('nutrition.source')}</Text>
                {sourcePrimary.provider && (
                  <Text style={[styles.sourceText, { color: themeColors.textPrimary }]}>{sourcePrimary.provider}</Text>
                )}
                {sourcePrimary.retrieved_at && (
                  <Text style={[styles.sourceText, { color: themeColors.textSecondary, marginTop: 4 }]}>
                    {t('nutrition.updatedLabel')}
                    {new Date(sourcePrimary.retrieved_at).toLocaleDateString(getLocaleTag())}
                  </Text>
                )}
              </View>
            )}

            <View style={{ height: 20 }} />
          </ScrollView>

          {/* Select Button */}
          <TouchableOpacity style={[styles.selectBtn, { backgroundColor: themeColors.primary }]} onPress={handleSelect}>
            <Text style={styles.selectBtnText}>{t('nutrition.addToMeal')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modal: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '85%',
    paddingBottom: 34, // Safe area
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.05)',
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 6,
  },
  categoryBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  categoryText: {
    fontSize: 12,
    fontWeight: '600',
  },
  closeBtn: {
    padding: 4,
    marginLeft: 12,
  },
  content: {
    paddingHorizontal: 20,
  },
  section: {
    marginTop: 20,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  qualityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  qualityBadge: {
    width: 44,
    height: 44,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qualityLetter: {
    fontSize: 24,
    fontWeight: '800',
    color: '#FFF',
  },
  qualityScore: {
    fontSize: 16,
    fontWeight: '600',
  },
  macrosCard: {
    borderRadius: 12,
    padding: 16,
  },
  macroRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.05)',
  },
  macroLabel: {
    fontSize: 15,
  },
  macroValue: {
    fontSize: 15,
    fontWeight: '600',
  },
  notesText: {
    fontSize: 14,
    lineHeight: 20,
  },
  sourceText: {
    fontSize: 13,
    lineHeight: 20,
  },
  selectBtn: {
    marginHorizontal: 20,
    marginTop: 16,
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
  },
  selectBtnText: {
    color: '#FFF',
    fontSize: 17,
    fontWeight: '600',
  },
});
