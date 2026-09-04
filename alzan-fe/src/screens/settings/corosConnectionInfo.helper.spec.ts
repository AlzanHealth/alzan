import assert from 'node:assert/strict';
import { getCorosConnectionInfo } from './corosConnectionInfo.helper';

const info = getCorosConnectionInfo();

assert.equal(info.dataFlow, 'COROS → Alzan');
assert.equal(info.location, 'Ajustes → Integraciones → COROS');
assert.equal(info.localCallback, 'http://localhost:1111/oauth/coros/callback');
assert.equal(info.productionCallback, 'https://api.alzanhealth.com/oauth/coros/callback');

console.log('corosConnectionInfo.helper.spec.ts: all assertions passed');
