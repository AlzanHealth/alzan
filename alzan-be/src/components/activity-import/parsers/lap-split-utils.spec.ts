import { strict as assert } from 'assert';
import {
  buildDistanceSplitBucketsFromLaps,
  buildDistanceSplitBucketsFromSamples,
  buildDistanceSplitTargets,
  isOneKilometerAutoLapSequence,
} from './lap-split-utils';
import { CanonicalActivityMetricSample } from './activity-import-canonical.types';
import { RouteImportLap } from './route-import.parser';

function makeLap(index: number, distanceM: number, durationSeconds: number): RouteImportLap {
  return {
    lapIndex: index,
    lapType: 'auto',
    distanceM,
    durationSeconds,
    avgPaceSecondsPerKm: durationSeconds / (distanceM / 1000),
    avgHeartRate: 140 + index,
    maxHeartRate: 150 + index,
    startOffsetSeconds: (index - 1) * durationSeconds,
    endOffsetSeconds: index * durationSeconds,
  };
}

function assertDynamicSplitTargets(): void {
  assert.deepEqual(buildDistanceSplitTargets(4000), [1000]);
  assert.deepEqual(buildDistanceSplitTargets(5000), [1000, 5000]);
  assert.deepEqual(buildDistanceSplitTargets(5156), [1000, 5000, 10000]);
  assert.deepEqual(buildDistanceSplitTargets(10000), [1000, 5000, 10000]);
  assert.deepEqual(buildDistanceSplitTargets(10001), [1000, 5000, 10000]);
  assert.deepEqual(buildDistanceSplitTargets(10011), [1000, 5000, 10000, 20000]);
  assert.deepEqual(buildDistanceSplitTargets(40000), [1000, 5000, 10000, 20000, 40000]);
  assert.deepEqual(buildDistanceSplitTargets(40001), [1000, 5000, 10000, 20000, 40000]);
  assert.deepEqual(buildDistanceSplitTargets(40011), [1000, 5000, 10000, 20000, 40000, 80000]);
}

function makeMetricSample(offsetSeconds: number, value: number): CanonicalActivityMetricSample {
  return { offsetSeconds, timestamp: null, value };
}

function assertDistanceSamplesCreateSuuntoStyleSplits(): void {
  const distanceSamples = Array.from({ length: 11 }, (_, index) => makeMetricSample(index * 500, index * 500));
  distanceSamples.push(makeMetricSample(5156, 5156));
  const heartRateSamples = Array.from({ length: 11 }, (_, index) => makeMetricSample(index * 500, 140 + index));
  heartRateSamples.push(makeMetricSample(5156, 150));

  const buckets = buildDistanceSplitBucketsFromSamples(distanceSamples, heartRateSamples, 5156, 2578);
  assert.deepEqual(
    buckets.map(bucket => bucket.splitDistanceM),
    [1000, 5000, 10000],
  );
  assert.deepEqual(
    buckets.map(bucket => bucket.laps.map(lap => Math.round(lap.distanceM ?? 0))),
    [[1000, 1000, 1000, 1000, 1000, 156], [5000, 156], [5156]],
  );
  assert.equal(buckets[0].laps[0].durationSeconds, 500);
  assert.equal(buckets[0].laps[0].avgHeartRate, 141);
  assert.equal(buckets[0].laps[0].lapType, 'distance');
}

function assertShortRunOnlyHasOneKmDistanceTab(): void {
  const distanceSamples = Array.from({ length: 5 }, (_, index) => makeMetricSample(index * 1000, index * 1000));
  const buckets = buildDistanceSplitBucketsFromSamples(distanceSamples, [], 4000, 2400);

  assert.deepEqual(
    buckets.map(bucket => bucket.splitDistanceM),
    [1000],
  );
  assert.deepEqual(
    buckets[0].laps.map(lap => lap.distanceM),
    [1000, 1000, 1000, 1000],
  );
}

function assertDistanceSplitTimesExcludeRecordedPauseGaps(): void {
  const distanceSamples = [
    makeMetricSample(0, 0),
    makeMetricSample(100, 1000),
    makeMetricSample(110, 1000),
    makeMetricSample(210, 2000),
  ];
  const activityLaps = [
    { ...makeLap(1, 1000, 100), startOffsetSeconds: 0, endOffsetSeconds: 100 },
    { ...makeLap(2, 1000, 100), startOffsetSeconds: 110, endOffsetSeconds: 210 },
  ];
  const buckets = buildDistanceSplitBucketsFromSamples(distanceSamples, [], 2000, 200, activityLaps);

  assert.deepEqual(
    buckets[0].laps.map(lap => lap.durationSeconds),
    [100, 100],
  );
}

