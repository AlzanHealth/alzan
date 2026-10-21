import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  ListRenderItem,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Dumbbell, History, Pencil, Plus, RotateCcw, Search, Star, Trash2 } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';

import { Alert } from '../../components/common/Alert';
import { useAuth } from '../../context/AuthContext';
import { useEquipment } from '../../hooks/useEquipment';
import { useMuscleGroups } from '../../hooks/useMuscleGroups';
import { useTrainingStyles } from '../../hooks/useTrainingStyles';
import { useUserPreferences } from '../../hooks/useUserPreferences';
import { borderRadius, spacing, typography } from '../../theme';
import { TAB_BAR_CLEARANCE, useTabBarLayout } from '../../navigation/tabBarLayout';
import { ExerciseWithDetails } from '../../types/training';
import { TrainingScreenNavigationProp } from '../../types/navigation.types';
import { useExercises } from '../../hooks/useExercises';
import {
  ExerciseCatalogUsedPage,
  ExerciseUsageSummary,
  useDeleteCustomExercise,
  useExerciseCatalogUsage,
  useExerciseFavorites,
  useRestoreCustomExercise,
  useToggleExerciseFavorite,
  useUsedExerciseCatalogPage,
} from '../../modules/training/hooks/useExerciseCatalog';
import { orderExerciseCatalogItems } from '../../modules/training/helpers/exerciseSearchState';
import { ExerciseNameAlreadyExistsError } from '../../modules/training/services/exerciseCatalogService';

type CatalogTab = 'catalog' | 'used' | 'mine';

const CATALOG_PAGE_SIZE = 30;

