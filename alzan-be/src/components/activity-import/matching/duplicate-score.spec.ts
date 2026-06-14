import { strict as assert } from 'assert';
import { DUPLICATE_THRESHOLD, scoreEnduranceDuplicate, scoreStrengthDuplicate } from './duplicate-score';

function assertIdenticalEnduranceSessionsAreDuplicates(): void {
  const a = {
    distanceM: 10000,
    durationS: 3000,
    startTime: '2026-06-12T07:30:00Z',
    endTime: '2026-06-12T08:20:00Z',
  };
  const score = scoreEnduranceDuplicate(a, { ...a });
  assert.equal(score, 100);
  assert.ok(score >= DUPLICATE_THRESHOLD);
}

function assertSimilarOverlappingSessionsAreDuplicates(): void {
  // Same run recorded by two devices: tiny metric drift, overlapping time.
  const score = scoreEnduranceDuplicate(
    { distanceM: 10050, durationS: 3010, startTime: '2026-06-12T07:31:00Z', endTime: '2026-06-12T08:21:10Z' },
    { distanceM: 10000, durationS: 3000, startTime: '2026-06-12T07:30:00Z', endTime: '2026-06-12T08:20:00Z' },
  );
  assert.ok(score >= DUPLICATE_THRESHOLD, `expected duplicate, got ${score}`);
}

function assertDifferentDistanceSameTimeIsNotDuplicate(): void {
  // Morning easy 5k vs the same morning's 10k: not the same workout.
  const score = scoreEnduranceDuplicate(
    { distanceM: 5000, durationS: 1500, startTime: '2026-06-12T07:30:00Z', endTime: null },
    { distanceM: 10000, durationS: 3000, startTime: '2026-06-12T18:00:00Z', endTime: null },
  );
  assert.ok(score < DUPLICATE_THRESHOLD, `expected non-duplicate, got ${score}`);
}

function assertMissingMetricsRenormalize(): void {
  // Only duration + proximity comparable.
  const score = scoreEnduranceDuplicate(
    { distanceM: null, durationS: 3000, startTime: '2026-06-12T07:30:00Z', endTime: null },
    { distanceM: 10000, durationS: 3000, startTime: '2026-06-12T07:35:00Z', endTime: null },
  );
  assert.equal(score, 100);
  // Nothing comparable -> 0.
  assert.equal(
    scoreEnduranceDuplicate(
      { distanceM: null, durationS: null, startTime: null, endTime: null },
      { distanceM: 10000, durationS: 3000, startTime: '2026-06-12T07:30:00Z', endTime: null },
    ),
    0,
  );
}

function assertStrengthDuplicateByDurationKcalHr(): void {
  const score = scoreStrengthDuplicate(
    { durationS: 3600, caloriesKcal: 410, avgHeartRate: 121 },
    { durationS: 3550, caloriesKcal: 400, avgHeartRate: 120 },
  );
  assert.ok(score >= DUPLICATE_THRESHOLD, `expected strength duplicate, got ${score}`);

  const different = scoreStrengthDuplicate(
    { durationS: 1800, caloriesKcal: 150, avgHeartRate: 95 },
    { durationS: 3600, caloriesKcal: 420, avgHeartRate: 130 },
  );
  assert.ok(different < DUPLICATE_THRESHOLD, `expected non-duplicate, got ${different}`);
}

function assertStrengthMissingMetricsRenormalize(): void {
  // Calories missing on one side: duration + HR drive the score.
  const score = scoreStrengthDuplicate(
    { durationS: 3600, caloriesKcal: null, avgHeartRate: 120 },
    { durationS: 3600, caloriesKcal: 400, avgHeartRate: 120 },
  );
  assert.equal(score, 100);
  assert.equal(
    scoreStrengthDuplicate(
      { durationS: null, caloriesKcal: null, avgHeartRate: null },
      { durationS: 3600, caloriesKcal: 400, avgHeartRate: 120 },
    ),
    0,
  );
}

assertIdenticalEnduranceSessionsAreDuplicates();
assertSimilarOverlappingSessionsAreDuplicates();
assertDifferentDistanceSameTimeIsNotDuplicate();
assertMissingMetricsRenormalize();
assertStrengthDuplicateByDurationKcalHr();
assertStrengthMissingMetricsRenormalize();
