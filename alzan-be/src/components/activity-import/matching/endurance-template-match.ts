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
  lapType?: string | null;
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
  alignment?: StructuralAlignment;
}

export interface StructuralAlignment {
  componentScores: {
    repetitions: number;
    workDistance: number | null;
    recovery: number | null;
    boundaries: number | null;
    pace: number | null;
  };
  repetitionDelta: number;
  repetitionDifferenceCount: number;
  isAutoMatchEligible: boolean;
  matchedLapIndexes: number[];
  extraLapIndexes: number[];
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

const REP_DISTANCE_BANDS: readonly Band[] = [
  [0.1, 100],
  [0.2, 70],
];
const REP_PACE_BANDS: readonly Band[] = [
  [0.15, 100],
  [0.3, 80],
  [0.5, 50],
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
const RECOVERY_DURATION_TOLERANCE_S = 10;
const UNIFORM_AUTOLAP_RELATIVE_TOLERANCE = 0.05;
const UNIFORM_AUTOLAP_DISTANCE_TOLERANCE_M = 10;
const UNIFORM_AUTOLAP_DURATION_TOLERANCE_S = 2;
const BOUNDARY_MAX_RELATIVE_DIFFERENCE = 0.4;
const BOUNDARY_BANDS: readonly Band[] = [
  [0.1, 100],
  [0.2, 85],
  [0.4, 60],
];
const STRUCTURAL_COMPONENT_WEIGHTS = {
  repetitions: 0.25,
  workDistance: 0.25,
  recovery: 0.25,
  boundaries: 0.15,
  pace: 0.1,
} as const;
const POSSIBLE_REPETITION_MISMATCH_SCORE_CAP = 79;

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

interface ExpansionVariant {
  steps: ExpandedStep[];
  repetitionDelta: number;
  repetitionDifferenceCount: number;
}

interface PhaseMatch {
  step: EnduranceStepLike;
  startIndex: number;
  endIndex: number;
  metrics: { durationS: number | null; distanceM: number | null };
  workDistanceScore: number | null;
  recoveryScore: number | null;
  boundaryScore: number | null;
  paceScore: number | null;
  fitError: number;
}

interface AlignmentCandidate {
  structure: IntervalStructure;
  fitError: number;
}

function expandTemplateSteps(
  steps: EnduranceStepLike[],
  repetitionOverrides: ReadonlyMap<string, number> = new Map<string, number>(),
): ExpandedStep[] {
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
      const repetitions = Math.max(1, repetitionOverrides.get(step.id) ?? step.repetitions ?? 1);
      for (let round = 0; round < repetitions; round += 1) {
        for (const child of children) expanded.push({ step: child });
      }
      continue;
    }
    const repetitions = Math.max(1, repetitionOverrides.get(step.id) ?? step.repetitions ?? 1);
    for (let round = 0; round < repetitions; round += 1) {
      expanded.push({ step });
    }
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

interface RecoveryRequirement {
  durationS: number | null;
  distanceM: number | null;
}

export function templateHasBoundaryPhases(steps: EnduranceStepLike[]): boolean {
  return steps.some(step => ['warmup', 'warm_up', 'cooldown', 'cool_down'].includes(step.phaseType));
}

export function templateHasRecoveryPhases(steps: EnduranceStepLike[]): boolean {
  return expandTemplateSteps(steps).some(entry => entry.step.phaseType === 'recovery');
}

function doesDistanceMatch(actualDistanceM: number | null, targetDistanceM: number): boolean {
  if (actualDistanceM == null || actualDistanceM <= 0 || targetDistanceM <= 0) return false;
  const tolerance = Math.max(
    targetDistanceM * TEMPLATE_DISTANCE_MATCH_RELATIVE_TOLERANCE,
    TEMPLATE_DISTANCE_MATCH_ABSOLUTE_TOLERANCE_M,
  );
  return Math.abs(actualDistanceM - targetDistanceM) <= tolerance;
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

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function aggregateLaps(laps: ActivityLapLike[]): { durationS: number | null; distanceM: number | null } {
  const durations = laps.map(lap => lap.durationSeconds).filter((value): value is number => value != null && value > 0);
  const distances = laps.map(lap => lap.distanceM).filter((value): value is number => value != null && value > 0);
  return {
    durationS: durations.length > 0 ? durations.reduce((sum, value) => sum + value, 0) : null,
    distanceM: distances.length > 0 ? distances.reduce((sum, value) => sum + value, 0) : null,
  };
}

function valuesAreUniform(values: number[], absoluteTolerance: number): boolean {
  if (values.length < 2) return false;
  const reference = median(values);
  if (reference == null || reference <= 0) return false;
  const tolerance = Math.max(reference * UNIFORM_AUTOLAP_RELATIVE_TOLERANCE, absoluteTolerance);
  return values.every(value => Math.abs(value - reference) <= tolerance);
}

function valuesAreUniformWithOptionalTerminalRemainder(values: number[], absoluteTolerance: number): boolean {
  if (valuesAreUniform(values, absoluteTolerance)) return true;
  if (values.length < 3) return false;
  const core = values.slice(0, -1);
  const terminal = values[values.length - 1];
  const reference = median(core);
  if (reference == null || reference <= 0 || !valuesAreUniform(core, absoluteTolerance)) return false;
  const tolerance = Math.max(reference * UNIFORM_AUTOLAP_RELATIVE_TOLERANCE, absoluteTolerance);
  return terminal <= reference + tolerance;
}

function isContinuousUniformAutolapSequence(laps: ActivityLapLike[]): boolean {
  if (laps.length < 2) return false;
  const lapTypes = new Set(laps.map(lap => lap.lapType));
  if (lapTypes.size !== 1) return false;
  const [lapType] = [...lapTypes];
  if (lapType === 'distance') {
    const distances = laps.map(lap => lap.distanceM).filter((value): value is number => value != null && value > 0);
    return (
      distances.length === laps.length &&
      valuesAreUniformWithOptionalTerminalRemainder(distances, UNIFORM_AUTOLAP_DISTANCE_TOLERANCE_M)
    );
  }
  if (lapType === 'time') {
    const durations = laps
      .map(lap => lap.durationSeconds)
      .filter((value): value is number => value != null && value > 0);
    return (
      durations.length === laps.length &&
      valuesAreUniformWithOptionalTerminalRemainder(durations, UNIFORM_AUTOLAP_DURATION_TOLERANCE_S)
    );
  }
  if (lapType !== 'auto') return false;
  const distances = laps.map(lap => lap.distanceM).filter((value): value is number => value != null && value > 0);
  const durations = laps.map(lap => lap.durationSeconds).filter((value): value is number => value != null && value > 0);
  return (
    (distances.length === laps.length &&
      valuesAreUniformWithOptionalTerminalRemainder(distances, UNIFORM_AUTOLAP_DISTANCE_TOLERANCE_M)) ||
    (durations.length === laps.length &&
      valuesAreUniformWithOptionalTerminalRemainder(durations, UNIFORM_AUTOLAP_DURATION_TOLERANCE_S))
  );
}

function isBoundaryPhase(phaseType: string): boolean {
  return ['warmup', 'warm_up', 'cooldown', 'cool_down'].includes(phaseType);
}

function scoreBoundarySegment(
  metrics: { durationS: number | null; distanceM: number | null },
  step: EnduranceStepLike,
): { score: number; fitError: number } | null {
  const targetDistanceM = stepDistanceM(step);
  if (targetDistanceM != null) {
    if (metrics.distanceM == null) return null;
    const difference = relativeDiff(metrics.distanceM, targetDistanceM);
    if (difference > BOUNDARY_MAX_RELATIVE_DIFFERENCE) return null;
    return { score: bandScore(difference, BOUNDARY_BANDS), fitError: difference };
  }
  const targetDurationS = stepDurationS(step);
  if (targetDurationS != null) {
    if (metrics.durationS == null) return null;
    const difference = relativeDiff(metrics.durationS, targetDurationS);
    if (difference > BOUNDARY_MAX_RELATIVE_DIFFERENCE) return null;
    return { score: bandScore(difference, BOUNDARY_BANDS), fitError: difference };
  }
  return { score: 100, fitError: 0 };
}

function matchPhaseSegment(
  step: EnduranceStepLike,
  laps: ActivityLapLike[],
  startIndex: number,
  endIndex: number,
): PhaseMatch | null {
  const segment = laps.slice(startIndex, endIndex);
  if (segment.length === 0) return null;
  const metrics = aggregateLaps(segment);
  if (step.phaseType === 'interval') {
    if (segment.length !== 1) return null;
    const targetDistanceM = stepDistanceM(step);
    const targetDurationS = step.distanceM == null ? stepDurationS(step) : null;
    let workDistanceScore: number | null = null;
    let fitError = 0;
    if (targetDistanceM != null) {
      if (!doesDistanceMatch(metrics.distanceM, targetDistanceM) || metrics.distanceM == null) return null;
      fitError = relativeDiff(metrics.distanceM, targetDistanceM);
      workDistanceScore = bandScore(fitError, REP_DISTANCE_BANDS);
    } else if (targetDurationS != null) {
      if (metrics.durationS == null) return null;
      fitError = relativeDiff(metrics.durationS, targetDurationS);
      if (fitError > TEMPLATE_DISTANCE_MATCH_RELATIVE_TOLERANCE) return null;
      workDistanceScore = bandScore(fitError, REP_DISTANCE_BANDS);
    }
    const targetPace = stepPaceTargetSecPerKm(step);
    const actualPace = lapPaceSecPerKm(segment[0]);
    const paceScore =
      targetPace != null && actualPace != null ? bandScore(relativeDiff(actualPace, targetPace), REP_PACE_BANDS) : null;
    return {
      step,
      startIndex,
      endIndex,
      metrics,
      workDistanceScore,
      recoveryScore: null,
      boundaryScore: null,
      paceScore,
      fitError,
    };
  }
  if (step.phaseType === 'recovery') {
    const requirement = { durationS: stepDurationS(step), distanceM: stepDistanceM(step) };
    if (!recoveryMatchesTemplate(metrics, requirement)) return null;
    const target = requirement.durationS ?? requirement.distanceM;
    const actual = requirement.durationS != null ? metrics.durationS : metrics.distanceM;
    const fitError = target != null && actual != null ? relativeDiff(actual, target) : 0;
    return {
      step,
      startIndex,
      endIndex,
      metrics,
      workDistanceScore: null,
      recoveryScore: bandScore(fitError, RECOVERY_BANDS),
      boundaryScore: null,
      paceScore: null,
      fitError,
    };
  }
  const boundary = scoreBoundarySegment(metrics, step);
  if (boundary == null) return null;
  return {
    step,
    startIndex,
    endIndex,
    metrics,
    workDistanceScore: null,
    recoveryScore: null,
    boundaryScore: isBoundaryPhase(step.phaseType) ? boundary.score : null,
    paceScore: null,
    fitError: boundary.fitError,
  };
}

function doesLapMatchWorkStep(lap: ActivityLapLike, step: EnduranceStepLike): boolean {
  const targetDistanceM = stepDistanceM(step);
  if (targetDistanceM != null) return doesDistanceMatch(lap.distanceM, targetDistanceM);
  const targetDurationS = stepDurationS(step);
  return (
    targetDurationS != null &&
    lap.durationSeconds != null &&
    relativeDiff(lap.durationSeconds, targetDurationS) <= TEMPLATE_DISTANCE_MATCH_RELATIVE_TOLERANCE
  );
}

function boundaryContainsStructuredUnit(
  laps: ActivityLapLike[],
  workSteps: EnduranceStepLike[],
  recoverySteps: EnduranceStepLike[],
): boolean {
  if (laps.length < 2 || workSteps.length === 0 || recoverySteps.length === 0) return false;
  for (let workIndex = 0; workIndex < laps.length - 1; workIndex += 1) {
    if (!workSteps.some(step => doesLapMatchWorkStep(laps[workIndex], step))) continue;
    for (let recoveryStartIndex = workIndex + 1; recoveryStartIndex < laps.length; recoveryStartIndex += 1) {
      for (let endIndex = recoveryStartIndex + 1; endIndex <= laps.length; endIndex += 1) {
        const metrics = aggregateLaps(laps.slice(recoveryStartIndex, endIndex));
        const matchesRecovery = recoverySteps.some(step =>
          recoveryMatchesTemplate(metrics, { durationS: stepDurationS(step), distanceM: stepDistanceM(step) }),
        );
        if (matchesRecovery) return true;
      }
    }
  }
  return false;
}

function buildExpansionVariants(steps: EnduranceStepLike[]): ExpansionVariant[] {
  const exact = expandTemplateSteps(steps);
  const variants: ExpansionVariant[] = [{ steps: exact, repetitionDelta: 0, repetitionDifferenceCount: 0 }];
  const childrenByParent = new Map<string, EnduranceStepLike[]>();
  for (const step of steps) {
    if (!step.parentStepId) continue;
    const children = childrenByParent.get(step.parentStepId) ?? [];
    children.push(step);
    childrenByParent.set(step.parentStepId, children);
  }
  const repetitionContainers = steps.filter(step => {
    if (step.parentStepId != null) return false;
    const children = step.isGroup ? (childrenByParent.get(step.id) ?? []) : [step];
    return children.some(child => child.phaseType === 'interval');
  });
  const visit = (
    containerIndex: number,
    overrides: Map<string, number>,
    repetitionDelta: number,
    repetitionDifferenceCount: number,
  ): void => {
    if (containerIndex === repetitionContainers.length) {
      if (repetitionDifferenceCount === 0) return;
      variants.push({
        steps: expandTemplateSteps(steps, overrides),
        repetitionDelta,
        repetitionDifferenceCount,
      });
      return;
    }
    const container = repetitionContainers[containerIndex];
    const repetitions = Math.max(1, container.repetitions ?? 1);
    for (const delta of [0, -1, 1, -2, 2]) {
      if (repetitions + delta < 1 || repetitionDifferenceCount + Math.abs(delta) > 2) continue;
      const nextOverrides = new Map(overrides);
      if (delta !== 0) nextOverrides.set(container.id, repetitions + delta);
      visit(containerIndex + 1, nextOverrides, repetitionDelta + delta, repetitionDifferenceCount + Math.abs(delta));
    }
  };
  visit(0, new Map<string, number>(), 0, 0);
  return variants;
}

function buildAlignmentCandidate(
  laps: ActivityLapLike[],
  phaseMatches: PhaseMatch[],
  startIndex: number,
  endIndex: number,
  repetitionDelta: number,
  repetitionDifferenceCount: number,
): AlignmentCandidate | null {
  const workMatches = phaseMatches.filter(match => match.step.phaseType === 'interval');
  const recoveryMatches = phaseMatches.filter(match => match.step.phaseType === 'recovery');
  const matchedLapIndexes = phaseMatches.flatMap(match =>
    Array.from({ length: match.endIndex - match.startIndex }, (_, offset) => match.startIndex + offset),
  );
  const extraLapIndexes = [
    ...Array.from({ length: startIndex }, (_, index) => index),
    ...Array.from({ length: laps.length - endIndex }, (_, index) => endIndex + index),
  ];
  const workLaps = workMatches.flatMap(match => laps.slice(match.startIndex, match.endIndex));
  const recoveryLaps = recoveryMatches.flatMap(match => laps.slice(match.startIndex, match.endIndex));
  const structuredLaps = [...workLaps, ...recoveryLaps];
  const isKnownAutolap = (lap: ActivityLapLike): boolean => ['auto', 'distance', 'time'].includes(lap.lapType ?? '');
  if (recoveryLaps.length > 0 && structuredLaps.length > 0 && structuredLaps.every(isKnownAutolap)) {
    const workPace = median(workLaps.map(lapPaceSecPerKm).filter((value): value is number => value != null));
    const recoveryPace = median(recoveryLaps.map(lapPaceSecPerKm).filter((value): value is number => value != null));
    if (workPace == null || recoveryPace == null || relativeDiff(recoveryPace, workPace) < MIN_WORK_RECOVERY_PACE_GAP)
      return null;
  }
  const recoveryDurations = recoveryMatches
    .map(match => match.metrics.durationS)
    .filter((value): value is number => value != null && value > 0);
  return {
    structure: {
      repCount: workMatches.length,
      repDistanceM: median(
        workLaps.map(lap => lap.distanceM).filter((value): value is number => value != null && value > 0),
      ),
      repPaceSecPerKm: median(
        workLaps.map(lapPaceSecPerKm).filter((value): value is number => value != null && value > 0),
      ),
      recoveryDurationS: median(recoveryDurations),
      alignment: {
        componentScores: {
          repetitions: repetitionDifferenceCount === 0 ? 100 : 0,
          workDistance: average(
            phaseMatches.map(match => match.workDistanceScore).filter((value): value is number => value != null),
          ),
          recovery: average(
            phaseMatches.map(match => match.recoveryScore).filter((value): value is number => value != null),
          ),
          boundaries: average(
            phaseMatches.map(match => match.boundaryScore).filter((value): value is number => value != null),
          ),
          pace: average(phaseMatches.map(match => match.paceScore).filter((value): value is number => value != null)),
        },
        repetitionDelta,
        repetitionDifferenceCount,
        isAutoMatchEligible: repetitionDifferenceCount === 0,
        matchedLapIndexes,
        extraLapIndexes,
      },
    },
    fitError: phaseMatches.reduce((sum, match) => sum + match.fitError, 0),
  };
}

function alignExpandedTemplate(laps: ActivityLapLike[], variant: ExpansionVariant): AlignmentCandidate | null {
  const phases = variant.steps.map(entry => entry.step);
  if (phases.length === 0 || phases.length > laps.length) return null;
  const workSteps = phases.filter(step => step.phaseType === 'interval');
  const recoverySteps = phases.filter(step => step.phaseType === 'recovery');
  let bestCandidate: AlignmentCandidate | null = null;
  const compareCandidates = (left: AlignmentCandidate, right: AlignmentCandidate): number => {
    const leftScore = scoreAlignedComponents(left.structure.alignment?.componentScores);
    const rightScore = scoreAlignedComponents(right.structure.alignment?.componentScores);
    return (
      rightScore - leftScore ||
      left.fitError - right.fitError ||
      (left.structure.alignment?.extraLapIndexes.length ?? 0) - (right.structure.alignment?.extraLapIndexes.length ?? 0)
    );
  };
  const visit = (phaseIndex: number, lapIndex: number, startIndex: number, matches: PhaseMatch[]): void => {
    if (phaseIndex === phases.length) {
      const candidate = buildAlignmentCandidate(
        laps,
        matches,
        startIndex,
        lapIndex,
        variant.repetitionDelta,
        variant.repetitionDifferenceCount,
      );
      if (candidate != null && (bestCandidate == null || compareCandidates(candidate, bestCandidate) < 0)) {
        bestCandidate = candidate;
      }
      return;
    }
    const remainingPhases = phases.length - phaseIndex - 1;
    const maximumEndIndex = laps.length - remainingPhases;
    const step = phases[phaseIndex];
    const firstEndIndex = lapIndex + 1;
    const isFinalOpenBoundary =
      phaseIndex === phases.length - 1 &&
      isBoundaryPhase(step.phaseType) &&
      stepDistanceM(step) == null &&
      stepDurationS(step) == null;
    const firstCandidateEndIndex = isFinalOpenBoundary ? laps.length : firstEndIndex;
    const lastEndIndex =
      step.phaseType === 'interval' || isFinalOpenBoundary ? firstCandidateEndIndex : maximumEndIndex;
    for (let endIndex = firstCandidateEndIndex; endIndex <= lastEndIndex; endIndex += 1) {
      const match = matchPhaseSegment(step, laps, lapIndex, endIndex);
      if (match == null) continue;
      if (
        isBoundaryPhase(step.phaseType) &&
        boundaryContainsStructuredUnit(laps.slice(lapIndex, endIndex), workSteps, recoverySteps)
      )
        continue;
      visit(phaseIndex + 1, endIndex, startIndex, [...matches, match]);
    }
  };
  for (let startIndex = 0; startIndex <= laps.length - phases.length; startIndex += 1) {
    visit(0, startIndex, startIndex, []);
  }
  return bestCandidate;
}

function scoreAlignedComponents(scores: StructuralAlignment['componentScores'] | undefined): number {
  if (scores == null) return 0;
  const entries: Array<{ score: number; weight: number }> = [];
  for (const key of Object.keys(STRUCTURAL_COMPONENT_WEIGHTS) as Array<keyof typeof STRUCTURAL_COMPONENT_WEIGHTS>) {
    const score = scores[key];
    if (score != null) entries.push({ score, weight: STRUCTURAL_COMPONENT_WEIGHTS[key] });
  }
  const totalWeight = entries.reduce((sum, entry) => sum + entry.weight, 0);
  if (totalWeight === 0) return 0;
  return entries.reduce((sum, entry) => sum + entry.score * entry.weight, 0) / totalWeight;
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
  if (deriveTemplateStructure(templateSteps) == null) return null;
  if (isContinuousUniformAutolapSequence(laps)) return null;
  const candidates = buildExpansionVariants(templateSteps)
    .map(variant => alignExpandedTemplate(laps, variant))
    .filter((candidate): candidate is AlignmentCandidate => candidate != null)
    .sort((left, right) => {
      const repDifference = right.structure.repCount - left.structure.repCount;
      if (repDifference !== 0) return repDifference;
      const leftScore = scoreAlignedComponents(left.structure.alignment?.componentScores);
      const rightScore = scoreAlignedComponents(right.structure.alignment?.componentScores);
      return rightScore - leftScore || left.fitError - right.fitError;
    });
  const best = candidates[0] ?? null;
  if (best == null || (best.structure.alignment?.repetitionDifferenceCount ?? 0) > 1) return null;
  return best.structure;
}

/**
 * Matches only the executable workout core. Boundary phases such as warmup
 * and cooldown are intentionally excluded because wearable exports often do
 * not record them as distinct laps, while the interval block is still the
 * same planned workout.
 */
export function deriveTemplateDistanceMatchedActivityCoreStructure(
  laps: ActivityLapLike[],
  templateSteps: EnduranceStepLike[],
): IntervalStructure | null {
  const boundaryIds = new Set(templateSteps.filter(step => isBoundaryPhase(step.phaseType)).map(step => step.id));
  const coreSteps = templateSteps.filter(
    step => !isBoundaryPhase(step.phaseType) && (step.parentStepId == null || !boundaryIds.has(step.parentStepId)),
  );
  if (coreSteps.length === 0 || coreSteps.length === templateSteps.length) return null;
  return deriveTemplateDistanceMatchedActivityStructure(laps, coreSteps);
}

/**
 * Structural match score (0-100). Ordered alignments use repetitions 25%,
 * work distance 25%, recovery 25%, boundaries 15% and pace 10%.
 */
export function scoreStructuralMatch(activity: IntervalStructure, template: IntervalStructure): number {
  if (Math.abs(activity.repCount - template.repCount) > 1) return 0;
  const componentScores =
    activity.alignment?.componentScores ??
    ({
      repetitions: activity.repCount === template.repCount ? 100 : 0,
      workDistance:
        activity.repDistanceM != null && template.repDistanceM != null
          ? bandScore(relativeDiff(activity.repDistanceM, template.repDistanceM), REP_DISTANCE_BANDS)
          : null,
      recovery:
        activity.recoveryDurationS != null && template.recoveryDurationS != null
          ? bandScore(relativeDiff(activity.recoveryDurationS, template.recoveryDurationS), RECOVERY_BANDS)
          : null,
      boundaries: null,
      pace:
        activity.repPaceSecPerKm != null && template.repPaceSecPerKm != null
          ? bandScore(relativeDiff(activity.repPaceSecPerKm, template.repPaceSecPerKm), REP_PACE_BANDS)
          : null,
    } satisfies StructuralAlignment['componentScores']);
  const rawScore = scoreAlignedComponents(componentScores);
  const score = isStructuralAutoMatchEligible(activity, template)
    ? rawScore
    : Math.min(rawScore, POSSIBLE_REPETITION_MISMATCH_SCORE_CAP);
  return Math.round(score * 100) / 100;
}

export function countComparableStructuralSignals(activity: IntervalStructure, template: IntervalStructure): number {
  if (activity.alignment != null) {
    return Object.values(activity.alignment.componentScores).filter(score => score != null).length;
  }
  return (
    1 +
    Number(activity.repDistanceM != null && template.repDistanceM != null) +
    Number(activity.repPaceSecPerKm != null && template.repPaceSecPerKm != null) +
    Number(activity.recoveryDurationS != null && template.recoveryDurationS != null)
  );
}

export function isStructuralAutoMatchEligible(activity: IntervalStructure, template: IntervalStructure): boolean {
  return activity.alignment?.isAutoMatchEligible ?? activity.repCount === template.repCount;
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
  return secondScore == null || bestScore - secondScore > MIN_AUTO_MATCH_MARGIN;
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
