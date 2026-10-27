/** Versioned derived snapshots. Raw/imported weight composition is never modified. */
import { supabase } from '../../../lib/supabaseClient';
import { Database } from '../../../types/requests.types';
import { calculatePersistedAbdominalHealth } from '../algorithms/abdominalHealth';
import {
  createCompositionRequestGuard,
  CompositionRefreshPausedError,
  reportCompositionRefreshFailure,
} from '../helpers/compositionRequestGuard';
import {
  DailyCompositionMeasurementInput,
  isBodyCompositionMeasurementType,
  planDailyBodyCompositionRecalculation,
} from '../algorithms/bodyCompositionDailyPlanner';

export type BodyCompositionLog = Database['public']['Tables']['body_composition_logs']['Row'];
type SnapshotInsert = Database['public']['Tables']['body_composition_logs']['Insert'];
export interface RecalculateDailyCompositionResult {
  success: boolean;
  unchanged?: boolean;
  reason?: string;
  log?: BodyCompositionLog;
}
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
const VERSION = 4;
const MAX_HISTORICAL_REPAIRS = 12;
const calculationGuard = createCompositionRequestGuard<RecalculateDailyCompositionResult>();
const historicalRepairUsers = new Set<string>();
const historicalRepairAfter = new Map<string, number>();
const localDate = (date: Date): string =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const dateInput = (date: Date | string): Date =>
  typeof date === 'string' ? new Date(date.length === 10 ? `${date}T12:00:00` : date) : date;
const dateEnd = (date: Date): Date => new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);
const ageAt = (birth: string | null, date: Date): number | null => {
  if (!birth) return null;
  const birthday = new Date(`${birth}T12:00:00`);
  if (!Number.isFinite(birthday.getTime())) return null;
  const beforeBirthday =
    date.getMonth() < birthday.getMonth() ||
    (date.getMonth() === birthday.getMonth() && date.getDate() < birthday.getDate());
  return date.getFullYear() - birthday.getFullYear() - Number(beforeBirthday);
};

