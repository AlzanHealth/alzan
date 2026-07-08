import { MaleOrFemale, MeasurementType } from '../../../types/requests.types';
import { AnthroMeasurements, BodyCompositionResult, calculateBodyComposition } from './bodyComposition';

export const RECENT_BODY_COMPOSITION_WINDOW_DAYS = 14;

const BODY_COMPOSITION_MEASUREMENT_TYPES = ['abdomen', 'hips', 'chest', 'arm', 'thigh'] as const;

export type BodyCompositionMeasurementType = (typeof BODY_COMPOSITION_MEASUREMENT_TYPES)[number];

export interface DailyCompositionWeightLogInput {
  id: string;
  measuredAt: string;
  weightKg: number;
}

export interface DailyCompositionMeasurementInput {
  type: BodyCompositionMeasurementType;
  measuredAt: string;
  valueCm: number;
}

export interface DailyCompositionProfileInput {
  heightCm: number | null | undefined;
  age: number | null | undefined;
  sex: MaleOrFemale | null | undefined;
}

export interface StoredDailyCompositionInput {
  bodyfatPercent?: number | null;
  bodyfatPrecisionLevel?: number | null;
  muscleMassKg?: number | null;
  musclePrecisionLevel?: number | null;
}

export type DailyCompositionSkipReason = 'missing_weight' | 'missing_profile' | 'missing_bodyfat' | 'not_improved';

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
  result?: BodyCompositionResult;
}

export interface DailyCompositionPlannerInput {
  targetDate: Date;
  profile: DailyCompositionProfileInput;
  weights: DailyCompositionWeightLogInput[];
  measurements: DailyCompositionMeasurementInput[];
  storedComposition?: StoredDailyCompositionInput | null;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const BODY_FAT_DIFF_THRESHOLD = 0.1;
const MUSCLE_DIFF_THRESHOLD = 0.1;

export const isBodyCompositionMeasurementType = (
  type: MeasurementType | string,
): type is BodyCompositionMeasurementType =>
  BODY_COMPOSITION_MEASUREMENT_TYPES.includes(type as BodyCompositionMeasurementType);

const startOfLocalDay = (date: Date): Date => new Date(date.getFullYear(), date.getMonth(), date.getDate());

const endOfLocalDay = (date: Date): Date => new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);

const isSameLocalDay = (left: Date, right: Date): boolean =>
  left.getFullYear() === right.getFullYear() &&
  left.getMonth() === right.getMonth() &&
  left.getDate() === right.getDate();

const isWithinRecentWindow = (candidate: Date, targetDate: Date): boolean => {
  const targetEnd = endOfLocalDay(targetDate).getTime();
  const candidateTime = candidate.getTime();

  if (candidateTime >= targetEnd) return false;

  const targetStart = startOfLocalDay(targetDate).getTime();
  const diffDays = (targetStart - startOfLocalDay(candidate).getTime()) / MS_PER_DAY;
  return diffDays >= 0 && diffDays < RECENT_BODY_COMPOSITION_WINDOW_DAYS;
};

const selectSourceWeightLog = (
  targetDate: Date,
  weights: DailyCompositionWeightLogInput[],
): DailyCompositionWeightLogInput | undefined =>
  weights
    .filter(weight => weight.weightKg > 0 && isWithinRecentWindow(new Date(weight.measuredAt), targetDate))
    .sort((a, b) => new Date(b.measuredAt).getTime() - new Date(a.measuredAt).getTime())[0];

const collectMeasurements = (
  targetDate: Date,
  measurements: DailyCompositionMeasurementInput[],
): AnthroMeasurements => {
  const selected: Partial<Record<BodyCompositionMeasurementType, DailyCompositionMeasurementInput>> = {};

  measurements
    .filter(
      measurement =>
        measurement.valueCm > 0 &&
        isBodyCompositionMeasurementType(measurement.type) &&
        isWithinRecentWindow(new Date(measurement.measuredAt), targetDate),
    )
    .sort((a, b) => new Date(b.measuredAt).getTime() - new Date(a.measuredAt).getTime())
    .forEach(measurement => {
      if (!selected[measurement.type]) {
        selected[measurement.type] = measurement;
      }
    });

  return {
    abdomen: selected.abdomen?.valueCm,
    hips: selected.hips?.valueCm,
    chest: selected.chest?.valueCm,
    arm: selected.arm?.valueCm,
    thigh: selected.thigh?.valueCm,
  };
};

