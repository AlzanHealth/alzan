import {
  planDailyBodyCompositionRecalculation,
  type DailyCompositionPlannerInput,
} from './bodyCompositionDailyPlanner';

export type BodyChangeKey = 'weight' | 'waist' | 'abdomen' | 'hips' | 'chest' | 'arm' | 'armFlexed' | 'thigh';
export interface BodyChange {
  key: BodyChangeKey;
  difference: number;
  unit: 'kg' | 'cm';
}
export interface BodyChangesComparison {
  currentDate: string;
  previousDate: string;
  changes: BodyChange[];
}
const DAY = 86_400_000;

/** Compare coherent windows, never the independent last two values of each field. */
export const buildBodyChanges = (input: DailyCompositionPlannerInput): BodyChangesComparison | null => {
  const current = planDailyBodyCompositionRecalculation(input);
  const currentTime = new Date(current.asOf).getTime();
  const dates = [
    ...new Set([...input.weights.map(row => row.measuredAt), ...input.measurements.map(row => row.measuredAt)]),
  ]
    .filter(date => {
      const elapsed = currentTime - new Date(date).getTime();
      return elapsed >= 7 * DAY && elapsed <= 90 * DAY;
    })
    .sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
  for (const date of dates) {
    const previous = planDailyBodyCompositionRecalculation({
      ...input,
      targetDate: new Date(date),
      now: new Date(date),
    });
    const changes: BodyChange[] = [];
    if (current.weightKgUsed !== undefined && previous.weightKgUsed !== undefined) {
      changes.push({
        key: 'weight',
        difference: Math.round((current.weightKgUsed - previous.weightKgUsed) * 10) / 10,
        unit: 'kg',
      });
    }
    const keys = ['waist', 'abdomen', 'hips', 'chest', 'arm', 'armFlexed', 'thigh'] as const;
    for (const key of keys) {
      const latest = current.measurements[key];
      const earlier = previous.measurements[key];
      if (latest === undefined || earlier === undefined) continue;
      const type = key === 'armFlexed' ? 'arm' : key;
      const protocol = key === 'armFlexed' ? 'arm_flexed_max' : key === 'arm' ? 'arm_relaxed_midpoint' : undefined;
      const currentSource = current.selectedMeasurements.find(
        row => row.type === type && (!protocol || row.protocol === protocol),
      );
      const previousSource = previous.selectedMeasurements.find(
        row => row.type === type && (!protocol || row.protocol === protocol),
      );
      if (!currentSource || !previousSource || (currentSource.protocol ?? null) !== (previousSource.protocol ?? null))
        continue;
      changes.push({ key, difference: Math.round((latest - earlier) * 10) / 10, unit: 'cm' });
    }
    if (changes.length > 0) return { currentDate: current.asOf, previousDate: previous.asOf, changes };
  }
  return null;
};
