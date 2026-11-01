export type RunningShoeMileageState = 'no_limit' | 'within_limit' | 'reached' | 'exceeded';

export const getRunningShoeMileage = (distanceMeters: number | null): number => Math.max(0, distanceMeters ?? 0) / 1000;

export const getRunningShoeMileageState = (
  totalKilometers: number,
  recommendedMaximumKilometers: number | null,
): RunningShoeMileageState => {
  if (recommendedMaximumKilometers === null || recommendedMaximumKilometers <= 0) return 'no_limit';
  if (totalKilometers > recommendedMaximumKilometers) return 'exceeded';
  if (totalKilometers === recommendedMaximumKilometers) return 'reached';
  return 'within_limit';
};
