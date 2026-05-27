import { strict as assert } from 'assert';
import { parseActivityFileToCanonical } from './activity-import-canonical.parser';
import {
  mapOuraDailyActivityToCanonical,
  mapOuraRecoveryToCanonical,
  mapOuraSleepToCanonical,
} from './oura-health-canonical.mapper';
import { parseRouteFileWithSummary } from './route-import.parser';
import { parseStrengthActivityFile } from './strength-activity-import.parser';

function assertOuraRunningWorkoutParses(): void {
  const rawJson = JSON.stringify({
    provider: 'oura',
    id: 'workout-run-1',
    activity: 'running',
    start_datetime: '2026-05-01T07:00:00+02:00',
    end_datetime: '2026-05-01T07:45:00+02:00',
    day: '2026-05-01',
    calories: 430,
    distance: 8500,
    intensity: 'moderate',
    source: 'workout_heart_rate',
  });
  const canonical = parseActivityFileToCanonical(rawJson, 'oura-running.json');
  assert.equal(canonical.provider, 'oura');
  assert.equal(canonical.providerActivityId, 'workout-run-1');
  assert.equal(canonical.sportType, 'running');
  assert.equal(canonical.sportSubtype, 'road');
  assert.equal(canonical.summary.startedAt, '2026-05-01T05:00:00.000Z');
  assert.equal(canonical.summary.endedAt, '2026-05-01T05:45:00.000Z');
  assert.equal(canonical.summary.durationSeconds, 2700);
  assert.equal(canonical.summary.caloriesKcal, 430);
  assert.equal(canonical.summary.distanceM, 8500);
  assert.equal(canonical.vendorFields.ouraIntensity, 'moderate');
  assert.equal(canonical.vendorFields.ouraSource, 'workout_heart_rate');
}

function assertOuraHikingFixtureUsesProviderMapper(): void {
  const rawJson = JSON.stringify({
    provider: 'oura',
    activity: 'hiking',
    start_datetime: '2026-05-01T16:00:00Z',
    end_datetime: '2026-05-01T17:30:00Z',
    calories: 530,
    distance: 7100,
    average_heart_rate: 116,
  });
  const parsed = parseRouteFileWithSummary(rawJson, 'oura-workout.json');
  assert.equal(parsed.polyline, '');
  assert.equal(parsed.summary.sportType, 'hiking');
  assert.equal(parsed.summary.sportSubtype, 'trail');
  assert.equal(parsed.summary.durationSeconds, 5400);
  assert.equal(parsed.summary.caloriesKcal, 530);
  assert.equal(parsed.summary.distanceM, 7100);
  assert.equal(parsed.summary.avgHeartRate, 116);
}

function assertOuraCyclingModalitiesArePreserved(): void {
  const cases = [
    { activity: 'indoor_cycling', expected: 'indoor' },
    { activity: 'gravel_cycling', expected: 'gravel' },
    { activity: 'spinning', expected: 'spinning' },
    { activity: 'mountain_biking', expected: 'trail' },
    { activity: 'urban_cycling', expected: 'urban' },
  ] as const;

  for (const testCase of cases) {
    const canonical = parseActivityFileToCanonical(
      JSON.stringify({
        provider: 'oura',
        id: `oura-${testCase.expected}`,
        activity: testCase.activity,
        start_datetime: '2026-05-01T07:00:00Z',
        end_datetime: '2026-05-01T08:00:00Z',
      }),
      `oura-${testCase.expected}.json`,
    );
    assert.equal(canonical.sportType, 'cycling');
    assert.equal(canonical.sportSubtype, testCase.expected);
  }
}

function assertOuraCourtAndTeamSportsWithoutGpsDoNotFail(): void {
  const sports = [
    { activity: 'padel', expected: 'padel' },
    { activity: 'tennis', expected: 'tennis' },
    { activity: 'soccer', expected: 'football' },
    { activity: 'basketball', expected: 'basketball' },
  ];
  for (const sport of sports) {
    const rawJson = JSON.stringify({
      provider: 'oura',
      id: `oura-${sport.activity}`,
      activity: sport.activity,
      start_datetime: '2026-05-01T18:00:00Z',
      end_datetime: '2026-05-01T19:00:00Z',
      calories: 260,
    });
    const parsed = parseRouteFileWithSummary(rawJson, `oura-${sport.activity}.json`);
    assert.equal(parsed.polyline, '');
    assert.equal(parsed.summary.sportType, sport.expected);
    assert.equal(parsed.summary.caloriesKcal, 260);
  }
}

function assertOuraWalkingMapsToRunningWalk(): void {
  const rawJson = JSON.stringify({
    provider: 'oura',
    id: 'walk-1',
    activity: 'walking',
    start_datetime: '2026-05-01T09:00:00Z',
    end_datetime: '2026-05-01T09:20:00Z',
    distance: 1600,
  });
  const canonical = parseActivityFileToCanonical(rawJson, 'oura-walk.json');
  assert.equal(canonical.sportType, 'running');
  assert.equal(canonical.sportSubtype, 'walk');
  assert.equal(canonical.vendorFields.ouraActivity, 'walking');
}

function assertOuraStrengthParsesInStrengthFlow(): void {
  const rawJson = JSON.stringify({
    provider: 'oura',
    id: 'strength-1',
    activity: 'strength_training',
    start_datetime: '2026-05-01T12:00:00Z',
    end_datetime: '2026-05-01T12:40:00Z',
    calories: 180,
    heart_rate: [
      { timestamp: '2026-05-01T12:00:00Z', bpm: 92, source: 'workout' },
      { timestamp: '2026-05-01T12:01:00Z', bpm: 98, source: 'workout' },
    ],
  });
  const parsed = parseStrengthActivityFile(rawJson, 'oura-strength.json', { estimatedMaxHeartRate: 190 });
  assert.equal(parsed.provider, 'oura');
  assert.equal(parsed.durationSeconds, 2400);
  assert.equal(parsed.caloriesKcal, 180);
  assert.equal(parsed.heartRateStream.length, 2);
  assert.equal(parsed.heartRateZones.length, 1);
  assert.equal(parsed.heartRateZones[0].zone, 1);
}

