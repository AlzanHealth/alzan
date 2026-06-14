/**
 * Pure decision logic for reconciling an incoming external activity with the
 * sessions that already exist on the same day. The wearables import pipeline
 * executes these decisions against the database.
 */

import {
  DUPLICATE_THRESHOLD,
  scoreEnduranceDuplicate,
  scoreStrengthDuplicate,
  StrengthDuplicateInput,
} from './duplicate-score';

export interface StrengthSessionLite {
  id: string;
  status: 'active' | 'completed' | 'paused' | 'cancelled';
  durationS: number | null;
  caloriesKcal: number | null;
  avgHeartRate: number | null;
  maxHeartRate: number | null;
  minHeartRate: number | null;
  recoveryTimeS: number | null;
  /** Session already carries data from an external import/association. */
  hasExternalData: boolean;
}

export interface WatchStrengthMetrics {
  durationS: number | null;
  endTime: string | null;
  caloriesKcal: number | null;
  avgHeartRate: number | null;
  maxHeartRate: number | null;
  minHeartRate: number | null;
  recoveryTimeS: number | null;
  epoc: number | null;
  pte: number | null;
  tssHr: number | null;
}

export type WatchMetricColumn =
  | 'duration_s'
  | 'calories_kcal'
  | 'avg_heart_rate'
  | 'max_heart_rate'
  | 'min_heart_rate'
  | 'recovery_time_s';

export interface StrengthMetricSplit {
  /** Watch values with no pre-existing app value (filled in silently). */
  applicable: Partial<Record<WatchMetricColumn, number>>;
  /** Watch values that override a differing app value (watch wins by default). */
  conflicting: Partial<Record<WatchMetricColumn, number>>;
  /** Previous app values that the watch overrode, kept so the user can revert. */
  previous: Partial<Record<WatchMetricColumn, number>>;
}

export type StrengthReconciliationPlan =
  | { kind: 'create_generic' }
  | { kind: 'create_needs_review' }
  | { kind: 'create_duplicate_pending'; ofSessionId: string; score: number }
  | { kind: 'associate'; targetSessionId: string; metrics: StrengthMetricSplit }
  | { kind: 'associate_finish'; targetSessionId: string };

export interface EnduranceSessionLite {
  id: string;
  distanceM: number | null;
  durationS: number | null;
  startTime: string | null;
  endTime: string | null;
}

export interface EnduranceActivityLite {
  distanceM: number | null;
  durationS: number | null;
  startTime: string | null;
  endTime: string | null;
}

export interface EnduranceReconciliationPlan {
  duplicateOfSessionId: string | null;
  duplicateScore: number | null;
  /** False only for strong duplicates (>= threshold): match runs after the user keeps both. */
  runTemplateMatch: boolean;
}

/** A watch value conflicts when the session already has a differing value. */
const CONFLICT_ABSOLUTE_TOLERANCE = 1;
const CONFLICT_RELATIVE_TOLERANCE = 0.02;

function conflicts(existing: number | null, incoming: number): boolean {
  if (existing == null) return false;
  const tolerance = Math.max(CONFLICT_ABSOLUTE_TOLERANCE, Math.abs(existing) * CONFLICT_RELATIVE_TOLERANCE);
  return Math.abs(existing - incoming) > tolerance;
}

/**
 * Splits the watch metrics relative to the session's current values. The watch
 * is the more accurate source, so every watch value is applied (filling empty
 * fields and overriding differing ones); the overridden app values are kept in
 * `previous` so the user can revert from the activity summary if they prefer.
 */
