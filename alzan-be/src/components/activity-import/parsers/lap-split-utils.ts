import type { CanonicalActivityLap, CanonicalActivityMetricSample } from './activity-import-canonical.types';
import type { RouteImportDistanceSplitBucket, RouteImportLap } from './route-import.parser';

export const SPLIT_DISTANCE_TOLERANCE_M = 10;
const ONE_KM_M = 1000;
const FIVE_KM_M = 5000;

interface DistanceSamplePoint {
  distanceM: number;
  offsetSeconds: number;
  timestampMs: number | null;
}

interface MetricSamplePoint {
  offsetSeconds: number;
  value: number;
}

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

  const targets = [ONE_KM_M];
  if (totalDistanceM < FIVE_KM_M - SPLIT_DISTANCE_TOLERANCE_M) return targets;

  targets.push(FIVE_KM_M);
  let lastIncludedTarget = FIVE_KM_M;
  let nextTarget = 10_000;
  while (Number.isSafeInteger(nextTarget)) {
    const completeTarget = nextTarget <= totalDistanceM + SPLIT_DISTANCE_TOLERANCE_M;
    const nextSuuntoStyleTarget = totalDistanceM > lastIncludedTarget + SPLIT_DISTANCE_TOLERANCE_M;
    if (!completeTarget && !nextSuuntoStyleTarget) break;

    targets.push(nextTarget);
    lastIncludedTarget = nextTarget;
    nextTarget *= 2;
  }

  return targets;
}

/** Builds arbitrary distance splits from cumulative samples, even when FIT laps are manual or irregular. */
export function buildDistanceSplitBucketsFromSamples(
  distanceSamples: CanonicalActivityMetricSample[],
  heartRateSamples: CanonicalActivityMetricSample[],
  summaryDistanceM: number | null,
  summaryDurationSeconds: number | null,
  activityLaps: CanonicalActivityLap[] = [],
): Array<{ splitDistanceM: number; laps: CanonicalActivityLap[] }> {
  const points = normaliseDistanceSamples(distanceSamples);
  if (points.length < 2) return [];

  const first = points[0];
  const last = points[points.length - 1];
  const observedDistanceM = last.distanceM - first.distanceM;
  const elapsedSeconds = last.offsetSeconds - first.offsetSeconds;
  if (observedDistanceM < ONE_KM_M - SPLIT_DISTANCE_TOLERANCE_M || elapsedSeconds <= 0) return [];

  const hasValidSummaryDistance = summaryDistanceM != null && Number.isFinite(summaryDistanceM) && summaryDistanceM > 0;
  const distanceDifferenceM = hasValidSummaryDistance ? Math.abs(summaryDistanceM - observedDistanceM) : 0;
  const distanceToleranceM = Math.max(100, observedDistanceM * 0.03);
  const totalDistanceM =
    hasValidSummaryDistance && distanceDifferenceM <= distanceToleranceM ? summaryDistanceM : observedDistanceM;
  const distanceScale = totalDistanceM / observedDistanceM;
  const hasValidSummaryDuration =
    summaryDurationSeconds != null && Number.isFinite(summaryDurationSeconds) && summaryDurationSeconds > 0;
  const timeScale = hasValidSummaryDuration ? summaryDurationSeconds / elapsedSeconds : 1;
  const mapToTimerOffset = buildTimerOffsetMapper(activityLaps, first.offsetSeconds, summaryDurationSeconds, timeScale);
  const normalizedPoints = points.map(point => ({
    distanceM: (point.distanceM - first.distanceM) * distanceScale,
    offsetSeconds: mapToTimerOffset(point.offsetSeconds),
    timestampMs: point.timestampMs,
  }));
  normalizedPoints[0] = { distanceM: 0, offsetSeconds: 0, timestampMs: first.timestampMs };
  normalizedPoints[normalizedPoints.length - 1] = {
    distanceM: totalDistanceM,
    offsetSeconds: hasValidSummaryDuration ? summaryDurationSeconds : elapsedSeconds,
    timestampMs: last.timestampMs,
  };

  const normalizedHeartRates = normaliseMetricSamples(
    heartRateSamples,
    first.offsetSeconds,
    first.timestampMs,
    mapToTimerOffset,
  );
  const targets = buildDistanceSplitTargets(totalDistanceM);
  return targets
    .map(splitDistanceM => ({
      splitDistanceM,
      laps: buildSampledDistanceLaps(normalizedPoints, normalizedHeartRates, totalDistanceM, splitDistanceM),
    }))
    .filter(bucket => bucket.laps.length > 0);
}

