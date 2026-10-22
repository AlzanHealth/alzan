/** Run: pnpm --prefix alzan-fe exec tsx src/modules/health/algorithms/bodyComposition.spec.ts */
import assert from 'node:assert/strict';
import {
  calculateBMI,
  calculateBodyComposition,
  calculateBodyFatCUNBAE,
  calculateBodyFatRFM,
  calculateBodyFatBAI,
  hasEnoughDataForBodyFat,
} from './bodyComposition';

let checked = 0;
for (let mask = 0; mask < 128; mask++) {
  const weightKg = mask & 1 ? 80 : undefined;
  const heightCm = mask & 2 ? 180 : undefined;
  const age = mask & 4 ? 30 : undefined;
  const sex = mask & 8 ? 'male' : undefined;
  const waist = mask & 16 ? 90 : undefined;
  const hips = mask & 32 ? 100 : undefined;
  const abdomen = mask & 64 ? 92 : undefined;
  const result = calculateBodyComposition({ weightKg, heightCm, age, sex, measurements: { waist, hips, abdomen } });
  assert.equal(!!result.bmi, !!(weightKg && heightCm), `BMI mask ${mask}`);
  const method =
    heightCm && waist && sex && age
      ? 'rfm'
      : weightKg && heightCm && age && sex
        ? 'cun_bae'
        : heightCm && hips && age
          ? 'bai'
          : undefined;
  assert.equal(result.bodyFat?.method, method, `fat mask ${mask}`);
  assert.equal(!!result.muscle, !!(weightKg && heightCm && age && sex), `muscle mask ${mask}`);
  assert.equal(result.fatMassKg !== null, !!(method && weightKg), `mass mask ${mask}`);
  assert.equal(hasEnoughDataForBodyFat(weightKg, heightCm, age, sex, hips, undefined, waist), !!method);
  checked++;
}

for (const boundary of [18.5, 25, 30, 35, 40]) {
  const below = calculateBMI((boundary - 0.01) * 4, 200);
  const at = calculateBMI(boundary * 4, 200);
  assert.notEqual(below?.category, at?.category, `unrounded BMI boundary ${boundary}`);
  assert.equal(below?.value, at?.value);
}
for (const invalid of [-80, 0, Number.NaN, Number.POSITIVE_INFINITY]) {
  assert.equal(calculateBMI(invalid, 180), null);
  assert.equal(calculateBMI(80, invalid), null);
}
assert.equal(calculateBodyComposition({ weightKg: 80, heightCm: 180 }).bmi?.adultCategoriesApplicable, false);
assert.equal(calculateBodyComposition({ weightKg: 80, heightCm: 180, age: 19 }).bmi?.category, null);
assert.equal(calculateBodyComposition({ weightKg: 80, heightCm: 180, age: 20 }).bmi?.adultCategoriesApplicable, true);
assert.equal(
  calculateBodyComposition({ heightCm: 180, age: 19, sex: 'male', measurements: { waist: 90 } }).bodyFat,
  null,
);

// Reference arithmetic: RFM male 64 - 20*180/90 = 24; female adds 12.
for (const sex of ['male', 'female'] as const) {
  const result = calculateBodyComposition({ heightCm: 180, age: 30, sex, measurements: { waist: 90 } });
  assert.equal(result.bodyFat?.percentage, sex === 'male' ? 24 : 36);
  assert.deepEqual(result.bodyFat?.inputsUsed, ['height', 'sex', 'waist']);
  assert.equal(result.fatMassKg, null);
  assert.equal(result.muscleMassKg, null);
}
const bai = calculateBodyComposition({ heightCm: 180, age: 30, measurements: { hips: 100 } });
assert.equal(bai.bodyFat?.percentage, Number((100 / 1.8 ** 1.5 - 18).toFixed(1)));
assert.equal(bai.bodyFat?.category, null);
assert.equal(bai.bodyFat?.precisionLevel, 1);
const base = { weightKg: 80, heightCm: 180, age: 30, sex: 'male' as const };
assert.equal(
  calculateBodyComposition({ ...base, measurements: { abdomen: 90, hips: 100 } }).bodyFat?.method,
  'cun_bae',
);
assert.equal(
  calculateBodyComposition({ ...base, measurements: { abdomen: 90, hips: 100 } }).muscle?.method,
  'al_gindan',
);
assert.equal(
  calculateBodyComposition({ ...base, measurements: { arm: 35, armFlexed: 40 } }).muscle?.method,
  'lee_et_al',
);
assert.equal(calculateBodyComposition({ ...base, measurements: { waist: Number.NaN } }).bodyFat?.method, 'cun_bae');
const cun = calculateBodyComposition(base);
assert.equal(cun.bodyFat?.percentage, Number(calculateBodyFatCUNBAE(80 / 1.8 ** 2, 30, 'male').toFixed(1)));
// Independently evaluated CUN-BAE reference, BMI=25, age=30, male -> 22.0895.
assert.ok(Math.abs(calculateBodyFatCUNBAE(25, 30, 'male') - 22.0895) < 0.00001);
const imported = calculateBodyComposition({ loggedBodyFat: 19.4, loggedSource: 'garmin' });
assert.equal(imported.bodyFat?.percentage, 19.4);
assert.equal(imported.bodyFat?.method, 'measured');
assert.equal(imported.fatMassKg, null);
console.log(`${checked} input permutations and arithmetic/validation regressions passed`);

assert.equal(calculateBodyComposition({ heightCm: 180, sex: 'male', measurements: { waist: 90 } }).bodyFat, null);
assert.equal(calculateBodyComposition({ heightCm: 180, measurements: { hips: 100 } }).bodyFat, null);

// Formula outputs remain raw; unusable percentages are rejected rather than fabricated.
assert.equal(calculateBodyFatRFM(180, 40, 'male'), -26);
assert.equal(calculateBodyFatRFM(120, 200, 'female'), 64);
assert.equal(calculateBodyFatBAI(100, 100), 82);
const invalidRfm = calculateBodyComposition({ heightCm: 180, age: 30, sex: 'male', measurements: { waist: 40 } });
assert.equal(invalidRfm.bodyFat, null);
assert.equal(invalidRfm.fatMassKg, null);
const fallbackCun = calculateBodyComposition({ ...base, measurements: { waist: 40 } });
assert.equal(fallbackCun.bodyFat?.method, 'cun_bae');
assert.equal(fallbackCun.bodyFat?.percentage, cun.bodyFat?.percentage);
const fallbackBai = calculateBodyComposition({
  heightCm: 180,
  age: 30,
  sex: 'male',
  measurements: { waist: 40, hips: 100 },
});
assert.equal(fallbackBai.bodyFat?.method, 'bai');
const aboveSixty = calculateBodyComposition({ heightCm: 120, age: 30, sex: 'female', measurements: { waist: 200 } });
assert.equal(aboveSixty.bodyFat?.percentage, 64);
assert.equal(aboveSixty.bodyFat?.method, 'rfm');
assert.equal(calculateBodyComposition({ heightCm: 100, age: 30, measurements: { hips: 200 } }).bodyFat, null);
