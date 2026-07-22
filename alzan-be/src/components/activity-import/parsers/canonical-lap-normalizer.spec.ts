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

function assertUntimedAutolapsAreDroppedWhenStructured(): void {
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

function assertStructuredWorkoutKeepsNativeSeriesAndRecoveries(): void {
  const normalised = normaliseCanonicalActivityLaps(
    [
      lap({ lapIndex: 1, lapType: 'distance', distanceM: 1480, durationSeconds: 600 }),
      lap({ lapIndex: 2, lapType: 'manual', distanceM: 1000, durationSeconds: 294 }),
      lap({ lapIndex: 3, lapType: 'manual', distanceM: 190, durationSeconds: 120 }),
      lap({ lapIndex: 4, lapType: 'manual', distanceM: 1000, durationSeconds: 284 }),
      lap({ lapIndex: 5, lapType: 'manual', distanceM: 163, durationSeconds: 120 }),
      lap({ lapIndex: 6, lapType: 'manual', distanceM: 1000, durationSeconds: 287 }),
      lap({ lapIndex: 7, lapType: 'manual', distanceM: 173, durationSeconds: 120 }),
      lap({ lapIndex: 8, lapType: 'manual', distanceM: 1000, durationSeconds: 290 }),
      lap({ lapIndex: 9, lapType: 'manual', distanceM: 171, durationSeconds: 120 }),
      lap({ lapIndex: 10, lapType: 'distance', distanceM: 1530, durationSeconds: 600 }),
      lap({ lapIndex: 11, lapType: 'manual', distanceM: 36, durationSeconds: 13.6 }),
    ],
    summary({ distanceM: 7740, durationSeconds: 2849.6 }),
  );

  assert.equal(normalised.length, 11);
  assert.deepEqual(
    normalised.map(item => Math.round(item.distanceM ?? 0)),
    [1480, 1000, 190, 1000, 163, 1000, 173, 1000, 171, 1530, 36],
  );
}

function assertOverlappingKilometerMarkersDoNotHideOtherSeries(): void {
  for (const seriesDistanceM of [600, 800, 1200, 1500, 2000]) {
    const nativeLaps = [
      lap({ lapIndex: 1, lapType: 'distance', distanceM: 1000, durationSeconds: 300, startOffsetSeconds: 0 }),
      lap({ lapIndex: 2, lapType: 'manual', distanceM: seriesDistanceM, durationSeconds: 180, startOffsetSeconds: 0 }),
      lap({ lapIndex: 3, lapType: 'manual', distanceM: 200, durationSeconds: 120, startOffsetSeconds: 180 }),
      lap({ lapIndex: 4, lapType: 'distance', distanceM: 1000, durationSeconds: 300, startOffsetSeconds: 300 }),
      lap({
        lapIndex: 5,
        lapType: 'manual',
        distanceM: seriesDistanceM,
        durationSeconds: 180,
        startOffsetSeconds: 300,
      }),
      lap({ lapIndex: 6, lapType: 'manual', distanceM: 200, durationSeconds: 120, startOffsetSeconds: 480 }),
    ].map(item => ({
      ...item,
      endOffsetSeconds:
        item.startOffsetSeconds != null && item.durationSeconds != null
          ? item.startOffsetSeconds + item.durationSeconds
          : null,
    }));
    const normalised = normaliseCanonicalActivityLaps(
      nativeLaps,
      summary({ distanceM: seriesDistanceM * 2 + 400, durationSeconds: 840 }),
    );

    assert.deepEqual(
      normalised.map(item => Math.round(item.distanceM ?? 0)),
      [seriesDistanceM, 200, seriesDistanceM, 200],
    );
  }
}

function assertStructuredWorkoutDropsAutolapsButKeepsManualSeries(): void {
  const normalised = normaliseCanonicalActivityLaps(
    [
      lap({ lapIndex: 1, lapType: 'distance', distanceM: 1000, durationSeconds: 397 }),
      lap({ lapIndex: 2, lapType: 'manual', distanceM: 1480, durationSeconds: 600 }),
      lap({ lapIndex: 3, lapType: 'distance', distanceM: 1000, durationSeconds: 363 }),
      lap({ lapIndex: 4, lapType: 'manual', distanceM: 1000, durationSeconds: 294.4 }),
      lap({ lapIndex: 5, lapType: 'manual', distanceM: 190, durationSeconds: 120 }),
      lap({ lapIndex: 6, lapType: 'distance', distanceM: 1000, durationSeconds: 352.1 }),
      lap({ lapIndex: 7, lapType: 'manual', distanceM: 1000, durationSeconds: 284.4 }),
      lap({ lapIndex: 8, lapType: 'manual', distanceM: 163, durationSeconds: 120 }),
      lap({ lapIndex: 9, lapType: 'distance', distanceM: 1000, durationSeconds: 361.2 }),
      lap({ lapIndex: 10, lapType: 'manual', distanceM: 1000, durationSeconds: 286.7 }),
      lap({ lapIndex: 11, lapType: 'manual', distanceM: 173, durationSeconds: 120 }),
      lap({ lapIndex: 12, lapType: 'distance', distanceM: 1000, durationSeconds: 346.8 }),
      lap({ lapIndex: 13, lapType: 'manual', distanceM: 1000, durationSeconds: 289.6 }),
      lap({ lapIndex: 14, lapType: 'manual', distanceM: 171, durationSeconds: 120 }),
      lap({ lapIndex: 15, lapType: 'manual', distanceM: 1530, durationSeconds: 600 }),
      lap({ lapIndex: 16, lapType: 'manual', distanceM: 36, durationSeconds: 13.6 }),
    ],
    summary({ distanceM: 7740, durationSeconds: 2849.6 }),
  );

  assert.deepEqual(
    normalised.map(item => Math.round(item.distanceM ?? 0)),
    [1480, 1000, 190, 1000, 163, 1000, 173, 1000, 171, 1530, 36],
  );
}

function assertStructuredWorkoutDropsUntypedAutolapsButKeepsNativeSeries(): void {
  const normalised = normaliseCanonicalActivityLaps(
    [
      lap({ lapIndex: 1, distanceM: 1000, durationSeconds: 397 }),
      lap({ lapIndex: 2, distanceM: 1480, durationSeconds: 600 }),
      lap({ lapIndex: 3, distanceM: 1000, durationSeconds: 363 }),
      lap({ lapIndex: 4, distanceM: 1000, durationSeconds: 294.4 }),
      lap({ lapIndex: 5, distanceM: 190, durationSeconds: 120 }),
      lap({ lapIndex: 6, distanceM: 1000, durationSeconds: 352.1 }),
      lap({ lapIndex: 7, distanceM: 1000, durationSeconds: 284.4 }),
      lap({ lapIndex: 8, distanceM: 163, durationSeconds: 120 }),
      lap({ lapIndex: 9, distanceM: 1000, durationSeconds: 361.2 }),
      lap({ lapIndex: 10, distanceM: 1000, durationSeconds: 286.7 }),
      lap({ lapIndex: 11, distanceM: 173, durationSeconds: 120 }),
      lap({ lapIndex: 12, distanceM: 1000, durationSeconds: 346.8 }),
      lap({ lapIndex: 13, distanceM: 1000, durationSeconds: 289.6 }),
      lap({ lapIndex: 14, distanceM: 171, durationSeconds: 120 }),
      lap({ lapIndex: 15, distanceM: 1530, durationSeconds: 600 }),
      lap({ lapIndex: 16, distanceM: 36, durationSeconds: 13.6 }),
    ],
    summary({ distanceM: 7740, durationSeconds: 2849.6 }),
  );

  assert.deepEqual(
    normalised.map(item => Math.round(item.distanceM ?? 0)),
    [1480, 1000, 190, 1000, 163, 1000, 173, 1000, 171, 1530, 36],
  );
}

function assertStructuredWorkoutDropsUntypedAutolapsForAnySeriesDistance(): void {
  for (const seriesDistanceM of [400, 800, 1200, 1500, 2000]) {
    const workDurationSeconds = (seriesDistanceM / 1000) * 270;
    const laps: CanonicalActivityLap[] = [
      lap({ lapIndex: 1, distanceM: 1000, durationSeconds: 390 }),
      lap({ lapIndex: 2, distanceM: 1500, durationSeconds: 600 }),
      lap({ lapIndex: 3, distanceM: 1000, durationSeconds: 360 }),
    ];

    for (let repetition = 0; repetition < 4; repetition += 1) {
      laps.push(lap({ lapIndex: laps.length + 1, distanceM: seriesDistanceM, durationSeconds: workDurationSeconds }));
      if (repetition < 3) {
        laps.push(lap({ lapIndex: laps.length + 1, distanceM: 200, durationSeconds: 120 }));
      }
    }

    const normalised = normaliseCanonicalActivityLaps(
      laps,
      summary({
        distanceM: 1500 + seriesDistanceM * 4 + 200 * 3,
        durationSeconds: 600 + workDurationSeconds * 4 + 120 * 3,
      }),
    );

    assert.deepEqual(
      normalised.map(item => Math.round(item.distanceM ?? 0)),
      [1500, seriesDistanceM, 200, seriesDistanceM, 200, seriesDistanceM, 200, seriesDistanceM],
    );
  }
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

function assertRealOneKilometerSeriesRemainWhenAutolapTyped(): void {
  const normalised = normaliseCanonicalActivityLaps(
    [
      lap({ lapIndex: 1, lapType: 'manual', distanceM: 1600, durationSeconds: 600 }),
      lap({ lapIndex: 2, lapType: 'distance', distanceM: 1000, durationSeconds: 240 }),
      lap({ lapIndex: 3, lapType: 'manual', distanceM: 200, durationSeconds: 120 }),
      lap({ lapIndex: 4, lapType: 'distance', distanceM: 1000, durationSeconds: 242 }),
      lap({ lapIndex: 5, lapType: 'manual', distanceM: 200, durationSeconds: 120 }),
      lap({ lapIndex: 6, lapType: 'distance', distanceM: 1000, durationSeconds: 241 }),
      lap({ lapIndex: 7, lapType: 'manual', distanceM: 200, durationSeconds: 120 }),
      lap({ lapIndex: 8, lapType: 'distance', distanceM: 1000, durationSeconds: 239 }),
      lap({ lapIndex: 9, lapType: 'manual', distanceM: 1530, durationSeconds: 600 }),
    ],
    summary({ distanceM: 7530, durationSeconds: 2382 }),
  );

  assert.deepEqual(
    normalised.map(item => Math.round(item.distanceM ?? 0)),
    [1600, 1000, 200, 1000, 200, 1000, 200, 1000, 1530],
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
assertUntimedAutolapsAreDroppedWhenStructured();
assertStructuredWorkoutKeepsNativeSeriesAndRecoveries();
assertOverlappingKilometerMarkersDoNotHideOtherSeries();
assertStructuredWorkoutDropsAutolapsButKeepsManualSeries();
assertStructuredWorkoutDropsUntypedAutolapsButKeepsNativeSeries();
assertStructuredWorkoutDropsUntypedAutolapsForAnySeriesDistance();
assertOneKilometerLapsRemainWhenThereAreNoStructuredPartials();
assertRealOneKilometerSeriesRemainWhenAutolapTyped();
assertRepeatedUntimedRecoveriesRemain();
