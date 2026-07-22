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

function assertAmbiguousUntimedAutolapsArePreserved(): void {
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
    [1000, 1600, 1000, 400, 123, 400, 121, 400],
  );
}

function assertStructuredWorkoutKeepsNativeSeriesAndRecoveries(): void {
  const normalised = normaliseCanonicalActivityLaps(
    [
      lap({ lapIndex: 1, lapType: 'manual', distanceM: 1480, durationSeconds: 600 }),
      lap({ lapIndex: 2, lapType: 'manual', distanceM: 1000, durationSeconds: 294 }),
      lap({ lapIndex: 3, lapType: 'manual', distanceM: 190, durationSeconds: 120 }),
      lap({ lapIndex: 4, lapType: 'manual', distanceM: 1000, durationSeconds: 284 }),
      lap({ lapIndex: 5, lapType: 'manual', distanceM: 163, durationSeconds: 120 }),
      lap({ lapIndex: 6, lapType: 'manual', distanceM: 1000, durationSeconds: 287 }),
      lap({ lapIndex: 7, lapType: 'manual', distanceM: 173, durationSeconds: 120 }),
      lap({ lapIndex: 8, lapType: 'manual', distanceM: 1000, durationSeconds: 290 }),
      lap({ lapIndex: 9, lapType: 'manual', distanceM: 171, durationSeconds: 120 }),
      lap({ lapIndex: 10, lapType: 'manual', distanceM: 1530, durationSeconds: 600 }),
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

function assertUnknownLapTypesArePreservedWhenNoTriggerProvesAutolaps(): void {
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
    [1000, 1480, 1000, 1000, 190, 1000, 1000, 163, 1000, 1000, 173, 1000, 1000, 171, 1530, 36],
  );
}

function assertUnknownLapTypesRemainForAnySeriesDistance(): void {
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
      [1000, 1500, 1000, seriesDistanceM, 200, seriesDistanceM, 200, seriesDistanceM, 200, seriesDistanceM],
    );
  }
}

function assertFastAutolapDoesNotReplaceNativeFinalSeriesLap(): void {
  const normalised = normaliseCanonicalActivityLaps(
    [
      lap({ lapIndex: 1, lapType: 'distance', distanceM: 1000, durationSeconds: 397.6 }),
      lap({ lapIndex: 2, distanceM: 1477.4, durationSeconds: 600 }),
      lap({ lapIndex: 3, lapType: 'distance', distanceM: 1000, durationSeconds: 363.6 }),
      lap({ lapIndex: 4, distanceM: 1000, durationSeconds: 294.4 }),
      lap({ lapIndex: 5, distanceM: 190.1, durationSeconds: 120 }),
      lap({ lapIndex: 6, lapType: 'distance', distanceM: 1000, durationSeconds: 352.1 }),
      lap({ lapIndex: 7, distanceM: 1000, durationSeconds: 284.4 }),
      lap({ lapIndex: 8, distanceM: 163.1, durationSeconds: 120 }),
      lap({ lapIndex: 9, lapType: 'distance', distanceM: 1000, durationSeconds: 361.2 }),
      lap({ lapIndex: 10, distanceM: 1000, durationSeconds: 286.7 }),
      lap({ lapIndex: 11, distanceM: 173.1, durationSeconds: 120 }),
      lap({ lapIndex: 12, lapType: 'distance', distanceM: 1000, durationSeconds: 346.8 }),
      lap({ lapIndex: 13, lapType: 'distance', distanceM: 1000, durationSeconds: 292.7 }),
      lap({ lapIndex: 14, distanceM: 1000, durationSeconds: 289.6 }),
      lap({ lapIndex: 15, distanceM: 171, durationSeconds: 120 }),
      lap({ lapIndex: 16, distanceM: 1525.9, durationSeconds: 600 }),
      lap({ lapIndex: 17, distanceM: 36, durationSeconds: 13.6 }),
      lap({ lapIndex: 18, lapType: 'distance', distanceM: 739, durationSeconds: 309.3 }),
    ],
    summary({ distanceM: 7739, durationSeconds: 2850 }),
  );

  assert.deepEqual(
    normalised.map(item => Math.round(item.distanceM ?? 0)),
    [1477, 1000, 190, 1000, 163, 1000, 173, 1000, 171, 1526, 36],
  );
}

function assertDurationAutolapIsDroppedFromStructuredIntervals(): void {
  const normalised = normaliseCanonicalActivityLaps(
    [
      lap({ lapIndex: 1, lapType: 'time', distanceM: 500, durationSeconds: 180 }),
      lap({ lapIndex: 2, lapType: 'manual', distanceM: 800, durationSeconds: 200 }),
      lap({ lapIndex: 3, lapType: 'manual', distanceM: 200, durationSeconds: 120 }),
      lap({ lapIndex: 4, lapType: 'manual', distanceM: 800, durationSeconds: 201 }),
      lap({ lapIndex: 5, lapType: 'manual', distanceM: 200, durationSeconds: 120 }),
      lap({ lapIndex: 6, lapType: 'manual', distanceM: 800, durationSeconds: 199 }),
    ],
    summary({ distanceM: 2800, durationSeconds: 760 }),
  );

  assert.deepEqual(
    normalised.map(item => Math.round(item.distanceM ?? 0)),
    [800, 200, 800, 200, 800],
  );
}

