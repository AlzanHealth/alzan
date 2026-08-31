import type { MealLog, MealType } from '../../../types/requests.types';
import { validateMealCopyDestination, type MealCopyDestination } from './mealCopyPlanner';

export type MealMoveSource = Pick<MealLog, 'id' | 'date' | 'meal_type'>;

export type MealMoveUpdate = {
  date: string;
  meal_type: MealType;
};

export type MealMovePlan = {
  logId: string;
  updates: MealMoveUpdate;
};

export const buildMealMoveUpdate = (
  source: MealMoveSource | null | undefined,
  destination: MealCopyDestination,
  referenceDate: Date = new Date(),
): MealMovePlan => {
  if (!source?.id) {
    throw new Error('A meal log is required to move a meal');
  }

  validateMealCopyDestination(destination, referenceDate);

  return {
    logId: source.id,
    updates: {
      date: destination.date,
      meal_type: destination.mealType,
    },
  };
};
