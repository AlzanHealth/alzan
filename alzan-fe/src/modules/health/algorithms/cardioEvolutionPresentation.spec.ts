import assert from 'node:assert/strict';
import { getCardioEvolutionPresentation, shouldShowCardioIntervalRecovery } from './cardioEvolutionPresentation';
import type { CardioSportEvolution } from './cardioEvolution';

const result: CardioSportEvolution = {
  sportType: 'running',
  status: 'descriptive',
  confidence: 'none',
  metric: 'heart_rate_response',
  reason: 'no_performance_metric',
  recentActivityCount: 2,
  previousActivityCount: 2,
  recentSessionCount: 2,
  previousSessionCount: 2,
  matchedPairCount: 0,
  recentValue: 145,
  previousValue: 150,
  changePercent: null,
  heartRateDeltaBpm: -5,
  strengthVolumeChangePercent: null,
  measurementCaution: false,
  contextWarnings: [],
};

const runningPresentation = getCardioEvolutionPresentation(result, 'running');
assert.equal(runningPresentation.meaningTranslationKey, 'health.cardioDescriptiveMeaning');
assert.equal(runningPresentation.recommendationTranslationKey, 'health.cardioDescriptiveRecommendation');
assert.equal(runningPresentation.showsPerformanceComparison, false);

const gymPresentation = getCardioEvolutionPresentation({ ...result, sportType: 'gym' }, 'gym');
assert.equal(gymPresentation.meaningTranslationKey, 'health.cardioStrengthMeaning');
assert.equal(gymPresentation.recommendationTranslationKey, 'health.cardioStrengthRecommendation');

const noHeartRatePresentation = getCardioEvolutionPresentation(
  { ...result, reason: 'no_heart_rate', status: 'insufficient', metric: 'none' },
  'running',
);
assert.equal(noHeartRatePresentation.statusTranslationKey, 'health.cardioStatusNoHeartRate');
assert.equal(noHeartRatePresentation.meaningTranslationKey, 'health.cardioNoHeartRateMeaning');

const noRecentActivitiesPresentation = getCardioEvolutionPresentation(
  { ...result, reason: 'no_recent_activities', status: 'insufficient', metric: 'none' },
  'running',
);
assert.equal(noRecentActivitiesPresentation.statusTranslationKey, 'health.cardioStatusNoRecentActivities');
assert.equal(noRecentActivitiesPresentation.meaningTranslationKey, 'health.cardioNoRecentActivitiesMeaning');

const noRecentHeartRatePresentation = getCardioEvolutionPresentation(
  { ...result, reason: 'no_recent_heart_rate', status: 'insufficient', metric: 'none' },
  'running',
);
assert.equal(noRecentHeartRatePresentation.statusTranslationKey, 'health.cardioStatusNoRecentHeartRate');

const improvingPresentation = getCardioEvolutionPresentation(
  { ...result, status: 'improving', reason: 'none', metric: 'speed_at_similar_hr' },
  'running',
);
assert.equal(improvingPresentation.meaningTranslationKey, 'health.cardioPositiveOutputMeaning');
assert.equal(improvingPresentation.showsPerformanceComparison, true);

assert.equal(shouldShowCardioIntervalRecovery('running', { running: null }), true);
assert.equal(shouldShowCardioIntervalRecovery('running', {}), false);
assert.equal(shouldShowCardioIntervalRecovery('football', {}), true);
