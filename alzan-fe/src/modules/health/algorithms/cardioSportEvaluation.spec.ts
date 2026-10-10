import assert from 'node:assert/strict';
import {
  evaluateCardioSport,
  getCardioHeartRateTrendSeries,
  getCardioEvaluationSessionIds,
  type CardioLap,
  type CardioWorkoutSet,
} from './cardioSportEvaluation';
import type { CardioActivity } from './cardioEvolution';

const referenceDate = new Date('2026-10-10T12:00:00.000Z');
const makeActivity = (id: string, daysAgo: number, overrides: Partial<CardioActivity> = {}): CardioActivity => ({
  id,
  sport_type: 'running',
  sport_subtype: 'road',
  provider: 'garmin',
  device_id: 'watch-1',
  start_time: new Date(referenceDate.getTime() - daysAgo * 86_400_000).toISOString(),
  duration_s: 3600,
  distance_m: 10_000,
  avg_heart_rate: null,
  max_heart_rate: null,
  avg_speed_m_per_s: null,
  avg_power_w: null,
  avg_temp_c: null,
  elev_gain_m: null,
  total_volume_kg: null,
  total_sets: null,
  total_reps: null,
  workout_template_id: null,
  ...overrides,
});

const outputOnly = evaluateCardioSport(
  [
    makeActivity('old-1', 45),
    makeActivity('old-2', 40, { duration_s: 3700, distance_m: 10_000 }),
    makeActivity('new-1', 10, { duration_s: 3300, distance_m: 10_000 }),
    makeActivity('new-2', 5, { duration_s: 3350, distance_m: 10_000 }),
  ],
  'running',
  referenceDate,
  'month',
);
assert.equal(outputOnly.level, 'B');
assert.equal(outputOnly.cardiovascular.recentMedianBpm, null);
assert.equal(outputOnly.performance.metric, 'speed');
assert.equal(outputOnly.performance.recentSessionCount, 2);
assert.equal(outputOnly.performance.previousSessionCount, 2);
assert.equal(outputOnly.volume.recent.sessionCount, 2);
assert.equal(outputOnly.volume.previous.sessionCount, 2);

const outputOnlyTrend = evaluateCardioSport(
  [
    ...[55, 45, 35].map((daysAgo, index) =>
      makeActivity(`output-only-old-${index}`, daysAgo, {
        avg_heart_rate: null,
        avg_temp_c: 18,
        elev_gain_m: 0,
        surface: 'road',
      }),
    ),
    ...[20, 10, 1].map((daysAgo, index) =>
      makeActivity(`output-only-new-${index}`, daysAgo, {
        duration_s: 3400,
        avg_heart_rate: null,
        avg_temp_c: 18,
        elev_gain_m: 0,
        surface: 'road',
      }),
    ),
  ],
  'running',
  referenceDate,
  'month',
);
assert.equal(outputOnlyTrend.level, 'B');
assert.equal(outputOnlyTrend.performance.status, 'improving');
assert.equal(outputOnlyTrend.performance.matchedPairCount, 3);
assert.equal(outputOnlyTrend.performance.matchedAtSimilarHeartRatePairCount, 0);

const sparseHeartRate = evaluateCardioSport(
  [
    makeActivity('old-hr', 40, { avg_heart_rate: 141, max_heart_rate: 160, duration_s: null, distance_m: null }),
    makeActivity('recent-hr-1', 10, { avg_heart_rate: 169, max_heart_rate: 180, duration_s: null, distance_m: null }),
    makeActivity('recent-hr-2', 5, { avg_heart_rate: 169, max_heart_rate: 181, duration_s: null, distance_m: null }),
    makeActivity('recent-invalid-max-hr', 2, {
      avg_heart_rate: null,
      max_heart_rate: 240,
      duration_s: null,
      distance_m: null,
    }),
  ],
  'running',
  referenceDate,
  'month',
);
assert.equal(sparseHeartRate.cardiovascular.recentMedianBpm, 169);
assert.equal(sparseHeartRate.cardiovascular.previousMedianBpm, 141);
assert.equal(sparseHeartRate.cardiovascular.deltaBpm, 28);
assert.equal(sparseHeartRate.level, 'C');
assert.equal(sparseHeartRate.performance.metric, null);
assert.ok(sparseHeartRate.limitations.includes('sport_specific_performance_not_recorded'));
assert.equal(sparseHeartRate.volume.recent.medianMaximumHeartRateBpm, 180.5);
assert.equal(sparseHeartRate.volume.recent.sessionsWithMaximumHeartRate, 2);
assert.equal(sparseHeartRate.volume.previous.medianMaximumHeartRateBpm, 160);

const impossibleMaximumHeartRate = evaluateCardioSport(
  [
    makeActivity('max-below-average-hr', 4, {
      avg_heart_rate: 170,
      max_heart_rate: 160,
    }),
  ],
  'running',
  referenceDate,
  'month',
);
assert.equal(impossibleMaximumHeartRate.volume.recent.sessionsWithMaximumHeartRate, 0);
assert.equal(impossibleMaximumHeartRate.volume.recent.medianMaximumHeartRateBpm, null);

