import assert from 'node:assert/strict';
import { finishTemplateSave, startTemplateSave } from './templateSaveFlow.helper';

const saveLock = { current: false };

assert.equal(startTemplateSave(saveLock), true, 'the first save should acquire the lock');
assert.equal(startTemplateSave(saveLock), false, 'a repeated save should be ignored while the first is active');
finishTemplateSave(saveLock);
assert.equal(startTemplateSave(saveLock), true, 'a new save should be allowed after the first flow finishes');

console.log('template save flow helper tests passed');
