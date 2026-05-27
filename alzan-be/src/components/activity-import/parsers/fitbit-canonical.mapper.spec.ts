import { strict as assert } from 'assert';
import { parseActivityFileToCanonical } from './activity-import-canonical.parser';
import { parseFitbitActivityJsonToCanonical } from './fitbit-activity-canonical.mapper';
import {
  mapFitbitDailyActivityToCanonical,
  mapFitbitRecoveryToCanonical,
  mapFitbitSleepToCanonical,
} from './fitbit-health-canonical.mapper';
import { parseRouteFileWithSummary } from './route-import.parser';
import { parseStrengthActivityFile } from './strength-activity-import.parser';

function assertFitbitRunningActivityLogParses(): void {
  const rawJson = JSON.stringify({
    provider: 'fitbit',
    logId: 12345678,
    activityName: 'Run',
    activityTypeId: 90009,
    logType: 'tracker',
    startTime: '2026-05-01T07:30:00.000+02:00',
    duration: 3600000,
    activeDuration: 3500000,
    calories: 500,
    distance: 10,
    distanceUnit: 'Kilometer',
    steps: 8000,
    averageHeartRate: 155,
    source: { name: 'Fitbit Charge 6', type: 'tracker', trackerFeatures: ['GPS', 'HEARTRATE', 'STEPS'] },
  });
  const canonical = parseFitbitActivityJsonToCanonical(rawJson, 'fitbit-run.json');
  assert.equal(canonical.provider, 'fitbit');
  assert.equal(canonical.providerActivityId, '12345678');
  assert.equal(canonical.sportType, 'running');
  assert.equal(canonical.sportSubtype, 'road');
  assert.equal(canonical.summary.startedAt, '2026-05-01T05:30:00.000Z');
  assert.equal(canonical.summary.durationSeconds, 3600);
  assert.equal(canonical.summary.elapsedSeconds, 3600);
  assert.equal(canonical.summary.distanceM, 10000);
  assert.equal(canonical.summary.caloriesKcal, 500);
  assert.equal(canonical.summary.totalSteps, 8000);
  assert.equal(canonical.summary.avgHeartRate, 155);
  assert.equal(canonical.device?.name, 'Fitbit Charge 6');
  assert.equal(canonical.vendorFields.fitbitLogType, 'tracker');
}

function assertFitbitCyclingActivityLogParsesDeviceAndSpeed(): void {
  const rawJson = JSON.stringify({
    provider: 'fitbit',
    logId: 'ride-1',
    activityName: 'Bike',
    activityTypeId: 90001,
    startTime: '2026-05-01T10:00:00.000Z',
    duration: 1800000,
    calories: 250,
    distance: 12000,
    speed: 24,
    source: { name: 'Fitbit Sense 2', type: 'tracker' },
  });
  const canonical = parseActivityFileToCanonical(rawJson, 'fitbit-bike.json');
  assert.equal(canonical.provider, 'fitbit');
  assert.equal(canonical.sportType, 'cycling');
  assert.equal(canonical.sportSubtype, 'road');
  assert.equal(canonical.summary.distanceM, 12000);
  assert.ok(Math.abs((canonical.summary.avgSpeedMps ?? 0) - 6.666) < 0.01);
  assert.equal(canonical.device?.model, 'Fitbit Sense 2');
}

function assertFitbitCyclingModalitiesUseDetailedActivityName(): void {
  const cases = [
    { activityName: 'Gravel Bike Ride', expected: 'gravel' },
    { activityName: 'Mountain Bike Ride', expected: 'trail' },
    { activityName: 'Spin Indoor Cycling', expected: 'spinning' },
    { activityName: 'Urban Bike Commute', expected: 'urban' },
  ] as const;

  for (const testCase of cases) {
    const canonical = parseActivityFileToCanonical(
      JSON.stringify({
        provider: 'fitbit',
        activityName: testCase.activityName,
        activityTypeId: 90001,
        startTime: '2026-05-01T10:00:00.000Z',
        duration: 1800000,
      }),
      `fitbit-${testCase.expected}.json`,
    );
    assert.equal(canonical.sportType, 'cycling');
    assert.equal(canonical.sportSubtype, testCase.expected);
  }
}