function assertOuraHeartRateSamplesBuildStreamAndZones(): void {
  const rawJson = JSON.stringify({
    provider: 'oura',
    id: 'hr-run',
    activity: 'running',
    start_datetime: '2026-05-01T07:00:00Z',
    end_datetime: '2026-05-01T07:02:00Z',
    heart_rate: [
      { timestamp: '2026-05-01T07:00:00Z', bpm: 100, source: 'workout' },
      { timestamp: '2026-05-01T07:01:00Z', bpm: 110, source: 'workout' },
    ],
  });
  const canonical = parseActivityFileToCanonical(rawJson, 'oura-hr.json', { estimatedMaxHeartRate: 200 });
  assert.equal(canonical.streams.heartRate.length, 2);
  assert.equal(canonical.summary.avgHeartRate, 105);
  assert.equal(canonical.summary.maxHeartRate, 110);
  assert.equal(canonical.heartRateZones.length, 1);
  assert.equal(canonical.heartRateZones[0].zone, 1);
  assert.equal(canonical.heartRateZones[0].percentage, 100);
}

function assertOuraDailyActivityMapsWithoutPersistence(): void {
  const daily = mapOuraDailyActivityToCanonical({
    id: 'daily-activity-1',
    day: '2026-05-01',
    timestamp: '2026-05-01T23:59:59Z',
    steps: 8500,
    active_calories: 350,
    total_calories: 2400,
    equivalent_walking_distance: 6500,
    low_activity_time: 3600,
    medium_activity_time: 1800,
    high_activity_time: 600,
    sedentary_time: 20000,
    non_wear_time: 1200,
    score: 82,
  });
  assert.equal(daily.source, 'oura');
  assert.equal(daily.date, '2026-05-01');
  assert.equal(daily.totalSteps, 8500);
  assert.equal(daily.activeCaloriesKcal, 350);
  assert.equal(daily.caloriesKcal, 2400);
  assert.equal(daily.distanceM, 6500);
  assert.equal(daily.lightlyActiveMin, 60);
  assert.equal(daily.fairlyActiveMin, 30);
  assert.equal(daily.veryActiveMin, 10);
  assert.equal(daily.sedentaryMinutes, 333.3333333333333);
}

function assertOuraSleepMapsWithoutPersistence(): void {
  const sleep = mapOuraSleepToCanonical({
    id: 'sleep-1',
    day: '2026-05-01',
    bedtime_start: '2026-05-01T23:00:00+02:00',
    bedtime_end: '2026-05-02T07:00:00+02:00',
    type: 'long_sleep',
    total_sleep_duration: 25200,
    awake_time: 1800,
    light_sleep_duration: 12600,
    deep_sleep_duration: 5400,
    rem_sleep_duration: 7200,
    latency: 900,
    efficiency: 88,
    average_heart_rate: 55,
    lowest_heart_rate: 48,
    average_hrv: 45,
    average_breath: 14.5,
    readiness: { score: 81 },
  });
  assert.equal(sleep.source, 'oura');
  assert.equal(sleep.sourceSleepId, 'sleep-1');
  assert.equal(sleep.totalSleepMin, 420);
  assert.equal(sleep.awakeMin, 30);
  assert.equal(sleep.lightSleepMin, 210);
  assert.equal(sleep.deepSleepMin, 90);
  assert.equal(sleep.remSleepMin, 120);
  assert.equal(sleep.sleepLatencyMin, 15);
  assert.equal(sleep.sleepScore, 88);
  assert.equal(sleep.avgHeartRateBpm, 55);
  assert.equal(sleep.minHeartRateBpm, 48);
  assert.equal(sleep.avgHrvMs, 45);
  assert.equal(sleep.avgRespiratoryRpm, 14.5);
}

function assertOuraRecoveryMapsWithoutPersistence(): void {
  const recovery = mapOuraRecoveryToCanonical({
    id: 'readiness-1',
    day: '2026-05-01',
    timestamp: '2026-05-01T07:00:00Z',
    score: 82,
    temperature_deviation: 0.15,
    contributors: {
      hrv_balance: 78,
      resting_heart_rate: 80,
    },
    spo2_percentage: { average: 97.2 },
    daily_stress: { stress_high: 1200, recovery_high: 2400 },
    vo2_max: 48,
  });
  assert.equal(recovery.source, 'oura');
  assert.equal(recovery.readinessScore, 82);
  assert.equal(recovery.recoveryScore, 82);
  assert.equal(recovery.spo2AvgPct, 97.2);
  assert.equal(recovery.avgHrvMs, 78);
  assert.equal(recovery.restingHrBpm, 80);
  assert.equal(recovery.balance, 0.15);
  assert.equal(recovery.stressState, 1200);
}

assertOuraRunningWorkoutParses();
assertOuraHikingFixtureUsesProviderMapper();
assertOuraCyclingModalitiesArePreserved();
assertOuraCourtAndTeamSportsWithoutGpsDoNotFail();
assertOuraWalkingMapsToRunningWalk();
assertOuraStrengthParsesInStrengthFlow();
assertOuraHeartRateSamplesBuildStreamAndZones();
assertOuraDailyActivityMapsWithoutPersistence();
assertOuraSleepMapsWithoutPersistence();
assertOuraRecoveryMapsWithoutPersistence();
