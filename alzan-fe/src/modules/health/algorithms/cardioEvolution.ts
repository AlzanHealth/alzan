import {
  isSameCardioSportSubtype,
  normalizeCardioSportSubtype,
  normalizeCardioSportType,
} from './cardioSportNormalization';
import { normalizeSportType } from '../../../utils/sportTypeNormalization';

export type CardioActivity = {
  id: string;
  sport_type: string;
  sport_subtype: string | null;
  provider: string;
  device_id: string | null;
  start_time: string;
  duration_s: number | null;
  distance_m: number | null;
  avg_heart_rate: number | null;
  max_heart_rate: number | null;
  avg_speed_m_per_s: number | null;
  avg_power_w: number | null;
  avg_temp_c: number | null;
  elev_gain_m: number | null;
  total_volume_kg: number | null;
  total_sets: number | null;
  total_reps: number | null;
  workout_template_id: string | null;
  pool_type?: string | null;
  stroke?: string | null;
  surface?: string | null;
  football_session_type?: string | null;
  ski_type?: string | null;
  snowboard_type?: string | null;
};

export type CardioStreamSample = {
  session_id: string;
  stream_type: 'heart_rate' | 'speed' | 'power' | 'altitude' | 'temperature';
  offset_s: number | null;
  timestamp?: string | null;
  value: number;
};

export type CardioZoneTime = { session_id: string; zone: number; duration_s: number };
export type CardioTrendStatus = 'improving' | 'declining' | 'stable' | 'insufficient' | 'descriptive';
export type CardioAnalysisReason =
  | 'no_activities'
  | 'no_heart_rate'
  | 'no_recent_activities'
  | 'no_recent_heart_rate'
  | 'invalid_heart_rate'
  | 'no_performance_metric'
  | 'no_comparable_sessions'
  | 'not_enough_comparable_pairs'
  | 'none';
export type CardioConfidence = 'high' | 'medium' | 'low' | 'none';
export type CardioPeriod = 'day' | 'week' | 'month' | 'three_months' | 'six_months' | 'all';
export type CardioTrendMetric =
  | 'speed_at_similar_hr'
  | 'power_at_similar_hr'
  | 'hr_at_similar_output'
  | 'heart_rate_response'
  | 'none';

export type CardioSportEvolution = {
  sportType: string;
  status: CardioTrendStatus;
  confidence: CardioConfidence;
  metric: CardioTrendMetric;
  reason: CardioAnalysisReason;
  recentActivityCount: number;
  previousActivityCount: number;
  recentSessionCount: number;
  previousSessionCount: number;
  matchedPairCount: number;
  recentValue: number | null;
  previousValue: number | null;
  changePercent: number | null;
  heartRateDeltaBpm: number | null;
  strengthVolumeChangePercent: number | null;
  measurementCaution: boolean;
  contextWarnings: (
    | 'temperature'
    | 'elevation'
    | 'derived_speed'
    | 'swimming_sensor'
    | 'device'
    | 'heart_rate_quality'
    | 'activity_quality'
    | 'subtype'
  )[];
};

export type WeeklyCardioSummary = {
  sessionCount: number;
  durationMinutes: number;
  heartRateSessionCount: number;
  medianHeartRate: number | null;
  zoneTimeSeconds: [number, number, number, number, number];
  zoneDataAvailable: boolean;
};

export type CardiacDriftResult = {
  decouplingPercent: number;
  firstHalfHeartRate: number;
  secondHalfHeartRate: number;
  outputChangePercent: number;
  outputMetric: 'speed' | 'power';
  pairedSampleCount: number;
};

export type CardiacIntervalRecoveryResult = {
  averageHeartRateDropBpm: number;
  detectedPeakCount: number;
  sampleCount: number;
  confidence: CardioConfidence;
};

export type CardioStreamCandidate = {
  activity: CardioActivity;
  analyzeDrift: boolean;
  analyzeIntervalRecovery: boolean;
};

type MatchMode = 'heart_rate' | 'output';
type PerformanceMetric = 'speed' | 'power';
type ComparablePair = { previous: CardioActivity; recent: CardioActivity; previousValue: number; recentValue: number };

const DAY_MS = 24 * 60 * 60 * 1000;
const COMPARISON_WINDOW_DAYS = 30;
const PERIOD_WINDOW_DAYS: Record<Exclude<CardioPeriod, 'all'>, number> = {
  day: 1,
  week: 7,
  month: COMPARISON_WINDOW_DAYS,
  three_months: 90,
  six_months: 180,
};
const MIN_SESSION_DURATION_SECONDS = 20 * 60;
const MIN_MATCHED_PAIRS = 3;
const MAX_HEART_RATE_DIFFERENCE_BPM = 7;
const MIN_DURATION_RATIO = 0.8;
const MIN_DISTANCE_RATIO = 0.7;
const HIGH_CONFIDENCE_DURATION_RATIO = 0.9;
const HIGH_CONFIDENCE_DISTANCE_RATIO = 0.85;
const MIN_OUTPUT_RATIO = 0.94;
const MAX_OUTPUT_RATIO = 1.06;
const MIN_OUTPUT_CHANGE_PERCENT = 3;
const MIN_HEART_RATE_CHANGE_BPM = 3;
const MIN_HIGH_CONFIDENCE_SPAN_DAYS = 14;
const MIN_HIGH_CONFIDENCE_WEEKS = 3;
const MAX_AVERAGE_POWER_W = 3000;

const MAX_AVERAGE_SPEED_M_PER_S: Readonly<Record<string, number>> = {
  running: 15,
  trail: 12,
  cycling: 40,
  swimming: 5,
  hiking: 10,
};

const median = (values: number[]): number | null => {
  const valid = values.filter(Number.isFinite).sort((left, right) => left - right);
  if (valid.length === 0) return null;
  const middle = Math.floor(valid.length / 2);
  return valid.length % 2 === 0 ? (valid[middle - 1] + valid[middle]) / 2 : valid[middle];
};

const isValidHeartRate = (value: number | null): value is number =>
  value !== null && Number.isFinite(value) && value >= 40 && value <= 220;

const isPositive = (value: number | null): value is number => value !== null && Number.isFinite(value) && value > 0;

const normalizedSportForActivity = (activity: CardioActivity): string =>
  normalizeCardioSportType(activity.sport_type, activity.sport_subtype);

const isPlausibleSpeed = (speed: number, activity: CardioActivity): boolean => {
  if (!Number.isFinite(speed) || speed <= 0) return false;
  const sport = normalizedSportForActivity(activity);
  return speed <= (MAX_AVERAGE_SPEED_M_PER_S[sport] ?? 60);
};

