import { useWeightLogs } from './useWeight';
import { useMeasurements } from './useMeasurements';
import { useSleepSessions } from './useSleep';
import { useRestingHRLogs } from './useRestingHR';
import { useUserProfile } from './useUserProfile';
import { useBodyCompositionLogs } from './useBodyCompositionLogs';
import { calculateAbdominalHealth } from '../algorithms/abdominalHealth';
import { buildCompositionDeltas } from '../algorithms/compositionSnapshot';
import {
  isBodyCompositionMeasurementType,
  planDailyBodyCompositionRecalculation,
  type DailyCompositionMeasurementInput,
} from '../algorithms/bodyCompositionDailyPlanner';
import { buildBodyChanges } from '../algorithms/bodyChanges';

/** Current read model and persisted snapshots share the same input selector and engine. */
export const useHealthInsights = () => {
  const weightsQuery = useWeightLogs(500);
  const measurementsQuery = useMeasurements(undefined, 1000);
  const { data: sleepSessions } = useSleepSessions();
  const { data: hrLogs } = useRestingHRLogs();
  const { data: profile } = useUserProfile();
  const compositionQuery = useBodyCompositionLogs();
  const bodyCompositionLogs = compositionQuery.data;
  const weightLogs = weightsQuery.data ?? [];
  const measurements = measurementsQuery.data ?? [];
  const serverReference =
    bodyCompositionLogs?.reduce(
      (latest, row) => Math.max(latest, new Date(row.composition_calculated_at ?? '').getTime() || 0),
      0,
    ) ?? 0;
  const now = new Date(
    serverReference && compositionQuery.dataUpdatedAt
      ? serverReference + Math.max(0, Date.now() - compositionQuery.dataUpdatedAt)
      : Date.now(),
  );
  const latestWeight = weightLogs.find(row => new Date(row.measured_at).getTime() <= now.getTime());
  const previousWeight = weightLogs.find(
    row =>
      row.id !== latestWeight?.id &&
      new Date(row.measured_at).getTime() <= now.getTime() &&
      new Date(row.measured_at).toDateString() !== new Date(latestWeight?.measured_at ?? now).toDateString(),
  );
  let age: number | null = null;
  if (profile?.date_of_birth) {
    const birth = new Date(`${profile.date_of_birth}T12:00:00`);
    age = now.getFullYear() - birth.getFullYear();
    if (now.getMonth() < birth.getMonth() || (now.getMonth() === birth.getMonth() && now.getDate() < birth.getDate()))
      age--;
    if (!Number.isFinite(age) || age < 0) age = null;
  }
  const selectedMeasurements: DailyCompositionMeasurementInput[] = measurements.flatMap(row =>
    isBodyCompositionMeasurementType(row.measurement_type)
      ? [
          {
            id: row.id,
            type: row.measurement_type,
            valueCm: row.value_cm,
            measuredAt: row.measured_at,
            protocol: row.measurement_protocol,
          },
        ]
      : [],
  );
  const effectiveSex = profile?.sex === 'male' || profile?.sex === 'female' ? profile.sex : undefined;
  const plannerInput = {
    targetDate: now,
    now,
    profile: { heightCm: profile?.height_cm, age, sex: effectiveSex },
    weights: weightLogs.map(row => ({ id: row.id, weightKg: row.weight_kg, measuredAt: row.measured_at })),
    measurements: selectedMeasurements,
  };
  const plan = planDailyBodyCompositionRecalculation(plannerInput);
  const result = weightsQuery.error || measurementsQuery.error ? undefined : plan.result;
  const abdominalHealth = calculateAbdominalHealth({
    heightCm: profile?.height_cm,
    weightKg: plan.weightKgUsed,
    sex: effectiveSex,
    measurements: plan.measurements,
  });
  const currentWeight = weightLogs.find(row => row.id === plan.sourceWeightLogId);
  const currentDate =
    plan.selectedMeasurements
      .map(row => row.measuredAt)
      .concat(currentWeight ? [currentWeight.measured_at] : [])
      .sort((a, b) => new Date(a).getTime() - new Date(b).getTime())
      .at(-1) ?? null;
  const currentLogs = (bodyCompositionLogs ?? []).filter(row => row.calculation_status !== 'stale');
  const emptyDeltas = {
    bmi: null,
    bodyFat: null,
    muscle: null,
    bodyFatMethodChanged: false,
    muscleMethodChanged: false,
  };
  const storedCurrent = currentLogs[0];
  const snapshotsMatch =
    storedCurrent &&
    storedCurrent.source_weight_log_id === (plan.sourceWeightLogId ?? null) &&
    storedCurrent.bodyfat_method === (result?.bodyFat?.method ?? null) &&
    storedCurrent.bodyfat_percent === (result?.bodyFat?.percentage ?? null) &&
    storedCurrent.muscle_mass_kg === (result?.muscle?.massKg ?? null);

  return {
    latestWeight,
    latestSleep: sleepSessions?.[0],
    latestHR: hrLogs?.[0],
    age,
    avgSleepMinutes: sleepSessions?.length
      ? sleepSessions.reduce((sum, row) => sum + (row.total_sleep_min ?? 0), 0) / sleepSessions.length
      : 0,
    avgHRBpm: hrLogs?.length ? hrLogs.reduce((sum, row) => sum + row.resting_hr_bpm, 0) / hrLogs.length : 0,
    weightDelta:
      latestWeight && previousWeight
        ? {
            change: Math.round((latestWeight.weight_kg - previousWeight.weight_kg) * 10) / 10,
            previousDate: previousWeight.measured_at,
          }
        : null,
    profile: { sex: profile?.sex, heightCm: profile?.height_cm, age },
    isLoading: weightsQuery.isLoading || measurementsQuery.isLoading,
    bodyComposition: {
      bmi: result?.bmi ?? null,
      bodyFat: result?.bodyFat ?? null,
      muscle: result?.muscle ?? null,
      leanMassKg: result?.leanMassKg ?? null,
      fatMassKg: result?.fatMassKg ?? null,
      muscleMassKg: result?.muscleMassKg ?? null,
      residualMassKg: result?.residualMassKg ?? null,
      measuredBodyFat: currentWeight?.bodyfat_percent ?? null,
      measuredMuscleMass: currentWeight?.muscle_mass_kg ?? null,
      sourceDate: currentDate,
      historicalDate:
        !result?.bmi &&
        !result?.bodyFat &&
        !result?.muscle &&
        !abdominalHealth.waistToHeight &&
        !abdominalHealth.waistToHip
          ? (currentLogs.find(
              row =>
                row.bmi !== null ||
                row.bodyfat_percent !== null ||
                row.muscle_mass_kg !== null ||
                row.waist_to_height_ratio !== null ||
                row.waist_to_hip_ratio !== null,
            )?.calculated_for_date ?? null)
          : null,
      abdominalHealth,
      bodyChanges: buildBodyChanges(plannerInput),
      availableData: result?.availableData ?? {
        hasBasicData: false,
        hasHips: false,
        hasAbdomen: false,
        hasChest: false,
        hasArm: false,
        hasThigh: false,
        hasFullAnthropometry: false,
      },
      hasEnoughDataForBmi: !!result?.bmi,
      hasEnoughDataForBodyFat: !!result?.bodyFat,
      hasEnoughDataForMuscle: !!result?.muscle,
      leanMass:
        result?.leanMassKg != null
          ? { muscleMass: result.muscleMassKg ?? 0, leanMass: result.leanMassKg, fatMass: result.fatMassKg ?? 0 }
          : null,
      deltas: currentDate && snapshotsMatch ? buildCompositionDeltas(currentLogs) : emptyDeltas,
    },
  };
};
