import { strict as assert } from 'assert';
import {
  isSameLocalDay,
  planEnduranceReconciliation,
  planStrengthReconciliation,
  splitStrengthMetrics,
  StrengthSessionLite,
  WatchStrengthMetrics,
} from './reconciliation-plan';

function strengthSession(overrides: Partial<StrengthSessionLite> = {}): StrengthSessionLite {
  return {
    id: 'session-a',
    status: 'completed',
    durationS: null,
    caloriesKcal: null,
    avgHeartRate: null,
    maxHeartRate: null,
    minHeartRate: null,
    recoveryTimeS: null,
    hasExternalData: false,
    ...overrides,
  };
}

function watchMetrics(overrides: Partial<WatchStrengthMetrics> = {}): WatchStrengthMetrics {
  return {
    durationS: 3600,
    endTime: '2026-06-12T11:00:00Z',
    caloriesKcal: 400,
    avgHeartRate: 120,
    maxHeartRate: 165,
    minHeartRate: 70,
    recoveryTimeS: null,
    epoc: null,
    pte: null,
    tssHr: null,
    ...overrides,
  };
}

function assertCase1NoSessionCreatesGeneric(): void {
  const plan = planStrengthReconciliation([], watchMetrics());
  assert.equal(plan.kind, 'create_generic');
}

function assertCase2FinishedSessionAssociatesWithConflictSplit(): void {
  // Existing manual values differ -> conflicts; empty fields apply silently.
  const session = strengthSession({ durationS: 3000, caloriesKcal: null, avgHeartRate: 110 });
  const plan = planStrengthReconciliation([session], watchMetrics());
  assert.equal(plan.kind, 'associate');
  if (plan.kind !== 'associate') return;
  assert.equal(plan.targetSessionId, 'session-a');
  assert.equal(plan.metrics.applicable.calories_kcal, 400);
  assert.equal(plan.metrics.applicable.max_heart_rate, 165);
  assert.equal(plan.metrics.conflicting.duration_s, 3600);
  assert.equal(plan.metrics.conflicting.avg_heart_rate, 120);
  // Overridden app values are kept for an optional revert.
  assert.equal(plan.metrics.previous.duration_s, 3000);
  assert.equal(plan.metrics.previous.avg_heart_rate, 110);
}

function assertCase2NoConflictAppliesEverything(): void {
  const session = strengthSession();
  const plan = planStrengthReconciliation([session], watchMetrics());
  assert.equal(plan.kind, 'associate');
  if (plan.kind !== 'associate') return;
  assert.deepEqual(plan.metrics.conflicting, {});
  assert.equal(plan.metrics.applicable.duration_s, 3600);
}

function assertNearEqualValuesAreNotConflicts(): void {
  // Within tolerance (max(1, 2%)): not a conflict.
  const split = splitStrengthMetrics(
    strengthSession({ durationS: 3590, avgHeartRate: 121 }),
    watchMetrics({ durationS: 3600, avgHeartRate: 120 }),
  );
  assert.equal(split.conflicting.duration_s, undefined);
  assert.equal(split.conflicting.avg_heart_rate, undefined);
  assert.equal(split.applicable.duration_s, 3600);
}

function assertCase3InProgressSessionAssociatesAndFinishes(): void {
  const session = strengthSession({ status: 'active' });
  const plan = planStrengthReconciliation([session], watchMetrics());
  assert.equal(plan.kind, 'associate_finish');
  if (plan.kind !== 'associate_finish') return;
  assert.equal(plan.targetSessionId, 'session-a');
}

function assertCase4MultipleSessionsNeedReview(): void {
  const plan = planStrengthReconciliation(
    [strengthSession({ id: 'a' }), strengthSession({ id: 'b', status: 'active' })],
    watchMetrics(),
  );
  assert.equal(plan.kind, 'create_needs_review');
}