export const bodyCompositionService = {
  async getCalculationContext(userId: string, signal?: AbortSignal) {
    const request = supabase.rpc('get_body_composition_context');
    if (signal) request.abortSignal(signal);
    const { data, error } = await request;
    if (error) throw error;
    const context = data?.[0];
    if (!context || context.user_id !== userId) throw new Error('SNAPSHOT_OWNER_MISMATCH');
    return context;
  },
  async getInputRevision(userId: string): Promise<number> {
    return (await this.getCalculationContext(userId)).revision;
  },

  async recalculateBestCompositionForDate(
    userId: string,
    targetDateInput?: Date | string,
  ): Promise<RecalculateDailyCompositionResult> {
    const date = targetDateInput === undefined ? new Date() : dateInput(targetDateInput);
    if (!Number.isFinite(date.getTime())) return { success: false, reason: 'invalid_date' };
    return calculationGuard.run(userId, localDate(date), signal =>
      this.calculateSnapshot(userId, signal, targetDateInput),
    );
  },

  async calculateSnapshot(
    userId: string,
    signal: AbortSignal,
    targetDateInput?: Date | string,
  ): Promise<RecalculateDailyCompositionResult> {
    // Read revision before every input. A concurrent change makes the commit fail,
    // including imports from another device and profile changes during calculation.
    for (let attempt = 0; attempt < 3; attempt++) {
      const context = await this.getCalculationContext(userId, signal);
      const revision = context.revision;
      const now = new Date(context.server_now);
      const targetDate = targetDateInput === undefined ? now : dateInput(targetDateInput);
      if (!Number.isFinite(targetDate.getTime()) || localDate(targetDate) > localDate(now)) {
        return { success: false, reason: 'future_date' };
      }
      const cutoff = new Date(Math.min(dateEnd(targetDate).getTime() - 1, now.getTime()));
      const [profile, weightsResult, measurementsResult] = await Promise.all([
        this.getUserProfile(userId, signal),
        supabase
          .from('weight_logs')
          .select('id, measured_at, weight_kg')
          .eq('user_id', userId)
          .lte('measured_at', cutoff.toISOString())
          .order('measured_at', { ascending: false })
          .limit(1000)
          .abortSignal(signal),
        supabase
          .from('body_measurements')
          .select('id, measurement_type, measured_at, value_cm, measurement_protocol')
          .eq('user_id', userId)
          .lte('measured_at', cutoff.toISOString())
          .order('measured_at', { ascending: false })
          .limit(1000)
          .abortSignal(signal),
      ]);
      if (weightsResult.error) throw weightsResult.error;
      if (measurementsResult.error) throw measurementsResult.error;
      const measurements: DailyCompositionMeasurementInput[] = [];
      for (const row of measurementsResult.data ?? []) {
        if (isBodyCompositionMeasurementType(row.measurement_type))
          measurements.push({
            id: row.id,
            type: row.measurement_type,
            measuredAt: row.measured_at,
            valueCm: row.value_cm,
            protocol: row.measurement_protocol,
          });
      }
      const sex = profile?.sex === 'male' || profile?.sex === 'female' ? profile.sex : null;
      const plan = planDailyBodyCompositionRecalculation({
        targetDate,
        now,
        weights: (weightsResult.data ?? []).map(row => ({
          id: row.id,
          measuredAt: row.measured_at,
          weightKg: row.weight_kg,
        })),
        measurements,
        profile: { heightCm: profile?.height_cm, age: ageAt(profile?.date_of_birth ?? null, cutoff), sex },
      });
      const result = plan.result;
      const abdominal = calculatePersistedAbdominalHealth({
        heightCm: profile?.height_cm,
        weightKg: plan.weightKgUsed,
        sex,
        measurements: plan.measurements,
      });
      const fat = result?.bodyFat;
      const muscle = result?.muscle;
      const heightRatio = abdominal.waistToHeight;
      const hipRatio = abdominal.waistToHip;
      const payload: SnapshotInsert = {
        user_id: userId,
        calculated_for_date: localDate(targetDate),
        input_revision: revision,
        source_weight_log_id: plan.sourceWeightLogId ?? null,
        weight_kg_used: plan.weightKgUsed ?? null,
        bmi: result?.bmi?.value ?? null,
        bodyfat_percent: fat?.percentage ?? null,
        bodyfat_method: fat?.method ?? null,
        bodyfat_precision_level: fat?.precisionLevel ?? null,
        bodyfat_formula: fat?.formulaUsed ?? null,
        bodyfat_inputs: fat?.inputsUsed ?? [],
        muscle_mass_kg: muscle?.massKg ?? null,
        muscle_percent: muscle?.percentage ?? null,
        muscle_method: muscle?.method ?? null,
        muscle_precision_level: muscle?.precisionLevel ?? null,
        muscle_formula: muscle?.formulaUsed ?? null,
        muscle_inputs: muscle?.inputsUsed ?? [],
        waist_to_height_ratio: heightRatio?.value ?? null,
        waist_to_height_category: heightRatio?.category ?? null,
        waist_to_height_formula: heightRatio?.formula ?? null,
        waist_to_height_inputs: heightRatio?.inputsUsed ?? [],
        waist_to_hip_ratio: hipRatio?.value ?? null,
        waist_to_hip_category: hipRatio?.category ?? null,
        waist_to_hip_formula: hipRatio?.formula ?? null,
        waist_to_hip_inputs: hipRatio?.inputsUsed ?? [],
        calculation_version: VERSION,
        calculation_status: result?.bmi && fat && muscle ? 'complete' : 'partial',
        input_snapshot: {
          inputRevision: revision,
          asOf: cutoff.toISOString(),
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          sourceWeightLogId: plan.sourceWeightLogId ?? null,
          weightMeasuredAt: weightsResult.data?.find(row => row.id === plan.sourceWeightLogId)?.measured_at ?? null,
          weightKg: plan.weightKgUsed ?? null,
          heightCm: profile?.height_cm ?? null,
          age: ageAt(profile?.date_of_birth ?? null, cutoff),
          sex,
          measurements: plan.selectedMeasurements.map(row => ({
            id: row.id ?? null,
            createdAt: row.createdAt ?? null,
            type: row.type,
            measuredAt: row.measuredAt,
            valueCm: row.valueCm,
            protocol: row.protocol ?? null,
          })),
        },
      };
      const { data, error } = await supabase
        .rpc('commit_body_composition_snapshot', {
          p_expected_revision: revision,
          p_snapshot: payload,
        })
        .abortSignal(signal);
      if (error?.code === '40001') continue;
      if (error) throw error;
      // A concurrent input change is returned by the RPC as an empty set. Retry
      // with a fresh revision instead of treating this expected race as success.
      if (!data?.[0]) continue;
      return { success: true, log: data?.[0] };
    }
    return { success: false, reason: 'inputs_changed' };
  },

  async invalidateAndRecalculateFromInput(userId: string, measuredAt: string): Promise<void> {
    calculationGuard.inputsChanged(userId);
    calculationGuard.assertAvailable(userId);
    // DB triggers already invalidate old/new dates and erase stale results atomically.
    const { data, error } = await supabase
      .from('body_composition_logs')
      .select('calculated_for_date')
      .eq('user_id', userId)
      .eq('calculation_status', 'stale')
      .order('calculated_for_date', { ascending: false })
      .limit(MAX_HISTORICAL_REPAIRS);
    if (error) throw error;
    const dates = new Set([localDate(new Date(measuredAt)), ...(data ?? []).map(row => row.calculated_for_date)]);
    for (const date of dates) {
      const result = await this.recalculateBestCompositionForDate(userId, date);
      if (!result.success) throw new CompositionRefreshPausedError(Date.now() + 30_000);
    }
  },

  async refreshSnapshots(userId: string, limit = 100, onHistoricalRepair?: () => void): Promise<BodyCompositionLog[]> {
    calculationGuard.assertAvailable(userId);
    const context = await this.getCalculationContext(userId);
    const serverNow = new Date(context.server_now);
    const { data, error } = await supabase
      .from('body_composition_logs')
      .select('*')
      .eq('user_id', userId)
      .order('calculated_for_date', { ascending: false })
      .limit(limit);
    if (error) throw error;
    const [weights, measurements] = await Promise.all([
      supabase
        .from('weight_logs')
        .select('measured_at')
        .eq('user_id', userId)
        .lte('measured_at', context.server_now)
        .order('measured_at', { ascending: false })
        .limit(limit),
      supabase
        .from('body_measurements')
        .select('measured_at')
        .eq('user_id', userId)
        .lte('measured_at', context.server_now)
        .order('measured_at', { ascending: false })
        .limit(limit),
    ]);
    if (weights.error) throw weights.error;
    if (measurements.error) throw measurements.error;
    const storedDates = new Set((data ?? []).map(row => row.calculated_for_date));
    const dates = new Set(
      (data ?? [])
        .filter(row => row.calculated_for_date <= localDate(serverNow))
        .filter(row => row.calculation_status === 'stale' || row.calculation_version !== VERSION)
        .map(row => row.calculated_for_date),
    );
    // Always refresh today on hydration: input expiry and imports may create no snapshot.
    for (const row of [...weights.data, ...measurements.data]) {
      const date = localDate(new Date(row.measured_at));
      if (!storedDates.has(date)) dates.add(date);
    }
    const today = localDate(serverNow);
    const currentResult = await this.recalculateBestCompositionForDate(userId, today);
    if (!currentResult.success) throw new CompositionRefreshPausedError(Date.now() + 30_000);
    dates.delete(today);
    // Current results are returned promptly; history repairs use bounded batches.
    if (dates.size && !historicalRepairUsers.has(userId) && Date.now() >= (historicalRepairAfter.get(userId) ?? 0)) {
      historicalRepairUsers.add(userId);
      historicalRepairAfter.set(userId, Date.now() + 60_000);
      const pendingDates = [...dates].sort().reverse().slice(0, MAX_HISTORICAL_REPAIRS);
      void (async () => {
        for (let offset = 0; offset < pendingDates.length; offset += 4) {
          const results = await Promise.all(
            pendingDates.slice(offset, offset + 4).map(date => this.recalculateBestCompositionForDate(userId, date)),
          );
          if (results.some(result => !result.success)) return;
        }
        onHistoricalRepair?.();
      })()
        .catch(reportCompositionRefreshFailure)
        .finally(() => historicalRepairUsers.delete(userId));
    }
    const { data: fresh, error: freshError } = await supabase
      .from('body_composition_logs')
      .select('*')
      .eq('user_id', userId)
      .neq('calculation_status', 'stale')
      .lte('calculated_for_date', localDate(serverNow))
      .order('calculated_for_date', { ascending: false })
      .limit(limit);
    if (freshError) throw freshError;
    return fresh;
  },

  async repairIncompleteSnapshots(userId: string, dates: string[]): Promise<void> {
    for (const date of dates) await this.recalculateBestCompositionForDate(userId, date);
  },
  async recalculateForWeight(userId: string, _id: string, _weightKg: number, measuredAt?: string): Promise<void> {
    await this.invalidateAndRecalculateFromInput(userId, measuredAt ?? new Date().toISOString());
  },
  async recalculateLatestWeight(userId: string): Promise<void> {
    await this.refreshSnapshots(userId);
  },
  async getLatestBodyCompositionLog(userId: string): Promise<BodyCompositionLog | null> {
    return (await this.refreshSnapshots(userId, 1))[0] ?? null;
  },
  async getUserProfile(userId: string, signal?: AbortSignal) {
    const request = supabase.from('users').select('height_cm, date_of_birth, sex').eq('id', userId);
    if (signal) request.abortSignal(signal);
    const { data, error } = await request.single();
    if (error) throw error;
    return data;
  },
  calculateAge(dateOfBirth: string | null): number | null {
    return ageAt(dateOfBirth, new Date());
  },
  async manualRecalculate(userId: string): Promise<ManualRecalculateResult> {
    try {
      const result = await this.recalculateBestCompositionForDate(userId);
      if (!result.success) return { success: false, errorCode: 'unexpected_error' };
      return { success: true };
    } catch {
      return { success: false, errorCode: 'unexpected_error' };
    }
  },
  async checkAndTriggerRecalculateForMeasurements(userId: string, date: string): Promise<void> {
    await this.invalidateAndRecalculateFromInput(userId, dateInput(date).toISOString());
  },
};
