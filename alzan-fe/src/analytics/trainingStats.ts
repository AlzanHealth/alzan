import { supabase } from '../lib/supabaseClient';
import { SportType } from '../types/requests.types';
import { DateRange } from './types';
import { startOfWeek, format, eachWeekOfInterval } from 'date-fns';
import { getLocalizedExerciseName } from '../services/localization';

export type WeeklyTrainingVolume = {
  weekStart: string;
  totalDurationHours: number;
  totalDistanceKm: number;
  strengthSessions: number;
  enduranceSessions: number; // Others
};

export type TrendPoint = {
  date: string;
  value: number;
};

export type StrengthExerciseStat = {
  exerciseId: string;
  exerciseName: string;
  oneRepMax: number; // 1RM estimate
  maxWeight: number; // Max weight lifted
  totalVolume: number; // Sets * Reps * Weight
  totalSets: number;
  history: TrendPoint[]; // For sparklines
};

export type EnduranceStats = {
  totalDistanceKm: number;
  avgPaceMinKm?: number; // Running
  avgSpeedKmH?: number; // Cycling
  avgPace100m?: string; // Swimming MM:SS
  weeklyDistance: TrendPoint[];
  weeklyPace: TrendPoint[];
};

// --- MOCKS ---

export async function getWeeklyTrainingVolume(
  userId: string,
  range: DateRange,
  useMock: boolean = false,
): Promise<WeeklyTrainingVolume[]> {
  console.log('[trainingStats.getWeeklyTrainingVolume] Iniciando');
  if (useMock) {
    console.log('[trainingStats.getWeeklyTrainingVolume] Usando mock data');
    return [
      {
        weekStart: '2025-11-20',
        totalDurationHours: 3,
        totalDistanceKm: 15,
        strengthSessions: 2,
        enduranceSessions: 1,
      },
      {
        weekStart: '2025-11-27',
        totalDurationHours: 4.5,
        totalDistanceKm: 22,
        strengthSessions: 3,
        enduranceSessions: 2,
      },
    ];
  }

  try {
    const { data: sessions, error } = await supabase
      .from('activity_sessions')
      .select('start_time, duration_s, distance_m, sport_type')
      .eq('user_id', userId)
      .gte('start_time', range.startDate.toISOString())
      .lte('start_time', range.endDate.toISOString())
      .order('start_time', { ascending: true });

    if (error) {
      console.error('[trainingStats.getWeeklyTrainingVolume] Error:', error);
      throw error;
    }
    console.log('[trainingStats.getWeeklyTrainingVolume] Sesiones:', sessions?.length);

    const weeks = eachWeekOfInterval({ start: range.startDate, end: range.endDate }, { weekStartsOn: 1 });
    const result: WeeklyTrainingVolume[] = weeks.map(weekStart => ({
      weekStart: format(weekStart, 'yyyy-MM-dd'),
      totalDurationHours: 0,
      totalDistanceKm: 0,
      strengthSessions: 0,
      enduranceSessions: 0,
    }));

    sessions?.forEach(session => {
      const date = new Date(session.start_time);
      const sessionWeekStart = format(startOfWeek(date, { weekStartsOn: 1 }), 'yyyy-MM-dd');
      const weekStat = result.find(w => w.weekStart === sessionWeekStart);

      if (weekStat) {
        weekStat.totalDurationHours += (session.duration_s || 0) / 3600;
        weekStat.totalDistanceKm += (session.distance_m || 0) / 1000;
        if (session.sport_type === 'strength' || session.sport_type === 'gym') {
          weekStat.strengthSessions += 1;
        } else {
          weekStat.enduranceSessions += 1;
        }
      }
    });

    console.log('[trainingStats.getWeeklyTrainingVolume] Éxito - semanas:', result.length);
    return result.map(r => ({
      ...r,
      totalDurationHours: Number(r.totalDurationHours.toFixed(1)),
      totalDistanceKm: Number(r.totalDistanceKm.toFixed(1)),
    }));
  } catch (err) {
    console.error('[trainingStats.getWeeklyTrainingVolume] Exception:', err);
    throw err;
  }
}

