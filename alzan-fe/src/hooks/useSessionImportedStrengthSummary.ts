import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabaseClient';

interface ImportedStrengthSummary {
  provider: string | null;
  sourceFileType: string | null;
  avgHeartRate: number | null;
  maxHeartRate: number | null;
  minHeartRate: number | null;
  caloriesKcal: number | null;
  totalSteps: number | null;
  recoveryTimeSeconds: number | null;
  epoc: number | null;
  pte: number | null;
  tss: number | null;
  trainingLoadPeak: number | null;
}

function readNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value.trim());
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export const useSessionImportedStrengthSummary = (sessionId?: string) =>
  useQuery({
    queryKey: ['sessionImportedStrengthSummary', sessionId],
    queryFn: async (): Promise<ImportedStrengthSummary | null> => {
      if (!sessionId) return null;

      const { data, error } = await supabase
        .from('activity_streams')
        .select('data')
        .eq('session_id', sessionId)
        .eq('source', 'strength_file_import')
        .eq('stream_type', 'heart_rate')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      if (!data?.data || typeof data.data !== 'object' || Array.isArray(data.data)) return null;

      const payload = data.data as Record<string, unknown>;
      return {
        provider: typeof payload.provider === 'string' ? payload.provider : null,
        sourceFileType: typeof payload.sourceFileType === 'string' ? payload.sourceFileType : null,
        avgHeartRate: readNumber(payload.avgHeartRate),
        maxHeartRate: readNumber(payload.maxHeartRate),
        minHeartRate: readNumber(payload.minHeartRate),
        caloriesKcal: readNumber(payload.caloriesKcal),
        totalSteps: readNumber(payload.totalSteps),
        recoveryTimeSeconds: readNumber(payload.recoveryTimeSeconds),
        epoc: readNumber(payload.epoc),
        pte: readNumber(payload.pte),
        tss: readNumber(payload.tss),
        trainingLoadPeak: readNumber(payload.trainingLoadPeak),
      };
    },
    enabled: !!sessionId,
  });
