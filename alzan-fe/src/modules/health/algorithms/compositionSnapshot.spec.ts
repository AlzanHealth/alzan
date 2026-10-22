import { strict as assert } from 'assert';
import { calculateBodyComposition } from './bodyComposition';
import {
  buildComparableCompositionDelta,
  buildCompositionDeltas,
  mergePersistedCompositionResult,
} from './compositionSnapshot';

const fallback = calculateBodyComposition({
  weightKg: 73.6,
  heightCm: 175,
  age: 25,
  sex: 'male',
  measurements: { waist: 82.8, abdomen: 82.8, hips: 92.8 },
});

const partialPersisted = {
  bodyfat_percent: null,
  bodyfat_method: null,
  bodyfat_precision_level: null,
  bodyfat_formula: null,
  bodyfat_inputs: [],
  muscle_mass_kg: null,
  muscle_percent: null,
  muscle_method: null,
  muscle_precision_level: null,
  muscle_formula: null,
  muscle_inputs: [],
  weight_kg_used: 73.6,
};

function assertNullSnapshotsDoNotReviveFallback(): void {
  const actual = mergePersistedCompositionResult(partialPersisted, fallback, 'male');

  assert.equal(actual.bodyFat, null);
  assert.equal(actual.muscle, null);
  assert.equal(actual.fatMassKg, null);
  assert.equal(actual.muscleMassKg, null);
}

function assertPersistedMetricsStillWinIndividually(): void {
  const actual = mergePersistedCompositionResult(
    {
      ...partialPersisted,
      bodyfat_percent: 18.4,
      bodyfat_method: 'measured',
      bodyfat_precision_level: 3,
      bodyfat_formula: 'External measurement',
      bodyfat_inputs: ['storedBodyFat'],
    },
    fallback,
    'male',
  );

  assert.equal(actual.bodyFat?.percentage, 18.4);
  assert.equal(actual.bodyFat?.method, 'measured');
  assert.equal(actual.muscle, null);
}

function assertStaleSnapshotsNeverOverrideRecalculation(): void {
  const actual = mergePersistedCompositionResult(
    {
      ...partialPersisted,
      calculation_status: 'stale',
      bodyfat_percent: 18.4,
      bodyfat_method: 'measured',
      bodyfat_precision_level: 3,
    },
    fallback,
    'male',
  );

  assert.equal(actual.bodyFat?.percentage, 21.7);
  assert.equal(actual.bodyFat?.method, 'rfm');
}

function assertDeltasRequireComparableSnapshots(): void {
  assert.equal(
    buildComparableCompositionDelta(
      { value: 21.7, method: 'rfm', precisionLevel: 3 },
      { value: 22.2, method: 'rfm', precisionLevel: 3 },
    ),
    -0.5,
  );
  assert.equal(
    buildComparableCompositionDelta(
      { value: 21.7, method: 'rfm', precisionLevel: 3 },
      { value: 22.2, method: 'cun_bae', precisionLevel: 3 },
    ),
    null,
  );
  assert.equal(buildComparableCompositionDelta(null, { value: 22.2, method: 'rfm', precisionLevel: 3 }), null);
}

function assertPersistedHistoryOwnsCompositionDeltas(): void {
  const actual = buildCompositionDeltas([
    {
      calculated_for_date: '2026-07-13',
      bmi: 24,
      bodyfat_percent: 21.7,
      bodyfat_method: 'rfm',
      bodyfat_precision_level: 3,
      muscle_percent: 43.9,
      muscle_method: 'al_gindan',
      muscle_precision_level: 3,
    },
    {
      calculated_for_date: '2026-07-12',
      bmi: 24.2,
      bodyfat_percent: 22.2,
      bodyfat_method: 'rfm',
      bodyfat_precision_level: 3,
      muscle_percent: 43.4,
      muscle_method: 'al_gindan',
      muscle_precision_level: 3,
    },
  ]);

  assert.deepEqual(actual, {
    bmi: -0.2,
    bodyFat: -0.5,
    muscle: 0.5,
    bodyFatMethodChanged: false,
    muscleMethodChanged: false,
  });
}

assertNullSnapshotsDoNotReviveFallback();
assertPersistedMetricsStillWinIndividually();
assertStaleSnapshotsNeverOverrideRecalculation();
assertDeltasRequireComparableSnapshots();
assertPersistedHistoryOwnsCompositionDeltas();

const weightless = mergePersistedCompositionResult(
  {
    ...partialPersisted,
    weight_kg_used: null,
    bodyfat_percent: 24,
    bodyfat_method: 'rfm',
    bodyfat_precision_level: 3,
    bodyfat_inputs: ['height', 'sex', 'waist'],
  },
  fallback,
  'male',
);
assert.equal(weightless.bodyFat?.percentage, 24);
assert.deepEqual(weightless.bodyFat?.inputsUsed, ['height', 'sex', 'waist']);
assert.equal(weightless.fatMassKg, null);
assert.equal(weightless.leanMassKg, null);
assert.equal(weightless.residualMassKg, null);
const sexless = mergePersistedCompositionResult(
  { ...partialPersisted, bodyfat_percent: 24, bodyfat_method: 'bai' },
  fallback,
);
assert.equal(sexless.bodyFat?.percentage, 24);
assert.equal(sexless.bodyFat?.category, null);
console.log('Composition snapshot authoritative nulls, compatible masses, and deltas passed');
