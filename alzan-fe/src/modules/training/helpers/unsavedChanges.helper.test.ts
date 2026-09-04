import assert from 'node:assert/strict';
import { hasUnsavedChanges, serializeEditableState } from './unsavedChanges.helper';

const initialState = serializeEditableState({ name: 'Morning run', steps: [{ id: 'step-1', order: 0 }] });

assert.equal(hasUnsavedChanges(initialState, initialState), false);
assert.equal(
  hasUnsavedChanges(initialState, serializeEditableState({ name: 'Evening run', steps: [{ id: 'step-1', order: 0 }] })),
  true,
);
assert.equal(hasUnsavedChanges(null, initialState), false);

console.log('unsaved changes helper tests passed');
