import { addDays, format, isValid, parseISO } from 'date-fns';
import type { ActivitySession } from '../../../types/requests.types';
import { supabase } from '../../../lib/supabaseClient';
import { validateCopyTargetDate } from '../helpers/copyCompletedSession.helper';

type CopyCompletedSessionRpcClient = {
  rpc: (
    functionName: 'copy_completed_activity_session',
    args: { p_session_id: string; p_target_date: string },
  ) => Promise<{ data: string | null; error: { message: string } | null }>;
};

export type CopyCompletedSessionInput = {
  sessionId: string;
  sourceDate: string;
  targetDate: string;
};

export const getSessionLocalDate = (session: Pick<ActivitySession, 'start_time' | 'started_at_local'>): string => {
  const localDate = session.started_at_local?.slice(0, 10);
  const localDateValidation = localDate
    ? validateCopyTargetDate({ sourceDate: localDate, targetDate: localDate })
    : null;
  if (
    localDate &&
    localDateValidation &&
    'reason' in localDateValidation &&
    localDateValidation.reason === 'same_date'
  ) {
    return localDate;
  }

  const startDate = new Date(session.start_time);
  return isValid(startDate) ? format(startDate, 'yyyy-MM-dd') : '';
};

export const copyCompletedSession = async ({ sessionId, sourceDate, targetDate }: CopyCompletedSessionInput) => {
  const validation = validateCopyTargetDate({ sourceDate, targetDate });
  if (!validation.ok) {
    throw new Error(`COPY_SESSION_${validation.reason.toUpperCase()}`);
  }

  const { data, error } = await (supabase as unknown as CopyCompletedSessionRpcClient).rpc(
    'copy_completed_activity_session',
    { p_session_id: sessionId, p_target_date: targetDate },
  );

  if (error) throw error;
  if (!data) throw new Error('COPY_SESSION_EMPTY_RESULT');
  return data;
};

export const countActivitySessionsOnDate = async (userId: string, targetDate: string): Promise<number> => {
  const nextDate = format(addDays(parseISO(targetDate), 1), "yyyy-MM-dd'T'00:00:00");
  const { count, error } = await supabase
    .from('activity_sessions')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('started_at_local', `${targetDate}T00:00:00`)
    .lt('started_at_local', nextDate);

  if (error) throw error;
  return count ?? 0;
};
