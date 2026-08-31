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

export type MealDestinationConflict = {
  date: string;
  mealType: MealType;
  count: number;
  existingMealNames: string[];
};

type MealConflictLog = Pick<MealLog, 'id' | 'date' | 'meal_type' | 'name'>;

export const findMealDestinationConflict = (
  logs: readonly MealConflictLog[],
  sourceLogId: string | undefined,
  destination: MealCopyDestination,
  operation: 'copy' | 'move',
): MealDestinationConflict | null => {
  const matches = logs.filter(
    log =>
      log.date === destination.date &&
      log.meal_type === destination.mealType &&
      (operation === 'copy' || log.id !== sourceLogId),
  );

  if (matches.length === 0) return null;

  return {
    date: destination.date,
    mealType: destination.mealType,
    count: matches.length,
    existingMealNames: matches.map(log => log.name?.trim() || 'Comida sin nombre'),
  };
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