function assertDistanceSplitSurvivesPauseAtOneKilometer(): void {
  const distanceSamples = [
    makeMetricSample(0, 0),
    makeMetricSample(9, 999),
    makeMetricSample(20, 1001),
    makeMetricSample(30, 2000),
  ];
  const activityLaps = [
    { ...makeLap(1, 999, 9), startOffsetSeconds: 0, endOffsetSeconds: 9 },
    { ...makeLap(2, 1001, 10), startOffsetSeconds: 20, endOffsetSeconds: 30 },
  ];

  const buckets = buildDistanceSplitBucketsFromSamples(distanceSamples, [], 2000, 19, activityLaps);

  assert.deepEqual(
    buckets[0].laps.map(lap => Math.round(lap.distanceM ?? 0)),
    [1000, 1000],
  );
  assert.deepEqual(
    buckets[0].laps.map(lap => Math.round(lap.durationSeconds ?? 0)),
    [9, 10],
  );
}

function assertOneKilometerAutolapsAreAggregated(): void {
  const laps = Array.from({ length: 9 }, (_, index) => makeLap(index + 1, 1000, 300 + index));
  laps.push(makeLap(10, 220, 70));

  assert.equal(isOneKilometerAutoLapSequence(laps), true);

  const buckets = buildDistanceSplitBucketsFromLaps(laps);
  assert.deepEqual(
    buckets.map(bucket => bucket.splitDistanceM),
    [1000, 5000, 10000],
  );
  assert.equal(buckets[1].laps.length, 2);
  assert.equal(buckets[1].laps[0].distanceM, 5000);
  assert.equal(buckets[1].laps[1].distanceM, 4220);
  assert.equal(buckets[2].laps.length, 1);
  assert.equal(buckets[2].laps[0].distanceM, 9220);
}

function assertNonStandardSeriesStayCustom(): void {
  const series = [makeLap(1, 400, 90), makeLap(2, 200, 80), makeLap(3, 400, 88)];
  const singleShortLap = [makeLap(1, 400, 90)];
  const singleManualKilometer = [{ ...makeLap(1, 1000, 300), lapType: 'manual' as const }];

  assert.equal(isOneKilometerAutoLapSequence(series), false);
  assert.equal(isOneKilometerAutoLapSequence(singleShortLap), false);
  assert.equal(isOneKilometerAutoLapSequence(singleManualKilometer), false);
  assert.deepEqual(
    buildDistanceSplitBucketsFromLaps(series).map(bucket => bucket.splitDistanceM),
    [1000],
  );
  assert.deepEqual(
    buildDistanceSplitBucketsFromLaps(singleManualKilometer).map(bucket => bucket.splitDistanceM),
    [1000],
  );
  assert.deepEqual(buildDistanceSplitBucketsFromLaps(singleShortLap), []);
}

function assertManualLapFallbackCreatesExactDistanceSplits(): void {
  const manualLaps = [
    { ...makeLap(1, 1149, 481), lapType: 'manual' as const, startOffsetSeconds: 0, endOffsetSeconds: 481 },
    { ...makeLap(2, 2204, 840), lapType: 'manual' as const, startOffsetSeconds: 481, endOffsetSeconds: 1321 },
    { ...makeLap(3, 1803, 554), lapType: 'manual' as const, startOffsetSeconds: 1331, endOffsetSeconds: 1885 },
  ];

  const buckets = buildDistanceSplitBucketsFromLaps(manualLaps);
  assert.deepEqual(
    buckets.map(bucket => bucket.splitDistanceM),
    [1000, 5000, 10000],
  );
  assert.deepEqual(
    buckets.map(bucket => bucket.laps.map(lap => Math.round(lap.distanceM ?? 0))),
    [[1000, 1000, 1000, 1000, 1000, 156], [5000, 156], [5156]],
  );
  assert.equal(Math.round(buckets[0].laps[0].durationSeconds ?? 0), 419);
  assert.equal(buckets[0].laps[0].startOffsetSeconds, 0);
  assert.equal(Math.round(buckets[0].laps[0].endOffsetSeconds ?? 0), 419);
}

assertDynamicSplitTargets();
assertDistanceSamplesCreateSuuntoStyleSplits();
assertShortRunOnlyHasOneKmDistanceTab();
assertDistanceSplitTimesExcludeRecordedPauseGaps();
assertDistanceSplitSurvivesPauseAtOneKilometer();
assertOneKilometerAutolapsAreAggregated();
assertNonStandardSeriesStayCustom();
assertManualLapFallbackCreatesExactDistanceSplits();
