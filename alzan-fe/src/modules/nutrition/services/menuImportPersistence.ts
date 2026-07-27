import type { MealItemInsert, MealLogInsert } from '../../../types/requests.types';
import { MENU_IMPORT_MEAL_TYPES } from './menuImportContract';
import type {
  MenuImportConflictDecision,
  MenuImportExistingLog,
  MenuImportPreview,
  MenuImportPreviewMeal,
} from './menuImportPlanner';

export type MenuImportMealInsert = MealLogInsert & { id: string };
export type MenuImportMealItemInsert = MealItemInsert;

export type MenuImportCalendarSnapshot = {
  token: string;
  dates: string[];
  logs: MenuImportExistingLog[];
};

export type MenuImportAtomicImportInput = {
  snapshot: MenuImportCalendarSnapshot;
  meals: MenuImportMealInsert[];
  items: MenuImportMealItemInsert[];
  replacementIds: string[];
};

export interface MenuImportPersistenceAdapter {
  importMenuAtomically(input: MenuImportAtomicImportInput): Promise<void>;
}

export type SecureRandomValues = (bytes: Uint8Array) => Uint8Array;

export class MenuImportSnapshotStaleError extends Error {
  readonly code = 'menu_import_snapshot_stale';

  constructor() {
    super('Menu import calendar snapshot is stale');
    Object.setPrototypeOf(this, MenuImportSnapshotStaleError.prototype);
    this.name = 'MenuImportSnapshotStaleError';
  }
}

export type MenuImportExecutionOptions = {
  createId?: () => string;
};

const getSecureRandomValues: SecureRandomValues = bytes => {
  if (typeof globalThis.crypto?.getRandomValues !== 'function') {
    throw new Error('Secure random values are unavailable');
  }

  return globalThis.crypto.getRandomValues(bytes);
};

