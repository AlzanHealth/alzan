import type { CardioActivity, CardioConfidence, CardioPeriod } from './cardioEvolution';
import {
  isSameCardioSportSubtype,
  normalizeCardioSportSubtype,
  normalizeCardioSportType,
} from './cardioSportNormalization';
import { normalizeSportType } from '../../../utils/sportTypeNormalization';

export type CardioLap = {
  session_id: string;
  lap_type: 'manual' | 'auto' | 'distance' | 'time' | 'unknown';
  split_group: string;
  split_distance_m: number | null;
  distance_m: number | null;
  duration_s: number | null;
  avg_heart_rate: number | null;
  avg_pace_s_per_km: number | null;
};

export type CardioWorkoutSet = {
  session_id: string;
  exercise_id: string;
  weight_kg: number;
  reps: number;
  rpe: number | null;
  is_warmup: boolean;
  set_type: string;
};

export type CardioExerciseName = { id: string; base_name_es: string; base_name_en: string | null };

export type CardioAssessmentLevel = 'A' | 'B' | 'C' | 'D' | 'E' | 'F';
export type CardioDimensionStatus = 'improving' | 'declining' | 'stable' | 'descriptive' | 'insufficient';

export type CardioPeriodTotals = {
  sessionCount: number;
  sessionIds: string[];
  sessionsWithHeartRate: number;
  medianHeartRateBpm: number | null;
  sessionsWithMaximumHeartRate: number;
  medianMaximumHeartRateBpm: number | null;
  durationMinutes: number | null;
  durationSessionCount: number;
  distanceKm: number | null;
  distanceSessionCount: number;
  elevationGainM: number | null;
  elevationSessionCount: number;
  strengthVolumeKg: number | null;
  strengthVolumeSessionCount: number;
  strengthSetCount: number | null;
  strengthSetSessionCount: number;
  strengthRepCount: number | null;
  strengthRepSessionCount: number;
};

export type CardioPerformanceDimension = {
  status: CardioDimensionStatus;
  metric: 'speed' | 'power' | 'lap_pace' | null;
  unit: 'm/s' | 'W' | 's/km' | 's/100m' | null;
  metricSource: 'recorded' | 'distance_duration' | 'matched_laps' | 'mixed' | null;
  recentValue: number | null;
  previousValue: number | null;
  valuesSource: 'similar_heart_rate_pairs' | 'matched_sessions' | 'period_medians';
  changePercent: number | null;
  recentSessionCount: number;
  previousSessionCount: number;
  matchedPairCount: number;
  changePairCount: number;
  comparedSplitDistanceM: number | null;
  matchedAtSimilarHeartRatePairCount: number;
  matchedContextPairCount: number;
  recentPairSpanDays: number;
  previousPairSpanDays: number;
  sessionIds: string[];
};

export type CardioStrengthExerciseComparison = {
  exerciseId: string;
  exerciseName: string;
  repsPerSet: number;
  recentMedianLoadKg: number;
  previousMedianLoadKg: number;
  changePercent: number;
  recentSessionCount: number;
  previousSessionCount: number;
  sessionIds: string[];
};

export type CardioSportEvaluation = {
  sportType: string;
  level: CardioAssessmentLevel;
  confidence: CardioConfidence;
  cardiovascular: {
    recentMedianBpm: number | null;
    previousMedianBpm: number | null;
    deltaBpm: number | null;
    recentSessionCount: number;
    previousSessionCount: number;
  };
  performance: CardioPerformanceDimension;
  volume: { recent: CardioPeriodTotals; previous: CardioPeriodTotals; sessionCountChange: number | null };
  strengthExercises: CardioStrengthExerciseComparison[];
  limitations: string[];
};

export type CardioHeartRateTrendPoint = { date: Date; value: number; sessionCount: number };

const DAY_MS = 86_400_000;
const PERIOD_DAYS: Record<Exclude<CardioPeriod, 'all'>, number> = {
  day: 1,
  week: 7,
  month: 30,
  three_months: 90,
  six_months: 180,
};
const MIN_HEART_RATE = 40;
const MAX_HEART_RATE = 220;
const MAX_AVERAGE_POWER_W = 3000;
const MAX_SPEED_MPS: Readonly<Record<string, number>> = {
  running: 15,
  trail: 12,
  hiking: 10,
  swimming: 5,
  cycling: 40,
  skiing: 35,
  snowboard: 35,
};
const MIN_PERFORMANCE_PAIRS = 3;
const MIN_PAIR_SPAN_DAYS = 14;
const MAX_SIMILAR_HEART_RATE_DIFFERENCE_BPM = 7;
const OUTPUT_CHANGE_HEURISTIC_PERCENT = 3;

type Window = { start: number; end: number };
type SessionMetric = {
  activity: CardioActivity;
  value: number;
  source: 'recorded' | 'distance_duration' | 'matched_laps';
};

const median = (values: number[]): number | null => {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
};

const positive = (value: number | null): value is number => value !== null && Number.isFinite(value) && value > 0;
const nonNegative = (value: number | null): value is number => value !== null && Number.isFinite(value) && value >= 0;
const validHeartRate = (value: number | null): value is number =>
  value !== null && Number.isFinite(value) && value >= MIN_HEART_RATE && value <= MAX_HEART_RATE;
const validMaximumHeartRate = (maximum: number | null, average: number | null): maximum is number =>
  validHeartRate(maximum) && (!validHeartRate(average) || maximum >= average);

