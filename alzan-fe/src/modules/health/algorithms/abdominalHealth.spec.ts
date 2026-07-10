/**
 * Unit tests for abdominal health and recomposition markers.
 *
 * Run with:
 *   pnpm --prefix alzan-fe exec tsx src/modules/health/algorithms/abdominalHealth.spec.ts
 */
import assert from 'node:assert/strict';
import {
  calculateAbdominalHealth,
  calculatePersistedAbdominalHealth,
  calculateRecompositionTrend,
  getWaistToHeightRangeConfig,
  getWaistToHeightCategory,
  getWaistToHipRangeConfig,
  getWaistToHipCategory,
} from './abdominalHealth';

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

test('waist-to-height calculates and categorizes correctly', () => {
  const result = calculateAbdominalHealth({
    heightCm: 180,
    weightKg: 80,
    sex: 'male',
    measurements: { abdomen: 86 },
  });

  assert.equal(result.waistToHeight?.ratio, 0.48);
  assert.equal(result.waistToHeight?.category, 'healthy');
  assert.equal(getWaistToHeightCategory(0.61).category, 'high_risk');
});

test('waist-to-height range keeps lower values healthier until risk cutoffs', () => {
  const range = getWaistToHeightRangeConfig();

  assert.equal(range.min, 0.35);
  assert.equal(range.max, 0.7);
  assert.deepEqual(
    range.segments.map(segment => segment.to),
    [0.4, 0.5, 0.6, 0.7],
  );
  assert.equal(range.segments[1].labelKey, 'health.abdominalCategoryHealthy');
  assert.equal(range.segments[3].labelKey, 'health.abdominalCategoryHigh');
});

test('waist-to-hip calculates and uses sex-specific categories', () => {
  const male = getWaistToHipCategory(0.91, 'male');
  const female = getWaistToHipCategory(0.91, 'female');
  const result = calculateAbdominalHealth({
    heightCm: 180,
    weightKg: 80,
    sex: 'male',
    measurements: { abdomen: 90, hips: 100 },
  });

  assert.equal(result.waistToHip?.ratio, 0.9);
  assert.equal(male.category, 'increased_risk');
  assert.equal(female.category, 'high_risk');
});

test('waist-to-hip range uses sex-specific health thresholds', () => {
  const maleRange = getWaistToHipRangeConfig('male');
  const femaleRange = getWaistToHipRangeConfig('female');

  assert.deepEqual(
    maleRange.segments.map(segment => segment.to),
    [0.9, 1, 1.1],
  );
  assert.deepEqual(
    femaleRange.segments.map(segment => segment.to),
    [0.8, 0.85, 0.95],
  );
});

test('persisted abdominal health stores only primary ratios, not BRI or ABSI', () => {
  const persisted = calculatePersistedAbdominalHealth({
    heightCm: 180,
    weightKg: 80,
    sex: 'male',
    measurements: { abdomen: 90, hips: 100 },
  });

  assert.equal(persisted.waistToHeight?.ratio, 0.5);
  assert.equal(persisted.waistToHip?.ratio, 0.9);
  assert.equal('bri' in persisted, false);
  assert.equal('absi' in persisted, false);
});

test('BRI and ABSI calculate only when enough data exists', () => {
  const complete = calculateAbdominalHealth({
    heightCm: 180,
    weightKg: 80,
    sex: 'male',
    measurements: { abdomen: 90 },
  });
  const missingAbdomen = calculateAbdominalHealth({
    heightCm: 180,
    weightKg: 80,
    sex: 'male',
    measurements: {},
  });

  assert.equal(complete.bri?.inputsUsed.join(','), 'height,abdomen');
  assert.equal(complete.absi?.inputsUsed.join(','), 'weight,height,abdomen');
  assert.equal(typeof complete.bri?.value, 'number');
  assert.equal(typeof complete.absi?.value, 'number');
  assert.equal(missingAbdomen.waistToHeight, null);
  assert.equal(missingAbdomen.waistToHip, null);
  assert.equal(missingAbdomen.bri, null);
  assert.equal(missingAbdomen.absi, null);
});

test('missing hip still allows waist-to-height and advanced waist-height markers', () => {
  const result = calculateAbdominalHealth({
    heightCm: 180,
    weightKg: 80,
    sex: 'male',
    measurements: { abdomen: 90 },
  });

  assert.equal(result.waistToHeight?.ratio, 0.5);
  assert.equal(result.waistToHip, null);
  assert.equal(result.bri !== null, true);
  assert.equal(result.absi !== null, true);
});

test('impossible abdomen is ignored before calculating abdominal markers', () => {
  const result = calculateAbdominalHealth({
    heightCm: 180,
    weightKg: 80,
    sex: 'male',
    measurements: { abdomen: 10, hips: 100 },
  });

  assert.equal(result.waistToHeight, null);
  assert.equal(result.waistToHip, null);
  assert.equal(result.bri, null);
  assert.equal(result.absi, null);
});

test('recomposition is positive when abdomen drops and perimeters are maintained', () => {
  const trend = calculateRecompositionTrend({
    current: { weightKg: 79, abdomen: 86, chest: 105, arm: 36, thigh: 61 },
    previous: { weightKg: 80, abdomen: 90, chest: 104.5, arm: 36, thigh: 60.5 },
  });

  assert.equal(trend.status, 'positive');
  assert.equal(trend.usedMeasurements.includes('abdomen'), true);
  assert.equal(trend.usedMeasurements.includes('chest'), true);
});

test('recomposition warns when weight drops while muscle-related perimeters fall', () => {
  const trend = calculateRecompositionTrend({
    current: { weightKg: 76, abdomen: 88, chest: 101, arm: 33, thigh: 57 },
    previous: { weightKg: 80, abdomen: 90, chest: 105, arm: 36, thigh: 61 },
  });

  assert.equal(trend.status, 'muscle_loss_risk');
});

test('recomposition exposes weight as a translatable input key', () => {
  const trend = calculateRecompositionTrend({
    current: { weightKg: 79, abdomen: 89 },
    previous: { weightKg: 80, abdomen: 90 },
  });

  assert.equal(trend.usedMeasurements.includes('weight'), true);
  assert.equal(trend.usedMeasurements.includes('weightKg' as never), false);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  throw new Error(`${failed} abdominal health test(s) failed`);
}
