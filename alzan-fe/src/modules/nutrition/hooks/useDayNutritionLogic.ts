import { useQuery } from '@tanstack/react-query';
import {
  useActiveDietTemplateId,
  useDietTemplateMeals,
  useMealLogs,
  useNutritionDayStatuses,
} from './useNutritionData';
import { DailyMealItem, AdherenceStatus, Macros } from '../types';
import { format } from 'date-fns';
import { DEFAULT_MACROS } from '../constants';
import { getDailyMealMacros, getMenuImportMealState } from '../services/menuImportStatus';
import { shouldShowPendingPlannedMeals } from '../services/nutritionVacation';
import { useAuth } from '../../../context/AuthContext';
import { usePreferences } from '../../../hooks/settings/usePreferences';
import { supabase } from '../../../lib/supabaseClient';
import { DietTemplateMeal, MealLog } from '../../../types/requests.types';
import { useCurrentNutritionDate } from './useCurrentNutritionDate';

export function useDayNutrition(date: Date) {
  const { user } = useAuth();
  const { preferences } = usePreferences();
  const dateStr = format(date, 'yyyy-MM-dd');
  const currentNutritionDate = useCurrentNutritionDate(preferences?.nutrition_prefs?.nutrition_day_rollover_time);
  const { data: activeTemplateId } = useActiveDietTemplateId();

  // 1. Get Logged Meals for this day
  const { data: logs, isLoading: loadingLogs } = useMealLogs(dateStr, dateStr);
  const { data: dayStatuses, isLoading: loadingDayStatus } = useNutritionDayStatuses(dateStr, dateStr);

  // 2. Get Planned Meals (Active Template)
  const { data: templateMeals, isLoading: loadingTemplate } = useDietTemplateMeals(activeTemplateId || '');

  // const dayOfWeekIndex = date.getDay() || 7;
  const mappedDay = date.getDay() === 0 ? 7 : date.getDay();

  // Combine Logic
  const dailyMeals: DailyMealItem[] = [];
  const totals: Macros = { kcal: 0, protein_g: 0, carbs_g: 0, fats_g: 0 };

  // 3. Fetch Global Goals (Manual Targets)
  const { data: globalGoals } = useQuery({
    queryKey: ['globalNutritionGoals', user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data, error } = await supabase
        .from('user_goals')
        .select('target_calories_kcal, target_protein_g, target_carbs_g, target_fats_g')
        .eq('user_id', user.id)
        .eq('goal_type', 'nutrition')
        .maybeSingle();
      if (error) console.error('Error fetching global goals:', error);
      return data;
    },
    enabled: !!user,
    staleTime: 0, // Always fetch fresh or rely on invalidation
  });

  // Initialize targets from Settings (or defaults)
  let targets: Macros = { ...DEFAULT_MACROS };
  if (globalGoals?.target_calories_kcal) {
    targets = {
      kcal: globalGoals.target_calories_kcal,
      protein_g: globalGoals.target_protein_g || 0,
      carbs_g: globalGoals.target_carbs_g || 0,
      fats_g: globalGoals.target_fats_g || 0,
    };
  }

  if (loadingLogs || loadingDayStatus || (activeTemplateId && loadingTemplate)) {
    return { isLoading: true, meals: [], totals, targets };
  }

  const isVacationDay = (dayStatuses || []).some(status => status.status === 'vacation');

  // A. Process Planned Meals for today
  const todaysPlannedMeals = templateMeals?.filter(m => m.day_of_week === mappedDay) || [];

  todaysPlannedMeals.forEach((plan: DietTemplateMeal) => {
    // NOTE: We do NOT add plan targets to daily targets anymore.
    // Daily targets come strictly from Global Settings as per user request.

    // Find if logged
    const log = logs?.find(l => l.diet_template_meal_id === plan.id && l.adherence_status !== 'extra_meal');

    // Construct Item
    if (log) {
      // It's done (or skipped)
      const isSkipped = log.adherence_status === 'skipped';
      const importedState = getMenuImportMealState(log, currentNutritionDate);
      const isImportedPlanned = importedState === 'planned';
      const logMacros = getDailyMealMacros(log);
      dailyMeals.push({
        templateMeal: plan,
        log,
        status:
          importedState === 'planned'
            ? 'pending'
            : importedState === 'assumed_eaten'
              ? 'extra_meal'
              : (log.adherence_status as AdherenceStatus),
        mealType: plan.meal_type,
        displayName: log.name || plan.base_name, // Log name overrides if done_with_changes
        orderIndex: plan.order_index,
        macros: logMacros,
        targetMacros: isImportedPlanned
          ? logMacros
          : {
              kcal: plan.target_kcal || 0,
              protein_g: plan.target_protein_g || 0,
              carbs_g: plan.target_carbs_g || 0,
              fats_g: plan.target_fats_g || 0,
            },
        templateMealId: plan.id,
        logId: log.id,
      });

      if (!isSkipped && !isImportedPlanned) {
        totals.kcal += log.kcal || 0;
        totals.protein_g += log.protein_g || 0;
        totals.carbs_g += log.carbs_g || 0;
        totals.fats_g += log.fats_g || 0;
      }
    } else if (shouldShowPendingPlannedMeals(isVacationDay)) {
      // It's pending
      dailyMeals.push({
        templateMeal: plan,
        status: 'pending',
        mealType: plan.meal_type,
        displayName: plan.base_name,
        orderIndex: plan.order_index,
        macros: {
          // Display target as expected
          kcal: plan.target_kcal || 0,
          protein_g: plan.target_protein_g || 0,
          carbs_g: plan.target_carbs_g || 0,
          fats_g: plan.target_fats_g || 0,
        },
        targetMacros: {
          kcal: plan.target_kcal || 0,
          protein_g: plan.target_protein_g || 0,
          carbs_g: plan.target_carbs_g || 0,
          fats_g: plan.target_fats_g || 0,
        },
        templateMealId: plan.id,
      });
    }
  });

  // B. Process Extra Meals
  const extraLogs = logs?.filter(l => !l.diet_template_meal_id || l.adherence_status === 'extra_meal') || [];

  extraLogs.forEach((log: MealLog) => {
    const importedState = getMenuImportMealState(log, currentNutritionDate);
    const isImportedPlanned = importedState === 'planned';
    const isSkipped = log.adherence_status === 'skipped';
    const logMacros = getDailyMealMacros(log);
    const item: DailyMealItem = {
      log,
      status: isImportedPlanned ? 'pending' : isSkipped ? 'skipped' : 'extra_meal',
      mealType: log.meal_type,
      displayName: log.name || 'Extra Meal',
      orderIndex: 999, // Push to bottom
      macros: logMacros,
      targetMacros: isImportedPlanned ? logMacros : undefined,
      logId: log.id,
    };

    dailyMeals.push(item);

    if (!isImportedPlanned && !isSkipped) {
      totals.kcal += log.kcal || 0;
      totals.protein_g += log.protein_g || 0;
      totals.carbs_g += log.carbs_g || 0;
      totals.fats_g += log.fats_g || 0;
    }
  });

  // Sort by order
  dailyMeals.sort((a, b) => a.orderIndex - b.orderIndex);

  return {
    isLoading: false,
    meals: dailyMeals,
    totals,
    targets,
    activeTemplateId,
    isVacationDay,
  };
}
