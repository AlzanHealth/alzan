/**
 * Body Composition Service
 * Calculates daily body composition results without duplicating weight history.
 */

import { supabase } from '../../../lib/supabaseClient';
import { Database, MaleOrFemale, MeasurementType, WeightLogUpdate } from '../../../types/requests.types';
import { Nullable } from '../../../types/common.types';
import { BodyCompositionResult, calculateBodyComposition } from '../algorithms/bodyComposition';
import { PersistedAbdominalHealthResult, calculatePersistedAbdominalHealth } from '../algorithms/abdominalHealth';
import {
  DailyCompositionMeasurementInput,
  DailyCompositionWeightLogInput,
  RECENT_BODY_COMPOSITION_WINDOW_DAYS,
  isBodyCompositionMeasurementType,
  planDailyBodyCompositionRecalculation,
} from '../algorithms/bodyCompositionDailyPlanner';

interface UserProfile {
  height_cm: number | null;
  date_of_birth: string | null;
  sex: Nullable<MaleOrFemale>;
}

type AllMeasurements = { [key in MeasurementType]?: number };
export type BodyCompositionLog = Database['public']['Tables']['body_composition_logs']['Row'];
type BodyCompositionLogInsert = Database['public']['Tables']['body_composition_logs']['Insert'];

export interface ManualRecalculateResult {
  success: boolean;
  unchanged?: boolean;
  errorCode?:
    | 'limit_reached'
    | 'weight_missing'
    | 'height_missing'
    | 'insufficient_data'
    | 'unexpected_error'
    | 'user_not_found';
  errorValues?: Record<string, string | number>;
}

export interface RecalculateDailyCompositionResult {
  success: boolean;
  unchanged?: boolean;
  reason?: string;
  log?: BodyCompositionLog;
}

const toLocalDateString = (date: Date): string =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

const startOfLocalDay = (date: Date): Date => new Date(date.getFullYear(), date.getMonth(), date.getDate());

const endOfLocalDay = (date: Date): Date => new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);

const addDays = (date: Date, days: number): Date =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);

const hasKeys = (value: Record<string, unknown>): boolean => Object.keys(value).length > 0;
const BODY_COMPOSITION_CALCULATION_VERSION = 1;

const shouldReplaceRatio = (nextValue: number | null | undefined, currentValue: number | null | undefined): boolean => {
  if (nextValue == null) return false;
  if (currentValue == null) return true;
  return Math.abs(nextValue - currentValue) >= 0.005;
};

const shouldReplaceAbdominalHealth = (
  next: PersistedAbdominalHealthResult,
  existing: BodyCompositionLog | null,
): boolean =>
  shouldReplaceRatio(next.waistToHeight?.value, existing?.waist_to_height_ratio) ||
  shouldReplaceRatio(next.waistToHip?.value, existing?.waist_to_hip_ratio);

