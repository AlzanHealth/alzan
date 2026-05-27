import { strict as assert } from 'assert';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parseActivityFileToCanonical } from './activity-import-canonical.parser';
import {
  mapHealthConnectDailyActivityToCanonical,
  mapHealthConnectRecoveryToCanonical,
  mapHealthConnectSleepToCanonical,
} from './health-connect-health-canonical.mapper';
import { parseRouteFileWithSummary } from './route-import.parser';
import { getDatabaseProviderForStrengthImport, parseStrengthActivityFile } from './strength-activity-import.parser';

const FIXTURE_ROOT = join(__dirname, '..', '__fixtures__');

function buildHealthConnectWorkout(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    provider: 'health_connect',
    exerciseType: 'EXERCISE_SESSION_TYPE_RUNNING',
    title: 'Morning run',
    startTime: '2026-05-01T08:00:00Z',
    endTime: '2026-05-01T08:10:00Z',
    metadata: {
      id: 'hc-run-1',
      clientRecordId: 'client-run-1',
      dataOrigin: { packageName: 'com.google.android.apps.fitness' },
      device: { manufacturer: 'Google', model: 'Pixel Watch' },
    },
    distanceM: 1600,
    activeCaloriesKcal: 120,
    avgHeartRate: 145,
    maxHeartRate: 178,
    exerciseRoute: {
      locations: [
        { time: '2026-05-01T08:00:00Z', latitude: 41.38, longitude: 2.17, altitude: { inMeters: 12 } },
        { time: '2026-05-01T08:05:00Z', latitude: 41.381, longitude: 2.171, altitude: { inMeters: 18 } },
        { time: '2026-05-01T08:10:00Z', latitude: 41.382, longitude: 2.172, altitude: { inMeters: 16 } },
      ],
    },
    records: [
      {
        recordType: 'HeartRateRecord',
        parentId: 'hc-run-1',
        samples: [
          { time: '2026-05-01T08:00:00Z', beatsPerMinute: 130 },
          { time: '2026-05-01T08:00:01Z', beatsPerMinute: 150 },
          { time: '2026-05-01T08:00:02Z', beatsPerMinute: 180 },
        ],
        metadata: { dataOrigin: { packageName: 'com.google.android.apps.fitness' } },
      },
    ],
    laps: [{ startTime: '2026-05-01T08:00:00Z', endTime: '2026-05-01T08:05:00Z', length: { inMeters: 800 } }],
    ...overrides,
  };
}

function assertFixtureUsesSpecificMapper(): void {
  const fixture = readFileSync(join(FIXTURE_ROOT, 'providers/health_connect/exercise-session.json'), 'utf8');
  const canonical = parseActivityFileToCanonical(fixture, 'providers/health_connect/exercise-session.json');

  assert.equal(canonical.provider, 'health_connect');
  assert.equal(canonical.sportType, 'basketball');
  assert.equal(canonical.summary.durationSeconds, 2700);
  assert.equal(canonical.summary.caloriesKcal, 520);
  assert.equal(canonical.summary.totalSteps, 4200);
  assert.equal(canonical.vendorFields.sourceProvider, 'health_connect');
  assert.equal(canonical.vendorFields.channel, 'health_connect');
}

function assertRunningWithRouteAndRecordsParses(): void {
  const rawJson = JSON.stringify(buildHealthConnectWorkout());
  const canonical = parseActivityFileToCanonical(rawJson, 'health-connect-running.json', {
    estimatedMaxHeartRate: 200,
  });
  const route = parseRouteFileWithSummary(rawJson, 'health-connect-running.json', { estimatedMaxHeartRate: 200 });

  assert.equal(canonical.provider, 'health_connect');
  assert.equal(canonical.providerActivityId, 'hc-run-1');
  assert.equal(canonical.sportType, 'running');
  assert.equal(canonical.summary.distanceM, 1600);
  assert.equal(canonical.summary.caloriesKcal, 120);
  assert.equal(canonical.streams.heartRate.length, 3);
  assert.equal(canonical.streams.position.length, 3);
  assert.equal(canonical.laps.length, 1);
  assert.ok(canonical.heartRateZones.length > 0);
  assert.equal(canonical.vendorFields.sourcePackage, 'com.google.android.apps.fitness');
  assert.ok(route.polyline.length > 0);
  assert.equal(route.summary.distanceM, 1600);
}

