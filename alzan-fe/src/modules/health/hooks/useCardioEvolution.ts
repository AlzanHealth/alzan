import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../../context/AuthContext';
import { supabase } from '../../../lib/supabaseClient';
import type { ActivitySession } from '../../../types/requests.types';
import { healthQueryKeys } from './healthQueryKeys';
import { normalizeCardioSportType } from '../algorithms/cardioSportNormalization';
import {
  analyzeCardiacDrift,
  analyzeIntervalHeartRateRecovery,
  selectCardioStreamCandidates,
  type CardiacIntervalRecoveryResult,
  type CardiacDriftResult,
  type CardioActivity,
  type CardioStreamSample,
  type CardioZoneTime,
  summarizeCardioWeek,
} from '../algorithms/cardioEvolution';

const HISTORY_PAGE_SIZE = 1000;
const STREAM_PAGE_SIZE = 1000;
const ZONE_PAGE_SIZE = 1000;
const ZONE_SESSION_BATCH_SIZE = 100;

const getSportKey = (activity: Pick<CardioActivity, 'sport_type' | 'sport_subtype'>): string =>
  normalizeCardioSportType(activity.sport_type, activity.sport_subtype);

type CardioSessionSelection = Pick<
  ActivitySession,
  | 'id'
  | 'sport_type'
  | 'sport_subtype'
  | 'provider'
  | 'device_id'
  | 'start_time'
  | 'duration_s'
  | 'distance_m'
  | 'avg_heart_rate'
  | 'max_heart_rate'
  | 'avg_speed_m_per_s'
  | 'avg_power_w'
  | 'avg_temp_c'
  | 'elev_gain_m'
  | 'total_volume_kg'
  | 'total_sets'
  | 'total_reps'
  | 'workout_template_id'
>;

const toCardioActivity = (session: CardioSessionSelection): CardioActivity => ({
  id: session.id,
  sport_type: session.sport_type,
  sport_subtype: session.sport_subtype,
  provider: session.provider,
  device_id: session.device_id,
  start_time: session.start_time,
  duration_s: session.duration_s,
  distance_m: session.distance_m,
  avg_heart_rate: session.avg_heart_rate,
  max_heart_rate: session.max_heart_rate,
  avg_speed_m_per_s: session.avg_speed_m_per_s,
  avg_power_w: session.avg_power_w,
  avg_temp_c: session.avg_temp_c,
  elev_gain_m: session.elev_gain_m,
  total_volume_kg: session.total_volume_kg,
  total_sets: session.total_sets,
  total_reps: session.total_reps,
  workout_template_id: session.workout_template_id,
});

const loadStreamSamples = async (userId: string, sessionIds: string[]): Promise<CardioStreamSample[]> => {
  if (sessionIds.length === 0) return [];
  const samples: CardioStreamSample[] = [];
  for (let page = 0; ; page += 1) {
    const start = page * STREAM_PAGE_SIZE;
    const { data, error } = await supabase
      .from('activity_stream_samples')
      .select('session_id, stream_type, offset_s, timestamp, value')
      .eq('user_id', userId)
      .in('session_id', sessionIds)
      .in('stream_type', ['heart_rate', 'speed', 'power'])
      .order('session_id', { ascending: true })
      .order('offset_s', { ascending: true, nullsFirst: false })
      .order('stream_type', { ascending: true })
      .order('timestamp', { ascending: true, nullsFirst: false })
      .order('value', { ascending: true })
      .range(start, start + STREAM_PAGE_SIZE - 1);
    if (error) throw error;
    const pageRows = (data ?? []).flatMap(row =>
      row.stream_type === 'heart_rate' || row.stream_type === 'speed' || row.stream_type === 'power'
        ? [{ ...row, stream_type: row.stream_type }]
        : [],
    );
    samples.push(...pageRows);
    if (pageRows.length < STREAM_PAGE_SIZE) break;
  }
  return samples;
};

const loadZoneTimes = async (sessionIds: string[]): Promise<CardioZoneTime[]> => {
  const zoneTimes: CardioZoneTime[] = [];
  for (let batchStart = 0; batchStart < sessionIds.length; batchStart += ZONE_SESSION_BATCH_SIZE) {
    const batch = sessionIds.slice(batchStart, batchStart + ZONE_SESSION_BATCH_SIZE);
    for (let page = 0; ; page += 1) {
      const start = page * ZONE_PAGE_SIZE;
      const { data, error } = await supabase
        .from('activity_heart_rate_zones')
        .select('session_id, zone, duration_s')
        .in('session_id', batch)
        .order('session_id', { ascending: true })
        .order('zone', { ascending: true })
        .range(start, start + ZONE_PAGE_SIZE - 1);
      if (error) throw error;
      const rows = data ?? [];
      zoneTimes.push(...rows.map(row => ({ session_id: row.session_id, zone: row.zone, duration_s: row.duration_s })));
      if (rows.length < ZONE_PAGE_SIZE) break;
    }
  }
  return zoneTimes;
};

