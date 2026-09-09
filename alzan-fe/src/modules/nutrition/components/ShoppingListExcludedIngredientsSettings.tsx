import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Check, Plus, Search, X } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';

import { getCurrentAppLocale } from '../../../services/localization';
import {
  getIngredientsByIds,
  searchIngredients,
  type IngredientSearchResult,
  type IngredientSettingsOption,
} from '../../../services/ingredientsService';
import { getShoppingIngredientKey, normalizeShoppingListExcludedIngredientKeys } from '../services/shoppingListPlanner';
import { useNutritionStyles } from '../../../hooks/useNutritionStyles';
import { borderRadius, spacing, typography } from '../../../theme';

type ShoppingListExcludedIngredientsSettingsProps = {
  selectedKeys: readonly string[];
  onChange: (nextKeys: string[]) => void | Promise<boolean>;
};

const SEARCH_RESULT_LIMIT = 8;

export const ShoppingListExcludedIngredientsSettings = ({
  selectedKeys,
  onChange,
}: ShoppingListExcludedIngredientsSettingsProps) => {
  const { t } = useTranslation();
  const { colors: themeColors, isDark } = useNutritionStyles();
  const locale = getCurrentAppLocale();
  const normalizedSelectedKeys = useMemo(
    () => normalizeShoppingListExcludedIngredientKeys(selectedKeys),
    [selectedKeys],
  );
  const selectedKeySet = useMemo(() => new Set(normalizedSelectedKeys), [normalizedSelectedKeys]);
  const selectedIngredientIds = useMemo(
    () => normalizedSelectedKeys.filter(key => key.startsWith('id:')).map(key => key.slice(3)),
    [normalizedSelectedKeys],
  );
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<IngredientSearchResult[]>([]);
  const [selectedIngredients, setSelectedIngredients] = useState<IngredientSettingsOption[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isLoadingSelected, setIsLoadingSelected] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setIsLoadingSelected(true);
    void getIngredientsByIds(selectedIngredientIds, locale)
      .then(ingredients => {
        if (!cancelled) setSelectedIngredients(ingredients);
      })
      .catch(() => {
        if (!cancelled) setSelectedIngredients([]);
      })
      .finally(() => {
        if (!cancelled) setIsLoadingSelected(false);
      });

    return () => {
      cancelled = true;
    };
  }, [locale, selectedIngredientIds]);

  useEffect(() => {
    const normalizedQuery = query.trim();
    if (normalizedQuery.length < 2) {
      setResults([]);
      setIsSearching(false);
      return;
    }

    let cancelled = false;
    setIsSearching(true);
    const timeout = setTimeout(() => {
      void searchIngredients(normalizedQuery, locale, SEARCH_RESULT_LIMIT)
        .then(nextResults => {
          if (!cancelled) setResults(nextResults);
        })
        .catch(() => {
          if (!cancelled) setResults([]);
        })
        .finally(() => {
          if (!cancelled) setIsSearching(false);
        });
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [locale, query]);

  const toggleIngredient = (ingredient: Pick<IngredientSearchResult, 'id' | 'name'>) => {
    const ingredientKey = getShoppingIngredientKey({ name: ingredient.name, source_ref: ingredient.id });
    if (!ingredientKey) return;

    const nextKeys = selectedKeySet.has(ingredientKey)
      ? normalizedSelectedKeys.filter(key => key !== ingredientKey)
      : [...normalizedSelectedKeys, ingredientKey];
    void onChange(normalizeShoppingListExcludedIngredientKeys(nextKeys));
  };

  const removeIngredient = (id: string) => {
    const ingredientKey = `id:${id}`;
    void onChange(normalizedSelectedKeys.filter(key => key !== ingredientKey));
  };

  return (
    <View style={styles.container}>
      <Text style={[styles.description, { color: themeColors.textSecondary }]}>
        {t('nutrition.shoppingListExcludedIngredientsHint')}
      </Text>

      <View
        style={[
          styles.searchShell,
          {
            backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.04)',
            borderColor: themeColors.border,
          },
        ]}
      >
        <Search size={17} color={themeColors.textSecondary} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder={t('nutrition.shoppingListExcludedIngredientsPlaceholder')}
          placeholderTextColor={themeColors.textSecondary}
          style={[styles.searchInput, { color: themeColors.textPrimary }]}
          accessibilityLabel={t('nutrition.shoppingListExcludedIngredientsSearchLabel')}
          autoCapitalize="none"
          autoCorrect={false}
        />
        {isSearching && <ActivityIndicator size="small" color={themeColors.primary} />}
      </View>

      {query.trim().length >= 2 && !isSearching && results.length === 0 && (
        <Text style={[styles.emptyText, { color: themeColors.textSecondary }]}>
          {t('nutrition.shoppingListExcludedIngredientsNoResults')}
        </Text>
      )}

      {results.map(result => {
        const resultKey = getShoppingIngredientKey({ name: result.name, source_ref: result.id });
        const isSelected = resultKey ? selectedKeySet.has(resultKey) : false;
        return (
          <TouchableOpacity
            key={result.id}
            style={[styles.resultRow, { borderBottomColor: themeColors.border }]}
            onPress={() => toggleIngredient(result)}
            activeOpacity={0.75}
            accessibilityRole="button"
            accessibilityLabel={
              isSelected
                ? t('nutrition.shoppingListExcludedIngredientsRemove', { ingredient: result.name })
                : t('nutrition.shoppingListExcludedIngredientsAdd', { ingredient: result.name })
            }
            accessibilityState={{ selected: isSelected }}
          >
            <Text style={[styles.resultName, { color: themeColors.textPrimary }]}>{result.name}</Text>
            {isSelected ? (
              <Check size={18} color={themeColors.primary} />
            ) : (
              <Plus size={18} color={themeColors.primary} />
            )}
          </TouchableOpacity>
        );
      })}

      <View style={styles.selectedHeader}>
        <Text style={[styles.selectedTitle, { color: themeColors.textPrimary }]}>
          {t('nutrition.shoppingListExcludedIngredientsSelected', { count: selectedIngredients.length })}
        </Text>
        {isLoadingSelected && <ActivityIndicator size="small" color={themeColors.primary} />}
      </View>

      {selectedIngredients.length === 0 && !isLoadingSelected ? (
        <Text style={[styles.emptyText, { color: themeColors.textSecondary }]}>
          {t('nutrition.shoppingListExcludedIngredientsEmpty')}
        </Text>
      ) : (
        selectedIngredients.map(ingredient => (
          <View key={ingredient.id} style={[styles.selectedRow, { borderBottomColor: themeColors.border }]}>
            <Text style={[styles.selectedName, { color: themeColors.textPrimary }]}>{ingredient.name}</Text>
            <TouchableOpacity
              onPress={() => removeIngredient(ingredient.id)}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={t('nutrition.shoppingListExcludedIngredientsRemove', {
                ingredient: ingredient.name,
              })}
            >
              <X size={18} color={themeColors.textSecondary} />
            </TouchableOpacity>
          </View>
        ))
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { padding: spacing.m, gap: spacing.s },
  description: { ...typography.caption, lineHeight: 19 },
  searchShell: {
    minHeight: 46,
    borderWidth: 1,
    borderRadius: borderRadius.m,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s,
    paddingHorizontal: spacing.m,
  },
  searchInput: { ...typography.body, flex: 1, minHeight: 44 },
  emptyText: { ...typography.caption, paddingVertical: spacing.xs },
  resultRow: {
    minHeight: 44,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.m,
  },
  resultName: { ...typography.body, flex: 1 },
  selectedHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.s, marginTop: spacing.xs },
  selectedTitle: { ...typography.caption, fontWeight: '700', flex: 1 },
  selectedRow: {
    minHeight: 42,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.m,
  },
  selectedName: { ...typography.body, flex: 1 },
});