function assertCyclingStreamsParse(): void {
  const rawJson = JSON.stringify({
    provider: 'health_connect',
    exerciseType: 'EXERCISE_SESSION_TYPE_BIKING',
    startTime: '2026-05-01T09:00:00Z',
    endTime: '2026-05-01T09:30:00Z',
    metadata: { id: 'hc-bike-1', dataOrigin: { packageName: 'com.strava' } },
    records: [
      { recordType: 'SpeedRecord', samples: [{ time: '2026-05-01T09:00:00Z', speed: { inMetersPerSecond: 8.2 } }] },
      { recordType: 'PowerRecord', samples: [{ time: '2026-05-01T09:00:00Z', power: { inWatts: 245 } }] },
      {
        recordType: 'CyclingPedalingCadenceRecord',
        samples: [{ time: '2026-05-01T09:00:00Z', revolutionsPerMinute: 88 }],
      },
    ],
  });
  const canonical = parseActivityFileToCanonical(rawJson, 'health-connect-bike.json');

  assert.equal(canonical.sportType, 'cycling');
  assert.equal(canonical.summary.avgSpeedMps, 8.2);
  assert.equal(canonical.summary.avgPowerW, 245);
  assert.equal(canonical.summary.avgCadence, 88);
}

function assertCyclingModalitiesUseSessionMetadata(): void {
  const cases = [
    { exerciseType: 'EXERCISE_SESSION_TYPE_BIKING_STATIONARY', title: 'Trainer', expected: 'indoor' },
    { exerciseType: 'EXERCISE_SESSION_TYPE_BIKING', title: 'Gravel ride', expected: 'gravel' },
    { exerciseType: 'EXERCISE_SESSION_TYPE_BIKING', title: 'Spin class', expected: 'spinning' },
    { exerciseType: 'EXERCISE_SESSION_TYPE_BIKING', title: 'MTB ride', expected: 'trail' },
    { exerciseType: 'EXERCISE_SESSION_TYPE_BIKING', title: 'Urban commute', expected: 'urban' },
  ] as const;

  for (const testCase of cases) {
    const canonical = parseActivityFileToCanonical(
      JSON.stringify(
        buildHealthConnectWorkout({
          exerciseType: testCase.exerciseType,
          title: testCase.title,
          exerciseRoute: undefined,
        }),
      ),
      `health-connect-${testCase.expected}.json`,
    );
    assert.equal(canonical.sportType, 'cycling');
    assert.equal(canonical.sportSubtype, testCase.expected);
  }
}

function assertSwimmingAndIndoorSportsDoNotNeedGps(): void {
  const swimming = parseActivityFileToCanonical(
    JSON.stringify(buildHealthConnectWorkout({ exerciseType: 'EXERCISE_SESSION_TYPE_SWIMMING_POOL', route: [] })),
    'health-connect-swim.json',
  );
  assert.equal(swimming.sportType, 'swimming');
  assert.equal(swimming.sportSubtype, 'pool');

  for (const [exerciseType, sportType] of [
    ['EXERCISE_SESSION_TYPE_SOCCER', 'football'],
    ['EXERCISE_SESSION_TYPE_BASKETBALL', 'basketball'],
    ['EXERCISE_SESSION_TYPE_TENNIS', 'tennis'],
    ['EXERCISE_SESSION_TYPE_TENNIS', 'padel'],
  ] as const) {
    const parsed = parseRouteFileWithSummary(
      JSON.stringify(
        buildHealthConnectWorkout({
          exerciseType,
          title: sportType === 'padel' ? 'Padel match' : undefined,
          exerciseRoute: undefined,
          route: [],
        }),
      ),
      `health-connect-${sportType}.json`,
    );
    assert.equal(parsed.summary.sportType, sportType);
    assert.equal(parsed.polyline, '');
  }
}

