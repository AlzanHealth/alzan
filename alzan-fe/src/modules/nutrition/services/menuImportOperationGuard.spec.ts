import assert from 'node:assert/strict';

import { isMenuImportOperationBlocked } from './menuImportOperationGuard';

assert.equal(
  isMenuImportOperationBlocked(false, true),
  true,
  'an active analysis must synchronously block menu import',
);

assert.equal(isMenuImportOperationBlocked(true, false), true);
assert.equal(isMenuImportOperationBlocked(false, false), false);

console.log('menuImportOperationGuard: all assertions passed');
