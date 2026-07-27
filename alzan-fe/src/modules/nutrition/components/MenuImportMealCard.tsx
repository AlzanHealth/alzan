import React, { memo, useCallback } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { parseISO } from 'date-fns';

import { useNutritionStyles } from '../../../hooks/useNutritionStyles';
import { formatLocalizedDate } from '../../../i18n/dateLocale';
import type { TranslationKey } from '../../../i18n/locales/en';
import { borderRadius } from '../../../theme';
import { MEAL_TYPE_LABELS } from '../constants';
import type {
  MenuImportConflictDecision,
  MenuImportIngredientCandidate,
  MenuImportPreviewMeal,
} from '../services/menuImportPlanner';

type Translate = (key: TranslationKey, options?: Record<string, unknown>) => string;

interface MenuImportMealCardProps {
  meal: MenuImportPreviewMeal;
  candidatesByIngredient: ReadonlyMap<string, MenuImportIngredientCandidate[]>;
  onSelectIngredient: (ingredientKey: string, ingredientId: string) => void;
  onSetConflictDecision: (mealKey: string, decision: MenuImportConflictDecision) => void;
  translate: Translate;
}

const CONFLICT_DECISIONS: {
  decision: MenuImportConflictDecision;
  labelKey: TranslationKey;
}[] = [
  { decision: 'replace', labelKey: 'nutrition.menuImportConflictReplace' },
  { decision: 'keep_both', labelKey: 'nutrition.menuImportConflictKeepBoth' },
  { decision: 'ignore', labelKey: 'nutrition.menuImportConflictIgnore' },
];

