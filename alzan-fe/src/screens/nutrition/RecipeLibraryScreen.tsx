import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, FlatList, ActivityIndicator, Modal } from 'react-native';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { ChevronLeft, Search, Star, Plus, Info, Flame, Pencil, Trash2 } from 'lucide-react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { useNutritionStyles } from '../../hooks/useNutritionStyles';
import { useAuth } from '../../context/AuthContext';
import { borderRadius } from '../../theme';
import { NutritionScreenNavigationProp, NutritionStackParamList } from '../../types/navigation.types';
import { TranslationKey } from '../../i18n/locales/en';
import { MealType } from '../../types/requests.types';
import { MealComponent } from '../../modules/nutrition/types/ingredients';
import { RecipeDetailModal } from '../../modules/nutrition/components/RecipeDetailModal';
import { FilterDropdown } from '../../modules/nutrition/components/FilterDropdown';
import { MEAL_TYPE_LABELS } from '../../modules/nutrition/constants';
import { usePreferences } from '../../hooks/settings/usePreferences';
import { Alert } from '../../components/common/Alert';
import {
  getDiscoverRecipes,
  getFavoriteRecipeIds,
  getFavoriteRecipes,
  getMySavedRecipes,
  isRecipeRising,
  softDeleteOwnRecipe,
  toggleFavoriteRecipe,
  DiscoverSort,
  DiscoverCategory,
} from '../../modules/nutrition/services/recipeLibraryService';
import {
  formatNutritionDayDate,
  normalizeNutritionDayRolloverTime,
} from '../../modules/nutrition/services/nutritionDay';

type LibraryTab = 'discover' | 'mine' | 'favorites';

const DISCOVER_PAGE_SIZE = 12;
const DEFAULT_MEAL_TYPES: MealType[] = ['breakfast', 'almuerzo', 'lunch', 'merienda', 'dinner', 'snack'];

const DISCOVER_SORTS: { key: DiscoverSort; labelKey: TranslationKey }[] = [
  { key: 'recommended', labelKey: 'nutrition.discoverSortRecommended' },
  { key: 'week', labelKey: 'nutrition.discoverSortWeek' },
  { key: 'month', labelKey: 'nutrition.discoverSortMonth' },
  { key: 'saved', labelKey: 'nutrition.discoverSortSaved' },
];

const DISCOVER_CATEGORIES: { key: DiscoverCategory; labelKey: TranslationKey }[] = [
  { key: 'all', labelKey: 'nutrition.discoverCategoryAll' },
  { key: 'high_protein', labelKey: 'nutrition.discoverCategoryProtein' },
  { key: 'low_cal', labelKey: 'nutrition.discoverCategoryLowCal' },
  { key: 'high_carb', labelKey: 'nutrition.discoverCategoryCarbs' },
];

