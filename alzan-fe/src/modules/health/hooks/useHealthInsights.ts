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
import {
  calculateBodyComposition,
  hasEnoughDataForBmi,
  hasEnoughDataForBodyFat,
  AnthroMeasurements,
  BodyCompositionResult,
} from '../algorithms/bodyComposition';

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

  log('Data loaded', {
    weightLogsCount: weightLogs?.length || 0,
    measurementsCount: measurements?.length || 0,
    sleepLogsCount: sleepSessions?.length || 0,
    hrLogsCount: hrLogs?.length || 0,
    hasProfile: !!profile,
  });

  // =========================================================================
  // EXTRACT LATEST VALUES
  // =========================================================================

  /** Most recent weight log entry */
  const latestWeight = weightLogs?.[0];

  /** Previous weight log for delta calculation */
  const previousWeight = weightLogs?.[1];

  const latestSleep = sleepSessions?.[0];

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
  // BODY COMPOSITION - USE STORED VALUES
  // =========================================================================
  //
  // IMPORTANT: Body composition values (body fat %, muscle mass) are calculated
  // ONLY when a new weight is registered. Adding new measurements does NOT
  // update these values until the next weight registration.
  //
  // This ensures data consistency and prevents confusing value changes.

  let bodyCompResult: BodyCompositionResult | null = null;

  const effectiveSex = profile?.sex === 'male' || profile?.sex === 'female' ? profile.sex : 'male';

  if (latestWeight?.weight_kg && profile?.height_cm && age) {
    // Calculate body composition using the algorithm WITH measurements
    // This ensures the UI shows the ACTUAL method used (RFM, Al-Gindan, etc.)
    bodyCompResult = calculateBodyComposition({
      weightKg: latestWeight.weight_kg,
      heightCm: profile.height_cm,
      age,
      sex: effectiveSex,
      measurements: anthroMeasurements, // Pass actual measurements!
      loggedBodyFat: latestWeight.bodyfat_percent ?? undefined, // Use stored value if available
      loggedMuscleMass: latestWeight.muscle_mass_kg ?? undefined, // Use stored value if available
      loggedSource: latestWeight.source,
    });

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
  const canCalculateBmi = hasEnoughDataForBmi(latestWeight?.weight_kg, height_cm);

  const canCalculateBodyFat = hasEnoughDataForBodyFat(
    latestWeight?.weight_kg,
    height_cm,
    age,
    profile?.sex,
    anthroMeasurements.hips,
    latestWeight?.bodyfat_percent,
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
    isLoading: !weightLogs,
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