function normaliseDistanceSamples(samples: CanonicalActivityMetricSample[]): DistanceSamplePoint[] {
  const referenceTimestampMs = samples
    .map(sample => parseTimestamp(sample.timestamp))
    .find((value): value is number => value != null);
  const points = samples
    .map(sample => {
      const timestampMs = parseTimestamp(sample.timestamp);
      const offsetSeconds =
        sample.offsetSeconds != null && Number.isFinite(sample.offsetSeconds)
          ? sample.offsetSeconds
          : timestampMs != null && referenceTimestampMs != null
            ? (timestampMs - referenceTimestampMs) / 1000
            : null;
      if (offsetSeconds == null || offsetSeconds < 0 || !Number.isFinite(sample.value) || sample.value < 0) {
        return null;
      }
      return { distanceM: sample.value, offsetSeconds, timestampMs };
    })
    .filter((sample): sample is DistanceSamplePoint => sample != null)
    .sort((left, right) => left.offsetSeconds - right.offsetSeconds);

  const uniquePoints: DistanceSamplePoint[] = [];
  for (const point of points) {
    const previous = uniquePoints[uniquePoints.length - 1];
    if (previous && point.offsetSeconds === previous.offsetSeconds) {
      if (point.distanceM > previous.distanceM) previous.distanceM = point.distanceM;
      continue;
    }
    if (previous && point.distanceM < previous.distanceM) continue;
    uniquePoints.push({ ...point });
  }
  return uniquePoints;
}

function normaliseMetricSamples(
  samples: CanonicalActivityMetricSample[],
  streamStartOffsetSeconds: number,
  referenceTimestampMs: number | null,
  mapToTimerOffset: (offsetSeconds: number) => number,
): MetricSamplePoint[] {
  return samples
    .flatMap(sample => {
      const timestampMs = parseTimestamp(sample.timestamp);
      const offset =
        sample.offsetSeconds != null && Number.isFinite(sample.offsetSeconds)
          ? sample.offsetSeconds
          : timestampMs != null && referenceTimestampMs != null
            ? streamStartOffsetSeconds + (timestampMs - referenceTimestampMs) / 1000
            : null;
      if (offset == null || !Number.isFinite(offset) || !Number.isFinite(sample.value) || sample.value < 0) {
        return [];
      }
      return [{ offsetSeconds: mapToTimerOffset(offset), value: sample.value }];
    })
    .sort((left, right) => left.offsetSeconds - right.offsetSeconds);
}

