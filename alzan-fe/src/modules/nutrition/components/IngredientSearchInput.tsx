// src/modules/nutrition/components/IngredientSearchInput.tsx
// Search input for finding foods in the ingredients database

import React, { useState, useCallback, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { Search, Plus, X } from 'lucide-react-native';
import { nutritionSearchService } from '../services/nutritionSearchService';
import { FoodSearchResult } from '../types/ingredients';
import { GlassCard } from '../../../components/GlassCard';
import { useTranslation } from 'react-i18next';
import { useNutritionStyles } from '../../../hooks/useNutritionStyles';
import { getCurrentAppLocale } from '../../../services/localization';

interface IngredientSearchInputProps {
  onSelect: (food: FoodSearchResult) => void;
  placeholder?: string;
}

const INGREDIENT_PAGE_SIZE = 10;

export const IngredientSearchInput: React.FC<IngredientSearchInputProps> = ({
  onSelect,
  placeholder = 'Buscar alimento (ej: arroz, pollo...)',
}) => {
  const { t } = useTranslation();
  const languageCode = getCurrentAppLocale();
  const { colors: themeColors, isDark } = useNutritionStyles();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<FoodSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [visibleLimit, setVisibleLimit] = useState(INGREDIENT_PAGE_SIZE);
  const [canLoadMore, setCanLoadMore] = useState(false);

  // Debounced search with useEffect
  useEffect(() => {
    if (query.length < 2) {
      setResults([]);
      setHasSearched(false);
      setCanLoadMore(false);
      return;
    }

    const timer = setTimeout(() => {
      handleSearch();
    }, 600); // 600ms debounce

    return () => clearTimeout(timer);
  }, [query, languageCode, visibleLimit]);

  useEffect(() => {
    setVisibleLimit(INGREDIENT_PAGE_SIZE);
  }, [query, languageCode]);

  const handleSearch = useCallback(async () => {
    if (query.length < 2) {
      setResults([]);
      setCanLoadMore(false);
      return;
    }

    setIsSearching(true);
    setHasSearched(true);

    try {
      const foods = await nutritionSearchService.searchFoodsWithFilters({ query }, languageCode, {
        maxResults: visibleLimit,
      });
      setResults(foods);
      setCanLoadMore(foods.length >= visibleLimit);
    } catch (error) {
      console.error('Search failed:', error);
      setResults([]);
      setCanLoadMore(false);
    } finally {
      setIsSearching(false);
    }
  }, [query, languageCode, visibleLimit]);

  const handleSelectFood = (food: FoodSearchResult) => {
    onSelect(food);
    setQuery('');
    setResults([]);
    setHasSearched(false);
    setCanLoadMore(false);
    setVisibleLimit(INGREDIENT_PAGE_SIZE);
  };

  const handleClear = () => {
    setQuery('');
    setResults([]);
    setHasSearched(false);
  };

  return (
    <View style={styles.container}>
      <View style={styles.inputRow}>
        <View
          style={[styles.inputContainer, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)' }]}
        >
          <Search size={18} color={themeColors.textSecondary} style={styles.searchIcon} />
          <TextInput
            style={[styles.input, { color: themeColors.textPrimary }]}
            value={query}
            onChangeText={setQuery}
            placeholder={placeholder}
            placeholderTextColor={themeColors.textSecondary}
            returnKeyType="search"
            onSubmitEditing={handleSearch}
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={handleClear} style={styles.clearBtn}>
              <X size={16} color={themeColors.textSecondary} />
            </TouchableOpacity>
          )}
        </View>
        <TouchableOpacity
          style={[styles.searchBtn, query.length < 2 && styles.searchBtnDisabled]}
          onPress={handleSearch}
          disabled={query.length < 2 || isSearching}
        >
          {isSearching ? <ActivityIndicator color="#FFF" size="small" /> : <Search size={18} color="#FFF" />}
        </TouchableOpacity>
      </View>

      {/* Results */}
      {(results.length > 0 || (hasSearched && !isSearching)) && (
        <GlassCard style={styles.resultsCard}>
          {results.length === 0 ? (
            <Text style={[styles.noResults, { color: themeColors.textSecondary }]}>
              {t('nutrition.noResultsFound')}
            </Text>
          ) : (
            <ScrollView
              style={styles.resultsList}
              showsVerticalScrollIndicator={false}
              nestedScrollEnabled={true}
              keyboardShouldPersistTaps="handled"
            >
              {results.map(item => (
                <TouchableOpacity
                  key={item.id}
                  style={[
                    styles.resultItem,
                    { borderBottomColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)' },
                  ]}
                  onPress={() => handleSelectFood(item)}
                >
                  <View style={styles.resultInfo}>
                    <Text style={[styles.resultName, { color: themeColors.textPrimary }]} numberOfLines={1}>
                      {item.name}
                    </Text>
                    <Text style={[styles.resultMacros, { color: themeColors.textSecondary }]}>
                      {item.kcal_100}
                      {t('nutrition.kcalProtein')}
                      {item.protein_g_100}
                      {t('nutrition.gramsCarbs')}
                      {item.carbs_g_100}
                      {t('nutrition.gramsFat')}
                      {item.fat_g_100}g
                    </Text>
                  </View>
                  <Plus size={20} color="#007AFF" />
                </TouchableOpacity>
              ))}
              {canLoadMore && (
                <TouchableOpacity
                  style={[styles.loadMoreButton, { borderColor: themeColors.primary }]}
                  onPress={() => setVisibleLimit(previous => previous + INGREDIENT_PAGE_SIZE)}
                  disabled={isSearching}
                >
                  {isSearching ? (
                    <ActivityIndicator size="small" color={themeColors.primary} />
                  ) : (
                    <Text style={[styles.loadMoreText, { color: themeColors.primary }]}>{t('common.loadMore')}</Text>
                  )}
                </TouchableOpacity>
              )}
            </ScrollView>
          )}
        </GlassCard>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
  },
  inputRow: {
    flexDirection: 'row',
    gap: 8,
  },
  inputContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.05)',
    borderRadius: 12,
    paddingHorizontal: 12,
  },
  searchIcon: {
    marginRight: 8,
  },
  input: {
    flex: 1,
    paddingVertical: 14,
    fontSize: 16,
    color: '#333',
  },
  clearBtn: {
    padding: 4,
  },
  searchBtn: {
    backgroundColor: '#007AFF',
    borderRadius: 12,
    width: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchBtnDisabled: {
    backgroundColor: '#CCC',
  },
  resultsCard: {
    marginTop: 8,
    padding: 8,
    maxHeight: 250,
  },
  resultsList: {
    maxHeight: 230,
  },
  resultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.05)',
  },
  resultInfo: {
    flex: 1,
  },
  resultName: {
    fontSize: 15,
    fontWeight: '500',
    color: '#333',
  },
  resultMacros: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  noResults: {
    textAlign: 'center',
    color: '#999',
    padding: 20,
  },
  loadMoreButton: {
    marginTop: 8,
    marginBottom: 4,
    borderWidth: 1,
    borderRadius: 10,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadMoreText: {
    fontSize: 14,
    fontWeight: '600',
  },
});
