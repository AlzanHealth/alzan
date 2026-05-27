import { strict as assert } from 'assert';
import { parseActivityFileToCanonical } from './activity-import-canonical.parser';
import {
  mapUltrahumanDailyActivityToCanonical,
  mapUltrahumanMetabolicToCanonical,
  mapUltrahumanRecoveryToCanonical,
  mapUltrahumanSleepToCanonical,
} from './ultrahuman-health-canonical.mapper';
import { parseRouteFileWithSummary } from './route-import.parser';
import { parseStrengthActivityFile } from './strength-activity-import.parser';

function assertUltrahumanDailyMetricsFixtureUsesProviderMapper(): void {
  const rawJson = JSON.stringify({
    provider: 'ultrahuman',
    date: '2026-05-01',
    movement: {
      steps: 9400,
      active_kcal: 660,
      vo2_max: 48,
    },
    heart_rate: {
      average_bpm: 61,
    },
    recovery: {
      score: 82,
    },
  });
  const canonical = parseActivityFileToCanonical(rawJson, 'ultrahuman-daily-metrics.json');
  assert.equal(canonical.provider, 'ultrahuman');
  assert.equal(canonical.sportType, 'other');
  assert.equal(canonical.summary.caloriesKcal, 660);
  assert.equal(canonical.summary.totalSteps, 9400);
  assert.equal(canonical.summary.avgHeartRate, 61);
  assert.equal(canonical.summary.vo2Max, 48);
  assert.equal(canonical.vendorFields.sourceProvider, 'ultrahuman');
  assert.equal(canonical.vendorFields.ultrahumanRecoveryIndex, 82);
}

function assertUltrahumanMetricsEnvelopeParsesMovementAndRecovery(): void {
  const rawJson = JSON.stringify({
    data: {
      metric_data: [
        {
          type: 'movement_index',
          object: {
            ultrahuman_date: '2026-05-01',
            value: 76,
          },
        },
        {
          type: 'recovery_index',
          object: {
            ultrahuman_date: '2026-05-01',
            value: 84,
          },
        },
        {
          type: 'steps',
          object: {
            ultrahuman_date: '2026-05-01',
            value: 7100,
          },
        },
      ],
    },
  });
  const canonical = parseActivityFileToCanonical(rawJson, 'ultrahuman-metrics.json');
  assert.equal(canonical.provider, 'ultrahuman');
  assert.equal(canonical.summary.totalSteps, 7100);
  assert.equal(canonical.vendorFields.ultrahumanMovementIndex, 76);
  assert.equal(canonical.vendorFields.ultrahumanRecoveryIndex, 84);
}

function assertUltrahumanSportsWithoutGpsDoNotFail(): void {
  const sports = [
    { activity: 'running', expected: 'running' },
    { activity: 'cycling', expected: 'cycling' },
    { activity: 'padel', expected: 'padel' },
    { activity: 'tennis', expected: 'tennis' },
    { activity: 'soccer', expected: 'football' },
    { activity: 'basketball', expected: 'basketball' },
  ];
  for (const sport of sports) {
    const rawJson = JSON.stringify({
      provider: 'ultrahuman',
      id: `uh-${sport.activity}`,
      activity: sport.activity,
      start_datetime: '2026-05-01T18:00:00Z',
      end_datetime: '2026-05-01T19:00:00Z',
      calories: 240,
      heart_rate: { average_bpm: 118 },
    });
    const parsed = parseRouteFileWithSummary(rawJson, `ultrahuman-${sport.activity}.json`);
    assert.equal(parsed.polyline, '');
    assert.equal(parsed.summary.sportType, sport.expected);
    assert.equal(parsed.summary.caloriesKcal, 240);
    assert.equal(parsed.summary.avgHeartRate, 118);
  }
}

function assertUltrahumanCyclingModalitiesArePreserved(): void {
  const cases = [
    { activity: 'indoor_cycling', expected: 'indoor' },
    { activity: 'gravel_cycling', expected: 'gravel' },
    { activity: 'spinning_cycling', expected: 'spinning' },
    { activity: 'mountain_biking', expected: 'trail' },
    { activity: 'urban_cycling', expected: 'urban' },
  ] as const;

  for (const testCase of cases) {
    const canonical = parseActivityFileToCanonical(
      JSON.stringify({
        provider: 'ultrahuman',
        id: `uh-${testCase.expected}`,
        activity: testCase.activity,
        start_datetime: '2026-05-01T18:00:00Z',
        end_datetime: '2026-05-01T19:00:00Z',
      }),
      `ultrahuman-${testCase.expected}.json`,
    );
    assert.equal(canonical.sportType, 'cycling');
    assert.equal(canonical.sportSubtype, testCase.expected);
  }
}

function assertUltrahumanWalkingMapsToRunningWalk(): void {
  const rawJson = JSON.stringify({
    provider: 'ultrahuman',
    id: 'walk-1',
    activity: 'walking',
    start_datetime: '2026-05-01T09:00:00Z',
    end_datetime: '2026-05-01T09:20:00Z',
    steps: 1800,
  });
  const canonical = parseActivityFileToCanonical(rawJson, 'ultrahuman-walking.json');
  assert.equal(canonical.sportType, 'running');
  assert.equal(canonical.sportSubtype, 'walk');
  assert.equal(canonical.vendorFields.ultrahumanActivity, 'walking');
}