const missingHeartRateBothPeriods = evaluateCardioSport(
  [
    makeActivity('old-no-hr-1', 45, { sport_type: 'football', avg_heart_rate: null, distance_m: null }),
    makeActivity('old-no-hr-2', 40, { sport_type: 'football', avg_heart_rate: null, distance_m: null }),
    makeActivity('recent-no-hr-1', 10, { sport_type: 'football', avg_heart_rate: null, distance_m: null }),
    makeActivity('recent-no-hr-2', 5, { sport_type: 'football', avg_heart_rate: null, distance_m: null }),
  ],
  'football',
  referenceDate,
  'month',
);
assert.equal(missingHeartRateBothPeriods.cardiovascular.recentMedianBpm, null);
assert.equal(missingHeartRateBothPeriods.cardiovascular.previousMedianBpm, null);
assert.ok(missingHeartRateBothPeriods.limitations.includes('heart_rate_missing_in_one_period'));

const unclassifiedSport = evaluateCardioSport(
  [
    makeActivity('unknown-sport-1', 5, { sport_type: 'pickleball', avg_heart_rate: 142 }),
    makeActivity('unknown-sport-2', 3, { sport_type: 'pickleball', avg_heart_rate: 146 }),
  ],
  'pickleball',
  referenceDate,
  'month',
);
assert.equal(unclassifiedSport.sportType, 'pickleball');
assert.equal(unclassifiedSport.level, 'C');
assert.equal(unclassifiedSport.performance.metric, null);
assert.ok(unclassifiedSport.limitations.includes('unrecognized_sport_type_generic_analysis'));

const screenshotRunningData = evaluateCardioSport(
  [
    makeActivity('running-previous', 42, {
      duration_s: 3600,
      distance_m: 10_000,
      avg_heart_rate: 141,
    }),
    makeActivity('running-recent-1', 12, {
      duration_s: 3300,
      distance_m: 10_000,
      avg_heart_rate: 169,
    }),
    makeActivity('running-recent-2', 4, {
      duration_s: 3420,
      distance_m: 10_000,
      avg_heart_rate: 169,
    }),
  ],
  'running',
  referenceDate,
  'month',
);
assert.equal(screenshotRunningData.level, 'B');
assert.equal(screenshotRunningData.cardiovascular.recentMedianBpm, 169);
assert.equal(screenshotRunningData.cardiovascular.previousMedianBpm, 141);
assert.equal(screenshotRunningData.cardiovascular.deltaBpm, 28);
assert.equal(screenshotRunningData.performance.metric, 'speed');
assert.equal(screenshotRunningData.performance.recentSessionCount, 2);
assert.equal(screenshotRunningData.performance.previousSessionCount, 1);
assert.equal(screenshotRunningData.performance.matchedPairCount, 1);
assert.ok(screenshotRunningData.performance.changePercent !== null);
assert.equal(screenshotRunningData.performance.status, 'descriptive');

const gymWithNoPriorHeartRate = evaluateCardioSport(
  [
    ...[27, 25, 23, 20, 15, 10, 5].map((daysAgo, index) =>
      makeActivity(`gym-recent-${index}`, daysAgo, {
        sport_type: 'strength',
        sport_subtype: 'gym',
        duration_s: 3600,
        avg_heart_rate: 81,
        total_sets: 20,
        total_reps: 150,
        total_volume_kg: 6000,
      }),
    ),
    ...[45, 50, 55].map((daysAgo, index) =>
      makeActivity(`gym-old-${index}`, daysAgo, {
        sport_type: 'strength',
        sport_subtype: 'gym',
        duration_s: 3300,
        avg_heart_rate: null,
        total_sets: 16,
        total_reps: 120,
        total_volume_kg: 4800,
      }),
    ),
  ],
  'strength',
  referenceDate,
  'month',
);
assert.equal(gymWithNoPriorHeartRate.cardiovascular.recentMedianBpm, 81);
assert.equal(gymWithNoPriorHeartRate.cardiovascular.previousMedianBpm, null);
assert.equal(gymWithNoPriorHeartRate.volume.recent.sessionCount, 7);
assert.equal(gymWithNoPriorHeartRate.volume.previous.sessionCount, 3);
assert.equal(gymWithNoPriorHeartRate.volume.recent.strengthSetCount, 140);
assert.equal(gymWithNoPriorHeartRate.volume.recent.strengthVolumeSessionCount, 7);
assert.equal(gymWithNoPriorHeartRate.volume.previous.strengthSetSessionCount, 3);
assert.equal(gymWithNoPriorHeartRate.level, 'C');

const volumeOnly = evaluateCardioSport(
  [
    makeActivity('volume-old', 45, { sport_type: 'football', duration_s: 5400 }),
    makeActivity('volume-new-1', 10, { sport_type: 'football', duration_s: 5400 }),
    makeActivity('volume-new-2', 5, { sport_type: 'football', duration_s: 3600 }),
  ],
  'football',
  referenceDate,
  'month',
);
assert.equal(volumeOnly.level, 'D');
assert.equal(volumeOnly.volume.recent.sessionCount, 2);
assert.equal(volumeOnly.volume.recent.durationMinutes, 150);

