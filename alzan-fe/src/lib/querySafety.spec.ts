import assert from 'node:assert/strict';
import { QueryClient } from '@tanstack/react-query';
import { shouldRetryQuery, pollingIntervalAfterError } from './querySafety';

for (const status of [400, 401, 403, 404, 409, 422, 429]) {
  assert.equal(shouldRetryQuery(0, { status }), false);
}
for (const code of ['40001', '42501', '23505', 'PGRST301']) {
  assert.equal(shouldRetryQuery(0, { code }), false, 'database failures must not multiply internal retries');
}
assert.equal(shouldRetryQuery(0, { status: 503 }), true);
assert.equal(shouldRetryQuery(1, { status: 503 }), false);
assert.equal(shouldRetryQuery(0, new TypeError('Failed to fetch')), true);
assert.equal(shouldRetryQuery(1, new TypeError('Failed to fetch')), false);
assert.equal(shouldRetryQuery(0, new Error('Business validation failed')), false);
assert.equal(shouldRetryQuery(0, { status: 503, code: '42501' }), false);
assert.equal(pollingIntervalAfterError(null, 2500), 2500);
assert.equal(pollingIntervalAfterError(new Error('offline'), 2500), false);
assert.equal(pollingIntervalAfterError(null, false), false);
console.log('Query safety: permanent failures, bounded transient retries and polling pauses passed');

const verifyQueryClient = async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: shouldRetryQuery, retryDelay: 0 } } });
  try {
    for (const error of [{ status: 429 }, { code: '42501' }, new Error('invalid input')]) {
      let requests = 0;
      await assert.rejects(
        client.fetchQuery({
          queryKey: ['failure', JSON.stringify(error)],
          queryFn: async () => {
            requests++;
            throw error;
          },
        }),
      );
      assert.equal(requests, 1, 'a permanent failure must not produce a second request');
    }
    let requests = 0;
    const result = await client.fetchQuery({
      queryKey: ['recovery'],
      queryFn: async () => {
        requests++;
        if (requests === 1) throw new TypeError('Failed to fetch');
        return 'recovered';
      },
    });
    assert.equal(result, 'recovered');
    assert.equal(requests, 2);
  } finally {
    client.clear();
  }
  console.log('QueryClient integration: permanent failures stop and transient reads recover once');
};
void verifyQueryClient().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
