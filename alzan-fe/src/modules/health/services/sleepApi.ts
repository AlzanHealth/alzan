import { supabase } from '../../../lib/supabaseClient';
import { SleepLog, SleepLogInsert, Insert } from '../../../types/requests.types';
import type { Row } from '../../../types/requests.types';

export type SleepSession = Row<'sleep_sessions'>;
export type SleepSessionInsert = Insert<'sleep_sessions'>;
export type SleepStageInterval = Row<'sleep_stage_intervals'>;

export const sleepApi = {
  // ── Legacy sleep_logs (manual entries) ──────────────────────
  async getLogs(userId: string, limit = 30) {
    const { data, error } = await supabase
      .from('sleep_logs')
      .select('*')
      .eq('user_id', userId)
      .order('date', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return data as SleepLog[];
  },

  async addLog(log: Omit<SleepLogInsert, 'id'>) {
    const { data, error } = await supabase.from('sleep_logs').insert(log).select().single();
    if (error) throw error;
    return data as SleepLog;
  },

  async deleteLog(id: string) {
    const { error } = await supabase.from('sleep_logs').delete().eq('id', id);
    if (error) throw error;
  },

  // ── New sleep_sessions (wearable / rich data) ───────────────
  async getSessions(userId: string, limit = 30) {
    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - 29);
    const fromDateKey = `${fromDate.getFullYear()}-${String(fromDate.getMonth() + 1).padStart(2, '0')}-${String(fromDate.getDate()).padStart(2, '0')}`;
    const { data, error } = await supabase
      .from('sleep_sessions')
      .select('*')
      .eq('user_id', userId)
      .eq('is_main_sleep', true)
      .gte('date', fromDateKey)
      .order('date', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return (data ?? []) as SleepSession[];
  },

  async addSession(session: Omit<SleepSessionInsert, 'id'>) {
    const { data, error } = await supabase.from('sleep_sessions').insert(session).select().single();
    if (error) throw error;
    return data as SleepSession;
  },

  async getSessionWithStages(sessionId: string) {
    const [sessionRes, stagesRes] = await Promise.all([
      supabase.from('sleep_sessions').select('*').eq('id', sessionId).single(),
      supabase
        .from('sleep_stage_intervals')
        .select('*')
        .eq('sleep_session_id', sessionId)
        .order('start_time', { ascending: true }),
    ]);

    if (sessionRes.error) throw sessionRes.error;
    if (stagesRes.error) throw stagesRes.error;

    return {
      session: sessionRes.data as SleepSession,
      stages: (stagesRes.data ?? []) as SleepStageInterval[],
    };
  },

  async deleteSession(id: string) {
    const { error } = await supabase.from('sleep_sessions').delete().eq('id', id);
    if (error) throw error;
  },
};
