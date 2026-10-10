import type { TranslationKey } from '../../../i18n/locales/en';
import type {
  CardiacIntervalRecoveryResult,
  CardioAnalysisReason,
  CardioSportEvolution,
  CardioTrendStatus,
} from './cardioEvolution';

const INTERVAL_SPORT_TYPES = new Set([
  'hyrox',
  'football',
  'basketball',
  'tennis',
  'padel',
  'martial_arts',
  'volleyball',
]);

export const shouldShowCardioIntervalRecovery = (
  sportType: string,
  intervalRecoveryBySport: Readonly<Record<string, CardiacIntervalRecoveryResult | null>>,
): boolean =>
  INTERVAL_SPORT_TYPES.has(sportType) || Object.prototype.hasOwnProperty.call(intervalRecoveryBySport, sportType);

export type CardioEvolutionPresentation = {
  statusTranslationKey: TranslationKey;
  metricTranslationKey: TranslationKey;
  meaningTranslationKey: TranslationKey;
  recommendationTranslationKey: TranslationKey;
  showsPerformanceComparison: boolean;
};

const statusTranslationFor = (status: CardioTrendStatus, reason: CardioAnalysisReason): TranslationKey => {
  if (reason === 'no_activities') return 'health.cardioStatusNoActivities';
  if (reason === 'no_recent_activities') return 'health.cardioStatusNoRecentActivities';
  if (reason === 'no_recent_heart_rate') return 'health.cardioStatusNoRecentHeartRate';
  if (reason === 'no_heart_rate') return 'health.cardioStatusNoHeartRate';
  if (reason === 'invalid_heart_rate') return 'health.cardioStatusInvalidHeartRate';
  if (reason === 'no_comparable_sessions') return 'health.cardioStatusNoComparable';
  if (status === 'improving') return 'health.cardioStatusPositive';
  if (status === 'declining') return 'health.cardioStatusDeclining';
  if (status === 'stable') return 'health.cardioStatusStable';
  if (status === 'descriptive') return 'health.cardioStatusDescriptive';
  return 'health.cardioStatusInsufficient';
};

const metricTranslationFor = (result: CardioSportEvolution): TranslationKey => {
  if (result.metric === 'speed_at_similar_hr') return 'health.cardioSpeedAtSimilarHr';
  if (result.metric === 'power_at_similar_hr') return 'health.cardioPowerAtSimilarHr';
  if (result.metric === 'hr_at_similar_output') return 'health.cardioHrAtSimilarOutput';
  if (result.metric === 'heart_rate_response') return 'health.cardioHeartRateResponse';
  return 'health.cardioNoComparableMetric';
};

const meaningTranslationFor = (result: CardioSportEvolution, sportType: string): TranslationKey => {
  if (result.reason === 'no_activities') return 'health.cardioNoActivitiesInPeriod';
  if (result.reason === 'no_recent_activities') return 'health.cardioNoRecentActivitiesMeaning';
  if (result.reason === 'no_recent_heart_rate') return 'health.cardioNoRecentHeartRateMeaning';
  if (result.reason === 'no_heart_rate') return 'health.cardioNoHeartRateMeaning';
  if (result.reason === 'invalid_heart_rate') return 'health.cardioInvalidHeartRateMeaning';
  if (result.reason === 'no_comparable_sessions') return 'health.cardioNoComparableSessionsMeaning';
  if (result.reason === 'not_enough_comparable_pairs') return 'health.cardioNeedMoreData';
  if (result.reason === 'no_performance_metric') {
    return sportType === 'gym' ? 'health.cardioStrengthMeaning' : 'health.cardioDescriptiveMeaning';
  }
  if (result.status === 'improving') {
    return result.metric === 'hr_at_similar_output'
      ? 'health.cardioPositiveHrMeaning'
      : 'health.cardioPositiveOutputMeaning';
  }
  if (result.status === 'declining') return 'health.cardioDecliningMeaning';
  if (result.status === 'stable') return 'health.cardioStableMeaning';
  if (result.status === 'descriptive') {
    return sportType === 'gym' ? 'health.cardioStrengthMeaning' : 'health.cardioDescriptiveMeaning';
  }
  return 'health.cardioNeedMoreData';
};

const recommendationTranslationFor = (result: CardioSportEvolution, sportType: string): TranslationKey => {
  if (result.reason === 'no_activities') return 'health.cardioNoActivitiesRecommendation';
  if (result.reason === 'no_recent_activities') return 'health.cardioNoRecentActivitiesRecommendation';
  if (result.reason === 'no_recent_heart_rate') return 'health.cardioNoRecentHeartRateRecommendation';
  if (result.reason === 'no_heart_rate') return 'health.cardioNoHeartRateRecommendation';
  if (result.reason === 'invalid_heart_rate') return 'health.cardioInvalidHeartRateRecommendation';
  if (result.reason === 'no_comparable_sessions') return 'health.cardioNoComparableSessionsRecommendation';
  if (result.reason === 'not_enough_comparable_pairs') return 'health.cardioNeedMoreRecommendation';
  if (result.reason === 'no_performance_metric') {
    return sportType === 'gym' ? 'health.cardioStrengthRecommendation' : 'health.cardioDescriptiveRecommendation';
  }
  if (result.status === 'improving') return 'health.cardioPositiveRecommendation';
  if (result.status === 'declining') return 'health.cardioDecliningRecommendation';
  if (result.status === 'stable') return 'health.cardioStableRecommendation';
  if (result.status === 'descriptive') {
    return sportType === 'gym' ? 'health.cardioStrengthRecommendation' : 'health.cardioDescriptiveRecommendation';
  }
  return 'health.cardioNeedMoreRecommendation';
};

export const getCardioEvolutionPresentation = (
  result: CardioSportEvolution,
  sportType: string,
): CardioEvolutionPresentation => ({
  statusTranslationKey: statusTranslationFor(result.status, result.reason),
  metricTranslationKey: metricTranslationFor(result),
  meaningTranslationKey: meaningTranslationFor(result, sportType),
  recommendationTranslationKey: recommendationTranslationFor(result, sportType),
  showsPerformanceComparison:
    result.metric !== 'none' &&
    result.metric !== 'heart_rate_response' &&
    result.previousValue !== null &&
    result.recentValue !== null,
});
