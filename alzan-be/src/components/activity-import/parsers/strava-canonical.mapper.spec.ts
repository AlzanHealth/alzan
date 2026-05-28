import { strict as assert } from 'assert';
import { parseActivityFileToCanonical } from './activity-import-canonical.parser';
import { parseStravaActivityJsonToCanonical } from './strava-activity-canonical.mapper';
import { encodePolyline, parseRouteFileWithSummary } from './route-import.parser';

function assertStravaRunningJsonParsesSummary(): void {
  const rawJson = JSON.stringify({
    provider: 'strava',
    id: 123456,
    external_id: 'garmin_push_123',
    upload_id: 654321,
    upload_id_str: '654321',
    sport_type: 'Run',
    start_date: '2026-05-01T12:00:00Z',
    start_date_local: '2026-05-01T14:00:00Z',
    timezone: '(GMT+01:00) Europe/Madrid',
    moving_time: 1680,
    elapsed_time: 1800,
    distance: 5200,
    calories: 305,
    average_heartrate: 142,
    max_heartrate: 169,
    average_speed: 3.1,
    max_speed: 5.4,
    average_cadence: 82,
    device_name: 'Garmin Forerunner',
    suffer_score: 42,
  });
  const canonical = parseStravaActivityJsonToCanonical(rawJson, 'strava-running.json', { estimatedMaxHeartRate: 190 });
  assert.equal(canonical.provider, 'strava');
  assert.equal(canonical.sourceFileType, 'json');
  assert.equal(canonical.providerActivityId, '123456');
  assert.equal(canonical.sportType, 'running');
  assert.equal(canonical.sportSubtype, 'outdoor');
  assert.equal(canonical.summary.durationSeconds, 1680);
  assert.equal(canonical.summary.elapsedSeconds, 1800);
  assert.equal(canonical.summary.distanceM, 5200);
  assert.equal(canonical.summary.caloriesKcal, 305);
  assert.equal(canonical.summary.avgHeartRate, 142);
  assert.equal(canonical.summary.maxHeartRate, 169);
  assert.equal(canonical.summary.avgSpeedMps, 3.1);
  assert.equal(canonical.summary.maxSpeedMps, 5.4);
  assert.equal(canonical.summary.avgCadence, 82);
  assert.equal(canonical.device?.name, 'Garmin Forerunner');
  assert.equal(canonical.vendorFields.sourceProvider, 'strava');
  assert.equal(canonical.vendorFields.stravaSportType, 'Run');
  assert.equal(canonical.vendorFields.stravaSufferScore, 42);
}

function assertStravaCyclingJsonParsesStreams(): void {
  const rawJson = JSON.stringify({
    provider: 'strava',
    sport_type: 'Ride',
    start_date: '2026-05-01T13:00:00Z',
    moving_time: 120,
    elapsed_time: 140,
    distance: 800,
    calories: 90,
    average_heartrate: 136,
    max_heartrate: 171,
    average_watts: 185,
    max_watts: 460,
    weighted_average_watts: 210,
    kilojoules: 95,
    device_watts: true,
    streams: {
      time: [0, 60, 120],
      latlng: [
        [41.3874, 2.1686],
        [41.3974, 2.1786],
        [41.4074, 2.1886],
      ],
      distance: [0, 400, 800],
      altitude: [12, 14, 16],
      velocity_smooth: [5.5, 6.5, 7.5],
      heartrate: [120, 130, 140],
      cadence: [80, 82, 84],
      watts: [170, 190, 210],
      temp: [22, 23, 24],
      moving: [true, true, true],
      grade_smooth: [0.5, 1.2, 0.8],
    },
  });
  const canonical = parseStravaActivityJsonToCanonical(rawJson, 'strava-cycling.json', { estimatedMaxHeartRate: 190 });
  assert.equal(canonical.sportType, 'cycling');
  assert.equal(canonical.sportSubtype, 'road');
  assert.equal(canonical.summary.avgPowerW, 185);
  assert.equal(canonical.summary.maxPowerW, 460);
  assert.equal(canonical.streams.position.length, 3);
  assert.equal(canonical.streams.heartRate.length, 3);
  assert.equal(canonical.streams.power[1].value, 190);
  assert.equal(canonical.streams.temperature[2].value, 24);
  assert.deepEqual(canonical.vendorFields.stravaMoving, [true, true, true]);
  assert.deepEqual(canonical.vendorFields.stravaGradeSmooth, [0.5, 1.2, 0.8]);
}

function assertStravaCyclingModalitiesArePreserved(): void {
  const cases: Array<{ sportType: string; name?: string; trainer?: boolean; expected: string }> = [
    { sportType: 'GravelRide', expected: 'gravel' },
    { sportType: 'MountainBikeRide', expected: 'mtb' },
    { sportType: 'Ride', name: 'Spin class', trainer: true, expected: 'spinning' },
    { sportType: 'Ride', name: 'Urban commute', expected: 'urban' },
  ];

  for (const testCase of cases) {
    const canonical = parseStravaActivityJsonToCanonical(
      JSON.stringify({
        provider: 'strava',
        sport_type: testCase.sportType,
        name: testCase.name,
        trainer: testCase.trainer,
        start_date: '2026-05-01T13:00:00Z',
        moving_time: 120,
      }),
      `strava-${testCase.expected}.json`,
    );
    assert.equal(canonical.sportType, 'cycling');
    assert.equal(canonical.sportSubtype, testCase.expected);
  }
}

