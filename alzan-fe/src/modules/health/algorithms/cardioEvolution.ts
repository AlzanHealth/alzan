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
  recentSessionCount: number;
  previousSessionCount: number;
  matchedPairCount: number;
  recentValue: number | null;
  previousValue: number | null;
  changePercent: number | null;
  heartRateDeltaBpm: number | null;
  strengthVolumeChangePercent: number | null;
  measurementCaution: boolean;
  contextWarnings: ('temperature' | 'elevation' | 'derived_speed' | 'swimming_sensor' | 'device')[];
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

const median = (values: number[]): number | null => {
  const valid = values.filter(Number.isFinite).sort((left, right) => left - right);
  if (valid.length === 0) return null;
  const middle = Math.floor(valid.length / 2);
  return valid.length % 2 === 0 ? (valid[middle - 1] + valid[middle]) / 2 : valid[middle];
};

const isValidHeartRate = (value: number | null): value is number =>
  value !== null && Number.isFinite(value) && value >= 40 && value <= 220;

const isPositive = (value: number | null): value is number => value !== null && Number.isFinite(value) && value > 0;

const getSpeed = (activity: CardioActivity): number | null => {
  if (isPositive(activity.avg_speed_m_per_s)) return activity.avg_speed_m_per_s;
  if (isPositive(activity.distance_m) && isPositive(activity.duration_s))
    return activity.distance_m / activity.duration_s;
  return null;
};

const getPerformance = (activity: CardioActivity, metric: PerformanceMetric): number | null =>
  metric === 'power' ? (isPositive(activity.avg_power_w) ? activity.avg_power_w : null) : getSpeed(activity);

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

const belongsToWindow = (activity: CardioActivity, start: number, end: number): boolean => {
  const timestamp = getActivityDate(activity);
  return timestamp !== null && timestamp >= start && timestamp < end;
};

const validEnduranceActivities = (activities: CardioActivity[], sportType: string): CardioActivity[] =>
  activities.filter(
    activity =>
      activity.sport_type === sportType &&
      (activity.duration_s ?? 0) >= MIN_SESSION_DURATION_SECONDS &&
      isValidHeartRate(activity.avg_heart_rate),
  );

