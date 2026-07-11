import { strict as assert } from 'assert';
import {
  buildDistanceSplitBucketsFromLaps,
  buildDistanceSplitTargets,
  isOneKilometerAutoLapSequence,
} from './lap-split-utils';
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
  assert.deepEqual(buildDistanceSplitTargets(9200), [1000, 5000, 10000]);
  assert.deepEqual(buildDistanceSplitTargets(11000), [1000, 5000, 10000, 15000]);
  assert.deepEqual(
    buildDistanceSplitTargets(42200),
    [1000, 5000, 10000, 15000, 20000, 25000, 30000, 35000, 40000, 45000],
  );
  assert.deepEqual(
    buildDistanceSplitTargets(50000),
    [1000, 5000, 10000, 15000, 20000, 25000, 30000, 35000, 40000, 45000, 50000],
  );
  assert.deepEqual(
    buildDistanceSplitTargets(50300),
    [1000, 5000, 10000, 15000, 20000, 25000, 30000, 35000, 40000, 45000, 50000, 55000],
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

  assert.equal(isOneKilometerAutoLapSequence(series), false);
  assert.deepEqual(buildDistanceSplitBucketsFromLaps(series), []);
}

assertDynamicSplitTargets();
assertOneKilometerAutolapsAreAggregated();
assertNonStandardSeriesStayCustom();