const hasInvalidActivityMetrics = (activity: CardioActivity): boolean => {
  if (activity.duration_s !== null && !isPositive(activity.duration_s)) return true;
  if (activity.distance_m !== null && !isPositive(activity.distance_m)) return true;
  if (activity.avg_speed_m_per_s !== null && !isPlausibleSpeed(activity.avg_speed_m_per_s, activity)) return true;
  return (
    activity.avg_power_w !== null && (!isPositive(activity.avg_power_w) || activity.avg_power_w > MAX_AVERAGE_POWER_W)
  );
};

const getSpeed = (activity: CardioActivity): number | null => {
  if (isPositive(activity.avg_speed_m_per_s) && isPlausibleSpeed(activity.avg_speed_m_per_s, activity))
    return activity.avg_speed_m_per_s;
  if (isPositive(activity.distance_m) && isPositive(activity.duration_s)) {
    const derivedSpeed = activity.distance_m / activity.duration_s;
    if (isPlausibleSpeed(derivedSpeed, activity)) return derivedSpeed;
  }
  return null;
};

const getPerformance = (activity: CardioActivity, metric: PerformanceMetric): number | null =>
  metric === 'power'
    ? isPositive(activity.avg_power_w) && activity.avg_power_w <= MAX_AVERAGE_POWER_W
      ? activity.avg_power_w
      : null
    : getSpeed(activity);

const performanceMetricFor = (sportType: string, sportSubtype: string | null): PerformanceMetric | null => {
  if (sportType === 'cycling') return 'power';
  if (['running', 'trail', 'swimming', 'hiking'].includes(sportType)) return 'speed';
  if (sportType === 'other' && /walk|caminata|paseo|hike/i.test(sportSubtype ?? '')) return 'speed';
  return null;
};

const getActivityDate = (activity: CardioActivity): number | null => {
  const timestamp = Date.parse(activity.start_time);
  return Number.isFinite(timestamp) ? timestamp : null;
};

const INTERVAL_SPORT_TYPES = new Set([
  'hyrox',
  'football',
  'basketball',
  'tennis',
  'padel',
  'martial_arts',
  'volleyball',
]);
const STREAM_LOOKBACK_MS = 28 * DAY_MS;

const isIntervalWorkout = (activity: CardioActivity): boolean =>
  INTERVAL_SPORT_TYPES.has(normalizeCardioSportType(activity.sport_type, activity.sport_subtype)) ||
  /hiit|interval|intermittent|intermitent|series|intervalado/i.test(activity.sport_subtype ?? '');

/** Selects separate latest sessions for drift and intervals so one cannot hide the other. */
export const selectCardioStreamCandidates = (
  activities: CardioActivity[],
  referenceDate = new Date(),
): CardioStreamCandidate[] => {
  const cutoff = referenceDate.getTime() - STREAM_LOOKBACK_MS;
  const selections = new Map<string, { drift?: CardioActivity; interval?: CardioActivity }>();
  for (const activity of activities) {
    const timestamp = getActivityDate(activity);
    if (timestamp === null || timestamp < cutoff || timestamp > referenceDate.getTime()) continue;
    const sport = normalizeCardioSportType(activity.sport_type, activity.sport_subtype);
    const canAnalyzeDrift = ['running', 'trail', 'cycling'].includes(sport) && (activity.duration_s ?? 0) >= 45 * 60;
    const canAnalyzeInterval = isIntervalWorkout(activity) && (activity.duration_s ?? 0) >= 12 * 60;
    if (!canAnalyzeDrift && !canAnalyzeInterval) continue;
    const selection = selections.get(sport) ?? {};
    if (canAnalyzeDrift && (!selection.drift || timestamp > (getActivityDate(selection.drift) ?? 0)))
      selection.drift = activity;
    if (canAnalyzeInterval && (!selection.interval || timestamp > (getActivityDate(selection.interval) ?? 0)))
      selection.interval = activity;
    selections.set(sport, selection);
  }
  const merged = new Map<string, CardioStreamCandidate>();
  for (const selection of selections.values()) {
    if (selection.drift) {
      merged.set(selection.drift.id, {
        activity: selection.drift,
        analyzeDrift: true,
        analyzeIntervalRecovery: selection.interval?.id === selection.drift.id,
      });
    }
    if (selection.interval && selection.interval.id !== selection.drift?.id) {
      merged.set(selection.interval.id, {
        activity: selection.interval,
        analyzeDrift: false,
        analyzeIntervalRecovery: true,
      });
    }
  }
  return [...merged.values()].sort(
    (left, right) => (getActivityDate(left.activity) ?? 0) - (getActivityDate(right.activity) ?? 0),
  );
};

const belongsToWindow = (activity: CardioActivity, start: number, end: number): boolean => {
  const timestamp = getActivityDate(activity);
  return timestamp !== null && timestamp >= start && timestamp < end;
};

const validEnduranceActivities = (activities: CardioActivity[], sportType: string): CardioActivity[] =>
  activities.filter(
    activity =>
      normalizeCardioSportType(activity.sport_type, activity.sport_subtype) === sportType &&
      (activity.duration_s ?? 0) >= MIN_SESSION_DURATION_SECONDS &&
      isValidHeartRate(activity.avg_heart_rate),
  );

const comparableContext = (previous: CardioActivity, recent: CardioActivity): boolean => {
  if (!isSameCardioSportSubtype(previous, recent)) return false;
  const previousDuration = previous.duration_s;
  const recentDuration = recent.duration_s;
  if (!isPositive(previousDuration) || !isPositive(recentDuration)) return false;
  if (Math.min(previousDuration, recentDuration) / Math.max(previousDuration, recentDuration) < MIN_DURATION_RATIO) {
    return false;
  }
  const previousDistance = previous.distance_m;
  const recentDistance = recent.distance_m;
  if (isPositive(previousDistance) && isPositive(recentDistance)) {
    const distanceRatio = Math.min(previousDistance, recentDistance) / Math.max(previousDistance, recentDistance);
    if (distanceRatio < MIN_DISTANCE_RATIO) return false;
  }
  return true;
};

type PairCandidate = { previous: CardioActivity; previousOutput: number };

