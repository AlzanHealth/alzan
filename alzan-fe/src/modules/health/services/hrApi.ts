import { supabase } from '../../../lib/supabaseClient';
import { RestingHRLog, RestingHRLogInsert } from '../../../types/requests.types';

export const hrApi = {
  async getLogs(userId: string, limit = 30) {
    console.log('[hrApi.getLogs] Iniciando - userId:', userId, 'limit:', limit);
    try {
      const fromDate = new Date();
      fromDate.setDate(fromDate.getDate() - 29);
      fromDate.setHours(0, 0, 0, 0);
      const { data, error } = await supabase
        .from('resting_hr_logs')
        .select('*')
        .eq('user_id', userId)
        .gte('measured_at', fromDate.toISOString())
        .order('measured_at', { ascending: false })
        .limit(limit);

      if (error) {
        console.error('[hrApi.getLogs] Error:', error);
        throw error;
      }
      console.log('[hrApi.getLogs] Éxito - registros:', data?.length);
      return data as RestingHRLog[];
    } catch (err) {
      console.error('[hrApi.getLogs] Exception:', err);
      throw err;
    }
  },

  async addLog(log: Omit<RestingHRLogInsert, 'id'>) {
    console.log('[hrApi.addLog] Iniciando - bpm:', log.resting_hr_bpm);
    try {
      const { data, error } = await supabase.from('resting_hr_logs').insert(log).select().single();

      if (error) {
        console.error('[hrApi.addLog] Error:', error);
        throw error;
      }
      console.log('[hrApi.addLog] Éxito - id:', data?.id);
      return data as RestingHRLog;
    } catch (err) {
      console.error('[hrApi.addLog] Exception:', err);
      throw err;
    }
  },

  async deleteLog(id: string) {
    console.log('[hrApi.deleteLog] Iniciando - id:', id);
    try {
      const { error } = await supabase.from('resting_hr_logs').delete().eq('id', id);

      if (error) {
        console.error('[hrApi.deleteLog] Error:', error);
        throw error;
      }
      console.log('[hrApi.deleteLog] Éxito');
    } catch (err) {
      console.error('[hrApi.deleteLog] Exception:', err);
      throw err;
    }
  },
};