export const useCardioEvolution = () => {
  const { user } = useAuth();
  return useQuery({
    queryKey: [...healthQueryKeys.all(user?.id), 'cardio-evolution'],
    enabled: !!user?.id,
    queryFn: async () => {
      if (!user) {
        return {
          activities: [],
          weeklySummary: summarizeCardioWeek([], []),
          driftBySport: {},
          intervalRecoveryBySport: {},
          zoneDataError: false,
          streamDataError: false,
        };
      }
      const referenceDate = new Date();
      const sessionRows: CardioSessionSelection[] = [];
      for (let page = 0; ; page += 1) {
        const start = page * HISTORY_PAGE_SIZE;
        const { data: pageRows, error: sessionsError } = await supabase
          .from('activity_sessions')
          .select(
            'id, sport_type, sport_subtype, provider, device_id, start_time, duration_s, distance_m, avg_heart_rate, max_heart_rate, avg_speed_m_per_s, avg_power_w, avg_temp_c, elev_gain_m, total_volume_kg, total_sets, total_reps, workout_template_id',
          )
          .eq('user_id', user.id)
          .eq('status', 'completed')
          .eq('needs_strength_review', false)
          .or(
            'duplicate_resolution.is.null,duplicate_resolution.neq.pending,duplicate_score.lt.80,duplicate_score.is.null',
          )
          .not('end_time', 'is', null)
          .lte('start_time', referenceDate.toISOString())
          .order('start_time', { ascending: false })
          .order('id', { ascending: true })
          .range(start, start + HISTORY_PAGE_SIZE - 1);
        if (sessionsError) throw sessionsError;
        sessionRows.push(...(pageRows ?? []));
        if (!pageRows || pageRows.length < HISTORY_PAGE_SIZE) break;
      }
      const activities = sessionRows
        .map(toCardioActivity)
        .sort((left, right) => Date.parse(left.start_time) - Date.parse(right.start_time));
      const streamCandidates = selectCardioStreamCandidates(activities, referenceDate);
      const weekStart = new Date(referenceDate.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const weeklyIds = activities
        .filter(activity => Date.parse(activity.start_time) >= Date.parse(weekStart))
        .map(activity => activity.id);
      const [zoneResult, streamResult] = await Promise.all([
        loadZoneTimes(weeklyIds)
          .then(zoneTimes => ({ zoneTimes, failed: false }))
          .catch(() => ({ zoneTimes: [], failed: true })),
        loadStreamSamples(
          user.id,
          streamCandidates.map(candidate => candidate.activity.id),
        )
          .then(samples => ({ samples, failed: false }))
          .catch(() => ({ samples: [], failed: true })),
      ]);
      const zoneTimes = zoneResult.zoneTimes;
      const streamSamples = streamResult.samples;
      const driftBySport: Record<string, CardiacDriftResult | null> = {};
      const intervalRecoveryBySport: Record<string, CardiacIntervalRecoveryResult | null> = {};
      for (const candidate of streamCandidates) {
        const { activity } = candidate;
        const sportKey = getSportKey(activity);
        if (candidate.analyzeDrift) {
          driftBySport[sportKey] = analyzeCardiacDrift(
            streamSamples,
            activity.id,
            getSportKey(activity),
            activity.duration_s ?? 0,
            activity.start_time,
          );
        }
        if (candidate.analyzeIntervalRecovery) {
          intervalRecoveryBySport[sportKey] = analyzeIntervalHeartRateRecovery(
            streamSamples,
            activity.id,
            activity.duration_s ?? 0,
            activity.start_time,
          );
        }
      }
      return {
        activities,
        weeklySummary: summarizeCardioWeek(activities, zoneTimes, referenceDate),
        driftBySport,
        intervalRecoveryBySport,
        zoneDataError: zoneResult.failed,
        streamDataError: streamResult.failed,
      };
    },
    staleTime: 1000 * 60 * 3,
  });
};
