import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useMemo } from 'react';
import { nutritionService } from '../services/nutritionService';
import { createVacationDateSet } from '../services/nutritionVacation';
import { getNutritionDayStatusDates } from '../services/nutritionDayStatus';
import {
  DietTemplateInsert,
  DietTemplateUpdate,
  MealLog,
  MealLogInsert,
  MealType,
} from '../../../types/requests.types';
import { IngredientInput } from '../types/db';
import type { DailyMealItem } from '../types';
import {
  copyDayToDate,
  copyMealRange,
  copyMealToDate,
  copyMealsToDate,
  moveMealRange,
  moveMealsToDate,
  moveMealToDate,
} from '../services/dietCopyService';
import type { MealRange } from '../services/mealBatchPlanner';
import { useAuth } from '../../../context/AuthContext';
import { getCurrentAppLocale } from '../../../services/localization';
import { usePreferences } from '../../../hooks/settings/usePreferences';
import type { DeletedMealSnapshot } from '../services/mealUndoPlanner';

const KEYS = {
  TEMPLATES: (userId: string) => ['dietTemplates', userId],
  TEMPLATE_MEALS: (id: string) => ['dietTemplateMeals', id],
  MEAL_LOGS: (userId: string, start: string, end: string) => ['mealLogs', userId, start, end],
  DAY_STATUSES: (userId: string, start: string, end: string) => ['nutritionDayStatuses', userId, start, end],
  WATER: (userId: string, date: string, fallbackMl = 0) => ['water', userId, date, fallbackMl],
  ACTIVE_TEMPLATE_ID: 'active_diet_template_id',
};

// --- Templates ---

export function useDietTemplates() {
  const { user } = useAuth();
  return useQuery({
    queryKey: user ? KEYS.TEMPLATES(user.id) : ['dietTemplates', 'anonymous'],
    queryFn: () => nutritionService.getDietTemplates(user!.id),
    enabled: !!user,
  });
}

export function useActiveDietTemplateId() {
  return useQuery({
    queryKey: ['activeTemplateId'],
    queryFn: async () => {
      // Intenta leer de AsyncStorage
      try {
        const value = await AsyncStorage.getItem(KEYS.ACTIVE_TEMPLATE_ID);
        return value;
      } catch (e) {
        console.error('Error reading active template', e);
        return null;
      }
    },
  });
}

export function useSetActiveTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (templateId: string) => {
      await AsyncStorage.setItem(KEYS.ACTIVE_TEMPLATE_ID, templateId);
      return templateId;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['activeTemplateId'] });
      // Invalidate day view as it depends on active template
      queryClient.invalidateQueries({ queryKey: ['dayNutrition'] });
    },
  });
}

export function useCreateDietTemplate() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: (template: DietTemplateInsert) => nutritionService.createDietTemplate(user!.id, template),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dietTemplates'] });
    },
  });
}

export function useDeleteDietTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: nutritionService.deleteDietTemplate,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dietTemplates'] });
    },
  });
}

export function useUpdateDietTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (variables: { id: string; updates: DietTemplateUpdate }) =>
      nutritionService.updateDietTemplate(variables.id, variables.updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dietTemplates'] });
    },
  });
}

// --- Meals in Template ---

export function useDietTemplateMeals(templateId: string) {
  return useQuery({
    queryKey: KEYS.TEMPLATE_MEALS(templateId),
    queryFn: () => nutritionService.getTemplateMeals(templateId),
    enabled: !!templateId,
  });
}

export function useUpsertTemplateMeals() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: nutritionService.upsertTemplateMeals,
    onSuccess: (_, variables) => {
      // We know the templateId from the first item if exists
      if (variables.length > 0) {
        queryClient.invalidateQueries({ queryKey: KEYS.TEMPLATE_MEALS(variables[0].diet_template_id) });
      }
    },
  });
}

export function useDeleteTemplateMeal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: nutritionService.deleteTemplateMeal,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dietTemplateMeals'] });
    },
  });
}

// --- Logs & Daily ---

export function useMealLogs(startDate: string, endDate: string) {
  const { user } = useAuth();
  return useQuery({
    queryKey: user ? KEYS.MEAL_LOGS(user.id, startDate, endDate) : ['mealLogs', 'anonymous', startDate, endDate],
    queryFn: () => nutritionService.getMealLogs(user!.id, startDate, endDate),
    enabled: !!user,
  });
}