const missingDuration = evaluateCardioSport(
  [
    makeActivity('no-duration-recent', 5, { duration_s: null, distance_m: 5000 }),
    makeActivity('no-duration-previous', 40, { duration_s: null, distance_m: 4500 }),
  ],
  'running',
  referenceDate,
  'month',
);
assert.equal(missingDuration.volume.recent.durationMinutes, null);
assert.equal(missingDuration.volume.recent.durationSessionCount, 0);
assert.equal(missingDuration.volume.recent.distanceSessionCount, 1);

const cyclingWithoutPower = evaluateCardioSport(
  [
    makeActivity('cycle-old', 45, { sport_type: 'cycling', sport_subtype: 'outdoor', avg_heart_rate: 145 }),
    makeActivity('cycle-recent', 5, { sport_type: 'cycling', sport_subtype: 'outdoor', avg_heart_rate: 145 }),
  ],
  'cycling',
  referenceDate,
  'month',
);
assert.equal(cyclingWithoutPower.performance.metric, 'speed');
assert.equal(cyclingWithoutPower.performance.status, 'descriptive');
assert.equal(cyclingWithoutPower.level, 'B');

const genericDescriptiveSports = [
  'football',
  'basketball',
  'tennis',
  'padel',
  'martial_arts',
  'volleyball',
  'climbing',
  'surf',
  'skiing',
  'snowboard',
  'golf',
  'hyrox',
  'other',
];
for (const sportType of genericDescriptiveSports) {
  const descriptive = evaluateCardioSport(
    [
      makeActivity(`${sportType}-recent`, 5, {
        sport_type: sportType,
        sport_subtype: sportType === 'other' ? null : 'road',
        duration_s: 3600,
        avg_heart_rate: 120,
      }),
    ],
    sportType,
    referenceDate,
    'month',
  );
  assert.equal(descriptive.level, 'E', `${sportType} should classify a single valid session as an initial baseline`);
  assert.equal(descriptive.performance.metric, null, `${sportType} should not invent a performance metric`);
}

const databaseSports = [
  'basketball',
  'padel',
  'hiking',
  'strength',
  'running',
  'cycling',
  'swimming',
  'football',
  'tennis',
  'other',
  'gym',
  'martial_arts',
  'climbing',
  'surf',
  'volleyball',
  'trail',
  'skiing',
  'snowboard',
  'golf',
  'hyrox',
];
for (const sportType of databaseSports) {
  const supportedSport = evaluateCardioSport(
    [
      makeActivity(`enum-${sportType}`, 5, {
        sport_type: sportType,
        sport_subtype: sportType === 'other' ? null : 'road',
        avg_heart_rate: 120,
      }),
    ],
    sportType,
    referenceDate,
    'month',
  );
  assert.equal(supportedSport.level, 'E', `${sportType} should produce a safe first-session assessment`);
}

for (const sportType of databaseSports) {
  const noActivities = evaluateCardioSport([], sportType, referenceDate, 'month');
  assert.equal(noActivities.level, 'F', `${sportType} should report no recent activity without inventing a trend`);

  const previousOnly = evaluateCardioSport(
    [
      makeActivity(`${sportType}-previous-only`, 45, {
        sport_type: sportType,
        sport_subtype: null,
        avg_heart_rate: 130,
      }),
    ],
    sportType,
    referenceDate,
    'month',
  );
  assert.equal(previousOnly.level, 'F', `${sportType} should not present prior-only sessions as a current evaluation`);
  assert.equal(previousOnly.volume.previous.sessionCount, 1);
  assert.equal(previousOnly.volume.recent.sessionCount, 0);

  const volumeOnly = evaluateCardioSport(
    [
      ...[45, 10, 5].map((daysAgo, index) =>
        makeActivity(`${sportType}-volume-${index}`, daysAgo, {
          sport_type: sportType,
          sport_subtype: null,
          duration_s: 1800,
          distance_m: null,
          avg_speed_m_per_s: null,
          avg_power_w: null,
          avg_heart_rate: null,
        }),
      ),
    ],
    sportType,
    referenceDate,
    'month',
  );
  assert.equal(volumeOnly.level, 'D', `${sportType} should report volume when it has no intensity or output metric`);
  assert.equal(volumeOnly.cardiovascular.recentMedianBpm, null);

  const heartRateOnly = evaluateCardioSport(
    [
      ...[45, 40, 10, 5].map((daysAgo, index) =>
        makeActivity(`${sportType}-hr-${index}`, daysAgo, {
          sport_type: sportType,
          sport_subtype: null,
          duration_s: null,
          distance_m: null,
          avg_speed_m_per_s: null,
          avg_power_w: null,
          avg_heart_rate: index < 2 ? 135 : 140,
        }),
      ),
    ],
    sportType,
    referenceDate,
    'month',
  );
  assert.equal(
    heartRateOnly.level,
    'C',
    `${sportType} should describe heart-rate response without calling it progress`,
  );
  assert.equal(heartRateOnly.performance.metric, null, `${sportType} should not infer output from heart rate alone`);
  assert.equal(heartRateOnly.performance.status, 'insufficient');
}

