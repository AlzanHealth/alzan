import type { MealItem, MealLog, MealType } from '../../../types/requests.types';

export const MEAL_UNDO_WINDOW_MS = 7_000;

export type MealDestination = {
  date: string;
  mealType: MealType;
};

export type DeletedMealSnapshot = {
  log: MealLog;
  items: MealItem[];
};

export type MealUndoAction =
  | {
      kind: 'move';
      logId: string;
      previous: MealDestination;
      current: MealDestination;
      expiresAt: number;
    }
  | {
      kind: 'delete';
      snapshot: DeletedMealSnapshot;
      expiresAt: number;
    };

export const createMovedMealUndoAction = (input: {
  logId: string;
  previous: MealDestination;
  current: MealDestination;
  expiresAt: number;
}): Extract<MealUndoAction, { kind: 'move' }> => ({
  kind: 'move',
  ...input,
});

export const createDeletedMealUndoAction = (
  snapshot: DeletedMealSnapshot,
  expiresAt: number,
): Extract<MealUndoAction, { kind: 'delete' }> => ({
  kind: 'delete',
  snapshot,
  expiresAt,
});

export const isMealUndoAvailable = (action: MealUndoAction, now = Date.now()): boolean => now < action.expiresAt;
