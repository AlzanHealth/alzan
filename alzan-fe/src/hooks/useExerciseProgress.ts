import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabaseClient';
import { ActivitySession } from '../types/requests.types';
import { ExerciseLoadType } from '../services/localization';
import { isStrengthExerciseSession } from '../modules/training/helpers/exerciseSessionFilter';
import { loadAllPages } from '../modules/training/helpers/loadAllPages';
import { useAuth } from '../context/AuthContext';

export type ExerciseProgressMetric = 'weight' | 'reps' | 'time';
type WeightQuality = 'valid' | 'missing' | 'invalid';
type WeightFlag =
  | 'zero_valid_mixed'
  | 'zero_suspect_external'
  | 'zero_suspect_assisted'
  | 'zero_irrelevant_bodyweight'
  | 'negative_invalid'
  | 'empty';

interface ExerciseSetRow {
  id: string;
  session_id: string;
  reps: number | null;
  weight_kg: number;
  duration_s: number | null;
  created_at: string;
  session: Pick<ActivitySession, 'id' | 'start_time' | 'sport_type' | 'status'> | null;
}

export interface ExerciseProgressPoint {
  sessionId: string;
  date: string;
  maxWeightKg: number;
  maxReps: number;
  repsAtMaxWeight: number;
  estimatedOneRepMaxKg: number;
  totalVolumeKg: number;
  maxDurationSeconds: number;
  totalDurationSeconds: number;
  setsCount: number;
  primaryMetricValue: number | null;
  quality: 'valid' | 'missing' | 'invalid';
  flags: WeightFlag[];
  isOutlierSuspicious: boolean;
}

export interface ExerciseProgressData {
  points: ExerciseProgressPoint[];
  diagnostics: {
    missingWeightCount: number;
    invalidWeightCount: number;
    suspiciousWeightZeroCount: number;
    outlierCount: number;
  };
}

export interface ExerciseValueEntry {
  id: string;
  sessionId: string;
  date: string;
  reps: number | null;
  weightKg: number;
  normalizedWeightKg: number | null;
  durationSeconds: number;
  isEmptyWeight: boolean;
  isEmptyReps: boolean;
  isEmptyDuration: boolean;
  weightQuality: WeightQuality;
  weightFlags: WeightFlag[];
  status: ActivitySession['status'] | null;
}

export interface ExerciseValueEntriesData {
  entries: ExerciseValueEntry[];
}

const getSetDurationSeconds = (set: Pick<ExerciseSetRow, 'duration_s' | 'reps'>): number => {
  if (typeof set.duration_s === 'number' && set.duration_s > 0) {
    return set.duration_s;
  }

  return Math.max(set.reps ?? 0, 0);
};

const loadExerciseSetRows = async (exerciseId: string, ascending: boolean, userId: string): Promise<ExerciseSetRow[]> =>
  loadAllPages(async (from, to) => {
    const { data, error } = await supabase
      .from('workout_sets')
      .select(
        `
          id,
          session_id,
          reps,
          weight_kg,
          duration_s,
          created_at,
          session:activity_sessions (
            id,
            start_time,
            sport_type,
            status
          )
        `,
      )
      .eq('exercise_id', exerciseId)
      .eq('user_id', userId)
      .order('created_at', { ascending })
      .order('id', { ascending })
      .range(from, to)
      .returns<ExerciseSetRow[]>();

    if (error) {
      throw error;
    }

    return data ?? [];
  });

export const normalizeWeightByLoadTypeForProgress = (
  loadType: ExerciseLoadType | null,
  weightKg: number,
): {
  value: number | null;
  quality: WeightQuality;
  flags: WeightFlag[];
} => {
  if (!Number.isFinite(weightKg)) {
    return {
      value: null,
      quality: 'missing',
      flags: ['empty'],
    };
  }

  if (weightKg < 0) {
    return {
      value: null,
      quality: 'invalid',
      flags: ['negative_invalid'],
    };
  }

  if (weightKg === 0) {
    if (loadType === 'mixed') {
      return {
        value: 0,
        quality: 'valid',
        flags: ['zero_valid_mixed'],
      };
    }

    if (loadType === 'external') {
      return {
        value: null,
        quality: 'missing',
        flags: ['zero_suspect_external'],
      };
    }

    if (loadType === 'assisted') {
      return {
        value: null,
        quality: 'missing',
        flags: ['zero_suspect_assisted'],
      };
    }

    if (loadType === 'bodyweight') {
      return {
        value: null,
        quality: 'missing',
        flags: ['zero_irrelevant_bodyweight'],
      };
    }
  }

  return {
    value: weightKg,
    quality: 'valid',
    flags: [],
  };
};