export const MenuImportMealCard = memo(function MenuImportMealCard({
  meal,
  candidatesByIngredient,
  onSelectIngredient,
  onSetConflictDecision,
  translate,
}: MenuImportMealCardProps) {
  const { styles: dynamicStyles, colors } = useNutritionStyles();
  const formattedDate = formatLocalizedDate(parseISO(meal.date), {
    en: 'EEEE, MMMM d',
    es: "EEEE, d 'de' MMMM",
  });

  const handleConflictDecision = useCallback(
    (decision: MenuImportConflictDecision) => {
      onSetConflictDecision(meal.key, decision);
    },
    [meal.key, onSetConflictDecision],
  );

  return (
    <View style={[styles.card, dynamicStyles.card]}>
      <View style={styles.heading}>
        <View style={styles.headingCopy}>
          <Text style={[styles.date, { color: colors.textSecondary }]}>{formattedDate}</Text>
          <Text style={[styles.title, { color: colors.textPrimary }]}>{meal.name}</Text>
          <Text style={[styles.mealType, { color: colors.primary }]}>
            {translate(MEAL_TYPE_LABELS[meal.meal_type])}
          </Text>
        </View>
        <Text style={[styles.macros, { color: colors.textSecondary }]}>
          {translate('nutrition.menuImportMacros', {
            kcal: meal.macros.kcal,
            protein: meal.macros.protein_g,
            carbs: meal.macros.carbs_g,
            fats: meal.macros.fats_g,
          })}
        </Text>
      </View>

      <View style={[styles.divider, { backgroundColor: colors.border }]} />

      <View style={styles.ingredients}>
        {meal.ingredients.map((ingredient, ingredientIndex) => {
          const selected = ingredient.selectedCandidate;
          const candidates = candidatesByIngredient.get(ingredient.ingredientKey) ?? [];

          return (
            <View key={`${meal.key}-${ingredient.ingredientKey}-${ingredientIndex}`} style={styles.ingredient}>
              <View style={styles.ingredientHeading}>
                <Text style={[styles.ingredientName, { color: colors.textPrimary }]}>{ingredient.name}</Text>
                <Text style={[styles.quantity, { color: colors.textSecondary }]}>
                  {translate('nutrition.menuImportIngredientQuantity', {
                    quantity: ingredient.quantity_g,
                  })}
                </Text>
              </View>

              {selected !== null ? (
                <Text style={[styles.selectedMatch, { color: colors.success }]}>
                  {translate('nutrition.menuImportSelectedMatch', { name: selected.name })}
                </Text>
              ) : (
                <View style={styles.unresolved}>
                  <Text style={[styles.unresolvedLabel, { color: colors.warning }]}>
                    {translate('nutrition.menuImportUnresolvedIngredient')}
                  </Text>
                  {candidates.length > 0 ? (
                    <View style={styles.candidates}>
                      {candidates.map(candidate => (
                        <TouchableOpacity
                          key={candidate.id}
                          style={[
                            styles.candidateButton,
                            {
                              backgroundColor: colors.background,
                              borderColor: colors.border,
                            },
                          ]}
                          onPress={() => onSelectIngredient(ingredient.ingredientKey, candidate.id)}
                          activeOpacity={0.85}
                          accessibilityRole="button"
                          accessibilityLabel={translate('nutrition.menuImportSelectCandidateAccessibility', {
                            ingredient: ingredient.name,
                            candidate: candidate.name,
                          })}
                        >
                          <Text style={[styles.candidateName, { color: colors.textPrimary }]}>{candidate.name}</Text>
                          <Text style={[styles.candidateMacros, { color: colors.textSecondary }]}>
                            {translate('nutrition.menuImportCandidateMacros', {
                              kcal: candidate.kcal_100,
                              protein: candidate.protein_g_100,
                              carbs: candidate.carbs_g_100,
                              fats: candidate.fat_g_100,
                            })}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  ) : (
                    <Text style={[styles.noCandidates, { color: colors.textSecondary }]}>
                      {translate('nutrition.menuImportNoCandidates')}
                    </Text>
                  )}
                </View>
              )}
            </View>
          );
        })}
      </View>

      {meal.conflict !== null ? (
        <View style={[styles.conflict, { borderColor: colors.warning }]}>
          <Text style={[styles.conflictTitle, { color: colors.textPrimary }]}>
            {translate('nutrition.menuImportConflictTitle')}
          </Text>
          <Text style={[styles.conflictHelp, { color: colors.textSecondary }]}>
            {translate('nutrition.menuImportConflictHelp', {
              count: meal.conflict.existingLogs.length,
            })}
          </Text>
          <View style={styles.existingMeals}>
            {meal.conflict.existingLogs.map(existingLog => (
              <Text key={existingLog.id} style={[styles.existingMeal, { color: colors.textPrimary }]}>
                {'• '}
                {existingLog.name?.trim() || translate('nutrition.menuImportExistingMealUnnamed')}
              </Text>
            ))}
          </View>
          <View style={styles.conflictActions}>
            {CONFLICT_DECISIONS.map(({ decision, labelKey }) => {
              const isSelected = meal.conflict?.decision === decision;
              return (
                <TouchableOpacity
                  key={decision}
                  style={[
                    styles.conflictButton,
                    {
                      backgroundColor: isSelected ? colors.primary : colors.background,
                      borderColor: isSelected ? colors.primary : colors.border,
                    },
                  ]}
                  onPress={() => handleConflictDecision(decision)}
                  activeOpacity={0.85}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isSelected }}
                  accessibilityLabel={translate('nutrition.menuImportConflictDecisionAccessibility', {
                    decision: translate(labelKey),
                    meal: meal.name,
                  })}
                >
                  <Text style={[styles.conflictButtonText, { color: isSelected ? colors.white : colors.textPrimary }]}>
                    {translate(labelKey)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  card: {
    borderRadius: borderRadius.l,
    padding: 16,
  },
  heading: {
    gap: 10,
  },
  headingCopy: {
    flexShrink: 1,
  },
  date: {
    fontSize: 13,
    lineHeight: 18,
    textTransform: 'capitalize',
  },
  title: {
    marginTop: 3,
    fontSize: 18,
    fontWeight: '700',
    lineHeight: 24,
  },
  mealType: {
    marginTop: 3,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
  },
  macros: {
    fontSize: 13,
    lineHeight: 18,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: 14,
  },
  ingredients: {
    gap: 14,
  },
  ingredient: {
    gap: 5,
  },
  ingredientHeading: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 12,
  },
  ingredientName: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 21,
  },
  quantity: {
    flexShrink: 0,
    fontSize: 13,
    lineHeight: 18,
  },
  selectedMatch: {
    fontSize: 13,
    lineHeight: 18,
  },
  unresolved: {
    gap: 8,
  },
  unresolvedLabel: {
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
  },
  candidates: {
    gap: 8,
  },
  candidateButton: {
    minHeight: 44,
    borderWidth: 1,
    borderRadius: borderRadius.m,
    paddingHorizontal: 12,
    paddingVertical: 9,
    justifyContent: 'center',
  },
  candidateName: {
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 19,
  },
  candidateMacros: {
    marginTop: 2,
    fontSize: 12,
    lineHeight: 17,
  },
  noCandidates: {
    fontSize: 13,
    lineHeight: 18,
  },
  conflict: {
    marginTop: 16,
    borderWidth: 1,
    borderRadius: borderRadius.m,
    padding: 12,
  },
  conflictTitle: {
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 21,
  },
  conflictHelp: {
    marginTop: 3,
    fontSize: 13,
    lineHeight: 18,
  },
  existingMeals: {
    marginTop: 8,
    gap: 4,
  },
  existingMeal: {
    fontSize: 13,
    lineHeight: 18,
  },
  conflictActions: {
    marginTop: 10,
    gap: 8,
  },
  conflictButton: {
    minHeight: 44,
    borderWidth: 1,
    borderRadius: borderRadius.m,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  conflictButtonText: {
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
  },
});