function buildTimerOffsetMapper(
  laps: CanonicalActivityLap[],
  streamStartOffsetSeconds: number,
  summaryDurationSeconds: number | null,
  fallbackTimeScale: number,
): (offsetSeconds: number) => number {
  const timedLaps = laps
    .filter(
      lap =>
        lap.startOffsetSeconds != null &&
        lap.endOffsetSeconds != null &&
        lap.endOffsetSeconds > lap.startOffsetSeconds! &&
        lap.durationSeconds != null &&
        lap.durationSeconds > 0,
    )
    .sort((left, right) => (left.startOffsetSeconds ?? 0) - (right.startOffsetSeconds ?? 0));
  const totalLapTimerSeconds = timedLaps.reduce((sum, lap) => sum + (lap.durationSeconds ?? 0), 0);
  const expectedTimerSeconds = summaryDurationSeconds ?? totalLapTimerSeconds;
  const timerToleranceSeconds = Math.max(30, expectedTimerSeconds * 0.1);
  const lapsCoverWorkoutTimer =
    timedLaps.length > 0 && Math.abs(totalLapTimerSeconds - expectedTimerSeconds) <= timerToleranceSeconds;

  if (!lapsCoverWorkoutTimer) {
    return offsetSeconds => (offsetSeconds - streamStartOffsetSeconds) * fallbackTimeScale;
  }

  const segments: Array<{ elapsedStart: number; elapsedEnd: number; timerStart: number; timerEnd: number }> = [];
  let timerCursor = 0;
  for (const lap of timedLaps) {
    const elapsedStart = lap.startOffsetSeconds! - streamStartOffsetSeconds;
    const elapsedEnd = lap.endOffsetSeconds! - streamStartOffsetSeconds;
    if (elapsedEnd <= 0) continue;
    const durationSeconds = lap.durationSeconds!;
    segments.push({
      elapsedStart,
      elapsedEnd,
      timerStart: timerCursor,
      timerEnd: timerCursor + durationSeconds,
    });
    timerCursor += durationSeconds;
  }
  if (segments.length === 0) {
    return offsetSeconds => (offsetSeconds - streamStartOffsetSeconds) * fallbackTimeScale;
  }

  return offsetSeconds => {
    const elapsedOffset = offsetSeconds - streamStartOffsetSeconds;
    let completedTimerSeconds = 0;
    for (const segment of segments) {
      if (elapsedOffset < segment.elapsedStart) return completedTimerSeconds;
      if (elapsedOffset <= segment.elapsedEnd) {
        const elapsedSpan = segment.elapsedEnd - segment.elapsedStart;
        const timerSpan = segment.timerEnd - segment.timerStart;
        const fraction = Math.max(0, Math.min(1, (elapsedOffset - segment.elapsedStart) / elapsedSpan));
        const mappedOffset = segment.timerStart + fraction * timerSpan;
        return Math.min(mappedOffset, expectedTimerSeconds);
      }
      completedTimerSeconds = segment.timerEnd;
    }
    return Math.min(completedTimerSeconds, expectedTimerSeconds);
  };
}

function parseTimestamp(timestamp: string | null): number | null {
  if (!timestamp) return null;
  const parsed = Date.parse(timestamp);
  return Number.isFinite(parsed) ? parsed : null;
}

function buildSampledDistanceLaps(
  distancePoints: DistanceSamplePoint[],
  heartRatePoints: MetricSamplePoint[],
  totalDistanceM: number,
  splitDistanceM: number,
): CanonicalActivityLap[] {
  const laps: CanonicalActivityLap[] = [];
  let startDistanceM = 0;
  let startOffsetSeconds = 0;
  let distancePointIndex = 1;

  while (startDistanceM < totalDistanceM - SPLIT_DISTANCE_TOLERANCE_M) {
    const endDistanceM = Math.min(startDistanceM + splitDistanceM, totalDistanceM);
    while (
      distancePointIndex < distancePoints.length - 1 &&
      distancePoints[distancePointIndex].distanceM < endDistanceM
    ) {
      distancePointIndex += 1;
    }
    const previousPoint = distancePoints[Math.max(0, distancePointIndex - 1)];
    const currentPoint = distancePoints[distancePointIndex];
    const endOffsetSeconds = interpolateOffsetAtDistance(previousPoint, currentPoint, endDistanceM);
    if (endOffsetSeconds == null || endOffsetSeconds <= startOffsetSeconds) break;

    const distanceM = endDistanceM - startDistanceM;
    const durationSeconds = endOffsetSeconds - startOffsetSeconds;
    const segmentHeartRates = heartRatePoints
      .filter(sample => sample.offsetSeconds >= startOffsetSeconds && sample.offsetSeconds <= endOffsetSeconds)
      .map(sample => sample.value);
    const avgHeartRate =
      segmentHeartRates.length > 0
        ? segmentHeartRates.reduce((sum, value) => sum + value, 0) / segmentHeartRates.length
        : null;
    const maxHeartRate = segmentHeartRates.length > 0 ? Math.max(...segmentHeartRates) : null;

    laps.push({
      lapIndex: laps.length + 1,
      lapName: null,
      lapType: 'distance',
      distanceM,
      durationSeconds,
      avgPaceSecondsPerKm: (durationSeconds * 1000) / distanceM,
      avgHeartRate,
      maxHeartRate,
      startOffsetSeconds,
      endOffsetSeconds,
    });
    startDistanceM = endDistanceM;
    startOffsetSeconds = endOffsetSeconds;
  }

  return laps;
}

