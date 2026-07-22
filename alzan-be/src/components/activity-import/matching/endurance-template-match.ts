/**
 * Pure scoring functions for matching imported endurance activities against
 * endurance workout templates. Score bands implement the product spec:
 * >= 80 strong match (auto-associate), 60-79 possible match (suggest),
 * < 60 no match (keep generic). When the activity has structured laps the
 * structural score takes precedence over the totals score.
 */

export const STRONG_MATCH = 80;
export const POSSIBLE_MATCH = 60;

export interface ActivityLapLike {
  distanceM: number | null;
  durationSeconds: number | null;
  avgPaceSecondsPerKm: number | null;
}

export interface EnduranceStepLike {
  id: string;
  parentStepId: string | null;
  progressionKey?: string | null;
  isGroup: boolean;
  repetitions: number | null;
  orderIndex: number;
  phaseType: string;
  durationType: string;
  durationS: number | null;
  distanceM: number | null;
  targetType: string | null;
  targetMin: number | null;
  targetMax: number | null;
}

export interface IntervalStructure {
  repCount: number;
  repDistanceM: number | null;
  repPaceSecPerKm: number | null;
  recoveryDurationS: number | null;
}

export interface ActivityTotals {
  distanceM: number | null;
  durationS: number | null;
  avgPaceSecPerKm: number | null;
}

export interface TemplateTotals {
  distanceM: number | null;
  durationS: number | null;
  avgPaceSecPerKm: number | null;
}

type Band = readonly [maxDiffPct: number, score: number];

const REPS_BANDS: readonly Band[] = [
  [0.1, 100],
  [0.2, 70],
];
const REP_DISTANCE_BANDS: readonly Band[] = [
  [0.1, 100],
  [0.2, 70],
];
const REP_PACE_BANDS: readonly Band[] = [
  [0.15, 100],
  [0.25, 60],
];
const RECOVERY_BANDS: readonly Band[] = [
  [0.2, 100],
  [0.4, 60],
];
const TOTALS_BANDS: readonly Band[] = [
  [0.05, 100],
  [0.1, 90],
  [0.2, 70],
  [0.3, 40],
];

const TEMPLATE_DISTANCE_MATCH_RELATIVE_TOLERANCE = 0.2;
const TEMPLATE_DISTANCE_MATCH_ABSOLUTE_TOLERANCE_M = 10;
export const MIN_AUTO_MATCH_MARGIN = 8;
const MIN_USEFUL_LAP_DURATION_S = 10;
const MIN_WORK_REPS = 2;
const MIN_PACE_SPREAD = 0.1;
const MAX_WORK_DISTANCE_CV = 0.3;
const MIN_WORK_RECOVERY_PACE_GAP = 0.1;
const RECOVERY_DURATION_TOLERANCE_S = 5;

function bandScore(diffPct: number, bands: readonly Band[]): number {
  for (const [maxDiff, score] of bands) {
    if (diffPct <= maxDiff) return score;
  }
  return 0;
}

function relativeDiff(actual: number, target: number): number {
  if (target === 0) return actual === 0 ? 0 : 1;
  return Math.abs(actual - target) / Math.abs(target);
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function coefficientOfVariation(values: number[]): number | null {
  if (values.length < 2) return null;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  if (mean === 0) return null;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance) / mean;
}

function lapPaceSecPerKm(lap: ActivityLapLike): number | null {
  if (lap.avgPaceSecondsPerKm != null && lap.avgPaceSecondsPerKm > 0) return lap.avgPaceSecondsPerKm;
  if (lap.durationSeconds != null && lap.distanceM != null && lap.distanceM > 0) {
    return (lap.durationSeconds / lap.distanceM) * 1000;
  }
  return null;
}

/**
 * Detects a real interval structure (work reps + recoveries) inside the
 * imported laps. Returns null when the laps look like plain auto-splits of a
 * steady effort, so the caller falls back to the totals match.
 */
