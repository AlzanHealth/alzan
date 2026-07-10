import { CanonicalActivity, CanonicalActivityLap } from './activity-import-canonical.types';

const STANDARD_DISTANCE_AUTOLAP_M = 1000;
const STANDARD_DISTANCE_AUTOLAP_TOLERANCE_M = 15;
const SUMMARY_LAP_DISTANCE_TOLERANCE_M = 25;
const SUMMARY_LAP_DURATION_TOLERANCE_S = 5;
const MIN_INTERVAL_SIGNAL_LAPS = 4;
const MIN_INTERVAL_PACE_SPREAD = 0.25;

function valuesAreClose(value: number, target: number, tolerance: number): boolean {
  return Math.abs(value - target) <= tolerance;
}

function lapPaceSecondsPerKm(lap: CanonicalActivityLap): number | null {
  if (lap.avgPaceSecondsPerKm != null && lap.avgPaceSecondsPerKm > 0) return lap.avgPaceSecondsPerKm;
  if (lap.durationSeconds != null && lap.durationSeconds > 0 && lap.distanceM != null && lap.distanceM > 0) {
    return (lap.durationSeconds / lap.distanceM) * 1000;
  }
  return null;
}

function isValidLap(lap: CanonicalActivityLap): boolean {
  return (lap.distanceM != null && lap.distanceM > 0) || (lap.durationSeconds != null && lap.durationSeconds > 0);
}

function isTotalLikeLap(lap: CanonicalActivityLap, summary: Partial<CanonicalActivity['summary']>): boolean {
  const summaryDistanceM = summary.distanceM ?? null;
  const summaryDurationSeconds = summary.durationSeconds ?? null;
  const hasSummaryDistance = summaryDistanceM != null && summaryDistanceM > 0;
  const hasSummaryDuration = summaryDurationSeconds != null && summaryDurationSeconds > 0;
  if (!hasSummaryDistance && !hasSummaryDuration) return false;

  const distanceMatches =
    hasSummaryDistance &&
    lap.distanceM != null &&
    lap.distanceM > 0 &&
    valuesAreClose(lap.distanceM, summaryDistanceM, SUMMARY_LAP_DISTANCE_TOLERANCE_M);
  const durationMatches =
    hasSummaryDuration &&
    lap.durationSeconds != null &&
    lap.durationSeconds > 0 &&
    valuesAreClose(lap.durationSeconds, summaryDurationSeconds, SUMMARY_LAP_DURATION_TOLERANCE_S);

  if (hasSummaryDistance && hasSummaryDuration) return distanceMatches || durationMatches;
  if (hasSummaryDistance) return distanceMatches;
  if (hasSummaryDuration) return durationMatches;
  return false;
}

function isStandardDistanceMarker(lap: CanonicalActivityLap): boolean {
  return (
    lap.distanceM != null &&
    valuesAreClose(lap.distanceM, STANDARD_DISTANCE_AUTOLAP_M, STANDARD_DISTANCE_AUTOLAP_TOLERANCE_M)
  );
}

function lapHasTiming(lap: CanonicalActivityLap): boolean {
  return (
    lap.startOffsetSeconds != null && lap.endOffsetSeconds != null && lap.endOffsetSeconds > lap.startOffsetSeconds
  );
}

function lapsOverlap(left: CanonicalActivityLap, right: CanonicalActivityLap): boolean {
  if (!lapHasTiming(left) || !lapHasTiming(right)) return false;
  return (
    Math.max(left.startOffsetSeconds as number, right.startOffsetSeconds as number) <
    Math.min(left.endOffsetSeconds as number, right.endOffsetSeconds as number)
  );
}

function lapContains(container: CanonicalActivityLap, candidate: CanonicalActivityLap): boolean {
  if (!lapHasTiming(container) || !lapHasTiming(candidate)) return false;
  return (
    (candidate.startOffsetSeconds as number) >= (container.startOffsetSeconds as number) &&
    (candidate.endOffsetSeconds as number) <= (container.endOffsetSeconds as number) &&
    buildLapIdentity(container) !== buildLapIdentity(candidate)
  );
}

