export type VacationStatusLike = {
  date: string;
  status: string;
};

export type VacationAverageDayLike = {
  isVacation: boolean;
  loggedMealCount: number;
};

export const createVacationDateSet = (statuses: VacationStatusLike[] | null | undefined): Set<string> => {
  return new Set((statuses || []).filter(status => status.status === 'vacation').map(status => status.date));
};

export const diffVacationDateSelection = (
  originalDates: Set<string>,
  draftDates: Set<string>,
): { addDates: string[]; removeDates: string[] } => {
  return {
    addDates: Array.from(draftDates)
      .filter(date => !originalDates.has(date))
      .sort(),
    removeDates: Array.from(originalDates)
      .filter(date => !draftDates.has(date))
      .sort(),
  };
};

export const shouldShowPendingPlannedMeals = (isVacationDay: boolean): boolean => {
  return !isVacationDay;
};

export const getNutritionExportAverageDayCount = (days: VacationAverageDayLike[]): number => {
  return Math.max(1, days.filter(day => !day.isVacation || day.loggedMealCount > 0).length);
};