const periodWindows = (activities: CardioActivity[], reference: number, period: CardioPeriod) => {
  if (period === 'all') {
    const dateBounds = activities.reduce(
      (bounds, activity) => {
        const date = Date.parse(activity.start_time);
        return Number.isFinite(date)
          ? { earliest: Math.min(bounds.earliest, date), latest: Math.max(bounds.latest, date) }
          : bounds;
      },
      { earliest: Number.POSITIVE_INFINITY, latest: Number.NEGATIVE_INFINITY },
    );
    if (!Number.isFinite(dateBounds.earliest) || !Number.isFinite(dateBounds.latest))
      return { recent: { start: reference, end: reference }, previous: { start: reference, end: reference } };
    const midpoint = dateBounds.earliest + (dateBounds.latest - dateBounds.earliest) / 2;
    return {
      recent: { start: midpoint, end: dateBounds.latest + 1 },
      previous: { start: dateBounds.earliest, end: midpoint },
    };
  }
  const periodMs = PERIOD_DAYS[period] * DAY_MS;
  return {
    recent: { start: reference - periodMs, end: reference + 1 },
    previous: { start: reference - periodMs * 2, end: reference - periodMs },
  };
};

const inWindow = (activity: CardioActivity, window: Window): boolean => {
  const date = Date.parse(activity.start_time);
  return Number.isFinite(date) && date >= window.start && date < window.end;
};

const uniqueSportActivities = (activities: CardioActivity[], sportType: string, reference: number) => {
  const ids = new Set<string>();
  return activities.filter(activity => {
    const start = Date.parse(activity.start_time);
    if (
      !activity.id ||
      !Number.isFinite(start) ||
      start > reference ||
      ids.has(activity.id) ||
      normalizeCardioSportType(activity.sport_type, activity.sport_subtype) !== sportType
    ) {
      return false;
    }
    ids.add(activity.id);
    return true;
  });
};

export const getCardioEvaluationSessionIds = (
  activities: CardioActivity[],
  requestedSportType: string,
  referenceDate = new Date(),
  period: CardioPeriod = 'month',
): { recent: string[]; previous: string[] } => {
  const sportType = normalizeCardioSportType(requestedSportType);
  const matching = uniqueSportActivities(activities, sportType, referenceDate.getTime());
  const windows = periodWindows(matching, referenceDate.getTime(), period);
  return {
    recent: matching.filter(activity => inWindow(activity, windows.recent)).map(activity => activity.id),
    previous: matching.filter(activity => inWindow(activity, windows.previous)).map(activity => activity.id),
  };
};

/** Groups recorded per-session average heart rates into day, week, or month medians. */
export const getCardioHeartRateTrendSeries = (
  activities: CardioActivity[],
  sessionIds: string[],
  period: CardioPeriod,
): CardioHeartRateTrendPoint[] => {
  const includedIds = new Set(sessionIds);
  const seenIds = new Set<string>();
  const byDate = new Map<number, number[]>();
  for (const activity of activities) {
    if (!includedIds.has(activity.id) || seenIds.has(activity.id) || !validHeartRate(activity.avg_heart_rate)) {
      continue;
    }
    const timestamp = Date.parse(activity.start_time);
    if (!Number.isFinite(timestamp)) continue;
    seenIds.add(activity.id);
    const date = new Date(timestamp);
    if (period === 'all') {
      date.setUTCDate(1);
      date.setUTCHours(0, 0, 0, 0);
    } else if (period === 'three_months' || period === 'six_months') {
      const daysSinceMonday = (date.getUTCDay() + 6) % 7;
      date.setUTCDate(date.getUTCDate() - daysSinceMonday);
      date.setUTCHours(0, 0, 0, 0);
    } else {
      date.setUTCHours(0, 0, 0, 0);
    }
    const bucketDate = date.getTime();
    const bucket = byDate.get(bucketDate) ?? [];
    bucket.push(activity.avg_heart_rate);
    byDate.set(bucketDate, bucket);
  }
  return [...byDate.entries()]
    .flatMap(([timestamp, values]) => {
      const value = median(values);
      return value === null ? [] : [{ date: new Date(timestamp), value, sessionCount: values.length }];
    })
    .sort((left, right) => left.date.getTime() - right.date.getTime());
};

const toSpeed = (activity: CardioActivity, sportType: string): number | null => {
  const maximum = MAX_SPEED_MPS[sportType] ?? 0;
  if (positive(activity.avg_speed_m_per_s) && activity.avg_speed_m_per_s <= maximum) {
    return activity.avg_speed_m_per_s;
  }
  const derivedSpeed =
    positive(activity.distance_m) && positive(activity.duration_s) ? activity.distance_m / activity.duration_s : null;
  return derivedSpeed !== null && derivedSpeed <= maximum ? derivedSpeed : null;
};

