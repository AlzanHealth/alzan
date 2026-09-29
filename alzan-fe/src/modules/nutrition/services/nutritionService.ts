// src/modules/nutrition/services/nutritionService.ts
// Service for managing nutrition data (Templates, Logs, Items)

import { supabase } from '../../../lib/supabaseClient';
import {
  DietTemplate,
  DietTemplateInsert,
  DietTemplateUpdate,
  DietTemplateMeal,
  DietTemplateMealInsert,
  MealLog,
  MealLogInsert,
  MealLogsDataQuality,
  MealItem,
  MealItemInsert,
  NutritionDayStatus,
  NutritionDayStatusInsert,
} from '../../../types/requests.types';
import { IngredientInput } from '../types/db';
import { getLocalizedIngredientName } from '../../../services/localization';
import { Locale } from '../../../i18n';
import { MIN_INGREDIENT_QUANTITY_G } from '../constants';
import type { DeletedMealSnapshot } from './mealUndoPlanner';

// Final gate before inserting into meal_items: any positive quantity is clamped to
// at least MIN_INGREDIENT_QUANTITY_G so we never violate the quantity_g > 0 constraint,
// regardless of what the caller sent.
const roundIngredientQuantity = (quantity: number): number => {
  if (quantity <= 0) return MIN_INGREDIENT_QUANTITY_G;
  const rounded = Math.round(quantity * 10) / 10;
  return rounded < MIN_INGREDIENT_QUANTITY_G ? MIN_INGREDIENT_QUANTITY_G : rounded;
};

interface IngredientNameLookupRow {
  id: string;
  name_es: string;
  name_en: string;
}

interface LocalizedMealItem extends MealItem {
  localized_name?: string;
}

