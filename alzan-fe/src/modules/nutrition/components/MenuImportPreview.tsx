import React, { memo, useCallback, useMemo } from 'react';
import { ActivityIndicator, FlatList, ListRenderItem, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { useNutritionStyles } from '../../../hooks/useNutritionStyles';
import type { TranslationKey } from '../../../i18n/locales/en';
import { borderRadius } from '../../../theme';
import type {
  MenuImportConflictDecision,
  MenuImportIngredientCandidate,
  MenuImportPreview as MenuImportPreviewData,
  MenuImportPreviewMeal,
} from '../services/menuImportPlanner';
import type { MenuImportMealType } from '../services/menuImportContract';
import { MenuImportMealCard } from './MenuImportMealCard';

type Translate = (key: TranslationKey, options?: Record<string, unknown>) => string;

interface MenuImportPreviewProps {
  preview: MenuImportPreviewData | null;
  editor: React.ReactElement;
  requiresReanalysis: boolean;
  canImport: boolean;
  isImporting: boolean;
  bottomInset: number;
  onImport: () => void;
  onSelectIngredient: (ingredientKey: string, ingredientId: string) => void;
  onSearchIngredient: (ingredientKey: string, query: string) => Promise<void>;
  onRemoveIngredient: (mealKey: string, ingredientIndex: number) => void;
  onSetConflictDecision: (mealKey: string, decision: MenuImportConflictDecision) => void;
  onSetMealType: (mealKey: string, mealType: MenuImportMealType) => void;
  translate: Translate;
}

export const MenuImportPreview = memo(function MenuImportPreview({
  preview,
  editor,
  requiresReanalysis,
  canImport,
  isImporting,
  bottomInset,
  onImport,
  onSelectIngredient,
  onSearchIngredient,
  onRemoveIngredient,
  onSetConflictDecision,
  onSetMealType,
  translate,
}: MenuImportPreviewProps) {
  const { styles: dynamicStyles, colors } = useNutritionStyles();

  const candidatesByIngredient = useMemo<ReadonlyMap<string, MenuImportIngredientCandidate[]>>(
    () => new Map((preview?.resolutions ?? []).map(resolution => [resolution.ingredientKey, resolution.candidates])),
    [preview?.resolutions],
  );

  const renderItem = useCallback<ListRenderItem<MenuImportPreviewMeal>>(
    ({ item }) => (
      <MenuImportMealCard
        meal={item}
        candidatesByIngredient={candidatesByIngredient}
        onSelectIngredient={onSelectIngredient}
        onSearchIngredient={onSearchIngredient}
        onRemoveIngredient={onRemoveIngredient}
        onSetConflictDecision={onSetConflictDecision}
        onSetMealType={onSetMealType}
        translate={translate}
      />
    ),
    [
      candidatesByIngredient,
      onRemoveIngredient,
      onSearchIngredient,
      onSelectIngredient,
      onSetConflictDecision,
      onSetMealType,
      translate,
    ],
  );

  const listHeader = useMemo(
    () => (
      <View style={styles.headerContent}>
        {editor}
        {preview !== null ? (
          <View style={[styles.summary, dynamicStyles.card]}>
            <Text style={[styles.summaryEyebrow, { color: colors.primary }]}>
              {translate('nutrition.menuImportPreviewTitle')}
            </Text>
            <Text style={[styles.summaryTitle, { color: colors.textPrimary }]}>{preview.menuName}</Text>
            <Text style={[styles.summaryMeta, { color: colors.textSecondary }]}>
              {translate('nutrition.menuImportMealCount', { count: preview.meals.length })}
            </Text>
            {requiresReanalysis ? (
              <View
                style={[
                  styles.staleBanner,
                  {
                    backgroundColor: colors.warning + '18',
                    borderColor: colors.warning,
                  },
                ]}
                accessibilityLiveRegion="polite"
              >
                <Text style={[styles.staleText, { color: colors.textPrimary }]}>
                  {translate('nutrition.menuImportReanalysisRequired')}
                </Text>
              </View>
            ) : null}
          </View>
        ) : null}
      </View>
    ),
    [
      colors.primary,
      colors.textPrimary,
      colors.textSecondary,
      colors.warning,
      dynamicStyles.card,
      editor,
      preview,
      requiresReanalysis,
      translate,
    ],
  );

  const listFooter = useMemo(
    () =>
      preview !== null ? (
        <TouchableOpacity
          style={[
            styles.importButton,
            {
              backgroundColor: canImport ? colors.primary : colors.disabledButton,
            },
          ]}
          onPress={onImport}
          disabled={!canImport}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel={translate('nutrition.menuImportSubmitAccessibility')}
          accessibilityState={{ busy: isImporting, disabled: !canImport }}
        >
          {isImporting ? <ActivityIndicator color={colors.white} /> : null}
          <Text style={[styles.importButtonText, { color: colors.white }]}>
            {translate(isImporting ? 'nutrition.menuImportImporting' : 'nutrition.menuImportSubmit')}
          </Text>
        </TouchableOpacity>
      ) : null,
    [canImport, colors.disabledButton, colors.primary, colors.white, isImporting, onImport, preview, translate],
  );

  const keyExtractor = useCallback((meal: MenuImportPreviewMeal) => meal.key, []);

  return (
    <FlatList
      style={styles.list}
      data={preview?.meals ?? []}
      renderItem={renderItem}
      keyExtractor={keyExtractor}
      ListHeaderComponent={listHeader}
      ListFooterComponent={listFooter}
      contentContainerStyle={[styles.listContent, { paddingBottom: bottomInset + 96 }]}
      ItemSeparatorComponent={MealSeparator}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      nestedScrollEnabled
      initialNumToRender={5}
      maxToRenderPerBatch={6}
      windowSize={7}
    />
  );
});

const MealSeparator = () => <View style={styles.separator} />;

const styles = StyleSheet.create({
  list: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  headerContent: {
    gap: 14,
    marginBottom: 14,
  },
  summary: {
    borderRadius: borderRadius.l,
    padding: 16,
  },
  summaryEyebrow: {
    fontSize: 12,
    fontWeight: '800',
    lineHeight: 17,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  summaryTitle: {
    marginTop: 4,
    fontSize: 20,
    fontWeight: '700',
    lineHeight: 27,
  },
  summaryMeta: {
    marginTop: 3,
    fontSize: 14,
    lineHeight: 20,
  },
  staleBanner: {
    marginTop: 12,
    borderWidth: 1,
    borderRadius: borderRadius.m,
    padding: 12,
  },
  staleText: {
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 19,
  },
  separator: {
    height: 12,
  },
  importButton: {
    minHeight: 52,
    marginTop: 16,
    borderRadius: borderRadius.m,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  importButtonText: {
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
  },
});