function assertFitbitTcxParsesRouteAndHeartRate(): void {
  const tcx = `<?xml version="1.0" encoding="UTF-8"?>
<TrainingCenterDatabase>
  <Activities>
    <Activity Sport="Running">
      <Id>2026-05-01T07:30:00.000Z</Id>
      <Lap StartTime="2026-05-01T07:30:00.000Z">
        <TotalTimeSeconds>60</TotalTimeSeconds>
        <DistanceMeters>200</DistanceMeters>
        <Calories>15</Calories>
        <Track>
          <Trackpoint>
            <Time>2026-05-01T07:30:00.000Z</Time>
            <Position><LatitudeDegrees>39.4699</LatitudeDegrees><LongitudeDegrees>-0.3763</LongitudeDegrees></Position>
            <AltitudeMeters>20</AltitudeMeters>
            <DistanceMeters>0</DistanceMeters>
            <HeartRateBpm><Value>120</Value></HeartRateBpm>
          </Trackpoint>
          <Trackpoint>
            <Time>2026-05-01T07:31:00.000Z</Time>
            <Position><LatitudeDegrees>39.4709</LatitudeDegrees><LongitudeDegrees>-0.3761</LongitudeDegrees></Position>
            <AltitudeMeters>22</AltitudeMeters>
            <DistanceMeters>200</DistanceMeters>
            <HeartRateBpm><Value>140</Value></HeartRateBpm>
          </Trackpoint>
        </Track>
      </Lap>
    </Activity>
  </Activities>
</TrainingCenterDatabase>`;
  const parsed = parseRouteFileWithSummary(tcx, 'fitbit-run.tcx', { estimatedMaxHeartRate: 190 });
  assert.ok(parsed.polyline.length > 0);
  assert.ok((parsed.summary.distanceM ?? 0) > 0);
  assert.equal(parsed.summary.durationSeconds, 60);
  assert.ok(parsed.details.heartRateZones.length > 0);
}

function assertFitbitWorkoutSummaryParsesRunningMetrics(): void {
  const rawJson = JSON.stringify({
    provider: 'fitbit',
    logId: 12345678,
    activityName: 'Run',
    activityTypeId: 90009,
    startTime: '2026-05-01T07:30:00.000Z',
    duration: 1200000,
    workoutSummary: {
      logId: 12345678,
      mobilityMetrics: {
        avgCadenceStepsPerMinute: 164,
        avgGroundContactTimeMilliseconds: 285,
      },
    },
  });
  const canonical = parseFitbitActivityJsonToCanonical(rawJson, 'fitbit-workout-summary.json');
  assert.equal(canonical.summary.avgCadence, 164);
  assert.equal(canonical.vendorFields.fitbitAvgGroundContactTimeMs, 285);
}

function assertFitbitCourtAndTeamSportsWithoutGpsDoNotFail(): void {
  const padel = JSON.stringify({
    provider: 'fitbit',
    logId: 10,
    activityName: 'Padel',
    activityTypeId: 90019,
    startTime: '2026-05-01T18:00:00.000Z',
    duration: 3600000,
    calories: 430,
    averageHeartRate: 124,
  });
  const parsedPadel = parseRouteFileWithSummary(padel, 'fitbit-padel.json', { estimatedMaxHeartRate: 190 });
  assert.equal(parsedPadel.polyline, '');
  assert.equal(parsedPadel.summary.sportType, 'padel');
  assert.equal(parsedPadel.summary.caloriesKcal, 430);

  const sports = [
    { activityName: 'Tennis', activityTypeId: 27, expected: 'tennis' },
    { activityName: 'Soccer', activityTypeId: 15, expected: 'football' },
    { activityName: 'Basketball', activityTypeId: 16, expected: 'basketball' },
  ];
  for (const sport of sports) {
    const rawJson = JSON.stringify({
      provider: 'fitbit',
      logId: sport.activityTypeId,
      activityName: sport.activityName,
      activityTypeId: sport.activityTypeId,
      startTime: '2026-05-01T18:00:00.000Z',
      duration: 1200000,
    });
    const parsed = parseRouteFileWithSummary(rawJson, `fitbit-${sport.activityName}.json`);
    assert.equal(parsed.polyline, '');
    assert.equal(parsed.summary.sportType, sport.expected);
  }
}

function assertFitbitNativeHeartRateZonesAreMapped(): void {
  const rawJson = JSON.stringify({
    provider: 'fitbit',
    logId: 123,
    activityName: 'Run',
    activityTypeId: 90009,
    startTime: '2026-05-01T07:30:00.000Z',
    duration: 1800000,
    heartRateZones: [
      { name: 'Out of Range', minutes: 5 },
      { name: 'Fat Burn', minutes: 10 },
      { name: 'Cardio', minutes: 12 },
      { name: 'Peak', minutes: 3 },
    ],
  });
  const canonical = parseFitbitActivityJsonToCanonical(rawJson, 'fitbit-zones.json');
  assert.equal(canonical.heartRateZones.length, 4);
  assert.deepEqual(
    canonical.heartRateZones.map(zone => zone.zone),
    [1, 2, 3, 5],
  );
  assert.equal(canonical.heartRateZones[0].durationSeconds, 300);
  assert.equal(canonical.heartRateZones[3].percentage, 10);
}

