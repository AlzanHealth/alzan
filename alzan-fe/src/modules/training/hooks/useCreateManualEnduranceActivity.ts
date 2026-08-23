import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../../lib/supabaseClient';
import { invalidateTrainingCalendar } from '../../../lib/trainingQueryKeys';
import type { AdvancedSerializedSection, AdvancedSport } from '../helpers/advancedEnduranceSession.helper';

export type ManualEnduranceActivitySession = {
  sport_type: AdvancedSport;
  sport_subtype?: string | null;
  pool_type?: string | null;
  stroke?: string | null;
  start_time: string;
  end_time?: string | null;
  duration_s?: number | null;
  distance_m?: number | null;
  elev_gain_m?: number | null;
  avg_heart_rate?: number | null;
  max_heart_rate?: number | null;
  avg_power_w?: number | null;
  max_power_w?: number | null;
  avg_cadence?: number | null;
  calories_kcal?: number | null;
  rpe?: number | null;
  name: string;
  notes?: string | null;
  endurance_template_id?: string | null;
  timezone?: string | null;
  started_at_local?: string | null;
  ended_at_local?: string | null;
};

export type CreateManualEnduranceActivityInput = {
  session: ManualEnduranceActivitySession;
  sections: AdvancedSerializedSection[];
};

export const useCreateManualEnduranceActivity = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ session, sections }: CreateManualEnduranceActivityInput) => {
      const { data, error } = await supabase.rpc('create_manual_endurance_activity', {
        p_session: session,
        p_sections: sections,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: sessionId => {
      queryClient.invalidateQueries({ queryKey: ['enduranceSessions'] });
      queryClient.invalidateQueries({ queryKey: ['completedSessions'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['sessionDetail'] });
      queryClient.invalidateQueries({ queryKey: ['activitySession'] });
      queryClient.invalidateQueries({ queryKey: ['activitySessionSections'] });
      invalidateTrainingCalendar(queryClient);
      if (sessionId) {
        queryClient.invalidateQueries({ queryKey: ['activitySession', sessionId] });
        queryClient.invalidateQueries({ queryKey: ['activitySessionSections', sessionId] });
      }
    },
  });
};
