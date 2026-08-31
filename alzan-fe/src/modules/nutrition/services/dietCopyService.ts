import { supabase } from '../../../lib/supabaseClient';
import { startOfWeek, endOfWeek, format, parseISO } from 'date-fns';
import { MealType } from '../../../types/requests.types';
import type { MealItem, MealLog } from '../../../types/requests.types';
import {
  DietCopyMode,
  WeekCopyOp,
  getAlternatingActivationPlan,
  getCatchUpHorizonISO,
  getCatchUpSource,
  getCatchUpTargets,
  getSequentialActivationPlan,
  getVisibleWeekRange,
} from './dietCopyPlanner';
import {
  buildMealCopyDraft,
  validateMealCopyDestination,
  type MealCopyDestination,
  type MealCopySource,
} from './mealCopyPlanner';
import { buildMealMoveUpdate, type MealMoveSource } from './mealMovePlanner';

// Re-exported so existing imports keep working and callers share one source of truth.
export { getISOWeekString, getVisibleWeekRange } from './dietCopyPlanner';

/**
 * Copy one registered or planned meal into a new date/type without touching
 * any existing destination rows.
 */
export const copyMealToDate = async (
  userId: string,
  source: MealCopySource,
  destination: MealCopyDestination,
): Promise<MealLog> => {
  if (!userId) throw new Error('No user');
  validateMealCopyDestination(destination);

  let sourceWithItems = source;

  if (source.log?.id) {
    const { data: sourceLog, error: sourceLogError } = await supabase
      .from('meal_logs')
      .select('*')
      .eq('id', source.log.id)
      .eq('user_id', userId)
      .single();

    if (sourceLogError) throw sourceLogError;

    const { data: sourceItems, error: sourceItemsError } = await supabase
      .from('meal_items')
      .select('*')
      .eq('meal_log_id', source.log.id)
      .eq('user_id', userId)
      .returns<MealItem[]>();

    if (sourceItemsError) throw sourceItemsError;
    sourceWithItems = { log: sourceLog, items: sourceItems ?? [] };
  }

  const draft = buildMealCopyDraft(sourceWithItems, destination, userId);
  const { data, error } = await supabase.rpc('copy_meal_to_date', {
    p_log: draft.log,
    p_items: draft.items,
  });

  if (error) throw error;
  return data;
};

/**
 * Move one registered meal to a new date/type. This updates the existing meal
 * log, so destination rows are never overwritten and ingredients keep the same
 * meal_log_id.
 */
export const moveMealToDate = async (
  userId: string,
  source: MealMoveSource,
  destination: MealCopyDestination,
): Promise<MealLog> => {
  if (!userId) throw new Error('No user');

  const { logId, updates } = buildMealMoveUpdate(source, destination);

  const { data, error } = await supabase
    .from('meal_logs')
    .update(updates)
    .eq('id', logId)
    .eq('user_id', userId)
    .select()
    .single();

  if (error) throw error;
  return data;
};

/**
 * Check if sequential activation would overwrite data.
 * Returns true if ANY target week (W+1 … W+4) has data.
 */
export const checkSequentialConflicts = async (userId: string): Promise<boolean> => {
  const { weeks, currentWeekIndex } = getVisibleWeekRange();
  for (let i = 1; i <= 4; i++) {
    if (await weekHasData(userId, weeks[currentWeekIndex + i])) return true;
  }
  return false;
};

/**
 * Check if alternating activation would overwrite data.
 * Returns true if ANY target week (W+2, W+3, W+4) has data.
 */
export const checkAlternatingConflicts = async (userId: string): Promise<boolean> => {
  const { weeks, currentWeekIndex } = getVisibleWeekRange();
  if (await weekHasData(userId, weeks[currentWeekIndex + 2])) return true;
  if (await weekHasData(userId, weeks[currentWeekIndex + 3])) return true;
  if (await weekHasData(userId, weeks[currentWeekIndex + 4])) return true;
  return false;
};

