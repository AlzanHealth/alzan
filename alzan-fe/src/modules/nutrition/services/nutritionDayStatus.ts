export type NutritionDayStatusValue = 'normal' | 'over_target' | 'vacation';

export type NutritionDayStatusRowLike = {
  date: string;
  status: string;
};

export const getNutritionDayStatus = (
  statuses: NutritionDayStatusRowLike[] | null | undefined,
  date: string,
): NutritionDayStatusValue => {
  const status = statuses?.find(row => row.date === date)?.status;
  return status === 'vacation' || status === 'over_target' ? status : 'normal';
};

export const getNextNutritionDayStatus = (status: NutritionDayStatusValue): NutritionDayStatusValue => {
  if (status === 'normal') return 'over_target';
  if (status === 'over_target') return 'vacation';
  return 'normal';
};

export const getNutritionDayStatusDates = (
  statuses: NutritionDayStatusRowLike[] | null | undefined,
  targetStatus: Exclude<NutritionDayStatusValue, 'normal'>,
): Set<string> => new Set((statuses ?? []).filter(row => row.status === targetStatus).map(row => row.date));