const comparisonContext = (
  left: CardioActivity,
  right: CardioActivity,
  sportType: string,
): { compatible: boolean; complete: boolean } => {
  const leftSubtype = normalizeCardioSportSubtype(left.sport_type, left.sport_subtype);
  const rightSubtype = normalizeCardioSportSubtype(right.sport_type, right.sport_subtype);
  if (leftSubtype !== null && rightSubtype !== null && leftSubtype !== rightSubtype) {
    return { compatible: false, complete: false };
  }
  let complete = leftSubtype !== null && rightSubtype !== null;

  for (const [leftValue, rightValue] of [
    [left.provider, right.provider],
    [left.device_id, right.device_id],
  ]) {
    if (leftValue && rightValue && leftValue !== rightValue) return { compatible: false, complete: false };
    if (!leftValue || !rightValue) complete = false;
  }

  if (Number.isFinite(left.avg_temp_c) && Number.isFinite(right.avg_temp_c)) {
    if (Math.abs((left.avg_temp_c as number) - (right.avg_temp_c as number)) > 5) {
      return { compatible: false, complete: false };
    }
  } else {
    complete = false;
  }

  if (
    typeof left.elev_gain_m === 'number' &&
    Number.isFinite(left.elev_gain_m) &&
    typeof right.elev_gain_m === 'number' &&
    Number.isFinite(right.elev_gain_m)
  ) {
    const elevationRatio =
      Math.min(left.elev_gain_m, right.elev_gain_m) / Math.max(left.elev_gain_m, right.elev_gain_m);
    if (
      left.elev_gain_m !== right.elev_gain_m &&
      (elevationRatio < 0.8 || !Number.isFinite(elevationRatio)) &&
      Math.abs(left.elev_gain_m - right.elev_gain_m) > 30
    ) {
      return { compatible: false, complete: false };
    }
  } else {
    complete = false;
  }

  const contextFields: (keyof CardioActivity)[] =
    sportType === 'swimming'
      ? ['pool_type', 'stroke']
      : ['football', 'basketball', 'tennis', 'padel', 'martial_arts', 'volleyball'].includes(sportType)
        ? ['football_session_type', 'surface']
        : sportType === 'skiing'
          ? ['ski_type']
          : sportType === 'snowboard'
            ? ['snowboard_type']
            : ['surface'];
  return contextFields.every(field => {
    const leftValue = left[field];
    const rightValue = right[field];
    if (leftValue == null || rightValue == null) {
      complete = false;
      return true;
    }
    return leftValue === rightValue;
  })
    ? { compatible: true, complete }
    : { compatible: false, complete: false };
};

const valueFor = (
  activity: CardioActivity,
  sportType: string,
  metric: CardioPerformanceDimension['metric'],
): { value: number; source: SessionMetric['source'] } | null => {
  if (metric === 'power') {
    return positive(activity.avg_power_w) && activity.avg_power_w <= MAX_AVERAGE_POWER_W
      ? { value: activity.avg_power_w, source: 'recorded' }
      : null;
  }
  if (metric !== 'speed') return null;
  const speed = toSpeed(activity, sportType);
  if (speed === null) return null;
  return {
    value: speed,
    source:
      positive(activity.avg_speed_m_per_s) && activity.avg_speed_m_per_s <= (MAX_SPEED_MPS[sportType] ?? 0)
        ? 'recorded'
        : 'distance_duration',
  };
};

const sessionMetrics = (
  activities: CardioActivity[],
  sportType: string,
  metric: CardioPerformanceDimension['metric'],
): SessionMetric[] =>
  metric === null
    ? []
    : activities.flatMap(activity => {
        const result = valueFor(activity, sportType, metric);
        return result === null ? [] : [{ activity, ...result }];
      });

const getLapDistance = (lap: CardioLap) => {
  const distance = positive(lap.split_distance_m) ? lap.split_distance_m : lap.distance_m;
  return positive(distance) ? Math.round(distance / 25) * 25 : null;
};

const getLapPacePerKm = (lap: CardioLap): number | null => {
  const pace = positive(lap.avg_pace_s_per_km)
    ? lap.avg_pace_s_per_km
    : positive(lap.distance_m) && positive(lap.duration_s)
      ? (lap.duration_s / lap.distance_m) * 1000
      : null;
  return pace !== null && pace >= 120 && pace <= 1800 ? pace : null;
};

const matchLapSessions = (
  previous: SessionMetric[],
  recent: SessionMetric[],
  sportType: string,
): Array<{ previous: SessionMetric; recent: SessionMetric }> => {
  const usedPrevious = new Set<string>();
  const pairs: Array<{ previous: SessionMetric; recent: SessionMetric }> = [];
  for (const current of recent) {
    let best: SessionMetric | null = null;
    let bestGap = Number.POSITIVE_INFINITY;
    for (const earlier of previous) {
      if (usedPrevious.has(earlier.activity.id) || !isSameCardioSportSubtype(earlier.activity, current.activity))
        continue;
      if (!comparisonContext(earlier.activity, current.activity, sportType).compatible) continue;
      const gap = Math.abs(Date.parse(current.activity.start_time) - Date.parse(earlier.activity.start_time));
      if (gap < bestGap) {
        best = earlier;
        bestGap = gap;
      }
    }
    if (!best) continue;
    usedPrevious.add(best.activity.id);
    pairs.push({ previous: best, recent: current });
  }
  return pairs;
};

