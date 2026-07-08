/**
 * Unit tests for daily body composition recalculation planning.
 *
 * Run with:
 *   pnpm --prefix alzan-fe exec tsx src/modules/health/algorithms/bodyCompositionDailyPlanner.spec.ts
 */
import assert from 'node:assert/strict';
import {
  planDailyBodyCompositionRecalculation,
  DailyCompositionMeasurementInput,
  DailyCompositionWeightLogInput,
} from './bodyCompositionDailyPlanner';

let passed = 0;
let failed = 0;

const test = (name: string, fn: () => void) => {
  try {
    fn();
    passed++;
    console.log(`  ok  ${name}`);
  } catch (err) {
    failed++;
    console.error(`  FAIL ${name}`);
    console.error(`       ${err instanceof Error ? err.message : String(err)}`);
  }
};

const targetDate = new Date('2026-07-08T12:00:00.000Z');
const profile = {
  heightCm: 180,
  age: 30,
  sex: 'male' as const,
};

const weight = (id: string, measuredAt: string, weightKg = 80): DailyCompositionWeightLogInput => ({
  id,
  measuredAt,
  weightKg,
});

const measurement = (
  type: DailyCompositionMeasurementInput['type'],
  measuredAt: string,
  valueCm: number,
): DailyCompositionMeasurementInput => ({
  type,
  measuredAt,
  valueCm,
});

test('measurements without a recent weight do not create a composition result', () => {
  const plan = planDailyBodyCompositionRecalculation({
    targetDate,
    profile,
    weights: [weight('old-weight', '2026-06-20T09:00:00.000Z')],
    measurements: [measurement('abdomen', '2026-07-08T10:00:00.000Z', 90)],
  });

  assert.equal(plan.shouldCalculate, false);
  assert.equal(plan.shouldUpsert, false);
  assert.equal(plan.reason, 'missing_weight');
});

test('measurements use a recent weight without requesting a weight log update', () => {
  const plan = planDailyBodyCompositionRecalculation({
    targetDate,
    profile,
    weights: [weight('recent-weight', '2026-07-01T09:00:00.000Z')],
    measurements: [measurement('abdomen', '2026-07-08T10:00:00.000Z', 90)],
  });

  assert.equal(plan.shouldCalculate, true);
  assert.equal(plan.shouldUpsert, true);
  assert.equal(plan.sourceWeightLogId, 'recent-weight');
  assert.equal(plan.weightKgUsed, 80);
  assert.equal(plan.shouldUpdateWeightLog, false);
  assert.equal(plan.result?.bodyFat?.method, 'rfm');
});

test('same-day weight is preferred over an older recent weight', () => {
  const plan = planDailyBodyCompositionRecalculation({
    targetDate,
    profile,
    weights: [
      weight('older-weight', '2026-07-01T09:00:00.000Z', 79),
      weight('same-day-weight', '2026-07-08T08:00:00.000Z', 81),
    ],
    measurements: [measurement('abdomen', '2026-07-08T10:00:00.000Z', 91)],
  });

  assert.equal(plan.sourceWeightLogId, 'same-day-weight');
  assert.equal(plan.weightKgUsed, 81);
  assert.equal(plan.shouldUpdateWeightLog, true);
});

test('abdomen and hips produce the advanced body fat and muscle methods', () => {
  const plan = planDailyBodyCompositionRecalculation({
    targetDate,
    profile,
    weights: [weight('same-day-weight', '2026-07-08T08:00:00.000Z')],
    measurements: [
      measurement('abdomen', '2026-07-08T10:00:00.000Z', 90),
      measurement('hips', '2026-07-08T10:05:00.000Z', 100),
    ],
  });

  assert.equal(plan.result?.bodyFat?.method, 'rfm');
  assert.equal(plan.result?.bodyFat?.precisionLevel, 3);
  assert.equal(plan.bodyfatShouldReplace, true);
  assert.equal(plan.result?.muscle?.method, 'al_gindan');
  assert.equal(plan.result?.muscle?.precisionLevel, 3);
  assert.equal(plan.muscleShouldReplace, true);
});

test('an existing advanced result is not degraded by lower precision inputs', () => {
  const plan = planDailyBodyCompositionRecalculation({
    targetDate,
    profile,
    weights: [weight('same-day-weight', '2026-07-08T08:00:00.000Z')],
    measurements: [measurement('hips', '2026-07-08T10:05:00.000Z', 100)],
    storedComposition: {
      bodyfatPercent: 20,
      bodyfatPrecisionLevel: 3,
      muscleMassKg: 40,
      musclePrecisionLevel: 3,
    },
  });

  assert.equal(plan.shouldUpsert, false);
  assert.equal(plan.bodyfatShouldReplace, false);
  assert.equal(plan.muscleShouldReplace, false);
  assert.equal(plan.reason, 'not_improved');
});

test('RFM replaces a same-day BAI fallback when abdomen is added later', () => {
  const plan = planDailyBodyCompositionRecalculation({
    targetDate,
    profile,
    weights: [weight('same-day-weight', '2026-07-08T08:00:00.000Z')],
    measurements: [
      measurement('hips', '2026-07-08T09:00:00.000Z', 100),
      measurement('abdomen', '2026-07-08T11:00:00.000Z', 90),
    ],
    storedComposition: {
      bodyfatPercent: 26,
      bodyfatPrecisionLevel: 2,
      muscleMassKg: 38,
      musclePrecisionLevel: 2,
    },
  });

  assert.equal(plan.shouldUpsert, true);
  assert.equal(plan.bodyfatShouldReplace, true);
  assert.equal(plan.result?.bodyFat?.method, 'rfm');
  assert.equal(plan.result?.bodyFat?.precisionLevel, 3);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  throw new Error(`${failed} body composition daily planner test(s) failed`);
}