function assertStravaRouteParseUsesStreamLatLng(): void {
  const rawJson = JSON.stringify({
    provider: 'strava',
    sport_type: 'Ride',
    start_date: '2026-05-01T13:00:00Z',
    moving_time: 60,
    distance: 400,
    streams: {
      time: [0, 60],
      latlng: [
        [41.3874, 2.1686],
        [41.3974, 2.1786],
      ],
      heartrate: [120, 130],
    },
  });
  const parsed = parseRouteFileWithSummary(rawJson, 'strava-cycling.json', { estimatedMaxHeartRate: 190 });
  assert.ok(parsed.polyline.length > 0);
  assert.equal(parsed.summary.sportType, 'cycling');
  assert.equal(parsed.summary.distanceM, 400);
  assert.equal(parsed.details.heartRateZones[0].zone, 1);
  assert.equal(parsed.details.heartRateZones[0].percentage, 100);
}

function assertStravaRouteParseUsesSummaryPolylineWithoutStreams(): void {
  const stravaPolyline = encodePolyline([
    [39.4699, -0.3763],
    [39.4701, -0.376],
  ]);
  const rawJson = JSON.stringify({
    provider: 'strava',
    sport_type: 'Run',
    start_date: '2026-05-01T12:00:00Z',
    moving_time: 120,
    distance: 200,
    map: {
      summary_polyline: stravaPolyline,
    },
  });
  const parsed = parseRouteFileWithSummary(rawJson, 'strava-running.json', { estimatedMaxHeartRate: 190 });
  assert.equal(parsed.polyline, stravaPolyline);
  assert.equal(parsed.summary.sportType, 'running');
  assert.equal(parsed.summary.distanceM, 200);
}

function assertStravaPadelWithoutGpsDoesNotFail(): void {
  const rawJson = JSON.stringify({
    provider: 'strava',
    sport_type: 'Padel',
    start_date: '2026-05-01T20:00:00Z',
    moving_time: 3600,
    calories: 410,
    average_heartrate: 118,
    max_heartrate: 154,
  });
  const parsed = parseRouteFileWithSummary(rawJson, 'strava-padel.json', { estimatedMaxHeartRate: 190 });
  assert.equal(parsed.polyline, '');
  assert.equal(parsed.summary.sportType, 'padel');
  assert.equal(parsed.summary.durationSeconds, 3600);
  assert.equal(parsed.summary.caloriesKcal, 410);
}

function assertStravaNativeHeartRateZonesAreUsed(): void {
  const rawJson = JSON.stringify({
    provider: 'strava',
    sport_type: 'Run',
    start_date: '2026-05-01T12:00:00Z',
    moving_time: 300,
    zones: [
      {
        type: 'heartrate',
        distribution_buckets: [
          { min: 90, max: 120, time: 120 },
          { min: 121, max: 140, time: 90 },
          { min: 141, max: 160, time: 60 },
          { min: 161, max: 180, time: 30 },
          { min: 181, max: -1, time: 0 },
        ],
      },
    ],
  });
  const canonical = parseStravaActivityJsonToCanonical(rawJson, 'strava-zones.json', { estimatedMaxHeartRate: 190 });
  assert.equal(canonical.heartRateZones.length, 4);
  assert.equal(canonical.heartRateZones[0].zone, 1);
  assert.equal(canonical.heartRateZones[0].durationSeconds, 120);
  assert.equal(canonical.heartRateZones[0].percentage, 40);
}

function assertStravaHeartRateZonesAreCalculatedFromStream(): void {
  const rawJson = JSON.stringify({
    provider: 'strava',
    sport_type: 'Run',
    start_date: '2026-05-01T12:00:00Z',
    moving_time: 60,
    streams: {
      time: [0, 60],
      heartrate: [110, 120],
    },
  });
  const canonical = parseStravaActivityJsonToCanonical(rawJson, 'strava-hr.json', { estimatedMaxHeartRate: 200 });
  assert.equal(canonical.heartRateZones.length, 1);
  assert.equal(canonical.heartRateZones[0].zone, 1);
  assert.equal(canonical.heartRateZones[0].percentage, 100);
}

function assertStravaWalkUsesHikingUrbanWalkSubtype(): void {
  const rawJson = JSON.stringify({
    provider: 'strava',
    sport_type: 'Walk',
    start_date: '2026-05-01T10:00:00Z',
    moving_time: 1200,
    distance: 1500,
  });
  const canonical = parseActivityFileToCanonical(rawJson, 'strava-walk.json', { estimatedMaxHeartRate: 190 });
  assert.equal(canonical.provider, 'strava');
  assert.equal(canonical.sportType, 'hiking');
  assert.equal(canonical.sportSubtype, 'urban_walk');
  assert.equal(canonical.vendorFields.stravaSportType, 'Walk');
}

assertStravaRunningJsonParsesSummary();
assertStravaCyclingJsonParsesStreams();
assertStravaCyclingModalitiesArePreserved();
assertStravaRouteParseUsesStreamLatLng();
assertStravaRouteParseUsesSummaryPolylineWithoutStreams();
assertStravaPadelWithoutGpsDoesNotFail();
assertStravaNativeHeartRateZonesAreUsed();
assertStravaHeartRateZonesAreCalculatedFromStream();
assertStravaWalkUsesHikingUrbanWalkSubtype();
