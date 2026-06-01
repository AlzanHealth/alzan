import { strict as assert } from 'assert';
import { parseActivityFileToCanonical } from './activity-import-canonical.parser';
import { parsePolarActivityFileToCanonical } from './polar-activity-canonical.mapper';
import {
  mapPolarDailyActivityToCanonical,
  mapPolarRecoveryToCanonical,
  mapPolarSleepToCanonical,
} from './polar-health-canonical.mapper';
import { parseRouteFileWithSummary } from './route-import.parser';
import { parseStrengthActivityFile } from './strength-activity-import.parser';

function assertPolarV3RunningJsonParses(): void {
  const rawJson = JSON.stringify({
    id: '2AC312F',
    provider: 'polar',
    device: 'Polar Vantage V2',
    device_id: '1111AAAA',
    start_time: '2026-05-01T10:00:00',
    start_time_utc_offset: 120,
    duration: 'PT35M',
    calories: 390,
    distance: 6200,
    heart_rate: { average: 148, maximum: 176 },
    training_load: 143.22,
    sport: 'RUNNING',
    detailed_sport_info: 'RUNNING_ROAD',
    'running-index': 51,
    heart_rate_zones: [
      { index: 1, 'lower-limit': 90, 'upper-limit': 120, 'in-zone': 'PT10M' },
      { index: 2, 'lower-limit': 121, 'upper-limit': 140, 'in-zone': 'PT15M' },
    ],
    samples: [
      { 'recording-rate': 60, 'sample-type': '0', data: '142,154,160' },
      { 'recording-rate': 60, 'sample-type': '1', data: '10.8,11.16,12.24' },
      { 'recording-rate': 60, 'sample-type': '10', data: '0,3100,6200' },
    ],
    route: [
      { latitude: 39.4699, longitude: -0.3763, time: 'PT0S' },
      { latitude: 39.4701, longitude: -0.376, time: 'PT60S' },
    ],
  });
  const canonical = parsePolarActivityFileToCanonical(rawJson, 'polar-running.json', { estimatedMaxHeartRate: 190 });
  assert.equal(canonical.provider, 'polar');
  assert.equal(canonical.providerActivityId, '2AC312F');
  assert.equal(canonical.sportType, 'running');
  assert.equal(canonical.sportSubtype, 'outdoor');
  assert.equal(canonical.summary.startedAt, '2026-05-01T08:00:00.000Z');
  assert.equal(canonical.summary.durationSeconds, 2100);
  assert.equal(canonical.summary.distanceM, 6200);
  assert.equal(canonical.summary.caloriesKcal, 390);
  assert.equal(canonical.summary.avgHeartRate, 148);
  assert.equal(canonical.summary.maxHeartRate, 176);
  assert.ok(Math.abs((canonical.summary.avgSpeedMps ?? 0) - 3.166) < 0.01);
  assert.equal(canonical.streams.position.length, 2);
  assert.equal(canonical.streams.heartRate.length, 3);
  assert.equal(canonical.heartRateZones.length, 2);
  assert.equal(canonical.heartRateZones[0].durationSeconds, 600);
  assert.equal(canonical.vendorFields.polarSport, 'RUNNING');
  assert.equal(canonical.vendorFields.polarDetailedSportInfo, 'RUNNING_ROAD');
  assert.equal(canonical.vendorFields.polarRunningIndex, 51);
}

function assertPolarV4TrainingSessionParses(): void {
  const rawJson = JSON.stringify({
    identifier: { id: 'session-1' },
    startTime: '2026-05-01T08:00:00Z',
    stopTime: '2026-05-01T08:30:00Z',
    durationMillis: 1800000,
    distanceMeters: 5000,
    calories: 330,
    hrAvg: 145,
    hrMax: 175,
    recoveryTimeMillis: 7200000,
    trainingLoad: 120,
    application: { name: 'Polar Flow' },
    product: { modelName: 'Polar Pacer Pro' },
    sport: { id: 'RUNNING_TRAIL' },
    exercises: [
      {
        identifier: { id: 'exercise-1' },
        durationMillis: 1800000,
        distanceMeters: 5000,
        ascentMeters: 90,
        descentMeters: 80,
        runningIndex: 49,
        samples: [
          { type: 'HEART_RATE', intervalMillis: 60000, values: [120, 140, 160] },
          { type: 'SPEED', intervalMillis: 60000, values: [3, 3.4, 3.8] },
          { type: 'DISTANCE', intervalMillis: 60000, values: [0, 2500, 5000] },
        ],
        routes: {
          route: {
            wayPoints: [
              { latitude: 40.4168, longitude: -3.7038, altitude: 650, elapsedMillis: 0 },
              { latitude: 40.4178, longitude: -3.7048, altitude: 660, elapsedMillis: 60000 },
            ],
          },
        },
        laps: [{ durationMillis: 600000, distanceMeters: 1000, splitTimeMillis: 600000 }],
        zones: [{ type: 'ZONE_TYPE_HEART_RATE', inZone: 600000 }],
      },
    ],
  });
  const parsed = parseRouteFileWithSummary(rawJson, 'polar-v4-running.json', { estimatedMaxHeartRate: 190 });
  assert.ok(parsed.polyline.length > 0);
  assert.equal(parsed.summary.sportType, 'trail');
  assert.equal(parsed.summary.sportSubtype, 'trail_running');
  assert.equal(parsed.summary.recoveryTimeSeconds, 7200);
  assert.equal(parsed.summary.elevationGainM, 90);
  assert.equal(parsed.details.customSplits.length, 1);
  assert.equal(parsed.details.heartRateZones[0].zone, 1);
}

