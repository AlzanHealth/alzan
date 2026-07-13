import { supabase } from '../../../lib/supabaseClient';
import { BodyMeasurement, BodyMeasurementInsert, MeasurementType } from '../../../types/requests.types';

export const measurementApi = {
  async getMeasurements(userId: string, type?: MeasurementType | MeasurementType[], limit = 30) {
    console.log('[measurementApi.getMeasurements] Iniciando - userId:', userId, 'type:', type, 'limit:', limit);
    try {
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

      const { data, error } = await query;

      if (error) {
        console.error('[measurementApi.getMeasurements] Error:', error);
        throw error;
      }
      console.log('[measurementApi.getMeasurements] Éxito - registros:', data?.length);
      return data as BodyMeasurement[];
    } catch (err) {
      console.error('[measurementApi.getMeasurements] Exception:', err);
      throw err;
    }
  },

  async addMeasurement(measurement: Omit<BodyMeasurementInsert, 'id'>) {
    console.log(
      '[measurementApi.addMeasurement] Iniciando - type:',
      measurement.measurement_type,
      'value:',
      measurement.value_cm,
    );
    try {
      const { data, error } = await supabase.from('body_measurements').insert(measurement).select().single();

      if (error) {
        console.error('[measurementApi.addMeasurement] Error:', error);
        throw error;
      }
      console.log('[measurementApi.addMeasurement] Éxito - id:', data?.id);
      return data as BodyMeasurement;
    } catch (err) {
      console.error('[measurementApi.addMeasurement] Exception:', err);
      throw err;
    }
  },

  async updateMeasurement(id: string, updates: Partial<BodyMeasurement>) {
    console.log('[measurementApi.updateMeasurement] Iniciando - id:', id, 'updates:', Object.keys(updates));
    try {
      const { data, error } = await supabase.from('body_measurements').update(updates).eq('id', id).select().single();

      if (error) {
        console.error('[measurementApi.updateMeasurement] Error:', error);
        throw error;
      }
      console.log('[measurementApi.updateMeasurement] Éxito');
      return data as BodyMeasurement;
    } catch (err) {
      console.error('[measurementApi.updateMeasurement] Exception:', err);
      throw err;
    }
  },

  async deleteMeasurement(id: string) {
    console.log('[measurementApi.deleteMeasurement] Iniciando - id:', id);
    try {
      const { data, error } = await supabase
        .from('body_measurements')
        .delete()
        .eq('id', id)
        .select('user_id, measured_at')
        .single();

      if (error) {
        console.error('[measurementApi.deleteMeasurement] Error:', error);
        throw error;
      }
      console.log('[measurementApi.deleteMeasurement] Éxito');
      return data;
    } catch (err) {
      console.error('[measurementApi.deleteMeasurement] Exception:', err);
      throw err;
    }
  },

  /**
   * Check if a measurement of a specific type already exists for a given date
   * @param userId User ID
   * @param measurementType Type of measurement (abdomen, hips, chest, arm, thigh)
   * @param date Date to check (will compare only the day part)
   * @returns true if exists, false otherwise
   */
  async checkExistsForDay(userId: string, measurementType: MeasurementType, date: Date): Promise<boolean> {
    const startOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate()).toISOString();
    const endOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1).toISOString();

    const { count, error } = await supabase
      .from('body_measurements')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .in('measurement_type', [measurementType])
      .gte('measured_at', startOfDay)
      .lt('measured_at', endOfDay);

    if (error) {
      console.error('[measurementApi.checkExistsForDay] Error:', error);
      return false;
    }

    return (count || 0) > 0;
  },
};
