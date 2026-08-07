import type {
  DietTemplateMeal,
  MealItem,
  MealItemInsert,
  MealLog,
  MealLogInsert,
  MealType,
} from '../../../types/requests.types';

export type MealCopySource = {
  log?: MealLog;
  templateMeal?: DietTemplateMeal;
  items?: MealItem[];
};

export type MealCopyDestination = {
  date: string;
  mealType: MealType;
};

export type MealCopyDraft = {
  log: MealLogInsert;
  items: Omit<MealItemInsert, 'meal_log_id'>[];
};

export type MealCopyPersistence = {
  insertLog: (log: MealLogInsert) => Promise<MealLog>;
  insertItems: (logId: string, items: MealItemInsert[]) => Promise<void>;
  deleteLog: (logId: string) => Promise<void>;
};

export const buildMealCopyDraft = (
  source: MealCopySource,
  destination: MealCopyDestination,
  userId: string,
): MealCopyDraft => {
  const sourceLog = source.log;
  const sourceTemplateMeal = source.templateMeal;

  if (!sourceLog && !sourceTemplateMeal) {
    throw new Error('A meal log or template meal is required to copy a meal');
  }

  const draftLog: MealLogInsert = sourceLog
    ? {
        user_id: userId,
        date: destination.date,
        meal_type: destination.mealType,
        name: sourceLog.name,
        notes: sourceLog.notes,
        kcal: sourceLog.kcal,
        protein_g: sourceLog.protein_g,
        carbs_g: sourceLog.carbs_g,
        fats_g: sourceLog.fats_g,
        adherence_status: 'extra_meal',
        calc_version: sourceLog.calc_version,
        data_quality: sourceLog.data_quality,
        logged_at: new Date().toISOString(),
        origin: sourceLog.origin,
        origin_confidence: sourceLog.origin_confidence,
        source: sourceLog.source,
        source_recipe_id: sourceLog.source_recipe_id,
        diet_template_meal_id: null,
      }
    : {
        user_id: userId,
        date: destination.date,
        meal_type: destination.mealType,
        name: sourceTemplateMeal?.base_name,
        notes: sourceTemplateMeal?.notes,
        kcal: sourceTemplateMeal?.target_kcal,
        protein_g: sourceTemplateMeal?.target_protein_g,
        carbs_g: sourceTemplateMeal?.target_carbs_g,
        fats_g: sourceTemplateMeal?.target_fats_g,
        adherence_status: 'extra_meal',
        calc_version: 'nutrition_v1',
        data_quality: 'manual',
        logged_at: new Date().toISOString(),
        origin: 'user',
        source: 'meal_copy_v1',
        diet_template_meal_id: null,
      };

  const items = (source.items ?? []).map<Omit<MealItemInsert, 'meal_log_id'>>(
    ({ id: _id, meal_log_id: _sourceLogId, created_at: _createdAt, ...item }) => ({
      ...item,
      user_id: userId,
    }),
  );

  return { log: draftLog, items };
};

export const persistMealCopy = async (draft: MealCopyDraft, persistence: MealCopyPersistence): Promise<MealLog> => {
  const savedLog = await persistence.insertLog(draft.log);

  if (draft.items.length === 0) return savedLog;

  try {
    const items: MealItemInsert[] = draft.items.map(item => ({
      ...item,
      meal_log_id: savedLog.id,
    }));
    await persistence.insertItems(savedLog.id, items);
  } catch (error: unknown) {
    await persistence.deleteLog(savedLog.id);
    throw error;
  }

  return savedLog;
};