const comparableContext = (previous: CardioActivity, recent: CardioActivity): boolean => {
  if (previous.sport_subtype && recent.sport_subtype && previous.sport_subtype !== recent.sport_subtype) return false;
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

const pairActivities = (
  previousActivities: CardioActivity[],
  recentActivities: CardioActivity[],
  mode: MatchMode,
  metric: PerformanceMetric,
): ComparablePair[] => {
  const candidates = recentActivities.flatMap(recent =>
    previousActivities.flatMap(previous => {
      if (!comparableContext(previous, recent)) return [];
      const previousOutput = getPerformance(previous, metric);
      const recentOutput = getPerformance(recent, metric);
      if (!isPositive(previousOutput) || !isPositive(recentOutput)) return [];
      if (mode === 'heart_rate') {
        const heartRateDifference = Math.abs((recent.avg_heart_rate ?? 0) - (previous.avg_heart_rate ?? 0));
        if (heartRateDifference > MAX_HEART_RATE_DIFFERENCE_BPM) return [];
        return [
          { previous, recent, previousValue: previousOutput, recentValue: recentOutput, distance: heartRateDifference },
        ];
      }
      const outputRatio = recentOutput / previousOutput;
      if (outputRatio < MIN_OUTPUT_RATIO || outputRatio > MAX_OUTPUT_RATIO) return [];
      return [
        {
          previous,
          recent,
          previousValue: previous.avg_heart_rate ?? 0,
          recentValue: recent.avg_heart_rate ?? 0,
          distance: Math.abs(1 - outputRatio),
        },
      ];
    }),
  );

  const assignedPrevious = new Set<string>();
  const assignedRecent = new Set<string>();
  const pairs: ComparablePair[] = [];
  for (const candidate of candidates.sort((left, right) => left.distance - right.distance)) {
    if (assignedPrevious.has(candidate.previous.id) || assignedRecent.has(candidate.recent.id)) continue;
    assignedPrevious.add(candidate.previous.id);
    assignedRecent.add(candidate.recent.id);
    pairs.push(candidate);
  }
  return pairs;
};

const hasMetricCoverage = (activities: CardioActivity[], metric: PerformanceMetric): boolean =>
  activities.filter(activity => getPerformance(activity, metric) !== null).length >= MIN_MATCHED_PAIRS;

const minimumMeaningfulChangePercent = (metric: PerformanceMetric, typicalValue: number, mode: MatchMode): number =>
  mode === 'output' ? (MIN_HEART_RATE_CHANGE_BPM / typicalValue) * 100 : MIN_OUTPUT_CHANGE_PERCENT;

const hasMultiWeekCoverage = (activities: CardioActivity[]): boolean => {
  const timestamps = activities.map(getActivityDate).filter((value): value is number => value !== null);
  if (timestamps.length < MIN_HIGH_CONFIDENCE_WEEKS) return false;
  const first = Math.min(...timestamps);
  const last = Math.max(...timestamps);
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

const contextWarningsFor = (pairs: ComparablePair[], sportType: string): CardioSportEvolution['contextWarnings'] => {
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
  if (pairs.some(pair => pair.previous.avg_speed_m_per_s === null || pair.recent.avg_speed_m_per_s === null)) {
    warnings.add('derived_speed');
  }
  return [...warnings];
};

const createInsufficientTrend = (
  sportType: string,
  recentSessionCount: number,
  previousSessionCount: number,
  measurementCaution = false,
): CardioSportEvolution => ({
  sportType,
  status: 'insufficient',
  confidence: 'none',
  metric: 'none',
  recentSessionCount,
  previousSessionCount,
  matchedPairCount: 0,
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
): CardioSportEvolution => {
  const measurementCaution = sportType === 'swimming';
  const createResult = (
    pairs: ComparablePair[],
    metric: PerformanceMetric,
    mode: MatchMode,
  ): CardioSportEvolution | null => {
    if (pairs.length < MIN_MATCHED_PAIRS) return null;
    const warnings = contextWarningsFor(pairs, sportType);
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
    const status = getTrendStatus(pairChanges, significanceThreshold);
    const previousValue = median(pairs.map(pair => pair.previousValue));
    const recentValue = median(pairs.map(pair => pair.recentValue));
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
      recentSessionCount: recentActivities.length,
      previousSessionCount: previousActivities.length,
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

  const metric: PerformanceMetric =
    sportType === 'cycling' &&
    hasMetricCoverage(previousActivities, 'power') &&
    hasMetricCoverage(recentActivities, 'power')
      ? 'power'
      : 'speed';
  const metricAvailable = hasMetricCoverage(previousActivities, metric) && hasMetricCoverage(recentActivities, metric);
  if (!metricAvailable)
    return createInsufficientTrend(sportType, recentActivities.length, previousActivities.length, measurementCaution);

  const atSimilarHeartRate = pairActivities(previousActivities, recentActivities, 'heart_rate', metric);
  const heartRatePairs = createResult(atSimilarHeartRate, metric, 'heart_rate');
  const atSimilarOutput = pairActivities(previousActivities, recentActivities, 'output', metric);
  const outputPairs = createResult(atSimilarOutput, metric, 'output');
  if (heartRatePairs && heartRatePairs.status !== 'stable') return heartRatePairs;
  if (outputPairs && outputPairs.status !== 'stable') return outputPairs;
  return (
    heartRatePairs ??
    outputPairs ??
    createInsufficientTrend(sportType, recentActivities.length, previousActivities.length, measurementCaution)
  );
};

const analyzeStrengthResponse = (
  previousActivities: CardioActivity[],
  recentActivities: CardioActivity[],
  sportType: string,
): CardioSportEvolution => {
  const previousHeartRate = median(
    previousActivities.map(activity => activity.avg_heart_rate).filter(isValidHeartRate),
  );
  const recentHeartRate = median(recentActivities.map(activity => activity.avg_heart_rate).filter(isValidHeartRate));
  const matchingTemplateIds = new Set(
    previousActivities.map(activity => activity.workout_template_id).filter((id): id is string => id !== null),
  );
  const volumeCandidates = recentActivities.flatMap(recent =>
    previousActivities.flatMap(previous => {
      if (
        !recent.workout_template_id ||
        recent.workout_template_id !== previous.workout_template_id ||
        !matchingTemplateIds.has(recent.workout_template_id) ||
        !isPositive(recent.total_volume_kg) ||
        !isPositive(previous.total_volume_kg)
      ) {
        return [];
      }
      const recentTime = Date.parse(recent.start_time);
      const previousTime = Date.parse(previous.start_time);
      if (!Number.isFinite(recentTime) || !Number.isFinite(previousTime)) return [];
      return [{ recent, previous, distance: Math.abs(recentTime - previousTime) }];
    }),
  );
  const usedPreviousSessions = new Set<string>();
  const usedRecentSessions = new Set<string>();
  const matchedVolumePairs = volumeCandidates
    .sort((left, right) => left.distance - right.distance)
    .filter(pair => {
      if (usedPreviousSessions.has(pair.previous.id) || usedRecentSessions.has(pair.recent.id)) return false;
      usedPreviousSessions.add(pair.previous.id);
      usedRecentSessions.add(pair.recent.id);
      return true;
    });
  const volumeComparisons = matchedVolumePairs.map(
    pair => ((pair.recent.total_volume_kg! - pair.previous.total_volume_kg!) / pair.previous.total_volume_kg!) * 100,
  );
  const strengthVolumeChangePercent = volumeComparisons.length >= MIN_MATCHED_PAIRS ? median(volumeComparisons) : null;
  return {
    sportType,
    status: 'descriptive',
    confidence: previousHeartRate !== null && recentHeartRate !== null ? 'low' : 'none',
    metric: 'heart_rate_response',
    recentSessionCount: recentActivities.length,
    previousSessionCount: previousActivities.length,
    matchedPairCount: matchedVolumePairs.length,
    recentValue: recentHeartRate,
    previousValue: previousHeartRate,
    changePercent: null,
    heartRateDeltaBpm:
      recentHeartRate === null || previousHeartRate === null ? null : recentHeartRate - previousHeartRate,
    strengthVolumeChangePercent,
    measurementCaution: false,
    contextWarnings: [],
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
  const sportActivities = activities.filter(activity => activity.sport_type === sportType);
  const earliestSportDate = sportActivities
    .map(getActivityDate)
    .filter((value): value is number => value !== null && value <= reference)
    .sort((left, right) => left - right)[0];
  const allHistoryDays =
    earliestSportDate === undefined ? COMPARISON_WINDOW_DAYS : Math.max(2, (reference - earliestSportDate) / DAY_MS);
  const windowDays = period === 'all' ? Math.max(1, Math.floor(allHistoryDays / 2)) : PERIOD_WINDOW_DAYS[period];
  const recentStart = reference - windowDays * DAY_MS;
  const previousStart = reference - windowDays * 2 * DAY_MS;
  const recentWindow = sportActivities.filter(activity => belongsToWindow(activity, recentStart, reference + 1));
  const previousWindow = sportActivities.filter(activity => belongsToWindow(activity, previousStart, recentStart));
  const recentActivities = validEnduranceActivities(recentWindow, sportType);
  const previousActivities = validEnduranceActivities(previousWindow, sportType);
  const enduranceMetric = performanceMetricFor(sportType, sportActivities[0]?.sport_subtype ?? null);
  if (enduranceMetric) return analyzeEnduranceTrend(previousActivities, recentActivities, sportType);
  if (sportType === 'strength' || sportType === 'gym') {
    return analyzeStrengthResponse(previousWindow, recentWindow, sportType);
  }
  const previousHeartRate = median(previousWindow.map(activity => activity.avg_heart_rate).filter(isValidHeartRate));
  const recentHeartRate = median(recentWindow.map(activity => activity.avg_heart_rate).filter(isValidHeartRate));
  return {
    sportType,
    status: 'descriptive',
    confidence: previousHeartRate !== null && recentHeartRate !== null ? 'low' : 'none',
    metric: 'heart_rate_response',
    recentSessionCount: recentWindow.length,
    previousSessionCount: previousWindow.length,
    matchedPairCount: 0,
    recentValue: recentHeartRate,
    previousValue: previousHeartRate,
    changePercent: null,
    heartRateDeltaBpm:
      recentHeartRate === null || previousHeartRate === null ? null : recentHeartRate - previousHeartRate,
    strengthVolumeChangePercent: null,
    measurementCaution: false,
    contextWarnings: [],
  };
};

/** Weekly counts and zone totals are descriptive; they do not grade training against an unknown goal. */
export const summarizeCardioWeek = (
  activities: CardioActivity[],
  zoneTimes: CardioZoneTime[],
  referenceDate = new Date(),
): WeeklyCardioSummary => {
  const start = referenceDate.getTime() - 7 * DAY_MS;
  const weekActivities = activities.filter(activity => {
    const activityDate = getActivityDate(activity);
    return activityDate !== null && activityDate >= start && activityDate <= referenceDate.getTime();
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
  const hasPower = samples.some(sample => sample.session_id === sessionId && sample.stream_type === 'power');
  const outputMetric: CardiacDriftResult['outputMetric'] = sportType === 'cycling' && hasPower ? 'power' : 'speed';
  const paired = new Map<number, { heartRate: number | null; output: number | null }>();
  for (const sample of samples) {
    if (sample.session_id !== sessionId) continue;
    const offset = resolveOffset(sample, sessionStartTime);
    if (offset === null || offset > durationSeconds) continue;
    const bucket = Math.floor(offset / 30);
    const values = paired.get(bucket) ?? { heartRate: null, output: null };
    if (sample.stream_type === 'heart_rate' && sample.value >= 40 && sample.value <= 220)
      values.heartRate = sample.value;
    if (sample.stream_type === outputMetric && sample.value > 0) values.output = sample.value;
    paired.set(bucket, values);
  }
  const halfway = durationSeconds / 2;
  const firstHalf: { heartRate: number; output: number }[] = [];
  const secondHalf: { heartRate: number; output: number }[] = [];
  for (const [bucket, values] of paired) {
    if (values.heartRate === null || values.output === null) continue;
    if (outputMetric === 'speed' && values.output < 0.5) continue;
    if (outputMetric === 'power' && values.output < 10) continue;
    const entry = { heartRate: values.heartRate, output: values.output };
    (bucket * 30 < halfway ? firstHalf : secondHalf).push(entry);
  }
  if (firstHalf.length < 10 || secondHalf.length < 10) return null;
  const firstHeartRate = median(firstHalf.map(sample => sample.heartRate));
  const secondHeartRate = median(secondHalf.map(sample => sample.heartRate));
  const firstOutput = median(firstHalf.map(sample => sample.output));
  const secondOutput = median(secondHalf.map(sample => sample.output));
  if (firstHeartRate === null || secondHeartRate === null || firstOutput === null || secondOutput === null) return null;
  const outputChangePercent = ((secondOutput - firstOutput) / firstOutput) * 100;
  if (Math.abs(outputChangePercent) > 10) return null;
  const firstEfficiency = firstOutput / firstHeartRate;
  const secondEfficiency = secondOutput / secondHeartRate;
  return {
    decouplingPercent: ((firstEfficiency - secondEfficiency) / firstEfficiency) * 100,
    firstHalfHeartRate: firstHeartRate,
    secondHalfHeartRate: secondHeartRate,
    outputChangePercent,
    outputMetric,
    pairedSampleCount: firstHalf.length + secondHalf.length,
  };
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
    readingsByBucket.set(bucket, [...(readingsByBucket.get(bucket) ?? []), sample.value]);
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