function assertWalkingAndStrengthMapping(): void {
  const walking = parseActivityFileToCanonical(
    JSON.stringify(buildHealthConnectWorkout({ exerciseType: 'EXERCISE_SESSION_TYPE_WALKING', title: 'Walk' })),
    'health-connect-walk.json',
  );
  assert.equal(walking.sportType, 'running');
  assert.equal(walking.sportSubtype, 'walk');
  assert.equal(walking.vendorFields.healthConnectExerciseType, 'EXERCISE_SESSION_TYPE_WALKING');

  const strength = parseStrengthActivityFile(
    JSON.stringify({
      provider: 'health_connect',
      exerciseType: 'EXERCISE_SESSION_TYPE_WEIGHTLIFTING',
      startTime: '2026-05-01T12:00:00Z',
      endTime: '2026-05-01T12:45:00Z',
      activeCaloriesKcal: 260,
      avgHeartRate: 118,
    }),
    'health-connect-strength.json',
  );
  assert.equal(strength.provider, 'health_connect');
  assert.equal(getDatabaseProviderForStrengthImport(strength.provider), 'health_connect');
}

function assertNativeZonesAreRespected(): void {
  const canonical = parseActivityFileToCanonical(
    JSON.stringify(
      buildHealthConnectWorkout({
        heartRateZones: [
          { zone: 2, durationSeconds: 120 },
          { zone: 3, durationSeconds: 180 },
        ],
      }),
    ),
    'health-connect-zones.json',
  );
  assert.deepEqual(
    canonical.heartRateZones.map(zone => [zone.zone, zone.durationSeconds]),
    [
      [2, 120],
      [3, 180],
    ],
  );
}

function assertNestedSdkShapeParses(): void {
  const canonical = parseActivityFileToCanonical(
    JSON.stringify({
      provider: 'health_connect',
      data: {
        workouts: [
          {
            exerciseType: 'EXERCISE_SESSION_TYPE_RUNNING_TREADMILL',
            startTime: '2026-05-01T10:00:00Z',
            endTime: '2026-05-01T10:20:00Z',
            metadata: { id: 'hc-ow-1', dataOrigin: { packageName: 'com.fitbit.FitbitMobile' } },
          },
        ],
        records: [
          {
            recordType: 'DistanceRecord',
            parentId: 'hc-ow-1',
            distance: { inMeters: 3000 },
            metadata: { dataOrigin: { packageName: 'com.fitbit.FitbitMobile' } },
          },
        ],
      },
    }),
    'health-connect-nested-sdk.json',
  );

  assert.equal(canonical.sportType, 'running');
  assert.equal(canonical.sportSubtype, 'indoor');
  assert.equal(canonical.summary.distanceM, 3000);
  assert.equal(canonical.vendorFields.sourceProviderKey, 'fitbit');
  assert.equal(canonical.vendorFields.sourcePackage, 'com.fitbit.FitbitMobile');
}

function assertHealthMappersWorkWithoutPersistence(): void {
  const daily = mapHealthConnectDailyActivityToCanonical({
    date: '2026-05-01',
    metadata: { dataOrigin: { packageName: 'android' } },
    steps: 9000,
    activeCaloriesKcal: 540,
    distanceM: 7200,
  });
  assert.equal(daily.source, 'health_connect');
  assert.equal(daily.sourcePackage, 'android');
  assert.equal(daily.totalSteps, 9000);

  const sleep = mapHealthConnectSleepToCanonical({
    id: 'sleep-1',
    startTime: '2026-05-01T22:00:00Z',
    endTime: '2026-05-02T06:00:00Z',
    stages: [{ type: 'STAGE_TYPE_DEEP', startTime: '2026-05-01T23:00:00Z', endTime: '2026-05-02T00:00:00Z' }],
  });
  assert.equal(sleep.source, 'health_connect');
  assert.equal(sleep.deepSleepMin, 60);

  const recovery = mapHealthConnectRecoveryToCanonical({
    date: '2026-05-02',
    restingHeartRate: 52,
    hrvRmssd: 64,
    oxygenSaturation: { inPercent: 97 },
  });
  assert.equal(recovery.source, 'health_connect');
  assert.equal(recovery.restingHrBpm, 52);
  assert.equal(recovery.hrvRmssdMs, 64);
  assert.equal(recovery.spo2AvgPct, 97);
}

assertFixtureUsesSpecificMapper();
assertRunningWithRouteAndRecordsParses();
assertCyclingStreamsParse();
assertCyclingModalitiesUseSessionMetadata();
assertSwimmingAndIndoorSportsDoNotNeedGps();
assertWalkingAndStrengthMapping();
assertNativeZonesAreRespected();
assertNestedSdkShapeParses();
assertHealthMappersWorkWithoutPersistence();
