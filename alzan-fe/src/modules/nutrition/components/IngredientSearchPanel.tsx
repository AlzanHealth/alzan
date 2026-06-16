// src/modules/nutrition/components/IngredientSearchPanel.tsx
// Full search panel with filters for finding ingredients in the database

import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import {
  Search,
  X,
  Plus,
  ChevronRight,
  SlidersHorizontal,
  ChevronDown,
  ChevronUp,
  Info,
  ScanBarcode,
} from 'lucide-react-native';
import { useNutritionStyles } from '../../../hooks/useNutritionStyles';
import { IngredientCategoryFilter, CATEGORY_LABELS } from './IngredientCategoryFilter';
import { AlphabetFilter } from './AlphabetFilter';
import { searchFoodsWithFilters } from '../services/nutritionSearchService';
import { FoodSearchResult } from '../types/ingredients';
import { IngredientDetailModal } from './IngredientDetailModal';
import { IngredientsCategory } from '../../../types/requests.types';
import { useTranslation } from 'react-i18next';
import { getCurrentAppLocale } from '../../../services/localization';

interface IngredientSearchPanelProps {
  onSelect: (food: FoodSearchResult) => void;
  onGoToManual: () => void;
  // When provided, a barcode icon is shown inside the search bar (merges scan
  // into search instead of a separate mode/tab).
  onScan?: () => void;
}

const INGREDIENT_PAGE_SIZE = 10;

