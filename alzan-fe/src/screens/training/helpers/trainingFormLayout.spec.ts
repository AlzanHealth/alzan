import assert from 'node:assert/strict';
import { getSetTableLayout, TRAINING_CONTROL_SIZE } from './trainingFormLayout';

assert.equal(TRAINING_CONTROL_SIZE, 44);
assert.deepEqual(getSetTableLayout(320), {
  compact: true,
  cardPaddingHorizontal: 12,
  rowGap: 4,
  rowPaddingHorizontal: 4,
  recordColumnWidth: 48,
});
assert.deepEqual(getSetTableLayout(393), {
  compact: true,
  cardPaddingHorizontal: 16,
  rowGap: 4,
  rowPaddingHorizontal: 4,
  recordColumnWidth: 48,
});
assert.deepEqual(getSetTableLayout(430), {
  compact: false,
  cardPaddingHorizontal: 16,
  rowGap: 8,
  rowPaddingHorizontal: 8,
  recordColumnWidth: 60,
});
console.log('Training form layout checks passed');
