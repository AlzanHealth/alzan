import assert from 'node:assert/strict';
import { getSetTableMinWidth, TRAINING_CONTROL_SIZE } from './trainingFormLayout';

assert.equal(TRAINING_CONTROL_SIZE, 44);
assert.equal(getSetTableMinWidth(1), 320);
assert.equal(getSetTableMinWidth(2), 640);
assert.equal(getSetTableMinWidth(0.8), 320);
console.log('Training form layout checks passed');
