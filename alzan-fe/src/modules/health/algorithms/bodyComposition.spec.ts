/**
 * Unit tests for adaptive body composition calculations.
 *
 * Run with:
 *   pnpm --prefix alzan-fe exec tsx src/modules/health/algorithms/bodyComposition.spec.ts
 */
import assert from 'node:assert/strict';
import { calculateBodyComposition } from './bodyComposition';

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

test('weight and height alone calculate BMI only', () => {
  const result = calculateBodyComposition({
    weightKg: 80,
    heightCm: 180,
  });

  assert.equal(result.bmi?.value, 24.7);
  assert.equal(result.bmi?.category, 'normal');
  assert.equal(result.bodyFat, null);
  assert.equal(result.muscle, null);
});

test('weight, height, age, and sex use basic composition algorithms', () => {
  const result = calculateBodyComposition({
    weightKg: 80,
    heightCm: 180,
    age: 30,
    sex: 'male',
  });

  assert.equal(result.bodyFat?.method, 'cun_bae');
  assert.equal(result.bodyFat?.precisionLevel, 2);
  assert.deepEqual(result.bodyFat?.inputsUsed, ['weight', 'height', 'age', 'sex']);
  assert.match(result.bodyFat?.formulaUsed ?? '', /CUN-BAE/);
  assert.equal(result.muscle?.method, 'lee_et_al');
  assert.equal(result.muscle?.precisionLevel, 2);
  assert.deepEqual(result.muscle?.inputsUsed, ['weight', 'height', 'age', 'sex']);
  assert.match(result.muscle?.formulaUsed ?? '', /0\.244/);
});

test('abdomen activates RFM for body fat', () => {
  const result = calculateBodyComposition({
    weightKg: 80,
    heightCm: 180,
    age: 30,
    sex: 'male',
    measurements: {
      abdomen: 90,
    },
  });

  assert.equal(result.bodyFat?.method, 'rfm');
  assert.equal(result.bodyFat?.precisionLevel, 3);
  assert.deepEqual(result.bodyFat?.inputsUsed, ['height', 'sex', 'abdomen']);
  assert.equal(result.bodyFat?.formulaUsed, 'RFM = 64 - 20 * (heightCm / abdomenCm)');
});

test('abdomen and hip activate advanced muscle estimation', () => {
  const result = calculateBodyComposition({
    weightKg: 80,
    heightCm: 180,
    age: 30,
    sex: 'male',
    measurements: {
      abdomen: 90,
      hips: 100,
    },
  });

  assert.equal(result.muscle?.method, 'al_gindan');
  assert.equal(result.muscle?.precisionLevel, 3);
  assert.deepEqual(result.muscle?.inputsUsed, ['weight', 'age', 'sex', 'abdomen', 'hips']);
  assert.equal(
    result.muscle?.formulaUsed,
    'SMM = 39.5 + 0.665 * weightKg - 0.185 * abdomenCm - 0.418 * hipsCm - 0.08 * age',
  );
});

test('hip without abdomen is not marked as optimal precision', () => {
  const result = calculateBodyComposition({
    weightKg: 80,
    heightCm: 180,
    age: 30,
    sex: 'male',
    measurements: {
      hips: 100,
    },
  });

  assert.equal(result.bodyFat?.method, 'bai');
  assert.equal(result.bodyFat?.precisionLevel, 2);
  assert.equal(result.muscle?.method, 'lee_et_al');
  assert.equal(result.muscle?.precisionLevel, 2);
});

test('impossible measurements are ignored before selecting algorithms', () => {
  const result = calculateBodyComposition({
    weightKg: 80,
    heightCm: 180,
    age: 30,
    sex: 'male',
    measurements: {
      abdomen: 10,
      hips: 100,
    },
  });

  assert.equal(result.availableData.hasAbdomen, false);
  assert.equal(result.bodyFat?.method, 'bai');
  assert.equal(result.muscle?.method, 'lee_et_al');
});

test('stored values do not pretend to know the original formula', () => {
  const result = calculateBodyComposition({
    weightKg: 80,
    heightCm: 180,
    age: 30,
    sex: 'male',
    measurements: {
      abdomen: 90,
      hips: 100,
    },
    loggedBodyFat: 20,
    loggedMuscleMass: 35,
    loggedSource: 'manual',
  });

  assert.equal(result.bodyFat?.method, 'stored');
  assert.equal(result.bodyFat?.formulaUsed, 'Stored value; original calculation method is not persisted.');
  assert.deepEqual(result.bodyFat?.inputsUsed, ['storedBodyFat']);
  assert.equal(result.muscle?.method, 'stored');
  assert.equal(result.muscle?.formulaUsed, 'Stored value; original calculation method is not persisted.');
  assert.deepEqual(result.muscle?.inputsUsed, ['storedMuscleMass']);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  throw new Error(`${failed} body composition test(s) failed`);
}