function interpolateOffsetAtDistance(
  previous: DistanceSamplePoint,
  current: DistanceSamplePoint,
  distanceM: number,
): number | null {
  if (distanceM <= previous.distanceM) return previous.offsetSeconds;
  if (distanceM >= current.distanceM) return current.offsetSeconds;
  const distanceSpan = current.distanceM - previous.distanceM;
  const offsetSpan = current.offsetSeconds - previous.offsetSeconds;
  if (distanceSpan <= 0 || offsetSpan < 0) return null;
  return previous.offsetSeconds + ((distanceM - previous.distanceM) / distanceSpan) * offsetSpan;
}

export function isOneKilometerAutoLapSequence(laps: DistanceSplitLap[]): boolean {
  if (laps.length === 0) return false;

  const validLaps = laps.filter(lap => lap.distanceM != null && Number.isFinite(lap.distanceM) && lap.distanceM > 0);
  if (validLaps.length !== laps.length) return false;
  if (validLaps.some(lap => lap.lapType !== 'auto' && lap.lapType !== 'distance')) return false;

  return validLaps.every((lap, index) => {
    const distanceM = lap.distanceM ?? 0;
    const isLast = index === validLaps.length - 1;
    const fullLap = Math.abs(distanceM - ONE_KM_M) <= SPLIT_DISTANCE_TOLERANCE_M;
    const partialFinalLap =
      isLast && validLaps.length > 1 && distanceM > 0 && distanceM < ONE_KM_M + SPLIT_DISTANCE_TOLERANCE_M;

    return fullLap || partialFinalLap;
  });
}

export function buildDistanceSplitBucketsFromLaps(
  laps: RouteImportLap[],
  summaryDistanceM?: number | null,
): RouteImportDistanceSplitBucket[];
export function buildDistanceSplitBucketsFromLaps(
  laps: CanonicalActivityLap[],
  summaryDistanceM?: number | null,
): Array<{
  splitDistanceM: number;
  laps: CanonicalActivityLap[];
}>;
export function buildDistanceSplitBucketsFromLaps<TLap extends DistanceSplitLap>(
  laps: TLap[],
  summaryDistanceM?: number | null,
): Array<{ splitDistanceM: number; laps: TLap[] }> {
  if (laps.length === 0) return [];
  if (laps.some(lap => lap.distanceM == null || !Number.isFinite(lap.distanceM) || lap.distanceM <= 0)) {
    return [];
  }

  const observedDistanceM = laps.reduce((sum, lap) => sum + (lap.distanceM ?? 0), 0);
  const canUseSummaryDistance = summaryDistanceM != null && Number.isFinite(summaryDistanceM) && summaryDistanceM > 0;
  const summaryDifferenceM = canUseSummaryDistance ? Math.abs(summaryDistanceM - observedDistanceM) : 0;
  const summaryToleranceM = Math.max(100, observedDistanceM * 0.03);
  const totalDistanceM =
    canUseSummaryDistance && summaryDifferenceM <= summaryToleranceM ? summaryDistanceM : observedDistanceM;
  const distanceScale = totalDistanceM / observedDistanceM;
  const normalizedLaps =
    distanceScale === 1
      ? laps
      : laps.map(lap => {
          const distanceM = (lap.distanceM ?? 0) * distanceScale;
          return {
            ...lap,
            distanceM,
            avgPaceSecondsPerKm:
              lap.durationSeconds != null && distanceM > 0 ? (lap.durationSeconds * 1000) / distanceM : null,
          };
        });
  const targets = buildDistanceSplitTargets(totalDistanceM);

  return targets
    .map(splitDistanceM => ({
      splitDistanceM,
      laps: buildAggregatedDistanceLaps(normalizedLaps, splitDistanceM),
    }))
    .filter(bucket => bucket.laps.length > 0);
}