export function createSecureUuidV4(fillRandomValues: SecureRandomValues = getSecureRandomValues): string {
  const bytes = fillRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');

  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

const buildMealInsert = (userId: string, mealId: string, meal: MenuImportPreviewMeal): MenuImportMealInsert => ({
  id: mealId,
  user_id: userId,
  date: meal.date,
  meal_type: meal.meal_type,
  name: meal.name,
  kcal: meal.macros.kcal,
  protein_g: meal.macros.protein_g,
  carbs_g: meal.macros.carbs_g,
  fats_g: meal.macros.fats_g,
  adherence_status: 'done_as_planned',
  source: 'menu_import_v1',
  data_quality: 'computed',
  calc_version: 'nutrition_v1',
  origin: 'imported',
  source_recipe_id: null,
});

const buildMealItemInserts = (
  userId: string,
  mealId: string,
  meal: MenuImportPreviewMeal,
): MenuImportMealItemInsert[] =>
  meal.ingredients.map(ingredient => {
    if (ingredient.selectedCandidate === null || ingredient.macros === null) {
      throw new Error('Menu import preview is incomplete');
    }

    return {
      meal_log_id: mealId,
      user_id: userId,
      name: ingredient.selectedCandidate.name,
      source: 'database',
      source_ref: ingredient.selectedCandidate.id,
      quantity_g: ingredient.quantity_g,
      per_100g_kcal: ingredient.selectedCandidate.kcal_100,
      per_100g_protein_g: ingredient.selectedCandidate.protein_g_100,
      per_100g_carbs_g: ingredient.selectedCandidate.carbs_g_100,
      per_100g_fats_g: ingredient.selectedCandidate.fat_g_100,
      kcal: ingredient.macros.kcal,
      protein_g: ingredient.macros.protein_g,
      carbs_g: ingredient.macros.carbs_g,
      fats_g: ingredient.macros.fats_g,
      data_quality: 'automatic',
      origin: 'imported',
    };
  });

const validateMealsToImport = (meals: MenuImportPreviewMeal[]): void => {
  if (meals.length === 0) {
    throw new Error('Menu import contains no meals to create');
  }

  for (const meal of meals) {
    if (meal.conflict !== null && meal.conflict.decision === null) {
      throw new Error('Menu import preview is incomplete');
    }

    if (meal.ingredients.some(ingredient => ingredient.selectedCandidate === null || ingredient.macros === null)) {
      throw new Error('Menu import preview is incomplete');
    }
  }
};

const validateConflictDecisions = (meals: MenuImportPreviewMeal[]): void => {
  const decisionsBySlot = new Map<string, Set<MenuImportConflictDecision>>();

  for (const meal of meals) {
    const decision = meal.conflict?.decision;
    if (!decision) continue;

    const slotKey = `${meal.date}:${meal.meal_type}`;
    const decisions = decisionsBySlot.get(slotKey) ?? new Set<MenuImportConflictDecision>();
    decisions.add(decision);
    decisionsBySlot.set(slotKey, decisions);
  }

  if (Array.from(decisionsBySlot.values()).some(decisions => decisions.size > 1)) {
    throw new Error('Menu import contains conflicting decisions for the same time slot');
  }
};

export async function executeMenuImport(
  userId: string,
  preview: MenuImportPreview,
  adapter: MenuImportPersistenceAdapter,
  options: MenuImportExecutionOptions = {},
): Promise<{ createdMealIds: string[]; firstDate: string }> {
  if (userId.trim().length === 0) {
    throw new Error('Authenticated user is required');
  }

  validateConflictDecisions(preview.meals);
  const mealsToImport = preview.meals.filter(meal => meal.conflict?.decision !== 'ignore');
  validateMealsToImport(mealsToImport);

  const createId = options.createId ?? createSecureUuidV4;
  const preparedMeals = mealsToImport.map(meal => {
    const id = createId();

    return {
      log: buildMealInsert(userId, id, meal),
      items: buildMealItemInserts(userId, id, meal),
    };
  });
  const createdMealIds = preparedMeals.map(meal => meal.log.id);
  const mealLogs = preparedMeals.map(meal => meal.log);
  const mealItems = preparedMeals.flatMap(meal => meal.items);
  const replacementIds = Array.from(
    new Set(
      mealsToImport.flatMap(meal =>
        meal.conflict?.decision === 'replace' ? meal.conflict.existingLogs.map(existingLog => existingLog.id) : [],
      ),
    ),
  );

  await adapter.importMenuAtomically({
    snapshot: {
      ...preview.calendarSnapshot,
      logs: preview.meals.flatMap(meal => meal.conflict?.existingLogs ?? []),
    },
    meals: mealLogs,
    items: mealItems,
    replacementIds,
  });

  return {
    createdMealIds,
    firstDate: mealsToImport.map(meal => meal.date).sort()[0],
  };
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const MENU_IMPORT_MEAL_TYPE_VALUES: ReadonlySet<string> = new Set(MENU_IMPORT_MEAL_TYPES);

const parseCalendarSnapshot = (value: unknown, dates: string[]): MenuImportCalendarSnapshot => {
  if (!isRecord(value) || typeof value.token !== 'string' || !Array.isArray(value.logs)) {
    throw new Error('Invalid menu import calendar snapshot');
  }

  const logs = value.logs.map((log): MenuImportExistingLog => {
    if (
      !isRecord(log) ||
      typeof log.id !== 'string' ||
      typeof log.date !== 'string' ||
      typeof log.meal_type !== 'string' ||
      !MENU_IMPORT_MEAL_TYPE_VALUES.has(log.meal_type) ||
      (log.name !== null && typeof log.name !== 'string')
    ) {
      throw new Error('Invalid menu import calendar snapshot');
    }

    return {
      id: log.id,
      date: log.date,
      meal_type: log.meal_type as MenuImportExistingLog['meal_type'],
      name: log.name,
    };
  });

  return { token: value.token, dates: [...dates], logs };
};

export async function fetchMenuImportCalendarSnapshot(dates: string[]): Promise<MenuImportCalendarSnapshot> {
  const { supabase } = await import('../../../lib/supabaseClient');
  const { data, error } = await supabase.rpc('get_nutrition_menu_import_snapshot', {
    p_dates: dates,
  });

  if (error) throw error;
  return parseCalendarSnapshot(data, dates);
}

export function createSupabaseMenuImportAdapter(): MenuImportPersistenceAdapter {
  const getSupabase = async () => (await import('../../../lib/supabaseClient')).supabase;

  return {
    async importMenuAtomically(input) {
      const supabase = await getSupabase();
      const { error } = await supabase.rpc('import_nutrition_menu', {
        p_dates: input.snapshot.dates,
        p_expected_snapshot_token: input.snapshot.token,
        p_meals: input.meals,
        p_items: input.items,
        p_replacement_ids: input.replacementIds,
      });

      if (error?.message.includes('MENU_IMPORT_SNAPSHOT_STALE')) {
        throw new MenuImportSnapshotStaleError();
      }
      if (error) throw error;
    },
  };
}
