import assert from 'node:assert/strict';
import type { CardioSportEvaluation } from './cardioSportEvaluation';
import {
  buildCardioMeaningTranslationOptions,
  getCardioOnePeriodHeartRateMeaningKey,
  getCardioPerformanceChangeCopy,
} from './cardioSportPresentation';

const evaluation: CardioSportEvaluation = {
  sportType: 'running',
  level: 'C',
  confidence: 'low',
  cardiovascular: {
    recentMedianBpm: 150,
    previousMedianBpm: 145,
    deltaBpm: 5,
    recentSessionCount: 1,
    previousSessionCount: 2,
  },
  performance: {
    status: 'descriptive',
    metric: 'speed',
    unit: 'm/s',
    metricSource: 'recorded',
    recentValue: 3,
    previousValue: 2.8,
    valuesSource: 'period_medians',
    changePercent: 7.1,
    recentSessionCount: 1,
    previousSessionCount: 2,
    matchedPairCount: 0,
    changePairCount: 0,
    comparedSplitDistanceM: null,
    matchedAtSimilarHeartRatePairCount: 0,
    matchedContextPairCount: 0,
    recentPairSpanDays: 0,
    previousPairSpanDays: 0,
    sessionIds: [],
  },
  volume: {
    recent: {
      sessionCount: 6,
      sessionIds: [],
      sessionsWithHeartRate: 1,
      medianHeartRateBpm: 150,
      sessionsWithMaximumHeartRate: 1,
      medianMaximumHeartRateBpm: 180,
      durationMinutes: 300,
      durationSessionCount: 6,
      distanceKm: null,
      distanceSessionCount: 0,
      elevationGainM: null,
      elevationSessionCount: 0,
      strengthVolumeKg: null,
      strengthVolumeSessionCount: 0,
      strengthSetCount: null,
      strengthSetSessionCount: 0,
      strengthRepCount: null,
      strengthRepSessionCount: 0,
    },
    previous: {
      sessionCount: 3,
      sessionIds: [],
      sessionsWithHeartRate: 2,
      medianHeartRateBpm: 145,
      sessionsWithMaximumHeartRate: 2,
      medianMaximumHeartRateBpm: 175,
      durationMinutes: 150,
      durationSessionCount: 3,
      distanceKm: null,
      distanceSessionCount: 0,
      elevationGainM: null,
      elevationSessionCount: 0,
      strengthVolumeKg: null,
      strengthVolumeSessionCount: 0,
      strengthSetCount: null,
      strengthSetSessionCount: 0,
      strengthRepCount: null,
      strengthRepSessionCount: 0,
    },
    sessionCountChange: 100,
  },
  strengthExercises: [],
  limitations: [],
};

const meaningOptions = buildCardioMeaningTranslationOptions(evaluation);
assert.equal(meaningOptions.sessions, 1, 'heart-rate explanations must count only recent sessions with valid HR');
assert.equal(meaningOptions.recent, 150);
assert.equal(meaningOptions.previousSessions, 3);
assert.equal(meaningOptions.recentTotalSessions, 6);
assert.equal(getCardioOnePeriodHeartRateMeaningKey(evaluation), 'health.cardioAssessmentMeaningC');

const recentHeartRateOnly = {
  ...evaluation,
  cardiovascular: { ...evaluation.cardiovascular, previousMedianBpm: null, deltaBpm: null, previousSessionCount: 0 },
  volume: {
    ...evaluation.volume,
    previous: { ...evaluation.volume.previous, sessionCount: 10, sessionsWithHeartRate: 0 },
  },
};
assert.equal(
  getCardioOnePeriodHeartRateMeaningKey(recentHeartRateOnly),
  'health.cardioAssessmentMeaningCOnlyRecentWithEarlierSessions',
);
const previousHeartRateOnly = {
  ...evaluation,
  cardiovascular: { ...evaluation.cardiovascular, recentMedianBpm: null, deltaBpm: null, recentSessionCount: 0 },
  volume: {
    ...evaluation.volume,
    recent: { ...evaluation.volume.recent, sessionCount: 14, sessionsWithHeartRate: 0 },
  },
};
assert.equal(
  getCardioOnePeriodHeartRateMeaningKey(previousHeartRateOnly),
  'health.cardioAssessmentMeaningCOnlyPreviousWithRecentSessions',
);
assert.equal(buildCardioMeaningTranslationOptions(previousHeartRateOnly).recentTotalSessions, 14);

const periodMedianCopy = getCardioPerformanceChangeCopy(evaluation.performance);
assert.equal(periodMedianCopy.key, 'health.cardioMetricDescriptivePeriodMedians');
assert.equal(periodMedianCopy.options.change, '+7.1');
assert.equal(
  'count' in periodMedianCopy.options,
  false,
  'unpaired period medians must not be labelled as zero session pairs',
);

console.log('Cardio sport presentation tests passed.');