const lapMetric = (
  laps: CardioLap[],
  recentIds: Set<string>,
  previousIds: Set<string>,
  sportType: string,
  activities: CardioActivity[],
) => {
  const activityById = new Map(activities.map(activity => [activity.id, activity]));
  const bySessionAndSplit = new Map<string, Map<string, number[]>>();
  for (const lap of laps) {
    if (lap.lap_type === 'time' || lap.lap_type === 'unknown') continue;
    const distance = getLapDistance(lap);
    const pace = getLapPacePerKm(lap);
    if (distance === null || pace === null || (!recentIds.has(lap.session_id) && !previousIds.has(lap.session_id)))
      continue;
    const splitGroup = lap.split_group.trim() || 'unspecified';
    const activity = activityById.get(lap.session_id);
    const swimContext =
      sportType === 'swimming'
        ? `${activity?.pool_type ?? 'unknown'}:${activity?.stroke ?? 'unknown'}:${
            normalizeCardioSportSubtype(activity?.sport_type, activity?.sport_subtype) ?? 'unknown'
          }`
        : '';
    const key = `${lap.lap_type}:${splitGroup}:${distance}:${swimContext}`;
    const groups = bySessionAndSplit.get(lap.session_id) ?? new Map<string, number[]>();
    groups.set(key, [...(groups.get(key) ?? []), pace]);
    bySessionAndSplit.set(lap.session_id, groups);
  }
  const valuesBySplit = new Map<string, { recent: Map<string, SessionMetric>; previous: Map<string, SessionMetric> }>();
  for (const [sessionId, groups] of bySessionAndSplit) {
    for (const [key, paces] of groups) {
      const value = median(paces);
      const activity = activityById.get(sessionId);
      if (value === null || !activity) continue;
      const split = valuesBySplit.get(key) ?? { recent: new Map(), previous: new Map() };
      const metric = { activity, value, source: 'matched_laps' as const };
      if (recentIds.has(sessionId)) split.recent.set(sessionId, metric);
      if (previousIds.has(sessionId)) split.previous.set(sessionId, metric);
      valuesBySplit.set(key, split);
    }
  }
  const best = [...valuesBySplit.entries()]
    .map(([key, values]) => ({
      key,
      values,
      pairs: matchLapSessions([...values.previous.values()], [...values.recent.values()], sportType),
    }))
    .filter(candidate => candidate.pairs.length > 0)
    .sort(
      (left, right) =>
        right.pairs.length - left.pairs.length ||
        right.values.recent.size + right.values.previous.size - left.values.recent.size - left.values.previous.size,
    )[0];
  if (!best) return null;
  const distance = Number(best.key.split(':')[2]);
  const recentValue = median(best.pairs.map(pair => pair.recent.value));
  const previousValue = median(best.pairs.map(pair => pair.previous.value));
  if (recentValue === null || previousValue === null) return null;
  return {
    metric: 'lap_pace' as const,
    unit: sportType === 'swimming' ? ('s/100m' as const) : ('s/km' as const),
    recentValue: sportType === 'swimming' ? recentValue / 10 : recentValue,
    previousValue: sportType === 'swimming' ? previousValue / 10 : previousValue,
    recentSessionCount: best.values.recent.size,
    previousSessionCount: best.values.previous.size,
    distance,
    pairs: best.pairs,
  };
};

const matchOutputSessions = (
  previous: SessionMetric[],
  recent: SessionMetric[],
  metric: CardioPerformanceDimension['metric'],
): Array<{ previous: SessionMetric; recent: SessionMetric }> => {
  const usedPrevious = new Set<string>();
  const pairs: Array<{ previous: SessionMetric; recent: SessionMetric }> = [];
  for (const current of recent) {
    let best: SessionMetric | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const earlier of previous) {
      if (usedPrevious.has(earlier.activity.id) || earlier.source !== current.source) continue;
      if (!isSameCardioSportSubtype(earlier.activity, current.activity)) continue;
      if (
        !comparisonContext(
          earlier.activity,
          current.activity,
          normalizeCardioSportType(current.activity.sport_type, current.activity.sport_subtype),
        ).compatible
      )
        continue;
      const earlierDuration = earlier.activity.duration_s;
      const currentDuration = current.activity.duration_s;
      if (!positive(earlierDuration) || !positive(currentDuration)) continue;
      const durationRatio = Math.min(earlierDuration, currentDuration) / Math.max(earlierDuration, currentDuration);
      if (metric === 'power' && durationRatio < 0.8) continue;
      if (metric === 'speed') {
        const earlierDistance = earlier.activity.distance_m;
        const currentDistance = current.activity.distance_m;
        if (!positive(earlierDistance) || !positive(currentDistance)) continue;
        const distanceRatio = Math.min(earlierDistance, currentDistance) / Math.max(earlierDistance, currentDistance);
        if (distanceRatio < 0.85) continue;
      }
      const days = Math.abs(Date.parse(current.activity.start_time) - Date.parse(earlier.activity.start_time));
      if (days < bestDistance) {
        best = earlier;
        bestDistance = days;
      }
    }
    if (!best) continue;
    usedPrevious.add(best.activity.id);
    pairs.push({ previous: best, recent: current });
  }
  return pairs;
};

const metricFor = (
  sportType: string,
  recent: CardioActivity[],
  previous: CardioActivity[],
): CardioPerformanceDimension['metric'] => {
  if (!['running', 'trail', 'hiking', 'swimming', 'cycling'].includes(sportType)) return null;
  const candidates: Array<'power' | 'speed'> = sportType === 'cycling' ? ['power', 'speed'] : ['speed'];
  return (
    candidates
      .map((candidate, priority) => {
        const recentMetrics = sessionMetrics(recent, sportType, candidate);
        const previousMetrics = sessionMetrics(previous, sportType, candidate);
        return {
          candidate,
          priority,
          pairCount: matchOutputSessions(previousMetrics, recentMetrics, candidate).length,
          coverage: Math.min(recentMetrics.length, previousMetrics.length),
          availableCount: recentMetrics.length + previousMetrics.length,
        };
      })
      .filter(candidate => candidate.availableCount > 0)
      .sort(
        (left, right) =>
          right.pairCount - left.pairCount || right.coverage - left.coverage || left.priority - right.priority,
      )[0]?.candidate ?? null
  );
};