const findPairCandidate = (
  previous: CardioActivity,
  recent: CardioActivity,
  mode: MatchMode,
  metric: PerformanceMetric,
): PairCandidate | null => {
  if (!comparableContext(previous, recent)) return null;
  const previousOutput = getPerformance(previous, metric);
  const recentOutput = getPerformance(recent, metric);
  if (!isPositive(previousOutput) || !isPositive(recentOutput)) return null;
  if (mode === 'heart_rate') {
    const distance = Math.abs((recent.avg_heart_rate ?? 0) - (previous.avg_heart_rate ?? 0));
    return distance <= MAX_HEART_RATE_DIFFERENCE_BPM ? { previous, previousOutput } : null;
  }
  const outputRatio = recentOutput / previousOutput;
  return outputRatio >= MIN_OUTPUT_RATIO && outputRatio <= MAX_OUTPUT_RATIO ? { previous, previousOutput } : null;
};

const pairActivities = (
  previousActivities: CardioActivity[],
  recentActivities: CardioActivity[],
  mode: MatchMode,
  metric: PerformanceMetric,
): ComparablePair[] => {
  // Hopcroft-Karp finds a maximum-cardinality matching. Candidate edges are
  // evaluated on demand so large histories do not allocate an O(n*m) matrix.
  const previousForRecent = new Int32Array(recentActivities.length).fill(-1);
  const recentForPrevious = new Int32Array(previousActivities.length).fill(-1);
  const distanceFromFreeRecent = new Int32Array(recentActivities.length);
  const unreachable = recentActivities.length + 1;
  let shortestAugmentingPath = unreachable;

  const buildLayers = (): boolean => {
    const queue = new Int32Array(recentActivities.length);
    let queueStart = 0;
    let queueEnd = 0;
    shortestAugmentingPath = unreachable;

    for (let recentIndex = 0; recentIndex < recentActivities.length; recentIndex += 1) {
      if (previousForRecent[recentIndex] === -1) {
        distanceFromFreeRecent[recentIndex] = 0;
        queue[queueEnd] = recentIndex;
        queueEnd += 1;
      } else {
        distanceFromFreeRecent[recentIndex] = unreachable;
      }
    }

    while (queueStart < queueEnd) {
      const recentIndex = queue[queueStart];
      queueStart += 1;
      if (distanceFromFreeRecent[recentIndex] >= shortestAugmentingPath) continue;

      for (let previousIndex = 0; previousIndex < previousActivities.length; previousIndex += 1) {
        if (!findPairCandidate(previousActivities[previousIndex], recentActivities[recentIndex], mode, metric))
          continue;
        const matchedRecentIndex = recentForPrevious[previousIndex];
        if (matchedRecentIndex === -1) {
          shortestAugmentingPath = Math.min(shortestAugmentingPath, distanceFromFreeRecent[recentIndex] + 1);
        } else if (distanceFromFreeRecent[matchedRecentIndex] === unreachable) {
          distanceFromFreeRecent[matchedRecentIndex] = distanceFromFreeRecent[recentIndex] + 1;
          queue[queueEnd] = matchedRecentIndex;
          queueEnd += 1;
        }
      }
    }

    return shortestAugmentingPath !== unreachable;
  };

  const augment = (recentIndex: number): boolean => {
    for (let previousIndex = 0; previousIndex < previousActivities.length; previousIndex += 1) {
      if (!findPairCandidate(previousActivities[previousIndex], recentActivities[recentIndex], mode, metric)) continue;
      const matchedRecentIndex = recentForPrevious[previousIndex];
      if (
        (matchedRecentIndex === -1 && distanceFromFreeRecent[recentIndex] + 1 === shortestAugmentingPath) ||
        (matchedRecentIndex !== -1 &&
          distanceFromFreeRecent[matchedRecentIndex] === distanceFromFreeRecent[recentIndex] + 1 &&
          augment(matchedRecentIndex))
      ) {
        previousForRecent[recentIndex] = previousIndex;
        recentForPrevious[previousIndex] = recentIndex;
        return true;
      }
    }
    distanceFromFreeRecent[recentIndex] = unreachable;
    return false;
  };

  while (buildLayers()) {
    for (let recentIndex = 0; recentIndex < recentActivities.length; recentIndex += 1) {
      if (previousForRecent[recentIndex] === -1) augment(recentIndex);
    }
  }

  const pairs: ComparablePair[] = [];
  for (let recentIndex = 0; recentIndex < recentActivities.length; recentIndex += 1) {
    const previousIndex = previousForRecent[recentIndex];
    if (previousIndex === -1) continue;
    const previous = previousActivities[previousIndex];
    const recent = recentActivities[recentIndex];
    const candidate: PairCandidate | null = findPairCandidate(previous, recent, mode, metric);
    if (!candidate) continue;
    pairs.push({
      previous,
      recent,
      previousValue: mode === 'heart_rate' ? candidate.previousOutput : (previous.avg_heart_rate ?? 0),
      recentValue: mode === 'heart_rate' ? (getPerformance(recent, metric) ?? 0) : (recent.avg_heart_rate ?? 0),
    });
  }
  return pairs;
};

const hasAnyMetric = (activities: CardioActivity[], metric: PerformanceMetric): boolean =>
  activities.some(activity => getPerformance(activity, metric) !== null);

const minimumMeaningfulChangePercent = (metric: PerformanceMetric, typicalValue: number, mode: MatchMode): number =>
  mode === 'output' ? (MIN_HEART_RATE_CHANGE_BPM / typicalValue) * 100 : MIN_OUTPUT_CHANGE_PERCENT;

const hasMultiWeekCoverage = (activities: CardioActivity[]): boolean => {
  const timestamps = activities.map(getActivityDate).filter((value): value is number => value !== null);
  if (timestamps.length < MIN_HIGH_CONFIDENCE_WEEKS) return false;
  let first = Number.POSITIVE_INFINITY;
  let last = Number.NEGATIVE_INFINITY;
  for (const timestamp of timestamps) {
    first = Math.min(first, timestamp);
    last = Math.max(last, timestamp);
  }
  const weekBuckets = new Set(timestamps.map(timestamp => Math.floor(timestamp / (7 * DAY_MS))));
  return last - first >= MIN_HIGH_CONFIDENCE_SPAN_DAYS * DAY_MS && weekBuckets.size >= MIN_HIGH_CONFIDENCE_WEEKS;
};

