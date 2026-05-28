import { strict as assert } from 'assert';
import { parseActivityFileToCanonical } from './activity-import-canonical.parser';
import { parseRouteFileWithSummary } from './route-import.parser';
import { getDatabaseProviderForStrengthImport, parseStrengthActivityFile } from './strength-activity-import.parser';
import {
  mapWhoopCycleToCanonical,
  mapWhoopRecoveryToCanonical,
  mapWhoopSleepToCanonical,
} from './whoop-health-canonical.mapper';

function buildWhoopWorkout(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    provider: 'whoop',
    id: 'ecfc6a15-4661-442f-a9a4-f160dd7afae8',
    start: '2026-05-01T15:00:00Z',
    end: '2026-05-01T16:00:00Z',
    timezone_offset: '+02:00',
    sport_name: 'Running',
    score_state: 'SCORED',
    score: {
      strain: 8.2,
      average_heart_rate: 123,
      max_heart_rate: 166,
      kilojoule: 1757.28,
      percent_recorded: 100,
      distance_meter: 8600,
      altitude_gain_meter: 120,
      zone_durations: {
        zone_zero_milli: 300000,
        zone_one_milli: 600000,
        zone_two_milli: 900000,
        zone_three_milli: 600000,
        zone_four_milli: 900000,
        zone_five_milli: 300000,
      },
    },
    ...overrides,
  };
}

function assertWhoopWorkoutMapsOfficialShape(): void {
  const canonical = parseActivityFileToCanonical(JSON.stringify(buildWhoopWorkout()), 'whoop-running.json');
  assert.equal(canonical.provider, 'whoop');
  assert.equal(canonical.sportType, 'running');
  assert.equal(canonical.sportSubtype, 'outdoor');
  assert.equal(canonical.providerActivityId, 'ecfc6a15-4661-442f-a9a4-f160dd7afae8');
  assert.equal(canonical.summary.durationSeconds, 3600);
  assert.equal(canonical.summary.caloriesKcal, 420);
  assert.equal(canonical.summary.avgHeartRate, 123);
  assert.equal(canonical.summary.maxHeartRate, 166);
  assert.equal(canonical.summary.distanceM, 8600);
  assert.equal(canonical.summary.elevationGainM, 120);
  assert.equal(canonical.vendorFields.sourceProvider, 'whoop');
  assert.equal(canonical.vendorFields.whoopStrain, 8.2);
  assert.equal(canonical.heartRateZones.length, 5);
  assert.equal(canonical.heartRateZones[0].zone, 1);
  assert.equal(canonical.heartRateZones[0].durationSeconds, 900);
}

function assertWhoopFixtureNoLongerUsesGenericMapper(): void {
  const fixture = JSON.stringify({
    provider: 'whoop',
    sport_name: 'Weightlifting',
    start: '2026-05-01T15:00:00Z',
    end: '2026-05-01T16:00:00Z',
    duration: 3600,
    kilojoule: 1757,
    average_heart_rate: 118,
    max_heart_rate: 164,
    score: {
      strain: 9.8,
    },
  });
  const canonical = parseActivityFileToCanonical(fixture, 'providers/whoop/workout.json');
  assert.equal(canonical.provider, 'whoop');
  assert.equal(canonical.sportType, 'strength');
  assert.equal(canonical.sportSubtype, 'indoor');
  assert.equal(canonical.summary.caloriesKcal, 420);
  assert.equal(canonical.summary.avgHeartRate, 118);
  assert.equal(canonical.summary.maxHeartRate, 164);
  assert.equal(canonical.vendorFields.whoopStrain, 9.8);
}

function assertWhoopSportsWithoutGpsDoNotFail(): void {
  const sports = [
    { sportName: 'Running', expected: 'running' },
    { sportName: 'Cycling', expected: 'cycling' },
    { sportName: 'Padel', expected: 'padel' },
    { sportName: 'Tennis', expected: 'tennis' },
    { sportName: 'Soccer', expected: 'football' },
    { sportName: 'Basketball', expected: 'basketball' },
  ];
  for (const sport of sports) {
    const parsed = parseRouteFileWithSummary(
      JSON.stringify(
        buildWhoopWorkout({
          id: `whoop-${sport.sportName}`,
          sport_name: sport.sportName,
          score: {
            strain: 7,
            average_heart_rate: 121,
            max_heart_rate: 151,
            kilojoule: 1000,
          },
        }),
      ),
      `whoop-${sport.sportName}.json`,
    );
    assert.equal(parsed.polyline, '');
    assert.equal(parsed.summary.sportType, sport.expected);
    assert.equal(parsed.summary.avgHeartRate, 121);
  }
}

function assertWhoopCyclingModalitiesArePreserved(): void {
  const cases = [
    { sportName: 'Spin', expected: 'spinning' },
    { sportName: 'Indoor Cycling', expected: 'indoor_trainer' },
    { sportName: 'Gravel Ride', expected: 'gravel' },
    { sportName: 'Mountain Biking', expected: 'mtb' },
    { sportName: 'Bike Commuting', expected: 'urban' },
  ] as const;

  for (const testCase of cases) {
    const canonical = parseActivityFileToCanonical(
      JSON.stringify(buildWhoopWorkout({ sport_name: testCase.sportName })),
      `whoop-${testCase.expected}.json`,
    );
    assert.equal(canonical.sportType, 'cycling');
    assert.equal(canonical.sportSubtype, testCase.expected);
  }
}

