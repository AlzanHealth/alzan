import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert as NativeAlert,
  Platform,
  SectionList,
  Share as NativeShare,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { ChevronLeft, ChevronRight, Copy, ListPlus, RotateCcw, Share2, ShoppingBasket } from 'lucide-react-native';
import { addDays, format, parseISO, subDays } from 'date-fns';
import { useTranslation } from 'react-i18next';

import { CalendarDatePickerModal } from '../../components/common/CalendarDatePickerModal';
import { Alert } from '../../components/common/Alert';
import { useNutritionStyles } from '../../hooks/useNutritionStyles';
import { useAuth } from '../../context/AuthContext';
import { useShoppingList } from '../../modules/nutrition/hooks/useShoppingList';
import { useShoppingListState } from '../../modules/nutrition/hooks/useShoppingListState';
import { useShoppingListSelection } from '../../modules/nutrition/hooks/useShoppingListSelection';
import { useShoppingRowFeedback } from '../../modules/nutrition/hooks/useShoppingRowFeedback';
import { getShoppingDisplayIngredients } from '../../modules/nutrition/services/shoppingListPresentation';
import { ShoppingListIngredientRow } from '../../modules/nutrition/components/ShoppingListIngredientRow';
import { ShoppingListQuantityModal } from '../../modules/nutrition/components/ShoppingListQuantityModal';
import { ShoppingListToolsModal } from '../../modules/nutrition/components/ShoppingListToolsModal';
import {
  filterShoppingIngredients,
  isShoppingIngredientDone,
  formatShoppingQuantity,
  formatShoppingListForExport,
  getShoppingQuantityToBuy,
  groupShoppingIngredientsByCategory,
  type ShoppingListCategoryGroup,
  type ShoppingListIngredient,
  type ShoppingListIngredientFilter,
  type ShoppingListMode,
} from '../../modules/nutrition/services/shoppingListPlanner';
import { CATEGORY_LABELS } from '../../modules/nutrition/components/IngredientCategoryFilter';
import { createAppleReminders } from '../../modules/nutrition/services/appleRemindersNative';
import { formatLocalizedDate } from '../../i18n/dateLocale';
import { useTabBarLayout } from '../../navigation/tabBarLayout';
import type { NutritionScreenNavigationProp, NutritionStackParamList } from '../../types/navigation.types';
import type { IngredientsCategory } from '../../types/requests.types';

const formatPeriodDate = (date: string) => formatLocalizedDate(parseISO(date), { en: 'EEE d MMM', es: 'EEE d MMM' });

const copyTextToClipboard = async (text: string): Promise<void> => {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  if (typeof document === 'undefined') throw new Error('Clipboard is unavailable');
  const textArea = document.createElement('textarea');
  textArea.value = text;
  textArea.style.position = 'fixed';
  textArea.style.opacity = '0';
  document.body.appendChild(textArea);
  textArea.focus();
  textArea.select();
  const copied = document.execCommand('copy');
  document.body.removeChild(textArea);
  if (!copied) throw new Error('Clipboard copy failed');
};

const modes = [
  { value: 'upcoming', labelKey: 'nutrition.shoppingListModeUpcoming' },
  { value: 'cycle', labelKey: 'nutrition.shoppingListModeCycle' },
  { value: 'custom', labelKey: 'nutrition.shoppingListModeCustom' },
] as const satisfies ReadonlyArray<{ value: ShoppingListMode; labelKey: string }>;

const filterLabelKeys: Record<ShoppingListIngredientFilter, `nutrition.${string}`> = {
  all: 'nutrition.shoppingListFilterAll',
  pending: 'nutrition.shoppingListFilterPending',
  purchased: 'nutrition.shoppingListFilterPurchased',
};