const outputChangeThreshold = (pairChanges: number[]): number => {
  const center = median(pairChanges);
  if (center === null) return OUTPUT_CHANGE_HEURISTIC_PERCENT;
  const deviation = median(pairChanges.map(change => Math.abs(change - center))) ?? 0;
  return Math.max(OUTPUT_CHANGE_HEURISTIC_PERCENT, deviation * 1.5);
};

const classifyOutputChange = (pairChanges: number[]): CardioDimensionStatus => {
  if (pairChanges.length < MIN_PERFORMANCE_PAIRS) return 'descriptive';
  const center = median(pairChanges);
  if (center === null) return 'insufficient';
  const threshold = outputChangeThreshold(pairChanges);
  const matchingDirection = pairChanges.filter(change => Math.abs(change) >= threshold);
  if (matchingDirection.length < MIN_PERFORMANCE_PAIRS) return 'stable';
  const favorableShare = matchingDirection.filter(change => change > 0).length / matchingDirection.length;
  const unfavorableShare = matchingDirection.filter(change => change < 0).length / matchingDirection.length;
  if (center >= threshold && favorableShare >= 0.7) return 'improving';
  if (center <= -threshold && unfavorableShare >= 0.7) return 'declining';
  return 'stable';
};

const outputPairChange = (
  pair: { previous: SessionMetric; recent: SessionMetric },
  metric: CardioPerformanceDimension['metric'],
): number => {
  const rawChange = ((pair.recent.value - pair.previous.value) / pair.previous.value) * 100;
  return metric === 'lap_pace' ? -rawChange : rawChange;
};

const isStatusConsistentWithMedianChange = (
  status: CardioDimensionStatus,
  medianChange: number | null,
  pairChanges: number[],
): boolean => {
  if (medianChange === null) return status === 'descriptive' || status === 'insufficient';
  const threshold = outputChangeThreshold(pairChanges);
  if (status === 'improving') return medianChange > 0;
  if (status === 'declining') return medianChange < 0;
  if (status === 'stable') return Math.abs(medianChange) < threshold;
  return true;
};

const getPairSpanDays = (
  pairs: Array<{ previous: SessionMetric; recent: SessionMetric }>,
  side: 'previous' | 'recent',
) => {
  const dateBounds = pairs.reduce(
    (bounds, pair) => {
      const date = Date.parse(pair[side].activity.start_time);
      return Number.isFinite(date)
        ? { earliest: Math.min(bounds.earliest, date), latest: Math.max(bounds.latest, date), count: bounds.count + 1 }
        : bounds;
    },
    { earliest: Number.POSITIVE_INFINITY, latest: Number.NEGATIVE_INFINITY, count: 0 },
  );
  return dateBounds.count < 2 ? 0 : Math.round((dateBounds.latest - dateBounds.earliest) / DAY_MS);
};

const summarizePeriod = (activities: CardioActivity[], workoutSets: CardioWorkoutSet[]): CardioPeriodTotals => {
  const withHeartRate = activities.filter(activity => validHeartRate(activity.avg_heart_rate));
  const withMaximumHeartRate = activities.filter(activity =>
    validMaximumHeartRate(activity.max_heart_rate, activity.avg_heart_rate),
  );
  const durations = activities.map(activity => activity.duration_s).filter(positive);
  const distances = activities.map(activity => activity.distance_m).filter(positive);
  const elevations = activities.map(activity => activity.elev_gain_m).filter(nonNegative);
  const setsBySession = new Map<string, CardioWorkoutSet[]>();
  for (const set of workoutSets) setsBySession.set(set.session_id, [...(setsBySession.get(set.session_id) ?? []), set]);
  const sessionSetMetric = (
    activity: CardioActivity,
    storedValue: number | null,
    derive: (sets: CardioWorkoutSet[]) => number,
  ): number | null => {
    if (nonNegative(storedValue)) return storedValue;
    const sessionSets = setsBySession.get(activity.id);
    return sessionSets && sessionSets.length > 0 ? derive(sessionSets) : null;
  };
  const strengthVolumes = activities
    .map(activity =>
      sessionSetMetric(activity, activity.total_volume_kg, sets =>
        sets.reduce((sum, set) => sum + set.weight_kg * set.reps, 0),
      ),
    )
    .filter(nonNegative);
  const sets = activities
    .map(activity => sessionSetMetric(activity, activity.total_sets, sessionSets => sessionSets.length))
    .filter(nonNegative);
  const reps = activities
    .map(activity =>
      sessionSetMetric(activity, activity.total_reps, sessionSets =>
        sessionSets.reduce((sum, set) => sum + set.reps, 0),
      ),
    )
    .filter(nonNegative);
  return {
    sessionCount: activities.length,
    sessionIds: activities.map(activity => activity.id),
    sessionsWithHeartRate: withHeartRate.length,
    medianHeartRateBpm: median(withHeartRate.map(activity => activity.avg_heart_rate as number)),
    sessionsWithMaximumHeartRate: withMaximumHeartRate.length,
    medianMaximumHeartRateBpm: median(withMaximumHeartRate.map(activity => activity.max_heart_rate as number)),
    durationMinutes: durations.length > 0 ? Math.round(durations.reduce((sum, value) => sum + value, 0) / 60) : null,
    durationSessionCount: durations.length,
    distanceKm:
      distances.length > 0 ? Math.round((distances.reduce((sum, value) => sum + value, 0) / 1000) * 10) / 10 : null,
    distanceSessionCount: distances.length,
    elevationGainM: elevations.length > 0 ? Math.round(elevations.reduce((sum, value) => sum + value, 0)) : null,
    elevationSessionCount: elevations.length,
    strengthVolumeKg: strengthVolumes.length > 0 ? strengthVolumes.reduce((sum, value) => sum + value, 0) : null,
    strengthVolumeSessionCount: strengthVolumes.length,
    strengthSetCount: sets.length > 0 ? sets.reduce((sum, value) => sum + value, 0) : null,
    strengthSetSessionCount: sets.length,
    strengthRepCount: reps.length > 0 ? reps.reduce((sum, value) => sum + value, 0) : null,
    strengthRepSessionCount: reps.length,
  };
};

