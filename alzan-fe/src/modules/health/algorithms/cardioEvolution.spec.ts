import assert from 'node:assert/strict';
import {
  analyzeCardiacDrift,
  analyzeIntervalHeartRateRecovery,
  analyzeSportEvolution,
  summarizeCardioWeek,
  type CardioActivity,
  type CardioStreamSample,
  type CardioZoneTime,
} from './cardioEvolution';

const referenceDate = new Date('2026-10-10T12:00:00.000Z');

const makeActivity = (id: string, daysAgo: number, overrides: Partial<CardioActivity> = {}): CardioActivity => ({
  id,
  sport_type: 'running',
  sport_subtype: 'road',
  provider: 'garmin',
  device_id: 'demo-watch',
  start_time: new Date(referenceDate.getTime() - daysAgo * 24 * 60 * 60 * 1000).toISOString(),
  duration_s: 40 * 60,
  distance_m: 7200,
  avg_heart_rate: 150,
  max_heart_rate: 170,
  avg_speed_m_per_s: 3,
  avg_power_w: null,
  avg_temp_c: 18,
  elev_gain_m: 20,
  total_volume_kg: null,
  total_sets: null,
  total_reps: null,
  workout_template_id: null,
  ...overrides,
});

const comparableRuns = [
  makeActivity('old-1', 50),
  makeActivity('old-2', 43),
  makeActivity('old-3', 36),
  makeActivity('new-1', 22, { avg_speed_m_per_s: 3.18 }),
  makeActivity('new-2', 15, { avg_speed_m_per_s: 3.15 }),
  makeActivity('new-3', 8, { avg_speed_m_per_s: 3.2 }),
];

const runningTrend = analyzeSportEvolution(comparableRuns, 'running', referenceDate);
assert.equal(runningTrend.status, 'improving');
assert.equal(runningTrend.metric, 'speed_at_similar_hr');
assert.equal(runningTrend.matchedPairCount, 3);
assert.ok(runningTrend.changePercent !== null && runningTrend.changePercent > 4);
assert.equal(runningTrend.confidence, 'medium');

const highConfidenceRuns = [
  ...[50, 46, 42, 38, 34, 30].map((days, index) => makeActivity(`high-old-${index}`, days)),
  ...[26, 22, 18, 14, 10, 6].map((days, index) =>
    makeActivity(`high-new-${index}`, days, { avg_speed_m_per_s: 3.15 + index * 0.01 }),
  ),
];
const highConfidenceTrend = analyzeSportEvolution(highConfidenceRuns, 'running', referenceDate);
assert.equal(highConfidenceTrend.status, 'improving');
assert.equal(highConfidenceTrend.confidence, 'high');
const concentratedSessions = [
  ...[50, 49, 48, 47, 46].map((days, index) => makeActivity(`concentrated-old-${index}`, days)),
  ...[6, 5, 4, 3, 2].map((days, index) => makeActivity(`concentrated-new-${index}`, days, { avg_speed_m_per_s: 3.2 })),
];
assert.equal(analyzeSportEvolution(concentratedSessions, 'running', referenceDate).confidence, 'medium');
const differentDeviceTrend = analyzeSportEvolution(
  highConfidenceRuns.map((activity, index) => (index >= 6 ? { ...activity, device_id: 'other-watch' } : activity)),
  'running',
  referenceDate,
);
assert.equal(differentDeviceTrend.contextWarnings.includes('device'), true);
assert.equal(differentDeviceTrend.confidence, 'medium');

const smallNoiseTrend = analyzeSportEvolution(
  comparableRuns.map((activity, index) =>
    index >= 3 ? { ...activity, avg_speed_m_per_s: 3.02 } : { ...activity, avg_speed_m_per_s: 3 },
  ),
  'running',
  referenceDate,
);
assert.equal(smallNoiseTrend.status, 'stable');

const decliningRuns = comparableRuns.map((activity, index) => ({
  ...activity,
  avg_speed_m_per_s: index >= 3 ? 2.8 : 3,
}));
assert.equal(analyzeSportEvolution(decliningRuns, 'running', referenceDate).status, 'declining');

const stableTrail = comparableRuns.map((activity, index) => ({
  ...activity,
  sport_type: 'trail',
  avg_speed_m_per_s: index >= 3 ? 3 : 3,
}));
assert.equal(analyzeSportEvolution(stableTrail, 'trail', referenceDate).status, 'stable');