export function useNutritionDayStatuses(startDate: string, endDate: string) {
  const { user } = useAuth();
  return useQuery({
    queryKey: user
      ? KEYS.DAY_STATUSES(user.id, startDate, endDate)
      : ['nutritionDayStatuses', 'anonymous', startDate, endDate],
    queryFn: () => nutritionService.getNutritionDayStatuses(user!.id, startDate, endDate),
    enabled: !!user,
  });
}

export function useVacationDateSet(startDate: string, endDate: string) {
  const query = useNutritionDayStatuses(startDate, endDate);
  const vacationDates = useMemo(() => createVacationDateSet(query.data), [query.data]);
  return {
    ...query,
    data: vacationDates,
  };
}

export function useOverTargetDateSet(startDate: string, endDate: string) {
  const query = useNutritionDayStatuses(startDate, endDate);
  const overTargetDates = useMemo(() => getNutritionDayStatusDates(query.data, 'over_target'), [query.data]);
  return { ...query, data: overTargetDates };
}

export function useSetNutritionDayStatus() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (variables: { date: string; status: 'normal' | 'over_target' | 'vacation' }) => {
      if (!user) throw new Error('No user');
      await nutritionService.setNutritionDayStatus(user.id, variables.date, variables.status);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['nutritionDayStatuses'] });
      queryClient.invalidateQueries({ queryKey: ['dayNutrition'] });
    },
  });
}

export function useSetNutritionVacationDates() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (variables: { addDates: string[]; removeDates: string[] }) => {
      if (!user) throw new Error('No user');

      await nutritionService.deleteNutritionVacationDays(user.id, variables.removeDates);
      return nutritionService.upsertNutritionVacationDays(user.id, variables.addDates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['nutritionDayStatuses'] });
      queryClient.invalidateQueries({ queryKey: ['mealLogs'] });
      queryClient.invalidateQueries({ queryKey: ['dayNutrition'] });
    },
  });
}

export function useUpsertMealLog() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: (log: MealLogInsert) => nutritionService.upsertMealLog(user!.id, log),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mealLogs'] });
      queryClient.invalidateQueries({ queryKey: ['dayNutrition'] });
      queryClient.invalidateQueries({ queryKey: ['shoppingList'] });
    },
  });
}

export function useDeleteMealLog() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (id: string) => {
      if (!user) throw new Error('No user');
      return nutritionService.deleteMealLogWithSnapshot(user.id, id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mealLogs'] });
      queryClient.invalidateQueries({ queryKey: ['dayNutrition'] });
      queryClient.invalidateQueries({ queryKey: ['shoppingList'] });
    },
  });
}

export function useRestoreMealLog() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (snapshot: DeletedMealSnapshot) => {
      if (!user) throw new Error('No user');
      await nutritionService.restoreDeletedMeal(user.id, snapshot);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mealLogs'] });
      queryClient.invalidateQueries({ queryKey: ['dayNutrition'] });
      queryClient.invalidateQueries({ queryKey: ['shoppingList'] });
    },
  });
}

export type CopyMealInput = {
  source: DailyMealItem;
  date: string;
  mealType: MealType;
};

export function useCopyMeal() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ source, date, mealType }: CopyMealInput) => {
      if (!user) throw new Error('No user');

      return copyMealToDate(user.id, { log: source.log, templateMeal: source.templateMeal }, { date, mealType });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mealLogs'] });
      queryClient.invalidateQueries({ queryKey: ['dayNutrition'] });
      queryClient.invalidateQueries({ queryKey: ['shoppingList'] });
    },
  });
}

export type MoveMealInput = CopyMealInput;

export function useMoveMeal() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ source, date, mealType }: MoveMealInput) => {
      if (!user) throw new Error('No user');
      if (!source.log) throw new Error('A registered meal is required to move it');

      return moveMealToDate(user.id, source.log, { date, mealType });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mealLogs'] });
      queryClient.invalidateQueries({ queryKey: ['dayNutrition'] });
      queryClient.invalidateQueries({ queryKey: ['shoppingList'] });
    },
  });
}