export const ExerciseCatalogScreen = () => {
  const { t } = useTranslation();
  const navigation = useNavigation<TrainingScreenNavigationProp>();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { styles: dynamicStyles, colors: themeColors, isDark } = useTrainingStyles();
  const { preferences, toDisplayWeight } = useUserPreferences();
  const { topFromScreenBottom, safeAreaBottom } = useTabBarLayout();
  const { muscleGroups } = useMuscleGroups();
  const { equipment } = useEquipment();
  const [tab, setTab] = useState<CatalogTab>('catalog');
  const [query, setQuery] = useState('');
  const [usedPage, setUsedPage] = useState(1);
  const [visibleLimit, setVisibleLimit] = useState(CATALOG_PAGE_SIZE);
  const [selectedMuscleId, setSelectedMuscleId] = useState<number | null>(null);
  const [selectedEquipmentId, setSelectedEquipmentId] = useState<number | null>(null);
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const exerciseListRef = useRef<FlatList<ExerciseWithDetails> | null>(null);
  const {
    data: loadedUsedPage,
    isLoading: isLoadingUsedPage,
    isFetching: isFetchingUsedPage,
    error: usedPageError,
  } = useUsedExerciseCatalogPage(user?.id, {
    page: usedPage,
    pageSize: CATALOG_PAGE_SIZE,
    query,
    muscleId: selectedMuscleId,
    equipmentId: selectedEquipmentId,
    favoritesOnly,
    enabled: tab === 'used',
  });
  const usedPageData: ExerciseCatalogUsedPage = loadedUsedPage ?? {
    exerciseIds: [],
    usage: {},
    totalItems: 0,
    currentPage: usedPage,
    totalPages: 0,
  };
  const {
    data: favoriteIds = new Set<string>(),
    isLoading: isLoadingFavorites,
    error: favoritesError,
  } = useExerciseFavorites(user?.id);
  const createButtonBottom = Math.max(0, topFromScreenBottom - safeAreaBottom) + TAB_BAR_CLEARANCE;
  const listBottomPadding = createButtonBottom + 54 + spacing.m;

  const catalogLimit = tab === 'catalog' ? visibleLimit : undefined;
  const {
    exercises,
    hasMore,
    isLoading: isLoadingExercises,
    isFetching: isFetchingExercises,
    error: exercisesError,
  } = useExercises({
    searchQuery: tab === 'used' ? undefined : query,
    selectedMuscleId,
    selectedEquipmentId,
    exerciseIds: tab === 'used' ? usedPageData.exerciseIds : tab === 'mine' && !user ? [] : undefined,
    ownerUserId: tab === 'mine' ? user?.id : undefined,
    limit: catalogLimit,
    includeArchived: tab === 'used' || tab === 'mine',
  });
  const {
    data: requestedUsageData,
    isLoading: isLoadingUsage,
    error: usageError,
  } = useExerciseCatalogUsage(user?.id, tab === 'used' ? [] : exercises.map(exercise => exercise.id));
  const requestedUsage: Record<string, ExerciseUsageSummary> = requestedUsageData ?? {};
  const usage = tab === 'used' ? usedPageData.usage : requestedUsage;
  const toggleFavorite = useToggleExerciseFavorite(user?.id);
  const deleteExercise = useDeleteCustomExercise(user?.id);
  const restoreExercise = useRestoreCustomExercise(user?.id);

  const filteredExercises = useMemo(() => {
    const visible = exercises.filter(exercise => {
      if (tab === 'used' && (!usage[exercise.id] || !usedPageData.exerciseIds.includes(exercise.id))) return false;
      if (tab === 'mine' && (!exercise.is_custom || exercise.owner_user_id !== user?.id)) return false;
      if (favoritesOnly && !favoriteIds.has(exercise.id)) return false;
      return true;
    });

    return orderExerciseCatalogItems(visible, tab, usage);
  }, [exercises, favoritesOnly, favoriteIds, tab, usage, usedPageData.exerciseIds, user?.id]);

  useEffect(() => {
    if (tab === 'used' && loadedUsedPage && loadedUsedPage.currentPage !== usedPage) {
      setUsedPage(loadedUsedPage.currentPage);
    }
  }, [loadedUsedPage, tab, usedPage]);

  const openExercise = (exercise: ExerciseWithDetails) => {
    navigation.navigate('ExerciseDetail', { exercise });
  };

  const openWeightHistory = (exercise: ExerciseWithDetails) => {
    navigation.navigate('ExercisePrValues', {
      exerciseId: exercise.id,
      metric: 'weight',
      loadType: exercise.load_type,
      exerciseName: exercise.name,
    });
  };

  const toggleExerciseFavorite = async (exerciseId: string, isFavorite: boolean) => {
    try {
      await toggleFavorite.mutateAsync({ exerciseId, isFavorite });
    } catch {
      Alert.alert(t('common.error'), t('training.exerciseCatalogFavoriteError'));
    }
  };

  const confirmDelete = (exercise: ExerciseWithDetails) => {
    Alert.alert(
      t('training.exerciseCatalogDeleteTitle'),
      t('training.exerciseCatalogDeleteMessage', { name: exercise.name }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: () => {
            void deleteExercise
              .mutateAsync({ exerciseId: exercise.id })
              .then(result => {
                if (result === 'archived') {
                  Alert.alert(t('training.exerciseCatalogArchivedTitle'), t('training.exerciseCatalogDeleteInUse'));
                }
              })
              .catch(() => {
                Alert.alert(t('common.error'), t('training.exerciseCatalogDeleteError'));
              });
          },
        },
      ],
    );
  };

  const restoreArchivedExercise = async (exercise: ExerciseWithDetails) => {
    try {
      await restoreExercise.mutateAsync({ exerciseId: exercise.id });
    } catch (error) {
      Alert.alert(
        error instanceof ExerciseNameAlreadyExistsError
          ? t('training.exerciseCatalogDuplicateTitle')
          : t('common.error'),
        error instanceof ExerciseNameAlreadyExistsError
          ? t('training.exerciseCatalogRestoreDuplicate')
          : t('training.exerciseCatalogRestoreError'),
      );
    }
  };

  const renderMuscleFilter: ListRenderItem<(typeof muscleGroups)[number]> = ({ item }) => {
    const selected = selectedMuscleId === item.id;
    return (
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityState={{ selected }}
        onPress={() => {
          setSelectedMuscleId(selected ? null : item.id);
          setVisibleLimit(CATALOG_PAGE_SIZE);
          setUsedPage(1);
        }}
        style={[
          styles.filterChip,
          {
            backgroundColor: selected ? themeColors.primary : isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.045)',
          },
        ]}
      >
        <Text style={[styles.filterChipText, { color: selected ? '#FFFFFF' : themeColors.textSecondary }]}>
          {item.name}
        </Text>
      </TouchableOpacity>
    );
  };

  const renderEquipmentFilter: ListRenderItem<(typeof equipment)[number]> = ({ item }) => {
    const selected = selectedEquipmentId === item.id;
    return (
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityState={{ selected }}
        onPress={() => {
          setSelectedEquipmentId(selected ? null : item.id);
          setVisibleLimit(CATALOG_PAGE_SIZE);
          setUsedPage(1);
        }}
        style={[
          styles.filterChip,
          {
            backgroundColor: selected ? themeColors.primary : isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.045)',
          },
        ]}
      >
        <Text style={[styles.filterChipText, { color: selected ? '#FFFFFF' : themeColors.textSecondary }]}>
          {item.name}
        </Text>
      </TouchableOpacity>
    );
  };

  const renderExercise = ({ item }: { item: ExerciseWithDetails }) => {
    const itemUsage: ExerciseUsageSummary | undefined = usage[item.id];
    const isFavorite = favoriteIds.has(item.id);
    const isMine = item.is_custom && item.owner_user_id === user?.id;
    const isAlzan = !item.is_custom && item.owner_user_id === null;
    const canDelete = isMine && tab === 'mine';
    const canEdit = !!user && !item.archived_at && (isMine || isAlzan);
    const canRestore = canDelete && !!item.archived_at;
    const showWeightHistory = !!itemUsage && (item.load_type !== 'bodyweight' || itemUsage.latestWeightKg !== null);
    const unit = preferences.weight_unit === 'lb' ? 'lb' : 'kg';
    const weightValue = itemUsage?.latestWeightKg;
    const weightLabel =
      weightValue !== null && weightValue !== undefined
        ? `${toDisplayWeight(weightValue).toLocaleString(undefined, { maximumFractionDigits: 2 })} ${unit}`
        : null;

    return (
      <View style={[styles.exerciseCard, dynamicStyles.card]}>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={t('training.exerciseCatalogOpenExercise', { name: item.name })}
          style={styles.exerciseMain}
          onPress={() => openExercise(item)}
        >
          <View style={[styles.exerciseIcon, { backgroundColor: `${themeColors.primary}12` }]}>
            <Dumbbell size={21} color={themeColors.primary} />
          </View>
          <View style={styles.exerciseCopy}>
            <View style={styles.exerciseTitleRow}>
              <Text style={[styles.exerciseName, dynamicStyles.label]} numberOfLines={2}>
                {item.name}
              </Text>
              {isMine ? (
                <View style={[styles.scopeBadge, { backgroundColor: `${themeColors.primary}12` }]}>
                  <Text style={[styles.scopeBadgeText, { color: themeColors.primary }]}>
                    {t('training.exerciseCatalogMineBadge')}
                  </Text>
                </View>
              ) : isAlzan ? (
                <>
                  <View style={[styles.scopeBadge, { backgroundColor: `${themeColors.textSecondary}18` }]}>
                    <Text style={[styles.scopeBadgeText, { color: themeColors.textSecondary }]}>
                      {t('training.exerciseCatalogAlzanBadge')}
                    </Text>
                  </View>
                  {item.is_personalized ? (
                    <View style={[styles.scopeBadge, { backgroundColor: `${themeColors.primary}12` }]}>
                      <Text style={[styles.scopeBadgeText, { color: themeColors.primary }]}>
                        {t('training.exerciseCatalogPersonalizedBadge')}
                      </Text>
                    </View>
                  ) : null}
                </>
              ) : null}
              {item.archived_at ? (
                <View style={[styles.scopeBadge, { backgroundColor: `${themeColors.textSecondary}18` }]}>
                  <Text style={[styles.scopeBadgeText, { color: themeColors.textSecondary }]}>
                    {t('training.exerciseCatalogArchivedBadge')}
                  </Text>
                </View>
              ) : null}
            </View>
            <Text style={[styles.exerciseMeta, dynamicStyles.sublabel]} numberOfLines={1}>
              {[item.muscle_name, item.equipment_name].filter(Boolean).join(' · ') ||
                t('training.exerciseCatalogNoDetails')}
            </Text>
            {itemUsage ? (
              <Text style={[styles.exerciseUsage, { color: themeColors.textSecondary }]} numberOfLines={1}>
                {weightLabel
                  ? t('training.exerciseCatalogLastWeight', { weight: weightLabel, count: itemUsage.setCount })
                  : t('training.exerciseCatalogSetCount', { count: itemUsage.setCount })}
              </Text>
            ) : null}
          </View>
        </TouchableOpacity>

        <View style={styles.exerciseActions}>
          {canEdit ? (
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel={t('training.exerciseCatalogEditAction', { name: item.name })}
              hitSlop={8}
              style={styles.iconAction}
              onPress={() => navigation.navigate('ExerciseCatalogCreate', { exerciseId: item.id })}
            >
              <Pencil size={18} color={themeColors.primary} />
              <Text style={[styles.iconActionLabel, { color: themeColors.primary }]}>{t('common.edit')}</Text>
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={t(
              isFavorite ? 'training.exerciseCatalogRemoveFavorite' : 'training.exerciseCatalogAddFavorite',
            )}
            accessibilityState={{ selected: isFavorite, disabled: toggleFavorite.isPending || !user }}
            disabled={toggleFavorite.isPending || !user}
            hitSlop={8}
            style={styles.iconAction}
            onPress={() => void toggleExerciseFavorite(item.id, isFavorite)}
          >
            <Star
              size={20}
              color={isFavorite ? themeColors.warning : themeColors.textSecondary}
              fill={isFavorite ? themeColors.warning : 'transparent'}
            />
            <Text style={[styles.iconActionLabel, { color: themeColors.textSecondary }]}>
              {t('training.exerciseCatalogFavoriteLabel')}
            </Text>
          </TouchableOpacity>
          {showWeightHistory ? (
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel={t('training.exerciseCatalogManageWeights', { name: item.name })}
              hitSlop={8}
              style={styles.iconAction}
              onPress={() => openWeightHistory(item)}
            >
              <History size={19} color={themeColors.primary} />
              <Text style={[styles.iconActionLabel, { color: themeColors.primary }]}>
                {t('training.exerciseCatalogHistoryLabel')}
              </Text>
            </TouchableOpacity>
          ) : null}
          {canRestore ? (
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel={t('training.exerciseCatalogRestoreAction', { name: item.name })}
              accessibilityState={{ disabled: restoreExercise.isPending }}
              disabled={restoreExercise.isPending}
              hitSlop={8}
              style={styles.iconAction}
              onPress={() => void restoreArchivedExercise(item)}
            >
              <RotateCcw size={18} color={themeColors.primary} />
              <Text style={[styles.iconActionLabel, { color: themeColors.primary }]}>
                {t('training.exerciseCatalogRestoreLabel')}
              </Text>
            </TouchableOpacity>
          ) : canDelete ? (
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel={t('training.exerciseCatalogDeleteAction', { name: item.name })}
              hitSlop={8}
              style={styles.iconAction}
              onPress={() => confirmDelete(item)}
            >
              <Trash2 size={18} color={themeColors.danger} />
              <Text style={[styles.iconActionLabel, { color: themeColors.danger }]}>
                {t('training.exerciseCatalogDeleteLabel')}
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
    );
  };

  const listHeader = (
    <View>
      <View style={styles.titleRow}>
        <View style={styles.headingCopy}>
          <Text style={[styles.heading, dynamicStyles.title]}>{t('training.exerciseCatalogTitle')}</Text>
          <Text style={[styles.subtitle, dynamicStyles.sublabel]}>{t('training.exerciseCatalogSubtitle')}</Text>
        </View>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={t('training.exerciseCatalogCreateAction')}
          onPress={() => navigation.navigate('ExerciseCatalogCreate')}
          style={[styles.addIconButton, { backgroundColor: `${themeColors.primary}14` }]}
        >
          <Plus size={22} color={themeColors.primary} />
        </TouchableOpacity>
      </View>

      <View style={[styles.searchField, dynamicStyles.input]}>
        <Search size={18} color={themeColors.textSecondary} />
        <TextInput
          accessibilityLabel={t('training.exerciseCatalogSearch')}
          placeholder={t('training.exerciseCatalogSearch')}
          placeholderTextColor={themeColors.textSecondary}
          value={query}
          onChangeText={value => {
            setQuery(value);
            setVisibleLimit(CATALOG_PAGE_SIZE);
            setUsedPage(1);
          }}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          style={[styles.searchInput, { color: themeColors.textPrimary }]}
        />
      </View>

      <View style={[styles.tabs, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.045)' }]}>
        {(['catalog', 'used', 'mine'] as const).map(tabKey => {
          const selected = tab === tabKey;
          const label = t(
            tabKey === 'catalog'
              ? 'training.exerciseCatalogTabAll'
              : tabKey === 'used'
                ? 'training.exerciseCatalogTabUsed'
                : 'training.exerciseCatalogTabMine',
          );
          return (
            <TouchableOpacity
              key={tabKey}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              onPress={() => {
                setTab(tabKey);
                setVisibleLimit(CATALOG_PAGE_SIZE);
                setUsedPage(1);
              }}
              style={[styles.tabButton, selected && { backgroundColor: themeColors.cardBackground }]}
            >
              <Text
                style={[styles.tabLabel, { color: selected ? themeColors.textPrimary : themeColors.textSecondary }]}
              >
                {label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={styles.filterHeader}>
        <Text style={[styles.filterLabel, dynamicStyles.sublabel]}>{t('training.exerciseCatalogMuscles')}</Text>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityState={{ selected: favoritesOnly }}
          onPress={() => {
            setFavoritesOnly(value => !value);
            setUsedPage(1);
          }}
          style={[
            styles.favoriteFilter,
            {
              backgroundColor: favoritesOnly
                ? `${themeColors.warning}25`
                : isDark
                  ? 'rgba(255,255,255,0.06)'
                  : '#FFFFFF',
              borderColor: favoritesOnly ? `${themeColors.warning}70` : themeColors.border,
            },
          ]}
        >
          <Star size={14} color={themeColors.warning} fill={favoritesOnly ? themeColors.warning : 'transparent'} />
          <Text style={[styles.favoriteFilterText, { color: themeColors.textSecondary }]}>
            {t('training.exerciseCatalogFavorites')}
          </Text>
        </TouchableOpacity>
      </View>
      <FlatList
        horizontal
        data={muscleGroups}
        keyExtractor={item => String(item.id)}
        renderItem={renderMuscleFilter}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filtersContent}
        ListHeaderComponent={
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityState={{ selected: selectedMuscleId === null }}
            onPress={() => {
              setSelectedMuscleId(null);
              setUsedPage(1);
            }}
            style={[
              styles.filterChip,
              {
                backgroundColor:
                  selectedMuscleId === null
                    ? themeColors.primary
                    : isDark
                      ? 'rgba(255,255,255,0.08)'
                      : 'rgba(0,0,0,0.045)',
              },
            ]}
          >
            <Text
              style={[
                styles.filterChipText,
                { color: selectedMuscleId === null ? '#FFFFFF' : themeColors.textSecondary },
              ]}
            >
              {t('training.exerciseCatalogAll')}
            </Text>
          </TouchableOpacity>
        }
      />

      <Text style={[styles.filterLabel, dynamicStyles.sublabel, styles.equipmentLabel]}>
        {t('training.exerciseCatalogEquipment')}
      </Text>
      <FlatList
        horizontal
        data={equipment}
        keyExtractor={item => String(item.id)}
        renderItem={renderEquipmentFilter}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filtersContent}
        ListHeaderComponent={
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityState={{ selected: selectedEquipmentId === null }}
            onPress={() => {
              setSelectedEquipmentId(null);
              setUsedPage(1);
            }}
            style={[
              styles.filterChip,
              {
                backgroundColor:
                  selectedEquipmentId === null
                    ? themeColors.primary
                    : isDark
                      ? 'rgba(255,255,255,0.08)'
                      : 'rgba(0,0,0,0.045)',
              },
            ]}
          >
            <Text
              style={[
                styles.filterChipText,
                { color: selectedEquipmentId === null ? '#FFFFFF' : themeColors.textSecondary },
              ]}
            >
              {t('training.exerciseCatalogAll')}
            </Text>
          </TouchableOpacity>
        }
      />

      {tab === 'mine' ? (
        <Text style={[styles.catalogHint, { color: themeColors.textSecondary }]}>
          {t('training.exerciseCatalogMineHint')}
        </Text>
      ) : null}
      {tab === 'used' ? (
        <Text style={[styles.catalogHint, { color: themeColors.textSecondary }]}>
          {t('training.exerciseCatalogUsedHint')}
        </Text>
      ) : null}
      <Text style={[styles.resultsLabel, dynamicStyles.sublabel]}>
        {tab === 'used'
          ? t('training.exerciseCatalogUsedResults', {
              count: usedPageData.totalItems,
              start: usedPageData.totalItems === 0 ? 0 : (usedPageData.currentPage - 1) * CATALOG_PAGE_SIZE + 1,
              end: Math.min(usedPageData.currentPage * CATALOG_PAGE_SIZE, usedPageData.totalItems),
            })
          : t('training.exerciseCatalogResults', { count: filteredExercises.length })}
      </Text>
    </View>
  );

  const isInitialLoading =
    (isLoadingExercises && exercises.length === 0) ||
    (tab === 'used' ? isLoadingUsedPage : isLoadingUsage) ||
    isLoadingFavorites;
  const hasError = exercisesError || (tab === 'used' ? usedPageError : usageError) || favoritesError;
  const isFetchingList = isFetchingExercises || (tab === 'used' && isFetchingUsedPage);
  const retryCatalog = () => {
    void Promise.all([
      queryClient.invalidateQueries({ queryKey: ['exercises'] }),
      queryClient.invalidateQueries({ queryKey: ['exercise-catalog-usage', user?.id] }),
      queryClient.invalidateQueries({ queryKey: ['exercise-catalog-favorites', user?.id] }),
    ]);
  };

  return (
    <LinearGradient colors={dynamicStyles.gradientColors} style={styles.screen}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <View style={styles.navigationHeader}>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={t('common.back')}
            hitSlop={8}
            style={styles.backButton}
            onPress={() => navigation.goBack()}
          >
            <ArrowLeft size={23} color={themeColors.textPrimary} />
          </TouchableOpacity>
          <Text style={[styles.navigationTitle, dynamicStyles.title]}>{t('training.exerciseCatalogScreenTitle')}</Text>
          <View style={styles.backButton} />
        </View>

        {isInitialLoading ? (
          <View style={styles.centerState}>
            <ActivityIndicator size="large" color={themeColors.primary} />
          </View>
        ) : hasError ? (
          <View style={styles.centerState}>
            <Text style={[styles.stateTitle, dynamicStyles.title]}>{t('training.exerciseCatalogLoadError')}</Text>
            <Text style={[styles.stateBody, dynamicStyles.sublabel]}>{t('training.exerciseCatalogRetryHint')}</Text>
            <TouchableOpacity
              style={[styles.retryButton, { backgroundColor: themeColors.primary }]}
              onPress={retryCatalog}
            >
              <Text style={styles.primaryButtonLabel}>{t('nutrition.retry')}</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <FlatList
            ref={exerciseListRef}
            style={styles.exerciseList}
            data={filteredExercises}
            keyExtractor={item => item.id}
            renderItem={renderExercise}
            ListHeaderComponent={listHeader}
            ListEmptyComponent={
              <View style={styles.emptyState}>
                {isFetchingList && tab === 'used' ? (
                  <ActivityIndicator size="large" color={themeColors.primary} />
                ) : (
                  <>
                    <Dumbbell size={28} color={themeColors.textSecondary} />
                    <Text style={[styles.stateTitle, dynamicStyles.title]}>
                      {t('training.exerciseCatalogEmptyTitle')}
                    </Text>
                    <Text style={[styles.stateBody, dynamicStyles.sublabel]}>
                      {favoritesOnly
                        ? t('training.exerciseCatalogEmptyFavorites')
                        : tab === 'mine'
                          ? t('training.exerciseCatalogEmptyMine')
                          : tab === 'used'
                            ? t('training.exerciseCatalogEmptyUsed')
                            : t('training.exerciseCatalogEmptyCatalog')}
                    </Text>
                  </>
                )}
              </View>
            }
            onEndReached={() => {
              if (tab === 'catalog' && hasMore && !isFetchingExercises) {
                setVisibleLimit(limit => limit + CATALOG_PAGE_SIZE);
              }
            }}
            onEndReachedThreshold={0.35}
            contentContainerStyle={[styles.listContent, { paddingBottom: listBottomPadding }]}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            ListFooterComponent={
              <>
                {isFetchingList && exercises.length > 0 ? <ActivityIndicator color={themeColors.primary} /> : null}
                {tab === 'used' && usedPageData.totalPages > 1 ? (
                  <View style={styles.pagination}>
                    <TouchableOpacity
                      accessibilityRole="button"
                      accessibilityState={{ disabled: usedPageData.currentPage <= 1 || isFetchingList }}
                      disabled={usedPageData.currentPage <= 1 || isFetchingList}
                      onPress={() => {
                        setUsedPage(usedPageData.currentPage - 1);
                        exerciseListRef.current?.scrollToOffset({ offset: 0, animated: true });
                      }}
                      style={[
                        styles.pageButton,
                        { borderColor: themeColors.border, opacity: usedPageData.currentPage <= 1 ? 0.45 : 1 },
                      ]}
                    >
                      <Text style={[styles.pageButtonText, { color: themeColors.textPrimary }]}>
                        {t('training.exerciseCatalogPagePrevious')}
                      </Text>
                    </TouchableOpacity>
                    <Text style={[styles.pageIndicator, { color: themeColors.textSecondary }]}>
                      {t('training.exerciseCatalogPage', {
                        current: usedPageData.currentPage,
                        total: usedPageData.totalPages,
                      })}
                    </Text>
                    <TouchableOpacity
                      accessibilityRole="button"
                      accessibilityState={{
                        disabled: usedPageData.currentPage >= usedPageData.totalPages || isFetchingList,
                      }}
                      disabled={usedPageData.currentPage >= usedPageData.totalPages || isFetchingList}
                      onPress={() => {
                        setUsedPage(usedPageData.currentPage + 1);
                        exerciseListRef.current?.scrollToOffset({ offset: 0, animated: true });
                      }}
                      style={[
                        styles.pageButton,
                        {
                          borderColor: themeColors.border,
                          opacity: usedPageData.currentPage >= usedPageData.totalPages ? 0.45 : 1,
                        },
                      ]}
                    >
                      <Text style={[styles.pageButtonText, { color: themeColors.textPrimary }]}>
                        {t('training.exerciseCatalogPageNext')}
                      </Text>
                    </TouchableOpacity>
                  </View>
                ) : null}
              </>
            }
          />
        )}

        <TouchableOpacity
          accessibilityRole="button"
          onPress={() => navigation.navigate('ExerciseCatalogCreate')}
          style={[
            styles.createButton,
            { backgroundColor: themeColors.primary, bottom: createButtonBottom, left: spacing.m, right: spacing.m },
          ]}
        >
          <Plus size={20} color="#FFFFFF" />
          <Text style={styles.primaryButtonLabel}>{t('training.exerciseCatalogCreateAction')}</Text>
        </TouchableOpacity>
      </SafeAreaView>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  screen: { flex: 1 },
  safeArea: { flex: 1 },
  navigationHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.m,
    paddingVertical: spacing.xs,
  },
  navigationTitle: { ...typography.h4, flex: 1, textAlign: 'center' },
  backButton: { alignItems: 'center', height: 44, justifyContent: 'center', width: 44 },
  exerciseList: { flex: 1 },
  listContent: { paddingHorizontal: spacing.m },
  titleRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.m },
  headingCopy: { flex: 1, paddingRight: spacing.s },
  heading: { ...typography.h2 },
  subtitle: { ...typography.caption, marginTop: spacing.xs },
  addIconButton: {
    alignItems: 'center',
    borderRadius: borderRadius.full,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  searchField: {
    alignItems: 'center',
    borderRadius: borderRadius.m,
    flexDirection: 'row',
    minHeight: 48,
    paddingHorizontal: spacing.m,
    marginBottom: spacing.m,
  },
  searchInput: { flex: 1, fontSize: 15, marginLeft: spacing.s, minHeight: 48, paddingVertical: spacing.s },
  tabs: { borderRadius: borderRadius.m, flexDirection: 'row', marginBottom: spacing.m, padding: 4 },
  tabButton: {
    alignItems: 'center',
    borderRadius: borderRadius.s,
    flex: 1,
    justifyContent: 'center',
    minHeight: 42,
    paddingHorizontal: 4,
  },
  tabLabel: { fontSize: 12, fontWeight: '600', textAlign: 'center' },
  filterHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  filterLabel: { ...typography.caption, fontWeight: '700', textTransform: 'uppercase' },
  favoriteFilter: {
    alignItems: 'center',
    borderRadius: borderRadius.full,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 5,
    minHeight: 34,
    paddingHorizontal: spacing.s,
  },
  favoriteFilterText: { fontSize: 11, fontWeight: '600' },
  filtersContent: { gap: spacing.s, paddingBottom: spacing.xs },
  filterChip: {
    alignItems: 'center',
    borderRadius: borderRadius.full,
    justifyContent: 'center',
    minHeight: 36,
    paddingHorizontal: spacing.m,
  },
  filterChipText: { fontSize: 12, fontWeight: '600' },
  equipmentLabel: { marginBottom: spacing.xs, marginTop: spacing.s },
  catalogHint: { ...typography.caption, marginTop: spacing.s },
  resultsLabel: {
    ...typography.caption,
    fontWeight: '700',
    marginBottom: spacing.s,
    marginTop: spacing.m,
    textTransform: 'uppercase',
  },
  pagination: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
    justifyContent: 'space-between',
    marginTop: spacing.m,
  },
  pageButton: {
    alignItems: 'center',
    borderRadius: borderRadius.m,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: spacing.s,
  },
  pageButtonText: { fontSize: 12, fontWeight: '600' },
  pageIndicator: { flex: 1, fontSize: 13, fontWeight: '600', textAlign: 'center' },
  exerciseCard: {
    alignItems: 'center',
    borderRadius: borderRadius.m,
    flexDirection: 'row',
    marginBottom: spacing.s,
    minHeight: 92,
    padding: spacing.s,
  },
  exerciseMain: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    minHeight: 68,
    minWidth: 0,
    paddingVertical: spacing.xs,
  },
  exerciseIcon: {
    alignItems: 'center',
    borderRadius: borderRadius.full,
    height: 44,
    justifyContent: 'center',
    marginRight: spacing.s,
    width: 44,
  },
  exerciseCopy: { flex: 1, minWidth: 0 },
  exerciseTitleRow: { alignItems: 'flex-start', flexDirection: 'row', gap: spacing.xs },
  exerciseName: { flex: 1, fontSize: 14, fontWeight: '600' },
  scopeBadge: { borderRadius: borderRadius.full, paddingHorizontal: 7, paddingVertical: 3 },
  scopeBadgeText: { fontSize: 9, fontWeight: '700' },
  exerciseMeta: { fontSize: 11, marginTop: 4 },
  exerciseUsage: { fontSize: 10, fontWeight: '600', marginTop: 5 },
  exerciseActions: { alignItems: 'center', flexDirection: 'row', marginLeft: spacing.xs },
  iconAction: {
    alignItems: 'center',
    height: 54,
    justifyContent: 'center',
    minWidth: 56,
    paddingHorizontal: 2,
    paddingVertical: spacing.xs,
  },
  iconActionLabel: { fontSize: 10, fontWeight: '600', lineHeight: 12, textAlign: 'center' },
  centerState: { alignItems: 'center', flex: 1, justifyContent: 'center', padding: spacing.l },
  emptyState: { alignItems: 'center', gap: spacing.s, paddingHorizontal: spacing.l, paddingVertical: spacing.xl },
  stateTitle: { ...typography.h4, textAlign: 'center' },
  stateBody: { ...typography.caption, lineHeight: 18, textAlign: 'center' },
  retryButton: {
    alignItems: 'center',
    borderRadius: borderRadius.m,
    justifyContent: 'center',
    marginTop: spacing.m,
    minHeight: 46,
    paddingHorizontal: spacing.l,
  },
  createButton: {
    alignItems: 'center',
    borderRadius: borderRadius.m,
    flexDirection: 'row',
    gap: spacing.s,
    justifyContent: 'center',
    minHeight: 54,
    position: 'absolute',
    zIndex: 1,
  },
  primaryButtonLabel: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
});
