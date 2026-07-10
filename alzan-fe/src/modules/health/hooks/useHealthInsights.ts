/**
 * @fileoverview Health Insights Hook - Aggregates multiple health data sources
 * @module health/hooks/useHealthInsights
 * @version 3.0.0
 *
 * @description
 * This hook serves as the central aggregator for all health-related data in the Alzan Health app.
 * It combines data from multiple sources (weight, measurements, sleep, heart rate, profile)
 * and calculates derived metrics using adaptive multi-level algorithms.
 *
 * ## Data Sources:
 * - **Weight Logs**: From smart scales or manual input
 * - **Anthropometric Measurements**: All circumferences (abdomen, hip, chest, arm, thigh)
 * - **Sleep Logs**: Duration and quality data
 * - **Resting Heart Rate**: From wearables or manual input
 * - **User Profile**: Height, age, sex for calculations
 *
 * ## Calculated Metrics (Adaptive Algorithms):
 * - BMI with sex-specific categories
 * - Body Fat % (4 levels: Deurenberg → BAI → BAI+WHtR → Full Anthropometry)
 * - Muscle Mass (2 levels: Al-Gindan → CMC)
 * - Lean Mass / Fat Mass in kg
 *
 * @author Alzan Health Development Team
 * @since 1.0.0
 */

import { useWeightLogs } from './useWeight';
import { useMeasurements } from './useMeasurements';
import { useSleepSessions } from './useSleep';
import { useRestingHRLogs } from './useRestingHR';
import { useUserProfile } from './useUserProfile';
import { useBodyCompositionLogs } from './useBodyCompositionLogs';
import {
  calculateBodyComposition,
  hasEnoughDataForBmi,
  hasEnoughDataForBodyFat,
  AnthroMeasurements,
  BodyCompositionResult,
  BodyFatMethod,
  CompositionInputKey,
  MuscleMethod,
  getBodyFatCategory,
  getMuscleCategory,
} from '../algorithms/bodyComposition';
import {
  calculateAbdominalHealth,
  calculateRecompositionTrend,
  RecompositionSnapshot,
} from '../algorithms/abdominalHealth';
import { BodyCompositionLog } from '../services/bodyCompositionService';

/** Debug flag - logs will appear in development mode */
const DEBUG = typeof __DEV__ !== 'undefined' ? __DEV__ : false;

/**
 * Logs debug information if DEBUG is enabled
 */
const log = (message: string, data?: unknown) => {
  if (DEBUG) {
    console.log(`[useHealthInsights] ${message}`, data || '');
  }
};

const round1 = (value: number): number => parseFloat(value.toFixed(1));

const COMPOSITION_INPUT_KEYS: CompositionInputKey[] = [
  'weight',
  'height',
  'age',
  'sex',
  'abdomen',
  'hips',
  'chest',
  'arm',
  'thigh',
  'storedBodyFat',
  'storedMuscleMass',
];

type CompositionInputsJson = BodyCompositionLog['bodyfat_inputs'];

const isCompositionInputKey = (value: unknown): value is CompositionInputKey =>
  typeof value === 'string' && COMPOSITION_INPUT_KEYS.includes(value as CompositionInputKey);

const parseInputs = (value: CompositionInputsJson): CompositionInputKey[] =>
  Array.isArray(value) ? value.filter(isCompositionInputKey) : [];

const bodyFatMethodLabels: Record<BodyFatMethod, string> = {
  measured: 'Medición importada/externa',
  rfm: 'RFM (Woolcott & Bergman 2018)',
  bai: 'BAI (Fallback con cadera)',
  cun_bae: 'CUN-BAE (Gómez-Ambrosi et al. 2012)',
  deurenberg: 'Deurenberg (1991)',
  stored: 'Valor guardado',
  whtr: 'WHtR',
  anthropometry_full: 'Antropometría avanzada',
  bai_whtr_combined: 'BAI + WHtR',
};

const muscleMethodLabels: Record<MuscleMethod, string> = {
  lee_et_al: 'Lee et al. (2000)',
  al_gindan: 'Al-Gindan et al. (2014)',
  stored: 'Valor guardado',
  anthropometric: 'Antropometría',
};

const isBodyFatMethod = (method: string | null): method is BodyFatMethod => !!method && method in bodyFatMethodLabels;

const isMuscleMethod = (method: string | null): method is MuscleMethod => !!method && method in muscleMethodLabels;