export const ShoppingListScreen = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const navigation = useNavigation<NutritionScreenNavigationProp>();
  const route = useRoute<RouteProp<NutritionStackParamList, 'ShoppingList'>>();
  const { styles: dynamicStyles, colors } = useNutritionStyles();
  const { topFromScreenBottom } = useTabBarLayout();
  const initialDate = route.params?.date || format(new Date(), 'yyyy-MM-dd');
  const {
    selection,
    updateSelection,
    isReady: selectionReady,
    localSaveStatus: selectionSaveStatus,
    retryLocalSave: retrySelectionSave,
  } = useShoppingListSelection(
    user?.id,
    {
      selectedDate: initialDate,
      mode: 'upcoming',
      customStartDate: initialDate,
      customEndDate: format(addDays(parseISO(initialDate), 6), 'yyyy-MM-dd'),
      showPast: false,
    },
    route.params?.date,
  );
  const { selectedDate, mode, customStartDate, customEndDate, showPast } = selection;
  const setSelectedDate = (value: string) => updateSelection({ selectedDate: value });
  const setCustomStartDate = (value: string) => updateSelection({ customStartDate: value });
  const setCustomEndDate = (value: string) => updateSelection({ customEndDate: value });
  const setShowPast = (value: boolean) => updateSelection({ showPast: value });
  const [calendarTarget, setCalendarTarget] = useState<'start' | 'end' | null>(null);
  const [periodExpanded, setPeriodExpanded] = useState(false);
  const [moreExpanded, setMoreExpanded] = useState(false);
  const [quantityIngredient, setQuantityIngredient] = useState<ShoppingListIngredient | null>(null);
  const {
    error,
    isLoading,
    isFetching,
    isOffline,
    refetch,
    range,
    ingredients,
    totalMealCount,
    visibleMealCount,
    hiddenMealCount,
  } = useShoppingList(selectedDate, { mode, customStartDate, customEndDate, showPast });
  const {
    completedKeys,
    availableQuantities,
    filter,
    setFilter,
    isHydrated,
    isSyncing,
    syncError,
    toggleIngredient,
    setCategoryCompleted,
    clearCompleted,
    setAvailableQuantity,
    resetRange,
    retrySync,
    localSaveStatus,
  } = useShoppingListState(user?.id, range);
  const { retainedKeys, retain } = useShoppingRowFeedback(`${user?.id}:${range.startDate}:${range.endDate}:${filter}`);
  const handleToggle = useCallback(
    (key: string) => {
      if (!isHydrated) return;
      if (filter === 'pending') retain([key]);
      toggleIngredient(key);
    },
    [filter, isHydrated, retain, toggleIngredient],
  );

  const categoryLabels = useMemo(
    () =>
      new Map<IngredientsCategory, string>(
        (Object.entries(CATEGORY_LABELS) as [IngredientsCategory, string][]).map(([category, labelKey]) => [
          category,
          String(t(labelKey as never)),
        ]),
      ),
    [t],
  );

  const visibleIngredients = useMemo(
    () =>
      ingredients.map(ingredient => ({
        ...ingredient,
        available_quantity_g: availableQuantities.get(ingredient.key) ?? ingredient.available_quantity_g,
      })),
    [availableQuantities, ingredients],
  );
  const filteredIngredients = useMemo(
    () => filterShoppingIngredients(visibleIngredients, completedKeys, filter),
    [completedKeys, filter, visibleIngredients],
  );
  const completedCount = visibleIngredients.filter(ingredient =>
    isShoppingIngredientDone(ingredient, completedKeys),
  ).length;
  const displayIngredients = useMemo(() => {
    return getShoppingDisplayIngredients(visibleIngredients, filteredIngredients, filter, retainedKeys);
  }, [filter, filteredIngredients, retainedKeys, visibleIngredients]);
  const exportIngredients = filteredIngredients;
  const exportText = useMemo(
    () => formatShoppingListForExport(exportIngredients, { categoryLabels }),
    [categoryLabels, exportIngredients],
  );
  const sections = useMemo(
    () =>
      groupShoppingIngredientsByCategory(displayIngredients).map((group: ShoppingListCategoryGroup) => ({
        ...group,
        title: String(t(CATEGORY_LABELS[group.category])),
        data: group.ingredients,
      })),
    [displayIngredients, t],
  );
  const periodLabel = useMemo(() => {
    const start = parseISO(range.startDate);
    const end = parseISO(range.endDate);
    const sameYear = start.getFullYear() === end.getFullYear();
    const sameMonth = sameYear && start.getMonth() === end.getMonth();
    const first = formatLocalizedDate(
      start,
      sameMonth
        ? { en: 'd', es: 'd' }
        : sameYear
          ? { en: 'd MMM', es: 'd MMM' }
          : { en: 'd MMM yyyy', es: 'd MMM yyyy' },
    );
    const last = formatLocalizedDate(
      end,
      sameYear ? { en: 'd MMMM', es: 'd MMMM' } : { en: 'd MMM yyyy', es: 'd MMM yyyy' },
    );
    return `${first}–${last}`;
  }, [range.endDate, range.startDate, t]);

  const movePeriod = useCallback(
    (direction: -1 | 1) => {
      const periodStart = parseISO(range.startDate);
      setSelectedDate(format(direction === -1 ? subDays(periodStart, 7) : addDays(periodStart, 7), 'yyyy-MM-dd'));
    },
    [range.startDate],
  );
  const confirmCalendar = useCallback(
    (date: Date) => {
      const value = format(date, 'yyyy-MM-dd');
      if (calendarTarget === 'start') {
        setCustomStartDate(value);
        if (parseISO(value) > parseISO(customEndDate)) setCustomEndDate(value);
      } else if (calendarTarget === 'end') setCustomEndDate(value);
      setCalendarTarget(null);
    },
    [calendarTarget, customEndDate],
  );

  const adjustIngredient = useCallback((ingredient: ShoppingListIngredient) => setQuantityIngredient(ingredient), []);
  const handleResetRange = useCallback(() => {
    setMoreExpanded(false);
    const reset = () => resetRange();
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      if (
        window.confirm(
          `${t('nutrition.shoppingListResetPeriodTitle')}\n\n${t('nutrition.shoppingListResetPeriodMessage')}`,
        )
      ) {
        reset();
      }
      return;
    }
    Alert.alert(t('nutrition.shoppingListResetPeriodTitle'), t('nutrition.shoppingListResetPeriodMessage'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('nutrition.shoppingListResetPeriodConfirm'), style: 'destructive', onPress: reset },
    ]);
  }, [resetRange, t]);
  const handleCopy = useCallback(async () => {
    setMoreExpanded(false);
    if (!exportText || Platform.OS !== 'web') return;
    try {
      await copyTextToClipboard(exportText);
      Alert.alert(t('common.done'), t('nutrition.shoppingListCopied'));
    } catch {
      Alert.alert(t('common.error'), t('nutrition.shoppingListCopyError'));
    }
  }, [exportText, t]);
  const handleShare = useCallback(async () => {
    setMoreExpanded(false);
    if (!exportText) return;
    try {
      if (Platform.OS === 'web') {
        if (typeof navigator !== 'undefined' && navigator.share)
          await navigator.share({ title: t('nutrition.shoppingListShareTitle'), text: exportText });
        else await handleCopy();
        return;
      }
      await NativeShare.share({ title: t('nutrition.shoppingListShareTitle'), message: exportText });
    } catch {
      /* cancelled */
    }
  }, [exportText, handleCopy, t]);
  const handleCreateAppleReminders = useCallback(() => {
    setMoreExpanded(false);
    if (Platform.OS !== 'ios' || exportIngredients.length === 0) return;
    NativeAlert.prompt(
      t('nutrition.shoppingListAppleRemindersPromptTitle'),
      t('nutrition.shoppingListAppleRemindersPromptMessage'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.save'),
          onPress: (listName: string | undefined) => {
            void createAppleReminders(
              exportIngredients.map(ingredient => ({
                title: ingredient.name,
                notes: `${categoryLabels.get(ingredient.category || 'otro') || ingredient.category || 'otro'} · ${formatShoppingQuantity(getShoppingQuantityToBuy(ingredient))}`,
              })),
              listName?.trim() || t('nutrition.shoppingListAppleRemindersDefaultList'),
            ).catch(() => Alert.alert(t('common.error'), t('nutrition.shoppingListAppleRemindersError')));
          },
        },
      ],
      'plain-text',
      t('nutrition.shoppingListAppleRemindersDefaultList'),
    );
  }, [categoryLabels, exportIngredients, t]);

  const renderIngredient = useCallback(
    ({
      item,
      index,
      section,
    }: {
      item: ShoppingListIngredient;
      index: number;
      section: { data: ShoppingListIngredient[] };
    }) => (
      <ShoppingListIngredientRow
        item={item}
        isCompleted={isShoppingIngredientDone(item, completedKeys)}
        disabled={!isHydrated}
        isLast={index === section.data.length - 1}
        colors={colors}
        onToggle={handleToggle}
        onAdjust={adjustIngredient}
      />
    ),
    [adjustIngredient, colors, completedKeys, isHydrated, handleToggle],
  );
  const renderSectionHeader = useCallback(
    ({ section }: { section: ShoppingListCategoryGroup & { title: string; data: ShoppingListIngredient[] } }) => {
      const allChecked = section.data.every(item => isShoppingIngredientDone(item, completedKeys));
      return (
        <View style={[styles.categoryHeader, { backgroundColor: colors.surfaceSolid }]}>
          <View style={styles.categoryCopy}>
            <Text style={[styles.categoryTitle, { color: colors.primary }]}>{section.title}</Text>
            <Text style={[styles.categoryCount, { color: colors.textSecondary }]}>
              {t('nutrition.shoppingListIngredientCount', { count: section.data.length })}
            </Text>
          </View>
          <TouchableOpacity
            style={styles.categoryAction}
            onPress={() => {
              if (filter === 'pending' && !allChecked) retain(section.data.map(item => item.key));
              setCategoryCompleted(section.data, !allChecked);
            }}
            disabled={!isHydrated}
            accessibilityRole="button"
          >
            <Text style={[styles.categoryActionText, { color: colors.primary }]}>
              {t(allChecked ? 'nutrition.shoppingListUnmarkCategory' : 'nutrition.shoppingListMarkCategory')}
            </Text>
          </TouchableOpacity>
        </View>
      );
    },
    [colors, completedKeys, filter, isHydrated, retain, setCategoryCompleted, t],
  );

  const calendarValue = parseISO(calendarTarget === 'start' ? customStartDate : customEndDate);
  const calendarMinimum = calendarTarget === 'end' ? parseISO(customStartDate) : undefined;
  const calendarMaximum = calendarTarget === 'end' ? addDays(parseISO(customStartDate), 29) : parseISO(customEndDate);
  const periodControls = (
    <View style={styles.controlsHeader}>
      <View style={[styles.modeCard, dynamicStyles.glassCard]}>
        {modes.map(option => (
          <TouchableOpacity
            key={option.value}
            style={[styles.modeButton, mode === option.value && { backgroundColor: colors.primary }]}
            onPress={() => {
              updateSelection({ mode: option.value, showPast: false });
            }}
            accessibilityRole="button"
            accessibilityState={{ selected: mode === option.value }}
          >
            <Text style={[styles.modeText, { color: mode === option.value ? colors.white : colors.textPrimary }]}>
              {t(option.labelKey)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      {mode === 'custom' ? (
        <View style={[styles.customCard, dynamicStyles.glassCard]}>
          <Text style={[styles.customHint, { color: colors.textSecondary }]}>
            {t('nutrition.shoppingListCustomHint')}
          </Text>
          <TouchableOpacity
            style={styles.dateChoice}
            onPress={() => setCalendarTarget('start')}
            accessibilityRole="button"
          >
            <Text style={[styles.dateCaption, { color: colors.textSecondary }]}>
              {t('nutrition.shoppingListStartDate')}
            </Text>
            <Text style={[styles.dateValue, { color: colors.textPrimary }]}>{formatPeriodDate(customStartDate)}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.dateChoice}
            onPress={() => setCalendarTarget('end')}
            accessibilityRole="button"
          >
            <Text style={[styles.dateCaption, { color: colors.textSecondary }]}>
              {t('nutrition.shoppingListEndDate')}
            </Text>
            <Text style={[styles.dateValue, { color: colors.textPrimary }]}>{formatPeriodDate(customEndDate)}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={[styles.periodCard, dynamicStyles.glassCard]}>
          <TouchableOpacity style={styles.periodButton} onPress={() => movePeriod(-1)} accessibilityRole="button">
            <ChevronLeft size={20} color={colors.primary} />
          </TouchableOpacity>
          <View style={styles.periodCopy}>
            <Text style={[styles.periodLabel, { color: colors.textSecondary }]}>{periodLabel}</Text>
            <Text style={[styles.periodCount, { color: colors.textPrimary }]}>
              {t('nutrition.shoppingListIngredientCount', { count: visibleIngredients.length })}
            </Text>
          </View>
          <TouchableOpacity style={styles.periodButton} onPress={() => movePeriod(1)} accessibilityRole="button">
            <ChevronRight size={20} color={colors.primary} />
          </TouchableOpacity>
        </View>
      )}
      {hiddenMealCount > 0 && mode === 'upcoming' && !showPast && (
        <TouchableOpacity style={styles.pastNotice} onPress={() => setShowPast(true)} accessibilityRole="button">
          <Text style={[styles.noticeText, { color: colors.textSecondary }]}>
            {t('nutrition.shoppingListPastHidden', { count: hiddenMealCount })}
          </Text>
          <Text style={[styles.noticeAction, { color: colors.primary }]}>{t('nutrition.shoppingListShowPast')}</Text>
        </TouchableOpacity>
      )}
      <TouchableOpacity
        style={styles.secondaryAction}
        onPress={() => setPeriodExpanded(false)}
        accessibilityRole="button"
      >
        <Text style={[styles.secondaryActionText, { color: colors.primary }]}>{t('common.done')}</Text>
      </TouchableOpacity>
    </View>
  );
  const filters = (
    <View style={styles.filterPanel}>
      <View style={styles.filterRow}>
        {(['all', 'pending', 'purchased'] as ShoppingListIngredientFilter[]).map(value => (
          <TouchableOpacity
            key={value}
            onPress={() => setFilter(value)}
            style={[
              styles.filterButton,
              {
                backgroundColor: filter === value ? colors.primary : colors.surfaceSolid,
                borderColor: filter === value ? colors.primary : colors.border,
              },
            ]}
            accessibilityRole="button"
            accessibilityState={{ selected: filter === value }}
          >
            <Text style={[styles.filterText, { color: filter === value ? colors.white : colors.textPrimary }]}>
              {value === 'pending' ? t('nutrition.shoppingListOnlyPending') : t(filterLabelKeys[value] as never)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
  const moreControls = (
    <>
      <View style={styles.actionsRow}>
        {completedCount > 0 && (
          <TouchableOpacity
            style={styles.secondaryAction}
            onPress={() => {
              setMoreExpanded(false);
              clearCompleted();
            }}
            accessibilityRole="button"
          >
            <RotateCcw size={15} color={colors.primary} />
            <Text style={[styles.secondaryActionText, { color: colors.primary }]}>
              {t('nutrition.shoppingListClearCompleted')}
            </Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity style={styles.secondaryAction} onPress={handleResetRange} accessibilityRole="button">
          <RotateCcw size={15} color={colors.primary} />
          <Text style={[styles.secondaryActionText, { color: colors.primary }]}>
            {t('nutrition.shoppingListResetRange')}
          </Text>
        </TouchableOpacity>
      </View>
      {filteredIngredients.length > 0 && (
        <View style={styles.exportActions}>
          {Platform.OS === 'ios' && (
            <TouchableOpacity
              style={styles.exportAction}
              onPress={handleCreateAppleReminders}
              accessibilityRole="button"
            >
              <ListPlus size={17} color={colors.primary} />
              <Text style={[styles.exportActionText, { color: colors.primary }]}>
                {t('nutrition.shoppingListAppleReminders')}
              </Text>
            </TouchableOpacity>
          )}
          {Platform.OS === 'web' && (
            <TouchableOpacity style={styles.exportAction} onPress={() => void handleCopy()} accessibilityRole="button">
              <Copy size={17} color={colors.primary} />
              <Text style={[styles.exportActionText, { color: colors.primary }]}>
                {t('nutrition.shoppingListCopy')}
              </Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.exportAction} onPress={() => void handleShare()} accessibilityRole="button">
            <Share2 size={17} color={colors.primary} />
            <Text style={[styles.exportActionText, { color: colors.primary }]}>{t('nutrition.shoppingListShare')}</Text>
          </TouchableOpacity>
        </View>
      )}
    </>
  );
  const controlsHeader = (
    <View style={styles.controlsHeader}>
      {filters}
      {isHydrated && selectionReady && localSaveStatus === 'saved' && selectionSaveStatus === 'saved' && (
        <Text accessibilityLiveRegion="polite" style={[styles.syncText, { color: colors.textSecondary }]}>
          {t('nutrition.shoppingListSavedLocally')}
        </Text>
      )}
      {(localSaveStatus === 'error' || selectionSaveStatus === 'error') && (
        <View style={styles.syncErrorRow}>
          <Text accessibilityLiveRegion="polite" style={[styles.syncText, { color: colors.textPrimary }]}>
            {t('nutrition.shoppingListLocalSaveError')}
          </Text>
          <TouchableOpacity
            style={styles.periodButton}
            onPress={() => {
              void retrySync();
              void retrySelectionSave();
            }}
            accessibilityRole="button"
          >
            <Text style={[styles.retrySyncText, { color: colors.primary }]}>{t('nutrition.retry')}</Text>
          </TouchableOpacity>
        </View>
      )}
      {isSyncing && localSaveStatus !== 'error' && (
        <Text style={[styles.syncText, { color: colors.textSecondary }]}>{t('nutrition.shoppingListSyncing')}</Text>
      )}
      {isOffline && !isLoading && (
        <Text style={[styles.syncText, { color: colors.textSecondary }]}>{t('nutrition.shoppingListOffline')}</Text>
      )}
      {syncError && localSaveStatus !== 'error' && selectionSaveStatus !== 'error' && (
        <View style={styles.syncErrorRow}>
          <Text style={[styles.syncText, { color: colors.textSecondary }]}>
            {t(isHydrated ? 'nutrition.shoppingListRemotePending' : 'nutrition.shoppingListSyncError')}
          </Text>
          <TouchableOpacity style={styles.secondaryAction} onPress={() => void retrySync()} accessibilityRole="button">
            <Text style={[styles.retrySyncText, { color: colors.primary }]}>
              {t('nutrition.shoppingListSyncRetry')}
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );

  const emptyState = (
    <View style={styles.centerState}>
      <ShoppingBasket size={42} color={colors.textSecondary} strokeWidth={1.8} />
      <Text style={[styles.stateText, { color: colors.textSecondary }]}>
        {t(
          filter === 'pending'
            ? 'nutrition.shoppingListNoPending'
            : filter === 'purchased'
              ? 'nutrition.shoppingListNoPurchased'
              : totalMealCount === 0
                ? 'nutrition.shoppingListEmpty'
                : visibleMealCount === 0
                  ? 'nutrition.shoppingListNoPendingMeals'
                  : 'nutrition.shoppingListNoIngredients',
        )}
      </Text>
    </View>
  );

  return (
    <LinearGradient colors={dynamicStyles.gradientColors} style={styles.container}>
      <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.headerButton}
            onPress={navigation.goBack}
            accessibilityRole="button"
            accessibilityLabel={t('nutrition.shoppingListBackAccessibility')}
          >
            <ChevronLeft size={24} color={colors.textPrimary} strokeWidth={2.5} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.headerTitleWrap}
            onPress={() => setPeriodExpanded(value => !value)}
            accessibilityRole="button"
            accessibilityState={{ expanded: periodExpanded }}
            accessibilityLabel={t('nutrition.shoppingListEditPeriod', { period: periodLabel })}
          >
            <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>
              {t('nutrition.shoppingListCompactTitle', { period: periodLabel })}
            </Text>
            <Text style={[styles.periodCount, { color: colors.textSecondary }]}>
              {isHydrated && selectionReady && !isLoading
                ? t('nutrition.shoppingListRemaining', { count: visibleIngredients.length - completedCount })
                : t('common.loading')}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.headerButton}
            onPress={() => setMoreExpanded(value => !value)}
            disabled={!isHydrated || visibleIngredients.length === 0}
            accessibilityRole="button"
            accessibilityState={{ expanded: moreExpanded, disabled: !isHydrated || visibleIngredients.length === 0 }}
          >
            <Text style={[styles.secondaryActionText, { color: colors.primary }]}>
              {t('nutrition.shoppingListMore')}
            </Text>
          </TouchableOpacity>
        </View>
        {isLoading || !selectionReady ? (
          <View style={styles.centerState}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={[styles.stateText, { color: colors.textSecondary }]}>{t('common.loading')}</Text>
          </View>
        ) : error && ingredients.length === 0 ? (
          <View style={styles.centerState}>
            <Text style={[styles.stateText, { color: colors.textSecondary }]}>
              {t('nutrition.shoppingListLoadError')}
            </Text>
            <TouchableOpacity
              style={[styles.retryButton, { backgroundColor: colors.primary }]}
              onPress={() => void refetch()}
              accessibilityRole="button"
            >
              <Text style={[styles.retryButtonText, { color: colors.white }]}>{t('nutrition.retry')}</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <SectionList
            sections={sections}
            ListHeaderComponent={controlsHeader}
            ListEmptyComponent={emptyState}
            renderItem={renderIngredient}
            renderSectionHeader={renderSectionHeader}
            keyExtractor={item => item.key}
            contentContainerStyle={[styles.listContent, { paddingBottom: topFromScreenBottom + 32 }]}
            showsVerticalScrollIndicator={false}
            refreshing={isFetching && !isLoading}
            onRefresh={() => void refetch()}
          />
        )}
        <ShoppingListToolsModal
          visible={periodExpanded && !calendarTarget}
          title={t('nutrition.shoppingListPeriodSettings')}
          onClose={() => setPeriodExpanded(false)}
        >
          {periodControls}
        </ShoppingListToolsModal>
        <ShoppingListToolsModal
          visible={moreExpanded}
          title={t('nutrition.shoppingListMore')}
          onClose={() => setMoreExpanded(false)}
        >
          {moreControls}
        </ShoppingListToolsModal>
        {calendarTarget && (
          <CalendarDatePickerModal
            visible
            value={calendarValue}
            title={t(calendarTarget === 'start' ? 'nutrition.shoppingListStartDate' : 'nutrition.shoppingListEndDate')}
            minimumDate={calendarMinimum}
            maximumDate={calendarMaximum}
            onCancel={() => setCalendarTarget(null)}
            onConfirm={confirmCalendar}
          />
        )}
        <ShoppingListQuantityModal
          visible={quantityIngredient !== null}
          ingredient={quantityIngredient}
          colors={colors}
          onCancel={() => setQuantityIngredient(null)}
          onConfirm={quantity => {
            if (!quantityIngredient) return;
            if (filter === 'pending') retain([quantityIngredient.key]);
            setAvailableQuantity(quantityIngredient.key, quantity);
            setQuantityIngredient(null);
          }}
        />
      </SafeAreaView>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { minHeight: 64, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center' },
  headerButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  headerTitleWrap: { flex: 1, minHeight: 44, paddingVertical: 8, justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '800' },
  controlsHeader: { paddingTop: 2 },
  modeCard: { marginHorizontal: 16, marginBottom: 8, padding: 3, borderRadius: 14, flexDirection: 'row' },
  modeButton: {
    flex: 1,
    minHeight: 44,
    paddingVertical: 8,
    paddingHorizontal: 5,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modeText: { fontSize: 13, fontWeight: '700', textAlign: 'center' },
  periodCard: {
    marginHorizontal: 16,
    marginBottom: 10,
    padding: 6,
    borderRadius: 18,
    flexDirection: 'row',
    alignItems: 'center',
  },
  periodButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 14 },
  periodCopy: { flex: 1, alignItems: 'center' },
  periodLabel: { fontSize: 15, fontWeight: '700' },
  periodCount: { fontSize: 13, marginTop: 3 },
  customCard: { marginHorizontal: 16, marginBottom: 10, padding: 10, borderRadius: 18, gap: 7 },
  customHint: { fontSize: 13, marginBottom: 2 },
  dateChoice: {
    minHeight: 52,
    paddingHorizontal: 12,
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: 'rgba(127,127,127,0.10)',
  },
  dateCaption: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase' },
  dateValue: { fontSize: 16, fontWeight: '700', marginTop: 2 },
  pastNotice: { marginHorizontal: 20, marginBottom: 4, flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  noticeText: { flex: 1, fontSize: 12 },
  noticeAction: { fontSize: 12, fontWeight: '800' },
  filterPanel: {
    marginHorizontal: 16,
    marginBottom: 12,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  progressText: { flex: 1, minWidth: 112, fontSize: 13, fontWeight: '600' },
  filterRow: { flex: 2, minWidth: 210, flexDirection: 'row', gap: 4 },
  filterButton: {
    flex: 1,
    minHeight: 44,
    paddingHorizontal: 7,
    paddingVertical: 8,
    borderWidth: 1,
    borderRadius: 10,
    justifyContent: 'center',
  },
  filterText: { fontSize: 13, fontWeight: '700', textAlign: 'center' },
  actionsRow: { flexDirection: 'column', gap: 8, paddingHorizontal: 16, marginBottom: 12 },
  secondaryAction: {
    flex: 1,
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
  },
  secondaryActionText: { fontSize: 12, fontWeight: '700', flexShrink: 1 },
  exportActions: { flexDirection: 'column', gap: 8, marginHorizontal: 16, marginBottom: 4 },
  exportAction: {
    flex: 1,
    minHeight: 44,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  exportActionText: { fontSize: 14, fontWeight: '700', flexShrink: 1 },
  syncText: { textAlign: 'right', paddingHorizontal: 20, fontSize: 12, marginBottom: 2 },
  syncErrorRow: { alignItems: 'flex-end', paddingHorizontal: 20, marginBottom: 2 },
  retrySyncText: { fontSize: 12, fontWeight: '800', paddingVertical: 4 },
  listContent: { paddingHorizontal: 16, paddingTop: 2 },
  categoryHeader: {
    marginTop: 12,
    paddingHorizontal: 16,
    paddingTop: 13,
    paddingBottom: 8,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    flexDirection: 'row',
    alignItems: 'center',
  },
  categoryCopy: { flex: 1 },
  categoryTitle: { fontSize: 14, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },
  categoryCount: { fontSize: 12, marginTop: 3 },
  categoryAction: { minHeight: 44, maxWidth: '45%', paddingHorizontal: 8, justifyContent: 'center' },
  categoryActionText: { fontSize: 12, fontWeight: '700', textAlign: 'right' },
  centerState: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 },
  stateText: { textAlign: 'center', fontSize: 15, lineHeight: 21 },
  retryButton: { paddingHorizontal: 18, paddingVertical: 11, borderRadius: 12 },
  retryButtonText: { fontWeight: '700' },
});