const hasCloseHighConfidenceMatches = (pairs: ComparablePair[], metric: PerformanceMetric): boolean =>
  pairs.every(pair => {
    const durationRatio =
      Math.min(pair.previous.duration_s ?? 0, pair.recent.duration_s ?? 0) /
      Math.max(pair.previous.duration_s ?? 0, pair.recent.duration_s ?? 0);
    if (durationRatio < HIGH_CONFIDENCE_DURATION_RATIO) return false;
    if (metric === 'power') return true;
    if (!isPositive(pair.previous.distance_m) || !isPositive(pair.recent.distance_m)) return false;
    const distanceRatio =
      Math.min(pair.previous.distance_m, pair.recent.distance_m) /
      Math.max(pair.previous.distance_m, pair.recent.distance_m);
    return distanceRatio >= HIGH_CONFIDENCE_DISTANCE_RATIO;
  });

const contextWarningsFor = (
  pairs: ComparablePair[],
  sportType: string,
  metric: PerformanceMetric,
): CardioSportEvolution['contextWarnings'] => {
  const warnings = new Set<CardioSportEvolution['contextWarnings'][number]>();
  if (
    pairs.some(
      pair =>
        pair.previous.avg_temp_c !== null &&
        pair.recent.avg_temp_c !== null &&
        Math.abs(pair.previous.avg_temp_c - pair.recent.avg_temp_c) >= 7,
    )
  ) {
    warnings.add('temperature');
  }
  if (
    pairs.some(pair => {
      if (!isPositive(pair.previous.distance_m) || !isPositive(pair.recent.distance_m)) return false;
      const previousGrade = (pair.previous.elev_gain_m ?? 0) / pair.previous.distance_m;
      const recentGrade = (pair.recent.elev_gain_m ?? 0) / pair.recent.distance_m;
      return Math.abs(previousGrade - recentGrade) * 1000 >= 35;
    })
  ) {
    warnings.add('elevation');
  }
  if (sportType === 'swimming') warnings.add('swimming_sensor');
  if (
    pairs.some(
      pair =>
        pair.previous.provider !== pair.recent.provider ||
        (pair.previous.device_id !== null &&
          pair.recent.device_id !== null &&
          pair.previous.device_id !== pair.recent.device_id),
    )
  ) {
    warnings.add('device');
  }
  if (
    metric === 'speed' &&
    pairs.some(
      pair =>
        !isPositive(pair.previous.avg_speed_m_per_s) ||
        !isPlausibleSpeed(pair.previous.avg_speed_m_per_s, pair.previous) ||
        !isPositive(pair.recent.avg_speed_m_per_s) ||
        !isPlausibleSpeed(pair.recent.avg_speed_m_per_s, pair.recent),
    )
  ) {
    warnings.add('derived_speed');
  }
  if (
    pairs.some(
      pair =>
        normalizeCardioSportSubtype(pair.previous.sport_type, pair.previous.sport_subtype) === null ||
        normalizeCardioSportSubtype(pair.recent.sport_type, pair.recent.sport_subtype) === null,
    )
  ) {
    warnings.add('subtype');
  }
  if (pairs.some(pair => hasInvalidActivityMetrics(pair.previous) || hasInvalidActivityMetrics(pair.recent))) {
    warnings.add('activity_quality');
  }
  return [...warnings];
};

const createInsufficientTrend = (
  sportType: string,
  recentActivityCount: number,
  previousActivityCount: number,
  recentSessionCount: number,
  previousSessionCount: number,
  reason: CardioAnalysisReason,
  measurementCaution = false,
  matchedPairCount = 0,
): CardioSportEvolution => ({
  sportType,
  status: 'insufficient',
  confidence: 'none',
  metric: 'none',
  reason,
  recentActivityCount,
  previousActivityCount,
  recentSessionCount,
  previousSessionCount,
  matchedPairCount,
  recentValue: null,
  previousValue: null,
  changePercent: null,
  heartRateDeltaBpm: null,
  strengthVolumeChangePercent: null,
  measurementCaution,
  contextWarnings: measurementCaution ? ['swimming_sensor'] : [],
});

const getTrendStatus = (pairChanges: number[], resolutionPercent: number): CardioTrendStatus => {
  const center = median(pairChanges);
  if (center === null) return 'insufficient';
  const meaningful = pairChanges.filter(value => Math.abs(value) >= resolutionPercent);
  if (meaningful.length < MIN_MATCHED_PAIRS) return 'stable';
  const positiveShare = meaningful.filter(value => value > 0).length / meaningful.length;
  const negativeShare = meaningful.filter(value => value < 0).length / meaningful.length;
  if (center >= resolutionPercent && positiveShare >= 0.7) return 'improving';
  if (center <= -resolutionPercent && negativeShare >= 0.7) return 'declining';
  return 'stable';
};

const getConfidence = (
  pairCount: number,
  warnings: CardioSportEvolution['contextWarnings'],
  contextIsRecorded: boolean,
  temporalCoverageIsRecorded: boolean,
  comparableLoadIsRecorded: boolean,
): CardioConfidence => {
  if (pairCount < MIN_MATCHED_PAIRS) return 'none';
  if (
    pairCount >= 5 &&
    warnings.length === 0 &&
    contextIsRecorded &&
    temporalCoverageIsRecorded &&
    comparableLoadIsRecorded
  ) {
    return 'high';
  }
  if (pairCount >= 3) return 'medium';
  return 'low';
};

