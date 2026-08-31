import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { RouteProp, useNavigation, useFocusEffect, useRoute } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Settings, Plus, BookOpen, CalendarCheck, MoreVertical, Copy, MoveRight, X } from 'lucide-react-native';
import { addDays, format, isValid, parseISO, subDays } from 'date-fns';

import { CalorieEquationHeader } from '../../modules/nutrition/components/CalorieEquationHeader';
import { MealSection } from '../../modules/nutrition/components/MealSection';
import { WaterTracker } from '../../modules/nutrition/components/WaterTracker';
import { useDayNutrition } from '../../modules/nutrition/hooks/useDayNutritionLogic';
import {
  useUpsertMealLog,
  useDeleteMealLog,
  useRestoreMealLog,
  useCopyMeal,
  useMoveMeal,
  useMoveMealById,
  useCopyMealsToDate,
  useMoveMealsToDate,
  useCopyDayToDate,
  useCopyMealRange,
  useMoveMealRange,
  useWaterIntake,
  useVacationDateSet,
} from '../../modules/nutrition/hooks/useNutritionData';
import { DailyMealItem } from '../../modules/nutrition/types';
import { MEAL_TYPES, MEAL_TYPE_LABELS, getMealTypeByHour } from '../../modules/nutrition/constants';
import { usePreferences } from '../../hooks/settings/usePreferences';
import { useUnitConversion } from '../../hooks/useUnitConversion';
import { useNutritionStyles } from '../../hooks/useNutritionStyles';
import { DaySwitcher, DaySwitcherRef } from '../../components/common/DaySwitcher';
import { NutritionScreenNavigationProp, NutritionStackParamList, TabParamList } from '../../types/navigation.types';
import { MealType } from '../../types/requests.types';
import {
  createDeletedMealUndoAction,
  createMovedMealUndoAction,
  isMealUndoAvailable,
  MEAL_UNDO_WINDOW_MS,
  MealUndoAction,
} from '../../modules/nutrition/services/mealUndoPlanner';
import { UndoToast } from '../../components/common/UndoToast';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { useTabBarLayout } from '../../navigation/tabBarLayout';
import { useTranslation } from 'react-i18next';
import { Alert } from '../../components/common/Alert';
import { formatLocalizedDate } from '../../i18n/dateLocale';
import { getNutritionDayDate, normalizeNutritionDayRolloverTime } from '../../modules/nutrition/services/nutritionDay';
import { getNutritionCalendarRange } from '../../modules/nutrition/services/nutritionCalendarRange';
import { CopyMealModal, CopyMealDestination } from '../../modules/nutrition/components/CopyMealModal';
import { MealBatchActionsMenu, MealBatchAction } from '../../modules/nutrition/components/MealBatchActionsMenu';
import {
  MealBatchActionModal,
  MealBatchModalMode,
  MealBatchModalOperation,
  MealBatchModalValues,
} from '../../modules/nutrition/components/MealBatchActionModal';
import type { MealRange } from '../../modules/nutrition/services/mealBatchPlanner';
import { getNutritionHomeMenuImportTarget, getNutritionHomeRecipeLibraryTarget } from './nutritionHeaderActions';

// Helper to group meals
const groupMealsByType = (meals: DailyMealItem[]) => {
  const groups: Record<string, DailyMealItem[]> = {
    [MEAL_TYPES.BREAKFAST]: [],
    [MEAL_TYPES.ALMUERZO]: [],
    [MEAL_TYPES.LUNCH]: [],
    [MEAL_TYPES.MERIENDA]: [],
    [MEAL_TYPES.DINNER]: [],
    [MEAL_TYPES.SNACK]: [],
  };

  meals.forEach(m => {
    // Normalize type
    const type = m.mealType || MEAL_TYPES.SNACK;
    if (groups[type]) {
      groups[type].push(m);
    } else {
      groups[MEAL_TYPES.SNACK].push(m);
    }
  });

  return groups;
};

type MealTransferAction = {
  type: 'copy' | 'move';
  meal: DailyMealItem;
};