export const RecipeLibraryScreen = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const navigation = useNavigation<NutritionScreenNavigationProp>();
  const route = useRoute<RouteProp<NutritionStackParamList, 'RecipeLibrary'>>();
  const { styles: dynamicStyles, colors: themeColors, isDark } = useNutritionStyles();
  const { preferences } = usePreferences();
  const tabBarHeight = useBottomTabBarHeight();
  const nutritionDayRolloverTime = normalizeNutritionDayRolloverTime(
    preferences?.nutrition_prefs?.nutrition_day_rollover_time,
  );
  const targetDate = route.params?.date ?? formatNutritionDayDate(new Date(), nutritionDayRolloverTime);
  const targetMealType = route.params?.mealType;

  const [tab, setTab] = useState<LibraryTab>('discover');
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');

  const [discover, setDiscover] = useState<MealComponent[]>([]);
  const [discoverPage, setDiscoverPage] = useState(1);
  const [discoverTotal, setDiscoverTotal] = useState(0);
  const [discoverLoading, setDiscoverLoading] = useState(false);
  const [discoverSort, setDiscoverSort] = useState<DiscoverSort>('recommended');
  const [discoverCategory, setDiscoverCategory] = useState<DiscoverCategory>('all');

  const [detailRecipe, setDetailRecipe] = useState<MealComponent | null>(null);
  const [pendingMealRecipe, setPendingMealRecipe] = useState<MealComponent | null>(null);
  const [deletingRecipeId, setDeletingRecipeId] = useState<string | null>(null);

  const enabledMeals = preferences?.nutrition_prefs?.enabled_meals;
  const selectableMealTypes = useMemo(() => {
    const visibleTypes = DEFAULT_MEAL_TYPES.filter(type => !enabledMeals || enabledMeals[type] !== false);
    return visibleTypes.length > 0 ? visibleTypes : DEFAULT_MEAL_TYPES;
  }, [enabledMeals]);

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
        const { recipes, total } = await getDiscoverRecipes({
          query: debouncedQuery,
          page,
          pageSize: DISCOVER_PAGE_SIZE,
          sort: discoverSort,
          category: discoverCategory,
        });
        setDiscoverTotal(total);
        setDiscover(prev => (replace ? recipes : [...prev, ...recipes]));
        setDiscoverPage(page);
      } catch (error) {
        console.error('[RecipeLibrary] discover load error:', error);
      } finally {
        setDiscoverLoading(false);
      }
    },
    [debouncedQuery, discoverSort, discoverCategory],
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

  const openRecipeInMealLog = useCallback(
    (recipe: MealComponent, mealType: MealType) => {
      if (!recipe.external_id) return;
      navigation.navigate('MealLogForm', {
        date: targetDate,
        isExtra: true,
        mealItem: { mealType },
        presetRecipeId: recipe.external_id,
        presetRecipeName: recipe.name,
      });
    },
    [navigation, targetDate],
  );

  const handleUse = (recipe: MealComponent) => {
    if (!recipe.external_id) return;
    setDetailRecipe(null);

    if (targetMealType) {
      openRecipeInMealLog(recipe, targetMealType);
      return;
    }

    setPendingMealRecipe(recipe);
  };

  const handleSelectMealType = (mealType: MealType) => {
    if (!pendingMealRecipe) return;
    const recipe = pendingMealRecipe;
    setPendingMealRecipe(null);
    openRecipeInMealLog(recipe, mealType);
  };

  const invalidateRecipeLists = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['myRecipes'] }),
      queryClient.invalidateQueries({ queryKey: ['recipeFavoriteIds'] }),
      queryClient.invalidateQueries({ queryKey: ['recipeFavorites'] }),
    ]);
  };

  const handleEditRecipe = (recipe: MealComponent) => {
    if (!recipe.external_id) return;
    setDetailRecipe(null);
    navigation.navigate('MealLogForm', {
      date: targetDate,
      editRecipeId: recipe.external_id,
      recipeEditorOnly: true,
    });
  };

  const deleteRecipe = async (recipe: MealComponent) => {
    if (!user?.id || !recipe.external_id) return;

    setDeletingRecipeId(recipe.external_id);
    try {
      const result = await softDeleteOwnRecipe(recipe.external_id, user.id);
      if (!result.success) {
        Alert.alert(t('common.error'), t('nutrition.recipeDeleteError'));
        return;
      }

      queryClient.setQueryData<MealComponent[]>(['myRecipes', user.id], previous =>
        previous?.filter(item => item.external_id !== recipe.external_id),
      );
      queryClient.setQueryData<MealComponent[]>(['recipeFavorites', favoriteIds], previous =>
        previous?.filter(item => item.external_id !== recipe.external_id),
      );
      setDiscover(prev => prev.filter(item => item.external_id !== recipe.external_id));
      setDetailRecipe(current => (current?.external_id === recipe.external_id ? null : current));
      await invalidateRecipeLists();
      Alert.alert(t('nutrition.recipeDeletedTitle'), t('nutrition.recipeDeletedMessage'));
    } finally {
      setDeletingRecipeId(null);
    }
  };

  const handleDeleteRecipe = (recipe: MealComponent) => {
    Alert.alert(t('nutrition.deleteRecipeTitle'), t('nutrition.deleteRecipeMessage', { name: recipe.name }), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: () => {
          void deleteRecipe(recipe);
        },
      },
    ]);
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
    const rising = tab === 'discover' && isRecipeRising(item);
    const canManageRecipe = tab === 'mine' && item.recipe_source === 'user' && item.recipe_owner_user_id === user?.id;
    const isDeleting = deletingRecipeId === item.external_id;
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

        {rising && (
          <View style={[styles.risingBadge, { backgroundColor: '#FF6B0018' }]}>
            <Flame size={13} color="#FF6B00" strokeWidth={2.4} />
            <Text style={styles.risingBadgeText}>{t('nutrition.discoverRising')}</Text>
          </View>
        )}

        <Text style={[styles.macroLine, { color: themeColors.textSecondary }]} numberOfLines={1}>
          {t('nutrition.recipeMacroLine', {
            kcal: item.kcal_100 ?? 0,
            p: item.protein_g_100 ?? 0,
            c: item.carbs_g_100 ?? 0,
            f: item.fat_g_100 ?? 0,
          })}
        </Text>

        {canManageRecipe ? (
          <View style={styles.cardActionRow}>
            <TouchableOpacity
              style={[styles.actionButton, { backgroundColor: themeColors.primary }]}
              onPress={() => handleUse(item)}
              activeOpacity={0.85}
            >
              <Plus size={16} color="#FFFFFF" strokeWidth={2.6} />
              <Text style={styles.actionButtonText}>{t('nutrition.recipeUse')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.iconActionButton,
                { borderColor: themeColors.primary + '55', backgroundColor: themeColors.primary + '12' },
              ]}
              onPress={() => handleEditRecipe(item)}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel={t('nutrition.editRecipeAction')}
            >
              <Pencil size={17} color={themeColors.primary} strokeWidth={2.4} />
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.iconActionButton,
                { borderColor: themeColors.danger + '55', backgroundColor: themeColors.danger + '12' },
                isDeleting && { opacity: 0.5 },
              ]}
              onPress={() => handleDeleteRecipe(item)}
              activeOpacity={0.85}
              disabled={isDeleting}
              accessibilityRole="button"
              accessibilityLabel={t('nutrition.deleteRecipeAction')}
            >
              {isDeleting ? (
                <ActivityIndicator size="small" color={themeColors.danger} />
              ) : (
                <Trash2 size={17} color={themeColors.danger} strokeWidth={2.4} />
              )}
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity
            style={[styles.useButton, { backgroundColor: themeColors.primary }]}
            onPress={() => handleUse(item)}
            activeOpacity={0.85}
          >
            <Plus size={16} color="#FFFFFF" strokeWidth={2.6} />
            <Text style={styles.useButtonText}>{t('nutrition.recipeUse')}</Text>
          </TouchableOpacity>
        )}
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

        {tab === 'discover' && (
          <View style={styles.filtersRow}>
            <FilterDropdown
              value={discoverSort}
              options={DISCOVER_SORTS.map(option => ({ key: option.key, label: t(option.labelKey) }))}
              onChange={setDiscoverSort}
            />
            <FilterDropdown
              value={discoverCategory}
              options={DISCOVER_CATEGORIES.map(option => ({ key: option.key, label: t(option.labelKey) }))}
              onChange={setDiscoverCategory}
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
          onEdit={
            detailRecipe?.recipe_source === 'user' && detailRecipe.recipe_owner_user_id === user?.id
              ? handleEditRecipe
              : undefined
          }
          onDelete={
            detailRecipe?.recipe_source === 'user' && detailRecipe.recipe_owner_user_id === user?.id
              ? handleDeleteRecipe
              : undefined
          }
          isDeleting={deletingRecipeId === detailRecipe?.external_id}
        />

        <Modal
          transparent
          visible={pendingMealRecipe !== null}
          animationType="fade"
          onRequestClose={() => setPendingMealRecipe(null)}
        >
          <View style={styles.mealPickerBackdrop}>
            <View style={[styles.mealPickerCard, { backgroundColor: isDark ? themeColors.surfaceSolid : '#FFFFFF' }]}>
              <Text style={[styles.mealPickerTitle, { color: themeColors.textPrimary }]}>
                {t('nutrition.selectMealForRecipe')}
              </Text>
              <Text style={[styles.mealPickerSubtitle, { color: themeColors.textSecondary }]} numberOfLines={2}>
                {pendingMealRecipe?.name}
              </Text>

              <View style={styles.mealPickerOptions}>
                {selectableMealTypes.map(mealType => (
                  <TouchableOpacity
                    key={mealType}
                    style={[
                      styles.mealPickerOption,
                      {
                        borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)',
                        backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)',
                      },
                    ]}
                    onPress={() => handleSelectMealType(mealType)}
                    activeOpacity={0.85}
                  >
                    <Text style={[styles.mealPickerOptionText, { color: themeColors.textPrimary }]}>
                      {t(MEAL_TYPE_LABELS[mealType])}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <TouchableOpacity
                style={styles.mealPickerCancel}
                onPress={() => setPendingMealRecipe(null)}
                activeOpacity={0.85}
              >
                <Text style={[styles.mealPickerCancelText, { color: themeColors.primary }]}>{t('common.cancel')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
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
  filtersRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingTop: 12 },
  listContent: { padding: 16, gap: 12 },
  card: { borderRadius: borderRadius.l, padding: 16 },
  risingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    marginTop: 8,
  },
  risingBadgeText: { fontSize: 12, fontWeight: '700', color: '#FF6B00' },
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
  cardActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 14,
  },
  actionButton: {
    flex: 1,
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 12,
    borderRadius: borderRadius.m,
  },
  actionButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  iconActionButton: {
    width: 44,
    height: 44,
    borderRadius: borderRadius.m,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
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
  mealPickerBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.36)',
    padding: 16,
  },
  mealPickerCard: {
    borderRadius: borderRadius.l,
    padding: 16,
    gap: 12,
  },
  mealPickerTitle: { fontSize: 18, fontWeight: '700' },
  mealPickerSubtitle: { fontSize: 14, lineHeight: 19 },
  mealPickerOptions: { gap: 8 },
  mealPickerOption: {
    minHeight: 46,
    borderWidth: 1,
    borderRadius: borderRadius.m,
    paddingHorizontal: 14,
    justifyContent: 'center',
  },
  mealPickerOptionText: { fontSize: 15, fontWeight: '600' },
  mealPickerCancel: {
    minHeight: 46,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mealPickerCancelText: { fontSize: 15, fontWeight: '700' },
});
