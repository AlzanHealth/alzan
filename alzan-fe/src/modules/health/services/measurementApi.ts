import { supabase } from '../../../lib/supabaseClient';
import { BodyMeasurement, BodyMeasurementInsert, MeasurementType } from '../../../types/requests.types';

export const measurementApi = {
  async getMeasurements(
    userId: string,
    type?: MeasurementType | MeasurementType[],
    limit = 30,
    protocol?: string | null,
  ) {
    let query = supabase
      .from('body_measurements')
      .select('*')
      .eq('user_id', userId)
      .order('measured_at', { ascending: false })
      .limit(limit);

    if (type) {
      if (Array.isArray(type)) {
        query = query.in('measurement_type', type);
      } else {
        query = query.eq('measurement_type', type);
      }
    }

    if (protocol !== undefined) {
      query = protocol === null ? query.is('measurement_protocol', null) : query.eq('measurement_protocol', protocol);
    }
    const { data, error } = await query;

    if (error) {
      throw error;
    }
    return data as BodyMeasurement[];
  },

  async addMeasurement(measurement: Omit<BodyMeasurementInsert, 'id'>) {
    const { data, error } = await supabase.from('body_measurements').insert(measurement).select().single();

    if (error) {
      throw error;
    }
    return data as BodyMeasurement;
  },

  async updateMeasurement(id: string, updates: Partial<BodyMeasurement>) {
    const { data, error } = await supabase.from('body_measurements').update(updates).eq('id', id).select().single();

    if (error) {
      throw error;
    }
    return data as BodyMeasurement;
  },

  async deleteMeasurement(id: string) {
    const { data, error } = await supabase
      .from('body_measurements')
      .delete()
      .eq('id', id)
      .select('user_id, measured_at')
      .single();

    if (error) {
      throw error;
    }
    return data;
  },

  /**
   * Check if a measurement of a specific type already exists for a given date
   * @param userId User ID
   * @param measurementType Type of measurement (abdomen, hips, chest, arm, thigh)
   * @param date Date to check (will compare only the day part)
   * @returns true if exists, false otherwise
   */
  async checkExistsForDay(
    userId: string,
    measurementType: MeasurementType,
    date: Date,
    protocol?: string | null,
  ): Promise<boolean> {
    const startOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate()).toISOString();
    const endOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1).toISOString();

    let query = supabase
      .from('body_measurements')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .in('measurement_type', [measurementType])
      .gte('measured_at', startOfDay)
      .lt('measured_at', endOfDay);

    if (measurementType === 'abdomen' && protocol === 'abdomen_navel') {
      query = query.or('measurement_protocol.eq.abdomen_navel,measurement_protocol.is.null');
    } else {
      query = protocol ? query.eq('measurement_protocol', protocol) : query.is('measurement_protocol', null);
    }
    const { count, error } = await query;

    if (error) throw error;

    return (count || 0) > 0;
  },
};
