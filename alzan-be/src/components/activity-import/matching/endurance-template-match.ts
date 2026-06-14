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

const MIN_USEFUL_LAP_DURATION_S = 10;
const MIN_WORK_REPS = 2;
const MIN_PACE_SPREAD = 0.1;
const MAX_WORK_DISTANCE_CV = 0.3;
const MIN_WORK_RECOVERY_PACE_GAP = 0.1;

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
  // Real interval sessions alternate work and recovery; a steady run with a
  // single slow lap (traffic stop) must not look structured.
  if (recovery.length < Math.max(1, Math.floor((work.length - 1) / 2))) return null;

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

function pairScore(actual: number | null, target: number | null, bands: readonly Band[]): number {
  if (actual == null && target == null) return 100;
  if (actual == null || target == null) return 60;
  return bandScore(relativeDiff(actual, target), bands);
}

/**
 * Structural match score (0-100). Weights per spec: reps 40%, distance per
 * rep 30%, pace per rep 20%, recovery 10%.
 */
export function scoreStructuralMatch(activity: IntervalStructure, template: IntervalStructure): number {
  const repsScore = bandScore(relativeDiff(activity.repCount, template.repCount), REPS_BANDS);
  const distanceScore = pairScore(activity.repDistanceM, template.repDistanceM, REP_DISTANCE_BANDS);
  const paceScore = pairScore(activity.repPaceSecPerKm, template.repPaceSecPerKm, REP_PACE_BANDS);
  const recoveryScore = pairScore(activity.recoveryDurationS, template.recoveryDurationS, RECOVERY_BANDS);
  const total = repsScore * 0.4 + distanceScore * 0.3 + paceScore * 0.2 + recoveryScore * 0.1;
  return Math.round(total * 100) / 100;
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
