import assert from 'node:assert/strict';
import { getConnectedAppsContentBottomPadding } from './connectedAppsLayout.helper';

assert.equal(getConnectedAppsContentBottomPadding(95, 24), 119);
assert.equal(getConnectedAppsContentBottomPadding(0, 24), 24);
assert.equal(getConnectedAppsContentBottomPadding(-10, 24), 24);

console.log('connectedAppsLayout.helper.spec.ts: all assertions passed');
