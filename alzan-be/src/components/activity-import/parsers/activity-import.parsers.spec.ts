import { strict as assert } from 'assert';
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

assertSuuntoStrengthJsonParses();
assertClearEnduranceStrengthJsonIsRejected();
assertSuuntoDistanceActivityIsRejectedForStrength();
assertGpxRouteParses();