const getStrengthComparisons = (
  recentActivities: CardioActivity[],
  previousActivities: CardioActivity[],
  sets: CardioWorkoutSet[],
  exerciseNames: CardioExerciseName[],
  locale: string,
): CardioStrengthExerciseComparison[] => {
  const recentIds = new Set(recentActivities.map(activity => activity.id));
  const previousIds = new Set(previousActivities.map(activity => activity.id));
  const useEnglishName = locale.toLowerCase().startsWith('en');
  const nameById = new Map(
    exerciseNames.map(exercise => [
      exercise.id,
      useEnglishName
        ? exercise.base_name_en || exercise.base_name_es || 'Exercise'
        : exercise.base_name_es || exercise.base_name_en || 'Ejercicio',
    ]),
  );
  const byExerciseAndReps = new Map<
    string,
    { recentBySession: Map<string, number[]>; previousBySession: Map<string, number[]> }
  >();
  for (const set of sets) {
    if (
      set.is_warmup ||
      /warm.?up/i.test(set.set_type) ||
      !positive(set.weight_kg) ||
      !Number.isInteger(set.reps) ||
      set.reps < 1 ||
      set.reps > 20 ||
      (!recentIds.has(set.session_id) && !previousIds.has(set.session_id))
    ) {
      continue;
    }
    const key = `${set.exercise_id}:${set.reps}`;
    const group = byExerciseAndReps.get(key) ?? {
      recentBySession: new Map<string, number[]>(),
      previousBySession: new Map<string, number[]>(),
    };
    const sessions = recentIds.has(set.session_id) ? group.recentBySession : group.previousBySession;
    sessions.set(set.session_id, [...(sessions.get(set.session_id) ?? []), set.weight_kg]);
    byExerciseAndReps.set(key, group);
  }
  return [...byExerciseAndReps.entries()]
    .flatMap(([key, group]) => {
      const [exerciseId, repsText] = key.split(':');
      const recentValues = [...group.recentBySession.values()].map(loads =>
        loads.reduce((maximum, load) => Math.max(maximum, load), Number.NEGATIVE_INFINITY),
      );
      const previousValues = [...group.previousBySession.values()].map(loads =>
        loads.reduce((maximum, load) => Math.max(maximum, load), Number.NEGATIVE_INFINITY),
      );
      const recentMedianLoadKg = median(recentValues);
      const previousMedianLoadKg = median(previousValues);
      if (recentMedianLoadKg === null || previousMedianLoadKg === null || previousMedianLoadKg <= 0) return [];
      const sessionIds = [...group.previousBySession.keys(), ...group.recentBySession.keys()];
      return [
        {
          exerciseId,
          exerciseName: nameById.get(exerciseId) ?? 'Ejercicio',
          repsPerSet: Number(repsText),
          recentMedianLoadKg,
          previousMedianLoadKg,
          changePercent: ((recentMedianLoadKg - previousMedianLoadKg) / previousMedianLoadKg) * 100,
          recentSessionCount: group.recentBySession.size,
          previousSessionCount: group.previousBySession.size,
          sessionIds,
        },
      ];
    })
    .sort(
      (left, right) =>
        right.recentSessionCount + right.previousSessionCount - left.recentSessionCount - left.previousSessionCount,
    )
    .slice(0, 5);
};

/**
 * Produces separate, traceable performance, cardiovascular and training-volume summaries.
 * Any numeric change without matched, repeatable sessions remains descriptive rather than a fitness claim.
 */
