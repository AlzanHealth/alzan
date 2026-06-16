// src/modules/nutrition/services/personalTrendsService.ts
// Personal food trends ("Tendencias para ti").
//
// Unlike the global recipe discovery in nutritionSearchService (which ranks
// system/public recipes by aggregate popularity), this service mines the user's
// OWN logging history (meal_items + meal_logs) to surface the foods they actually
// eat, scoped by meal slot, ranked by a recency-weighted frequency, and with the
// user's usual portion pre-filled so a single tap re-logs the food.

import { supabase } from '../../../lib/supabaseClient';
import { MealItemsSource, MealType } from '../../../types/requests.types';
import { MealComponent, calculateMacros } from '../types/ingredients';

interface PersonalTrendsOptions {
  // Restrict the history to a given meal slot (breakfast, lunch, ...). Omit for
  // a cross-slot ranking.
  mealType?: MealType;
  limit?: number;
  daysBack?: number;
}

interface MealLogScopeRow {
  id: string;
  meal_type: MealType;
  date: string;
}

interface MealItemHistoryRow {
  meal_log_id: string;
  name: string;
  source: MealItemsSource;
  source_ref: string | null;
  quantity_g: number;
  per_100g_kcal: number | null;
  per_100g_protein_g: number | null;
  per_100g_carbs_g: number | null;
  per_100g_fats_g: number | null;
}

interface AggregatedFood {
  key: string;
  name: string;
  source: MealItemsSource;
  sourceRef: string | null;
  score: number;
  lastUsedAt: number;
  quantities: number[];
  kcal_100: number;
  protein_g_100: number;
  carbs_g_100: number;
  fat_g_100: number;
}

const DEFAULT_DAYS_BACK = 45;
const DEFAULT_LIMIT = 8;
const RECENCY_HALF_LIFE_DAYS = 14;
const MS_PER_DAY = 86_400_000;
const MAX_HISTORY_LOGS = 600;

const normalizeName = (value: string): string => value.trim().toLowerCase();

const buildAggregationKey = (row: MealItemHistoryRow): string =>
  row.source === 'database' && row.source_ref ? `db:${row.source_ref}` : `${row.source}:${normalizeName(row.name)}`;

// Log dates are stored as 'yyyy-MM-dd'; anchor at local midnight for age math.
const parseLogDate = (date: string): number => new Date(`${date}T00:00:00`).getTime();

const recencyWeight = (occurredAt: number, now: number): number => {
  const ageDays = Math.max(0, (now - occurredAt) / MS_PER_DAY);
  return Math.pow(0.5, ageDays / RECENCY_HALF_LIFE_DAYS);
};

// Usual portion = median of the logged quantities (robust to the odd outlier).
const medianQuantity = (quantities: number[]): number => {
  if (quantities.length === 0) return 100;
  const sorted = [...quantities].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
  return Math.round(median * 10) / 10;
};

const getCurrentUserId = async (): Promise<string | null> => {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
};

/**
 * Returns the user's most relevant foods for a meal slot, mapped to the same
 * MealComponent shape the builder uses, with `amount_g` set to the usual portion.
 */
export async function getPersonalFoodTrends(options: PersonalTrendsOptions = {}): Promise<MealComponent[]> {
  const { mealType, limit = DEFAULT_LIMIT, daysBack = DEFAULT_DAYS_BACK } = options;

  try {
    const userId = await getCurrentUserId();
    if (!userId) return [];

    const sinceDate = new Date(Date.now() - daysBack * MS_PER_DAY).toISOString().split('T')[0];

    let logsQuery = supabase
      .from('meal_logs')
      .select('id, meal_type, date')
      .eq('user_id', userId)
      .gte('date', sinceDate)
      .order('date', { ascending: false })
      .limit(MAX_HISTORY_LOGS);

    if (mealType) {
      logsQuery = logsQuery.eq('meal_type', mealType);
    }

    const { data: logs, error: logsError } = await logsQuery.returns<MealLogScopeRow[]>();
    if (logsError || !logs || logs.length === 0) {
      if (logsError) console.error('[personalTrendsService] meal_logs fetch error:', logsError);
      return [];
    }

    const logDateById = new Map(logs.map(log => [log.id, parseLogDate(log.date)]));
    const logIds = logs.map(log => log.id);

    const { data: items, error: itemsError } = await supabase
      .from('meal_items')
      .select(
        'meal_log_id, name, source, source_ref, quantity_g, per_100g_kcal, per_100g_protein_g, per_100g_carbs_g, per_100g_fats_g',
      )
      .in('meal_log_id', logIds)
      .returns<MealItemHistoryRow[]>();

    if (itemsError || !items || items.length === 0) {
      if (itemsError) console.error('[personalTrendsService] meal_items fetch error:', itemsError);
      return [];
    }

    const now = Date.now();
    const aggregated = new Map<string, AggregatedFood>();

    for (const item of items) {
      if (!item.name) continue;
      const occurredAt = logDateById.get(item.meal_log_id) ?? now;
      const key = buildAggregationKey(item);
      const weight = recencyWeight(occurredAt, now);

      const existing = aggregated.get(key);
      if (existing) {
        existing.score += weight;
        existing.quantities.push(item.quantity_g);
        if (occurredAt >= existing.lastUsedAt) {
          existing.lastUsedAt = occurredAt;
          existing.name = item.name;
          existing.kcal_100 = item.per_100g_kcal ?? existing.kcal_100;
          existing.protein_g_100 = item.per_100g_protein_g ?? existing.protein_g_100;
          existing.carbs_g_100 = item.per_100g_carbs_g ?? existing.carbs_g_100;
          existing.fat_g_100 = item.per_100g_fats_g ?? existing.fat_g_100;
        }
      } else {
        aggregated.set(key, {
          key,
          name: item.name,
          source: item.source,
          sourceRef: item.source_ref,
          score: weight,
          lastUsedAt: occurredAt,
          quantities: [item.quantity_g],
          kcal_100: item.per_100g_kcal ?? 0,
          protein_g_100: item.per_100g_protein_g ?? 0,
          carbs_g_100: item.per_100g_carbs_g ?? 0,
          fat_g_100: item.per_100g_fats_g ?? 0,
        });
      }
    }

    return Array.from(aggregated.values())
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return b.lastUsedAt - a.lastUsedAt;
      })
      .slice(0, limit)
      .map(food => {
        const usualPortion = medianQuantity(food.quantities);
        const macroSource = {
          kcal_100: food.kcal_100,
          protein_g_100: food.protein_g_100,
          carbs_g_100: food.carbs_g_100,
          fat_g_100: food.fat_g_100,
        };
        return {
          id: `trend_${food.key}`,
          name: food.name,
          amount_g: usualPortion,
          source: food.source,
          external_id: food.sourceRef ?? undefined,
          itemType: 'ingredient' as const,
          kcal_100: food.kcal_100,
          protein_g_100: food.protein_g_100,
          carbs_g_100: food.carbs_g_100,
          fat_g_100: food.fat_g_100,
          calculated_macros: calculateMacros(macroSource, usualPortion),
        } satisfies MealComponent;
      });
  } catch (error) {
    console.error('[personalTrendsService] getPersonalFoodTrends error:', error);
    return [];
  }
}