const cyclingTrend = analyzeSportEvolution(
  [
    makeActivity('cycle-old-1', 50, { sport_type: 'cycling', avg_power_w: 150 }),
    makeActivity('cycle-old-2', 43, { sport_type: 'cycling', avg_power_w: 152 }),
    makeActivity('cycle-old-3', 36, { sport_type: 'cycling', avg_power_w: 148 }),
    makeActivity('cycle-new-1', 22, { sport_type: 'cycling', avg_power_w: 162 }),
    makeActivity('cycle-new-2', 15, { sport_type: 'cycling', avg_power_w: 160 }),
    makeActivity('cycle-new-3', 8, { sport_type: 'cycling', avg_power_w: 164 }),
  ],
  'cycling',
  referenceDate,
);
assert.equal(cyclingTrend.metric, 'power_at_similar_hr');
assert.equal(cyclingTrend.status, 'improving');

const lowerHrAtSimilarPace = analyzeSportEvolution(
  [
    makeActivity('same-output-old-1', 50),
    makeActivity('same-output-old-2', 43),
    makeActivity('same-output-old-3', 36),
    makeActivity('same-output-new-1', 22, { avg_heart_rate: 145 }),
    makeActivity('same-output-new-2', 15, { avg_heart_rate: 145 }),
    makeActivity('same-output-new-3', 8, { avg_heart_rate: 145 }),
  ],
  'running',
  referenceDate,
);
assert.equal(lowerHrAtSimilarPace.metric, 'hr_at_similar_output');
assert.equal(lowerHrAtSimilarPace.status, 'improving');
assert.equal(lowerHrAtSimilarPace.heartRateDeltaBpm, -5);

const swimmingTrend = analyzeSportEvolution(
  comparableRuns.map(activity => ({ ...activity, sport_type: 'swimming', sport_subtype: 'pool' })),
  'swimming',
  referenceDate,
);
assert.equal(swimmingTrend.status, 'improving');
assert.equal(swimmingTrend.measurementCaution, true);

const walkingTrend = analyzeSportEvolution(
  comparableRuns.map(activity => ({
    ...activity,
    sport_type: 'other',
    sport_subtype: 'urban_walk',
    avg_speed_m_per_s: activity.start_time === comparableRuns[0].start_time ? 1.3 : activity.avg_speed_m_per_s,
  })),
  'other',
  referenceDate,
);
assert.equal(walkingTrend.metric, 'speed_at_similar_hr');

const lowDataTrend = analyzeSportEvolution(comparableRuns.slice(0, 4), 'running', referenceDate);
assert.equal(lowDataTrend.status, 'insufficient');
assert.equal(lowDataTrend.changePercent, null);

const mismatchedTrend = analyzeSportEvolution(
  comparableRuns.map((activity, index) => ({
    ...activity,
    avg_heart_rate: index >= 3 ? 175 : 140,
  })),
  'running',
  referenceDate,
);
assert.equal(mismatchedTrend.status, 'insufficient');
assert.equal(mismatchedTrend.matchedPairCount, 0);

const strengthTrend = analyzeSportEvolution(
  comparableRuns.map((activity, index) => ({
    ...activity,
    sport_type: 'strength',
    workout_template_id: 'same-template',
    total_volume_kg: index >= 3 ? 1200 : 1000,
  })),
  'strength',
  referenceDate,
);
assert.equal(strengthTrend.status, 'descriptive');
assert.equal(strengthTrend.metric, 'heart_rate_response');
assert.equal(strengthTrend.changePercent, null);
assert.equal(strengthTrend.strengthVolumeChangePercent, 20);

const shortStrengthTrend = analyzeSportEvolution(
  comparableRuns.map((activity, index) => ({
    ...activity,
    sport_type: 'gym',
    duration_s: 12 * 60,
    avg_heart_rate: null,
    workout_template_id: 'same-template',
    total_volume_kg: index >= 3 ? 1200 : 1000,
  })),
  'gym',
  referenceDate,
);
assert.equal(shortStrengthTrend.status, 'descriptive');
assert.equal(shortStrengthTrend.strengthVolumeChangePercent, 20);

const weeklyTrend = analyzeSportEvolution(comparableRuns, 'running', referenceDate, 'week');
assert.equal(weeklyTrend.status, 'insufficient');
const comparableDays = [
  ...[1.2, 1.5, 1.8].map((days, index) => makeActivity(`day-old-${index}`, days)),
  ...[0.1, 0.4, 0.8].map((days, index) => makeActivity(`day-new-${index}`, days, { avg_speed_m_per_s: 3.2 })),
];
assert.equal(analyzeSportEvolution(comparableDays, 'running', referenceDate, 'day').status, 'improving');
const comparableWeeks = [
  ...[8, 10, 12].map((days, index) => makeActivity(`week-old-${index}`, days)),
  ...[1, 3, 5, 6].map((days, index) => makeActivity(`week-new-${index}`, days, { avg_speed_m_per_s: 3.2 })),
];
assert.equal(analyzeSportEvolution(comparableWeeks, 'running', referenceDate, 'week').status, 'improving');