const buildCompositionPayload = (
  userId: string,
  calculatedForDate: string,
  sourceWeightLogId: string | null,
  weightKgUsed: number | null,
  result: BodyCompositionResult | null,
  abdominalHealth: PersistedAbdominalHealthResult,
  existing: BodyCompositionLog | null,
  bodyfatShouldReplace: boolean,
  muscleShouldReplace: boolean,
  abdominalShouldReplace: boolean,
  inputSnapshot: BodyCompositionLogInsert['input_snapshot'],
): BodyCompositionLogInsert => {
  const nextBodyFat = result && (bodyfatShouldReplace || !existing) ? result.bodyFat : null;
  const nextMuscle = result && (muscleShouldReplace || !existing) ? result.muscle : null;
  const nextWaistToHeight = abdominalShouldReplace || !existing ? abdominalHealth.waistToHeight : null;
  const nextWaistToHip = abdominalShouldReplace || !existing ? abdominalHealth.waistToHip : null;
  const hasCompleteComposition =
    (result?.bmi?.value ?? existing?.bmi) != null &&
    (nextBodyFat?.percentage ?? existing?.bodyfat_percent) != null &&
    (nextMuscle?.massKg ?? existing?.muscle_mass_kg) != null &&
    (nextMuscle?.percentage ?? existing?.muscle_percent) != null;

  return {
    user_id: userId,
    calculated_for_date: calculatedForDate,
    source_weight_log_id: sourceWeightLogId ?? existing?.source_weight_log_id ?? null,
    weight_kg_used: weightKgUsed ?? existing?.weight_kg_used ?? null,
    bmi: result?.bmi?.value ?? existing?.bmi ?? null,
    bodyfat_percent: nextBodyFat?.percentage ?? existing?.bodyfat_percent ?? null,
    bodyfat_method: nextBodyFat?.method ?? existing?.bodyfat_method ?? null,
    bodyfat_precision_level: nextBodyFat?.precisionLevel ?? existing?.bodyfat_precision_level ?? null,
    bodyfat_formula: nextBodyFat?.formulaUsed ?? existing?.bodyfat_formula ?? null,
    bodyfat_inputs: (nextBodyFat?.inputsUsed ??
      existing?.bodyfat_inputs ??
      []) as BodyCompositionLogInsert['bodyfat_inputs'],
    muscle_mass_kg: nextMuscle?.massKg ?? existing?.muscle_mass_kg ?? null,
    muscle_percent: nextMuscle?.percentage ?? existing?.muscle_percent ?? null,
    muscle_method: nextMuscle?.method ?? existing?.muscle_method ?? null,
    muscle_precision_level: nextMuscle?.precisionLevel ?? existing?.muscle_precision_level ?? null,
    muscle_formula: nextMuscle?.formulaUsed ?? existing?.muscle_formula ?? null,
    muscle_inputs: (nextMuscle?.inputsUsed ??
      existing?.muscle_inputs ??
      []) as BodyCompositionLogInsert['muscle_inputs'],
    waist_to_height_ratio: nextWaistToHeight?.value ?? existing?.waist_to_height_ratio ?? null,
    waist_to_height_category: nextWaistToHeight?.category ?? existing?.waist_to_height_category ?? null,
    waist_to_height_formula: nextWaistToHeight?.formula ?? existing?.waist_to_height_formula ?? null,
    waist_to_height_inputs: (nextWaistToHeight?.inputsUsed ??
      existing?.waist_to_height_inputs ??
      []) as BodyCompositionLogInsert['waist_to_height_inputs'],
    waist_to_hip_ratio: nextWaistToHip?.value ?? existing?.waist_to_hip_ratio ?? null,
    waist_to_hip_category: nextWaistToHip?.category ?? existing?.waist_to_hip_category ?? null,
    waist_to_hip_formula: nextWaistToHip?.formula ?? existing?.waist_to_hip_formula ?? null,
    waist_to_hip_inputs: (nextWaistToHip?.inputsUsed ??
      existing?.waist_to_hip_inputs ??
      []) as BodyCompositionLogInsert['waist_to_hip_inputs'],
    composition_calculated_at: new Date().toISOString(),
    calculation_version: BODY_COMPOSITION_CALCULATION_VERSION,
    calculation_status: hasCompleteComposition ? 'complete' : 'partial',
    input_snapshot: inputSnapshot,
    updated_at: new Date().toISOString(),
  };
};

