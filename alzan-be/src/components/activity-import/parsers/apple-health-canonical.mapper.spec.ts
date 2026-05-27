import { strict as assert } from 'assert';
import { parseActivityFileToCanonical } from './activity-import-canonical.parser';
import {
  mapAppleHealthDailyActivityToCanonical,
  mapAppleHealthRecoveryToCanonical,
  mapAppleHealthSleepToCanonical,
} from './apple-health-health-canonical.mapper';
import { parseRouteFileWithSummary } from './route-import.parser';
import { getDatabaseProviderForStrengthImport, parseStrengthActivityFile } from './strength-activity-import.parser';

function assertAppleHealthFixtureUsesProviderMapper(): void {
  const rawJson = JSON.stringify({
    provider: 'apple_health',
    workoutActivityType: 'HKWorkoutActivityTypeTennis',
    startDate: '2026-05-01T18:00:00Z',
    endDate: '2026-05-01T18:55:00Z',
    duration: 3300,
    activeEnergyBurned: 480,
    averageHeartRate: 128,
    maxHeartRate: 168,
    samples: [
      { timestamp: '2026-05-01T18:05:00Z', heartRate: 120 },
      { timestamp: '2026-05-01T18:30:00Z', heartRate: 150 },
    ],
  });
  const canonical = parseActivityFileToCanonical(rawJson, 'providers/apple_health/workout.json');
  assert.equal(canonical.provider, 'apple_health');
  assert.equal(canonical.sportType, 'tennis');
  assert.equal(canonical.sportSubtype, 'outdoor');
  assert.equal(canonical.summary.durationSeconds, 3300);
  assert.equal(canonical.summary.caloriesKcal, 480);
  assert.equal(canonical.summary.avgHeartRate, 128);
  assert.equal(canonical.summary.maxHeartRate, 168);
  assert.equal(canonical.streams.heartRate.length, 2);
  assert.equal(canonical.vendorFields.sourceProvider, 'apple_health');
}

function assertAppleHealthRunningRouteAndRecords(): void {
  const rawJson = JSON.stringify({
    provider: 'apple_health',
    data: {
      workouts: [
        {
          id: 'run-1',
          type: 'HKWorkoutActivityTypeRunning',
          startDate: '2026-05-01T06:00:00Z',
          endDate: '2026-05-01T06:30:00Z',
          values: [
            { type: 'HKQuantityTypeIdentifierActiveEnergyBurned', unit: 'kcal', value: 310 },
            { type: 'HKQuantityTypeIdentifierDistanceWalkingRunning', unit: 'm', value: 5200 },
          ],
          route: [
            { timestamp: '2026-05-01T06:00:00Z', latitude: 39.47, longitude: -0.37, altitude: 10 },
            { timestamp: '2026-05-01T06:10:00Z', latitude: 39.471, longitude: -0.371, altitude: 15 },
          ],
        },
      ],
      records: [
        {
          parentId: 'run-1',
          type: 'HKQuantityTypeIdentifierHeartRate',
          startDate: '2026-05-01T06:05:00Z',
          endDate: '2026-05-01T06:05:01Z',
          value: 142,
          unit: 'count/min',
        },
        {
          parentId: 'run-1',
          type: 'HKQuantityTypeIdentifierHeartRate',
          startDate: '2026-05-01T06:10:00Z',
          endDate: '2026-05-01T06:10:01Z',
          value: 156,
          unit: 'count/min',
        },
      ],
    },
  });
  const parsed = parseRouteFileWithSummary(rawJson, 'apple-health-running.json', { estimatedMaxHeartRate: 200 });
  assert.ok(parsed.polyline.length > 0);
  assert.equal(parsed.summary.sportType, 'running');
  assert.equal(parsed.summary.distanceM, 5200);
  assert.equal(parsed.summary.caloriesKcal, 310);
  assert.equal(parsed.summary.avgHeartRate, 149);
  assert.ok(parsed.details.heartRateZones.length > 0);
}

function assertAppleHealthCyclingPowerCadenceSpeed(): void {
  const rawJson = JSON.stringify({
    provider: 'apple_health',
    id: 'bike-1',
    workoutActivityType: 'HKWorkoutActivityTypeCycling',
    startDate: '2026-05-01T08:00:00Z',
    endDate: '2026-05-01T09:00:00Z',
    totalDistance: 28000,
    activeEnergyBurned: 620,
    samples: [
      { timestamp: '2026-05-01T08:10:00Z', cyclingPower: 180, cyclingCadence: 82, cyclingSpeed: 8.2 },
      { timestamp: '2026-05-01T08:20:00Z', cyclingPower: 240, cyclingCadence: 88, cyclingSpeed: 9.1 },
    ],
  });
  const canonical = parseActivityFileToCanonical(rawJson, 'apple-health-cycling.json');
  assert.equal(canonical.sportType, 'cycling');
  assert.equal(canonical.summary.avgPowerW, 210);
  assert.equal(canonical.summary.maxPowerW, 240);
  assert.equal(canonical.summary.avgCadence, 85);
  assert.equal(canonical.streams.speed.length, 2);
}