const strengthActivities = [
  makeActivity('strength-old-1', 50, { sport_type: 'strength', sport_subtype: 'gym', duration_s: 3600 }),
  makeActivity('strength-old-2', 40, { sport_type: 'strength', sport_subtype: 'gym', duration_s: 3600 }),
  makeActivity('strength-new-1', 20, { sport_type: 'strength', sport_subtype: 'gym', duration_s: 3600 }),
  makeActivity('strength-new-2', 5, { sport_type: 'strength', sport_subtype: 'gym', duration_s: 3600 }),
];
const strengthSets: CardioWorkoutSet[] = strengthActivities.map((activity, index) => ({
  session_id: activity.id,
  exercise_id: 'bench-press',
  weight_kg: index < 2 ? 60 : 65,
  reps: 8,
  rpe: null,
  is_warmup: false,
  set_type: 'working',
}));
const strengthProgression = evaluateCardioSport(strengthActivities, 'gym', referenceDate, 'month', [], strengthSets, [
  { id: 'bench-press', base_name_es: 'Press banca', base_name_en: 'Bench press' },
]);
assert.equal(strengthProgression.level, 'B');
assert.equal(strengthProgression.strengthExercises.length, 1);
assert.equal(strengthProgression.strengthExercises[0].exerciseName, 'Press banca');
assert.equal(strengthProgression.strengthExercises[0].changePercent, (5 / 60) * 100);
assert.equal(strengthProgression.volume.recent.strengthVolumeKg, 1040);
assert.equal(strengthProgression.volume.previous.strengthVolumeKg, 960);
assert.equal(strengthProgression.volume.recent.strengthSetCount, 2);
assert.equal(strengthProgression.volume.recent.strengthRepCount, 16);
const strengthProgressionEnglish = evaluateCardioSport(
  strengthActivities,
  'gym',
  referenceDate,
  'month',
  [],
  strengthSets,
  [{ id: 'bench-press', base_name_es: 'Press banca', base_name_en: 'Bench press' }],
  'en-US',
);
assert.equal(strengthProgressionEnglish.strengthExercises[0].exerciseName, 'Bench press');

const runningComparable = [
  ...[55, 45, 35].map((daysAgo, index) =>
    makeActivity(`running-old-${index}`, daysAgo, {
      duration_s: 3600,
      avg_heart_rate: 150,
      avg_temp_c: 18,
      elev_gain_m: 0,
      surface: 'road',
    }),
  ),
  ...[20, 10, 1].map((daysAgo, index) =>
    makeActivity(`running-new-${index}`, daysAgo, {
      duration_s: 3400,
      avg_heart_rate: 153,
      avg_temp_c: 18,
      elev_gain_m: 0,
      surface: 'road',
    }),
  ),
];
const repeatedComparableTrend = evaluateCardioSport(runningComparable, 'running', referenceDate, 'month');
assert.equal(repeatedComparableTrend.level, 'A');
assert.equal(repeatedComparableTrend.performance.status, 'improving');
assert.equal(repeatedComparableTrend.performance.matchedAtSimilarHeartRatePairCount, 3);
assert.equal(repeatedComparableTrend.confidence, 'medium');
assert.ok(repeatedComparableTrend.performance.recentPairSpanDays >= 14);
assert.ok(repeatedComparableTrend.performance.previousPairSpanDays >= 14);

const asymmetricPairChanges = evaluateCardioSport(
  [
    ...[
      ['asymmetric-old-1', 55, 10],
      ['asymmetric-old-2', 45, 4],
      ['asymmetric-old-3', 35, 2],
    ].map(([id, daysAgo, speed]) =>
      makeActivity(String(id), Number(daysAgo), {
        avg_speed_m_per_s: Number(speed),
        avg_heart_rate: 150,
        avg_temp_c: 18,
        elev_gain_m: 0,
        surface: 'road',
      }),
    ),
    ...[
      ['asymmetric-new-1', 20, 3],
      ['asymmetric-new-2', 10, 5],
      ['asymmetric-new-3', 1, 13],
    ].map(([id, daysAgo, speed]) =>
      makeActivity(String(id), Number(daysAgo), {
        avg_speed_m_per_s: Number(speed),
        avg_heart_rate: 153,
        avg_temp_c: 18,
        elev_gain_m: 0,
        surface: 'road',
      }),
    ),
  ],
  'running',
  referenceDate,
  'month',
);
const confidenceUsesHeartRateEvidenceSpan = evaluateCardioSport(
  [
    ...[59, 56, 51, 46, 41, 36, 31].map((daysAgo, index) =>
      makeActivity(`span-old-${index}`, daysAgo, {
        avg_speed_m_per_s: 2 + index / 10,
        avg_heart_rate: index === 0 || index === 6 ? 120 : 150,
        avg_temp_c: 18,
        elev_gain_m: 0,
        surface: 'road',
      }),
    ),
    ...[29, 26, 21, 16, 11, 6, 1].map((daysAgo, index) =>
      makeActivity(`span-new-${index}`, daysAgo, {
        avg_speed_m_per_s: 2.5 + index / 10,
        avg_heart_rate: index === 0 || index === 6 ? 180 : 153,
        avg_temp_c: 18,
        elev_gain_m: 0,
        surface: 'road',
      }),
    ),
  ],
  'running',
  referenceDate,
  'month',
);
assert.equal(confidenceUsesHeartRateEvidenceSpan.level, 'A');
assert.equal(confidenceUsesHeartRateEvidenceSpan.performance.matchedAtSimilarHeartRatePairCount, 5);
assert.ok(confidenceUsesHeartRateEvidenceSpan.performance.recentPairSpanDays >= 28);
assert.ok(confidenceUsesHeartRateEvidenceSpan.performance.previousPairSpanDays >= 28);
assert.equal(confidenceUsesHeartRateEvidenceSpan.confidence, 'medium');