export const bodyCompositionService = {
  /**
   * Recalculates the best available composition for a calendar day.
   * It may reuse a recent weight as an input, but never creates a weight log.
   */
  async recalculateBestCompositionForDate(
    userId: string,
    targetDateInput: Date | string = new Date(),
  ): Promise<RecalculateDailyCompositionResult> {
    try {
      const targetDate = typeof targetDateInput === 'string' ? new Date(targetDateInput) : targetDateInput;
      const calculatedForDate = toLocalDateString(targetDate);
      const windowStart = addDays(targetDate, -RECENT_BODY_COMPOSITION_WINDOW_DAYS + 1).toISOString();
      const windowEnd = endOfLocalDay(targetDate).toISOString();

      const profile = await this.getUserProfile(userId);
      if (!profile || !profile.height_cm) {
        return { success: false, reason: 'height_missing' };
      }

      const [{ data: weightRows, error: weightError }, { data: measurementRows, error: measurementError }] =
        await Promise.all([
          supabase
            .from('weight_logs')
            .select('id, measured_at, weight_kg')
            .eq('user_id', userId)
            .gte('measured_at', windowStart)
            .lt('measured_at', windowEnd)
            .order('measured_at', { ascending: false }),
          supabase
            .from('body_measurements')
            .select('measurement_type, measured_at, value_cm')
            .eq('user_id', userId)
            .gte('measured_at', windowStart)
            .lt('measured_at', windowEnd)
            .order('measured_at', { ascending: false }),
        ]);

      if (weightError) throw weightError;
      if (measurementError) throw measurementError;

      const { data: existingComposition, error: existingError } = await supabase
        .from('body_composition_logs')
        .select('*')
        .eq('user_id', userId)
        .eq('calculated_for_date', calculatedForDate)
        .maybeSingle();

      if (existingError) throw existingError;

      const weights: DailyCompositionWeightLogInput[] = (weightRows ?? []).map(row => ({
        id: row.id,
        measuredAt: row.measured_at,
        weightKg: row.weight_kg,
      }));
      const measurements: DailyCompositionMeasurementInput[] = [];
      (measurementRows ?? []).forEach(row => {
        if (isBodyCompositionMeasurementType(row.measurement_type)) {
          measurements.push({
            type: row.measurement_type,
            measuredAt: row.measured_at,
            valueCm: row.value_cm,
          });
        }
      });

      const plan = planDailyBodyCompositionRecalculation({
        targetDate,
        weights,
        measurements,
        profile: {
          heightCm: profile.height_cm,
          age: this.calculateAge(profile.date_of_birth),
          sex: profile.sex,
        },
        storedComposition:
          existingComposition && existingComposition.calculation_status !== 'stale'
            ? {
                bodyfatPercent: existingComposition.bodyfat_percent,
                bodyfatPrecisionLevel: existingComposition.bodyfat_precision_level,
                muscleMassKg: existingComposition.muscle_mass_kg,
                musclePrecisionLevel: existingComposition.muscle_precision_level,
              }
            : null,
      });

      const abdominalHealth = calculatePersistedAbdominalHealth({
        heightCm: profile.height_cm,
        weightKg: plan.weightKgUsed,
        sex: profile.sex,
        measurements: plan.measurements,
      });
      const typedExistingComposition = existingComposition as BodyCompositionLog | null;
      const abdominalShouldReplace = shouldReplaceAbdominalHealth(abdominalHealth, typedExistingComposition);
      const shouldUpsert = plan.shouldUpsert || abdominalShouldReplace;

      if (!shouldUpsert) {
        return { success: plan.reason !== 'missing_weight', unchanged: true, reason: plan.reason };
      }

      const payload = buildCompositionPayload(
        userId,
        calculatedForDate,
        plan.sourceWeightLogId ?? null,
        plan.weightKgUsed ?? null,
        plan.result ?? null,
        abdominalHealth,
        typedExistingComposition,
        plan.bodyfatShouldReplace,
        plan.muscleShouldReplace,
        abdominalShouldReplace,
        {
          sourceWeightLogId: plan.sourceWeightLogId ?? null,
          weightKg: plan.weightKgUsed ?? null,
          heightCm: profile.height_cm,
          age: this.calculateAge(profile.date_of_birth),
          sex: profile.sex,
          measurements: {
            abdomen: plan.measurements.abdomen ?? null,
            hips: plan.measurements.hips ?? null,
            chest: plan.measurements.chest ?? null,
            arm: plan.measurements.arm ?? null,
            thigh: plan.measurements.thigh ?? null,
          },
        },
      );

      const { data: upsertedLog, error: upsertError } = await supabase
        .from('body_composition_logs')
        .upsert(payload, { onConflict: 'user_id,calculated_for_date' })
        .select()
        .single();

      if (upsertError) throw upsertError;

      if (plan.shouldUpdateWeightLog && plan.sourceWeightLogId) {
        const weightUpdate: WeightLogUpdate = {};
        if (plan.bodyfatShouldReplace && plan.result?.bodyFat) {
          weightUpdate.bodyfat_percent = plan.result.bodyFat.percentage;
        }
        if (plan.muscleShouldReplace) {
          weightUpdate.muscle_mass_kg = plan.result?.muscle?.massKg ?? null;
        }

        if (hasKeys(weightUpdate)) {
          const { error: updateWeightError } = await supabase
            .from('weight_logs')
            .update(weightUpdate)
            .eq('id', plan.sourceWeightLogId);

          if (updateWeightError) throw updateWeightError;
        }
      }

      return { success: true, log: upsertedLog as BodyCompositionLog };
    } catch (error) {
      console.error('[BodyComp] Error in recalculateBestCompositionForDate:', error);
      return { success: false, reason: 'unexpected_error' };
    }
  },

  /**
   * Recalculates body composition for a weight log entry.
   * Kept for callers that only know a weight log changed.
   */
  async recalculateForWeight(
    userId: string,
    weightLogId: string,
    _weightKg: number,
    measuredAt?: string,
  ): Promise<void> {
    try {
      let targetDate = measuredAt ? new Date(measuredAt) : null;

      if (!targetDate) {
        const { data, error } = await supabase
          .from('weight_logs')
          .select('measured_at')
          .eq('user_id', userId)
          .eq('id', weightLogId)
          .maybeSingle();

        if (error) throw error;
        targetDate = data?.measured_at ? new Date(data.measured_at) : new Date();
      }

      await this.recalculateBestCompositionForDate(userId, targetDate);
    } catch (error) {
      console.error('[BodyComp] Error in recalculateForWeight:', error);
    }
  },

  async invalidateAndRecalculateFromInput(userId: string, measuredAt: string): Promise<void> {
    const inputDate = new Date(measuredAt);
    const startDate = toLocalDateString(inputDate);
    const endDate = toLocalDateString(addDays(inputDate, RECENT_BODY_COMPOSITION_WINDOW_DAYS - 1));
    const { data: affectedRows, error: readError } = await supabase
      .from('body_composition_logs')
      .select('calculated_for_date')
      .eq('user_id', userId)
      .gte('calculated_for_date', startDate)
      .lte('calculated_for_date', endDate)
      .order('calculated_for_date', { ascending: true });
    if (readError) throw readError;
    if (affectedRows?.length) {
      const { error: staleError } = await supabase
        .from('body_composition_logs')
        .update({ calculation_status: 'stale' })
        .eq('user_id', userId)
        .gte('calculated_for_date', startDate)
        .lte('calculated_for_date', endDate);
      if (staleError) throw staleError;
    }
    const datesToRecalculate = new Set([startDate, ...(affectedRows ?? []).map(row => row.calculated_for_date)]);
    for (const date of datesToRecalculate) {
      await this.recalculateBestCompositionForDate(userId, `${date}T12:00:00`);
    }
  },

  async repairIncompleteSnapshots(userId: string, dates: string[]): Promise<void> {
    for (const date of dates) {
      await this.recalculateBestCompositionForDate(userId, `${date}T12:00:00`);
    }
  },

  /**
   * Recalculates body fat for the latest weight log.
   */
  async recalculateLatestWeight(userId: string): Promise<void> {
    try {
      const { data: weightLog, error } = await supabase
        .from('weight_logs')
        .select('measured_at')
        .eq('user_id', userId)
        .order('measured_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      if (!weightLog) return;

      await this.recalculateBestCompositionForDate(userId, new Date(weightLog.measured_at));
    } catch (error) {
      console.error('[BodyComp] Error in recalculateLatestWeight:', error);
    }
  },

  async getLatestBodyCompositionLog(userId: string): Promise<BodyCompositionLog | null> {
    const { data, error } = await supabase
      .from('body_composition_logs')
      .select('*')
      .eq('user_id', userId)
      .order('calculated_for_date', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    return data as BodyCompositionLog | null;
  },

  /**
   * Get full body composition for display (used by hooks)
   */
  async getBodyComposition(userId: string, weightKg: number): Promise<BodyCompositionResult | null> {
    try {
      const profile = await this.getUserProfile(userId);
      if (!profile || !profile.height_cm) return null;

      const measurements = await this.getAllLatestMeasurements(userId);
      const age = this.calculateAge(profile.date_of_birth);
      const sex = profile.sex;
      if (!age || (sex !== 'male' && sex !== 'female')) return null;

      return calculateBodyComposition({
        weightKg,
        heightCm: profile.height_cm,
        age,
        sex,
        measurements: {
          abdomen: measurements.abdomen,
          hips: measurements.hips,
          chest: measurements.chest,
          arm: measurements.arm,
          thigh: measurements.thigh,
        },
      });
    } catch (error) {
      console.error('[BodyComp] Error in getBodyComposition:', error);
      return null;
    }
  },

  async getUserProfile(userId: string): Promise<UserProfile | null> {
    const { data, error } = await supabase
      .from('users')
      .select('height_cm, date_of_birth, sex')
      .eq('id', userId)
      .single();

    if (error) return null;
    return data as UserProfile;
  },

  /**
   * Get ALL latest measurements for body composition algorithms.
   */
  async getAllLatestMeasurements(userId: string): Promise<AllMeasurements> {
    const relevantTypes: MeasurementType[] = ['abdomen', 'hips', 'chest', 'arm', 'thigh'];
    const measurements: AllMeasurements = {};

    const now = new Date();
    const windowStart = addDays(now, -RECENT_BODY_COMPOSITION_WINDOW_DAYS + 1).toISOString();

    const { data, error } = await supabase
      .from('body_measurements')
      .select('measurement_type, value_cm, measured_at')
      .eq('user_id', userId)
      .in('measurement_type', relevantTypes)
      .gte('measured_at', windowStart)
      .lt('measured_at', endOfLocalDay(now).toISOString())
      .order('measured_at', { ascending: false });

    if (error || !data) return measurements;

    data.forEach(row => {
      if (!measurements[row.measurement_type]) {
        measurements[row.measurement_type] = row.value_cm;
      }
    });

    return measurements;
  },

  calculateAge(dateOfBirth: string | null): number | null {
    if (!dateOfBirth) return null;
    const birth = new Date(dateOfBirth);
    const today = new Date();
    let age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
      age--;
    }
    return age;
  },

  /**
   * Count how many composition recalculations were updated today.
   */
  async getTodayRecalculationCount(userId: string): Promise<number> {
    const today = new Date();
    const startOfDay = startOfLocalDay(today).toISOString();
    const endOfDay = endOfLocalDay(today).toISOString();

    const { count, error } = await supabase
      .from('body_composition_logs')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('composition_calculated_at', startOfDay)
      .lt('composition_calculated_at', endOfDay);

    if (error) {
      console.error('[BodyComp] Error counting today recalculations:', error);
      return 0;
    }

    return count || 0;
  },

  /**
   * Manual recalculation with daily limit (max 2 per day).
   */
  async manualRecalculate(userId: string): Promise<ManualRecalculateResult> {
    const MAX_DAILY_RECALCULATIONS = 2;

    try {
      const todayCount = await this.getTodayRecalculationCount(userId);
      if (todayCount >= MAX_DAILY_RECALCULATIONS) {
        return {
          success: false,
          errorCode: 'limit_reached',
          errorValues: { count: MAX_DAILY_RECALCULATIONS },
        };
      }

      const result = await this.recalculateBestCompositionForDate(userId, new Date());

      if (result.reason === 'missing_weight') {
        return { success: false, errorCode: 'weight_missing' };
      }
      if (result.reason === 'height_missing' || result.reason === 'missing_profile') {
        return { success: false, errorCode: 'height_missing' };
      }
      if (result.reason === 'missing_bodyfat') {
        return { success: false, errorCode: 'insufficient_data' };
      }
      if (!result.success) {
        return { success: false, errorCode: 'unexpected_error' };
      }

      return { success: true, unchanged: result.unchanged };
    } catch (error) {
      console.error('[BodyComp] Error in manualRecalculate:', error);
      return {
        success: false,
        errorCode: 'unexpected_error',
      };
    }
  },

  /**
   * Called after measurements are inserted.
   * It recalculates composition for the target day without creating weight logs.
   */
  async checkAndTriggerRecalculateForMeasurements(userId: string, dateStr: string): Promise<void> {
    const targetDate = new Date(`${dateStr}T12:00:00`);
    await this.recalculateBestCompositionForDate(userId, targetDate);
  },
};