export function deriveActivityStructure(laps: ActivityLapLike[]): IntervalStructure | null {
  const usable = laps
    .map(lap => ({ lap, pace: lapPaceSecPerKm(lap) }))
    .filter(
      (entry): entry is { lap: ActivityLapLike; pace: number } =>
        entry.pace != null &&
        (entry.lap.durationSeconds == null || entry.lap.durationSeconds >= MIN_USEFUL_LAP_DURATION_S),
    );
  if (usable.length <= 2) return null;

  const paces = usable.map(entry => entry.pace);
  const medianPace = median(paces);
  if (medianPace == null || medianPace <= 0) return null;

  // Steady efforts (uniform autolaps) have no meaningful pace spread.
  const minPace = Math.min(...paces);
  const maxPace = Math.max(...paces);
  if ((maxPace - minPace) / medianPace < MIN_PACE_SPREAD) return null;

  // Split fast (work) vs slow (recovery/warmup) laps at the midpoint of the
  // pace range; the median is useless here because work laps are usually the
  // majority.
  const paceThreshold = (minPace + maxPace) / 2;
  const work = usable.filter(entry => entry.pace <= paceThreshold);
  const recovery = usable.filter(entry => entry.pace > paceThreshold);
  if (work.length < MIN_WORK_REPS || recovery.length === 0) return null;
  // Real interval sessions alternate work and recovery. Every pair of work
  // reps must have at least one slower lap between them; counting recoveries
  // alone would still accept a continuous run with one incidental slow lap.
  const workIndexes = usable
    .map((entry, index) => ({ entry, index }))
    .filter(({ entry }) => entry.pace <= paceThreshold)
    .map(({ index }) => index);
  if (recovery.length < workIndexes.length - 1) return null;
  for (let index = 0; index < workIndexes.length - 1; index += 1) {
    const start = workIndexes[index] + 1;
    const end = workIndexes[index + 1];
    if (!usable.slice(start, end).some(entry => entry.pace > paceThreshold)) return null;
  }

  const medianWorkPace = median(work.map(entry => entry.pace));
  const medianRecoveryPace = median(recovery.map(entry => entry.pace));
  if (medianWorkPace == null || medianRecoveryPace == null) return null;
  if (relativeDiff(medianRecoveryPace, medianWorkPace) < MIN_WORK_RECOVERY_PACE_GAP) return null;

  const workDistances = work
    .map(entry => entry.lap.distanceM)
    .filter((value): value is number => value != null && value > 0);
  const workDurations = work
    .map(entry => entry.lap.durationSeconds)
    .filter((value): value is number => value != null && value > 0);
  const consistencyValues = workDistances.length >= MIN_WORK_REPS ? workDistances : workDurations;
  const cv = coefficientOfVariation(consistencyValues);
  if (cv == null || cv > MAX_WORK_DISTANCE_CV) return null;

  const recoveryDurations = recovery
    .map(entry => entry.lap.durationSeconds)
    .filter((value): value is number => value != null && value > 0);

  return {
    repCount: work.length,
    repDistanceM: median(workDistances),
    repPaceSecPerKm: medianWorkPace,
    recoveryDurationS: median(recoveryDurations),
  };
}

interface ExpandedStep {
  step: EnduranceStepLike;
}

function expandTemplateSteps(steps: EnduranceStepLike[]): ExpandedStep[] {
  const childrenByParent = new Map<string, EnduranceStepLike[]>();
  const topLevel: EnduranceStepLike[] = [];
  for (const step of steps) {
    if (step.parentStepId) {
      const siblings = childrenByParent.get(step.parentStepId) ?? [];
      siblings.push(step);
      childrenByParent.set(step.parentStepId, siblings);
    } else {
      topLevel.push(step);
    }
  }
  const byOrder = (a: EnduranceStepLike, b: EnduranceStepLike) => a.orderIndex - b.orderIndex;
  topLevel.sort(byOrder);

  const expanded: ExpandedStep[] = [];
  for (const step of topLevel) {
    if (step.isGroup) {
      const children = [...(childrenByParent.get(step.id) ?? [])].sort(byOrder);
      const repetitions = Math.max(1, step.repetitions ?? 1);
      for (let round = 0; round < repetitions; round += 1) {
        for (const child of children) expanded.push({ step: child });
      }
      continue;
    }
    const repetitions = Math.max(1, step.repetitions ?? 1);
    for (let round = 0; round < repetitions; round += 1) expanded.push({ step });
  }
  return expanded;
}