assert.equal(asymmetricPairChanges.performance.status, 'improving');
assert.equal(asymmetricPairChanges.performance.previousValue, 4);
assert.equal(asymmetricPairChanges.performance.recentValue, 5);
assert.equal(asymmetricPairChanges.performance.changePercent, 25);

const repeatedTrendWithoutContext = evaluateCardioSport(
  runningComparable.map(activity => ({ ...activity, avg_temp_c: null, elev_gain_m: null, surface: null })),
  'running',
  referenceDate,
  'month',
);
assert.equal(repeatedTrendWithoutContext.performance.status, 'improving');
assert.equal(repeatedTrendWithoutContext.level, 'B');
assert.equal(repeatedTrendWithoutContext.performance.matchedContextPairCount, 0);
assert.equal(repeatedTrendWithoutContext.confidence, 'low');

const contextMismatch = evaluateCardioSport(
  runningComparable.map(activity => ({
    ...activity,
    avg_heart_rate: 150,
    device_id: activity.id.includes('old') ? 'watch-1' : 'watch-2',
    avg_temp_c: activity.id.includes('old') ? 12 : 28,
  })),
  'running',
  referenceDate,
  'month',
);
assert.notEqual(contextMismatch.level, 'A');
assert.equal(contextMismatch.performance.status, 'descriptive');

const mismatchedSpeedSources = evaluateCardioSport(
  runningComparable.map(activity => ({
    ...activity,
    avg_heart_rate: 150,
    avg_speed_m_per_s: activity.id.includes('old') ? 10_000 / (activity.duration_s ?? 1) : null,
  })),
  'running',
  referenceDate,
  'month',
);
assert.equal(mismatchedSpeedSources.performance.matchedPairCount, 0);
assert.ok(mismatchedSpeedSources.performance.changePercent !== null);
assert.equal(mismatchedSpeedSources.performance.metricSource, 'mixed');
assert.equal(mismatchedSpeedSources.performance.status, 'descriptive');

const unknownSubtypeComparable = evaluateCardioSport(
  runningComparable.map(activity => ({ ...activity, sport_subtype: null, avg_heart_rate: 150 })),
  'running',
  referenceDate,
  'month',
);
assert.notEqual(unknownSubtypeComparable.level, 'A');
assert.equal(unknownSubtypeComparable.level, 'B');
assert.equal(unknownSubtypeComparable.performance.status, 'improving');
assert.equal(unknownSubtypeComparable.confidence, 'low');

const contradictoryUnmatchedOutlier = evaluateCardioSport(
  [
    ...runningComparable,
    makeActivity('recent-unmatched-slow', 2, {
      duration_s: 7200,
      distance_m: 10_000,
      avg_heart_rate: 180,
    }),
  ],
  'running',
  referenceDate,
  'month',
);
assert.equal(contradictoryUnmatchedOutlier.level, 'A');
assert.ok(
  contradictoryUnmatchedOutlier.performance.recentValue !== null &&
    contradictoryUnmatchedOutlier.performance.previousValue !== null &&
    contradictoryUnmatchedOutlier.performance.recentValue > contradictoryUnmatchedOutlier.performance.previousValue,
);