function assertPolarCyclingJsonParsesPowerAndCadence(): void {
  const rawJson = JSON.stringify({
    provider: 'polar',
    sport: 'CYCLING',
    detailed_sport_info: 'CYCLING_ROAD',
    start_time: '2026-05-01T12:00:00Z',
    duration: 'PT2M',
    calories: 80,
    distance: 900,
    samples: [
      { 'recording-rate': 60, 'sample-type': '2', data: '80,82' },
      { 'recording-rate': 60, 'sample-type': '4', data: '180,240' },
    ],
  });
  const canonical = parsePolarActivityFileToCanonical(rawJson, 'polar-cycling.json');
  assert.equal(canonical.sportType, 'cycling');
  assert.equal(canonical.sportSubtype, 'road');
  assert.equal(canonical.streams.cadence[1].value, 82);
  assert.equal(canonical.streams.power[1].value, 240);
  assert.equal(canonical.summary.maxPowerW, 240);
}

function assertPolarCyclingDetailedSportMapsTerrain(): void {
  const cases = [
    { detailedSportInfo: 'GRAVEL_CYCLING', expected: 'gravel' },
    { detailedSportInfo: 'MOUNTAIN_BIKING', expected: 'mtb' },
    { detailedSportInfo: 'SPINNING', expected: 'spinning' },
    { detailedSportInfo: 'CITY_CYCLING', expected: 'urban' },
  ] as const;

  for (const testCase of cases) {
    const canonical = parsePolarActivityFileToCanonical(
      JSON.stringify({
        provider: 'polar',
        sport: 'CYCLING',
        detailed_sport_info: testCase.detailedSportInfo,
        start_time: '2026-05-01T12:00:00Z',
        duration: 'PT30M',
      }),
      `polar-${testCase.expected}.json`,
    );
    assert.equal(canonical.sportType, 'cycling');
    assert.equal(canonical.sportSubtype, testCase.expected);
  }
}

function assertPolarSwimmingStoresVendorFields(): void {
  const rawJson = JSON.stringify({
    provider: 'polar',
    sport: { id: 'POOL_SWIMMING' },
    startTime: '2026-05-01T07:00:00Z',
    durationMillis: 1200000,
    distanceMeters: 1000,
    calories: 250,
    exercises: [
      {
        swimmingStatistics: {
          distanceMeters: 1000,
          totalStrokeCount: 420,
          poolsSwum: 40,
          poolLength: 25,
          swolfAvg: 38,
        },
      },
    ],
  });
  const canonical = parsePolarActivityFileToCanonical(rawJson, 'polar-swim.json');
  assert.equal(canonical.sportType, 'swimming');
  assert.equal(canonical.sportSubtype, 'pool');
  assert.deepEqual(canonical.vendorFields.polarSwimmingStatistics, {
    distanceMeters: 1000,
    totalStrokeCount: 420,
    poolsSwum: 40,
    poolLength: 25,
    swolfAvg: 38,
  });
}

function assertPolarPadelWithoutGpsDoesNotFail(): void {
  const rawJson = JSON.stringify({
    provider: 'polar',
    sport: 'OTHER',
    detailed_sport_info: 'RACKET_SPORTS_PADEL',
    start_time: '2026-05-01T20:00:00Z',
    duration: 'PT1H',
    calories: 410,
    heart_rate: { average: 118, maximum: 154 },
  });
  const parsed = parseRouteFileWithSummary(rawJson, 'polar-padel.json', { estimatedMaxHeartRate: 190 });
  assert.equal(parsed.polyline, '');
  assert.equal(parsed.summary.sportType, 'padel');
  assert.equal(parsed.summary.durationSeconds, 3600);
  assert.equal(parsed.summary.caloriesKcal, 410);
}

