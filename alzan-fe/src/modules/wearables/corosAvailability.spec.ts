import { strict as assert } from 'node:assert';
import { corosAvailability } from './corosAvailability';

assert.equal(corosAvailability({ loading: true, error: false }), 'loading');
assert.equal(
  corosAvailability({ loading: false, error: true, capability: { enabled: true, mode: 'public' } }),
  'error',
);
assert.equal(corosAvailability({ loading: false, error: false }), 'error');
assert.equal(
  corosAvailability({
    loading: false,
    error: false,
    capability: { enabled: false, mode: 'pilot', reason: 'not_configured' },
  }),
  'not_configured',
);
assert.equal(
  corosAvailability({
    loading: false,
    error: false,
    capability: { enabled: false, mode: 'pilot', reason: 'restricted' },
  }),
  'restricted',
);
assert.equal(
  corosAvailability({ loading: false, error: false, capability: { enabled: true, mode: 'public', reason: 'ready' } }),
  'ready',
);
console.log('COROS availability states passed');
assert.equal(
  corosAvailability({ loading: false, error: false, capability: { enabled: false, mode: 'disabled' } }),
  'unavailable',
);