const contradictoryMatchedOutlier = evaluateCardioSport(
  [
    ...[
      ['previous-1', 58, 4],
      ['previous-2', 50, 3],
      ['previous-3', 42, 2.1],
      ['previous-4', 34, 2],
    ].map(([id, daysAgo, speed]) =>
      makeActivity(String(id), Number(daysAgo), {
        avg_speed_m_per_s: Number(speed),
        avg_heart_rate: 150,
        avg_temp_c: 18,
        elev_gain_m: 0,
        surface: 'road',
      }),
    ),
    ...[
      ['recent-1', 28, 2.2],
      ['recent-2', 20, 2.31],
      ['recent-3', 12, 3.3],
      ['recent-4', 4, 0.1],
    ].map(([id, daysAgo, speed]) =>
      makeActivity(String(id), Number(daysAgo), {
        avg_speed_m_per_s: Number(speed),
        avg_heart_rate: 150,
        avg_temp_c: 18,
        elev_gain_m: 0,
        surface: 'road',
      }),
    ),
  ],
  'running',
  referenceDate,
  'month',
);
assert.equal(contradictoryMatchedOutlier.performance.status, 'descriptive');
assert.ok(
  contradictoryMatchedOutlier.performance.recentValue !== null &&
    contradictoryMatchedOutlier.performance.previousValue !== null &&
    contradictoryMatchedOutlier.performance.recentValue < contradictoryMatchedOutlier.performance.previousValue,
);
assert.ok((contradictoryMatchedOutlier.performance.changePercent ?? 0) < 0);

const cyclingInvalidPowerWithSpeed = evaluateCardioSport(
  [
    ...[50, 40, 35].map((daysAgo, index) =>
      makeActivity(`cycle-old-speed-${index}`, daysAgo, {
        sport_type: 'cycling',
        sport_subtype: 'outdoor',
        avg_heart_rate: 145,
        avg_speed_m_per_s: 7,
      }),
    ),
    ...[20, 10, 1].map((daysAgo, index) =>
      makeActivity(`cycle-recent-speed-${index}`, daysAgo, {
        sport_type: 'cycling',
        sport_subtype: 'outdoor',
        avg_heart_rate: 145,
        avg_speed_m_per_s: 7.5,
        avg_power_w: index === 0 ? 3501 : null,
      }),
    ),
  ],
  'cycling',
  referenceDate,
  'month',
);
assert.equal(cyclingInvalidPowerWithSpeed.performance.metric, 'speed');
assert.equal(cyclingInvalidPowerWithSpeed.performance.recentSessionCount, 3);
assert.equal(cyclingInvalidPowerWithSpeed.performance.previousSessionCount, 3);

const cyclingPrefersBetterCoveredSpeed = evaluateCardioSport(
  [
    ...[55, 45, 35].map((daysAgo, index) =>
      makeActivity(`cycle-coverage-old-${index}`, daysAgo, {
        sport_type: 'cycling',
        sport_subtype: 'outdoor',
        avg_heart_rate: 145,
        avg_speed_m_per_s: 7,
        avg_power_w: index === 0 ? 180 : null,
        avg_temp_c: 18,
        elev_gain_m: 0,
        surface: 'road',
      }),
    ),
    ...[20, 10, 1].map((daysAgo, index) =>
      makeActivity(`cycle-coverage-new-${index}`, daysAgo, {
        sport_type: 'cycling',
        sport_subtype: 'outdoor',
        avg_heart_rate: 145,
        avg_speed_m_per_s: 7.5,
        avg_power_w: index === 0 ? 190 : null,
        avg_temp_c: 18,
        elev_gain_m: 0,
        surface: 'road',
      }),
    ),
  ],
  'cycling',
  referenceDate,
  'month',
);
assert.equal(cyclingPrefersBetterCoveredSpeed.performance.metric, 'speed');
assert.equal(cyclingPrefersBetterCoveredSpeed.performance.matchedPairCount, 3);

const invalidRecordedSpeedFallsBackToDerived = evaluateCardioSport(
  [
    ...[50, 40, 35].map((daysAgo, index) =>
      makeActivity(`derived-old-${index}`, daysAgo, {
        avg_heart_rate: 150,
        avg_speed_m_per_s: 30,
        avg_temp_c: 18,
        elev_gain_m: 0,
        surface: 'road',
      }),
    ),
    ...[20, 10, 1].map((daysAgo, index) =>
      makeActivity(`derived-recent-${index}`, daysAgo, {
        avg_heart_rate: 150,
        avg_speed_m_per_s: 30,
        avg_temp_c: 18,
        elev_gain_m: 0,
        surface: 'road',
      }),
    ),
  ],
  'running',
  referenceDate,
  'month',
);
assert.equal(invalidRecordedSpeedFallsBackToDerived.performance.recentSessionCount, 3);
assert.equal(invalidRecordedSpeedFallsBackToDerived.performance.metricSource, 'distance_duration');

const legacyWalk = evaluateCardioSport(
  [
    makeActivity('walk-previous', 40, {
      sport_type: 'other',
      sport_subtype: 'walk',
      avg_speed_m_per_s: 1.2,
      avg_heart_rate: 110,
    }),
    makeActivity('walk-recent', 5, {
      sport_type: 'other',
      sport_subtype: 'walk',
      avg_speed_m_per_s: 1.3,
      avg_heart_rate: 110,
    }),
  ],
  'hiking',
  referenceDate,
  'month',
);
assert.equal(legacyWalk.performance.metric, 'speed');
assert.equal(legacyWalk.performance.recentSessionCount, 1);
assert.equal(legacyWalk.performance.previousSessionCount, 1);