const analyzeEnduranceTrend = (
  previousActivities: CardioActivity[],
  recentActivities: CardioActivity[],
  sportType: string,
  recentWindow: CardioActivity[],
  previousWindow: CardioActivity[],
  recentSessionCount: number,
  previousSessionCount: number,
): CardioSportEvolution => {
  const measurementCaution = sportType === 'swimming';
  const createResult = (
    pairs: ComparablePair[],
    metric: PerformanceMetric,
    mode: MatchMode,
  ): CardioSportEvolution | null => {
    if (pairs.length < MIN_MATCHED_PAIRS) return null;
    const warnings = contextWarningsFor(pairs, sportType, metric);
    const pairChanges = pairs.map(pair =>
      mode === 'heart_rate'
        ? ((pair.recentValue - pair.previousValue) / pair.previousValue) * 100
        : ((pair.previousValue - pair.recentValue) / pair.previousValue) * 100,
    );
    const typicalBaseline = median(pairs.map(pair => pair.previousValue)) ?? 1;
    const absoluteDeviations = pairChanges.map(value => Math.abs(value - (median(pairChanges) ?? value)));
    const medianAbsoluteDeviation = median(absoluteDeviations) ?? 0;
    const significanceThreshold = Math.max(
      minimumMeaningfulChangePercent(metric, typicalBaseline, mode),
      medianAbsoluteDeviation * 1.5,
    );
    const previousValue = median(pairs.map(pair => pair.previousValue));
    const recentValue = median(pairs.map(pair => pair.recentValue));
    const pairedStatus = getTrendStatus(pairChanges, significanceThreshold);
    const aggregateChangePercent =
      previousValue === null || recentValue === null
        ? null
        : mode === 'heart_rate'
          ? ((recentValue - previousValue) / previousValue) * 100
          : ((previousValue - recentValue) / previousValue) * 100;
    const aggregateStatus: CardioTrendStatus =
      aggregateChangePercent === null
        ? 'insufficient'
        : aggregateChangePercent >= significanceThreshold
          ? 'improving'
          : aggregateChangePercent <= -significanceThreshold
            ? 'declining'
            : 'stable';
    // The headline and the displayed median must never tell opposite stories.
    const status = pairedStatus === aggregateStatus ? pairedStatus : 'stable';
    const changePercent =
      previousValue === null || recentValue === null ? null : ((recentValue - previousValue) / previousValue) * 100;
    const contextIsRecorded = pairs.every(
      pair =>
        pair.previous.avg_temp_c !== null &&
        pair.recent.avg_temp_c !== null &&
        pair.previous.elev_gain_m !== null &&
        pair.recent.elev_gain_m !== null &&
        (metric === 'power' || (isPositive(pair.previous.distance_m) && isPositive(pair.recent.distance_m))) &&
        pair.previous.provider === pair.recent.provider &&
        pair.previous.device_id !== null &&
        pair.previous.device_id === pair.recent.device_id &&
        (metric === 'power' || (pair.previous.avg_speed_m_per_s !== null && pair.recent.avg_speed_m_per_s !== null)),
    );
    return {
      sportType,
      status,
      confidence: getConfidence(
        pairs.length,
        warnings,
        contextIsRecorded,
        hasMultiWeekCoverage(pairs.map(pair => pair.previous)) && hasMultiWeekCoverage(pairs.map(pair => pair.recent)),
        hasCloseHighConfidenceMatches(pairs, metric),
      ),
      metric:
        mode === 'heart_rate'
          ? metric === 'power'
            ? 'power_at_similar_hr'
            : 'speed_at_similar_hr'
          : 'hr_at_similar_output',
      reason: 'none',
      recentActivityCount: recentWindow.length,
      previousActivityCount: previousWindow.length,
      recentSessionCount,
      previousSessionCount,
      matchedPairCount: pairs.length,
      recentValue,
      previousValue,
      changePercent: mode === 'heart_rate' ? changePercent : null,
      heartRateDeltaBpm:
        mode === 'output'
          ? recentValue === null || previousValue === null
            ? null
            : recentValue - previousValue
          : null,
      strengthVolumeChangePercent: null,
      measurementCaution,
      contextWarnings: warnings,
    };
  };

  const metricCandidates: PerformanceMetric[] = sportType === 'cycling' ? ['power', 'speed'] : ['speed'];
  let bestInsufficientPairCount = 0;
  let hasComparablePerformanceMetric = false;
  for (const metric of metricCandidates) {
    // Use the raw period windows to distinguish missing performance data from
    // valid metrics on sessions that fail the conservative comparison filters.
    if (!hasAnyMetric(previousWindow, metric) || !hasAnyMetric(recentWindow, metric)) continue;
    hasComparablePerformanceMetric = true;
    if (!hasAnyMetric(previousActivities, metric) || !hasAnyMetric(recentActivities, metric)) continue;

    const atSimilarHeartRate = pairActivities(previousActivities, recentActivities, 'heart_rate', metric);
    const heartRatePairs = createResult(atSimilarHeartRate, metric, 'heart_rate');
    const atSimilarOutput = pairActivities(previousActivities, recentActivities, 'output', metric);
    const outputPairs = createResult(atSimilarOutput, metric, 'output');
    const result =
      heartRatePairs && heartRatePairs.status !== 'stable'
        ? heartRatePairs
        : outputPairs && outputPairs.status !== 'stable'
          ? outputPairs
          : (heartRatePairs ?? outputPairs);
    if (result) return result;
    bestInsufficientPairCount = Math.max(bestInsufficientPairCount, atSimilarHeartRate.length, atSimilarOutput.length);
    // For cycling, sparse power should not suppress a usable speed comparison.
    if (metric === 'power' && bestInsufficientPairCount < MIN_MATCHED_PAIRS) continue;
  }

  if (!hasComparablePerformanceMetric) {
    const recentHeartRate = median(recentWindow.map(activity => activity.avg_heart_rate).filter(isValidHeartRate));
    const previousHeartRate = median(previousWindow.map(activity => activity.avg_heart_rate).filter(isValidHeartRate));
    return {
      sportType,
      status: 'descriptive',
      confidence: recentHeartRate !== null && previousHeartRate !== null ? 'low' : 'none',
      metric: 'heart_rate_response',
      reason: 'no_performance_metric',
      recentActivityCount: recentWindow.length,
      previousActivityCount: previousWindow.length,
      recentSessionCount,
      previousSessionCount,
      matchedPairCount: 0,
      recentValue: recentHeartRate,
      previousValue: previousHeartRate,
      changePercent: null,
      heartRateDeltaBpm:
        recentHeartRate === null || previousHeartRate === null ? null : recentHeartRate - previousHeartRate,
      strengthVolumeChangePercent: null,
      measurementCaution,
      contextWarnings: measurementCaution ? ['swimming_sensor'] : [],
    };
  }
  return createInsufficientTrend(
    sportType,
    recentWindow.length,
    previousWindow.length,
    recentSessionCount,
    previousSessionCount,
    bestInsufficientPairCount > 0 ? 'not_enough_comparable_pairs' : 'no_comparable_sessions',
    measurementCaution,
    bestInsufficientPairCount,
  );
};