function isAggregateLap(container: CanonicalActivityLap, laps: CanonicalActivityLap[]): boolean {
  if (!lapHasTiming(container)) return false;
  const contained = laps.filter(candidate => lapContains(container, candidate));
  const overlapped = laps.filter(
    candidate => buildLapIdentity(container) !== buildLapIdentity(candidate) && lapsOverlap(container, candidate),
  );
  const isShortOverlappingAggregate =
    container.distanceM != null &&
    container.distanceM > 0 &&
    container.distanceM < STANDARD_DISTANCE_AUTOLAP_M &&
    container.durationSeconds != null &&
    container.durationSeconds > 180 &&
    overlapped.length >= 2;
  if (isShortOverlappingAggregate) return true;
  if (contained.length < 2) return false;

  const containedDistance = contained.reduce((sum, lap) => sum + (lap.distanceM ?? 0), 0);
  const containedDuration = contained.reduce((sum, lap) => sum + (lap.durationSeconds ?? 0), 0);
  const distanceMatches =
    container.distanceM != null &&
    container.distanceM > 0 &&
    containedDistance > 0 &&
    valuesAreClose(container.distanceM, containedDistance, SUMMARY_LAP_DISTANCE_TOLERANCE_M);
  const durationMatches =
    container.durationSeconds != null &&
    container.durationSeconds > 0 &&
    containedDuration > 0 &&
    valuesAreClose(container.durationSeconds, containedDuration, SUMMARY_LAP_DURATION_TOLERANCE_S);

  return distanceMatches || durationMatches;
}

function hasNonStandardIntervalSignal(laps: CanonicalActivityLap[]): boolean {
  const paceValues = laps
    .map(lapPaceSecondsPerKm)
    .filter((value): value is number => value != null && Number.isFinite(value) && value > 0);
  if (paceValues.length < MIN_INTERVAL_SIGNAL_LAPS) return false;

  const minPace = Math.min(...paceValues);
  const maxPace = Math.max(...paceValues);
  const medianPace = [...paceValues].sort((left, right) => left - right)[Math.floor(paceValues.length / 2)];
  if (medianPace == null || medianPace <= 0) return false;

  return (maxPace - minPace) / medianPace >= MIN_INTERVAL_PACE_SPREAD;
}

function buildLapIdentity(lap: CanonicalActivityLap): string {
  if (!lapHasTiming(lap)) return `untimed-${lap.lapIndex}`;
  const distanceKey = lap.distanceM == null ? 'null' : Math.round(lap.distanceM);
  const durationKey = lap.durationSeconds == null ? 'null' : Math.round(lap.durationSeconds);
  const startKey = lap.startOffsetSeconds == null ? 'null' : Math.round(lap.startOffsetSeconds);
  const endKey = lap.endOffsetSeconds == null ? 'null' : Math.round(lap.endOffsetSeconds);
  return `${lap.lapType}|${distanceKey}|${durationKey}|${startKey}|${endKey}`;
}

export function normaliseCanonicalActivityLaps(
  laps: CanonicalActivityLap[],
  summary: Partial<CanonicalActivity['summary']>,
): CanonicalActivityLap[] {
  const validLaps = laps.filter(isValidLap);
  if (validLaps.length === 0) return [];

  let workingLaps = [...validLaps];
  const totalLikeMask = workingLaps.map(lap => isTotalLikeLap(lap, summary));
  if (totalLikeMask.some(Boolean) && totalLikeMask.some(isTotalLike => !isTotalLike)) {
    workingLaps = workingLaps.filter((_, index) => !totalLikeMask[index]);
  }

  const standardDistanceMarkerMask = workingLaps.map(isStandardDistanceMarker);
  const nonStandardLaps = workingLaps.filter((_, index) => !standardDistanceMarkerMask[index]);
  const hasStructuredNonStandardPartials = hasNonStandardIntervalSignal(nonStandardLaps);
  const overlappedStandardMarkerMask = workingLaps.map(
    (lap, index) =>
      standardDistanceMarkerMask[index] && nonStandardLaps.some(nonStandardLap => lapsOverlap(lap, nonStandardLap)),
  );

  if (overlappedStandardMarkerMask.some(Boolean)) {
    workingLaps = workingLaps.filter((_, index) => !overlappedStandardMarkerMask[index]);
  } else if (standardDistanceMarkerMask.some(Boolean) && hasStructuredNonStandardPartials) {
    workingLaps = nonStandardLaps;
  }

  const aggregateLapMask = workingLaps.map(lap => isAggregateLap(lap, workingLaps));
  if (aggregateLapMask.some(Boolean) && aggregateLapMask.some(isAggregate => !isAggregate)) {
    workingLaps = workingLaps.filter((_, index) => !aggregateLapMask[index]);
  }

  const seen = new Set<string>();
  const deduped: CanonicalActivityLap[] = [];
  for (const lap of workingLaps) {
    const identity = buildLapIdentity(lap);
    if (seen.has(identity)) continue;
    seen.add(identity);
    deduped.push(lap);
  }

  return deduped.map((lap, index) => ({
    ...lap,
    lapIndex: index + 1,
  }));
}
