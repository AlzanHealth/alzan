import { strict as assert } from 'assert';
import { buildCorosHistoricalSourceRecordId, isLikelyCorosHistoricalDuplicate } from './coros-history-import.utils';

assert.equal(buildCorosHistoricalSourceRecordId('activity-1', 'ignored-hash'), 'activity-1');
assert.equal(buildCorosHistoricalSourceRecordId(null, 'sha256:abc123'), 'fit:sha256:abc123');
assert.equal(buildCorosHistoricalSourceRecordId('', 'sha256:def456'), 'fit:sha256:def456');

assert.equal(
  isLikelyCorosHistoricalDuplicate({
    candidateStartedAt: '2026-05-01T08:00:00.000Z',
    candidateDurationSeconds: 3600,
    candidateDistanceM: 10_000,
    existingStartedAt: '2026-05-01T08:04:00.000Z',
    existingDurationSeconds: 3660,
    existingDistanceM: 10_100,
  }),
  true,
);
assert.equal(
  isLikelyCorosHistoricalDuplicate({
    candidateStartedAt: '2026-05-01T08:00:00.000Z',
    candidateDurationSeconds: 3600,
    candidateDistanceM: 10_000,
    existingStartedAt: '2026-05-01T08:06:00.000Z',
    existingDurationSeconds: 3600,
    existingDistanceM: 10_000,
  }),
  false,
);

console.log('coros-history-import.utils.spec.ts: all assertions passed');
