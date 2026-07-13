import { useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../../context/AuthContext';
import { supabase } from '../../../lib/supabaseClient';
import { bodyCompositionService, BodyCompositionLog } from '../services/bodyCompositionService';
import { healthQueryKeys } from './healthQueryKeys';

export const useBodyCompositionLogs = (limit = 100) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const attemptedRepairKeys = useRef(new Set<string>());

  const query = useQuery({
    queryKey: healthQueryKeys.composition(user?.id, limit),
    queryFn: async (): Promise<BodyCompositionLog[]> => {
      const { data, error } = await supabase
        .from('body_composition_logs')
        .select('*')
        .eq('user_id', user!.id)
        .order('calculated_for_date', { ascending: false })
        .limit(limit);

      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
  });

  useEffect(() => {
    if (!user?.id || !query.data) return;
    const repairRows = query.data
      .filter(log => log.calculation_status === 'partial' || log.calculation_status === 'stale')
      .filter(log => !attemptedRepairKeys.current.has(`${log.id}:${log.updated_at}`))
      .slice(0, 14);
    if (!repairRows.length) return;
    repairRows.forEach(log => attemptedRepairKeys.current.add(`${log.id}:${log.updated_at}`));
    void bodyCompositionService
      .repairIncompleteSnapshots(
        user.id,
        repairRows.map(log => log.calculated_for_date),
      )
      .then(() => queryClient.invalidateQueries({ queryKey: healthQueryKeys.composition(user.id, limit) }))
      .catch(error => console.error('[useBodyCompositionLogs] Snapshot repair failed', error));
  }, [limit, query.data, queryClient, user?.id]);

  return query;
};