const compositionFromLog = (
  compositionLog: BodyCompositionLog,
  fallbackResult: BodyCompositionResult,
  sex: 'male' | 'female',
): BodyCompositionResult => {
  const bodyFatMethod = isBodyFatMethod(compositionLog.bodyfat_method) ? compositionLog.bodyfat_method : 'stored';
  const muscleMethod = isMuscleMethod(compositionLog.muscle_method) ? compositionLog.muscle_method : 'stored';
  const bodyFatValue = compositionLog.bodyfat_percent;
  const muscleMassKg = compositionLog.muscle_mass_kg;
  const musclePercent = compositionLog.muscle_percent;
  const bodyFatCategory = bodyFatValue !== null ? getBodyFatCategory(bodyFatValue, sex) : null;
  const muscleCategory = musclePercent !== null ? getMuscleCategory(musclePercent, sex) : null;

  const bodyFat =
    bodyFatValue !== null && bodyFatCategory
      ? {
          percentage: bodyFatValue,
          category: bodyFatCategory.category,
          categoryLabel: bodyFatCategory.label,
          method: bodyFatMethod,
          methodLabel: bodyFatMethodLabels[bodyFatMethod],
          precisionLevel: (compositionLog.bodyfat_precision_level ?? 1) as 1 | 2 | 3,
          formulaUsed: compositionLog.bodyfat_formula ?? 'Stored value; original calculation method is not persisted.',
          inputsUsed: parseInputs(compositionLog.bodyfat_inputs),
        }
      : null;

  const muscle =
    muscleMassKg !== null && musclePercent !== null && muscleCategory
      ? {
          percentage: musclePercent,
          massKg: muscleMassKg,
          category: muscleCategory.category,
          categoryLabel: muscleCategory.label,
          method: muscleMethod,
          methodLabel: muscleMethodLabels[muscleMethod],
          precisionLevel: (compositionLog.muscle_precision_level ?? 1) as 1 | 2 | 3,
          formulaUsed: compositionLog.muscle_formula ?? 'Stored value; original calculation method is not persisted.',
          inputsUsed: parseInputs(compositionLog.muscle_inputs),
        }
      : null;

  const weightKgUsed = compositionLog.weight_kg_used;
  const fatMassKg = bodyFat && weightKgUsed !== null ? round1(weightKgUsed * (bodyFat.percentage / 100)) : null;
  const leanMassKg = fatMassKg !== null && weightKgUsed !== null ? round1(weightKgUsed - fatMassKg) : null;
  const residualMassKg =
    leanMassKg !== null && muscleMassKg !== null ? round1(Math.max(0, leanMassKg - muscleMassKg)) : null;

  return {
    ...fallbackResult,
    bmi: fallbackResult.bmi,
    bodyFat,
    muscle,
    fatMassKg,
    leanMassKg,
    muscleMassKg,
    residualMassKg,
  };
};

/**
 * Main health insights hook - aggregates all health data and calculations
 * Uses adaptive algorithms that select the most accurate method based on available data
 */
