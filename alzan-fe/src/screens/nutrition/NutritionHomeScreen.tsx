import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Settings, Plus, BookOpen } from 'lucide-react-native';
import { format } from 'date-fns';

import { CalorieEquationHeader } from '../../modules/nutrition/components/CalorieEquationHeader';
import { MealSection } from '../../modules/nutrition/components/MealSection';
import { WaterTracker } from '../../modules/nutrition/components/WaterTracker';
import { useDayNutrition } from '../../modules/nutrition/hooks/useDayNutritionLogic';
import { useUpsertMealLog, useDeleteMealLog, useWaterIntake } from '../../modules/nutrition/hooks/useNutritionData';
import { DailyMealItem } from '../../modules/nutrition/types';
import { MEAL_TYPES, MEAL_TYPE_LABELS, getMealTypeByHour } from '../../modules/nutrition/constants';
import { usePreferences } from '../../hooks/settings/usePreferences';
import { useUnitConversion } from '../../hooks/useUnitConversion';
import { useNutritionStyles } from '../../hooks/useNutritionStyles';
import { DaySwitcher, DaySwitcherRef } from '../../components/common/DaySwitcher';
import { NutritionScreenNavigationProp, TabParamList } from '../../types/navigation.types';
import { BottomTabNavigationProp, useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { useTranslation } from 'react-i18next';
import { Alert } from '../../components/common/Alert';

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
  const { convertEnergyToUi } = useUnitConversion();
  const { styles: dynamicStyles, colors: themeColors } = useNutritionStyles();
  const tabBarHeight = useBottomTabBarHeight();

  // Date Logic
  const [selectedDate, setSelectedDate] = useState(new Date());
  const daySwitcherRef = React.useRef<DaySwitcherRef>(null);
  const scrollViewRef = React.useRef<ScrollView>(null);

  const resetToToday = React.useCallback(() => {
    const today = new Date();
    setSelectedDate(today);

    requestAnimationFrame(() => {
      daySwitcherRef.current?.scrollToCurrentWeek();
      scrollViewRef.current?.scrollTo({ y: 0, animated: true });
    });
  }, []);

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

  // Data Hook (The brain)
  const { meals, totals, targets } = useDayNutrition(selectedDate);

  // User Preferences for meal types
  const { preferences, refetch: refetchPreferences, loading: prefsLoading } = usePreferences();

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
  const defaultMealTypes = [
    MEAL_TYPES.BREAKFAST,
    MEAL_TYPES.ALMUERZO,
    MEAL_TYPES.LUNCH,
    MEAL_TYPES.MERIENDA,
    MEAL_TYPES.DINNER,
    MEAL_TYPES.SNACK,
  ];

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
  const pickDefaultMealType = (): string => {
    const preferred = getMealTypeByHour();
    return displayMealTypes.includes(preferred) ? preferred : displayMealTypes[0] || MEAL_TYPES.SNACK;
  };

  // Handlers
  const handleAddFood = (type: string) => {
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
            <TouchableOpacity onPress={() => navigation.navigate('RecipeLibrary')}>
              <BookOpen color={themeColors.textPrimary} size={24} />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => navigation.navigate('Settings')}>
              <Settings color={themeColors.textPrimary} size={24} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Day Switcher - Removed external wrapper styles to let component handle margin */}
        <DaySwitcher ref={daySwitcherRef} selectedDate={selectedDate} onSelectDate={setSelectedDate} />

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

        {/* Quick-add FAB: opens the log form on the meal slot matching the time of day */}
        <TouchableOpacity
          style={[styles.fab, { bottom: tabBarHeight + 20, backgroundColor: themeColors.primary }]}
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
