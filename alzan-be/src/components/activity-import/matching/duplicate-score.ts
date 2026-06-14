/**
 * Pure similarity scoring between an imported activity and an existing
 * session of the same sport on the same day. Per spec, >= 80 is treated as a
 * probable duplicate (priority prompt); below that only a subtle notice is
 * shown.
 */

export const DUPLICATE_THRESHOLD = 80;

export interface EnduranceDuplicateInput {
  distanceM: number | null;
  durationS: number | null;
  startTime: string | null;
  endTime: string | null;
}

export interface StrengthDuplicateInput {
  durationS: number | null;
  caloriesKcal: number | null;
  avgHeartRate: number | null;
}

type Band = readonly [maxDiffPct: number, score: number];

const METRIC_BANDS: readonly Band[] = [
  [0.05, 100],
  [0.1, 80],
  [0.2, 50],
];

function bandScore(diffPct: number, bands: readonly Band[]): number {
  for (const [maxDiff, score] of bands) {
    if (diffPct <= maxDiff) return score;
  }
  return 0;
}

function relativeDiff(a: number, b: number): number {
  if (b === 0) return a === 0 ? 0 : 1;
  return Math.abs(a - b) / Math.abs(b);
}

function metricScore(a: number | null, b: number | null): number | null {
  if (a == null || b == null) return null;
  return bandScore(relativeDiff(a, b), METRIC_BANDS);
}

function parseTime(value: string | null): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function startProximityScore(a: EnduranceDuplicateInput, b: EnduranceDuplicateInput): number | null {
  const startA = parseTime(a.startTime);
  const startB = parseTime(b.startTime);
  if (startA == null || startB == null) return null;
  const endA = parseTime(a.endTime) ?? (a.durationS != null ? startA + a.durationS * 1000 : null);
  const endB = parseTime(b.endTime) ?? (b.durationS != null ? startB + b.durationS * 1000 : null);
  if (endA != null && endB != null && startA <= endB && startB <= endA) return 100;
  const diffMinutes = Math.abs(startA - startB) / 60000;
  if (diffMinutes <= 15) return 100;
  if (diffMinutes <= 60) return 60;
  return 0;
}

function weightedScore(parts: Array<{ weight: number; score: number | null }>): number {
  const usable = parts.filter((part): part is { weight: number; score: number } => part.score != null);
  const totalWeight = usable.reduce((sum, part) => sum + part.weight, 0);
  if (totalWeight === 0) return 0;
  const total = usable.reduce((sum, part) => sum + part.score * part.weight, 0) / totalWeight;
  return Math.round(total * 100) / 100;
}

/** Distance 40%, duration 40%, start-time proximity 20%. */
export function scoreEnduranceDuplicate(a: EnduranceDuplicateInput, b: EnduranceDuplicateInput): number {
  return weightedScore([
    { weight: 0.4, score: metricScore(a.distanceM, b.distanceM) },
    { weight: 0.4, score: metricScore(a.durationS, b.durationS) },
    { weight: 0.2, score: startProximityScore(a, b) },
  ]);
}

/** Duration 40%, calories 30%, avg heart rate 30% (per strength spec). */
export function scoreStrengthDuplicate(a: StrengthDuplicateInput, b: StrengthDuplicateInput): number {
  return weightedScore([
    { weight: 0.4, score: metricScore(a.durationS, b.durationS) },
    { weight: 0.3, score: metricScore(a.caloriesKcal, b.caloriesKcal) },
    { weight: 0.3, score: metricScore(a.avgHeartRate, b.avgHeartRate) },
  ]);
}
