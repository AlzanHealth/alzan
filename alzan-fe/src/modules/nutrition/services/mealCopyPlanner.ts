import type {
  DietTemplateMeal,
  MealItem,
  MealItemInsert,
  MealLog,
  MealLogInsert,
  MealType,
} from '../../../types/requests.types';
import { isValid, parseISO, startOfDay } from 'date-fns';
import { getNutritionCalendarRange } from './nutritionCalendarRange';

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

const COPYABLE_MEAL_TYPES: MealType[] = ['breakfast', 'almuerzo', 'lunch', 'merienda', 'dinner', 'snack'];

export const validateMealCopyDestination = (
  destination: MealCopyDestination,
  referenceDate: Date = new Date(),
): void => {
  const parsedDate = parseISO(destination.date);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(destination.date) || !isValid(parsedDate)) {
    throw new Error('Invalid meal copy date');
  }
  if (!COPYABLE_MEAL_TYPES.includes(destination.mealType)) {
    throw new Error('Invalid meal copy type');
  }

  const { minimumDate, maximumDate } = getNutritionCalendarRange(referenceDate);
  const normalizedDate = startOfDay(parsedDate);
  if (normalizedDate < minimumDate || normalizedDate > maximumDate) {
    throw new Error('Meal copy date is outside the nutrition calendar range');
  }
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
