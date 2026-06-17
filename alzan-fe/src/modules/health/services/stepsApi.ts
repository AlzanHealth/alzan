import { supabase } from '../../../lib/supabaseClient';
import { DailySteps } from '../../../types/requests.types';

export type StepsRow = Pick<DailySteps, 'id' | 'date' | 'total_steps' | 'source' | 'is_manual' | 'source_package'>;

export const stepsApi = {
  /**
   * Fetch daily step rows on/after a given date (yyyy-MM-dd), oldest first.
   */
  async getRange(userId: string, fromDate: string): Promise<StepsRow[]> {
    const { data, error } = await supabase
      .from('daily_steps')
      .select('id, date, total_steps, source, is_manual, source_package')
      .eq('user_id', userId)
      .gte('date', fromDate)
      .order('date', { ascending: true });

    if (error) {
      console.error('[stepsApi.getRange] Error:', error);
      throw error;
    }
    return (data as StepsRow[]) ?? [];
  },

  /**
   * Manual step total for a specific day, if one exists.
   */
  async getManualForDate(userId: string, dateStr: string): Promise<StepsRow | null> {
    const { data, error } = await supabase
      .from('daily_steps')
      .select('id, date, total_steps, source, is_manual, source_package')
      .eq('user_id', userId)
      .eq('date', dateStr)
      .eq('source', 'manual')
      .is('source_package', null)
      .maybeSingle();

    if (error) {
      console.error('[stepsApi.getManualForDate] Error:', error);
      throw error;
    }
    return (data as StepsRow) ?? null;
  },

  /**
   * Insert or overwrite the manual step total for a day.
   * One manual value per day, scoped to source_package IS NULL.
   */
  async upsertManual(params: { userId: string; date: string; steps: number; timezone: string }): Promise<void> {
    const existing = await this.getManualForDate(params.userId, params.date);
    const payload = {
      timezone: params.timezone,
      source: 'manual' as const,
      source_package: null,
      total_steps: params.steps,
      is_manual: true,
      data_quality: 'manual' as const,
      synced_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    if (existing) {
      const { error } = await supabase.from('daily_steps').update(payload).eq('id', existing.id);
      if (error) {
        console.error('[stepsApi.upsertManual] Update error:', error);
        throw error;
      }
      return;
    }

    const { error } = await supabase.from('daily_steps').insert({
      ...payload,
      user_id: params.userId,
      date: params.date,
    });

    if (error) {
      console.error('[stepsApi.upsertManual] Insert error:', error);
      throw error;
    }
  },
};