const longPeriodActivities = [
  makeActivity('long-old-1', 160),
  makeActivity('long-old-2', 150),
  makeActivity('long-old-3', 140),
  makeActivity('long-new-1', 80, { avg_speed_m_per_s: 3.2 }),
  makeActivity('long-new-2', 70, { avg_speed_m_per_s: 3.2 }),
  makeActivity('long-new-3', 60, { avg_speed_m_per_s: 3.2 }),
];
assert.equal(analyzeSportEvolution(longPeriodActivities, 'running', referenceDate, 'three_months').status, 'improving');
assert.equal(analyzeSportEvolution(longPeriodActivities, 'running', referenceDate, 'all').status, 'improving');
const sixMonthActivities = [
  makeActivity('six-month-old-1', 350),
  makeActivity('six-month-old-2', 320),
  makeActivity('six-month-old-3', 290),
  makeActivity('six-month-new-1', 150, { avg_speed_m_per_s: 3.2 }),
  makeActivity('six-month-new-2', 120, { avg_speed_m_per_s: 3.2 }),
  makeActivity('six-month-new-3', 90, { avg_speed_m_per_s: 3.2 }),
];
assert.equal(analyzeSportEvolution(sixMonthActivities, 'running', referenceDate, 'six_months').status, 'improving');

const zones: CardioZoneTime[] = [
  { session_id: 'today-run', zone: 1, duration_s: 900 },
  { session_id: 'today-run', zone: 2, duration_s: 1200 },
  { session_id: 'today-run', zone: 3, duration_s: 300 },
];
const weeklySummary = summarizeCardioWeek(
  [makeActivity('today-run', 0), makeActivity('last-month-run', 20)],
  zones,
  referenceDate,
);
assert.equal(weeklySummary.sessionCount, 1);
assert.equal(weeklySummary.durationMinutes, 40);
assert.equal(weeklySummary.heartRateSessionCount, 1);
assert.equal(weeklySummary.zoneTimeSeconds[0], 900);
assert.equal(weeklySummary.zoneTimeSeconds[1], 1200);
assert.equal(weeklySummary.zoneDataAvailable, true);

const driftSamples: CardioStreamSample[] = [];
for (let minute = 0; minute < 60; minute += 1) {
  const offsetSeconds = minute * 60;
  driftSamples.push({
    session_id: 'long-run',
    stream_type: 'heart_rate',
    offset_s: offsetSeconds,
    value: minute < 30 ? 145 : 155,
  });
  driftSamples.push({ session_id: 'long-run', stream_type: 'speed', offset_s: offsetSeconds, value: 3 });
}
const drift = analyzeCardiacDrift(driftSamples, 'long-run', 'running', 60 * 60);
assert.ok(drift !== null);
assert.ok(drift.decouplingPercent > 6 && drift.decouplingPercent < 7);
assert.equal(analyzeCardiacDrift(driftSamples.slice(0, 10), 'long-run', 'running', 60 * 60), null);

const intervalHeartRateSamples: CardioStreamSample[] = [];
for (let offset = 0; offset < 30 * 60; offset += 30) {
  const peaks = new Map([
    [300, 176],
    [360, 150],
    [600, 174],
    [660, 151],
    [900, 172],
    [960, 149],
    [1200, 170],
    [1260, 148],
  ]);
  intervalHeartRateSamples.push({
    session_id: 'interval-session',
    stream_type: 'heart_rate',
    offset_s: offset,
    value: peaks.get(offset) ?? 130,
  });
}
const intervalRecovery = analyzeIntervalHeartRateRecovery(intervalHeartRateSamples, 'interval-session', 30 * 60);
assert.ok(intervalRecovery);
assert.equal(intervalRecovery.detectedPeakCount, 4);
assert.equal(intervalRecovery.averageHeartRateDropBpm, 23);
assert.equal(intervalRecovery.confidence, 'low');
assert.equal(
  analyzeIntervalHeartRateRecovery(intervalHeartRateSamples.slice(0, 10), 'interval-session', 30 * 60),
  null,
);
const intervalTimestampSamples = intervalHeartRateSamples.map(sample => ({
  ...sample,
  offset_s: null,
  timestamp: new Date(referenceDate.getTime() + (sample.offset_s ?? 0) * 1000).toISOString(),
}));
assert.equal(
  analyzeIntervalHeartRateRecovery(intervalTimestampSamples, 'interval-session', 30 * 60, referenceDate.toISOString())
    ?.detectedPeakCount,
  4,
);

console.log('Cardio evolution algorithm tests passed.');
