import { strict as assert } from 'assert';
import { resolveActivityLocalDate } from './activity-local-date';

assert.equal(
  resolveActivityLocalDate({ startTime: '2026-01-01T10:30:00Z', timezone: 'Pacific/Kiritimati' }),
  '2026-01-02',
);
assert.equal(
  resolveActivityLocalDate({ startTime: '2026-01-01T10:30:00Z', timezone: 'Pacific/Pago_Pago' }),
  '2025-12-31',
);
assert.equal(resolveActivityLocalDate({ startTime: '2026-03-29T00:30:00Z', timezone: 'Europe/Madrid' }), '2026-03-29');
assert.equal(
  resolveActivityLocalDate({
    startTime: '2026-05-01T23:30:00Z',
    startedAtLocal: '2026-05-01T19:30:00',
    timezone: 'Europe/Madrid',
  }),
  '2026-05-01',
);
assert.equal(resolveActivityLocalDate({ startTime: '2026-05-01T23:30:00Z', timezone: '+02:00' }), '2026-05-02');
