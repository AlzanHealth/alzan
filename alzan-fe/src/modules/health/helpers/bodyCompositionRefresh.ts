import type { BodyCompositionLog } from '../services/bodyCompositionService';
import type { Json } from '../../../types/database.types';

export type CompositionSnapshotForComparison = Pick<
  BodyCompositionLog,
  | 'calculated_for_date'
  | 'input_revision'
  | 'calculation_version'
  | 'calculation_status'
  | 'input_snapshot'
  | 'bmi'
  | 'bodyfat_percent'
  | 'bodyfat_method'
  | 'bodyfat_formula'
  | 'bodyfat_precision_level'
  | 'muscle_mass_kg'
  | 'muscle_percent'
  | 'muscle_method'
  | 'muscle_formula'
  | 'muscle_precision_level'
  | 'source_weight_log_id'
  | 'weight_kg_used'
  | 'waist_to_height_ratio'
  | 'waist_to_hip_ratio'
>;

const hasMetric = (snapshot: CompositionSnapshotForComparison): boolean =>
  snapshot.bmi !== null ||
  snapshot.bodyfat_percent !== null ||
  snapshot.muscle_percent !== null ||
  snapshot.waist_to_height_ratio !== null ||
  snapshot.waist_to_hip_ratio !== null;

const withoutCalculationTimestamp = (value: Json): Json => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const stable: { [key: string]: Json | undefined } = {};
  for (const [key, entry] of Object.entries(value)) {
    if (key !== 'asOf') stable[key] = entry;
  }
  return stable;
};

export const hasCalculatedCompositionValues = (
  snapshots: readonly CompositionSnapshotForComparison[] | undefined,
): boolean => {
  const latest = snapshots?.[0];
  return !!latest && latest.calculation_status !== 'stale' && hasMetric(latest);
};

const toFingerprint = (snapshots: readonly CompositionSnapshotForComparison[]) =>
  snapshots
    .map(snapshot => ({
      calculatedForDate: snapshot.calculated_for_date,
      inputRevision: snapshot.input_revision,
      calculationVersion: snapshot.calculation_version,
      calculationStatus: snapshot.calculation_status,
      inputSnapshot: withoutCalculationTimestamp(snapshot.input_snapshot),
      bmi: snapshot.bmi,
      bodyFatPercent: snapshot.bodyfat_percent,
      bodyFatMethod: snapshot.bodyfat_method,
      bodyFatFormula: snapshot.bodyfat_formula,
      bodyFatPrecision: snapshot.bodyfat_precision_level,
      muscleMassKg: snapshot.muscle_mass_kg,
      musclePercent: snapshot.muscle_percent,
      muscleMethod: snapshot.muscle_method,
      muscleFormula: snapshot.muscle_formula,
      musclePrecision: snapshot.muscle_precision_level,
      sourceWeightLogId: snapshot.source_weight_log_id,
      weightKgUsed: snapshot.weight_kg_used,
      waistToHeightRatio: snapshot.waist_to_height_ratio,
      waistToHipRatio: snapshot.waist_to_hip_ratio,
    }))
    .sort((left, right) => right.calculatedForDate.localeCompare(left.calculatedForDate));

export const hasBodyCompositionChanged = (
  previous: readonly CompositionSnapshotForComparison[] | undefined,
  current: readonly CompositionSnapshotForComparison[] | undefined,
): boolean => {
  if (!current?.length) return false;
  if (!previous?.length) return true;
  return JSON.stringify(toFingerprint(previous)) !== JSON.stringify(toFingerprint(current));
};