export const useHealthInsights = () => {
  log('Hook initialized');

  // =========================================================================
  // DATA FETCHING - From individual hooks
  // =========================================================================

  const { data: weightLogs } = useWeightLogs();
  const { data: measurements } = useMeasurements();
  const { data: sleepSessions } = useSleepSessions();
  const { data: hrLogs } = useRestingHRLogs();
  const { data: profile } = useUserProfile();
  const { data: bodyCompositionLogs } = useBodyCompositionLogs();

  log('Data loaded', {
    weightLogsCount: weightLogs?.length || 0,
    measurementsCount: measurements?.length || 0,
    sleepLogsCount: sleepSessions?.length || 0,
    hrLogsCount: hrLogs?.length || 0,
    bodyCompositionLogsCount: bodyCompositionLogs?.length || 0,
    hasProfile: !!profile,
  });

  // =========================================================================
  // EXTRACT LATEST VALUES
  // =========================================================================

  /** Most recent weight log entry */
  const latestWeight = weightLogs?.[0];

  /** Previous weight log for delta calculation (finds first weight on a different calendar day, falls back to previous log) */
  const previousWeight = (() => {
    if (!weightLogs || weightLogs.length < 2 || !latestWeight) return undefined;
    const latestDateStr = new Date(latestWeight.measured_at).toDateString();
    const diffDayLog = weightLogs.find(
      (log, index) => index > 0 && new Date(log.measured_at).toDateString() !== latestDateStr,
    );
    return diffDayLog || weightLogs[1];
  })();

  const latestSleep = sleepSessions?.[0];
  const latestCompositionLog = bodyCompositionLogs?.[0];

  /** Most recent heart rate log */
  const latestHR = hrLogs?.[0];

  // =========================================================================
  // WEIGHT DELTA CALCULATION
  // =========================================================================

  let weightDelta = null;
  if (latestWeight && previousWeight) {
    weightDelta = {
      change: parseFloat((latestWeight.weight_kg - previousWeight.weight_kg).toFixed(1)),
      previousDate: previousWeight.measured_at,
    };
    log('Weight delta calculated', weightDelta);
  }

  // =========================================================================
  // ANTHROPOMETRIC MEASUREMENTS
  // =========================================================================

  /**
   * Helper to get the latest valid measurement (<= 14 days)
   * Supports checking multiple type keys (e.g. ['hips', 'hip'])
   */
  const getLatest = (type: string | string[]): number | undefined => {
    if (!measurements || measurements.length === 0) return undefined;

    const types = Array.isArray(type) ? type : [type];

    // 1. Filter by type(s)
    const matching = measurements.filter(m => types.includes(m.measurement_type));

    // 2. Sort by date descending (newest first)
    matching.sort((a, b) => {
      const dateA = a.measured_at ? new Date(a.measured_at).getTime() : 0;
      const dateB = b.measured_at ? new Date(b.measured_at).getTime() : 0;
      return dateB - dateA;
    });

    // 3. Find first one within validity window
    const valid = matching.find(m => {
      if (!m.measured_at) return false;
      const measuredAt = new Date(m.measured_at);
      const now = new Date();
      const daysDiff = (now.getTime() - measuredAt.getTime()) / (1000 * 3600 * 24);

      const isValid = daysDiff <= 14;
      if (!isValid && DEBUG) {
        console.log(`[useHealthInsights] Ignoring old ${m.measurement_type} (${Math.round(daysDiff)} days old)`);
      }
      return isValid;
    });

    return valid?.value_cm;
  };

  /**
   * Collected anthropometric measurements for adaptive algorithms
   */
  const anthroMeasurements: AnthroMeasurements = {
    hips: getLatest('hips'),
    abdomen: getLatest('abdomen'),
    chest: getLatest('chest'),
    arm: getLatest('arm'),
    thigh: getLatest('thigh'),
  };

  const getPreviousLatest = (type: string): number | undefined => {
    if (!measurements || measurements.length === 0) return undefined;

    const matching = measurements
      .filter(m => m.measurement_type === type && m.measured_at)
      .sort((a, b) => new Date(b.measured_at).getTime() - new Date(a.measured_at).getTime());

    if (matching.length < 2) return undefined;

    const latestDate = new Date(matching[0].measured_at).toDateString();
    return matching.find(m => new Date(m.measured_at).toDateString() !== latestDate)?.value_cm;
  };

  log('Anthropometric measurements', anthroMeasurements);

  // =========================================================================
  // AGE CALCULATION
  // =========================================================================

  let age: number | null = null;
  if (profile?.date_of_birth) {
    const birth = new Date(profile.date_of_birth);
    const today = new Date();
    age = today.getFullYear() - birth.getFullYear();

    const monthDiff = today.getMonth() - birth.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
      age--;
    }
    log('Age calculated', { dateOfBirth: profile.date_of_birth, age });
  }

  // =========================================================================
  // BODY COMPOSITION - USE PERSISTED DAILY RESULT WHEN AVAILABLE
  // =========================================================================
  //
  // Daily composition logs preserve the algorithm, formula, inputs and precision
  // used for that day. Legacy weight-log values remain a fallback for older data.

  let bodyCompResult: BodyCompositionResult | null = null;

  const effectiveSex = profile?.sex === 'male' || profile?.sex === 'female' ? profile.sex : undefined;

  if ((latestCompositionLog?.weight_kg_used || latestWeight?.weight_kg) && profile?.height_cm) {
    const calculationWeight = latestCompositionLog?.weight_kg_used ?? latestWeight!.weight_kg;
    const calculationSex = effectiveSex ?? 'male';
    // Calculate body composition using the algorithm WITH measurements
    // This is the fallback for old rows; persisted composition logs override method/formula/inputs.
    const fallbackResult = calculateBodyComposition({
      weightKg: calculationWeight,
      heightCm: profile.height_cm,
      age,
      sex: calculationSex,
      measurements: anthroMeasurements, // Pass actual measurements!
      loggedBodyFat: latestCompositionLog ? undefined : (latestWeight?.bodyfat_percent ?? undefined),
      loggedMuscleMass: latestCompositionLog ? undefined : (latestWeight?.muscle_mass_kg ?? undefined),
      loggedSource: latestWeight?.source,
    });
    bodyCompResult = latestCompositionLog
      ? compositionFromLog(latestCompositionLog, fallbackResult, calculationSex)
      : fallbackResult;

    log('Body composition calculated', {
      bmi: bodyCompResult.bmi?.value,
      bodyFatMethod: bodyCompResult.bodyFat?.method,
      muscleMethod: bodyCompResult.muscle?.method,
    });
  }

  // =========================================================================
  // DATA SUFFICIENCY FLAGS
  // =========================================================================

  const height_cm = profile?.height_cm ?? undefined;
  const effectiveWeight = latestCompositionLog?.weight_kg_used ?? latestWeight?.weight_kg;
  const effectiveBodyFat = latestCompositionLog?.bodyfat_percent ?? latestWeight?.bodyfat_percent;
  const canCalculateBmi = hasEnoughDataForBmi(effectiveWeight, height_cm);
  const abdominalHealth = calculateAbdominalHealth({
    weightKg: effectiveWeight,
    heightCm: height_cm,
    sex: effectiveSex,
    measurements: anthroMeasurements,
  });
  const currentRecompositionSnapshot: RecompositionSnapshot = {
    weightKg: effectiveWeight,
    abdomen: anthroMeasurements.abdomen,
    chest: anthroMeasurements.chest,
    arm: anthroMeasurements.arm,
    thigh: anthroMeasurements.thigh,
  };
  const previousRecompositionSnapshot: RecompositionSnapshot = {
    weightKg: previousWeight?.weight_kg,
    abdomen: getPreviousLatest('abdomen'),
    chest: getPreviousLatest('chest'),
    arm: getPreviousLatest('arm'),
    thigh: getPreviousLatest('thigh'),
  };
  const recompositionTrend = calculateRecompositionTrend({
    current: currentRecompositionSnapshot,
    previous: previousRecompositionSnapshot,
  });

  const canCalculateBodyFat = hasEnoughDataForBodyFat(
    effectiveWeight,
    height_cm,
    age,
    profile?.sex,
    anthroMeasurements.hips,
    effectiveBodyFat,
  );

  log('Data sufficiency', { canCalculateBmi, canCalculateBodyFat });

  // =========================================================================
  // AVERAGES CALCULATION
  // =========================================================================

  const avgSleep =
    sleepSessions && sleepSessions.length > 0
      ? sleepSessions.reduce((acc, curr) => acc + (curr.total_sleep_min || 0), 0) / sleepSessions.length
      : 0;

  const avgHR =
    hrLogs && hrLogs.length > 0 ? hrLogs.reduce((acc, curr) => acc + curr.resting_hr_bpm, 0) / hrLogs.length : 0;

  log('Averages calculated', { avgSleep, avgHR });

  // =========================================================================
  // RETURN AGGREGATED DATA
  // =========================================================================

  const result = {
    // Raw data
    latestWeight,
    latestSleep,
    latestHR,

    // Averages
    avgSleepMinutes: avgSleep,
    avgHRBpm: avgHR,

    // Profile data
    age,

    // Body composition (all calculated metrics from adaptive algorithms)
    bodyComposition: {
      bmi: bodyCompResult?.bmi || null,
      bodyFat: bodyCompResult?.bodyFat || null,
      muscle: bodyCompResult?.muscle || null,
      leanMassKg: bodyCompResult?.leanMassKg || null,
      fatMassKg: bodyCompResult?.fatMassKg || null,
      muscleMassKg: bodyCompResult?.muscleMassKg || null,
      residualMassKg: bodyCompResult?.residualMassKg || null,
      abdominalHealth,
      recompositionTrend,
      // Data availability info
      availableData: bodyCompResult?.availableData || {
        hasBasicData: false,
        hasHips: false,
        hasAbdomen: false,
        hasChest: false,
        hasArm: false,
        hasThigh: false,
        hasFullAnthropometry: false,
      },
      // Legacy compatibility
      hasEnoughDataForBmi: canCalculateBmi,
      hasEnoughDataForBodyFat: canCalculateBodyFat,
      hasEnoughDataForMuscle: !!bodyCompResult?.muscle,
      // Legacy leanMass structure
      leanMass: bodyCompResult?.leanMassKg
        ? {
            muscleMass: bodyCompResult.muscleMassKg || 0,
            leanMass: bodyCompResult.leanMassKg,
            fatMass: bodyCompResult.fatMassKg || 0,
          }
        : null,
    },

    // Weight tracking
    weightDelta,

    // Profile summary
    profile: {
      sex: profile?.sex,
      heightCm: profile?.height_cm,
      age,
    },

    // Loading state
    isLoading: !weightLogs || !bodyCompositionLogs,
  };

  log('Returning result', {
    hasBmi: !!result.bodyComposition.bmi,
    hasBodyFat: !!result.bodyComposition.bodyFat,
    bodyFatMethod: result.bodyComposition.bodyFat?.method,
    hasMuscle: !!result.bodyComposition.muscle,
    muscleMethod: result.bodyComposition.muscle?.method,
    isLoading: result.isLoading,
  });

  return result;
};
