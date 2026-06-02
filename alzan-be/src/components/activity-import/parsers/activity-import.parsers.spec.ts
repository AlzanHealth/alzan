import { strict as assert } from 'assert';
import { parseActivityFileToCanonical } from './activity-import-canonical.parser';
import { parseStrengthActivityFile, STRENGTH_ACTIVITY_UNSUPPORTED_ERROR_TAG } from './strength-activity-import.parser';
import { parseRouteFileWithSummary } from './route-import.parser';

function assertSuuntoStrengthJsonParses(): void {
  const rawJson = JSON.stringify({
    DeviceLog: {
      Header: {
        DateTime: '2026-05-01T08:00:00Z',
        Duration: 1800,
        Energy: 418400,
        AverageHeartRate: 1.5,
        MaxHeartRate: 170,
        StepCount: 1200,
        TrainingLoadPeak: 4.2,
        PeakTrainingEffect: 2.6,
      },
      Device: {
        Name: 'Suunto Race',
        SerialNumber: 'ABC123',
        Info: { HW: 'Race' },
      },
      Samples: [
        { TimeISO8601: '2026-05-01T08:00:10Z', HR: 1.5 },
        { TimeISO8601: '2026-05-01T08:00:20Z', HR: 155 },
      ],
    },
  });

  const summary = parseStrengthActivityFile(rawJson, 'suunto-strength.json');

  assert.equal(summary.provider, 'suunto');
  assert.equal(summary.sourceFileType, 'json');
  assert.equal(summary.durationSeconds, 1800);
  assert.equal(summary.caloriesKcal, 100);
  assert.equal(summary.avgHeartRate, 90);
  assert.equal(summary.maxHeartRate, 170);
  assert.equal(summary.totalSteps, 1200);
  assert.equal(summary.tss, 57);
  assert.equal(summary.pte, 2.6);
  assert.equal(summary.device?.serial, 'ABC123');
  assert.equal(summary.heartRateStream.length, 2);
}

function assertClearEnduranceStrengthJsonIsRejected(): void {
  const rawJson = JSON.stringify({
    type: 'running',
    distance: 5000,
    duration: 1600,
  });

  assert.throws(
    () => parseStrengthActivityFile(rawJson, 'strava-run.json'),
    error => error instanceof Error && error.message === STRENGTH_ACTIVITY_UNSUPPORTED_ERROR_TAG,
  );
}

function assertSuuntoDistanceActivityIsRejectedForStrength(): void {
  const rawJson = JSON.stringify({
    DeviceLog: {
      Header: {
        ActivityType: 3,
        Distance: 6890,
        Duration: 2733.995,
      },
    },
  });

  assert.throws(
    () => parseStrengthActivityFile(rawJson, 'suunto-running.json'),
    error => error instanceof Error && error.message === STRENGTH_ACTIVITY_UNSUPPORTED_ERROR_TAG,
  );
}

