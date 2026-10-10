import type { TranslationKey } from '../../../i18n/locales/en';
import type { CardioSportEvaluation, CardioPerformanceDimension } from './cardioSportEvaluation';

export type CardioTranslationOptions = Record<string, unknown>;
export type CardioTranslationCopy = { key: TranslationKey; options: CardioTranslationOptions };

export const buildCardioMeaningTranslationOptions = (assessment: CardioSportEvaluation): CardioTranslationOptions => ({
  recent: assessment.cardiovascular.recentMedianBpm ?? '—',
  previous: assessment.cardiovascular.previousMedianBpm ?? '—',
  delta:
    assessment.cardiovascular.deltaBpm === null
      ? '—'
      : `${assessment.cardiovascular.deltaBpm > 0 ? '+' : ''}${Math.round(assessment.cardiovascular.deltaBpm)}`,
  sessions: assessment.cardiovascular.recentSessionCount,
  recentTotalSessions: assessment.volume.recent.sessionCount,
  minutes: assessment.volume.recent.durationMinutes ?? 0,
  previousSessions: assessment.volume.previous.sessionCount,
  previousMinutes: assessment.volume.previous.durationMinutes ?? 0,
});

export const getCardioOnePeriodHeartRateMeaningKey = (assessment: CardioSportEvaluation): TranslationKey => {
  if (assessment.cardiovascular.recentMedianBpm !== null && assessment.cardiovascular.previousMedianBpm !== null)
    return 'health.cardioAssessmentMeaningC';
  if (assessment.cardiovascular.previousMedianBpm === null) {
    return assessment.volume.previous.sessionCount > 0
      ? 'health.cardioAssessmentMeaningCOnlyRecentWithEarlierSessions'
      : 'health.cardioAssessmentMeaningCOnlyRecent';
  }
  return assessment.volume.recent.sessionCount > 0
    ? 'health.cardioAssessmentMeaningCOnlyPreviousWithRecentSessions'
    : 'health.cardioAssessmentMeaningCOnlyPrevious';
};

const formatPercent = (value: number): string => `${value > 0 ? '+' : ''}${value.toFixed(1)}`;

export const getCardioPerformanceChangeCopy = (performance: CardioPerformanceDimension): CardioTranslationCopy => {
  const change = performance.changePercent;
  if (performance.metric === 'lap_pace') {
    return {
      key: 'health.cardioMetricLapComparison',
      options: {
        distance: performance.comparedSplitDistanceM ?? '—',
        change: change === null ? '—' : formatPercent(change),
        recent: performance.recentSessionCount,
        previous: performance.previousSessionCount,
      },
    };
  }
  if (change === null) return { key: 'health.cardioMetricNoMatchedPerformance', options: {} };
  if (performance.valuesSource === 'period_medians') {
    return {
      key: 'health.cardioMetricDescriptivePeriodMedians',
      options: {
        change: formatPercent(change),
        recent: performance.recentSessionCount,
        previous: performance.previousSessionCount,
      },
    };
  }
  const power = performance.metric === 'power';
  const similarHeartRate = performance.valuesSource === 'similar_heart_rate_pairs';
  const key: TranslationKey = power
    ? similarHeartRate
      ? 'health.cardioMetricSimilarHrPowerPairs'
      : 'health.cardioMetricMatchedPowerPairs'
    : similarHeartRate
      ? 'health.cardioMetricSimilarHrSpeedPairs'
      : 'health.cardioMetricMatchedSpeedPairs';
  return {
    key,
    options: {
      change: formatPercent(change),
      count: performance.changePairCount,
      hrCount: performance.matchedAtSimilarHeartRatePairCount,
    },
  };
};