export function useMoveMealById() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (variables: {
      logId: string;
      current: Pick<MealLog, 'date' | 'meal_type'>;
      date: string;
      mealType: MealType;
    }) => {
      if (!user) throw new Error('No user');

      return moveMealToDate(
        user.id,
        {
          id: variables.logId,
          date: variables.current.date,
          meal_type: variables.current.meal_type,
        },
        { date: variables.date, mealType: variables.mealType },
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mealLogs'] });
      queryClient.invalidateQueries({ queryKey: ['dayNutrition'] });
      queryClient.invalidateQueries({ queryKey: ['shoppingList'] });
    },
  });
}

const invalidateNutritionMealQueries = (queryClient: ReturnType<typeof useQueryClient>) => {
  queryClient.invalidateQueries({ queryKey: ['mealLogs'] });
  queryClient.invalidateQueries({ queryKey: ['dayNutrition'] });
  queryClient.invalidateQueries({ queryKey: ['shoppingList'] });
};

export function useCopyMealsToDate() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (variables: { mealIds: string[]; destinationDate: string }) => {
      if (!user) throw new Error('No user');
      return copyMealsToDate(user.id, variables.mealIds, variables.destinationDate);
    },
    onSuccess: () => invalidateNutritionMealQueries(queryClient),
  });
}

export function useMoveMealsToDate() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (variables: { mealIds: string[]; destinationDate: string }) => {
      if (!user) throw new Error('No user');
      return moveMealsToDate(user.id, variables.mealIds, variables.destinationDate);
    },
    onSuccess: () => invalidateNutritionMealQueries(queryClient),
  });
}

export function useCopyDayToDate() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (variables: { sourceDate: string; destinationDate: string }) => {
      if (!user) throw new Error('No user');
      return copyDayToDate(user.id, variables.sourceDate, variables.destinationDate);
    },
    onSuccess: () => invalidateNutritionMealQueries(queryClient),
  });
}

export function useCopyMealRange() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (variables: { range: MealRange; destinationStartDate: string }) => {
      if (!user) throw new Error('No user');
      return copyMealRange(user.id, variables.range, variables.destinationStartDate);
    },
    onSuccess: () => invalidateNutritionMealQueries(queryClient),
  });
}

export function useMoveMealRange() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (variables: { range: MealRange; destinationStartDate: string }) => {
      if (!user) throw new Error('No user');
      return moveMealRange(user.id, variables.range, variables.destinationStartDate);
    },
    onSuccess: () => invalidateNutritionMealQueries(queryClient),
  });
}

export function useSaveMealWithIngredients() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: (variables: { log: Partial<MealLog>; ingredients: IngredientInput[] }) =>
      nutritionService.saveMealWithIngredients(user!.id, variables.log, variables.ingredients),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mealLogs'] });
      queryClient.invalidateQueries({ queryKey: ['dayNutrition'] });
      queryClient.invalidateQueries({ queryKey: ['shoppingList'] });
    },
  });
}

export function useMealItems(logId: string | undefined) {
  const languageCode = getCurrentAppLocale();

  return useQuery({
    queryKey: ['mealItems', logId, languageCode],
    queryFn: () => nutritionService.getMealItems(logId!, languageCode),
    enabled: !!logId,
  });
}

// --- Water ---

export function useWaterIntake(date: string) {
  const queryClient = useQueryClient();

  const { user } = useAuth();
  const { preferences } = usePreferences();
  const storedDefaultHydrationMl = preferences?.nutrition_prefs?.default_hydration_ml;
  const defaultHydrationMl =
    typeof storedDefaultHydrationMl === 'number' && Number.isFinite(storedDefaultHydrationMl)
      ? Math.max(0, Math.round(storedDefaultHydrationMl))
      : 0;

  const query = useQuery({
    queryKey: user ? KEYS.WATER(user.id, date, defaultHydrationMl) : ['water', 'anonymous', date, defaultHydrationMl],
    queryFn: () => nutritionService.getWaterIntake(user!.id, date, defaultHydrationMl),
    enabled: !!user,
  });

  const mutation = useMutation({
    mutationFn: (ml: number) => nutritionService.upsertWaterIntake(user!.id, date, ml),
    onSuccess: ml => {
      if (user) {
        queryClient.setQueryData(KEYS.WATER(user.id, date, defaultHydrationMl), ml);
      }
    },
  });

  return {
    data: query.data ?? defaultHydrationMl,
    isLoading: query.isLoading,
    update: mutation.mutateAsync,
  };
}