const analyzeStrengthResponse = (
  previousActivities: CardioActivity[],
  recentActivities: CardioActivity[],
  sportType: string,
  recentWindow: CardioActivity[],
  previousWindow: CardioActivity[],
  recentSessionCount: number,
  previousSessionCount: number,
): CardioSportEvolution => {
  const previousHeartRate = median(
    previousActivities.map(activity => activity.avg_heart_rate).filter(isValidHeartRate),
  );
  const recentHeartRate = median(recentActivities.map(activity => activity.avg_heart_rate).filter(isValidHeartRate));
  const hasVolumeMatch = (previous: CardioActivity, recent: CardioActivity): boolean => {
    if (
      !recent.workout_template_id ||
      recent.workout_template_id !== previous.workout_template_id ||
      !isSameCardioSportSubtype(recent, previous) ||
      !isPositive(recent.total_volume_kg) ||
      !isPositive(previous.total_volume_kg)
    ) {
      return false;
    }
    return getActivityDate(previous) !== null && getActivityDate(recent) !== null;
  };
  const orderedRecent = recentActivities
    .map(recent => ({
      recent,
      candidateCount: previousActivities.reduce(
        (count, previous) => count + Number(hasVolumeMatch(previous, recent)),
        0,
      ),
    }))
    .sort(
      (left, right) =>
        left.candidateCount - right.candidateCount ||
        (getActivityDate(left.recent) ?? 0) - (getActivityDate(right.recent) ?? 0),
    );
  const usedPreviousSessions = new Set<string>();
  const matchedVolumePairs: { recent: CardioActivity; previous: CardioActivity }[] = [];
  for (const { recent } of orderedRecent) {
    let closestPrevious: CardioActivity | null = null;
    let closestTimeDistance = Number.POSITIVE_INFINITY;
    for (const previous of previousActivities) {
      if (usedPreviousSessions.has(previous.id) || !hasVolumeMatch(previous, recent)) continue;
      const timeDistance = Math.abs((getActivityDate(previous) ?? 0) - (getActivityDate(recent) ?? 0));
      if (timeDistance < closestTimeDistance) {
        closestPrevious = previous;
        closestTimeDistance = timeDistance;
      }
    }
    if (!closestPrevious) continue;
    usedPreviousSessions.add(closestPrevious.id);
    matchedVolumePairs.push({ recent, previous: closestPrevious });
  }
  const volumeComparisons = matchedVolumePairs.map(
    pair => ((pair.recent.total_volume_kg! - pair.previous.total_volume_kg!) / pair.previous.total_volume_kg!) * 100,
  );
  const strengthVolumeChangePercent = volumeComparisons.length >= MIN_MATCHED_PAIRS ? median(volumeComparisons) : null;
  const hasUnknownMatchedSubtype = matchedVolumePairs.some(
    pair =>
      normalizeCardioSportSubtype(pair.previous.sport_type, pair.previous.sport_subtype) === null ||
      normalizeCardioSportSubtype(pair.recent.sport_type, pair.recent.sport_subtype) === null,
  );
  return {
    sportType,
    status: 'descriptive',
    confidence:
      previousHeartRate !== null && recentHeartRate !== null
        ? 'low'
        : strengthVolumeChangePercent !== null
          ? 'low'
          : 'none',
    metric: 'heart_rate_response',
    reason:
      recentHeartRate === null && previousHeartRate === null
        ? strengthVolumeChangePercent === null
          ? 'no_heart_rate'
          : 'none'
        : matchedVolumePairs.length === 0 && previousActivities.length > 0 && recentActivities.length > 0
          ? 'no_comparable_sessions'
          : 'none',
    recentActivityCount: recentWindow.length,
    previousActivityCount: previousWindow.length,
    recentSessionCount,
    previousSessionCount,
    matchedPairCount: matchedVolumePairs.length,
    recentValue: recentHeartRate,
    previousValue: previousHeartRate,
    changePercent: null,
    heartRateDeltaBpm:
      recentHeartRate === null || previousHeartRate === null ? null : recentHeartRate - previousHeartRate,
    strengthVolumeChangePercent,
    measurementCaution: false,
    contextWarnings: hasUnknownMatchedSubtype ? ['subtype'] : [],
  };
};