function assertFitbitZonesAreCalculatedFromHeartRateStream(): void {
  const rawJson = JSON.stringify({
    provider: 'fitbit',
    logId: 123,
    activityName: 'Run',
    activityTypeId: 90009,
    startTime: '2026-05-01T07:30:00.000Z',
    duration: 120000,
    streams: {
      heartrate: [
        { time: '07:30:00', value: 100 },
        { time: '07:31:00', value: 110 },
      ],
    },
  });
  const canonical = parseFitbitActivityJsonToCanonical(rawJson, 'fitbit-hr-stream.json', {
    estimatedMaxHeartRate: 200,
  });
  assert.equal(canonical.streams.heartRate.length, 2);
  assert.equal(canonical.heartRateZones.length, 1);
  assert.equal(canonical.heartRateZones[0].zone, 1);
  assert.equal(canonical.heartRateZones[0].percentage, 100);
}

function assertFitbitWalkingMapsToRunningWalk(): void {
  const rawJson = JSON.stringify({
    provider: 'fitbit',
    logId: 19018673358,
    activityName: 'Walk',
    activityTypeId: 90013,
    startTime: '2026-05-01T09:00:00.000Z',
    duration: 1200000,
    steps: 1799,
  });
  const canonical = parseActivityFileToCanonical(rawJson, 'fitbit-walk.json');
  assert.equal(canonical.provider, 'fitbit');
  assert.equal(canonical.sportType, 'running');
  assert.equal(canonical.sportSubtype, 'walk');
  assert.equal(canonical.vendorFields.fitbitActivityName, 'Walk');
}

function assertFitbitStrengthJsonUsesFitbitProvider(): void {
  const rawJson = JSON.stringify({
    provider: 'fitbit',
    logId: 555,
    activityName: 'Strength Training',
    activityTypeId: 3000,
    startTime: '2026-05-01T17:00:00.000Z',
    duration: 1800000,
    calories: 180,
    averageHeartRate: 105,
    source: { name: 'Fitbit Charge 6' },
  });
  const summary = parseStrengthActivityFile(rawJson, 'fitbit-strength.json', { estimatedMaxHeartRate: 190 });
  assert.equal(summary.provider, 'fitbit');
  assert.equal(summary.durationSeconds, 1800);
  assert.equal(summary.caloriesKcal, 180);
  assert.equal(summary.avgHeartRate, 105);
  assert.equal(summary.device?.name, 'Fitbit Charge 6');
}

function assertFitbitHealthParsesWithoutPersistence(): void {
  const daily = mapFitbitDailyActivityToCanonical({
    date: '2026-05-01',
    summary: {
      steps: 12345,
      caloriesOut: 2450,
      distances: [{ activity: 'total', distance: 7.8 }],
      floors: 12,
      elevation: 36,
      lightlyActiveMinutes: 70,
      fairlyActiveMinutes: 25,
      veryActiveMinutes: 12,
      sedentaryMinutes: 700,
    },
  });
  assert.equal(daily.source, 'fitbit');
  assert.equal(daily.totalSteps, 12345);
  assert.equal(daily.distanceM, 7800);
  assert.equal(daily.floorsClimbed, 12);

  const sleep = mapFitbitSleepToCanonical({
    sleep: [
      {
        logId: 99,
        dateOfSleep: '2026-05-01',
        startTime: '2026-04-30T22:30:00.000',
        endTime: '2026-05-01T06:30:00.000',
        minutesAsleep: 450,
        minutesAwake: 30,
        efficiency: 88,
        levels: {
          summary: {
            deep: { minutes: 80 },
            light: { minutes: 250 },
            rem: { minutes: 120 },
            wake: { minutes: 30 },
          },
        },
      },
    ],
  });
  assert.equal(sleep.sourceSleepId, '99');
  assert.equal(sleep.totalSleepMin, 450);
  assert.equal(sleep.deepSleepMin, 80);
  assert.equal(sleep.sleepScore, 88);

  const recovery = mapFitbitRecoveryToCanonical({
    date: '2026-05-01',
    restingHeartRate: 52,
    hrv: { dailyRmssd: 64 },
    spo2: { avg: 97 },
    breathingRate: 13.5,
    temperature: { skinTemperature: 0.4 },
    vo2Max: 48,
  });
  assert.equal(recovery.source, 'fitbit');
  assert.equal(recovery.restingHrBpm, 52);
  assert.equal(recovery.avgHrvMs, 64);
  assert.equal(recovery.spo2AvgPct, 97);
}

assertFitbitRunningActivityLogParses();
assertFitbitCyclingActivityLogParsesDeviceAndSpeed();
assertFitbitCyclingModalitiesUseDetailedActivityName();
assertFitbitTcxParsesRouteAndHeartRate();
assertFitbitWorkoutSummaryParsesRunningMetrics();
assertFitbitCourtAndTeamSportsWithoutGpsDoNotFail();
assertFitbitNativeHeartRateZonesAreMapped();
assertFitbitZonesAreCalculatedFromHeartRateStream();
assertFitbitWalkingMapsToRunningWalk();
assertFitbitStrengthJsonUsesFitbitProvider();
assertFitbitHealthParsesWithoutPersistence();