export const collectOutlierSessionIdsForProgress = (
  points: ExerciseProgressPoint[],
  metric: ExerciseProgressMetric,
): Set<ExerciseProgressPoint['sessionId']> => {
  if (points.length < 3 || metric === 'time') {
    return new Set();
  }

  const metricValue = (point: ExerciseProgressPoint) => (metric === 'reps' ? point.maxReps : point.maxWeightKg);
  const positivePoints = points.filter(point => metricValue(point) > 0);

  if (positivePoints.length < 3) {
    return new Set();
  }

  const values = positivePoints.map(point => metricValue(point));
  const sortedValues = [...values].sort((left, right) => left - right);

  const median = sortedValues[Math.floor(sortedValues.length / 2)];
  const deviations = sortedValues.map(value => Math.abs(value - median)).sort((left, right) => left - right);
  const mad = deviations[Math.floor(deviations.length / 2)];
  const robustDivisor = mad > 0 ? mad : 0;

  const suspiciousSessionIds = new Set<string>();

  if (robustDivisor > 0) {
    positivePoints.forEach(point => {
      const value = metricValue(point);
      const robustZ = (0.6745 * (value - median)) / robustDivisor;

      if (Math.abs(robustZ) > 3.5) {
        suspiciousSessionIds.add(point.sessionId);
      }
    });
  }

  let previousPositiveValue: number | null = null;
  positivePoints.forEach(point => {
    const value = metricValue(point);

    if (previousPositiveValue !== null) {
      const ratio = Math.max(value, previousPositiveValue) / Math.max(Math.min(value, previousPositiveValue), 0.0001);
      if (ratio >= 2.5) {
        suspiciousSessionIds.add(point.sessionId);
      }
    }

    previousPositiveValue = value;
  });

  return suspiciousSessionIds;
};

