import { CanonicalActivity, CanonicalActivityLap } from './activity-import-canonical.types';

const STANDARD_DISTANCE_AUTOLAP_M = 1000;
const SUMMARY_LAP_DISTANCE_TOLERANCE_M = 25;
const SUMMARY_LAP_DURATION_TOLERANCE_S = 5;
const MIN_DEMONSTRABLE_OVERLAP_SECONDS = 1;

function valuesAreClose(value: number, target: number, tolerance: number): boolean {
  return Math.abs(value - target) <= tolerance;
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

function isAutoTriggeredLap(lap: CanonicalActivityLap): boolean {
  return lap.lapType === 'distance' || lap.lapType === 'time' || lap.lapType === 'auto';
}

function lapHasTiming(lap: CanonicalActivityLap): boolean {
  return (
    lap.startOffsetSeconds != null && lap.endOffsetSeconds != null && lap.endOffsetSeconds > lap.startOffsetSeconds
  );
}

function lapsOverlap(left: CanonicalActivityLap, right: CanonicalActivityLap): boolean {
  if (!lapHasTiming(left) || !lapHasTiming(right)) return false;
  const overlapSeconds =
    Math.min(left.endOffsetSeconds as number, right.endOffsetSeconds as number) -
    Math.max(left.startOffsetSeconds as number, right.startOffsetSeconds as number);
  return overlapSeconds > MIN_DEMONSTRABLE_OVERLAP_SECONDS;
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

function findTerminalRemainderAutolaps(
  laps: CanonicalActivityLap[],
  summary: Partial<CanonicalActivity['summary']>,
): Set<CanonicalActivityLap> {
  const nativeLaps = laps.filter(lap => !isAutoTriggeredLap(lap));
  if (nativeLaps.length === 0) return new Set<CanonicalActivityLap>();
  const latestNativeEnd = nativeLaps.reduce(
    (latest, lap) => Math.max(latest, lap.endOffsetSeconds ?? Number.NEGATIVE_INFINITY),
    Number.NEGATIVE_INFINITY,
  );
  const lastNativeIndex = nativeLaps.reduce((latest, lap) => Math.max(latest, lap.lapIndex), 0);
  const candidates = laps.filter(lap => {
    if (!isAutoTriggeredLap(lap) || nativeLaps.some(nativeLap => lapsOverlap(lap, nativeLap))) return false;
    if (lap.startOffsetSeconds != null && Number.isFinite(latestNativeEnd)) {
      return lap.startOffsetSeconds >= latestNativeEnd - MIN_DEMONSTRABLE_OVERLAP_SECONDS;
    }
    return lap.lapIndex > lastNativeIndex;
  });
  if (candidates.length === 0) return new Set<CanonicalActivityLap>();
  const nativeDistanceM = nativeLaps.reduce((sum, lap) => sum + (lap.distanceM ?? 0), 0);
  const nativeDurationS = nativeLaps.reduce((sum, lap) => sum + (lap.durationSeconds ?? 0), 0);
  let candidateDistanceM = 0;
  let candidateDurationS = 0;
  const selected: CanonicalActivityLap[] = [];
  for (const candidate of candidates) {
    selected.push(candidate);
    candidateDistanceM += candidate.distanceM ?? 0;
    candidateDurationS += candidate.durationSeconds ?? 0;
    const closesDistance =
      summary.distanceM != null &&
      valuesAreClose(nativeDistanceM + candidateDistanceM, summary.distanceM, SUMMARY_LAP_DISTANCE_TOLERANCE_M);
    const closesDuration =
      summary.durationSeconds != null &&
      valuesAreClose(nativeDurationS + candidateDurationS, summary.durationSeconds, SUMMARY_LAP_DURATION_TOLERANCE_S);
    if (closesDistance || closesDuration) return new Set(selected);
  }
  return new Set<CanonicalActivityLap>();
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
    workingLaps = workingLaps.filter(
      (lap, index) => !totalLikeMask[index] || lap.lapType === 'manual' || !isAutoTriggeredLap(lap),
    );
  }

  const terminalRemainderAutolaps = findTerminalRemainderAutolaps(workingLaps, summary);
  const nativeLaps = workingLaps.filter(lap => !isAutoTriggeredLap(lap));
  const nativeAndRemainderLaps = [...nativeLaps, ...terminalRemainderAutolaps];
  const nativeAndRemainderMetrics = {
    distanceM: nativeAndRemainderLaps.reduce((sum, lap) => sum + (lap.distanceM ?? 0), 0),
    durationS: nativeAndRemainderLaps.reduce((sum, lap) => sum + (lap.durationSeconds ?? 0), 0),
  };
  const nativeAndRemainderCloseSummary =
    (summary.distanceM != null &&
      valuesAreClose(nativeAndRemainderMetrics.distanceM, summary.distanceM, SUMMARY_LAP_DISTANCE_TOLERANCE_M)) ||
    (summary.durationSeconds != null &&
      valuesAreClose(nativeAndRemainderMetrics.durationS, summary.durationSeconds, SUMMARY_LAP_DURATION_TOLERANCE_S));
  workingLaps = workingLaps.filter(lap => {
    if (lap.lapType === 'manual' || !isAutoTriggeredLap(lap) || terminalRemainderAutolaps.has(lap)) return true;
    if (nativeLaps.some(nativeLap => lapsOverlap(lap, nativeLap))) return false;
    if (isAggregateLap(lap, workingLaps)) return false;
    if (!lapHasTiming(lap) && nativeAndRemainderCloseSummary) return false;
    return true;
  });

  const aggregateLapMask = workingLaps.map(
    lap =>
      lap.lapType !== 'manual' &&
      !terminalRemainderAutolaps.has(lap) &&
      isAutoTriggeredLap(lap) &&
      isAggregateLap(lap, workingLaps),
  );
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