const heartRateDiffers = evaluateCardioSport(
  runningComparable.map(activity => ({
    ...activity,
    avg_heart_rate: activity.id.includes('old') ? 140 : 165,
  })),
  'running',
  referenceDate,
  'month',
);
assert.equal(heartRateDiffers.level, 'B');
assert.equal(heartRateDiffers.performance.status, 'improving');
assert.equal(heartRateDiffers.performance.matchedAtSimilarHeartRatePairCount, 0);
assert.equal(heartRateDiffers.confidence, 'low');
assert.ok(heartRateDiffers.performance.changePercent !== null);

const swimmingWithLaps = [
  makeActivity('swim-old', 45, {
    sport_type: 'swimming',
    sport_subtype: 'pool',
    duration_s: null,
    distance_m: null,
    avg_speed_m_per_s: null,
  }),
  makeActivity('swim-new', 5, {
    sport_type: 'swimming',
    sport_subtype: 'pool',
    duration_s: null,
    distance_m: null,
    avg_speed_m_per_s: null,
  }),
];
const swimLaps: CardioLap[] = swimmingWithLaps.flatMap((activity, index) => [
  {
    session_id: activity.id,
    lap_type: 'distance',
    split_group: 'distance',
    split_distance_m: 100,
    distance_m: 100,
    duration_s: index === 0 ? 110 : 100,
    avg_heart_rate: null,
    avg_pace_s_per_km: index === 0 ? 1100 : 1000,
  },
]);
const swimLapSummary = evaluateCardioSport(swimmingWithLaps, 'swimming', referenceDate, 'month', swimLaps);
assert.equal(swimLapSummary.performance.metric, 'lap_pace');
assert.equal(swimLapSummary.performance.recentValue, 100);
assert.equal(swimLapSummary.performance.previousValue, 110);
assert.equal(swimLapSummary.performance.status, 'descriptive');
assert.ok(swimLapSummary.performance.changePercent !== null);
assert.ok(Math.abs((swimLapSummary.performance.changePercent ?? 0) - ((110 - 100) / 110) * 100) < 0.001);

const repeatedSwimLapsActivities = [
  ...[55, 45, 35].map((daysAgo, index) =>
    makeActivity(`swim-repeat-old-${index}`, daysAgo, {
      sport_type: 'swimming',
      sport_subtype: 'pool',
      pool_type: '25m',
      stroke: 'freestyle',
      duration_s: 2400,
      distance_m: 1500,
      avg_heart_rate: null,
      avg_temp_c: 25,
      elev_gain_m: 0,
      surface: 'pool',
    }),
  ),
  ...[20, 10, 1].map((daysAgo, index) =>
    makeActivity(`swim-repeat-new-${index}`, daysAgo, {
      sport_type: 'swimming',
      sport_subtype: 'pool',
      pool_type: '25m',
      stroke: 'freestyle',
      duration_s: 2400,
      distance_m: 1500,
      avg_heart_rate: null,
      avg_temp_c: 25,
      elev_gain_m: 0,
      surface: 'pool',
    }),
  ),
];
const repeatedSwimLaps: CardioLap[] = repeatedSwimLapsActivities.map((activity, index) => ({
  session_id: activity.id,
  lap_type: 'distance',
  split_group: 'distance',
  split_distance_m: 100,
  distance_m: 100,
  duration_s: index < 3 ? 110 : 100,
  avg_heart_rate: null,
  avg_pace_s_per_km: index < 3 ? 1100 : 1000,
}));
const repeatedSwimTrend = evaluateCardioSport(
  repeatedSwimLapsActivities,
  'swimming',
  referenceDate,
  'month',
  repeatedSwimLaps,
);
assert.equal(repeatedSwimTrend.level, 'B');
assert.equal(repeatedSwimTrend.performance.status, 'improving');
assert.equal(repeatedSwimTrend.performance.matchedPairCount, 3);

const repeatedSwimStable = evaluateCardioSport(
  repeatedSwimLapsActivities,
  'swimming',
  referenceDate,
  'month',
  repeatedSwimLaps.map(lap => ({ ...lap, duration_s: 105, avg_pace_s_per_km: 1050 })),
);
assert.equal(repeatedSwimStable.level, 'B');
assert.equal(repeatedSwimStable.performance.status, 'stable');

const runningLapFallback = evaluateCardioSport(
  [
    makeActivity('run-lap-old', 40, { duration_s: null, distance_m: null, avg_speed_m_per_s: null }),
    makeActivity('run-lap-new', 5, { duration_s: null, distance_m: null, avg_speed_m_per_s: null }),
  ],
  'running',
  referenceDate,
  'month',
  swimLaps.map(lap => ({ ...lap, session_id: lap.session_id.replace('swim-', 'run-lap-') })),
);
assert.equal(runningLapFallback.performance.metric, 'lap_pace');
assert.equal(runningLapFallback.performance.unit, 's/km');