export const useExerciseProgress = (
  exerciseId?: string,
  metric: ExerciseProgressMetric = 'weight',
  loadType: ExerciseLoadType | null = null,
) => {
  const { user } = useAuth();
  const userId = user?.id;

  return useQuery({
    queryKey: ['exercise-progress', exerciseId, metric, loadType, userId],
    queryFn: async (): Promise<ExerciseProgressData> => {
      if (!exerciseId || !userId) {
        return {
          points: [],
          diagnostics: {
            missingWeightCount: 0,
            invalidWeightCount: 0,
            suspiciousWeightZeroCount: 0,
            outlierCount: 0,
          },
        };
      }

      const data = await loadExerciseSetRows(exerciseId, true, userId);

      const pointsBySession = new Map<string, ExerciseProgressPoint>();
      let missingWeightCount = 0;
      let invalidWeightCount = 0;
      let suspiciousWeightZeroCount = 0;

      (data ?? []).forEach(set => {
        if (!isStrengthExerciseSession(set.session?.sport_type)) {
          return;
        }

        if (set.session?.status && set.session.status !== 'completed') {
          return;
        }

        const setDate = set.session?.start_time ?? set.created_at;
        const setDurationSeconds = getSetDurationSeconds(set);
        const normalizedWeight = normalizeWeightByLoadTypeForProgress(loadType, set.weight_kg);
        const normalizedReps = Math.max(set.reps ?? 0, 0);
        const normalizedWeightValue = normalizedWeight.value;
        const estimatedOneRepMaxKg =
          normalizedWeightValue !== null && normalizedReps > 0 ? normalizedWeightValue * (1 + normalizedReps / 30) : 0;
        const volumeKg = normalizedWeightValue !== null ? normalizedWeightValue * normalizedReps : 0;
        const existing = pointsBySession.get(set.session_id);
        const hasValidWeight = normalizedWeightValue !== null;
        const hasValidDuration = setDurationSeconds > 0;
        const hasValidReps = normalizedReps > 0;

        if (!hasValidWeight) {
          if (normalizedWeight.quality === 'invalid') {
            invalidWeightCount += 1;
          } else {
            missingWeightCount += 1;
          }
        }

        if (
          normalizedWeight.flags.includes('zero_suspect_external') ||
          normalizedWeight.flags.includes('zero_suspect_assisted')
        ) {
          suspiciousWeightZeroCount += 1;
        }

        if (!existing) {
          if (
            (metric === 'weight' && !hasValidWeight) ||
            (metric === 'reps' && !hasValidReps) ||
            (metric === 'time' && !hasValidDuration)
          ) {
            return;
          }

          const primaryMetricValue =
            metric === 'time'
              ? hasValidDuration
                ? setDurationSeconds
                : null
              : metric === 'reps'
                ? hasValidReps
                  ? normalizedReps
                  : null
                : hasValidWeight
                  ? normalizedWeightValue
                  : null;

          pointsBySession.set(set.session_id, {
            sessionId: set.session_id,
            date: setDate,
            maxWeightKg: hasValidWeight ? normalizedWeightValue : 0,
            maxReps: hasValidReps ? normalizedReps : 0,
            repsAtMaxWeight: hasValidWeight ? normalizedReps : 0,
            estimatedOneRepMaxKg: hasValidWeight ? estimatedOneRepMaxKg : 0,
            totalVolumeKg: hasValidWeight ? volumeKg : 0,
            maxDurationSeconds: hasValidDuration ? setDurationSeconds : 0,
            totalDurationSeconds: hasValidDuration ? setDurationSeconds : 0,
            setsCount: 1,
            primaryMetricValue,
            quality: primaryMetricValue !== null ? 'valid' : metric === 'weight' ? normalizedWeight.quality : 'missing',
            flags: [...normalizedWeight.flags],
            isOutlierSuspicious: false,
          });
          return;
        }

        if (metric === 'weight') {
          if (!hasValidWeight) {
            normalizedWeight.flags.forEach(flag => {
              if (!existing.flags.includes(flag)) {
                existing.flags.push(flag);
              }
            });
            return;
          }

          const hasBetterWeight = normalizedWeightValue > existing.maxWeightKg;
          const hasSameWeightMoreReps =
            normalizedWeightValue === existing.maxWeightKg && normalizedReps > existing.repsAtMaxWeight;

          if (hasBetterWeight || hasSameWeightMoreReps) {
            existing.maxWeightKg = normalizedWeightValue;
            existing.repsAtMaxWeight = normalizedReps;
          }

          existing.estimatedOneRepMaxKg = Math.max(existing.estimatedOneRepMaxKg, estimatedOneRepMaxKg);
          existing.totalVolumeKg += volumeKg;
          existing.primaryMetricValue = existing.maxWeightKg;
        } else if (metric === 'reps') {
          if (!hasValidReps) {
            return;
          }

          existing.maxReps = Math.max(existing.maxReps, normalizedReps);
          existing.primaryMetricValue = existing.maxReps;
        } else {
          if (!hasValidDuration) {
            return;
          }

          existing.maxDurationSeconds = Math.max(existing.maxDurationSeconds, setDurationSeconds);
          existing.totalDurationSeconds += setDurationSeconds;
          existing.primaryMetricValue = existing.maxDurationSeconds;
        }

        normalizedWeight.flags.forEach(flag => {
          if (!existing.flags.includes(flag)) {
            existing.flags.push(flag);
          }
        });

        existing.setsCount += 1;
      });

      const sortedPoints = Array.from(pointsBySession.values()).sort(
        (left, right) => new Date(left.date).getTime() - new Date(right.date).getTime(),
      );

      const outlierSessionIds = collectOutlierSessionIdsForProgress(sortedPoints, metric);
      const points = sortedPoints.map(point => ({
        ...point,
        isOutlierSuspicious: outlierSessionIds.has(point.sessionId),
        primaryMetricValue:
          metric === 'time' ? point.maxDurationSeconds : metric === 'reps' ? point.maxReps : point.maxWeightKg,
      }));

      return {
        points,
        diagnostics: {
          missingWeightCount,
          invalidWeightCount,
          suspiciousWeightZeroCount,
          outlierCount: outlierSessionIds.size,
        },
      };
    },
    enabled: !!exerciseId && !!userId,
    staleTime: 1000 * 60 * 5,
  });
};

