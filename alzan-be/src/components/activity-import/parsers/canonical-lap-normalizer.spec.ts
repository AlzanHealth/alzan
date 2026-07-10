import assert from 'node:assert/strict';

import { CanonicalActivity, CanonicalActivityLap } from './activity-import-canonical.types';
import { normaliseCanonicalActivityLaps } from './canonical-lap-normalizer';

function lap(input: Partial<CanonicalActivityLap> & Pick<CanonicalActivityLap, 'lapIndex'>): CanonicalActivityLap {
  const distanceM = input.distanceM ?? null;
  const durationSeconds = input.durationSeconds ?? null;
  return {
    lapIndex: input.lapIndex,
    lapType: input.lapType ?? 'unknown',
    distanceM,
    durationSeconds,
    avgPaceSecondsPerKm:
      input.avgPaceSecondsPerKm ??
      (distanceM != null && distanceM > 0 && durationSeconds != null ? durationSeconds / (distanceM / 1000) : null),
    avgHeartRate: input.avgHeartRate ?? null,
    maxHeartRate: input.maxHeartRate ?? null,
    startOffsetSeconds: input.startOffsetSeconds ?? null,
    endOffsetSeconds: input.endOffsetSeconds ?? null,
  };
}

function summary(overrides: Partial<CanonicalActivity['summary']>): Partial<CanonicalActivity['summary']> {
  return overrides;
}

function assertStructuredPartialsDropOverlappingDistanceMarkers(): void {
  const normalised = normaliseCanonicalActivityLaps(
    [
      lap({ lapIndex: 1, lapType: 'distance', distanceM: 1000, durationSeconds: 342, startOffsetSeconds: 0 }),
      lap({ lapIndex: 2, lapType: 'manual', distanceM: 1600, durationSeconds: 600, startOffsetSeconds: 0 }),
      lap({ lapIndex: 3, lapType: 'distance', distanceM: 1000, durationSeconds: 364, startOffsetSeconds: 600 }),
      lap({ lapIndex: 4, lapType: 'manual', distanceM: 400, durationSeconds: 105, startOffsetSeconds: 600 }),
      lap({ lapIndex: 5, lapType: 'manual', distanceM: 123, durationSeconds: 90, startOffsetSeconds: 705 }),
      lap({ lapIndex: 6, lapType: 'manual', distanceM: 400, durationSeconds: 109, startOffsetSeconds: 795 }),
      lap({ lapIndex: 7, lapType: 'manual', distanceM: 121, durationSeconds: 90, startOffsetSeconds: 904 }),
      lap({ lapIndex: 8, lapType: 'manual', distanceM: 400, durationSeconds: 103, startOffsetSeconds: 994 }),
    ].map(item => ({
      ...item,
      endOffsetSeconds:
        item.startOffsetSeconds != null && item.durationSeconds != null
          ? item.startOffsetSeconds + item.durationSeconds
          : null,
    })),
    summary({ distanceM: 4144, durationSeconds: 2110 }),
  );

  assert.deepEqual(
    normalised.map(item => Math.round(item.distanceM ?? 0)),
    [1600, 400, 123, 400, 121, 400],
  );
}

function assertStructuredPartialsDropUntimedDistanceMarkers(): void {
  const normalised = normaliseCanonicalActivityLaps(
    [
      lap({ lapIndex: 1, lapType: 'distance', distanceM: 1000, durationSeconds: 342 }),
      lap({ lapIndex: 2, lapType: 'manual', distanceM: 1600, durationSeconds: 600 }),
      lap({ lapIndex: 3, lapType: 'distance', distanceM: 1000, durationSeconds: 364 }),
      lap({ lapIndex: 4, lapType: 'manual', distanceM: 400, durationSeconds: 105 }),
      lap({ lapIndex: 5, lapType: 'manual', distanceM: 123, durationSeconds: 90 }),
      lap({ lapIndex: 6, lapType: 'manual', distanceM: 400, durationSeconds: 109 }),
      lap({ lapIndex: 7, lapType: 'manual', distanceM: 121, durationSeconds: 90 }),
      lap({ lapIndex: 8, lapType: 'manual', distanceM: 400, durationSeconds: 103 }),
    ],
    summary({ distanceM: 4144, durationSeconds: 2110 }),
  );

  assert.deepEqual(
    normalised.map(item => Math.round(item.distanceM ?? 0)),
    [1600, 400, 123, 400, 121, 400],
  );
}

function assertOneKilometerLapsRemainWhenThereAreNoStructuredPartials(): void {
  const normalised = normaliseCanonicalActivityLaps(
    [
      lap({ lapIndex: 1, lapType: 'distance', distanceM: 1000, durationSeconds: 300 }),
      lap({ lapIndex: 2, lapType: 'distance', distanceM: 1000, durationSeconds: 301 }),
      lap({ lapIndex: 3, lapType: 'distance', distanceM: 1000, durationSeconds: 299 }),
    ],
    summary({ distanceM: 3000, durationSeconds: 900 }),
  );

  assert.deepEqual(
    normalised.map(item => Math.round(item.distanceM ?? 0)),
    [1000, 1000, 1000],
  );
}

function assertRepeatedUntimedRecoveriesRemain(): void {
  const normalised = normaliseCanonicalActivityLaps(
    [
      lap({ lapIndex: 1, lapType: 'manual', distanceM: 1600, durationSeconds: 600 }),
      lap({ lapIndex: 2, lapType: 'manual', distanceM: 121, durationSeconds: 90 }),
      lap({ lapIndex: 3, lapType: 'manual', distanceM: 400, durationSeconds: 100 }),
      lap({ lapIndex: 4, lapType: 'manual', distanceM: 121, durationSeconds: 90 }),
      lap({ lapIndex: 5, lapType: 'manual', distanceM: 304, durationSeconds: 103 }),
    ],
    summary({ distanceM: 2700, durationSeconds: 1260 }),
  );

  assert.deepEqual(
    normalised.map(item => Math.round(item.distanceM ?? 0)),
    [1600, 121, 400, 121, 304],
  );
}

assertStructuredPartialsDropOverlappingDistanceMarkers();
assertStructuredPartialsDropUntimedDistanceMarkers();
assertOneKilometerLapsRemainWhenThereAreNoStructuredPartials();
assertRepeatedUntimedRecoveriesRemain();