function buildAggregatedDistanceLaps<TLap extends DistanceSplitLap>(laps: TLap[], splitDistanceM: number): TLap[] {
  const aggregated: TLap[] = [];
  let current: Array<{
    lap: TLap;
    distanceM: number;
    durationSeconds: number | null;
    startOffsetSeconds: number | null;
    endOffsetSeconds: number | null;
  }> = [];
  let currentDistanceM = 0;

  const flushCurrent = () => {
    if (current.length === 0 || currentDistanceM <= 0) return;
    const first = current[0];
    const last = current[current.length - 1];
    const durationSeconds = sumNullable(current.map(part => part.durationSeconds));
    const totalHeartRateWeight = current.reduce((sum, part) => {
      const value = part.lap.avgHeartRate;
      const weight = part.durationSeconds ?? part.distanceM;
      return value != null && Number.isFinite(value) && weight > 0 ? sum + weight : sum;
    }, 0);
    const avgHeartRate =
      totalHeartRateWeight > 0
        ? current.reduce((sum, part) => {
            const value = part.lap.avgHeartRate;
            const weight = part.durationSeconds ?? part.distanceM;
            return value != null && Number.isFinite(value) && weight > 0 ? sum + value * weight : sum;
          }, 0) / totalHeartRateWeight
        : null;
    const maxHeartRate = maxNullable(current.map(part => part.lap.maxHeartRate));

    aggregated.push({
      ...first.lap,
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
    const lapDistanceM = lap.distanceM ?? 0;
    if (lapDistanceM <= 0) continue;
    const lapElapsedSpanSeconds =
      lap.startOffsetSeconds != null && lap.endOffsetSeconds != null
        ? lap.endOffsetSeconds - lap.startOffsetSeconds
        : null;
    let consumedDistanceM = 0;

    while (consumedDistanceM < lapDistanceM - 0.001) {
      const distanceM = Math.min(splitDistanceM - currentDistanceM, lapDistanceM - consumedDistanceM);
      if (distanceM <= 0) break;
      const startFraction = consumedDistanceM / lapDistanceM;
      const endFraction = (consumedDistanceM + distanceM) / lapDistanceM;
      const durationSeconds = lap.durationSeconds == null ? null : lap.durationSeconds * (distanceM / lapDistanceM);
      const startOffsetSeconds =
        lap.startOffsetSeconds == null || lapElapsedSpanSeconds == null
          ? null
          : lap.startOffsetSeconds + lapElapsedSpanSeconds * startFraction;
      const endOffsetSeconds =
        lap.startOffsetSeconds == null || lapElapsedSpanSeconds == null
          ? null
          : lap.startOffsetSeconds + lapElapsedSpanSeconds * endFraction;

      current.push({ lap, distanceM, durationSeconds, startOffsetSeconds, endOffsetSeconds });
      currentDistanceM += distanceM;
      consumedDistanceM += distanceM;

      if (currentDistanceM >= splitDistanceM - 0.001) {
        flushCurrent();
      }
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
