import { supabase } from '../../../lib/supabaseClient';
import { WeightLog, WeightLogInsert } from '../../../types/requests.types';

export const weightApi = {
  async getLogs(userId: string, limit = 30) {
    console.log('[weightApi.getLogs] Iniciando - userId:', userId, 'limit:', limit);
    try {
      const { data, error } = await supabase
        .from('weight_logs')
        .select('*')
        .eq('user_id', userId)
        .order('measured_at', { ascending: false })
        .limit(limit);

      if (error) {
        console.error('[weightApi.getLogs] Error:', error);
        throw error;
      }
      console.log('[weightApi.getLogs] Éxito - registros:', data?.length);
      return data as WeightLog[];
    } catch (err) {
      console.error('[weightApi.getLogs] Exception:', err);
      throw err;
    }
  },

  async addLog(log: Omit<WeightLogInsert, 'id' | 'created_at'>) {
    console.log('[weightApi.addLog] Iniciando - peso:', log.weight_kg, 'kg');
    try {
      const { data, error } = await supabase.from('weight_logs').insert(log).select().single();

      if (error) {
        console.error('[weightApi.addLog] Error:', error);
        throw error;
      }
      console.log('[weightApi.addLog] Éxito - id:', data?.id);
      return data as WeightLog;
    } catch (err) {
      console.error('[weightApi.addLog] Exception:', err);
      throw err;
    }
  },

  async updateLog(id: string, updates: Partial<WeightLog>) {
    console.log('[weightApi.updateLog] Iniciando - id:', id, 'updates:', Object.keys(updates));
    try {
      const { data, error } = await supabase.from('weight_logs').update(updates).eq('id', id).select().single();

      if (error) {
        console.error('[weightApi.updateLog] Error:', error);
        throw error;
      }
      console.log('[weightApi.updateLog] Éxito');
      return data as WeightLog;
    } catch (err) {
      console.error('[weightApi.updateLog] Exception:', err);
      throw err;
    }
  },

  async deleteLog(id: string) {
    console.log('[weightApi.deleteLog] Iniciando - id:', id);
    try {
      const { data, error } = await supabase
        .from('weight_logs')
        .delete()
        .eq('id', id)
        .select('user_id, measured_at')
        .single();

      if (error) {
        console.error('[weightApi.deleteLog] Error:', error);
        throw error;
      }
      console.log('[weightApi.deleteLog] Éxito');
      return data;
    } catch (err) {
      console.error('[weightApi.deleteLog] Exception:', err);
      throw err;
    }
  },

  /**
   * Check if a weight log already exists for a given date
   * @param userId User ID
   * @param date Date to check (will compare only the day part)
   * @returns true if exists, false otherwise
   */
  async checkExistsForDay(userId: string, date: Date): Promise<boolean> {
    const startOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate()).toISOString();
    const endOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1).toISOString();

    const { count, error } = await supabase
      .from('weight_logs')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('measured_at', startOfDay)
      .lt('measured_at', endOfDay);

    if (error) {
      console.error('[weightApi.checkExistsForDay] Error:', error);
      return false;
    }

    return (count || 0) > 0;
  },
};