/**
 * Copy meal logs from one week to another.
 * @param overwrite If true, deletes existing logs in target week before copying.
 */
export const copyWeekToWeek = async (
  userId: string,
  sourceWeekStart: Date,
  targetWeekStart: Date,
  overwrite: boolean = false,
): Promise<{ success: boolean; copiedCount: number; error?: string }> => {
  try {
    const sourceStart = startOfWeek(sourceWeekStart, { weekStartsOn: 1 });
    const sourceEnd = endOfWeek(sourceWeekStart, { weekStartsOn: 1 });
    const targetStart = startOfWeek(targetWeekStart, { weekStartsOn: 1 });
    const targetEnd = endOfWeek(targetWeekStart, { weekStartsOn: 1 });

    // 1. Overwrite protection & handling
    const { data: logsToDelete, error: fetchError1 } = await supabase
      .from('meal_logs')
      .select('id')
      .eq('user_id', userId)
      .gte('date', format(targetStart, 'yyyy-MM-dd'))
      .lte('date', format(targetEnd, 'yyyy-MM-dd'));

    if (fetchError1) {
      console.error('[dietCopyService] Error fetching logs to check overwrite:', fetchError1);
      return { success: false, copiedCount: 0, error: fetchError1.message };
    }

    if (logsToDelete && logsToDelete.length > 0) {
      if (!overwrite) {
        // Target week already has data → skip it (non-destructive).
        return { success: true, copiedCount: 0 };
      }

      const logIds = logsToDelete.map(l => l.id);

      // Delete dependent items first to avoid FK violations.
      const { error: itemsDelError } = await supabase.from('meal_items').delete().in('meal_log_id', logIds);
      if (itemsDelError) {
        console.error('[dietCopyService] Error deleting target meal items:', itemsDelError);
        return { success: false, copiedCount: 0, error: itemsDelError.message };
      }

      const { error: delError } = await supabase.from('meal_logs').delete().in('id', logIds);
      if (delError) {
        console.error('[dietCopyService] Error deleting target meal logs:', delError);
        return { success: false, copiedCount: 0, error: delError.message };
      }
    }

    // 2. Fetch source logs
    const { data: sourceLogs, error: fetchError } = await supabase
      .from('meal_logs')
      .select('*')
      .eq('user_id', userId)
      .gte('date', format(sourceStart, 'yyyy-MM-dd'))
      .lte('date', format(sourceEnd, 'yyyy-MM-dd'));

    if (fetchError) throw fetchError;
    if (!sourceLogs || sourceLogs.length === 0) return { success: true, copiedCount: 0 };

    // Fetch ingredients for those logs
    const sourceLogIds = sourceLogs.map(l => l.id);
    const { data: sourceIngredients, error: ingError } = await supabase
      .from('meal_items')
      .select('*')
      .in('meal_log_id', sourceLogIds);

    if (ingError) throw ingError;

    // Group ingredients by their source log
    const ingredientsByLog = (sourceIngredients ?? []).reduce(
      (acc, ing) => {
        if (!acc[ing.meal_log_id]) acc[ing.meal_log_id] = [];
        acc[ing.meal_log_id].push(ing);
        return acc;
      },
      {} as Record<string, NonNullable<typeof sourceIngredients>>,
    );

    let copiedCount = 0;

    // 3. Insert logs and their ingredients
    for (const log of sourceLogs) {
      const sourceDate = parseISO(log.date);
      const dayOffset = Math.floor((sourceDate.getTime() - sourceStart.getTime()) / (24 * 60 * 60 * 1000));
      const targetDate = new Date(targetStart.getTime() + dayOffset * 24 * 60 * 60 * 1000);
      const targetDateStr = format(targetDate, 'yyyy-MM-dd');

      const { data: newLog, error: insertError } = await supabase
        .from('meal_logs')
        .insert({
          user_id: userId,
          date: targetDateStr,
          meal_type: log.meal_type,
          name: log.name,
          notes: log.notes,
          kcal: log.kcal,
          protein_g: log.protein_g,
          carbs_g: log.carbs_g,
          fats_g: log.fats_g,
          diet_template_meal_id: log.diet_template_meal_id,
          adherence_status: 'pending',
          source: log.source,
          data_quality: log.data_quality,
          calc_version: log.calc_version,
          origin: log.origin,
          origin_confidence: log.origin_confidence,
        })
        .select()
        .single();

      if (insertError) {
        console.error(`[dietCopyService] Error inserting log for ${targetDateStr}:`, insertError);
        continue;
      }

      if (newLog) {
        copiedCount++;

        const originalIngredients = ingredientsByLog[log.id];
        if (originalIngredients && originalIngredients.length > 0) {
          const ingredientsToInsert = originalIngredients.map(ing => ({
            meal_log_id: newLog.id, // Link to the NEW log
            user_id: userId,
            name: ing.name,
            quantity_g: ing.quantity_g,
            source: ing.source,
            source_ref: ing.source_ref,
            kcal: ing.kcal,
            protein_g: ing.protein_g,
            carbs_g: ing.carbs_g,
            fats_g: ing.fats_g,
            per_100g_kcal: ing.per_100g_kcal,
            per_100g_protein_g: ing.per_100g_protein_g,
            per_100g_carbs_g: ing.per_100g_carbs_g,
            per_100g_fats_g: ing.per_100g_fats_g,
            data_quality: ing.data_quality || 'manual',
            origin: ing.origin || 'user',
            confidence: ing.confidence,
          }));

          const { error: ingInsertError } = await supabase.from('meal_items').insert(ingredientsToInsert);
          if (ingInsertError) {
            console.error(`[dietCopyService] Error copying ingredients for log ${newLog.id}:`, ingInsertError);
          }
        }
      }
    }

    return { success: true, copiedCount };
  } catch (error: unknown) {
    console.error('[dietCopyService] Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, copiedCount: 0, error: message };
  }
};

/** Run an ordered list of week-copy operations, stopping on the first failure. */
const runCopyPlan = async (
  userId: string,
  ops: WeekCopyOp[],
  overwrite: boolean,
): Promise<{ success: boolean; totalCopied: number }> => {
  let totalCopied = 0;
  for (const op of ops) {
    const result = await copyWeekToWeek(userId, op.source, op.target, overwrite);
    if (!result.success) return { success: false, totalCopied };
    totalCopied += result.copiedCount;
  }
  return { success: true, totalCopied };
};

/**
 * Sequential mode activation: W0 → W+1, W+2, W+3, W+4.
 */
export const copySequentialOnActivate = async (
  userId: string,
  overwrite: boolean = false,
): Promise<{ success: boolean; totalCopied: number }> => {
  return runCopyPlan(userId, getSequentialActivationPlan(), overwrite);
};

/**
 * Alternating mode activation: W-1 → W+1/W+3 (Plan A), W0 → W+2/W+4 (Plan B).
 */
export const copyAlternatingOnActivate = async (
  userId: string,
  overwrite: boolean = false,
): Promise<{ success: boolean; totalCopied: number }> => {
  return runCopyPlan(userId, getAlternatingActivationPlan(), overwrite);
};

/**
 * Check if a week has any meal logs.
 */
export const weekHasData = async (userId: string, weekStart: Date): Promise<boolean> => {
  const start = startOfWeek(weekStart, { weekStartsOn: 1 });
  const end = endOfWeek(weekStart, { weekStartsOn: 1 });

  const { count, error } = await supabase
    .from('meal_logs')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('date', format(start, 'yyyy-MM-dd'))
    .lte('date', format(end, 'yyyy-MM-dd'));

  if (error) {
    console.error('[dietCopyService] Error checking week data:', error);
    return false;
  }

  return (count || 0) > 0;
};

/**
 * Check and copy newly-visible empty weeks (runs on app entry).
 * Handles gap filling if the user hasn't opened the app in several weeks.
 */
export const checkAndCopyNewWeek = async (
  userId: string,
  mode: DietCopyMode,
  lastVisibleWeek: string | undefined,
): Promise<{ copied: boolean; newLastVisibleWeek: string; copiedCount: number }> => {
  const today = new Date();
  const horizonISO = getCatchUpHorizonISO(today);
  const targets = getCatchUpTargets(today, lastVisibleWeek);

  if (targets.length === 0) {
    return { copied: false, newLastVisibleWeek: horizonISO, copiedCount: 0 };
  }

  let totalCopied = 0;
  let somethingCopied = false;

  for (const target of targets) {
    // Skip weeks that already have data.
    if (await weekHasData(userId, target)) continue;

    const source = getCatchUpSource(mode, target);
    const result = await copyWeekToWeek(userId, source, target);
    if (result.success && result.copiedCount > 0) {
      totalCopied += result.copiedCount;
      somethingCopied = true;
    }
  }

  return { copied: somethingCopied, newLastVisibleWeek: horizonISO, copiedCount: totalCopied };
};

// Keep old name for backward compatibility during migration.
export const copyCurrentWeekToNextWeeks = copySequentialOnActivate;

/**
 * Delete meal logs (and their items) within an optional date range / meal type.
 *
 * @param options.start    Inclusive 'yyyy-MM-dd' lower bound (omit for none).
 * @param options.end      Inclusive 'yyyy-MM-dd' upper bound (omit for none).
 * @param options.mealType Restrict deletion to a single meal type (omit for all).
 *                         Omitting every option deletes ALL meal logs for the user.
 */
export const deleteMealLogsInRange = async (
  userId: string,
  options: { start?: string; end?: string; mealType?: MealType } = {},
): Promise<{ success: boolean; deletedCount: number; error?: string }> => {
  try {
    let query = supabase.from('meal_logs').select('id').eq('user_id', userId);
    if (options.start) query = query.gte('date', options.start);
    if (options.end) query = query.lte('date', options.end);
    if (options.mealType) query = query.eq('meal_type', options.mealType);

    const { data: logsToDelete, error: fetchError } = await query;
    if (fetchError) throw fetchError;

    if (!logsToDelete || logsToDelete.length === 0) {
      return { success: true, deletedCount: 0 };
    }

    const logIds = logsToDelete.map(l => l.id);

    // Delete dependent items first to avoid FK violations.
    const { error: itemsError } = await supabase.from('meal_items').delete().in('meal_log_id', logIds);
    if (itemsError) throw itemsError;

    const { error: logsError } = await supabase.from('meal_logs').delete().in('id', logIds);
    if (logsError) throw logsError;

    return { success: true, deletedCount: logIds.length };
  } catch (error: unknown) {
    console.error('[dietCopyService] Error deleting meal logs:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, deletedCount: 0, error: message };
  }
};

/**
 * Delete future meal logs of a single meal type (from TODAY onwards).
 * Used when a meal type is disabled in settings.
 */
export const deleteFutureMealLogsByType = async (
  userId: string,
  mealType: MealType,
): Promise<{ success: boolean; deletedCount: number; error?: string }> => {
  const today = format(new Date(), 'yyyy-MM-dd');
  return deleteMealLogsInRange(userId, { start: today, mealType });
};

/**
 * Delete ALL future weeks data (from TOMORROW onwards). Today and the past are
 * preserved.
 */
export const deleteFutureWeeks = async (userId: string): Promise<{ success: boolean; error?: string }> => {
  // Target start date is tomorrow; we keep today safe.
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const targetStartStr = format(tomorrow, 'yyyy-MM-dd');

  const result = await deleteMealLogsInRange(userId, { start: targetStartStr });
  return { success: result.success, error: result.error };
};