function assertUltrahumanStrengthParsesInStrengthFlow(): void {
  const rawJson = JSON.stringify({
    provider: 'ultrahuman',
    id: 'strength-1',
    activity: 'strength_training',
    start_datetime: '2026-05-01T12:00:00Z',
    end_datetime: '2026-05-01T12:30:00Z',
    calories: 170,
    heart_rate: {
      samples: [
        { timestamp: '2026-05-01T12:00:00Z', value: 91 },
        { timestamp: '2026-05-01T12:01:00Z', value: 97 },
      ],
    },
  });
  const parsed = parseStrengthActivityFile(rawJson, 'ultrahuman-strength.json', { estimatedMaxHeartRate: 190 });
  assert.equal(parsed.provider, 'ultrahuman');
  assert.equal(parsed.durationSeconds, 1800);
  assert.equal(parsed.caloriesKcal, 170);
  assert.equal(parsed.heartRateStream.length, 2);
  assert.equal(parsed.heartRateZones.length, 1);
  assert.equal(parsed.heartRateZones[0].zone, 1);
}

function assertUltrahumanSleepMapsWithoutPersistence(): void {
  const sleep = mapUltrahumanSleepToCanonical({
    ultrahuman_date: '2026-05-01',
    bedtime_start: 1777590000,
    bedtime_end: 1777618800,
    quick_metrics: [
      { type: 'time_in_bed', value: 28800 },
      { type: 'sleep_efic', value: 88 },
    ],
    sleep_stages: [
      { type: 'deep_sleep', stage_time: 5400 },
      { type: 'light_sleep', stage_time: 14400 },
      { type: 'rem_sleep', stage_time: 7200 },
      { type: 'awake', stage_time: 1800 },
    ],
  });
  assert.equal(sleep.source, 'ultrahuman');
  assert.equal(sleep.date, '2026-05-01');
  assert.equal(sleep.totalSleepMin, 450);
  assert.equal(sleep.deepSleepMin, 90);
  assert.equal(sleep.lightSleepMin, 240);
  assert.equal(sleep.remSleepMin, 120);
  assert.equal(sleep.awakeMin, 30);
  assert.equal(sleep.sleepScore, 88);
}

function assertUltrahumanRecoveryMapsWithoutPersistence(): void {
  const recovery = mapUltrahumanRecoveryToCanonical({
    ultrahuman_date: '2026-05-01',
    recovery_index: { value: 84 },
    movement_index: { value: 76 },
    metabolic_score: { value: 91 },
    hrv: { value: 52 },
    resting_heart_rate: { value: 57 },
    temperature: { value: -0.2 },
  });
  assert.equal(recovery.source, 'ultrahuman');
  assert.equal(recovery.date, '2026-05-01');
  assert.equal(recovery.recoveryScore, 84);
  assert.equal(recovery.readinessScore, 84);
  assert.equal(recovery.strainScore, 76);
  assert.equal(recovery.avgHrvMs, 52);
  assert.equal(recovery.restingHrBpm, 57);
  assert.equal(recovery.balance, -0.2);
  assert.equal(recovery.stressState, 91);
}

function assertUltrahumanDailyActivityMapsWithoutPersistence(): void {
  const daily = mapUltrahumanDailyActivityToCanonical({
    date: '2026-05-01',
    movement: {
      steps: 9400,
      active_kcal: 660,
      distance_m: 7200,
    },
  });
  assert.equal(daily.source, 'ultrahuman');
  assert.equal(daily.totalSteps, 9400);
  assert.equal(daily.activeCaloriesKcal, 660);
  assert.equal(daily.caloriesKcal, 660);
  assert.equal(daily.distanceM, 7200);
}

function assertUltrahumanMetabolicMapsWithoutPersistence(): void {
  const metabolic = mapUltrahumanMetabolicToCanonical({
    date: '2026-05-01',
    glucose: { value: 95 },
    average_glucose: { value: 101 },
    glucose_variability: { value: 12 },
    hba1c: { value: 5.2 },
    time_in_target: { value: 91 },
    metabolic_score: { value: 86 },
  });
  assert.equal(metabolic.source, 'ultrahuman');
  assert.equal(metabolic.date, '2026-05-01');
  assert.equal(metabolic.glucoseMgDl, 95);
  assert.equal(metabolic.averageGlucoseMgDl, 101);
  assert.equal(metabolic.glucoseVariabilityPct, 12);
  assert.equal(metabolic.hba1cPct, 5.2);
  assert.equal(metabolic.timeInTargetPct, 91);
  assert.equal(metabolic.metabolicScore, 86);
}

assertUltrahumanDailyMetricsFixtureUsesProviderMapper();
assertUltrahumanMetricsEnvelopeParsesMovementAndRecovery();
assertUltrahumanSportsWithoutGpsDoNotFail();
assertUltrahumanCyclingModalitiesArePreserved();
assertUltrahumanWalkingMapsToRunningWalk();
assertUltrahumanStrengthParsesInStrengthFlow();
assertUltrahumanSleepMapsWithoutPersistence();
assertUltrahumanRecoveryMapsWithoutPersistence();
assertUltrahumanDailyActivityMapsWithoutPersistence();
assertUltrahumanMetabolicMapsWithoutPersistence();
