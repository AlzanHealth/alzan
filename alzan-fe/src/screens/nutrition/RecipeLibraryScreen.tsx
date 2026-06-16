import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, FlatList, ActivityIndicator } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { ChevronLeft, Search, Star, Plus, Info } from 'lucide-react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { useTranslation } from 'react-i18next';

import { useNutritionStyles } from '../../hooks/useNutritionStyles';
import { useAuth } from '../../context/AuthContext';
import { borderRadius } from '../../theme';
import { NutritionScreenNavigationProp } from '../../types/navigation.types';
import { MealComponent } from '../../modules/nutrition/types/ingredients';
import { RecipeDetailModal } from '../../modules/nutrition/components/RecipeDetailModal';
import { getMealTypeByHour } from '../../modules/nutrition/constants';
import {
  getDiscoverRecipes,
  getFavoriteRecipeIds,
  getFavoriteRecipes,
  getMySavedRecipes,
  toggleFavoriteRecipe,
} from '../../modules/nutrition/services/recipeLibraryService';

type LibraryTab = 'discover' | 'mine' | 'favorites';

const DISCOVER_PAGE_SIZE = 12;

export const RecipeLibraryScreen = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const navigation = useNavigation<NutritionScreenNavigationProp>();
  const { styles: dynamicStyles, colors: themeColors, isDark } = useNutritionStyles();
  const tabBarHeight = useBottomTabBarHeight();

  const [tab, setTab] = useState<LibraryTab>('discover');
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');

  const [discover, setDiscover] = useState<MealComponent[]>([]);
  const [discoverPage, setDiscoverPage] = useState(1);
  const [discoverTotal, setDiscoverTotal] = useState(0);
  const [discoverLoading, setDiscoverLoading] = useState(false);

  const [detailRecipe, setDetailRecipe] = useState<MealComponent | null>(null);

  const favoriteIdsQuery = useQuery({
    queryKey: ['recipeFavoriteIds', user?.id],
    queryFn: getFavoriteRecipeIds,
    enabled: !!user,
  });
  const favoriteIds = favoriteIdsQuery.data ?? [];

  const favoritesQuery = useQuery({
    queryKey: ['recipeFavorites', favoriteIds],
    queryFn: () => getFavoriteRecipes(favoriteIds),
    enabled: !!user,
  });

  const mineQuery = useQuery({
    queryKey: ['myRecipes', user?.id],
    queryFn: getMySavedRecipes,
    enabled: !!user,
  });

  // Debounce the search box.
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query.trim()), 250);
    return () => clearTimeout(timer);
  }, [query]);

  const loadDiscover = useCallback(
    async (page: number, replace: boolean) => {
      setDiscoverLoading(true);
      try {
        const { recipes, total } = await getDiscoverRecipes(debouncedQuery, page, DISCOVER_PAGE_SIZE);
        setDiscoverTotal(total);
        setDiscover(prev => (replace ? recipes : [...prev, ...recipes]));
        setDiscoverPage(page);
      } catch (error) {
        console.error('[RecipeLibrary] discover load error:', error);
      } finally {
        setDiscoverLoading(false);
      }
    },
    [debouncedQuery],
  );

  useEffect(() => {
    if (tab !== 'discover') return;
    void loadDiscover(1, true);
  }, [tab, loadDiscover]);

  const handleToggleFavorite = async (recipe: MealComponent) => {
    if (!recipe.external_id) return;
    const isFav = favoriteIds.includes(recipe.external_id);
    await toggleFavoriteRecipe(recipe.external_id, isFav);
    queryClient.invalidateQueries({ queryKey: ['recipeFavoriteIds', user?.id] });
    queryClient.invalidateQueries({ queryKey: ['recipeFavorites'] });
  };

  const handleUse = (recipe: MealComponent) => {
    if (!recipe.external_id) return;
    navigation.navigate('MealLogForm', {
      date: format(new Date(), 'yyyy-MM-dd'),
      isExtra: true,
      mealItem: { mealType: getMealTypeByHour() },
      presetRecipeId: recipe.external_id,
      presetRecipeName: recipe.name,
    });
  };

  const listData =
    tab === 'discover' ? discover : tab === 'mine' ? (mineQuery.data ?? []) : (favoritesQuery.data ?? []);
  const isListLoading =
    tab === 'discover'
      ? discoverLoading && discover.length === 0
      : tab === 'mine'
        ? mineQuery.isLoading
        : favoritesQuery.isLoading;
  const canLoadMoreDiscover = tab === 'discover' && discover.length < discoverTotal;

  const renderCard = ({ item }: { item: MealComponent }) => {
    const isFav = item.external_id ? favoriteIds.includes(item.external_id) : false;
    return (
      <View style={[styles.card, dynamicStyles.card, { backgroundColor: isDark ? themeColors.surfaceSolid : '#FFF' }]}>
        <View style={styles.cardTopRow}>
          <Text style={[styles.cardTitle, { color: themeColors.textPrimary }]} numberOfLines={2}>
            {item.name}
          </Text>
          <View style={styles.cardIcons}>
            <TouchableOpacity
              onPress={() => setDetailRecipe(item)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel={t('nutrition.recipeDetail')}
            >
              <Info size={20} color={themeColors.textSecondary} strokeWidth={2} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => handleToggleFavorite(item)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityRole="button"
            >
              <Star
                size={20}
                color={isFav ? '#F5B301' : themeColors.textSecondary}
                fill={isFav ? '#F5B301' : 'transparent'}
                strokeWidth={2}
              />
            </TouchableOpacity>
          </View>
        </View>

        <Text style={[styles.macroLine, { color: themeColors.textSecondary }]} numberOfLines={1}>
          {t('nutrition.recipeMacroLine', {
            kcal: item.kcal_100 ?? 0,
            p: item.protein_g_100 ?? 0,
            c: item.carbs_g_100 ?? 0,
            f: item.fat_g_100 ?? 0,
          })}
        </Text>

        <TouchableOpacity
          style={[styles.useButton, { backgroundColor: themeColors.primary }]}
          onPress={() => handleUse(item)}
          activeOpacity={0.85}
        >
          <Plus size={16} color="#FFFFFF" strokeWidth={2.6} />
          <Text style={styles.useButtonText}>{t('nutrition.recipeUse')}</Text>
        </TouchableOpacity>
      </View>
    );
  };

  const tabs: { key: LibraryTab; label: string }[] = [
    { key: 'discover', label: t('nutrition.recipeLibraryDiscover') },
    { key: 'mine', label: t('nutrition.recipeLibraryMine') },
    { key: 'favorites', label: t('nutrition.recipeLibraryFavorites') },
  ];

  return (
    <LinearGradient colors={dynamicStyles.gradientColors} style={styles.container}>
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={styles.backBtn}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <ChevronLeft size={24} color={themeColors.textPrimary} strokeWidth={2.5} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: themeColors.textPrimary }]}>
            {t('nutrition.recipeLibraryTitle')}
          </Text>
          <View style={styles.backBtn} />
        </View>

        <View style={[styles.tabRow, { backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)' }]}>
          {tabs.map(item => {
            const active = tab === item.key;
            return (
              <TouchableOpacity
                key={item.key}
                style={[styles.tab, active && { backgroundColor: isDark ? themeColors.surfaceSolid : '#FFF' }]}
                onPress={() => setTab(item.key)}
              >
                <Text style={[styles.tabText, { color: active ? themeColors.primary : themeColors.textSecondary }]}>
                  {item.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {tab === 'discover' && (
          <View style={[styles.searchBar, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#FFF' }]}>
            <Search size={18} color={themeColors.textSecondary} />
            <TextInput
              style={[styles.searchInput, { color: themeColors.textPrimary }]}
              placeholder={t('nutrition.recipeLibrarySearchPlaceholder')}
              placeholderTextColor={themeColors.textSecondary}
              value={query}
              onChangeText={setQuery}
            />
          </View>
        )}

        {isListLoading ? (
          <View style={styles.centerState}>
            <ActivityIndicator color={themeColors.primary} />
          </View>
        ) : (
          <FlatList
            data={listData}
            keyExtractor={item => item.id}
            renderItem={renderCard}
            contentContainerStyle={[styles.listContent, { paddingBottom: tabBarHeight + 24 }]}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={
              <View style={styles.centerState}>
                <Text style={[styles.emptyText, { color: themeColors.textSecondary }]}>
                  {t('nutrition.recipeLibraryEmpty')}
                </Text>
              </View>
            }
            ListFooterComponent={
              canLoadMoreDiscover ? (
                <TouchableOpacity
                  style={[styles.loadMore, { borderColor: themeColors.primary + '55' }]}
                  onPress={() => loadDiscover(discoverPage + 1, false)}
                  disabled={discoverLoading}
                >
                  {discoverLoading ? (
                    <ActivityIndicator size="small" color={themeColors.primary} />
                  ) : (
                    <Text style={[styles.loadMoreText, { color: themeColors.primary }]}>
                      {t('nutrition.recipeLoadMore')}
                    </Text>
                  )}
                </TouchableOpacity>
              ) : null
            }
          />
        )}

        <RecipeDetailModal
          recipe={detailRecipe}
          visible={detailRecipe !== null}
          onClose={() => setDetailRecipe(null)}
          onUse={handleUse}
        />
      </SafeAreaView>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '700' },
  tabRow: {
    flexDirection: 'row',
    marginHorizontal: 16,
    borderRadius: borderRadius.l,
    padding: 4,
    gap: 4,
  },
  tab: { flex: 1, paddingVertical: 8, borderRadius: borderRadius.m, alignItems: 'center' },
  tabText: { fontSize: 14, fontWeight: '600' },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginTop: 12,
    paddingHorizontal: 12,
    height: 44,
    borderRadius: borderRadius.l,
  },
  searchInput: { flex: 1, fontSize: 15 },
  listContent: { padding: 16, gap: 12 },
  card: { borderRadius: borderRadius.l, padding: 16 },
  cardTopRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 },
  cardTitle: { flex: 1, fontSize: 16, fontWeight: '700', lineHeight: 21 },
  cardIcons: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingTop: 1 },
  macroLine: { fontSize: 13, marginTop: 8 },
  useButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 14,
    paddingVertical: 11,
    borderRadius: borderRadius.m,
  },
  useButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  centerState: { paddingTop: 60, alignItems: 'center', justifyContent: 'center' },
  emptyText: { fontSize: 14 },
  loadMore: {
    marginTop: 4,
    paddingVertical: 12,
    borderRadius: borderRadius.m,
    borderWidth: 1,
    alignItems: 'center',
  },
  loadMoreText: { fontSize: 14, fontWeight: '600' },
});