function assertTerminalDistanceTriggeredRemainderIsPreserved(): void {
  const normalised = normaliseCanonicalActivityLaps(
    [
      lap({ lapIndex: 1, lapType: 'manual', distanceM: 1477.4, durationSeconds: 600, startOffsetSeconds: 0 }),
      lap({ lapIndex: 2, lapType: 'manual', distanceM: 1000, durationSeconds: 294.4, startOffsetSeconds: 600 }),
      lap({ lapIndex: 3, lapType: 'manual', distanceM: 190.1, durationSeconds: 120, startOffsetSeconds: 894.4 }),
      lap({ lapIndex: 4, lapType: 'manual', distanceM: 1000, durationSeconds: 284.4, startOffsetSeconds: 1014.4 }),
      lap({ lapIndex: 5, lapType: 'manual', distanceM: 163.1, durationSeconds: 120, startOffsetSeconds: 1298.8 }),
      lap({ lapIndex: 6, lapType: 'manual', distanceM: 1000, durationSeconds: 286.7, startOffsetSeconds: 1418.8 }),
      lap({ lapIndex: 7, lapType: 'manual', distanceM: 173.1, durationSeconds: 120, startOffsetSeconds: 1705.5 }),
      lap({ lapIndex: 8, lapType: 'manual', distanceM: 1000, durationSeconds: 289.6, startOffsetSeconds: 1825.5 }),
      lap({ lapIndex: 9, lapType: 'manual', distanceM: 171, durationSeconds: 120, startOffsetSeconds: 2115.1 }),
      lap({ lapIndex: 10, lapType: 'manual', distanceM: 1525.9, durationSeconds: 600, startOffsetSeconds: 2235.1 }),
      lap({ lapIndex: 11, lapType: 'distance', distanceM: 36, durationSeconds: 13.6, startOffsetSeconds: 2835.1 }),
      lap({ lapIndex: 12, lapType: 'distance', distanceM: 739, durationSeconds: 309.3 }),
    ],
    summary({ distanceM: 7739, durationSeconds: 2848.7 }),
  );

  assert.deepEqual(
    normalised.map(item => Math.round(item.distanceM ?? 0)),
    [1477, 1000, 190, 1000, 163, 1000, 173, 1000, 171, 1526, 36],
  );
}

function assertTerminalRemainderCanSpanMultipleAutolapsWithoutTimestamps(): void {
  const normalised = normaliseCanonicalActivityLaps(
    [
      lap({ lapIndex: 1, lapType: 'manual', distanceM: 1000, durationSeconds: 300 }),
      lap({ lapIndex: 2, lapType: 'manual', distanceM: 1000, durationSeconds: 300 }),
      lap({ lapIndex: 3, lapType: 'distance', distanceM: 20, durationSeconds: 6 }),
      lap({ lapIndex: 4, lapType: 'time', distanceM: 30, durationSeconds: 9 }),
      lap({ lapIndex: 5, lapType: 'distance', distanceM: 1000, durationSeconds: 300 }),
    ],
    summary({ distanceM: 2050, durationSeconds: 615 }),
  );

  assert.deepEqual(
    normalised.map(item => Math.round(item.distanceM ?? 0)),
    [1000, 1000, 20, 30],
  );
}

function assertManualSummaryLapIsNeverDiscarded(): void {
  const normalised = normaliseCanonicalActivityLaps(
    [
      lap({
        lapIndex: 1,
        lapType: 'manual',
        distanceM: 5000,
        durationSeconds: 1500,
        startOffsetSeconds: 0,
        endOffsetSeconds: 1500,
      }),
      lap({
        lapIndex: 2,
        lapType: 'distance',
        distanceM: 100,
        durationSeconds: 30,
        startOffsetSeconds: 1500,
        endOffsetSeconds: 1530,
      }),
    ],
    summary({ distanceM: 5000, durationSeconds: 1500 }),
  );

  assert.deepEqual(
    normalised.map(item => Math.round(item.distanceM ?? 0)),
    [5000, 100],
  );
}

function assertNonOverlappingMiddleAutolapIsPreserved(): void {
  const normalised = normaliseCanonicalActivityLaps(
    [
      lap({
        lapIndex: 1,
        lapType: 'manual',
        distanceM: 1000,
        durationSeconds: 300,
        startOffsetSeconds: 0,
        endOffsetSeconds: 300,
      }),
      lap({
        lapIndex: 2,
        lapType: 'distance',
        distanceM: 200,
        durationSeconds: 60,
        startOffsetSeconds: 300,
        endOffsetSeconds: 360,
      }),
      lap({
        lapIndex: 3,
        lapType: 'manual',
        distanceM: 1000,
        durationSeconds: 300,
        startOffsetSeconds: 360,
        endOffsetSeconds: 660,
      }),
    ],
    summary({ distanceM: 2200, durationSeconds: 660 }),
  );

  assert.deepEqual(
    normalised.map(item => Math.round(item.distanceM ?? 0)),
    [1000, 200, 1000],
  );
}