/** Compares the last four weeks against the preceding four weeks without mixing sports. */
export const analyzeSportEvolution = (
  activities: CardioActivity[],
  sportType: string,
  referenceDate = new Date(),
  period: CardioPeriod = 'month',
): CardioSportEvolution => {
  const reference = referenceDate.getTime();
  const displaySportType = normalizeCardioSportType(sportType);
  const analysisSportType = normalizeSportType(displaySportType) ?? displaySportType;
  const seenIds = new Set<string>();
  const sportActivities = activities.filter(activity => {
    const timestamp = getActivityDate(activity);
    if (timestamp === null || timestamp > reference || seenIds.has(activity.id)) return false;
    if (normalizeCardioSportType(activity.sport_type, activity.sport_subtype) !== displaySportType) return false;
    seenIds.add(activity.id);
    return true;
  });
  let earliestSportDate = Number.POSITIVE_INFINITY;
  let latestSportDate = Number.NEGATIVE_INFINITY;
  for (const activity of sportActivities) {
    const timestamp = getActivityDate(activity);
    if (timestamp === null) continue;
    earliestSportDate = Math.min(earliestSportDate, timestamp);
    latestSportDate = Math.max(latestSportDate, timestamp);
  }
  const recentWindow: CardioActivity[] = [];
  const previousWindow: CardioActivity[] = [];
  if (period === 'all' && Number.isFinite(earliestSportDate) && Number.isFinite(latestSportDate)) {
    const historyMidpoint = earliestSportDate + (latestSportDate - earliestSportDate) / 2;
    for (const activity of sportActivities) {
      const timestamp = getActivityDate(activity);
      if (timestamp === null) continue;
      (timestamp < historyMidpoint ? previousWindow : recentWindow).push(activity);
    }
  } else if (period !== 'all') {
    const windowDays = PERIOD_WINDOW_DAYS[period];
    const recentStart = reference - windowDays * DAY_MS;
    const previousStart = reference - windowDays * 2 * DAY_MS;
    for (const activity of sportActivities) {
      if (belongsToWindow(activity, recentStart, reference + 1)) recentWindow.push(activity);
      else if (belongsToWindow(activity, previousStart, recentStart)) previousWindow.push(activity);
    }
  }
  const recentSessionCount = recentWindow.filter(activity => isValidHeartRate(activity.avg_heart_rate)).length;
  const previousSessionCount = previousWindow.filter(activity => isValidHeartRate(activity.avg_heart_rate)).length;
  const measurementCaution = analysisSportType === 'swimming';
  const hasInvalidHeartRate = [...recentWindow, ...previousWindow].some(
    activity => activity.avg_heart_rate !== null && !isValidHeartRate(activity.avg_heart_rate),
  );
  const hasInvalidActivityMetric = [...recentWindow, ...previousWindow].some(hasInvalidActivityMetrics);
  const addDataQualityWarnings = (result: CardioSportEvolution): CardioSportEvolution => {
    const warnings = new Set(result.contextWarnings);
    if (hasInvalidHeartRate && result.reason !== 'invalid_heart_rate') warnings.add('heart_rate_quality');
    if (hasInvalidActivityMetric) warnings.add('activity_quality');
    if (warnings.size === result.contextWarnings.length) return result;
    return {
      ...result,
      confidence: result.confidence === 'high' ? 'medium' : result.confidence === 'medium' ? 'low' : result.confidence,
      contextWarnings: [...warnings],
    };
  };
  if (sportActivities.length === 0) {
    return addDataQualityWarnings(
      createInsufficientTrend(displaySportType, 0, 0, 0, 0, 'no_activities', measurementCaution),
    );
  }
  if (recentWindow.length === 0) {
    return addDataQualityWarnings(
      createInsufficientTrend(
        displaySportType,
        0,
        previousWindow.length,
        0,
        previousSessionCount,
        'no_recent_activities',
        measurementCaution,
      ),
    );
  }
  if (recentSessionCount === 0 && previousSessionCount > 0) {
    return addDataQualityWarnings(
      createInsufficientTrend(
        displaySportType,
        recentWindow.length,
        previousWindow.length,
        0,
        previousSessionCount,
        'no_recent_heart_rate',
        measurementCaution,
      ),
    );
  }

  if (analysisSportType === 'strength') {
    return addDataQualityWarnings(
      analyzeStrengthResponse(
        previousWindow,
        recentWindow,
        displaySportType,
        recentWindow,
        previousWindow,
        recentSessionCount,
        previousSessionCount,
      ),
    );
  }

  const hasValidHeartRate = recentSessionCount + previousSessionCount > 0;
  if (!hasValidHeartRate) {
    return addDataQualityWarnings(
      createInsufficientTrend(
        displaySportType,
        recentWindow.length,
        previousWindow.length,
        recentSessionCount,
        previousSessionCount,
        hasInvalidHeartRate ? 'invalid_heart_rate' : 'no_heart_rate',
        measurementCaution,
      ),
    );
  }

  const recentActivities = validEnduranceActivities(recentWindow, displaySportType);
  const previousActivities = validEnduranceActivities(previousWindow, displaySportType);
  const enduranceMetric = performanceMetricFor(analysisSportType, null);
  if (enduranceMetric)
    return addDataQualityWarnings(
      analyzeEnduranceTrend(
        previousActivities,
        recentActivities,
        displaySportType,
        recentWindow,
        previousWindow,
        recentSessionCount,
        previousSessionCount,
      ),
    );

  const previousHeartRate = median(previousWindow.map(activity => activity.avg_heart_rate).filter(isValidHeartRate));
  const recentHeartRate = median(recentWindow.map(activity => activity.avg_heart_rate).filter(isValidHeartRate));
  return addDataQualityWarnings({
    sportType: displaySportType,
    status: 'descriptive',
    confidence: previousHeartRate !== null && recentHeartRate !== null ? 'low' : 'none',
    metric: 'heart_rate_response',
    reason: 'no_performance_metric',
    recentActivityCount: recentWindow.length,
    previousActivityCount: previousWindow.length,
    recentSessionCount,
    previousSessionCount,
    matchedPairCount: 0,
    recentValue: recentHeartRate,
    previousValue: previousHeartRate,
    changePercent: null,
    heartRateDeltaBpm:
      recentHeartRate === null || previousHeartRate === null ? null : recentHeartRate - previousHeartRate,
    strengthVolumeChangePercent: null,
    measurementCaution: false,
    contextWarnings: [],
  });
};

/** Weekly counts and zone totals are descriptive; they do not grade training against an unknown goal. */
export const summarizeCardioWeek = (
  activities: CardioActivity[],
  zoneTimes: CardioZoneTime[],
  referenceDate = new Date(),
): WeeklyCardioSummary => {
  const start = referenceDate.getTime() - 7 * DAY_MS;
  const seenActivityIds = new Set<string>();
  const weekActivities = activities.filter(activity => {
    const activityDate = getActivityDate(activity);
    if (
      activityDate === null ||
      activityDate < start ||
      activityDate > referenceDate.getTime() ||
      seenActivityIds.has(activity.id)
    ) {
      return false;
    }
    seenActivityIds.add(activity.id);
    return true;
  });
  const activitiesWithHeartRate = weekActivities.filter(activity => isValidHeartRate(activity.avg_heart_rate));
  const activityIds = new Set(weekActivities.map(activity => activity.id));
  const zoneTimeSeconds: [number, number, number, number, number] = [0, 0, 0, 0, 0];
  for (const zoneTime of zoneTimes) {
    if (
      !activityIds.has(zoneTime.session_id) ||
      !Number.isInteger(zoneTime.zone) ||
      zoneTime.zone < 1 ||
      zoneTime.zone > 5
    ) {
      continue;
    }
    if (Number.isFinite(zoneTime.duration_s) && zoneTime.duration_s > 0)
      zoneTimeSeconds[zoneTime.zone - 1] += zoneTime.duration_s;
  }
  const durationSeconds = activitiesWithHeartRate.reduce(
    (sum, activity) => sum + (isPositive(activity.duration_s) ? activity.duration_s : 0),
    0,
  );
  return {
    sessionCount: activitiesWithHeartRate.length,
    durationMinutes: Math.round(durationSeconds / 60),
    heartRateSessionCount: activitiesWithHeartRate.length,
    medianHeartRate: median(activitiesWithHeartRate.map(activity => activity.avg_heart_rate).filter(isValidHeartRate)),
    zoneTimeSeconds,
    zoneDataAvailable: zoneTimeSeconds.some(seconds => seconds > 0),
  };
};

const resolveOffset = (sample: CardioStreamSample, sessionStartTime?: string): number | null => {
  if (sample.offset_s !== null && Number.isFinite(sample.offset_s) && sample.offset_s >= 0) return sample.offset_s;
  if (!sample.timestamp || !sessionStartTime) return null;
  const offset = (Date.parse(sample.timestamp) - Date.parse(sessionStartTime)) / 1000;
  return Number.isFinite(offset) && offset >= 0 ? offset : null;
};