function assertGpxRouteParses(): void {
  const gpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Alzan Test">
  <trk>
    <trkseg>
      <trkpt lat="40.4168" lon="-3.7038"><ele>650</ele><time>2026-05-01T08:00:00Z</time></trkpt>
      <trkpt lat="40.4178" lon="-3.7048"><ele>660</ele><time>2026-05-01T08:01:00Z</time></trkpt>
      <trkpt lat="40.4188" lon="-3.7058"><ele>655</ele><time>2026-05-01T08:02:00Z</time></trkpt>
    </trkseg>
  </trk>
</gpx>`;

  const parsed = parseRouteFileWithSummary(gpx, 'run.gpx', { estimatedMaxHeartRate: 190 });

  assert.ok(parsed.polyline.length > 0);
  assert.ok((parsed.summary.distanceM ?? 0) > 0);
  assert.equal(parsed.summary.durationSeconds, 120);
  assert.ok(parsed.details.distanceSplits.length >= 0);
}

function assertSuuntoJsonKeepsNativeAutoLapDurations(): void {
  const rawJson = JSON.stringify({
    DeviceLog: {
      Header: {
        ActivityType: 3,
        Activity: 'Running',
        Distance: 8023,
        Duration: 2638.264,
      },
      Samples: [
        {
          TimeISO8601: '2026-05-09T19:29:52.819+02:00',
          Latitude: 0.6841518089661335,
          Longitude: -0.008894602784549566,
        },
        {
          TimeISO8601: '2026-05-09T19:46:52.819+02:00',
          Latitude: 0.6841955957864075,
          Longitude: -0.008928572127781132,
        },
      ],
      Windows: [
        {
          Window: {
            Type: 'Autolap',
            Distance: 1000,
            DistanceMax: 1000,
            Duration: 316.7,
            HR: [{ Avg: 2.271, Max: 2.467 }],
            Speed: [{ Avg: 3.158 }],
          },
        },
        {
          Window: {
            Type: 'Autolap',
            Distance: 1000,
            DistanceMax: 1000,
            Duration: 318.2,
            HR: [{ Avg: 2.657, Max: 2.783 }],
            Speed: [{ Avg: 3.142 }],
          },
        },
        {
          Window: {
            Type: 'Autolap',
            Distance: 1000,
            DistanceMax: 1000,
            Duration: 321.9,
            HR: [{ Avg: 2.738, Max: 2.817 }],
            Speed: [{ Avg: 3.107 }],
          },
        },
        {
          Window: {
            Type: 'Activity',
            Distance: 8023,
            DistanceMax: 8023,
            Duration: 2609,
          },
        },
      ],
    },
  });

  const parsed = parseRouteFileWithSummary(rawJson, 'suunto-running.json', { estimatedMaxHeartRate: 195 });

  assert.equal(parsed.details.customSplits.length, 3);
  assert.equal(parsed.details.customSplits[2].durationSeconds, 321.9);
  assert.equal(Math.round(parsed.details.customSplits[2].avgPaceSecondsPerKm ?? 0), 322);
  assert.equal(Math.round(parsed.details.customSplits[2].avgHeartRate ?? 0), 164);
}

function assertGenericCyclingTerrainIsNotLost(): void {
  const cases = [
    { sportType: 'Gravel cycling', expected: 'gravel' },
    { sportType: 'Mountain bike', expected: 'mtb' },
    { sportType: 'Indoor spin ride', expected: 'spinning' },
    { sportType: 'Urban bike commute', expected: 'urban' },
  ] as const;

  for (const testCase of cases) {
    const canonical = parseActivityFileToCanonical(
      JSON.stringify({
        sport_type: testCase.sportType,
        start_time: '2026-05-01T08:00:00Z',
        duration_s: 1800,
      }),
      `generic-${testCase.expected}.json`,
    );
    assert.equal(canonical.sportType, 'cycling');
    assert.equal(canonical.sportSubtype, testCase.expected);
  }
}

function assertGenericWalkingUsesHikingCatalogModality(): void {
  const canonical = parseActivityFileToCanonical(
    JSON.stringify({
      sport_type: 'Walking',
      start_time: '2026-05-01T08:00:00Z',
      duration_s: 1800,
    }),
    'generic-walking.json',
  );
  assert.equal(canonical.sportType, 'hiking');
  assert.equal(canonical.sportSubtype, 'urban_walk');
}

function assertGenericMartialArtsUsesCatalogModality(): void {
  const canonical = parseActivityFileToCanonical(
    JSON.stringify({
      sport_type: 'Brazilian Jiu Jitsu',
      start_time: '2026-05-01T08:00:00Z',
      duration_s: 3600,
      calories_kcal: 420,
    }),
    'generic-bjj.json',
  );
  assert.equal(canonical.sportType, 'martial_arts');
  assert.equal(canonical.sportSubtype, 'jiu_jitsu_bjj');
}

function assertGenericClimbingUsesCatalogModality(): void {
  const canonical = parseActivityFileToCanonical(
    JSON.stringify({
      sport_type: 'Bouldering',
      start_time: '2026-05-01T08:00:00Z',
      duration_s: 3600,
      calories_kcal: 520,
    }),
    'generic-bouldering.json',
  );
  assert.equal(canonical.sportType, 'climbing');
  assert.equal(canonical.sportSubtype, 'bouldering');
}

function assertGenericVolleyballUsesCatalogModality(): void {
  const canonical = parseActivityFileToCanonical(
    JSON.stringify({
      sport_type: 'Beach Volleyball',
      start_time: '2026-05-01T18:00:00Z',
      duration_s: 3600,
      calories_kcal: 480,
    }),
    'generic-beach-volleyball.json',
  );
  assert.equal(canonical.sportType, 'volleyball');
  assert.equal(canonical.sportSubtype, 'beach_volleyball');
}

function assertGenericTrailUsesCatalogModality(): void {
  const canonical = parseActivityFileToCanonical(
    JSON.stringify({
      sport_type: 'Ultra Trail',
      start_time: '2026-05-01T07:00:00Z',
      duration_s: 7200,
      distance_m: 18000,
      elevationGainM: 900,
    }),
    'generic-ultra-trail.json',
  );
  assert.equal(canonical.sportType, 'trail');
  assert.equal(canonical.sportSubtype, 'ultra_trail');
  assert.equal(canonical.summary.elevationGainM, 900);
}

function assertGenericSkiingUsesCatalogModality(): void {
  const cases = [
    { name: 'Alpine Skiing', subtype: 'alpine' },
    { name: 'Nordic Skiing', subtype: 'cross_country' },
    { name: 'Backcountry randonee', subtype: 'backcountry' },
    { name: 'Skiing Freeride in snow', subtype: 'freeride' },
  ] as const;

  for (const testCase of cases) {
    const canonical = parseActivityFileToCanonical(
      JSON.stringify({
        sport_type: testCase.name,
        start_time: '2026-06-01T08:00:00Z',
        duration_s: 3600,
      }),
      `generic-${testCase.subtype}.json`,
    );
    assert.equal(canonical.sportType, 'skiing');
    assert.equal(canonical.sportSubtype, testCase.subtype);
  }
}

function assertGenericSnowboardUsesCatalogModality(): void {
  const cases = [
    { name: 'Snowboarding', subtype: null },
    { name: 'Splitboard', subtype: 'splitboard' },
    { name: 'Snowboard Freeride', subtype: 'freeride' },
    { name: 'Freestyle Snowboard', subtype: 'park_freestyle' },
    { name: 'Alpine Snowboard', subtype: 'slope' },
  ] as const;

  for (const testCase of cases) {
    const canonical = parseActivityFileToCanonical(
      JSON.stringify({
        sport_type: testCase.name,
        start_time: '2026-06-01T08:00:00Z',
        duration_s: 3600,
      }),
      `generic-${testCase.subtype ?? 'snowboard'}.json`,
    );
    assert.equal(canonical.sportType, 'snowboard');
    assert.equal(canonical.sportSubtype, testCase.subtype);
  }
}

function assertGenericGolfUsesCatalogModality(): void {
  const cases = [
    { name: 'Golf', subtype: null },
    { name: '18 holes round of golf', subtype: 'round_18_holes' },
    { name: 'Driving range practice', subtype: 'driving_range' },
    { name: 'Pitch & putt', subtype: 'pitch_and_putt' },
  ] as const;

  for (const testCase of cases) {
    const canonical = parseActivityFileToCanonical(
      JSON.stringify({
        sport_type: testCase.name,
        start_time: '2026-06-01T08:00:00Z',
        duration_s: 3600,
      }),
      `generic-golf-${testCase.subtype ?? 'round'}.json`,
    );
    assert.equal(canonical.sportType, 'golf');
    assert.equal(canonical.sportSubtype, testCase.subtype);
  }
}

assertSuuntoStrengthJsonParses();
assertClearEnduranceStrengthJsonIsRejected();
assertSuuntoDistanceActivityIsRejectedForStrength();
assertGpxRouteParses();
assertSuuntoJsonKeepsNativeAutoLapDurations();
assertGenericCyclingTerrainIsNotLost();
assertGenericWalkingUsesHikingCatalogModality();
assertGenericMartialArtsUsesCatalogModality();
assertGenericClimbingUsesCatalogModality();
assertGenericVolleyballUsesCatalogModality();
assertGenericTrailUsesCatalogModality();
assertGenericSkiingUsesCatalogModality();
assertGenericSnowboardUsesCatalogModality();
assertGenericGolfUsesCatalogModality();