function assertCase5ExistingExternalSessionIsDuplicatePending(): void {
  const session = strengthSession({
    hasExternalData: true,
    durationS: 3600,
    caloriesKcal: 405,
    avgHeartRate: 121,
  });
  const plan = planStrengthReconciliation([session], watchMetrics());
  assert.equal(plan.kind, 'create_duplicate_pending');
  if (plan.kind !== 'create_duplicate_pending') return;
  assert.equal(plan.ofSessionId, 'session-a');
  assert.ok(plan.score >= 80, `expected high duplicate score, got ${plan.score}`);
}

function assertCancelledSessionsAreIgnored(): void {
  const plan = planStrengthReconciliation([strengthSession({ status: 'cancelled' })], watchMetrics());
  assert.equal(plan.kind, 'create_generic');
}

function assertEnduranceStrongDuplicateSkipsTemplateMatch(): void {
  const plan = planEnduranceReconciliation(
    [
      {
        id: 'existing',
        distanceM: 10000,
        durationS: 3000,
        startTime: '2026-06-12T07:30:00Z',
        endTime: '2026-06-12T08:20:00Z',
      },
    ],
    { distanceM: 10020, durationS: 3005, startTime: '2026-06-12T07:30:30Z', endTime: '2026-06-12T08:20:30Z' },
  );
  assert.equal(plan.duplicateOfSessionId, 'existing');
  assert.ok((plan.duplicateScore ?? 0) >= 80);
  assert.equal(plan.runTemplateMatch, false);
}

function assertEnduranceWeakDuplicateStillMatchesTemplates(): void {
  const plan = planEnduranceReconciliation(
    [
      {
        id: 'existing',
        distanceM: 5000,
        durationS: 1500,
        startTime: '2026-06-12T07:30:00Z',
        endTime: null,
      },
    ],
    { distanceM: 10000, durationS: 3000, startTime: '2026-06-12T18:00:00Z', endTime: null },
  );
  assert.equal(plan.duplicateOfSessionId, 'existing');
  assert.ok((plan.duplicateScore ?? 100) < 80);
  assert.equal(plan.runTemplateMatch, true);
}

function assertEnduranceNoSessionsRunsTemplateMatch(): void {
  const plan = planEnduranceReconciliation([], {
    distanceM: 10000,
    durationS: 3000,
    startTime: '2026-06-12T07:30:00Z',
    endTime: null,
  });
  assert.equal(plan.duplicateOfSessionId, null);
  assert.equal(plan.duplicateScore, null);
  assert.equal(plan.runTemplateMatch, true);
}

function assertSameLocalDayPrefersLocalTimestamps(): void {
  // Late-night UTC drift: local dates match even when UTC dates differ.
  assert.equal(
    isSameLocalDay(
      { startedAtLocal: '2026-06-12T23:30:00', startTime: '2026-06-13T03:30:00Z' },
      { startedAtLocal: '2026-06-12T07:00:00', startTime: '2026-06-12T11:00:00Z' },
    ),
    true,
  );
  assert.equal(
    isSameLocalDay(
      { startedAtLocal: null, startTime: '2026-06-13T03:30:00Z' },
      { startedAtLocal: null, startTime: '2026-06-12T11:00:00Z' },
    ),
    false,
  );
  assert.equal(
    isSameLocalDay(
      { startedAtLocal: null, startTime: '2026-06-12T03:30:00Z' },
      { startedAtLocal: null, startTime: '2026-06-12T11:00:00Z' },
    ),
    true,
  );
  assert.equal(
    isSameLocalDay({ startedAtLocal: null, startTime: null }, { startedAtLocal: null, startTime: null }),
    false,
  );
}

assertCase1NoSessionCreatesGeneric();
assertCase2FinishedSessionAssociatesWithConflictSplit();
assertCase2NoConflictAppliesEverything();
assertNearEqualValuesAreNotConflicts();
assertCase3InProgressSessionAssociatesAndFinishes();
assertCase4MultipleSessionsNeedReview();
assertCase5ExistingExternalSessionIsDuplicatePending();
assertCancelledSessionsAreIgnored();
assertEnduranceStrongDuplicateSkipsTemplateMatch();
assertEnduranceWeakDuplicateStillMatchesTemplates();
assertEnduranceNoSessionsRunsTemplateMatch();
assertSameLocalDayPrefersLocalTimestamps();