/** Calculates within-session output/HR decoupling only for long, steady sessions with adequate samples. */
export const analyzeCardiacDrift = (
  samples: CardioStreamSample[],
  sessionId: string,
  sportType: string,
  durationSeconds: number,
  sessionStartTime?: string,
): CardiacDriftResult | null => {
  if (durationSeconds < 45 * 60 || !['running', 'trail', 'cycling'].includes(sportType)) return null;
  const minimumHalfCoverageSeconds = durationSeconds / 4;
  const maximumSampleGapSeconds = 5 * 60;
  const hasPower = samples.some(sample => sample.session_id === sessionId && sample.stream_type === 'power');
  const analyzeWithOutput = (
    outputMetric: CardiacDriftResult['outputMetric'],
  ): { result: CardiacDriftResult | null; hasEnoughSamples: boolean } => {
    const paired = new Map<number, { heartRate: number[]; output: number[] }>();
    for (const sample of samples) {
      if (sample.session_id !== sessionId) continue;
      const offset = resolveOffset(sample, sessionStartTime);
      if (offset === null || offset > durationSeconds) continue;
      const bucket = Math.floor(offset / 30);
      const values = paired.get(bucket) ?? { heartRate: [], output: [] };
      if (sample.stream_type === 'heart_rate' && sample.value >= 40 && sample.value <= 220)
        values.heartRate.push(sample.value);
      if (sample.stream_type === outputMetric && sample.value > 0) values.output.push(sample.value);
      paired.set(bucket, values);
    }
    const halfway = durationSeconds / 2;
    const firstHalf: { offset: number; heartRate: number; output: number }[] = [];
    const secondHalf: { offset: number; heartRate: number; output: number }[] = [];
    for (const [bucket, readings] of paired) {
      const heartRate = median(readings.heartRate);
      const output = median(readings.output);
      if (heartRate === null || output === null) continue;
      if (outputMetric === 'speed' && output < 0.5) continue;
      if (outputMetric === 'power' && output < 10) continue;
      const entry = { offset: bucket * 30, heartRate, output };
      (bucket * 30 < halfway ? firstHalf : secondHalf).push(entry);
    }
    const hasAdequateCoverage = (half: typeof firstHalf) => {
      if (half.length < 10) return false;
      const offsets = half.map(entry => entry.offset).sort((left, right) => left - right);
      if (offsets[offsets.length - 1] - offsets[0] < minimumHalfCoverageSeconds) return false;
      return offsets.every((offset, index) => index === 0 || offset - offsets[index - 1] <= maximumSampleGapSeconds);
    };
    if (!hasAdequateCoverage(firstHalf) || !hasAdequateCoverage(secondHalf))
      return { result: null, hasEnoughSamples: false };
    const firstHeartRate = median(firstHalf.map(sample => sample.heartRate));
    const secondHeartRate = median(secondHalf.map(sample => sample.heartRate));
    const firstOutput = median(firstHalf.map(sample => sample.output));
    const secondOutput = median(secondHalf.map(sample => sample.output));
    if (firstHeartRate === null || secondHeartRate === null || firstOutput === null || secondOutput === null)
      return { result: null, hasEnoughSamples: false };
    const outputChangePercent = ((secondOutput - firstOutput) / firstOutput) * 100;
    if (Math.abs(outputChangePercent) > 10) return { result: null, hasEnoughSamples: true };
    const firstEfficiency = firstOutput / firstHeartRate;
    const secondEfficiency = secondOutput / secondHeartRate;
    return {
      result: {
        decouplingPercent: ((firstEfficiency - secondEfficiency) / firstEfficiency) * 100,
        firstHalfHeartRate: firstHeartRate,
        secondHalfHeartRate: secondHeartRate,
        outputChangePercent,
        outputMetric,
        pairedSampleCount: firstHalf.length + secondHalf.length,
      },
      hasEnoughSamples: true,
    };
  };

  if (sportType === 'cycling' && hasPower) {
    const powerAnalysis = analyzeWithOutput('power');
    if (powerAnalysis.hasEnoughSamples) return powerAnalysis.result;
  }
  return analyzeWithOutput('speed').result;
};

/** Describes HR drop after repeated recorded peaks; it is not a clinical recovery test. */
export const analyzeIntervalHeartRateRecovery = (
  samples: CardioStreamSample[],
  sessionId: string,
  durationSeconds: number,
  sessionStartTime?: string,
): CardiacIntervalRecoveryResult | null => {
  if (durationSeconds < 12 * 60) return null;
  const readingsByBucket = new Map<number, number[]>();
  for (const sample of samples) {
    if (sample.session_id !== sessionId || sample.stream_type !== 'heart_rate') continue;
    const offset = resolveOffset(sample, sessionStartTime);
    if (offset === null || offset > durationSeconds || !isValidHeartRate(sample.value)) continue;
    const bucket = Math.floor(offset / 30);
    const readings = readingsByBucket.get(bucket) ?? [];
    readings.push(sample.value);
    readingsByBucket.set(bucket, readings);
  }
  const readings = [...readingsByBucket.entries()]
    .map(([bucket, values]) => ({ offset: bucket * 30, heartRate: median(values) }))
    .filter((reading): reading is { offset: number; heartRate: number } => reading.heartRate !== null)
    .sort((left, right) => left.offset - right.offset);
  if (readings.length < 20) return null;
  const baseline = median(readings.map(reading => reading.heartRate));
  if (baseline === null) return null;
  const candidates = readings.filter((reading, index) => {
    const previous = readings[index - 1];
    const next = readings[index + 1];
    return (
      previous !== undefined &&
      next !== undefined &&
      reading.offset >= 60 &&
      reading.offset <= durationSeconds - 75 &&
      reading.heartRate >= baseline + 8 &&
      reading.heartRate >= previous.heartRate + 3 &&
      reading.heartRate >= next.heartRate + 3
    );
  });
  const selectedPeaks: typeof candidates = [];
  for (const candidate of candidates) {
    if (selectedPeaks.length > 0 && candidate.offset - selectedPeaks[selectedPeaks.length - 1].offset < 180) continue;
    selectedPeaks.push(candidate);
  }
  const heartRateDrops = selectedPeaks.flatMap(peak => {
    if (selectedPeaks.some(other => other.offset > peak.offset && other.offset <= peak.offset + 75)) return [];
    const recovery = readings
      .filter(reading => reading.offset - peak.offset >= 45 && reading.offset - peak.offset <= 75)
      .sort((left, right) => Math.abs(left.offset - peak.offset - 60) - Math.abs(right.offset - peak.offset - 60))[0];
    if (!recovery || recovery.heartRate > peak.heartRate) return [];
    return [peak.heartRate - recovery.heartRate];
  });
  if (heartRateDrops.length < 3) return null;
  const averageHeartRateDropBpm = median(heartRateDrops);
  if (averageHeartRateDropBpm === null) return null;
  return {
    averageHeartRateDropBpm,
    detectedPeakCount: heartRateDrops.length,
    sampleCount: readings.length,
    confidence: heartRateDrops.length >= 5 ? 'medium' : 'low',
  };
};