export const NutritionHomeScreen = () => {
  const { t } = useTranslation();
  const navigation = useNavigation<NutritionScreenNavigationProp>();
  const route = useRoute<RouteProp<NutritionStackParamList, 'NutritionHome'>>();
  const { convertEnergyToUi } = useUnitConversion();
  const { styles: dynamicStyles, colors: themeColors } = useNutritionStyles();
  const { topFromScreenBottom } = useTabBarLayout();
  const { preferences, refetch: refetchPreferences, loading: prefsLoading } = usePreferences();
  const nutritionDayRolloverTime = normalizeNutritionDayRolloverTime(
    preferences?.nutrition_prefs?.nutrition_day_rollover_time,
  );
  const currentNutritionDate = getNutritionDayDate(new Date(), nutritionDayRolloverTime);

  // Date Logic
  const [selectedDate, setSelectedDate] = useState(() => getNutritionDayDate(new Date(), nutritionDayRolloverTime));
  const [mealTransferAction, setMealTransferAction] = useState<MealTransferAction | null>(null);
  const [isBatchMenuVisible, setIsBatchMenuVisible] = useState(false);
  const [isMealSelectionMode, setIsMealSelectionMode] = useState(false);
  const [selectedMealIds, setSelectedMealIds] = useState<Set<string>>(new Set());
  const [batchModal, setBatchModal] = useState<{
    mode: MealBatchModalMode;
    operation: MealBatchModalOperation;
  } | null>(null);
  const nutritionCalendarRange = React.useMemo(() => getNutritionCalendarRange(new Date()), []);
  const defaultBatchDestinationDate = React.useMemo(() => {
    const nextDate = addDays(selectedDate, 1);
    return nextDate <= nutritionCalendarRange.maximumDate ? nextDate : selectedDate;
  }, [nutritionCalendarRange.maximumDate, selectedDate]);
  const daySwitcherRef = React.useRef<DaySwitcherRef>(null);
  const scrollViewRef = React.useRef<ScrollView>(null);
  const isAutoSelectedDateRef = React.useRef(true);

  const resetToToday = React.useCallback(() => {
    const today = getNutritionDayDate(new Date(), nutritionDayRolloverTime);
    isAutoSelectedDateRef.current = true;
    setSelectedDate(today);

    requestAnimationFrame(() => {
      daySwitcherRef.current?.scrollToDate(today);
      scrollViewRef.current?.scrollTo({ y: 0, animated: true });
    });
  }, [nutritionDayRolloverTime]);

  React.useEffect(() => {
    if (prefsLoading || !isAutoSelectedDateRef.current) return;
    setSelectedDate(getNutritionDayDate(new Date(), nutritionDayRolloverTime));
  }, [nutritionDayRolloverTime, prefsLoading]);

  useFocusEffect(
    React.useCallback(() => {
      const routeDate = route.params?.date;
      if (!routeDate) return;

      const nextDate = parseISO(routeDate);
      if (isValid(nextDate)) {
        isAutoSelectedDateRef.current = false;
        setSelectedDate(nextDate);
        requestAnimationFrame(() => {
          daySwitcherRef.current?.scrollToDate(nextDate);
          scrollViewRef.current?.scrollTo({ y: 0, animated: true });
        });
      }

      navigation.setParams({ date: undefined });
    }, [navigation, route.params?.date]),
  );

  // Keep visible week aligned with the selected day whenever this screen gains focus
  useFocusEffect(
    React.useCallback(() => {
      const timeoutId = setTimeout(() => {
        daySwitcherRef.current?.scrollToDate(selectedDate);
      }, 50);

      return () => clearTimeout(timeoutId);
    }, [selectedDate]),
  );

  // Listen for tabPress to reset to Today (User Requirement)
  React.useEffect(() => {
    // We need to capture the tabPress event from the Tab Navigator.
    // The 'Nutrition' tab renders the 'NutritionNavigator' (Stack).
    // The 'tabPress' event is emitted to the 'Nutrition' route (the Stack).
    // So we need to listen on the Stack's navigation prop, which is our direct parent.
    const parent = navigation.getParent<BottomTabNavigationProp<TabParamList>>();
    if (parent) {
      const unsubscribe = parent.addListener('tabPress', _e => {
        console.log('[NutritionHome] Tab pressed, resetting to today (Today pressed)');
        resetToToday();
      });

      return unsubscribe;
    }
  }, [navigation, resetToToday]);

  // Data Hooks
  const formattedDate = format(selectedDate, 'yyyy-MM-dd');
  const { data: waterMl, update: saveWater } = useWaterIntake(formattedDate);
  const vacationRangeStart = format(subDays(selectedDate, 35), 'yyyy-MM-dd');
  const vacationRangeEnd = format(addDays(selectedDate, 35), 'yyyy-MM-dd');
  const { data: vacationDates } = useVacationDateSet(vacationRangeStart, vacationRangeEnd);

  // Data Hook (The brain)
  const { meals, totals, targets, isVacationDay } = useDayNutrition(selectedDate);

  // Refetch preferences when screen comes into focus
  useFocusEffect(
    React.useCallback(() => {
      // Silent refetch to avoid loading flicker
      refetchPreferences(true);
    }, []),
  );

  const enabledMeals = preferences?.nutrition_prefs?.enabled_meals;
  const snackBehavior = preferences?.nutrition_prefs?.snack_behavior || {
    treat_as_meal: true,
    show_only_if_content: false,
  };
  const macroDisplay = preferences?.nutrition_prefs?.macro_display || 'per_meal';

  // Default meal types in order
  const defaultMealTypes: MealType[] = ['breakfast', 'almuerzo', 'lunch', 'merienda', 'dinner', 'snack'];

  // Filter meal types based on enabled_meals preferences
  const displayMealTypes = enabledMeals
    ? defaultMealTypes.filter(type => enabledMeals[type] !== false)
    : defaultMealTypes;

  console.log('[NutritionHome] Enabled meals config:', enabledMeals);
  console.log('[NutritionHome] Displaying sections:', displayMealTypes);

  // Actions
  const upsertLog = useUpsertMealLog();
  const deleteMealLog = useDeleteMealLog();
  const restoreMealLog = useRestoreMealLog();
  const copyMeal = useCopyMeal();
  const moveMeal = useMoveMeal();
  const moveMealById = useMoveMealById();
  const copyMeals = useCopyMealsToDate();
  const moveMeals = useMoveMealsToDate();
  const duplicateDay = useCopyDayToDate();
  const copyMealRange = useCopyMealRange();
  const moveMealRange = useMoveMealRange();
  const [undoAction, setUndoAction] = useState<MealUndoAction | null>(null);
  const [isUndoing, setIsUndoing] = useState(false);
  const undoTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const showUndoAction = React.useCallback((action: MealUndoAction) => {
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    setUndoAction(action);
    undoTimerRef.current = setTimeout(() => setUndoAction(null), MEAL_UNDO_WINDOW_MS);
  }, []);

  React.useEffect(
    () => () => {
      if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    },
    [],
  );

  // The floating "+" defaults the meal slot to the current time of day so the
  // user lands in the right section without scrolling to find it. Falls back to
  // an enabled slot if the time-of-day pick is hidden by preferences.
  const pickDefaultMealType = (): MealType => {
    const preferred = getMealTypeByHour();
    return displayMealTypes.includes(preferred) ? preferred : displayMealTypes[0] || 'snack';
  };

  // Handlers
  const handleAddFood = (type: MealType) => {
    navigation.navigate('MealLogForm', {
      date: formattedDate,
      isExtra: true,
      mealItem: { mealType: type },
    });
  };

  const handleEditMeal = (item: DailyMealItem) => {
    navigation.navigate('MealLogForm', {
      date: formattedDate,
      mealItem: item,
      isExtra: item.status === 'extra_meal',
    });
  };

  const handleCopyMeal = (item: DailyMealItem) => {
    setMealTransferAction({ type: 'copy', meal: item });
  };

  const handleMoveMeal = (item: DailyMealItem) => {
    if (!item.log?.id) return;
    setMealTransferAction({ type: 'move', meal: item });
  };

  const handleBatchMenuAction = (action: MealBatchAction) => {
    if (action === 'import-menu') {
      navigation.navigate(getNutritionHomeMenuImportTarget().screen);
      return;
    }

    if (action === 'select') {
      setSelectedMealIds(new Set());
      setIsMealSelectionMode(true);
      return;
    }

    if (action === 'duplicate-day') {
      setBatchModal({ mode: 'day', operation: 'copy' });
      return;
    }

    setBatchModal({ mode: 'range', operation: action === 'copy-range' ? 'copy' : 'move' });
  };

  const toggleMealSelection = (item: DailyMealItem) => {
    if (!item.log?.id) return;
    setSelectedMealIds(previous => {
      const next = new Set(previous);
      if (next.has(item.log!.id)) next.delete(item.log!.id);
      else next.add(item.log!.id);
      return next;
    });
  };

  const openSelectedMealsModal = (operation: MealBatchModalOperation) => {
    if (selectedMealIds.size === 0) return;
    setBatchModal({ mode: 'selection', operation });
  };

  const handleBatchSubmit = async (values: MealBatchModalValues) => {
    if (!batchModal) return;
    let result: { processedCount: number };

    if (batchModal.mode === 'selection') {
      if (!values.destinationDate) throw new Error('A destination date is required');
      result = await (batchModal.operation === 'copy' ? copyMeals : moveMeals).mutateAsync({
        mealIds: Array.from(selectedMealIds),
        destinationDate: values.destinationDate,
      });
    } else if (batchModal.mode === 'day') {
      if (!values.destinationDate) throw new Error('A destination date is required');
      result = await duplicateDay.mutateAsync({ sourceDate: formattedDate, destinationDate: values.destinationDate });
    } else {
      if (!values.sourceStartDate || !values.sourceEndDate || !values.destinationStartDate) {
        throw new Error('A complete date range is required');
      }
      const range: MealRange = { startDate: values.sourceStartDate, endDate: values.sourceEndDate };
      result = await (batchModal.operation === 'copy' ? copyMealRange : moveMealRange).mutateAsync({
        range,
        destinationStartDate: values.destinationStartDate,
      });
    }

    setBatchModal(null);
    setIsMealSelectionMode(false);
    setSelectedMealIds(new Set());
    Alert.alert(
      t('nutrition.batchSuccessTitle'),
      t(
        batchModal.operation === 'copy' || batchModal.mode === 'day'
          ? 'nutrition.batchCopySuccess'
          : 'nutrition.batchMoveSuccess',
        {
          count: result.processedCount,
        },
      ),
    );
  };

  const handleMealTransferSubmit = async ({ date, mealType }: CopyMealDestination) => {
    if (!mealTransferAction) return;

    if (mealTransferAction.type === 'move') {
      const sourceLog = mealTransferAction.meal.log;
      if (!sourceLog) return;

      await moveMeal.mutateAsync({ source: mealTransferAction.meal, date, mealType });
      setMealTransferAction(null);
      showUndoAction(
        createMovedMealUndoAction({
          logId: sourceLog.id,
          previous: { date: sourceLog.date, mealType: sourceLog.meal_type },
          current: { date, mealType },
          expiresAt: Date.now() + MEAL_UNDO_WINDOW_MS,
        }),
      );

      const destinationDate = parseISO(date);
      if (isValid(destinationDate)) {
        isAutoSelectedDateRef.current = false;
        setSelectedDate(destinationDate);
        requestAnimationFrame(() => {
          daySwitcherRef.current?.scrollToDate(destinationDate);
          scrollViewRef.current?.scrollTo({ y: 0, animated: true });
        });
      }

      return;
    }

    await copyMeal.mutateAsync({ source: mealTransferAction.meal, date, mealType });
    setMealTransferAction(null);

    Alert.alert(
      t('nutrition.copyMealSuccessTitle'),
      t('nutrition.copyMealSuccessMessage', {
        date: formatLocalizedDate(parseISO(date), { en: 'MMM d, yyyy', es: "d 'de' MMM yyyy" }),
        mealType: t(MEAL_TYPE_LABELS[mealType]),
      }),
    );
  };

  const handleCheckMeal = (item: DailyMealItem) => {
    if (item.status !== 'pending' && item.log) {
      // Uncheck logic if needed (optional for now)
      console.log('Unchecking not implemented yet');
    } else {
      // Check it as 'Done' as planned
      upsertLog.mutate({
        date: formattedDate,
        meal_type: item.mealType,
        diet_template_meal_id: item.templateMealId,
        adherence_status: 'done_as_planned',
        name: item.displayName,
        ...item.macros,
        user_id: '', // handle by service
      });
    }
  };

  const handleDeleteMeal = async (item: DailyMealItem) => {
    if (!item.logId) return;
    Alert.alert(t('nutrition.deleteMealTitle'), t('nutrition.deleteMealConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: async () => {
          try {
            const snapshot = await deleteMealLog.mutateAsync(item.logId!);
            showUndoAction(createDeletedMealUndoAction(snapshot, Date.now() + MEAL_UNDO_WINDOW_MS));
          } catch (error) {
            console.error('Error deleting meal:', error);
            Alert.alert(t('common.error'), t('nutrition.deleteMealError'));
          }
        },
      },
    ]);
  };

  const handleUndoMealAction = async () => {
    const action = undoAction;
    if (!action || !isMealUndoAvailable(action) || isUndoing) return;

    setIsUndoing(true);
    try {
      if (action.kind === 'move') {
        await moveMealById.mutateAsync({
          logId: action.logId,
          current: { date: action.current.date, meal_type: action.current.mealType },
          date: action.previous.date,
          mealType: action.previous.mealType,
        });
      } else {
        await restoreMealLog.mutateAsync(action.snapshot);
      }

      if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
      setUndoAction(null);
    } catch (error) {
      console.error('Error undoing meal action:', error);
      Alert.alert(t('common.error'), t('nutrition.undoMealError'));
    } finally {
      setIsUndoing(false);
    }
  };

  // Derived Groups
  const groupedMeals = groupMealsByType(meals);

  // If preferences are initially loading and we don't have them yet, show simple loading or nothing
  // This prevents the "default show all" flicker
  if (prefsLoading && !preferences) {
    return (
      <LinearGradient
        colors={dynamicStyles.gradientColors}
        style={styles.container}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        <SafeAreaView style={styles.container}>
          <View style={styles.topBar} />
          {/* Optional: Add skeleton or spinner here if load takes > 200ms */}
        </SafeAreaView>
      </LinearGradient>
    );
  }

  // Construct summary object expected by Header
  const summary = {
    totalKcal: totals?.kcal || 0,
    targetKcal: targets?.kcal || 0,
    totalProtein: totals?.protein_g || 0,
    targetProtein: targets?.protein_g || 0,
    totalCarbs: totals?.carbs_g || 0,
    targetCarbs: targets?.carbs_g || 0,
    totalFats: totals?.fats_g || 0,
    targetFats: targets?.fats_g || 0,
  };

  return (
    <LinearGradient colors={dynamicStyles.gradientColors} style={styles.container}>
      <SafeAreaView style={{ paddingBottom: 0, flex: 1 }}>
        {/* Top Bar */}
        <View style={styles.topBar}>
          <Text style={[styles.headerTitle, dynamicStyles.headerTitle]}>{t('tabs.nutrition')}</Text>
          <View style={styles.topActions}>
            <TouchableOpacity
              style={styles.topAction}
              onPress={() => {
                const target = getNutritionHomeRecipeLibraryTarget(formattedDate);
                navigation.navigate(target.screen, target.params);
              }}
              accessibilityRole="button"
              accessibilityLabel={t('nutrition.recipeLibraryTitle')}
            >
              <BookOpen color={themeColors.textPrimary} size={24} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.topAction}
              onPress={() => navigation.navigate('Settings')}
              accessibilityRole="button"
              accessibilityLabel={t('tabs.settings')}
            >
              <Settings color={themeColors.textPrimary} size={24} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.topAction}
              onPress={() => setIsBatchMenuVisible(true)}
              accessibilityRole="button"
              accessibilityLabel={t('nutrition.nutritionActions')}
            >
              <MoreVertical color={themeColors.textPrimary} size={24} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Day Switcher - Removed external wrapper styles to let component handle margin */}
        <DaySwitcher
          ref={daySwitcherRef}
          selectedDate={selectedDate}
          markedDates={vacationDates}
          onSelectDate={date => {
            isAutoSelectedDateRef.current = false;
            setSelectedDate(date);
          }}
        />

        <ScrollView
          ref={scrollViewRef}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: topFromScreenBottom + 96 }]}
        >
          {isMealSelectionMode ? (
            <View style={[styles.selectionToolbar, { backgroundColor: themeColors.surfaceSolid }]}>
              <View style={styles.selectionToolbarHeader}>
                <View style={styles.selectionTitleCopy}>
                  <Text style={[styles.selectionTitle, { color: themeColors.textPrimary }]}>
                    {t('nutrition.selectMeals')}
                  </Text>
                  <Text style={[styles.selectionCount, { color: themeColors.textSecondary }]}>
                    {t('nutrition.selectedMealsCount', { count: selectedMealIds.size })}
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => {
                    setIsMealSelectionMode(false);
                    setSelectedMealIds(new Set());
                  }}
                  style={styles.selectionClose}
                  accessibilityRole="button"
                  accessibilityLabel={t('nutrition.cancelSelection')}
                >
                  <X size={20} color={themeColors.textSecondary} />
                </TouchableOpacity>
              </View>
              <View style={styles.selectionActions}>
                <TouchableOpacity
                  onPress={() => openSelectedMealsModal('copy')}
                  disabled={selectedMealIds.size === 0}
                  accessibilityRole="button"
                  accessibilityLabel={t('nutrition.batchCopyAction')}
                  style={[
                    styles.selectionAction,
                    { borderColor: themeColors.primary },
                    selectedMealIds.size === 0 && styles.disabled,
                  ]}
                >
                  <Copy size={17} color={themeColors.primary} />
                  <Text style={[styles.selectionActionText, { color: themeColors.primary }]}>
                    {t('nutrition.batchCopyAction')}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => openSelectedMealsModal('move')}
                  disabled={selectedMealIds.size === 0}
                  accessibilityRole="button"
                  accessibilityLabel={t('nutrition.batchMoveAction')}
                  style={[
                    styles.selectionAction,
                    { backgroundColor: themeColors.primary },
                    selectedMealIds.size === 0 && styles.disabled,
                  ]}
                >
                  <MoveRight size={17} color="#FFFFFF" />
                  <Text style={styles.selectionActionTextLight}>{t('nutrition.batchMoveAction')}</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : null}

          {/* Calorie Summary Header */}
          <CalorieEquationHeader
            calories={{
              current: convertEnergyToUi(summary.totalKcal).value,
              target: convertEnergyToUi(summary.targetKcal || 2000).value,
              unit: convertEnergyToUi(summary.totalKcal).unit,
            }}
            macros={{
              protein: { current: summary.totalProtein, target: summary.targetProtein || 150 },
              carbs: { current: summary.totalCarbs, target: summary.targetCarbs || 200 },
              fats: { current: summary.totalFats, target: summary.targetFats || 60 },
            }}
          />

          {isVacationDay ? (
            <View style={[styles.vacationBanner, { backgroundColor: themeColors.primary + '12' }]}>
              <View style={[styles.vacationIcon, { backgroundColor: themeColors.primary + '18' }]}>
                <CalendarCheck color={themeColors.primary} size={22} />
              </View>
              <View style={styles.vacationCopy}>
                <Text style={[styles.vacationTitle, { color: themeColors.textPrimary }]}>
                  {t('nutrition.vacationDayTitle')}
                </Text>
                <Text style={[styles.vacationDescription, { color: themeColors.textSecondary }]}>
                  {t('nutrition.vacationDayDescription')}
                </Text>
              </View>
            </View>
          ) : null}

          {/* Meal Sections - Iterate based on user preferences */}
          {displayMealTypes.map(type => {
            const mealsForType = groupedMeals[type] || [];

            // Determine if this is a secondary section (snack with minimize enabled)
            const isSnack = type === MEAL_TYPES.SNACK;
            const isSecondary = isSnack && snackBehavior.show_only_if_content === true;

            return (
              <MealSection
                key={type}
                title={t(MEAL_TYPE_LABELS[type]) || type.toUpperCase()}
                meals={mealsForType}
                onAdd={() => handleAddFood(type)}
                onEditMeal={handleEditMeal}
                onCopyMeal={handleCopyMeal}
                onMoveMeal={handleMoveMeal}
                onCheckMeal={handleCheckMeal}
                onDeleteMeal={handleDeleteMeal}
                selectionMode={isMealSelectionMode}
                isMealSelected={item => !!item.log?.id && selectedMealIds.has(item.log.id)}
                onToggleMeal={toggleMealSelection}
                isSecondary={isSecondary}
                showMacros={macroDisplay === 'per_meal'}
              />
            );
          })}

          {/* Water Tracker */}
          <WaterTracker
            currentMl={waterMl}
            targetMl={4000}
            onSave={async ml => {
              await saveWater(ml);
            }}
          />

          <View style={{ height: 40 }} />
        </ScrollView>

        <CopyMealModal
          visible={mealTransferAction !== null}
          variant={mealTransferAction?.type ?? 'copy'}
          sourceName={mealTransferAction?.meal.displayName ?? ''}
          initialDate={mealTransferAction?.type === 'move' ? selectedDate : currentNutritionDate}
          initialMealType={mealTransferAction?.type === 'move' ? mealTransferAction.meal.mealType : undefined}
          minimumDate={nutritionCalendarRange.minimumDate}
          maximumDate={nutritionCalendarRange.maximumDate}
          mealTypes={displayMealTypes}
          onCancel={() => setMealTransferAction(null)}
          onCopy={handleMealTransferSubmit}
        />

        <MealBatchActionsMenu
          visible={isBatchMenuVisible}
          onClose={() => setIsBatchMenuVisible(false)}
          onSelect={handleBatchMenuAction}
        />

        <MealBatchActionModal
          visible={batchModal !== null}
          mode={batchModal?.mode ?? 'day'}
          operation={batchModal?.operation ?? 'copy'}
          selectedCount={selectedMealIds.size}
          sourceDate={selectedDate}
          initialDestinationDate={defaultBatchDestinationDate}
          initialSourceEndDate={selectedDate}
          minimumDate={nutritionCalendarRange.minimumDate}
          maximumDate={nutritionCalendarRange.maximumDate}
          onCancel={() => setBatchModal(null)}
          onSubmit={handleBatchSubmit}
        />

        {undoAction ? (
          <UndoToast
            message={
              undoAction.kind === 'move'
                ? t('nutrition.mealMovedUndoMessage', {
                    date: formatLocalizedDate(parseISO(undoAction.current.date), {
                      en: 'MMM d, yyyy',
                      es: "d 'de' MMM yyyy",
                    }),
                  })
                : t('nutrition.mealDeletedUndoMessage')
            }
            actionLabel={t('nutrition.undoMealAction')}
            accessibilityLabel={t('nutrition.undoMealAccessibility')}
            onUndo={handleUndoMealAction}
            onDismiss={() => {
              if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
              setUndoAction(null);
            }}
            dismissAccessibilityLabel={t('common.close')}
            isBusy={isUndoing}
            bottomOffset={topFromScreenBottom + 12}
            backgroundColor={themeColors.textPrimary}
            textColor={themeColors.background}
            actionColor={themeColors.primary}
          />
        ) : null}

        {/* Quick-add FAB: opens the quick-add sheet on the meal slot matching the time of day */}
        <TouchableOpacity
          style={[styles.fab, { bottom: topFromScreenBottom + 28, backgroundColor: themeColors.primary }]}
          onPress={() => handleAddFood(pickDefaultMealType())}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel={t('nutrition.addMeal')}
        >
          <Plus color="#FFFFFF" size={26} strokeWidth={2.6} />
        </TouchableOpacity>
      </SafeAreaView>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 6,
    gap: 8,
  },
  headerTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: '700',
  },
  topActions: {
    flexShrink: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  topAction: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateSection: {
    // marginBottom: 8 // Removed since DaySwitcher has its own spacing
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 100,
  },
  vacationBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 18,
    padding: 16,
    marginBottom: 16,
  },
  vacationIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  vacationCopy: {
    flex: 1,
  },
  selectionToolbar: {
    borderRadius: 18,
    padding: 14,
    marginBottom: 12,
  },
  selectionToolbarHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  selectionTitleCopy: { flex: 1 },
  selectionTitle: { fontSize: 16, fontWeight: '800' },
  selectionCount: { fontSize: 13, marginTop: 3 },
  selectionClose: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  selectionActions: { flexDirection: 'row', gap: 10, marginTop: 8 },
  selectionAction: {
    flex: 1,
    minHeight: 44,
    borderWidth: 1,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
  },
  selectionActionText: { fontSize: 13, fontWeight: '800' },
  selectionActionTextLight: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
  disabled: { opacity: 0.45 },
  vacationTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 2,
  },
  vacationDescription: {
    fontSize: 13,
    lineHeight: 18,
  },
  fab: {
    position: 'absolute',
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 6,
  },
});