const shouldReplaceMetric = (
  newPrecision: number | undefined,
  existingPrecision: number | null | undefined,
  newValue: number | null | undefined,
  existingValue: number | null | undefined,
  threshold: number,
): boolean => {
  if (!newPrecision || newValue === null || newValue === undefined) return false;
  if (!existingValue || !existingPrecision) return true;
  if (newPrecision > existingPrecision) return true;
  if (newPrecision < existingPrecision) return false;
  return Math.abs(newValue - existingValue) >= threshold;
};

export const planDailyBodyCompositionRecalculation = ({
  targetDate,
  profile,
  weights,
  measurements,
  storedComposition,
}: DailyCompositionPlannerInput): DailyCompositionRecalculationPlan => {
  const sourceWeight = selectSourceWeightLog(targetDate, weights);
  const collectedMeasurements = collectMeasurements(targetDate, measurements);

  if (!sourceWeight) {
    return {
      shouldCalculate: false,
      shouldUpsert: false,
      shouldUpdateWeightLog: false,
      bodyfatShouldReplace: false,
      muscleShouldReplace: false,
      reason: 'missing_weight',
      measurements: collectedMeasurements,
    };
  }

  if (!profile.heightCm || !profile.age || !profile.sex) {
    return {
      shouldCalculate: false,
      shouldUpsert: false,
      shouldUpdateWeightLog: false,
      bodyfatShouldReplace: false,
      muscleShouldReplace: false,
      reason: 'missing_profile',
      sourceWeightLogId: sourceWeight.id,
      weightKgUsed: sourceWeight.weightKg,
      measurements: collectedMeasurements,
    };
  }

  const result = calculateBodyComposition({
    weightKg: sourceWeight.weightKg,
    heightCm: profile.heightCm,
    age: profile.age,
    sex: profile.sex,
    measurements: collectedMeasurements,
  });

  if (!result.bodyFat) {
    return {
      shouldCalculate: true,
      shouldUpsert: false,
      shouldUpdateWeightLog: false,
      bodyfatShouldReplace: false,
      muscleShouldReplace: false,
      reason: 'missing_bodyfat',
      sourceWeightLogId: sourceWeight.id,
      weightKgUsed: sourceWeight.weightKg,
      measurements: collectedMeasurements,
      result,
    };
  }

  const bodyfatShouldReplace = shouldReplaceMetric(
    result.bodyFat.precisionLevel,
    storedComposition?.bodyfatPrecisionLevel,
    result.bodyFat.percentage,
    storedComposition?.bodyfatPercent,
    BODY_FAT_DIFF_THRESHOLD,
  );
  const muscleShouldReplace = shouldReplaceMetric(
    result.muscle?.precisionLevel,
    storedComposition?.musclePrecisionLevel,
    result.muscle?.massKg,
    storedComposition?.muscleMassKg,
    MUSCLE_DIFF_THRESHOLD,
  );
  const shouldUpsert = bodyfatShouldReplace || muscleShouldReplace || !storedComposition;

  return {
    shouldCalculate: true,
    shouldUpsert,
    shouldUpdateWeightLog: isSameLocalDay(new Date(sourceWeight.measuredAt), targetDate),
    bodyfatShouldReplace,
    muscleShouldReplace,
    reason: shouldUpsert ? undefined : 'not_improved',
    sourceWeightLogId: sourceWeight.id,
    weightKgUsed: sourceWeight.weightKg,
    measurements: collectedMeasurements,
    result,
  };
};