export async function getStrengthExerciseStats(
  userId: string,
  range: DateRange,
  useMock: boolean = false,
): Promise<StrengthExerciseStat[]> {
  console.log('[trainingStats.getStrengthExerciseStats] Iniciando');
  if (useMock) {
    console.log('[trainingStats.getStrengthExerciseStats] Usando mock data');
    return [
      {
        exerciseId: '1',
        exerciseName: 'Press Banca',
        oneRepMax: 100,
        maxWeight: 80,
        totalVolume: 5000,
        totalSets: 12,
        history: [],
      },
      {
        exerciseId: '2',
        exerciseName: 'Sentadilla',
        oneRepMax: 140,
        maxWeight: 120,
        totalVolume: 8000,
        totalSets: 15,
        history: [],
      },
    ];
  }

  try {
    const { data: sessions, error: sErr } = await supabase
      .from('activity_sessions')
      .select('id, start_time')
      .eq('user_id', userId)
      .eq('sport_type', 'strength')
      .gte('start_time', range.startDate.toISOString())
      .lte('start_time', range.endDate.toISOString());

    if (sErr) {
      console.error('[trainingStats.getStrengthExerciseStats] Error sesiones:', sErr);
      throw sErr;
    }

    const sessionIds = sessions?.map(s => s.id) || [];
    if (sessionIds.length === 0) {
      console.log('[trainingStats.getStrengthExerciseStats] Sin sesiones');
      return [];
    }
    console.log('[trainingStats.getStrengthExerciseStats] Sesiones:', sessionIds.length);

    const { data: sets, error } = await supabase
      .from('workout_sets')
      .select('*, exercises(base_name_es, base_name_en)')
      .in('session_id', sessionIds)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('[trainingStats.getStrengthExerciseStats] Error sets:', error);
      throw error;
    }
    if (!sets) return [];
    console.log('[trainingStats.getStrengthExerciseStats] Sets:', sets.length);

    const statsMap = new Map<string, StrengthExerciseStat>();

    sets.forEach(set => {
      const exerciseName = set.exercises ? getLocalizedExerciseName(set.exercises) : 'Desconocido';
      const exerciseId = set.exercise_id;

      if (!statsMap.has(exerciseId)) {
        statsMap.set(exerciseId, {
          exerciseId,
          exerciseName,
          oneRepMax: 0,
          maxWeight: 0,
          totalVolume: 0,
          totalSets: 0,
          history: [],
        });
      }

      const stat = statsMap.get(exerciseId)!;
      stat.totalSets += 1;
      const weight = set.weight_kg || 0;
      const reps = set.reps || 0;
      stat.totalVolume += weight * reps;
      if (weight > stat.maxWeight) stat.maxWeight = weight;

      const epley = weight * (1 + reps / 30);
      if (epley > stat.oneRepMax) stat.oneRepMax = epley;
    });

    console.log('[trainingStats.getStrengthExerciseStats] Éxito - ejercicios:', statsMap.size);
    return Array.from(statsMap.values())
      .sort((a, b) => b.totalSets - a.totalSets)
      .slice(0, 5)
      .map(s => ({
        ...s,
        oneRepMax: Math.round(s.oneRepMax),
        maxWeight: Math.round(s.maxWeight),
      }));
  } catch (err) {
    console.error('[trainingStats.getStrengthExerciseStats] Exception:', err);
    throw err;
  }
}

export async function getEnduranceStats(
  userId: string,
  range: DateRange,
  sportType: SportType,
  useMock: boolean = false,
): Promise<EnduranceStats> {
  if (useMock) {
    return {
      totalDistanceKm: 120.5,
      avgPaceMinKm: 5.3,
      weeklyDistance: [
        { date: '2025-11-20', value: 40 },
        { date: '2025-11-27', value: 45 },
      ],
      weeklyPace: [
        { date: '2025-11-20', value: 5.45 },
        { date: '2025-11-27', value: 5.15 },
      ],
    };
  }

  const { data: sessions, error } = await supabase
    .from('activity_sessions')
    .select('*')
    .eq('user_id', userId)
    .eq('sport_type', sportType)
    .gte('start_time', range.startDate.toISOString())
    .lte('start_time', range.endDate.toISOString())
    .order('start_time', { ascending: true });

  if (error) throw error;

  let totalDurationS = 0;
  let totalDistanceM = 0;
  const weeklyData = new Map<string, { dist: number; dur: number }>();

  sessions?.forEach(s => {
    totalDurationS += s.duration_s || 0;
    totalDistanceM += s.distance_m || 0;

    const weekStart = format(startOfWeek(new Date(s.start_time), { weekStartsOn: 1 }), 'yyyy-MM-dd');
    const current = weeklyData.get(weekStart) || { dist: 0, dur: 0 };
    current.dist += s.distance_m || 0;
    current.dur += s.duration_s || 0;
    weeklyData.set(weekStart, current);
  });

  const weeklyDistance: TrendPoint[] = [];
  const weeklyPace: TrendPoint[] = [];

  // Fill gaps? For now just present weeks
  weeklyData.forEach((val, key) => {
    weeklyDistance.push({ date: key, value: Number((val.dist / 1000).toFixed(1)) });
    if (sportType === 'running' && val.dist > 0) {
      // min/km
      const pace = val.dur / 60 / (val.dist / 1000);
      weeklyPace.push({ date: key, value: Number(pace.toFixed(2)) });
    } else if (sportType === 'cycling' && val.dur > 0) {
      // km/h
      const speed = val.dist / 1000 / (val.dur / 3600);
      weeklyPace.push({ date: key, value: Number(speed.toFixed(1)) });
    }
  });

  const totalDistanceKm = Number((totalDistanceM / 1000).toFixed(1));
  let avgPaceMinKm = undefined;
  let avgSpeedKmH = undefined;

  if (totalDistanceM > 0) {
    if (sportType === 'running') {
      const pace = totalDurationS / 60 / (totalDistanceM / 1000);
      avgPaceMinKm = Number(pace.toFixed(2));
    } else if (sportType === 'cycling') {
      const speed = totalDistanceM / 1000 / (totalDurationS / 3600);
      avgSpeedKmH = Number(speed.toFixed(1));
    }
  }

  return {
    totalDistanceKm,
    avgPaceMinKm,
    avgSpeedKmH,
    weeklyDistance,
    weeklyPace,
  };
}
