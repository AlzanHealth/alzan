import { MaleOrFemale, MeasurementType } from '../../../types/requests.types';
import {
  AnthroMeasurements,
  BodyCompositionResult,
  calculateBodyComposition,
  isValidCompositionMeasurement,
} from './bodyComposition';

const BODY_COMPOSITION_MEASUREMENT_TYPES = ['waist', 'abdomen', 'hips', 'chest', 'arm', 'thigh'] as const;
export type BodyCompositionMeasurementType = (typeof BODY_COMPOSITION_MEASUREMENT_TYPES)[number];

export interface DailyCompositionWeightLogInput {
  id: string;
  createdAt?: string | null;
  measuredAt: string;
  weightKg: number;
}
export interface DailyCompositionMeasurementInput {
  id?: string;
  createdAt?: string | null;
  type: BodyCompositionMeasurementType;
  measuredAt: string;
  valueCm: number;
  protocol?: string | null;
}
export interface DailyCompositionProfileInput {
  heightCm: number | null | undefined;
  age: number | null | undefined;
  sex: MaleOrFemale | null | undefined;
}
export interface StoredDailyCompositionInput {
  bmi?: number | null;
  bodyfatPercent?: number | null;
  bodyfatPrecisionLevel?: number | null;
  muscleMassKg?: number | null;
  musclePrecisionLevel?: number | null;
}
export type DailyCompositionSkipReason =
  | 'missing_weight'
  | 'missing_profile'
  | 'missing_bodyfat'
  | 'not_improved'
  | 'future_date';
export interface DailyCompositionRecalculationPlan {
  shouldCalculate: boolean;
  shouldUpsert: boolean;
  shouldUpdateWeightLog: boolean;
  bodyfatShouldReplace: boolean;
  muscleShouldReplace: boolean;
  reason?: DailyCompositionSkipReason;
  sourceWeightLogId?: string;
  weightKgUsed?: number;
  measurements: AnthroMeasurements;
  selectedMeasurements: DailyCompositionMeasurementInput[];
  asOf: string;
  result?: BodyCompositionResult;
}
export interface DailyCompositionPlannerInput {
  targetDate: Date;
  profile: DailyCompositionProfileInput;
  weights: DailyCompositionWeightLogInput[];
  measurements: DailyCompositionMeasurementInput[];
  storedComposition?: StoredDailyCompositionInput | null;
  now?: Date;
}
export const isBodyCompositionMeasurementType = (
  type: MeasurementType | string,
): type is BodyCompositionMeasurementType => BODY_COMPOSITION_MEASUREMENT_TYPES.some(candidate => candidate === type);

const isSameLocalDay = (left: Date, right: Date): boolean =>
  left.getFullYear() === right.getFullYear() &&
  left.getMonth() === right.getMonth() &&
  left.getDate() === right.getDate();

// Historical snapshots use the last millisecond of their local day; today's snapshot uses now.
const getAsOf = (target: Date, now: Date): number =>
  Math.min(new Date(target.getFullYear(), target.getMonth(), target.getDate() + 1).getTime() - 1, now.getTime());

const isAvailableAt = (measuredAt: string, asOf: number): boolean => {
  const timestamp = new Date(measuredAt).getTime();
  return Number.isFinite(timestamp) && timestamp <= asOf;
};
const isPositiveFinite = (value: number): boolean => Number.isFinite(value) && value > 0;

type TimestampedCompositionInput = DailyCompositionMeasurementInput | DailyCompositionWeightLogInput;

const compareTextDescending = (left: string, right: string): number => (left === right ? 0 : left > right ? -1 : 1);
const creationTime = (value: string | null | undefined): number => {
  const timestamp = value ? new Date(value).getTime() : Number.NaN;
  return Number.isFinite(timestamp) ? timestamp : Number.NEGATIVE_INFINITY;
};
const fallbackIdentity = (input: TimestampedCompositionInput): string =>
  'valueCm' in input ? `${input.protocol ?? ''}|${input.type}|${input.valueCm}` : `${input.weightKg}`;

// Stable across database ordering and array reversal, including timestamp ties.
const compareInputsNewestFirst = (left: TimestampedCompositionInput, right: TimestampedCompositionInput): number => {
  const measuredDifference = new Date(right.measuredAt).getTime() - new Date(left.measuredAt).getTime();
  if (measuredDifference !== 0) return measuredDifference;
  const leftCreated = creationTime(left.createdAt);
  const rightCreated = creationTime(right.createdAt);
  if (leftCreated !== rightCreated) return leftCreated > rightCreated ? -1 : 1;
  return (
    compareTextDescending(left.id ?? '', right.id ?? '') ||
    compareTextDescending(fallbackIdentity(left), fallbackIdentity(right))
  );
};