function stepPaceTargetSecPerKm(step: EnduranceStepLike): number | null {
  if (step.targetType !== 'pace') return null;
  const values = [step.targetMin, step.targetMax].filter((value): value is number => value != null && value > 0);
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function stepDistanceM(step: EnduranceStepLike): number | null {
  if (step.distanceM != null && step.distanceM > 0) return step.distanceM;
  const pace = stepPaceTargetSecPerKm(step);
  if (step.durationS != null && step.durationS > 0 && pace != null) {
    return (step.durationS / pace) * 1000;
  }
  return null;
}

function stepDurationS(step: EnduranceStepLike): number | null {
  if (step.durationS != null && step.durationS > 0) return step.durationS;
  const pace = stepPaceTargetSecPerKm(step);
  if (step.distanceM != null && step.distanceM > 0 && pace != null) {
    return (step.distanceM / 1000) * pace;
  }
  return null;
}

/**
 * Derives the planned interval structure from template steps. Returns null
 * when the template has no expanded interval work (less than 2 work reps).
 */
export function deriveTemplateStructure(steps: EnduranceStepLike[]): IntervalStructure | null {
  const expanded = expandTemplateSteps(steps);
  const work = expanded.filter(entry => entry.step.phaseType === 'interval');
  if (work.length < MIN_WORK_REPS) return null;
  const recoveries = expanded.filter(entry => entry.step.phaseType === 'recovery');

  const workDistances = work.map(entry => stepDistanceM(entry.step)).filter((value): value is number => value != null);
  const workPaces = work
    .map(entry => {
      const pace = stepPaceTargetSecPerKm(entry.step);
      if (pace != null) return pace;
      const distance = stepDistanceM(entry.step);
      const duration = entry.step.durationS;
      if (distance != null && duration != null && distance > 0) return (duration / distance) * 1000;
      return null;
    })
    .filter((value): value is number => value != null);
  const recoveryDurations = recoveries
    .map(entry => stepDurationS(entry.step))
    .filter((value): value is number => value != null);

  return {
    repCount: work.length,
    repDistanceM: median(workDistances),
    repPaceSecPerKm: median(workPaces),
    recoveryDurationS: median(recoveryDurations),
  };
}

function deriveTemplateWorkDistances(steps: EnduranceStepLike[]): number[] {
  return expandTemplateSteps(steps)
    .filter(entry => entry.step.phaseType === 'interval')
    .map(entry => stepDistanceM(entry.step))
    .filter((value): value is number => value != null && value > 0);
}

interface RecoveryRequirement {
  durationS: number | null;
  distanceM: number | null;
}

function deriveTemplateRecoveryRequirements(steps: EnduranceStepLike[]): RecoveryRequirement[] {
  return expandTemplateSteps(steps)
    .filter(entry => entry.step.phaseType === 'recovery')
    .map(entry => ({
      durationS: stepDurationS(entry.step),
      distanceM: stepDistanceM(entry.step),
    }));
}

export function templateHasBoundaryPhases(steps: EnduranceStepLike[]): boolean {
  return steps.some(step => ['warmup', 'warm_up', 'cooldown', 'cool_down'].includes(step.phaseType));
}

export function templateHasRecoveryPhases(steps: EnduranceStepLike[]): boolean {
  return expandTemplateSteps(steps).some(entry => entry.step.phaseType === 'recovery');
}

function hasRequiredBoundaryLaps(
  steps: EnduranceStepLike[],
  laps: ActivityLapLike[],
  matches: Array<{ index: number; lap: ActivityLapLike }>,
): boolean {
  const expandedSteps = expandTemplateSteps(steps).map(entry => entry.step);
  const warmupSteps = expandedSteps.filter(step => step.phaseType === 'warmup' || step.phaseType === 'warm_up');
  const cooldownSteps = expandedSteps.filter(step => step.phaseType === 'cooldown' || step.phaseType === 'cool_down');
  const firstMatch = matches[0]?.index ?? -1;
  const lastMatch = matches.at(-1)?.index ?? -1;
  return (
    (warmupSteps.length === 0 || boundaryLapsMatch(warmupSteps, laps.slice(0, firstMatch))) &&
    (cooldownSteps.length === 0 || boundaryLapsMatch(cooldownSteps, laps.slice(lastMatch + 1)))
  );
}

function boundaryLapsMatch(boundarySteps: EnduranceStepLike[], boundaryLaps: ActivityLapLike[]): boolean {
  if (boundaryLaps.length === 0) return false;
  const targetDistanceM = boundarySteps.reduce((sum, step) => sum + (stepDistanceM(step) ?? 0), 0);
  if (targetDistanceM > 0) {
    const actualDistanceM = boundaryLaps.reduce((sum, lap) => sum + (lap.distanceM ?? 0), 0);
    return doesDistanceMatch(actualDistanceM, targetDistanceM);
  }
  const targetDurationS = boundarySteps.reduce((sum, step) => sum + (stepDurationS(step) ?? 0), 0);
  if (targetDurationS > 0) {
    const actualDurationS = boundaryLaps.reduce((sum, lap) => sum + (lap.durationSeconds ?? 0), 0);
    const toleranceS = Math.max(10, targetDurationS * TEMPLATE_DISTANCE_MATCH_RELATIVE_TOLERANCE);
    return Math.abs(actualDurationS - targetDurationS) <= toleranceS;
  }
  return true;
}

function hasSingleWorkDistance(distances: number[]): boolean {
  if (distances.length === 0) return false;
  const firstDistance = distances[0];
  return distances.every(distance => doesDistanceMatch(distance, firstDistance));
}

function doesDistanceMatch(actualDistanceM: number | null, targetDistanceM: number): boolean {
  if (actualDistanceM == null || actualDistanceM <= 0 || targetDistanceM <= 0) return false;
  const tolerance = Math.max(
    targetDistanceM * TEMPLATE_DISTANCE_MATCH_RELATIVE_TOLERANCE,
    TEMPLATE_DISTANCE_MATCH_ABSOLUTE_TOLERANCE_M,
  );
  return Math.abs(actualDistanceM - targetDistanceM) <= tolerance;
}

function collectSameDistanceWorkLaps(
  laps: ActivityLapLike[],
  targetDistanceM: number,
): Array<{ index: number; lap: ActivityLapLike }> {
  return laps
    .map((lap, index) => ({ index, lap }))
    .filter(entry => doesDistanceMatch(entry.lap.distanceM, targetDistanceM));
}

function selectWorkLikeMatches(
  matches: Array<{ index: number; lap: ActivityLapLike }>,
  expectedCount: number,
): Array<{ index: number; lap: ActivityLapLike }> {
  if (matches.length <= expectedCount) return matches;
  const pacedMatches = matches
    .map(match => ({ ...match, pace: lapPaceSecPerKm(match.lap) }))
    .filter((match): match is { index: number; lap: ActivityLapLike; pace: number } => match.pace != null);
  if (pacedMatches.length !== matches.length) return matches;
  const medianPace = median(pacedMatches.map(match => match.pace));
  if (medianPace == null || medianPace <= 0) return matches;
  const paceSpread =
    (Math.max(...pacedMatches.map(match => match.pace)) - Math.min(...pacedMatches.map(match => match.pace))) /
    medianPace;
  if (paceSpread < MIN_WORK_RECOVERY_PACE_GAP) return matches;
  return pacedMatches
    .sort((left, right) => left.pace - right.pace)
    .slice(0, expectedCount)
    .sort((left, right) => left.index - right.index)
    .map(({ index, lap }) => ({ index, lap }));
}

function collectOrderedWorkLaps(
  laps: ActivityLapLike[],
  targetDistancesM: number[],
): Array<{ index: number; lap: ActivityLapLike }> {
  const matches: Array<{ index: number; lap: ActivityLapLike }> = [];
  let searchStartIndex = 0;
  for (const targetDistanceM of targetDistancesM) {
    const foundIndex = laps.findIndex(
      (lap, index) => index >= searchStartIndex && doesDistanceMatch(lap.distanceM, targetDistanceM),
    );
    if (foundIndex < 0) return [];
    matches.push({ index: foundIndex, lap: laps[foundIndex] });
    searchStartIndex = foundIndex + 1;
  }
  return matches;
}

function readRecoverySegmentsBetweenMatches(
  laps: ActivityLapLike[],
  matches: Array<{ index: number; lap: ActivityLapLike }>,
): Array<{ durationS: number | null; distanceM: number | null }> {
  const segments: Array<{ durationS: number | null; distanceM: number | null }> = [];
  for (let index = 0; index < matches.length - 1; index += 1) {
    const start = matches[index].index + 1;
    const end = matches[index + 1].index;
    let durationS = 0;
    let distanceM = 0;
    let hasDuration = false;
    let hasDistance = false;
    for (let lapIndex = start; lapIndex < end; lapIndex += 1) {
      const lap = laps[lapIndex];
      if (lap.durationSeconds != null && lap.durationSeconds > 0) {
        durationS += lap.durationSeconds;
        hasDuration = true;
      }
      if (lap.distanceM != null && lap.distanceM > 0) {
        distanceM += lap.distanceM;
        hasDistance = true;
      }
    }
    segments.push({
      durationS: hasDuration ? durationS : null,
      distanceM: hasDistance ? distanceM : null,
    });
  }
  return segments;
}

function recoveryMatchesTemplate(
  actual: { durationS: number | null; distanceM: number | null },
  expected: RecoveryRequirement,
): boolean {
  if (expected.durationS != null) {
    return actual.durationS != null && Math.abs(actual.durationS - expected.durationS) <= RECOVERY_DURATION_TOLERANCE_S;
  }
  if (expected.distanceM != null) return doesDistanceMatch(actual.distanceM, expected.distanceM);
  return actual.durationS != null || actual.distanceM != null;
}

/**
 * Derives an activity interval structure by matching imported laps against the
 * expanded work distances from one specific template. This catches interval
 * workouts where pace differs from the plan but lap distances still prove the
 * intended structure.
 */
export function deriveTemplateDistanceMatchedActivityStructure(
  laps: ActivityLapLike[],
  templateSteps: EnduranceStepLike[],
): IntervalStructure | null {
  const targetDistancesM = deriveTemplateWorkDistances(templateSteps);
  if (targetDistancesM.length < MIN_WORK_REPS) return null;
  const matches = hasSingleWorkDistance(targetDistancesM)
    ? selectWorkLikeMatches(collectSameDistanceWorkLaps(laps, targetDistancesM[0]), targetDistancesM.length)
    : collectOrderedWorkLaps(laps, targetDistancesM);
  if (matches.length < MIN_WORK_REPS) return null;
  if (!hasSingleWorkDistance(targetDistancesM) && matches.length !== targetDistancesM.length) return null;
  if (!hasRequiredBoundaryLaps(templateSteps, laps, matches)) return null;
  const recoveryRequirements = deriveTemplateRecoveryRequirements(templateSteps);
  const recoverySegments = readRecoverySegmentsBetweenMatches(laps, matches);
  if (recoveryRequirements.length > 0) {
    const requiredRecoveryCount = matches.length - 1;
    if (recoveryRequirements.length < requiredRecoveryCount || recoverySegments.length < requiredRecoveryCount)
      return null;
    for (let index = 0; index < requiredRecoveryCount; index += 1) {
      if (!recoveryMatchesTemplate(recoverySegments[index], recoveryRequirements[index])) return null;
    }
  }
  const distances = matches
    .map(match => match.lap.distanceM)
    .filter((value): value is number => value != null && value > 0);
  const paces = matches.map(match => lapPaceSecPerKm(match.lap)).filter((value): value is number => value != null);
  return {
    repCount: matches.length,
    repDistanceM: median(distances),
    repPaceSecPerKm: median(paces),
    recoveryDurationS: median(
      recoverySegments.map(segment => segment.durationS).filter((value): value is number => value != null),
    ),
  };
}

/**
 * Structural match score (0-100). Weights per spec: reps 40%, distance per
 * rep 30%, pace per rep 20%, recovery 10%.
 */
export function scoreStructuralMatch(activity: IntervalStructure, template: IntervalStructure): number {
  const parts = [{ weight: 0.4, score: bandScore(relativeDiff(activity.repCount, template.repCount), REPS_BANDS) }];
  if (activity.repDistanceM != null && template.repDistanceM != null) {
    parts.push({
      weight: 0.3,
      score: bandScore(relativeDiff(activity.repDistanceM, template.repDistanceM), REP_DISTANCE_BANDS),
    });
  }
  if (activity.repPaceSecPerKm != null && template.repPaceSecPerKm != null) {
    parts.push({
      weight: 0.2,
      score: bandScore(relativeDiff(activity.repPaceSecPerKm, template.repPaceSecPerKm), REP_PACE_BANDS),
    });
  }
  if (activity.recoveryDurationS != null && template.recoveryDurationS != null) {
    parts.push({
      weight: 0.1,
      score: bandScore(relativeDiff(activity.recoveryDurationS, template.recoveryDurationS), RECOVERY_BANDS),
    });
  }
  const totalWeight = parts.reduce((sum, part) => sum + part.weight, 0);
  const total = parts.reduce((sum, part) => sum + part.score * part.weight, 0) / totalWeight;
  return Math.round(total * 100) / 100;
}

export function countComparableStructuralSignals(activity: IntervalStructure, template: IntervalStructure): number {
  return (
    1 +
    Number(activity.repDistanceM != null && template.repDistanceM != null) +
    Number(activity.repPaceSecPerKm != null && template.repPaceSecPerKm != null) +
    Number(activity.recoveryDurationS != null && template.recoveryDurationS != null)
  );
}

/**
 * Totals match score (0-100). Weights per spec: distance 50%, avg pace 30%,
 * duration 20%. Variables missing on either side are dropped and the
 * remaining weights renormalized; with no comparable variable the score is 0.
 */
export function scoreTotalsMatch(activity: ActivityTotals, template: TemplateTotals): number {
  const parts: Array<{ weight: number; score: number }> = [];
  if (activity.distanceM != null && template.distanceM != null) {
    parts.push({ weight: 0.5, score: bandScore(relativeDiff(activity.distanceM, template.distanceM), TOTALS_BANDS) });
  }
  if (activity.avgPaceSecPerKm != null && template.avgPaceSecPerKm != null) {
    parts.push({
      weight: 0.3,
      score: bandScore(relativeDiff(activity.avgPaceSecPerKm, template.avgPaceSecPerKm), TOTALS_BANDS),
    });
  }
  if (activity.durationS != null && template.durationS != null) {
    parts.push({ weight: 0.2, score: bandScore(relativeDiff(activity.durationS, template.durationS), TOTALS_BANDS) });
  }
  const totalWeight = parts.reduce((sum, part) => sum + part.weight, 0);
  if (totalWeight === 0) return 0;
  const total = parts.reduce((sum, part) => sum + part.score * part.weight, 0) / totalWeight;
  return Math.round(total * 100) / 100;
}

export function countComparableTotalSignals(activity: ActivityTotals, template: TemplateTotals): number {
  return [
    activity.distanceM != null && template.distanceM != null,
    activity.avgPaceSecPerKm != null && template.avgPaceSecPerKm != null,
    activity.durationS != null && template.durationS != null,
  ].filter(Boolean).length;
}

export function isMatchMarginSufficient(bestScore: number, secondScore: number | null): boolean {
  return secondScore == null || bestScore - secondScore >= MIN_AUTO_MATCH_MARGIN;
}

/** Builds activity totals from session-level metrics. */
export function buildActivityTotals(input: { distanceM: number | null; durationS: number | null }): ActivityTotals {
  const avgPace =
    input.distanceM != null && input.distanceM > 0 && input.durationS != null && input.durationS > 0
      ? (input.durationS / input.distanceM) * 1000
      : null;
  return { distanceM: input.distanceM, durationS: input.durationS, avgPaceSecPerKm: avgPace };
}

/**
 * Builds template totals from the template columns, falling back to the sum
 * of its expanded steps when the columns are empty.
 */
export function buildTemplateTotals(
  template: { totalDistanceM: number | null; totalDurationS: number | null },
  steps: EnduranceStepLike[],
): TemplateTotals {
  let distanceM = template.totalDistanceM;
  let durationS = template.totalDurationS;
  if (distanceM == null || durationS == null) {
    const expanded = expandTemplateSteps(steps);
    if (distanceM == null) {
      const distances = expanded
        .map(entry => stepDistanceM(entry.step))
        .filter((value): value is number => value != null);
      distanceM = distances.length > 0 ? distances.reduce((sum, value) => sum + value, 0) : null;
    }
    if (durationS == null) {
      const durations = expanded
        .map(entry => stepDurationS(entry.step))
        .filter((value): value is number => value != null);
      durationS = durations.length > 0 ? durations.reduce((sum, value) => sum + value, 0) : null;
    }
  }
  const avgPace =
    distanceM != null && distanceM > 0 && durationS != null && durationS > 0 ? (durationS / distanceM) * 1000 : null;
  return { distanceM, durationS, avgPaceSecPerKm: avgPace };
}