function assertExplicitNativeLapsWinWithoutPaceSignal(): void {
  const normalised = normaliseCanonicalActivityLaps(
    [
      lap({ lapIndex: 1, lapType: 'distance', distanceM: 1000, durationSeconds: 300 }),
      lap({ lapIndex: 2, lapType: 'manual', distanceM: 1500, durationSeconds: 450 }),
      lap({ lapIndex: 3, lapType: 'distance', distanceM: 1000, durationSeconds: 300 }),
      lap({ lapIndex: 4, lapType: 'manual', distanceM: 750, durationSeconds: 225 }),
      lap({ lapIndex: 5, lapType: 'manual', distanceM: 250, durationSeconds: 75 }),
      lap({ lapIndex: 6, lapType: 'manual', distanceM: 750, durationSeconds: 225 }),
      lap({ lapIndex: 7, lapType: 'manual', distanceM: 250, durationSeconds: 75 }),
      lap({ lapIndex: 8, lapType: 'manual', distanceM: 750, durationSeconds: 225 }),
      lap({ lapIndex: 9, lapType: 'time', distanceM: 500, durationSeconds: 150 }),
    ],
    summary({ distanceM: 4250, durationSeconds: 1275 }),
  );

  assert.deepEqual(
    normalised.map(item => Math.round(item.distanceM ?? 0)),
    [1500, 750, 250, 750, 250, 750],
  );
}

function assertFastDurationAutolapsAreDroppedWhenNativeTriggersAreMissing(): void {
  const normalised = normaliseCanonicalActivityLaps(
    [
      lap({ lapIndex: 1, lapType: 'time', distanceM: 1000, durationSeconds: 400 }),
      lap({ lapIndex: 2, distanceM: 800, durationSeconds: 200 }),
      lap({ lapIndex: 3, distanceM: 200, durationSeconds: 120 }),
      lap({ lapIndex: 4, lapType: 'time', distanceM: 1000, durationSeconds: 242 }),
      lap({ lapIndex: 5, distanceM: 800, durationSeconds: 201 }),
      lap({ lapIndex: 6, distanceM: 200, durationSeconds: 120 }),
      lap({ lapIndex: 7, lapType: 'time', distanceM: 1000, durationSeconds: 241 }),
      lap({ lapIndex: 8, distanceM: 800, durationSeconds: 199 }),
    ],
    summary({ distanceM: 2800, durationSeconds: 840 }),
  );

  assert.deepEqual(
    normalised.map(item => Math.round(item.distanceM ?? 0)),
    [800, 200, 800, 200, 800],
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

function assertRealOneKilometerSeriesRemainWhenNative(): void {
  const normalised = normaliseCanonicalActivityLaps(
    [
      lap({ lapIndex: 1, lapType: 'manual', distanceM: 1600, durationSeconds: 600 }),
      lap({ lapIndex: 2, lapType: 'manual', distanceM: 1000, durationSeconds: 240 }),
      lap({ lapIndex: 3, lapType: 'manual', distanceM: 200, durationSeconds: 120 }),
      lap({ lapIndex: 4, lapType: 'manual', distanceM: 1000, durationSeconds: 242 }),
      lap({ lapIndex: 5, lapType: 'manual', distanceM: 200, durationSeconds: 120 }),
      lap({ lapIndex: 6, lapType: 'manual', distanceM: 1000, durationSeconds: 241 }),
      lap({ lapIndex: 7, lapType: 'manual', distanceM: 200, durationSeconds: 120 }),
      lap({ lapIndex: 8, lapType: 'manual', distanceM: 1000, durationSeconds: 239 }),
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
assertAmbiguousUntimedAutolapsArePreserved();
assertStructuredWorkoutKeepsNativeSeriesAndRecoveries();
assertOverlappingKilometerMarkersDoNotHideOtherSeries();
assertStructuredWorkoutDropsAutolapsButKeepsManualSeries();
assertUnknownLapTypesArePreservedWhenNoTriggerProvesAutolaps();
assertUnknownLapTypesRemainForAnySeriesDistance();
assertFastAutolapDoesNotReplaceNativeFinalSeriesLap();
assertDurationAutolapIsDroppedFromStructuredIntervals();
assertTerminalDistanceTriggeredRemainderIsPreserved();
assertTerminalRemainderCanSpanMultipleAutolapsWithoutTimestamps();
assertManualSummaryLapIsNeverDiscarded();
assertNonOverlappingMiddleAutolapIsPreserved();
assertExplicitNativeLapsWinWithoutPaceSignal();
assertFastDurationAutolapsAreDroppedWhenNativeTriggersAreMissing();
assertOneKilometerLapsRemainWhenThereAreNoStructuredPartials();
assertRealOneKilometerSeriesRemainWhenNative();
assertRepeatedUntimedRecoveriesRemain();
