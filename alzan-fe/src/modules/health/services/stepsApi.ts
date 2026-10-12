import { supabase } from '../../../lib/supabaseClient';
import { DailySteps } from '../../../types/requests.types';
import { format } from 'date-fns';
import { loadAllSuuntoPages } from '../helpers/suuntoHealthPeriods';

export type StepsRow = Pick<DailySteps, 'id' | 'date' | 'total_steps' | 'source' | 'is_manual' | 'source_package'>;

export const stepsApi = {
  /**
   * Fetch all daily step rows from the given date through today, oldest first.
   */
  async getRange(userId: string, fromDate: string): Promise<StepsRow[]> {
    const today = format(new Date(), 'yyyy-MM-dd');
    return loadAllSuuntoPages((offset, pageSize) =>
      supabase
        .from('daily_steps')
        .select('id, date, total_steps, source, is_manual, source_package')
        .eq('user_id', userId)
        .gte('date', fromDate)
        .lte('date', today)
        .order('date', { ascending: true })
        .order('id', { ascending: true })
        .range(offset, offset + pageSize - 1),
    );
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
   * Manual step totals for an inclusive date range.
   */
  async getManualForRange(userId: string, fromDate: string, toDate: string): Promise<StepsRow[]> {
    const { data, error } = await supabase
      .from('daily_steps')
      .select('id, date, total_steps, source, is_manual, source_package')
      .eq('user_id', userId)
      .eq('source', 'manual')
      .is('source_package', null)
      .gte('date', fromDate)
      .lte('date', toDate)
      .order('date', { ascending: true });

    if (error) {
      console.error('[stepsApi.getManualForRange] Error:', error);
      throw error;
    }
    return (data as StepsRow[]) ?? [];
  },

  /**
   * Insert or overwrite the manual step total for a day.
   * One manual value per day, scoped to source_package IS NULL.
   */
  async upsertManual(params: { date: string; steps: number; timezone: string }): Promise<void> {
    const { error } = await supabase.rpc('upsert_manual_daily_steps', {
      p_date: params.date,
      p_steps: params.steps,
      p_timezone: params.timezone,
    });
    if (error) {
      console.error('[stepsApi.upsertManual] Error:', error);
      throw error;
    }
  },
};