function assertAppleHealthCyclingModalitiesUseWorkoutMetadata(): void {
  const cases = [
    { title: 'Gravel bike ride', expected: 'gravel' },
    { title: 'Mountain bike training', expected: 'trail' },
    { title: 'Indoor spin class', expected: 'spinning' },
    { title: 'Urban bike commute', expected: 'urban' },
  ] as const;

  for (const testCase of cases) {
    const canonical = parseActivityFileToCanonical(
      JSON.stringify({
        provider: 'apple_health',
        workoutActivityType: 'HKWorkoutActivityTypeCycling',
        title: testCase.title,
        startDate: '2026-05-01T08:00:00Z',
        endDate: '2026-05-01T09:00:00Z',
      }),
      `apple-health-${testCase.expected}.json`,
    );
    assert.equal(canonical.sportType, 'cycling');
    assert.equal(canonical.sportSubtype, testCase.expected);
  }
}

function assertAppleHealthSwimmingVendorFields(): void {
  const rawJson = JSON.stringify({
    provider: 'apple_health',
    id: 'swim-1',
    workoutActivityType: 'HKWorkoutActivityTypeSwimming',
    startDate: '2026-05-01T10:00:00Z',
    endDate: '2026-05-01T10:40:00Z',
    values: [
      { type: 'HKQuantityTypeIdentifierDistanceSwimming', unit: 'm', value: 1500 },
      { type: 'HKQuantityTypeIdentifierSwimmingStrokeCount', unit: 'count', value: 620 },
    ],
  });
  const canonical = parseActivityFileToCanonical(rawJson, 'apple-health-swimming.json');
  assert.equal(canonical.sportType, 'swimming');
  assert.equal(canonical.summary.distanceM, 1500);
  assert.equal(canonical.vendorFields.appleHealthSwimmingStrokeCount, 620);
}

function assertAppleHealthSportsWithoutGpsDoNotFail(): void {
  const sports = [
    { type: 'HKWorkoutActivityTypeSoccer', expected: 'football' },
    { type: 'HKWorkoutActivityTypeBasketball', expected: 'basketball' },
    { type: 'HKWorkoutActivityTypeTennis', expected: 'tennis' },
    {
      type: 'HKWorkoutActivityTypeOther',
      title: 'Padel match',
      metadata: { activityName: 'padel' },
      expected: 'padel',
    },
  ];
  for (const sport of sports) {
    const parsed = parseRouteFileWithSummary(
      JSON.stringify({
        provider: 'apple_health',
        id: sport.expected,
        workoutActivityType: sport.type,
        title: sport.title,
        metadata: sport.metadata,
        startDate: '2026-05-01T18:00:00Z',
        endDate: '2026-05-01T19:00:00Z',
        activeEnergyBurned: 340,
      }),
      `apple-health-${sport.expected}.json`,
    );
    assert.equal(parsed.polyline, '');
    assert.equal(parsed.summary.sportType, sport.expected);
    assert.equal(parsed.summary.caloriesKcal, 340);
  }
}

function assertAppleHealthWalkingMapsToRunningWalk(): void {
  const canonical = parseActivityFileToCanonical(
    JSON.stringify({
      provider: 'apple_health',
      id: 'walk-1',
      workoutActivityType: 'HKWorkoutActivityTypeWalking',
      startDate: '2026-05-01T12:00:00Z',
      endDate: '2026-05-01T12:30:00Z',
    }),
    'apple-health-walking.json',
  );
  assert.equal(canonical.sportType, 'running');
  assert.equal(canonical.sportSubtype, 'walk');
  assert.equal(canonical.vendorFields.appleHealthWorkoutActivityType, 'HKWorkoutActivityTypeWalking');
}

function assertAppleHealthStrengthParsesInStrengthFlow(): void {
  const parsed = parseStrengthActivityFile(
    JSON.stringify({
      provider: 'apple_health',
      id: 'strength-1',
      workoutActivityType: 'HKWorkoutActivityTypeTraditionalStrengthTraining',
      startDate: '2026-05-01T12:00:00Z',
      endDate: '2026-05-01T12:40:00Z',
      activeEnergyBurned: 260,
      averageHeartRate: 102,
      maxHeartRate: 142,
      samples: [
        { timestamp: '2026-05-01T12:05:00Z', heartRate: 95 },
        { timestamp: '2026-05-01T12:10:00Z', heartRate: 112 },
      ],
    }),
    'apple-health-strength.json',
    { estimatedMaxHeartRate: 190 },
  );
  assert.equal(parsed.provider, 'apple_health');
  assert.equal(getDatabaseProviderForStrengthImport(parsed.provider), 'apple_health');
  assert.equal(parsed.durationSeconds, 2400);
  assert.equal(parsed.caloriesKcal, 260);
  assert.equal(parsed.avgHeartRate, 102);
  assert.equal(parsed.heartRateStream.length, 2);
}