export const useExerciseWeightEntries = (
  exerciseId?: string,
  metric: ExerciseProgressMetric = 'weight',
  loadType: ExerciseLoadType | null = null,
) => {
  const { user } = useAuth();
  const userId = user?.id;

  return useQuery({
    queryKey: ['exercise-value-entries', exerciseId, metric, loadType, userId],
    queryFn: async (): Promise<ExerciseValueEntriesData> => {
      if (!exerciseId || !userId) {
        return { entries: [] };
      }

      const data = await loadExerciseSetRows(exerciseId, false, userId);

      const entries = (data ?? [])
        .filter(entry => isStrengthExerciseSession(entry.session?.sport_type))
        .map(entry => {
          const durationSeconds = getSetDurationSeconds(entry);
          const normalizedWeight = normalizeWeightByLoadTypeForProgress(loadType, entry.weight_kg);
          const normalizedWeightValue = normalizedWeight.value;

          return {
            id: entry.id,
            sessionId: entry.session_id,
            date: entry.session?.start_time ?? entry.created_at,
            reps: entry.reps,
            weightKg: entry.weight_kg,
            normalizedWeightKg: normalizedWeightValue,
            durationSeconds,
            isEmptyWeight: normalizedWeightValue === null,
            isEmptyReps: entry.reps == null || entry.reps <= 0,
            isEmptyDuration: durationSeconds <= 0,
            weightQuality: normalizedWeight.quality,
            weightFlags: normalizedWeight.flags,
            status: entry.session?.status ?? null,
          };
        });

      return { entries };
    },
    enabled: !!exerciseId && !!userId,
    staleTime: 1000 * 30,
  });
};

const invalidateExerciseQueries = async (
  queryClient: ReturnType<typeof useQueryClient>,
  exerciseId?: string,
  metric?: ExerciseProgressMetric,
) => {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ['exercise-progress', exerciseId, metric] }),
    queryClient.invalidateQueries({ queryKey: ['exercise-value-entries', exerciseId, metric] }),
    queryClient.invalidateQueries({ queryKey: ['exercise-progress', exerciseId] }),
    queryClient.invalidateQueries({ queryKey: ['exercise-value-entries', exerciseId] }),
    queryClient.invalidateQueries({ queryKey: ['exercise-catalog-usage'] }),
    queryClient.invalidateQueries({ queryKey: ['exercises-prs'] }),
    queryClient.invalidateQueries({ queryKey: ['sessionDetail'] }),
    queryClient.invalidateQueries({ queryKey: ['enduranceSessions'] }),
    queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
  ]);
};

export const useUpdateExerciseWeightEntry = (exerciseId?: string, metric: ExerciseProgressMetric = 'weight') => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ setId, value }: { setId: string; value: number }) => {
      const normalizedValue = Number.isFinite(value) ? Math.max(0, value) : 0;

      const updatePayload =
        metric === 'weight'
          ? { weight_kg: normalizedValue }
          : metric === 'reps'
            ? { reps: Math.round(normalizedValue) }
            : { reps: null, duration_s: Math.round(normalizedValue) };

      const { data, error } = await supabase
        .from('workout_sets')
        .update(updatePayload)
        .eq('id', setId)
        .select('id')
        .single();

      if (error) {
        throw error;
      }

      return data;
    },
    onSuccess: async () => {
      await invalidateExerciseQueries(queryClient, exerciseId, metric);
    },
  });
};

export const useDeleteExerciseWeightEntry = (exerciseId?: string, metric: ExerciseProgressMetric = 'weight') => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ setId }: { setId: string }) => {
      const { error } = await supabase.from('workout_sets').delete().eq('id', setId);

      if (error) {
        throw error;
      }
    },
    onSuccess: async () => {
      await invalidateExerciseQueries(queryClient, exerciseId, metric);
    },
  });
};
