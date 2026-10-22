import { strict as assert } from 'assert';
import { hasCalculatedCompositionValues, hasBodyCompositionChanged } from './bodyCompositionRefresh';
import type { CompositionSnapshotForComparison } from './bodyCompositionRefresh';

const currentSnapshot: CompositionSnapshotForComparison = {
  calculated_for_date: '2026-10-22',
  input_revision: 3,
  calculation_version: 2,
  calculation_status: 'complete',
  input_snapshot: { weightKg: 73.6, heightCm: 175, asOf: '2026-10-22T10:00:00.000Z' },
  bmi: 24,
  bodyfat_percent: 20,
  bodyfat_method: 'rfm',
  bodyfat_formula: 'RFM',
  bodyfat_precision_level: 3,
  muscle_mass_kg: 31,
  muscle_percent: 43,
  muscle_method: 'al_gindan',
  muscle_formula: 'Al-Gindan',
  muscle_precision_level: 3,
  source_weight_log_id: 'weight-1',
  weight_kg_used: 73.6,
  waist_to_height_ratio: 0.47,
  waist_to_hip_ratio: 0.88,
};

function assertAnUnchangedRefreshIsRecognized(): void {
  assert.equal(hasBodyCompositionChanged([currentSnapshot], [{ ...currentSnapshot }]), false);
  assert.equal(
    hasBodyCompositionChanged(
      [currentSnapshot],
      [{ ...currentSnapshot, input_snapshot: { weightKg: 73.6, heightCm: 175, asOf: '2026-10-22T10:01:00.000Z' } }],
    ),
    false,
  );
}

function assertNewInputsOrFormulaAreRecognized(): void {
  assert.equal(hasBodyCompositionChanged([currentSnapshot], [{ ...currentSnapshot, input_revision: 4 }]), true);
  assert.equal(hasBodyCompositionChanged([currentSnapshot], [{ ...currentSnapshot, calculation_version: 3 }]), true);
  assert.equal(hasBodyCompositionChanged([currentSnapshot], [{ ...currentSnapshot, bmi: 25 }]), true);
}

function assertNoCalculationIsNotReportedAsCurrent(): void {
  const noValues = {
    ...currentSnapshot,
    bmi: null,
    bodyfat_percent: null,
    muscle_percent: null,
    waist_to_height_ratio: null,
    waist_to_hip_ratio: null,
  };
  assert.equal(hasCalculatedCompositionValues([noValues]), false);
  assert.equal(hasCalculatedCompositionValues([currentSnapshot]), true);
  assert.equal(hasCalculatedCompositionValues(undefined), false);
}

assertAnUnchangedRefreshIsRecognized();
assertNewInputsOrFormulaAreRecognized();
assertNoCalculationIsNotReportedAsCurrent();
console.log('Body composition manual refresh result checks passed');