export function splitStrengthMetrics(existing: StrengthSessionLite, watch: WatchStrengthMetrics): StrengthMetricSplit {
  const pairs: Array<{ column: WatchMetricColumn; existing: number | null; incoming: number | null }> = [
    { column: 'duration_s', existing: existing.durationS, incoming: watch.durationS },
    { column: 'calories_kcal', existing: existing.caloriesKcal, incoming: watch.caloriesKcal },
    { column: 'avg_heart_rate', existing: existing.avgHeartRate, incoming: watch.avgHeartRate },
    { column: 'max_heart_rate', existing: existing.maxHeartRate, incoming: watch.maxHeartRate },
    { column: 'min_heart_rate', existing: existing.minHeartRate, incoming: watch.minHeartRate },
    { column: 'recovery_time_s', existing: existing.recoveryTimeS, incoming: watch.recoveryTimeS },
  ];
  const split: StrengthMetricSplit = { applicable: {}, conflicting: {}, previous: {} };
  for (const pair of pairs) {
    if (pair.incoming == null) continue;
    if (conflicts(pair.existing, pair.incoming)) {
      split.conflicting[pair.column] = pair.incoming;
      if (pair.existing != null) split.previous[pair.column] = pair.existing;
    } else {
      split.applicable[pair.column] = pair.incoming;
    }
  }
  return split;
}

/**
 * Decides what to do with an incoming external strength activity given the
 * strength sessions that already exist that day (spec cases 1-5). Cancelled
 * sessions are ignored.
 */
export function planStrengthReconciliation(
  todaysSessions: StrengthSessionLite[],
  watch: WatchStrengthMetrics,
): StrengthReconciliationPlan {
  const sessions = todaysSessions.filter(session => session.status !== 'cancelled');
  if (sessions.length === 0) return { kind: 'create_generic' };
  if (sessions.length > 1) return { kind: 'create_needs_review' };

  const session = sessions[0];
  if (session.hasExternalData) {
    const watchInput: StrengthDuplicateInput = {
      durationS: watch.durationS,
      caloriesKcal: watch.caloriesKcal,
      avgHeartRate: watch.avgHeartRate,
    };
    const score = scoreStrengthDuplicate(watchInput, {
      durationS: session.durationS,
      caloriesKcal: session.caloriesKcal,
      avgHeartRate: session.avgHeartRate,
    });
    return { kind: 'create_duplicate_pending', ofSessionId: session.id, score };
  }
  if (session.status === 'completed') {
    return { kind: 'associate', targetSessionId: session.id, metrics: splitStrengthMetrics(session, watch) };
  }
  return { kind: 'associate_finish', targetSessionId: session.id };
}

/**
 * Decides duplicate handling for an incoming endurance activity given the
 * completed same-sport sessions of the same day.
 */
export function planEnduranceReconciliation(
  todaysSameSportCompleted: EnduranceSessionLite[],
  activity: EnduranceActivityLite,
): EnduranceReconciliationPlan {
  let bestId: string | null = null;
  let bestScore: number | null = null;
  for (const session of todaysSameSportCompleted) {
    const score = scoreEnduranceDuplicate(activity, {
      distanceM: session.distanceM,
      durationS: session.durationS,
      startTime: session.startTime,
      endTime: session.endTime,
    });
    if (bestScore == null || score > bestScore) {
      bestScore = score;
      bestId = session.id;
    }
  }
  if (bestId == null || bestScore == null) {
    return { duplicateOfSessionId: null, duplicateScore: null, runTemplateMatch: true };
  }
  return {
    duplicateOfSessionId: bestId,
    duplicateScore: bestScore,
    runTemplateMatch: bestScore < DUPLICATE_THRESHOLD,
  };
}

/**
 * Same-calendar-day check used to scope duplicate detection and strength
 * association. Prefers the local wall-clock date when both sides provide it,
 * otherwise compares UTC dates.
 */
export function isSameLocalDay(
  a: { startedAtLocal: string | null; startTime: string | null },
  b: { startedAtLocal: string | null; startTime: string | null },
): boolean {
  const dayOf = (value: string | null): string | null => {
    if (!value) return null;
    if (!Number.isFinite(Date.parse(value))) return null;
    return value.slice(0, 10);
  };
  const localA = dayOf(a.startedAtLocal);
  const localB = dayOf(b.startedAtLocal);
  if (localA && localB) return localA === localB;
  const utcA = dayOf(a.startTime);
  const utcB = dayOf(b.startTime);
  return utcA != null && utcB != null && utcA === utcB;
}