export const IngredientSearchPanel: React.FC<IngredientSearchPanelProps> = ({ onSelect, onGoToManual, onScan }) => {
  const { t } = useTranslation();
  const languageCode = getCurrentAppLocale();
  const { colors: themeColors, isDark } = useNutritionStyles();

  // Filter states
  const [query, setQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<IngredientsCategory | 'todas'>('todas');
  const [selectedLetter, setSelectedLetter] = useState('todas');
  const [showFilters, setShowFilters] = useState(false);

  // Results state
  const [results, setResults] = useState<FoodSearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [visibleLimit, setVisibleLimit] = useState(INGREDIENT_PAGE_SIZE);
  const [canLoadMore, setCanLoadMore] = useState(false);

  // Detail modal state
  const [detailIngredient, setDetailIngredient] = useState<FoodSearchResult | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);

  // Debounced search
  useEffect(() => {
    setVisibleLimit(INGREDIENT_PAGE_SIZE);
  }, [query, selectedCategory, selectedLetter, languageCode]);

  useEffect(() => {
    const timer = setTimeout(() => {
      performSearch();
    }, 300);

    return () => clearTimeout(timer);
  }, [query, selectedCategory, selectedLetter, languageCode, visibleLimit]);

  const performSearch = useCallback(async () => {
    // Only require filters OR a query to search
    const hasFilters = selectedCategory !== 'todas' || selectedLetter !== 'todas';
    const hasQuery = query.length >= 2;

    if (!hasFilters && !hasQuery) {
      setResults([]);
      setHasSearched(false);
      setCanLoadMore(false);
      return;
    }

    setIsLoading(true);
    setHasSearched(true);

    try {
      const foods = await searchFoodsWithFilters(
        {
          query: query.length >= 2 ? query : undefined,
          category: selectedCategory !== 'todas' ? selectedCategory : undefined,
          letter: selectedLetter !== 'todas' ? selectedLetter : undefined,
        },
        languageCode,
        {
          maxResults: visibleLimit,
        },
      );
      setResults(foods);
      setCanLoadMore(foods.length >= visibleLimit);
    } catch (error) {
      console.error('Search failed:', error);
      setResults([]);
      setCanLoadMore(false);
    } finally {
      setIsLoading(false);
    }
  }, [query, selectedCategory, selectedLetter, languageCode, visibleLimit]);

  const handleClear = () => {
    setQuery('');
  };

  const handleResetFilters = () => {
    setQuery('');
    setSelectedCategory('todas');
    setSelectedLetter('todas');
    setResults([]);
    setHasSearched(false);
    setCanLoadMore(false);
    setVisibleLimit(INGREDIENT_PAGE_SIZE);
  };

  const handleSelectFood = (food: FoodSearchResult) => {
    onSelect(food);
    // Optionally reset state after selection
    setQuery('');
  };

  // Active filters count for display
  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (selectedCategory !== 'todas') count++;
    if (selectedLetter !== 'todas') count++;
    if (query.length >= 2) count++;
    return count;
  }, [selectedCategory, selectedLetter, query]);

  const ListEmptyComponent = useMemo(() => {
    if (isLoading) return null;
    if (!hasSearched) {
      return (
        <View style={styles.emptyState}>
          <Text style={[styles.emptyTitle, { color: themeColors.textSecondary }]}>{t('nutrition.searchFood')}</Text>
          <Text style={[styles.emptySubtitle, { color: themeColors.textSecondary }]}>
            {t('nutrition.searchBarHint')}
          </Text>
        </View>
      );
    }
    return (
      <View style={styles.emptyState}>
        <Text style={[styles.emptyTitle, { color: themeColors.textPrimary }]}>{t('nutrition.noFoodsFound')}</Text>
        <Text style={[styles.emptySubtitle, { color: themeColors.textSecondary }]}>
          {t('nutrition.tryFiltersOrCreate')}
        </Text>
        <TouchableOpacity style={[styles.manualCta, { backgroundColor: themeColors.primary }]} onPress={onGoToManual}>
          <Text style={styles.manualCtaText}>{t('nutrition.goToManualCreate')}</Text>
          <ChevronRight size={18} color="#FFF" />
        </TouchableOpacity>
      </View>
    );
  }, [isLoading, hasSearched, themeColors, onGoToManual]);

  return (
    <View style={styles.container}>
      {/* Search Input */}
      <View style={styles.searchRow}>
        <View
          style={[styles.inputContainer, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)' }]}
        >
          <Search size={18} color={themeColors.textSecondary} style={styles.searchIcon} />
          <TextInput
            style={[styles.input, { color: themeColors.textPrimary }]}
            value={query}
            onChangeText={setQuery}
            placeholder={t('nutrition.searchFood')}
            placeholderTextColor={themeColors.textSecondary}
            returnKeyType="search"
            autoCorrect={false}
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={handleClear} style={styles.clearBtn}>
              <X size={16} color={themeColors.textSecondary} />
            </TouchableOpacity>
          )}
          {onScan && (
            <TouchableOpacity
              onPress={onScan}
              style={styles.scanBtn}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
              accessibilityRole="button"
              accessibilityLabel={t('nutrition.scan')}
            >
              <ScanBarcode size={18} color={themeColors.primary} strokeWidth={2.2} />
            </TouchableOpacity>
          )}
        </View>
        {activeFiltersCount > 0 && (
          <TouchableOpacity style={styles.resetBtn} onPress={handleResetFilters}>
            <Text style={[styles.resetText, { color: themeColors.primary }]}>{t('nutrition.clear')}</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Filter Toggle Button */}
      <TouchableOpacity
        style={[
          styles.filterToggle,
          { backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)' },
          showFilters && { backgroundColor: themeColors.primary + '15' },
        ]}
        onPress={() => setShowFilters(!showFilters)}
      >
        <SlidersHorizontal size={16} color={showFilters ? themeColors.primary : themeColors.textSecondary} />
        <Text
          style={[styles.filterToggleText, { color: showFilters ? themeColors.primary : themeColors.textSecondary }]}
        >
          {t('nutrition.filters')}
          {activeFiltersCount > 0 ? ` (${activeFiltersCount})` : ''}
        </Text>
        {showFilters ? (
          <ChevronUp size={16} color={showFilters ? themeColors.primary : themeColors.textSecondary} />
        ) : (
          <ChevronDown size={16} color={themeColors.textSecondary} />
        )}
      </TouchableOpacity>

      {/* Collapsible Filters */}
      {showFilters && (
        <>
          {/* Category Filter */}
          <View style={styles.filterSection}>
            <Text style={[styles.filterLabel, { color: themeColors.textSecondary }]}>{t('nutrition.category')}</Text>
            <IngredientCategoryFilter selected={selectedCategory} onSelect={setSelectedCategory} />
          </View>

          {/* Alphabet Filter */}
          <View style={styles.filterSection}>
            <Text style={[styles.filterLabel, { color: themeColors.textSecondary }]}>
              {t('nutrition.initialLetter')}
            </Text>
            <AlphabetFilter selected={selectedLetter} onSelect={setSelectedLetter} />
          </View>
        </>
      )}

      {/* Results */}
      <View style={styles.resultsSection}>
        {isLoading && results.length === 0 ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator color={themeColors.primary} size="small" />
            <Text style={[styles.loadingText, { color: themeColors.textSecondary }]}>{t('common.loading')}</Text>
          </View>
        ) : results.length > 0 ? (
          <View>
            {results.map(item => {
              // Determine badge text based on itemType
              const isRecipe = item.itemType === 'recipe';
              const isPrecooked = item.category === 'precocinado';
              let badgeText = '';
              let badgeColor = themeColors.primary;

              if (isRecipe) {
                badgeText = t('nutrition.recipe') as string;
                badgeColor = '#34C759'; // Green for recipes
              } else if (isPrecooked) {
                badgeText = t('nutrition.preCooked') as string;
                badgeColor = '#FF9500'; // Orange for precooked
              } else {
                badgeText = item.category
                  ? String(t(CATEGORY_LABELS[item.category]))
                  : (t('nutrition.ingredientSingular') as string);
              }

              return (
                <TouchableOpacity
                  key={item.id}
                  style={[
                    styles.resultItem,
                    { backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)' },
                  ]}
                  onPress={() => handleSelectFood(item)}
                  activeOpacity={0.7}
                >
                  <View style={styles.resultInfo}>
                    <Text style={[styles.resultName, { color: themeColors.textPrimary }]} numberOfLines={1}>
                      {item.name}
                    </Text>
                    <View style={styles.resultMeta}>
                      <View style={[styles.categoryBadge, { backgroundColor: badgeColor + '20' }]}>
                        <Text style={[styles.categoryText, { color: badgeColor }]}>{badgeText}</Text>
                      </View>
                      <Text style={[styles.resultMacros, { color: themeColors.textSecondary }]}>
                        {item.kcal_100}
                        {t('nutrition.kcalPer100g')}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.resultActions}>
                    <TouchableOpacity
                      style={styles.infoBtn}
                      onPress={() => {
                        setDetailIngredient(item);
                        setShowDetailModal(true);
                      }}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Info size={18} color={themeColors.textSecondary} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.addBtn}
                      onPress={() => handleSelectFood(item)}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Plus size={20} color={themeColors.primary} />
                    </TouchableOpacity>
                  </View>
                </TouchableOpacity>
              );
            })}
            {canLoadMore && (
              <TouchableOpacity
                style={[styles.loadMoreButton, { borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)' }]}
                onPress={() => setVisibleLimit(previous => previous + INGREDIENT_PAGE_SIZE)}
                disabled={isLoading}
              >
                {isLoading ? (
                  <ActivityIndicator size="small" color={themeColors.primary} />
                ) : (
                  <Text style={[styles.loadMoreText, { color: themeColors.primary }]}>{t('common.loadMore')}</Text>
                )}
              </TouchableOpacity>
            )}
          </View>
        ) : (
          ListEmptyComponent
        )}
      </View>

      {/* Ingredient Detail Modal */}
      <IngredientDetailModal
        visible={showDetailModal}
        ingredient={detailIngredient}
        onClose={() => setShowDetailModal(false)}
        onSelect={onSelect}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 8,
  },
  inputContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    paddingHorizontal: 12,
  },
  searchIcon: {
    marginRight: 8,
  },
  input: {
    flex: 1,
    paddingVertical: 12,
    fontSize: 16,
  },
  clearBtn: {
    padding: 4,
  },
  scanBtn: {
    padding: 4,
    marginLeft: 2,
  },
  resetBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  resetText: {
    fontSize: 14,
    fontWeight: '500',
  },
  filterToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
    marginBottom: 8,
    gap: 6,
  },
  filterToggleText: {
    fontSize: 14,
    fontWeight: '500',
  },
  filterSection: {
    marginBottom: 8,
  },
  filterLabel: {
    fontSize: 12,
    fontWeight: '500',
    marginLeft: 4,
    marginBottom: 4,
  },
  resultsSection: {
    flex: 1,
    minHeight: 200,
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 24,
    gap: 8,
  },
  loadingText: {
    fontSize: 14,
  },
  emptyContainer: {
    flexGrow: 1,
  },
  resultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 10,
    marginBottom: 6,
  },
  resultInfo: {
    flex: 1,
  },
  resultName: {
    fontSize: 15,
    fontWeight: '500',
  },
  resultMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    gap: 8,
  },
  categoryBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  categoryText: {
    fontSize: 11,
    fontWeight: '500',
  },
  resultMacros: {
    fontSize: 12,
  },
  resultActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  loadMoreButton: {
    marginTop: 8,
    borderWidth: 1,
    borderRadius: 12,
    minHeight: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadMoreText: {
    fontSize: 14,
    fontWeight: '600',
  },
  infoBtn: {
    padding: 6,
  },
  addBtn: {
    padding: 6,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 32,
    paddingHorizontal: 16,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  emptySubtitle: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 16,
  },
  manualCta: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    gap: 4,
  },
  manualCtaText: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '600',
  },
});