export const evaluateCardioSport = (
  activities: CardioActivity[],
  requestedSportType: string,
  referenceDate = new Date(),
  period: CardioPeriod = 'month',
  laps: CardioLap[] = [],
  workoutSets: CardioWorkoutSet[] = [],
  exerciseNames: CardioExerciseName[] = [],
  locale = 'es',
): CardioSportEvaluation => {
  const sportType = normalizeCardioSportType(requestedSportType);
  const all = uniqueSportActivities(activities, sportType, referenceDate.getTime());
  const windows = periodWindows(all, referenceDate.getTime(), period);
  const recent = all.filter(activity => inWindow(activity, windows.recent));
  const previous = all.filter(activity => inWindow(activity, windows.previous));
  const recentTotals = summarizePeriod(recent, workoutSets);
  const previousTotals = summarizePeriod(previous, workoutSets);
  const recentHr = recentTotals.medianHeartRateBpm;
  const previousHr = previousTotals.medianHeartRateBpm;
  const metric = metricFor(sportType, recent, previous);
  const recentMetrics = sessionMetrics(recent, sportType, metric);
  const previousMetrics = sessionMetrics(previous, sportType, metric);
  const outputPairs = matchOutputSessions(previousMetrics, recentMetrics, metric);
  const lapResult = lapMetric(
    laps,
    new Set(recentTotals.sessionIds),
    new Set(previousTotals.sessionIds),
    sportType,
    all,
  );
  const useLapPace = lapResult !== null && (sportType === 'swimming' || metric === null || outputPairs.length === 0);
  const selectedMetric: CardioPerformanceDimension['metric'] = useLapPace ? 'lap_pace' : metric;
  const selectedPairs = useLapPace
    ? (lapResult?.pairs ?? []).map(pair => ({
        previous: {
          ...pair.previous,
          value: sportType === 'swimming' ? pair.previous.value / 10 : pair.previous.value,
        },
        recent: {
          ...pair.recent,
          value: sportType === 'swimming' ? pair.recent.value / 10 : pair.recent.value,
        },
      }))
    : outputPairs;
  const selectedRecentMetrics = useLapPace
    ? [...new Map(selectedPairs.map(pair => [pair.recent.activity.id, pair.recent])).values()]
    : recentMetrics;
  const selectedPreviousMetrics = useLapPace
    ? [...new Map(selectedPairs.map(pair => [pair.previous.activity.id, pair.previous])).values()]
    : previousMetrics;
  const heartRateSimilarPairs = selectedPairs.filter(
    pair =>
      validHeartRate(pair.previous.activity.avg_heart_rate) &&
      validHeartRate(pair.recent.activity.avg_heart_rate) &&
      Math.abs(pair.previous.activity.avg_heart_rate - pair.recent.activity.avg_heart_rate) <=
        MAX_SIMILAR_HEART_RATE_DIFFERENCE_BPM,
  );
  const similarHeartRatePairs = heartRateSimilarPairs.filter(pair => {
    const previousSubtype = normalizeCardioSportSubtype(
      pair.previous.activity.sport_type,
      pair.previous.activity.sport_subtype,
    );
    const recentSubtype = normalizeCardioSportSubtype(
      pair.recent.activity.sport_type,
      pair.recent.activity.sport_subtype,
    );
    return (
      previousSubtype !== null &&
      recentSubtype !== null &&
      previousSubtype === recentSubtype &&
      comparisonContext(pair.previous.activity, pair.recent.activity, sportType).compatible
    );
  });
  const matchedContextPairCount = similarHeartRatePairs.filter(
    pair => comparisonContext(pair.previous.activity, pair.recent.activity, sportType).complete,
  ).length;
  const similarRecentPairSpanDays = getPairSpanDays(similarHeartRatePairs, 'recent');
  const similarPreviousPairSpanDays = getPairSpanDays(similarHeartRatePairs, 'previous');
  const recentPairSpanDays = getPairSpanDays(selectedPairs, 'recent');
  const previousPairSpanDays = getPairSpanDays(selectedPairs, 'previous');
  const canDescribeOutputTrend =
    ['running', 'trail', 'hiking'].includes(sportType) ||
    (sportType === 'cycling' && selectedMetric === 'power') ||
    (sportType === 'swimming' && selectedMetric === 'lap_pace');
  const enoughHeartRatePairs =
    similarHeartRatePairs.length >= MIN_PERFORMANCE_PAIRS &&
    similarRecentPairSpanDays >= MIN_PAIR_SPAN_DAYS &&
    similarPreviousPairSpanDays >= MIN_PAIR_SPAN_DAYS;
  const enoughOutputPairs =
    selectedPairs.length >= MIN_PERFORMANCE_PAIRS &&
    recentPairSpanDays >= MIN_PAIR_SPAN_DAYS &&
    previousPairSpanDays >= MIN_PAIR_SPAN_DAYS;
  const trendPairs = enoughHeartRatePairs ? similarHeartRatePairs : selectedPairs;
  const trendPairChanges = trendPairs.map(pair => outputPairChange(pair, selectedMetric));
  const candidateOutputStatus: CardioDimensionStatus =
    !canDescribeOutputTrend || !enoughOutputPairs
      ? selectedRecentMetrics.length + selectedPreviousMetrics.length > 0
        ? 'descriptive'
        : 'insufficient'
      : classifyOutputChange(trendPairChanges);
  const hasComparableTrendPairs = candidateOutputStatus !== 'descriptive' && candidateOutputStatus !== 'insufficient';
  const displayedPairs = hasComparableTrendPairs ? trendPairs : selectedPairs;
  const recentValue = median(
    displayedPairs.length > 0
      ? displayedPairs.map(pair => pair.recent.value)
      : selectedRecentMetrics.map(item => item.value),
  );
  const previousValue = median(
    displayedPairs.length > 0
      ? displayedPairs.map(pair => pair.previous.value)
      : selectedPreviousMetrics.map(item => item.value),
  );
  const rawMedianValueChange =
    recentValue !== null && previousValue !== null && previousValue > 0
      ? ((recentValue - previousValue) / previousValue) * 100
      : null;
  const medianValueChange =
    selectedMetric === 'lap_pace' && rawMedianValueChange !== null ? -rawMedianValueChange : rawMedianValueChange;
  const outputStatus = isStatusConsistentWithMedianChange(candidateOutputStatus, medianValueChange, trendPairChanges)
    ? candidateOutputStatus
    : 'descriptive';
  const valuesSource: CardioPerformanceDimension['valuesSource'] = hasComparableTrendPairs
    ? enoughHeartRatePairs
      ? 'similar_heart_rate_pairs'
      : 'matched_sessions'
    : selectedPairs.length > 0
      ? 'matched_sessions'
      : 'period_medians';
  const metricSource: CardioPerformanceDimension['metricSource'] = useLapPace
    ? 'matched_laps'
    : (() => {
        const sources = new Set(
          displayedPairs.length > 0
            ? displayedPairs.flatMap(pair => [pair.recent.source, pair.previous.source])
            : [...recentMetrics, ...previousMetrics].map(item => item.source),
        );
        if (sources.size === 0) return null;
        if (sources.size > 1) return 'mixed';
        return sources.has('distance_duration') ? 'distance_duration' : 'recorded';
      })();
  const performance: CardioPerformanceDimension = {
    status: outputStatus,
    metric: selectedMetric,
    unit: useLapPace ? (lapResult?.unit ?? 's/100m') : selectedMetric === 'power' ? 'W' : 'm/s',
    metricSource,
    recentValue,
    previousValue,
    valuesSource,
    changePercent: medianValueChange,
    recentSessionCount: selectedRecentMetrics.length,
    previousSessionCount: selectedPreviousMetrics.length,
    matchedPairCount: selectedPairs.length,
    changePairCount: displayedPairs.length,
    comparedSplitDistanceM: useLapPace ? (lapResult?.distance ?? null) : null,
    matchedAtSimilarHeartRatePairCount: similarHeartRatePairs.length,
    matchedContextPairCount,
    recentPairSpanDays,
    previousPairSpanDays,
    sessionIds: selectedPairs.flatMap(pair => [pair.previous.activity.id, pair.recent.activity.id]),
  };
  const strengthExercises = getStrengthComparisons(recent, previous, workoutSets, exerciseNames, locale);
  const sessionCountChange =
    previousTotals.sessionCount > 0
      ? ((recentTotals.sessionCount - previousTotals.sessionCount) / previousTotals.sessionCount) * 100
      : null;
  const totalActivityCount = recent.length + previous.length;
  const isSingleSession = totalActivityCount === 1;
  const hasHeartRateInBothPeriods = recentHr !== null && previousHr !== null;
  const hasAnyPerformanceData = recentValue !== null || previousValue !== null;
  const hasStrengthEvidence = strengthExercises.length > 0;
  const hasAnyHeartRate = recentHr !== null || previousHr !== null;
  const isFullEvaluation =
    sportType !== 'swimming' &&
    outputStatus !== 'descriptive' &&
    outputStatus !== 'insufficient' &&
    enoughHeartRatePairs &&
    matchedContextPairCount >= MIN_PERFORMANCE_PAIRS;
  const level: CardioAssessmentLevel =
    recent.length === 0
      ? 'F'
      : isFullEvaluation
        ? 'A'
        : isSingleSession
          ? 'E'
          : hasAnyPerformanceData || hasStrengthEvidence
            ? 'B'
            : hasAnyHeartRate
              ? 'C'
              : 'D';
  const confidence: CardioConfidence =
    level === 'A'
      ? performance.matchedAtSimilarHeartRatePairCount >= 5 &&
        similarRecentPairSpanDays >= 28 &&
        similarPreviousPairSpanDays >= 28 &&
        matchedContextPairCount === performance.matchedAtSimilarHeartRatePairCount
        ? 'high'
        : 'medium'
      : level === 'B' &&
          outputStatus !== 'descriptive' &&
          outputStatus !== 'insufficient' &&
          performance.matchedPairCount >= MIN_PERFORMANCE_PAIRS &&
          recentPairSpanDays >= MIN_PAIR_SPAN_DAYS &&
          previousPairSpanDays >= MIN_PAIR_SPAN_DAYS
        ? 'low'
        : level === 'B' && hasStrengthEvidence
          ? 'low'
          : level === 'C' &&
              recentHr !== null &&
              previousHr !== null &&
              recentTotals.sessionsWithHeartRate >= MIN_PERFORMANCE_PAIRS &&
              previousTotals.sessionsWithHeartRate >= MIN_PERFORMANCE_PAIRS
            ? 'low'
            : 'none';
  const limitations: string[] = [];
  if (normalizeSportType(sportType) === null) limitations.push('unrecognized_sport_type_generic_analysis');
  if (selectedMetric === null) limitations.push('sport_specific_performance_not_recorded');
  if (!hasHeartRateInBothPeriods) limitations.push('heart_rate_missing_in_one_period');
  if (performance.matchedPairCount < MIN_PERFORMANCE_PAIRS && performance.metric !== null)
    limitations.push('few_comparable_performance_sessions');
  if (selectedPairs.length > similarHeartRatePairs.length)
    limitations.push('heart_rate_not_similar_or_not_recorded_for_some_pairs');
  if (matchedContextPairCount < similarHeartRatePairs.length && similarHeartRatePairs.length > 0)
    limitations.push('some_comparison_context_missing');
  if (
    performance.status === 'descriptive' &&
    performance.matchedPairCount >= MIN_PERFORMANCE_PAIRS &&
    performance.recentPairSpanDays < MIN_PAIR_SPAN_DAYS
  )
    limitations.push('comparable_sessions_do_not_span_two_weeks');
  if (recent.length === 0 && previous.length > 0) limitations.push('no_recent_sessions_in_selected_period');
  if (sportType === 'swimming') limitations.push('wrist_heart_rate_and_swim_distance_can_be_less_reliable');
  if (strengthExercises.length > 0) limitations.push('load_comparison_does_not_verify_technique_or_range_of_motion');
  return {
    sportType,
    level,
    confidence,
    cardiovascular: {
      recentMedianBpm: recentHr,
      previousMedianBpm: previousHr,
      deltaBpm: recentHr !== null && previousHr !== null ? recentHr - previousHr : null,
      recentSessionCount: recentTotals.sessionsWithHeartRate,
      previousSessionCount: previousTotals.sessionsWithHeartRate,
    },
    performance,
    volume: { recent: recentTotals, previous: previousTotals, sessionCountChange },
    strengthExercises,
    limitations,
  };
};
