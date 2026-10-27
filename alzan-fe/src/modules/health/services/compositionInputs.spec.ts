import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '../../../types/requests.types';
import { loadLatestCompositionInputs, type CompositionMeasurementRow } from './compositionInputs';
import {
  BODY_COMPOSITION_VERSION,
  needsCompositionRepair,
  isCurrentCompositionSnapshot,
} from '../helpers/compositionVersion';

type FixtureRow = Record<string, string | number | null>;
const main = async () => {
  const measurement = (
    id: string,
    measurement_type: CompositionMeasurementRow['measurement_type'],
    value_cm: number,
    measurement_protocol: string | null,
    measured_at = '2025-01-01T00:00:00Z',
  ): FixtureRow => ({ id, user_id: 'alice', measurement_type, value_cm, measurement_protocol, measured_at });
  const rows: FixtureRow[] = Array.from({ length: 1200 }, (_, index) =>
    measurement(`chest-${index}`, 'chest', 100, null, new Date(Date.UTC(2026, 9, 1, 0, index)).toISOString()),
  );
  rows.push(measurement('old-waist', 'waist', 90, 'waist_iliac_crest'));
  rows.push(measurement('invalid-waist', 'waist', 201, 'waist_iliac_crest', '2026-10-02T00:00:00Z'));
  rows.push(measurement('too-small', 'waist', 39, 'waist_iliac_crest', '2026-10-03T00:00:00Z'));
  rows.push(measurement('wrong-waist', 'waist', 80, 'waist_narrowest', '2026-10-04T00:00:00Z'));
  rows.push(measurement('future', 'waist', 85, 'waist_iliac_crest', '2027-01-01T00:00:00Z'));
  rows.push({ ...measurement('other-user', 'waist', 85, 'waist_iliac_crest', '2026-10-05T00:00:00Z'), user_id: 'bob' });
  rows.push(measurement('relaxed', 'arm', 30, 'arm_relaxed_midpoint'));
  rows.push(measurement('flexed-a', 'arm', 35, 'arm_flexed_max'));
  rows.push(measurement('flexed-b', 'arm', 36, 'arm_flexed_max'));
  rows.push(measurement('unknown-arm', 'arm', 40, null, '2026-10-02T00:00:00Z'));
  rows.push(measurement('hips-boundary', 'hips', 50, null));
  const weight = (id: string, weight_kg: number, measured_at: string): FixtureRow => ({
    id,
    weight_kg,
    measured_at,
    user_id: 'alice',
  });
  const weights = [
    weight('weight-a', 80, '2025-01-01T00:00:00Z'),
    weight('weight-b', 81, '2025-01-01T00:00:00Z'),
    weight('invalid', 0, '2026-10-01T00:00:00Z'),
    weight('future', 82, '2027-01-01T00:00:00Z'),
  ];
  const requests: URL[] = [];
  // Exercise the production query builder against a small PostgREST transport double.
  // Filtering/sorting responds only to filters actually present in the outgoing URL.
  const client = createClient<Database>('http://localhost:54321', 'local-test-key', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: async input => {
        const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
        requests.push(url);
        let found = url.pathname.endsWith('/weight_logs') ? [...weights] : [...rows];
        for (const [column, filter] of url.searchParams) {
          if (['select', 'order', 'limit'].includes(column)) continue;
          const separator = filter.indexOf('.');
          const operator = filter.slice(0, separator);
          const literal = filter.slice(separator + 1);
          found = found.filter(row => {
            const value = row[column];
            if (operator === 'eq') return String(value) === literal;
            const expected = typeof value === 'number' ? Number(literal) : literal;
            if (value === null) return false;
            if (operator === 'gte') return value >= expected;
            if (operator === 'lte') return value <= expected;
            if (operator === 'gt') return value > expected;
            if (operator === 'lt') return value < expected;
            throw new Error(`Unsupported filter ${filter}`);
          });
        }
        const order = (url.searchParams.get('order') ?? '').split(',').filter(Boolean);
        found.sort((a, b) => {
          for (const ordering of order) {
            const [column, direction] = ordering.split('.');
            const difference = String(a[column]).localeCompare(String(b[column]));
            if (difference) return direction === 'desc' ? -difference : difference;
          }
          return 0;
        });
        return Response.json(found.slice(0, Number(url.searchParams.get('limit') ?? found.length)));
      },
    },
  });
  const result = await loadLatestCompositionInputs(
    client,
    'alice',
    '2026-10-28T00:00:00Z',
    new AbortController().signal,
  );
  assert.equal(requests.length, 8);
  assert.ok(requests.every(url => url.searchParams.get('limit') === '1'));
  assert.ok(requests.every(url => url.searchParams.get('order') === 'measured_at.desc,id.desc'));
  assert.equal(result.measurements.find(value => value.measurement_type === 'waist')?.id, 'old-waist');
  assert.equal(result.measurements.find(value => value.measurement_type === 'hips')?.id, 'hips-boundary');
  assert.deepEqual(
    result.measurements
      .filter(value => value.measurement_type === 'arm')
      .map(value => value.id)
      .sort(),
    ['flexed-b', 'relaxed'],
  );
  assert.deepEqual(
    result.weights.map(value => value.id),
    ['weight-b'],
  );
  assert.ok(result.measurements.length <= 7);
  assert.equal(BODY_COMPOSITION_VERSION, 5);
  const old = { calculation_version: 4, calculation_status: 'partial' };
  assert.equal(needsCompositionRepair(old), true);
  assert.equal(isCurrentCompositionSnapshot(old), false);
  assert.equal(needsCompositionRepair({ ...old, calculation_version: 5 }), false);
  assert.equal(isCurrentCompositionSnapshot({ ...old, calculation_version: 5 }), true);
  assert.equal(needsCompositionRepair({ ...old, calculation_version: 5, calculation_status: 'stale' }), true);
  console.log('Composition bounded queries, historical validity, protocols, ties and version upgrade passed');
};
void main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