function assertAppleHealthDailyActivityMapsWithoutPersistence(): void {
  const daily = mapAppleHealthDailyActivityToCanonical({
    data: {
      records: [
        {
          type: 'HKQuantityTypeIdentifierStepCount',
          startDate: '2026-05-01T08:00:00Z',
          endDate: '2026-05-01T09:00:00Z',
          value: 1200,
          unit: 'count',
        },
        {
          type: 'HKQuantityTypeIdentifierActiveEnergyBurned',
          startDate: '2026-05-01T08:00:00Z',
          endDate: '2026-05-01T09:00:00Z',
          value: 320,
          unit: 'kcal',
        },
        {
          type: 'HKQuantityTypeIdentifierDistanceWalkingRunning',
          startDate: '2026-05-01T08:00:00Z',
          endDate: '2026-05-01T09:00:00Z',
          value: 900,
          unit: 'm',
        },
      ],
    },
  });
  assert.equal(daily.source, 'apple_health');
  assert.equal(daily.totalSteps, 1200);
  assert.equal(daily.activeCaloriesKcal, 320);
  assert.equal(daily.distanceM, 900);
}

function assertAppleHealthSleepMapsWithoutPersistence(): void {
  const sleep = mapAppleHealthSleepToCanonical({
    data: {
      sleep: [
        {
          id: 'sleep-1-light',
          parentId: 'sleep-1',
          stage: 'asleepCore',
          startDate: '2026-05-01T22:00:00Z',
          endDate: '2026-05-02T02:00:00Z',
        },
        {
          id: 'sleep-1-deep',
          parentId: 'sleep-1',
          stage: 'asleepDeep',
          startDate: '2026-05-02T02:00:00Z',
          endDate: '2026-05-02T03:30:00Z',
        },
        {
          id: 'sleep-1-rem',
          parentId: 'sleep-1',
          stage: 'asleepREM',
          startDate: '2026-05-02T03:30:00Z',
          endDate: '2026-05-02T05:30:00Z',
        },
        {
          id: 'sleep-1-awake',
          parentId: 'sleep-1',
          stage: 'awake',
          startDate: '2026-05-02T05:30:00Z',
          endDate: '2026-05-02T06:00:00Z',
        },
      ],
    },
  });
  assert.equal(sleep.source, 'apple_health');
  assert.equal(sleep.totalSleepMin, 450);
  assert.equal(sleep.lightSleepMin, 240);
  assert.equal(sleep.deepSleepMin, 90);
  assert.equal(sleep.remSleepMin, 120);
  assert.equal(sleep.awakeMin, 30);
}

function assertAppleHealthRecoveryMapsWithoutPersistence(): void {
  const recovery = mapAppleHealthRecoveryToCanonical({
    data: {
      records: [
        {
          type: 'HKQuantityTypeIdentifierRestingHeartRate',
          startDate: '2026-05-01T08:00:00Z',
          endDate: '2026-05-01T08:00:01Z',
          value: 52,
        },
        {
          type: 'HKQuantityTypeIdentifierHeartRateVariabilitySDNN',
          startDate: '2026-05-01T08:00:00Z',
          endDate: '2026-05-01T08:00:01Z',
          value: 62,
        },
        {
          type: 'HKQuantityTypeIdentifierOxygenSaturation',
          startDate: '2026-05-01T08:00:00Z',
          endDate: '2026-05-01T08:00:01Z',
          value: 97,
        },
      ],
    },
  });
  assert.equal(recovery.source, 'apple_health');
  assert.equal(recovery.restingHrBpm, 52);
  assert.equal(recovery.avgHrvMs, 62);
  assert.equal(recovery.spo2AvgPct, 97);
}

assertAppleHealthFixtureUsesProviderMapper();
assertAppleHealthRunningRouteAndRecords();
assertAppleHealthCyclingPowerCadenceSpeed();
assertAppleHealthCyclingModalitiesUseWorkoutMetadata();
assertAppleHealthSwimmingVendorFields();
assertAppleHealthSportsWithoutGpsDoNotFail();
assertAppleHealthWalkingMapsToRunningWalk();
assertAppleHealthStrengthParsesInStrengthFlow();
assertAppleHealthDailyActivityMapsWithoutPersistence();
assertAppleHealthSleepMapsWithoutPersistence();
assertAppleHealthRecoveryMapsWithoutPersistence();