function assertPolarZonesAreCalculatedWhenNativeMissing(): void {
  const rawJson = JSON.stringify({
    provider: 'polar',
    sport: 'TENNIS',
    start_time: '2026-05-01T18:00:00Z',
    duration: 'PT2M',
    samples: [{ 'recording-rate': 60, 'sample-type': '0', data: '110,120' }],
  });
  const canonical = parsePolarActivityFileToCanonical(rawJson, 'polar-tennis.json', { estimatedMaxHeartRate: 200 });
  assert.equal(canonical.sportType, 'tennis');
  assert.equal(canonical.heartRateZones.length, 1);
  assert.equal(canonical.heartRateZones[0].zone, 1);
  assert.equal(canonical.heartRateZones[0].percentage, 100);
}

function assertPolarStrengthJsonUsesPolarProvider(): void {
  const rawJson = JSON.stringify({
    provider: 'polar',
    sport: 'STRENGTH_TRAINING',
    start_time: '2026-05-01T17:00:00Z',
    duration: 'PT30M',
    calories: 180,
    heart_rate: { average: 105, maximum: 142 },
    device: 'Polar Ignite',
  });
  const summary = parseStrengthActivityFile(rawJson, 'polar-strength.json', { estimatedMaxHeartRate: 190 });
  assert.equal(summary.provider, 'polar');
  assert.equal(summary.durationSeconds, 1800);
  assert.equal(summary.caloriesKcal, 180);
  assert.equal(summary.avgHeartRate, 105);
  assert.equal(summary.maxHeartRate, 142);
}

function assertPolarWalkingMapsToRunningWalk(): void {
  const rawJson = JSON.stringify({
    provider: 'polar',
    sport: 'WALKING',
    start_time: '2026-05-01T09:00:00Z',
    duration: 'PT20M',
    distance: 1400,
  });
  const canonical = parseActivityFileToCanonical(rawJson, 'polar-walk.json');
  assert.equal(canonical.provider, 'polar');
  assert.equal(canonical.sportType, 'hiking');
  assert.equal(canonical.sportSubtype, 'urban_walk');
  assert.equal(canonical.vendorFields.polarSport, 'WALKING');
}

function assertPolarHealthParsesWithoutPersistence(): void {
  const daily = mapPolarDailyActivityToCanonical({
    date: '2026-05-01',
    steps: 12345,
    calories: 550,
    distanceMeters: 7800,
    activeCalories: 420,
  });
  assert.equal(daily.source, 'polar');
  assert.equal(daily.totalSteps, 12345);
  assert.equal(daily.distanceM, 7800);

  const sleep = mapPolarSleepToCanonical({
    id: 'sleep-1',
    date: '2026-05-01',
    sleepStartTime: '2026-04-30T22:30:00Z',
    sleepEndTime: '2026-05-01T06:30:00Z',
    totalSleep: 450,
    deepSleep: 80,
    remSleep: 95,
    sleepScore: 82,
    averageHeartRate: 52,
    averageHrv: 64,
    averageSpo2: 97,
  });
  assert.equal(sleep.sourceSleepId, 'sleep-1');
  assert.equal(sleep.totalSleepMin, 450);
  assert.equal(sleep.deepSleepMin, 80);
  assert.equal(sleep.sleepScore, 82);

  const recovery = mapPolarRecoveryToCanonical({
    date: '2026-05-01',
    timestamp: '2026-05-01T06:30:00Z',
    nightlyRechargeStatus: 74,
    ansCharge: 70,
    hrvAvg: 62,
    breathingRate: 13.5,
  });
  assert.equal(recovery.source, 'polar');
  assert.equal(recovery.recoveryScore, 74);
  assert.equal(recovery.balance, 70);
  assert.equal(recovery.avgHrvMs, 62);
}

assertPolarV3RunningJsonParses();
assertPolarV4TrainingSessionParses();
assertPolarCyclingJsonParsesPowerAndCadence();
assertPolarCyclingDetailedSportMapsTerrain();
assertPolarSwimmingStoresVendorFields();
assertPolarPadelWithoutGpsDoesNotFail();
assertPolarZonesAreCalculatedWhenNativeMissing();
assertPolarStrengthJsonUsesPolarProvider();
assertPolarWalkingMapsToRunningWalk();
assertPolarHealthParsesWithoutPersistence();