function assertWhoopStrengthParsesInStrengthFlow(): void {
  const parsed = parseStrengthActivityFile(
    JSON.stringify(
      buildWhoopWorkout({
        sport_name: 'Weightlifting',
        score: {
          strain: 10.2,
          average_heart_rate: 116,
          max_heart_rate: 158,
          kilojoule: 1255.2,
          zone_durations: {
            zone_zero_milli: 0,
            zone_one_milli: 1800000,
          },
        },
      }),
    ),
    'whoop-strength.json',
  );
  assert.equal(parsed.provider, 'whoop');
  assert.equal(getDatabaseProviderForStrengthImport(parsed.provider), 'whoop');
  assert.equal(parsed.durationSeconds, 3600);
  assert.equal(parsed.caloriesKcal, 300);
  assert.equal(parsed.avgHeartRate, 116);
  assert.equal(parsed.heartRateZones.length, 1);
  assert.equal(parsed.heartRateZones[0].zone, 1);
}

function assertWhoopWalkingMapsToHikingUrbanWalk(): void {
  const canonical = parseActivityFileToCanonical(
    JSON.stringify(buildWhoopWorkout({ sport_name: 'Walking' })),
    'whoop-walking.json',
  );
  assert.equal(canonical.sportType, 'hiking');
  assert.equal(canonical.sportSubtype, 'urban_walk');
  assert.equal(canonical.vendorFields.whoopSportName, 'Walking');
}

function assertWhoopSleepMapsWithoutPersistence(): void {
  const sleep = mapWhoopSleepToCanonical({
    id: 'sleep-1',
    start: '2026-05-01T22:00:00Z',
    end: '2026-05-02T06:00:00Z',
    timezone_offset: '+02:00',
    nap: false,
    stage_summary: {
      total_awake_time_milli: 1800000,
      total_light_sleep_time_milli: 14400000,
      total_slow_wave_sleep_time_milli: 5400000,
      total_rem_sleep_time_milli: 7200000,
      sleep_cycle_count: 4,
      disturbance_count: 8,
    },
    sleep_needed: {
      baseline_milli: 28800000,
      need_from_sleep_debt_milli: 1800000,
    },
    respiratory_rate: 14.8,
    sleep_performance_percentage: 91,
    sleep_consistency_percentage: 86,
    sleep_efficiency_percentage: 88,
  });
  assert.equal(sleep.source, 'whoop');
  assert.equal(sleep.sourceSleepId, 'sleep-1');
  assert.equal(sleep.totalSleepMin, 450);
  assert.equal(sleep.awakeMin, 30);
  assert.equal(sleep.lightSleepMin, 240);
  assert.equal(sleep.deepSleepMin, 90);
  assert.equal(sleep.remSleepMin, 120);
  assert.equal(sleep.sleepScore, 91);
  assert.equal(sleep.avgRespiratoryRpm, 14.8);
}

function assertWhoopRecoveryMapsWithoutPersistence(): void {
  const recovery = mapWhoopRecoveryToCanonical({
    cycle_id: 93845,
    sleep_id: 'sleep-1',
    created_at: '2026-05-02T07:00:00Z',
    score_state: 'SCORED',
    score: {
      user_calibrating: false,
      recovery_score: 78,
      resting_heart_rate: 51,
      hrv_rmssd_milli: 62.5,
      spo2_percentage: 96.2,
      skin_temp_celsius: 33.6,
    },
  });
  assert.equal(recovery.source, 'whoop');
  assert.equal(recovery.recoveryScore, 78);
  assert.equal(recovery.readinessScore, 78);
  assert.equal(recovery.restingHrBpm, 51);
  assert.equal(recovery.avgHrvMs, 62.5);
  assert.equal(recovery.hrvRmssdMs, 62.5);
  assert.equal(recovery.spo2AvgPct, 96.2);
  assert.equal(recovery.balance, 33.6);
}

function assertWhoopCycleMapsWithoutPersistence(): void {
  const cycle = mapWhoopCycleToCanonical({
    id: 93845,
    start: '2026-05-01T07:00:00Z',
    end: '2026-05-02T07:00:00Z',
    timezone_offset: '+02:00',
    score_state: 'SCORED',
    score: {
      strain: 14.2,
      kilojoule: 2510.4,
      average_heart_rate: 72,
      max_heart_rate: 168,
    },
  });
  assert.equal(cycle.source, 'whoop');
  assert.equal(cycle.sourceCycleId, '93845');
  assert.equal(cycle.strainScore, 14.2);
  assert.equal(cycle.caloriesKcal, 600);
  assert.equal(cycle.avgHeartRateBpm, 72);
  assert.equal(cycle.maxHeartRateBpm, 168);
}

assertWhoopWorkoutMapsOfficialShape();
assertWhoopFixtureNoLongerUsesGenericMapper();
assertWhoopSportsWithoutGpsDoNotFail();
assertWhoopCyclingModalitiesArePreserved();
assertWhoopStrengthParsesInStrengthFlow();
assertWhoopWalkingMapsToHikingUrbanWalk();
assertWhoopSleepMapsWithoutPersistence();
assertWhoopRecoveryMapsWithoutPersistence();
assertWhoopCycleMapsWithoutPersistence();
