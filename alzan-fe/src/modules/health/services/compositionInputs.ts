import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../../../types/requests.types';
import { COMPOSITION_MEASUREMENT_RANGES } from '../algorithms/bodyComposition';
import type { BodyCompositionMeasurementType } from '../algorithms/bodyCompositionDailyPlanner';

type MeasurementRow = Database['public']['Tables']['body_measurements']['Row'];
export type CompositionMeasurementRow = Pick<
  MeasurementRow,
  'id' | 'measurement_type' | 'value_cm' | 'measurement_protocol' | 'measured_at'
>;
interface CompositionMeasurementSlot {
  type: BodyCompositionMeasurementType;
  protocol?: string;
  min: number;
  max: number;
}

/** Fetch at most eight rows, independently of the amount or mix of historical data. */
export const loadLatestCompositionInputs = async (
  client: SupabaseClient<Database>,
  userId: string,
  cutoff: string,
  signal: AbortSignal,
) => {
  const slots: CompositionMeasurementSlot[] = [
    { type: 'waist', protocol: 'waist_iliac_crest', ...COMPOSITION_MEASUREMENT_RANGES.waist },
    { type: 'abdomen', ...COMPOSITION_MEASUREMENT_RANGES.abdomen },
    { type: 'hips', ...COMPOSITION_MEASUREMENT_RANGES.hips },
    { type: 'chest', ...COMPOSITION_MEASUREMENT_RANGES.chest },
    { type: 'arm', protocol: 'arm_relaxed_midpoint', ...COMPOSITION_MEASUREMENT_RANGES.arm },
    { type: 'arm', protocol: 'arm_flexed_max', ...COMPOSITION_MEASUREMENT_RANGES.arm },
    { type: 'thigh', ...COMPOSITION_MEASUREMENT_RANGES.thigh },
  ];
  const [weightsResult, measurementGroups] = await Promise.all([
    client
      .from('weight_logs')
      .select('id, measured_at, weight_kg')
      .eq('user_id', userId)
      .lte('measured_at', cutoff)
      .gt('weight_kg', 0)
      // PostgreSQL numeric allows Infinity and NaN; neither is a valid planner input.
      .lt('weight_kg', 'Infinity')
      .order('measured_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(1)
      .abortSignal(signal),
    Promise.all(
      slots.map(async slot => {
        let request = client
          .from('body_measurements')
          .select('id, measurement_type, measured_at, value_cm, measurement_protocol')
          .eq('user_id', userId)
          .eq('measurement_type', slot.type)
          .gte('value_cm', slot.min)
          .lte('value_cm', slot.max)
          .lte('measured_at', cutoff);
        if (slot.protocol) request = request.eq('measurement_protocol', slot.protocol);
        const { data, error } = await request
          .order('measured_at', { ascending: false })
          .order('id', { ascending: false })
          .limit(1)
          .abortSignal(signal);
        if (error) throw error;
        return data ?? [];
      }),
    ),
  ]);
  if (weightsResult.error) throw weightsResult.error;
  return { weights: weightsResult.data ?? [], measurements: measurementGroups.flat() };
};
