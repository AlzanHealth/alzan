import assert from 'node:assert/strict';
import { buildBodyChanges } from './bodyChanges';
import type { DailyCompositionPlannerInput } from './bodyCompositionDailyPlanner';
const input: DailyCompositionPlannerInput = {
  targetDate: new Date('2026-10-22T12:00:00Z'),
  now: new Date('2026-10-22T12:00:00Z'),
  profile: { heightCm: 180, age: 30, sex: 'male' },
  weights: [
    { id: 'new', measuredAt: '2026-10-22T10:00:00Z', weightKg: 79 },
    { id: 'old', measuredAt: '2026-10-12T10:00:00Z', weightKg: 80 },
  ],
  measurements: [
    { type: 'arm', protocol: 'arm_relaxed_midpoint', valueCm: 35, measuredAt: '2026-10-22T10:00:00Z' },
    { type: 'arm', protocol: 'arm_flexed_max', valueCm: 38, measuredAt: '2026-10-12T10:00:00Z' },
    { type: 'abdomen', protocol: 'abdomen_navel', valueCm: 85, measuredAt: '2026-10-22T10:00:00Z' },
    { type: 'abdomen', protocol: 'abdomen_navel', valueCm: 86, measuredAt: '2026-10-12T10:00:00Z' },
  ],
};
const comparison = buildBodyChanges(input);
assert.ok(comparison);
assert.deepEqual(
  comparison.changes.map(row => row.key),
  ['weight', 'abdomen'],
);
assert.equal(comparison.changes[0].difference, -1);
assert.equal(
  buildBodyChanges({
    ...input,
    weights: input.weights.slice(0, 1),
    measurements: input.measurements.filter(row => row.measuredAt.startsWith('2026-10-22')),
  }),
  null,
);
const lastKnownChanges = buildBodyChanges({
  ...input,
  targetDate: new Date('2026-11-22T12:00:00Z'),
  now: new Date('2026-11-22T12:00:00Z'),
});
assert.ok(lastKnownChanges);
assert.deepEqual(
  lastKnownChanges.changes.map(row => row.key),
  ['weight', 'abdomen'],
);
assert.equal(lastKnownChanges.previousDate, '2026-10-12T10:00:00.000Z');
console.log('Body change comparison checks passed');