export const nutritionService = {
  // --- Diet Templates ---

  async getDietTemplates(userId: string): Promise<DietTemplate[]> {
    if (!userId) return [];

    const { data, error } = await supabase
      .from('diet_templates')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  },

  async createDietTemplate(userId: string, template: DietTemplateInsert): Promise<DietTemplate> {
    if (!userId || !template.base_name) throw new Error('Invalid data');

    const { data, error } = await supabase
      .from('diet_templates')
      .insert({ ...template, user_id: userId })
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async updateDietTemplate(id: string, updates: DietTemplateUpdate): Promise<DietTemplate> {
    const { data, error } = await supabase.from('diet_templates').update(updates).eq('id', id).select().single();

    if (error) throw error;
    return data;
  },

  async deleteDietTemplate(id: string): Promise<void> {
    const { error } = await supabase.from('diet_templates').delete().eq('id', id);
    if (error) throw error;
  },

  // --- Template Meals ---

  async getTemplateMeals(templateId: string): Promise<DietTemplateMeal[]> {
    const { data, error } = await supabase.from('diet_template_meals').select('*').eq('diet_template_id', templateId);

    if (error) throw error;
    return data || [];
  },

  async upsertTemplateMeals(meals: DietTemplateMealInsert[]): Promise<DietTemplateMeal[]> {
    const { data, error } = await supabase.from('diet_template_meals').upsert(meals).select();

    if (error) throw error;
    return data || [];
  },

  async deleteTemplateMeal(id: string): Promise<void> {
    const { error } = await supabase.from('diet_template_meals').delete().eq('id', id);
    if (error) throw error;
  },

  // --- Meal Logs (Daily) ---

  async getMealLogs(userId: string, startDate: string, endDate: string): Promise<MealLog[]> {
    if (!userId) return [];

    const { data, error } = await supabase
      .from('meal_logs')
      .select('*')
      .eq('user_id', userId)
      .gte('date', startDate)
      .lte('date', endDate);

    if (error) throw error;
    return data || [];
  },

  async getNutritionDayStatuses(userId: string, startDate: string, endDate: string): Promise<NutritionDayStatus[]> {
    if (!userId) return [];

    const { data, error } = await supabase
      .from('nutrition_day_statuses')
      .select('user_id, date, status, note, is_over_target, created_at, updated_at')
      .eq('user_id', userId)
      .gte('date', startDate)
      .lte('date', endDate)
      .order('date', { ascending: true })
      .returns<NutritionDayStatus[]>();

    if (error) throw error;
    return data || [];
  },

  async upsertNutritionVacationDays(userId: string, dates: string[]): Promise<NutritionDayStatus[]> {
    if (!userId) throw new Error('No user');
    if (dates.length === 0) return [];

    const uniqueDates = Array.from(new Set(dates)).sort();
    const payload: NutritionDayStatusInsert[] = uniqueDates.map(date => ({
      user_id: userId,
      date,
      status: 'vacation',
      updated_at: new Date().toISOString(),
    }));

    const { data, error } = await supabase
      .from('nutrition_day_statuses')
      .upsert(payload, { onConflict: 'user_id,date' })
      .select('user_id, date, status, note, is_over_target, created_at, updated_at')
      .returns<NutritionDayStatus[]>();

    if (error) throw error;
    return data || [];
  },

  async deleteNutritionVacationDays(userId: string, dates: string[]): Promise<void> {
    if (!userId || dates.length === 0) return;

    const uniqueDates = Array.from(new Set(dates));
    const { error } = await supabase
      .from('nutrition_day_statuses')
      .delete()
      .eq('user_id', userId)
      .in('date', uniqueDates);

    if (error) throw error;
  },

  async setNutritionDayOverTarget(userId: string, date: string, isOverTarget: boolean): Promise<void> {
    if (!userId || !date) throw new Error('Invalid nutrition day');

    const { error } = await supabase.from('nutrition_day_statuses').upsert(
      {
        user_id: userId,
        date,
        is_over_target: isOverTarget,
        updated_at: new Date().toISOString(),
      } as never,
      { onConflict: 'user_id,date' },
    );

    if (error) throw error;
  },

  /**
   * Simple upsert for manual logs (e.g. checking off items)
   * For meals with ingredients, use saveMealWithIngredients
   */
  async upsertMealLog(userId: string, log: MealLogInsert): Promise<MealLog> {
    if (!userId) throw new Error('No user');

    const { data, error } = await supabase
      .from('meal_logs')
      .upsert({ ...log, user_id: userId })
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async deleteMealLog(id: string): Promise<void> {
    // 1. Delete associated items first (manual cascade to be safe)
    const { error: itemsError } = await supabase.from('meal_items').delete().eq('meal_log_id', id);
    if (itemsError) {
      console.error('Error deleting meal items:', itemsError);
      // We continue trying to delete the log even if items fail (though it might fail too if FK exists)
    }

    // 2. Delete the log
    const { error } = await supabase.from('meal_logs').delete().eq('id', id);
    if (error) throw error;
  },

  async deleteMealLogWithSnapshot(userId: string, id: string): Promise<DeletedMealSnapshot> {
    if (!userId || !id) throw new Error('Invalid meal to delete');

    const { data: log, error: logError } = await supabase
      .from('meal_logs')
      .select('*')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (logError) throw logError;

    const { data: items, error: itemsError } = await supabase
      .from('meal_items')
      .select('*')
      .eq('meal_log_id', id)
      .eq('user_id', userId)
      .returns<MealItem[]>();

    if (itemsError) throw itemsError;

    const { error: deleteItemsError } = await supabase
      .from('meal_items')
      .delete()
      .eq('meal_log_id', id)
      .eq('user_id', userId);

    if (deleteItemsError) throw deleteItemsError;

    const { error: deleteLogError } = await supabase.from('meal_logs').delete().eq('id', id).eq('user_id', userId);

    if (deleteLogError) throw deleteLogError;

    return { log, items: items ?? [] };
  },

  async restoreDeletedMeal(userId: string, snapshot: DeletedMealSnapshot): Promise<void> {
    if (!userId || snapshot.log.user_id !== userId) throw new Error('Invalid meal to restore');

    const { error: logError } = await supabase.from('meal_logs').insert(snapshot.log);
    if (logError) throw logError;

    if (snapshot.items.length === 0) return;

    const { error: itemsError } = await supabase.from('meal_items').insert(snapshot.items);
    if (!itemsError) return;

    // Avoid leaving a partial meal behind if restoring its ingredients fails.
    await supabase.from('meal_items').delete().eq('meal_log_id', snapshot.log.id).eq('user_id', userId);
    await supabase.from('meal_logs').delete().eq('id', snapshot.log.id).eq('user_id', userId);
    throw itemsError;
  },

  // --- NEW: Atomic Save with Ingredients ---

  /**
   * Save a meal log and its ingredients, updating totals automatically.
   */
  async saveMealWithIngredients(
    userId: string,
    logData: Partial<MealLog>,
    ingredients: IngredientInput[],
  ): Promise<MealLog> {
    if (!userId) throw new Error('No authenticated user');

    // 1. Calculate Totals if ingredients exist
    const totals = {
      kcal: 0,
      protein_g: 0,
      carbs_g: 0,
      fats_g: 0,
    };
    let dataQuality: MealLogsDataQuality = 'manual';

    if (ingredients && ingredients.length > 0) {
      dataQuality = 'computed';

      ingredients.forEach(ing => {
        const q = roundIngredientQuantity(ing.quantity_g);
        if (ing.kcal_100 || ing.protein_g_100 || ing.carbs_g_100 || ing.fat_g_100) {
          totals.kcal += ((ing.kcal_100 || 0) * q) / 100;
          totals.protein_g += ((ing.protein_g_100 || 0) * q) / 100;
          totals.carbs_g += ((ing.carbs_g_100 || 0) * q) / 100;
          totals.fats_g += ((ing.fat_g_100 || 0) * q) / 100;
        }
      });
    } else {
      // Manual entry
      totals.kcal = Number(logData.kcal) || 0;
      totals.protein_g = Number(logData.protein_g) || 0;
      totals.carbs_g = Number(logData.carbs_g) || 0;
      totals.fats_g = Number(logData.fats_g) || 0;
      dataQuality = 'manual';
    }

    // Round totals
    const finalTotals = {
      kcal: Math.round(totals.kcal),
      protein_g: Math.round(totals.protein_g * 10) / 10,
      carbs_g: Math.round(totals.carbs_g * 10) / 10,
      fats_g: Math.round(totals.fats_g * 10) / 10,
    };

    // 2. Upsert Meal Log
    const logPayload: MealLogInsert = {
      ...logData,
      user_id: userId,
      date: logData.date || new Date().toISOString().split('T')[0],
      meal_type: logData.meal_type || 'snack',
      kcal: finalTotals.kcal,
      protein_g: finalTotals.protein_g,
      carbs_g: finalTotals.carbs_g,
      fats_g: finalTotals.fats_g,
      data_quality: dataQuality,
      origin: logData.origin ?? 'user',
      calc_version: 'nutrition_v1',
      source: logData.source || 'manual',
    };

    if (!logPayload.logged_at) {
      logPayload.logged_at = new Date().toISOString();
    }

    const { data: savedLog, error: logError } = await supabase.from('meal_logs').upsert(logPayload).select().single();

    if (logError) throw logError;
    if (!savedLog) throw new Error('Failed to save log');

    // 3. Handle Ingredients
    const logId = savedLog.id;

    // Delete existing items for this log
    const { error: deleteError } = await supabase.from('meal_items').delete().eq('meal_log_id', logId);

    if (deleteError) throw deleteError;

    if (ingredients && ingredients.length > 0) {
      const itemsPayload = ingredients.map<MealItemInsert>(ing => {
        const q = roundIngredientQuantity(ing.quantity_g);
        const m = {
          kcal: ing.kcal_100 || 0,
          protein_g: ing.protein_g_100 || 0,
          carbs_g: ing.carbs_g_100 || 0,
          fats_g: ing.fat_g_100 || 0,
        };

        const itemKcal = Math.round((m.kcal * q) / 100);
        const itemProtein = Math.round(((m.protein_g * q) / 100) * 10) / 10;
        const itemCarbs = Math.round(((m.carbs_g * q) / 100) * 10) / 10;
        const itemFats = Math.round(((m.fats_g * q) / 100) * 10) / 10;

        return {
          meal_log_id: logId,
          user_id: userId,
          name: ing.name,
          source: ing.source,
          source_ref: ing.source_ref,
          quantity_g: q,
          per_100g_kcal: m.kcal,
          per_100g_protein_g: m.protein_g,
          per_100g_carbs_g: m.carbs_g,
          per_100g_fats_g: m.fats_g,
          kcal: itemKcal,
          protein_g: itemProtein,
          carbs_g: itemCarbs,
          fats_g: itemFats,
          data_quality: ing.source === 'manual' ? 'manual' : 'automatic',
          origin: logData.origin ?? 'user',
        };
      });

      const { error: itemsError } = await supabase.from('meal_items').insert(itemsPayload);

      if (itemsError) throw itemsError;
    }

    return savedLog;
  },

  // --- Water (daily_hydration) ---

  async getWaterIntake(userId: string, date: string, fallbackMl = 0) {
    if (!userId) return fallbackMl;

    const { data, error } = await supabase
      .from('daily_hydration')
      .select('total_ml')
      .eq('user_id', userId)
      .eq('date', date)
      .maybeSingle();

    if (error) {
      throw error;
    }
    return data?.total_ml ?? fallbackMl;
  },

  async upsertWaterIntake(userId: string, date: string, total_ml: number) {
    if (!userId) throw new Error('No user');

    const { data, error } = await supabase
      .from('daily_hydration')
      .upsert(
        {
          user_id: userId,
          date: date,
          total_ml: total_ml,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: 'user_id,date',
        },
      )
      .select()
      .single();

    if (error) throw error;
    return data.total_ml;
  },

  async getMealItems(logId: string, locale?: Locale): Promise<LocalizedMealItem[]> {
    const { data, error } = await supabase
      .from('meal_items')
      .select(
        [
          'id',
          'meal_log_id',
          'user_id',
          'name',
          'source',
          'source_ref',
          'quantity_g',
          'per_100g_kcal',
          'per_100g_protein_g',
          'per_100g_carbs_g',
          'per_100g_fats_g',
          'kcal',
          'protein_g',
          'carbs_g',
          'fats_g',
          'data_quality',
          'created_at',
          'origin',
          'confidence',
        ].join(','),
      )
      .eq('meal_log_id', logId)
      .returns<LocalizedMealItem[]>();

    if (error) throw error;
    const mealItems = data || [];

    const ingredientIds = mealItems
      .filter(item => item.source === 'database' && item.source_ref)
      .map(item => item.source_ref)
      .filter((sourceRef): sourceRef is string => !!sourceRef);

    if (ingredientIds.length === 0) {
      return mealItems;
    }

    const uniqueIngredientIds = Array.from(new Set(ingredientIds));
    const { data: ingredients, error: ingredientError } = await supabase
      .from('ingredients')
      .select('id, name_es, name_en')
      .in('id', uniqueIngredientIds)
      .returns<IngredientNameLookupRow[]>();

    if (ingredientError || !ingredients) {
      if (ingredientError) {
        console.error('[nutritionService] Error localizing meal items:', ingredientError);
      }
      return mealItems;
    }

    const ingredientNamesById = new Map(
      ingredients.map(ingredient => [ingredient.id, getLocalizedIngredientName(ingredient, locale)]),
    );

    return mealItems.map(item => ({
      ...item,
      localized_name:
        item.source === 'database' && item.source_ref
          ? ingredientNamesById.get(item.source_ref) || item.name
          : item.name,
    }));
  },
};