const partialCoverage = evaluateCardioSport(
  [
    makeActivity('coverage-recent-1', 5, { elev_gain_m: 120, total_volume_kg: 5000, total_sets: 15, total_reps: 120 }),
    makeActivity('coverage-recent-2', 7, { elev_gain_m: 0, total_volume_kg: null, total_sets: null, total_reps: null }),
    makeActivity('coverage-previous-1', 40, {
      elev_gain_m: 90,
      total_volume_kg: 4500,
      total_sets: 12,
      total_reps: 100,
    }),
  ],
  'running',
  referenceDate,
  'month',
);
assert.equal(partialCoverage.volume.recent.elevationSessionCount, 2);
assert.equal(partialCoverage.volume.recent.elevationGainM, 120);
assert.equal(partialCoverage.volume.recent.strengthVolumeSessionCount, 1);
assert.equal(partialCoverage.volume.recent.strengthSetSessionCount, 1);
assert.equal(partialCoverage.volume.recent.strengthRepSessionCount, 1);

const fullHistory = evaluateCardioSport(
  [
    makeActivity('all-old-1', 200),
    makeActivity('all-old-2', 150),
    makeActivity('all-new-1', 50),
    makeActivity('all-new-2', 1),
  ],
  'running',
  referenceDate,
  'all',
);
assert.equal(fullHistory.volume.previous.sessionCount, 2);
assert.equal(fullHistory.volume.recent.sessionCount, 2);
const allHistorySessionIds = getCardioEvaluationSessionIds(
  [
    makeActivity('all-old-1', 200),
    makeActivity('all-old-2', 150),
    makeActivity('all-new-1', 50),
    makeActivity('all-new-2', 1),
  ],
  'running',
  referenceDate,
  'all',
);
assert.deepEqual(allHistorySessionIds.previous, ['all-old-1', 'all-old-2']);
assert.deepEqual(allHistorySessionIds.recent, ['all-new-1', 'all-new-2']);

const largeHistoryTemplate = makeActivity('large-history-template', 100);
const largeHistoryActivities = Array.from({ length: 140_000 }, (_, index) => ({
  ...largeHistoryTemplate,
  id: `large-history-${index}`,
}));
const largeHistorySessionIds = getCardioEvaluationSessionIds(largeHistoryActivities, 'running', referenceDate, 'all');
assert.equal(largeHistorySessionIds.recent.length + largeHistorySessionIds.previous.length, 140_000);

const heartRateTrendSeries = getCardioHeartRateTrendSeries(
  [
    makeActivity('hr-series-later', 2, { avg_heart_rate: 170 }),
    makeActivity('hr-series-first-1', 5, { avg_heart_rate: 150 }),
    makeActivity('hr-series-first-2', 5, { avg_heart_rate: 154 }),
    makeActivity('hr-series-invalid', 4, { avg_heart_rate: 300 }),
  ],
  ['hr-series-first-1', 'hr-series-first-2', 'hr-series-later', 'not-in-period'],
  'month',
);
assert.deepEqual(
  heartRateTrendSeries.map(point => ({ value: point.value, sessionCount: point.sessionCount })),
  [
    { value: 152, sessionCount: 2 },
    { value: 170, sessionCount: 1 },
  ],
);
assert.ok(heartRateTrendSeries[0].date < heartRateTrendSeries[1].date);

const firstSession = evaluateCardioSport([makeActivity('first', 1)], 'running', referenceDate, 'month');
assert.equal(firstSession.level, 'E');
assert.equal(firstSession.volume.previous.sessionCount, 0);

const empty = evaluateCardioSport([], 'running', referenceDate, 'month');
assert.equal(empty.level, 'F');
assert.equal(empty.volume.recent.sessionCount, 0);
assert.equal(empty.cardiovascular.deltaBpm, null);

const onlyPreviousPeriod = evaluateCardioSport(
  [
    makeActivity('previous-only-1', 40, { avg_heart_rate: 140 }),
    makeActivity('previous-only-2', 50, { avg_heart_rate: 142 }),
  ],
  'running',
  referenceDate,
  'month',
);
assert.equal(onlyPreviousPeriod.level, 'F');
assert.equal(onlyPreviousPeriod.volume.recent.sessionCount, 0);
assert.equal(onlyPreviousPeriod.volume.previous.sessionCount, 2);
assert.equal(onlyPreviousPeriod.cardiovascular.recentMedianBpm, null);
assert.equal(onlyPreviousPeriod.cardiovascular.previousMedianBpm, 141);
assert.equal(onlyPreviousPeriod.confidence, 'none');

const oneSidedHeartRate = evaluateCardioSport(
  [
    ...[5, 10, 15, 20, 25].map((daysAgo, index) =>
      makeActivity(`football-current-hr-${index}`, daysAgo, {
        sport_type: 'football',
        duration_s: 5400,
        avg_heart_rate: 145 + index,
      }),
    ),
    makeActivity('football-prior-no-hr', 40, { sport_type: 'football', duration_s: 5400 }),
  ],
  'football',
  referenceDate,
  'month',
);
assert.equal(oneSidedHeartRate.level, 'C');
assert.equal(oneSidedHeartRate.cardiovascular.previousMedianBpm, null);
assert.equal(oneSidedHeartRate.confidence, 'none');

console.log('Cardio sport evaluation tests passed.');
