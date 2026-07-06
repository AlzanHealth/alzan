import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { RouteProp, useNavigation, useFocusEffect, useRoute } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Settings, Plus, BookOpen, CalendarCheck } from 'lucide-react-native';
import { addDays, format, isValid, parseISO, subDays } from 'date-fns';

import { CalorieEquationHeader } from '../../modules/nutrition/components/CalorieEquationHeader';
import { MealSection } from '../../modules/nutrition/components/MealSection';
import { WaterTracker } from '../../modules/nutrition/components/WaterTracker';
import { useDayNutrition } from '../../modules/nutrition/hooks/useDayNutritionLogic';
import {
  useUpsertMealLog,
  useDeleteMealLog,
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
import { BottomTabNavigationProp, useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { useTranslation } from 'react-i18next';
import { Alert } from '../../components/common/Alert';
import { getNutritionDayDate, normalizeNutritionDayRolloverTime } from '../../modules/nutrition/services/nutritionDay';

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

export const NutritionHomeScreen = () => {
  const { t } = useTranslation();
  const navigation = useNavigation<NutritionScreenNavigationProp>();
  const route = useRoute<RouteProp<NutritionStackParamList, 'NutritionHome'>>();
  const { convertEnergyToUi } = useUnitConversion();
  const { styles: dynamicStyles, colors: themeColors } = useNutritionStyles();
  const tabBarHeight = useBottomTabBarHeight();
  const { preferences, refetch: refetchPreferences, loading: prefsLoading } = usePreferences();
  const nutritionDayRolloverTime = normalizeNutritionDayRolloverTime(
    preferences?.nutrition_prefs?.nutrition_day_rollover_time,
  );

  // Date Logic
  const [selectedDate, setSelectedDate] = useState(() => getNutritionDayDate(new Date(), nutritionDayRolloverTime));
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
            await deleteMealLog.mutateAsync(item.logId!);
          } catch (error) {
            console.error('Error deleting meal:', error);
            Alert.alert(t('common.error'), t('nutrition.deleteMealError'));
          }
        },
      },
    ]);
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
            <TouchableOpacity onPress={() => navigation.navigate('RecipeLibrary', { date: formattedDate })}>
              <BookOpen color={themeColors.textPrimary} size={24} />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => navigation.navigate('Settings')}>
              <Settings color={themeColors.textPrimary} size={24} />
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
          contentContainerStyle={[styles.scrollContent, { paddingBottom: tabBarHeight + 96 }]}
        >
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
                onCheckMeal={handleCheckMeal}
                onDeleteMeal={handleDeleteMeal}
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

        {/* Quick-add FAB: opens the quick-add sheet on the meal slot matching the time of day */}
        <TouchableOpacity
          style={[styles.fab, { bottom: tabBarHeight + 28, backgroundColor: themeColors.primary }]}
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
    justifyContent: 'center', // Center title
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    position: 'relative',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  topActions: {
    position: 'absolute',
    right: 16,
    top: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
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
