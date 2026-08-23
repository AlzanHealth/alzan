import { strict as assert } from 'assert';
import { CanonicalActivity } from '../../activity-import/parsers/activity-import-canonical.types';
import { mergeCorosMultisportActivities } from './coros-multisport.utils';

function createLeg(startedAt: string, durationSeconds: number, distanceM: number): CanonicalActivity {
  return {
    provider: 'coros',
    sourceFileType: 'fit',
    sportType: 'running',
    sportSubtype: null,
    providerActivityId: null,
    summary: {
      startedAt,
      endedAt: new Date(Date.parse(startedAt) + durationSeconds * 1000).toISOString(),
      durationSeconds,
      elapsedSeconds: durationSeconds,
      distanceM,
      caloriesKcal: null,
      avgHeartRate: null,
      maxHeartRate: null,
      minHeartRate: null,
      avgSpeedMps: null,
      maxSpeedMps: null,
      avgCadence: null,
      maxCadence: null,
      avgPowerW: null,
      maxPowerW: null,
      elevationGainM: null,
      elevationLossM: null,
      avgTemperatureC: null,
      maxTemperatureC: null,
      totalSteps: null,
      recoveryTimeSeconds: null,
      vo2Max: null,
      epoc: null,
      pte: null,
      tss: null,
    },
    streams: {
      position: [{ offsetSeconds: 0, timestamp: startedAt, lat: 40, lon: -3, distanceM: 0 }],
      heartRate: [{ offsetSeconds: 0, timestamp: startedAt, value: 130 }],
      speed: [],
      distance: [{ offsetSeconds: durationSeconds, timestamp: null, value: distanceM }],
      altitude: [],
      cadence: [],
      power: [],
      temperature: [],
    },
    laps: [
      {
        lapIndex: 0,
        lapType: 'manual',
        distanceM,
        durationSeconds,
        avgPaceSecondsPerKm: null,
        avgHeartRate: null,
        maxHeartRate: null,
        startOffsetSeconds: 0,
        endOffsetSeconds: durationSeconds,
      },
    ],
    heartRateZones: [],
    device: null,
    vendorFields: {},
  };
}

const merged = mergeCorosMultisportActivities([
  createLeg('2026-08-23T08:00:00.000Z', 600, 1000),
  createLeg('2026-08-23T08:10:00.000Z', 1200, 5000),
]);

assert.equal(merged.summary.durationSeconds, 1800);
assert.equal(merged.summary.distanceM, 6000);
assert.deepEqual(
  merged.streams.distance.map(sample => ({ offset: sample.offsetSeconds, value: sample.value })),
  [
    { offset: 600, value: 1000 },
    { offset: 1800, value: 6000 },
  ],
);
assert.deepEqual(
  merged.laps.map(lap => ({ index: lap.lapIndex, start: lap.startOffsetSeconds, end: lap.endOffsetSeconds })),
  [
    { index: 0, start: 0, end: 600 },
    { index: 1, start: 600, end: 1800 },
  ],
);