const collectMeasurements = (
  asOf: number,
  measurements: DailyCompositionMeasurementInput[],
): { measurements: AnthroMeasurements; selectedMeasurements: DailyCompositionMeasurementInput[] } => {
  const collected: AnthroMeasurements = {};
  const selectedMeasurements: DailyCompositionMeasurementInput[] = [];
  const sorted = measurements
    .filter(measurement => isPositiveFinite(measurement.valueCm) && isAvailableAt(measurement.measuredAt, asOf))
    .sort(compareInputsNewestFirst);
  for (const measurement of sorted) {
    const { type, protocol, valueCm } = measurement;
    if (!isBodyCompositionMeasurementType(type)) continue;
    if (type === 'waist' && protocol !== 'waist_iliac_crest') continue;
    const key = type === 'arm' && protocol === 'arm_flexed_max' ? 'armFlexed' : type;
    if (type === 'arm' && protocol !== 'arm_relaxed_midpoint' && protocol !== 'arm_flexed_max') continue;
    if (!isValidCompositionMeasurement(key, valueCm)) continue;
    if (collected[key] === undefined) {
      collected[key] = valueCm;
      selectedMeasurements.push(measurement);
    }
  }
  return { measurements: collected, selectedMeasurements };
};

const hasMetricChanged = (
  currentValue: number | null | undefined,
  currentPrecision: number | null | undefined,
  previousValue: number | null | undefined,
  previousPrecision: number | null | undefined,
): boolean => {
  if (currentValue == null) return previousValue != null;
  if (previousValue == null) return true;
  return currentPrecision !== previousPrecision || Math.abs(currentValue - previousValue) >= 0.099999;
};

export const planDailyBodyCompositionRecalculation = ({
  targetDate,
  profile,
  weights,
  measurements,
  storedComposition,
  now = new Date(),
}: DailyCompositionPlannerInput): DailyCompositionRecalculationPlan => {
  const targetDay = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate()).getTime();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  if (targetDay > today) {
    return {
      shouldCalculate: false,
      shouldUpsert: false,
      shouldUpdateWeightLog: false,
      bodyfatShouldReplace: false,
      muscleShouldReplace: false,
      reason: 'future_date',
      asOf: now.toISOString(),
      measurements: {},
      selectedMeasurements: [],
    };
  }
  const asOf = getAsOf(targetDate, now);
  const sourceWeight = weights
    .filter(weight => isPositiveFinite(weight.weightKg) && isAvailableAt(weight.measuredAt, asOf))
    .sort(compareInputsNewestFirst)[0];
  const { measurements: collectedMeasurements, selectedMeasurements } = collectMeasurements(asOf, measurements);
  const result = calculateBodyComposition({
    weightKg: sourceWeight?.weightKg,
    heightCm: profile.heightCm,
    age: profile.age,
    sex: profile.sex,
    measurements: collectedMeasurements,
  });
  const bodyfatShouldReplace = hasMetricChanged(
    result.bodyFat?.percentage,
    result.bodyFat?.precisionLevel,
    storedComposition?.bodyfatPercent,
    storedComposition?.bodyfatPrecisionLevel,
  );
  const muscleShouldReplace = hasMetricChanged(
    result.muscle?.massKg,
    result.muscle?.precisionLevel,
    storedComposition?.muscleMassKg,
    storedComposition?.musclePrecisionLevel,
  );
  const bmiChanged = (result.bmi?.value ?? null) !== (storedComposition?.bmi ?? null);
  const hasAnyResult = !!(result.bmi || result.bodyFat || result.muscle);
  // Recompute on every edit, including deletions. Old precision never vetoes a current result or null invalidation.
  const shouldUpsert =
    bodyfatShouldReplace || muscleShouldReplace || bmiChanged || (!storedComposition && hasAnyResult);
  return {
    asOf: new Date(asOf).toISOString(),
    selectedMeasurements,
    shouldCalculate: true,
    shouldUpsert,
    shouldUpdateWeightLog: !!sourceWeight && isSameLocalDay(new Date(sourceWeight.measuredAt), targetDate),
    bodyfatShouldReplace,
    muscleShouldReplace,
    reason:
      !result.bodyFat && (profile.age == null || !Number.isFinite(profile.age) || profile.age < 16)
        ? 'missing_profile'
        : shouldUpsert
          ? undefined
          : 'not_improved',
    sourceWeightLogId: sourceWeight?.id,
    weightKgUsed: sourceWeight?.weightKg,
    measurements: collectedMeasurements,
    result,
  };
};
