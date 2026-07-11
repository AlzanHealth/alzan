import type { CanonicalActivityLap } from './activity-import-canonical.types';
import type { RouteImportDistanceSplitBucket, RouteImportLap } from './route-import.parser';

export const SPLIT_DISTANCE_TOLERANCE_M = 10;
const ONE_KM_M = 1000;
const FIVE_KM_M = 5000;

export interface DistanceSplitLap {
  lapIndex: number;
  lapType: 'manual' | 'auto' | 'distance' | 'time' | 'unknown';
  distanceM: number | null;
  durationSeconds: number | null;
  avgPaceSecondsPerKm: number | null;
  avgHeartRate: number | null;
  maxHeartRate: number | null;
  startOffsetSeconds: number | null;
  endOffsetSeconds: number | null;
}

export function buildDistanceSplitTargets(totalDistanceM: number): number[] {
  if (!Number.isFinite(totalDistanceM) || totalDistanceM < ONE_KM_M - SPLIT_DISTANCE_TOLERANCE_M) return [];

  const targets = new Set<number>([ONE_KM_M]);
  const cappedTotalDistanceM = Math.max(totalDistanceM, ONE_KM_M);
  const upperFiveKmBucket = Math.ceil(cappedTotalDistanceM / FIVE_KM_M) * FIVE_KM_M;

  for (let target = FIVE_KM_M; target <= upperFiveKmBucket; target += FIVE_KM_M) {
    targets.add(target);
  }

  return Array.from(targets).sort((left, right) => left - right);
}

export function isOneKilometerAutoLapSequence(laps: DistanceSplitLap[]): boolean {
  if (laps.length === 0) return false;

  const validLaps = laps.filter(lap => lap.distanceM != null && Number.isFinite(lap.distanceM) && lap.distanceM > 0);
  if (validLaps.length !== laps.length) return false;

  return validLaps.every((lap, index) => {
    const distanceM = lap.distanceM ?? 0;
    const isLast = index === validLaps.length - 1;
    const fullLap = Math.abs(distanceM - ONE_KM_M) <= SPLIT_DISTANCE_TOLERANCE_M;
    const partialFinalLap = isLast && distanceM > 0 && distanceM < ONE_KM_M + SPLIT_DISTANCE_TOLERANCE_M;

    return fullLap || partialFinalLap;
  });
}

export function buildDistanceSplitBucketsFromLaps(laps: RouteImportLap[]): RouteImportDistanceSplitBucket[];
export function buildDistanceSplitBucketsFromLaps(laps: CanonicalActivityLap[]): Array<{
  splitDistanceM: number;
  laps: CanonicalActivityLap[];
}>;
export function buildDistanceSplitBucketsFromLaps<TLap extends DistanceSplitLap>(
  laps: TLap[],
): Array<{ splitDistanceM: number; laps: TLap[] }> {
  if (!isOneKilometerAutoLapSequence(laps)) return [];

  const totalDistanceM = laps.reduce((sum, lap) => sum + (lap.distanceM ?? 0), 0);
  const targets = buildDistanceSplitTargets(totalDistanceM);

  return targets
    .map(splitDistanceM => ({
      splitDistanceM,
      laps: buildAggregatedDistanceLaps(laps, splitDistanceM),
    }))
    .filter(bucket => bucket.laps.length > 0);
}

function buildAggregatedDistanceLaps<TLap extends DistanceSplitLap>(laps: TLap[], splitDistanceM: number): TLap[] {
  if (splitDistanceM <= ONE_KM_M) {
    return laps.map((lap, index) => ({
      ...lap,
      lapIndex: index + 1,
      lapType: 'distance',
    }));
  }

  const aggregated: TLap[] = [];
  let current: TLap[] = [];
  let currentDistanceM = 0;

  const flushCurrent = () => {
    if (current.length === 0 || currentDistanceM <= 0) return;
    const first = current[0];
    const last = current[current.length - 1];
    const durationSeconds = sumNullable(current.map(lap => lap.durationSeconds));
    const avgHeartRate = weightedAverage(current, lap => lap.avgHeartRate);
    const maxHeartRate = maxNullable(current.map(lap => lap.maxHeartRate));

    aggregated.push({
      ...first,
      lapIndex: aggregated.length + 1,
      lapType: 'distance',
      distanceM: currentDistanceM,
      durationSeconds,
      avgPaceSecondsPerKm:
        durationSeconds != null && currentDistanceM > 0 ? durationSeconds / (currentDistanceM / 1000) : null,
      avgHeartRate,
      maxHeartRate,
      startOffsetSeconds: first.startOffsetSeconds,
      endOffsetSeconds: last.endOffsetSeconds,
    });

    current = [];
    currentDistanceM = 0;
  };

  for (const lap of laps) {
    current.push(lap);
    currentDistanceM += lap.distanceM ?? 0;

    if (currentDistanceM >= splitDistanceM - SPLIT_DISTANCE_TOLERANCE_M) {
      flushCurrent();
    }
  }

  flushCurrent();

  return aggregated;
}

function sumNullable(values: Array<number | null>): number | null {
  let total = 0;
  let hasValue = false;

  for (const value of values) {
    if (value == null || !Number.isFinite(value)) continue;
    total += value;
    hasValue = true;
  }

  return hasValue ? total : null;
}

function maxNullable(values: Array<number | null>): number | null {
  const safeValues = values.filter((value): value is number => value != null && Number.isFinite(value));
  if (safeValues.length === 0) return null;
  return Math.max(...safeValues);
}

function weightedAverage<TLap extends DistanceSplitLap>(
  laps: TLap[],
  getValue: (lap: TLap) => number | null,
): number | null {
  let weightedTotal = 0;
  let totalWeight = 0;

  for (const lap of laps) {
    const value = getValue(lap);
    const weight = lap.durationSeconds ?? lap.distanceM ?? 0;
    if (value == null || !Number.isFinite(value) || weight <= 0) continue;
    weightedTotal += value * weight;
    totalWeight += weight;
  }

  return totalWeight > 0 ? weightedTotal / totalWeight : null;
}
