import { strict as assert } from 'assert';
import {
  buildCorosMcpDateWindows,
  buildCorosMcpToolArguments,
  extractCorosMcpActivityPage,
  extractCorosMcpFitBytes,
  extractCorosMcpFitUrls,
  extractCorosMcpRecords,
  mergeCorosMcpActivityPayload,
  uniqueCorosMcpRecords,
} from './coros-mcp-sync.helpers';

function assertBackfillWindowsAreInclusiveAndNonOverlapping(): void {
  assert.deepEqual(
    buildCorosMcpDateWindows(new Date('2026-01-01T00:00:00.000Z'), new Date('2026-02-15T00:00:00.000Z'), 30),
    [
      { startDate: '2026-01-01', endDate: '2026-01-30' },
      { startDate: '2026-01-31', endDate: '2026-02-15' },
    ],
  );
}

function assertMcpContentIsUnwrappedIntoRecords(): void {
  assert.deepEqual(
    extractCorosMcpRecords({
      result: {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ activities: [{ activityId: 'a-1' }, { activityId: 'a-2' }] }),
          },
        ],
      },
    }),
    [{ activityId: 'a-1' }, { activityId: 'a-2' }],
  );
}

function assertRecordsAreDeduplicatedByCorosActivityIdAndSortedNewestFirst(): void {
  const records = uniqueCorosMcpRecords([
    { activityId: 'a-1', startTime: '2026-01-01T10:00:00Z' },
    { activityId: 'a-2', startTime: '2026-01-03T10:00:00Z' },
    { activityId: 'a-1', startTime: '2026-01-01T10:00:00Z' },
  ]);
  assert.deepEqual(
    records.map(record => record.activityId),
    ['a-2', 'a-1'],
  );
}

assertBackfillWindowsAreInclusiveAndNonOverlapping();
assertMcpContentIsUnwrappedIntoRecords();
assertRecordsAreDeduplicatedByCorosActivityIdAndSortedNewestFirst();

assert.deepEqual(
  buildCorosMcpToolArguments(
    { name: 'querySportRecords', inputSchema: { properties: { start_date: {}, end_date: {}, pageToken: {} } } },
    { startDate: '2026-01-01', endDate: '2026-01-30', cursor: 'next' },
  ),
  { start_date: '2026-01-01', end_date: '2026-01-30', pageToken: 'next' },
);
assert.deepEqual(
  extractCorosMcpActivityPage({ activities: [{ activityId: 'a-1' }], hasMore: true, nextCursor: 'next' }),
  { records: [{ activityId: 'a-1' }], hasMore: true, nextCursor: 'next' },
);
assert.deepEqual(
  mergeCorosMcpActivityPayload(
    { activityId: 'a-1', startTime: '2026-01-01T10:00:00Z', distance: 10 },
    { duration: 3600, distance: 11 },
    { laps: [{ lap: 1 }] },
  ),
  { activityId: 'a-1', startTime: '2026-01-01T10:00:00Z', distance: 11, duration: 3600, laps: [{ lap: 1 }] },
);
assert.equal(extractCorosMcpFitBytes({ fitFile: Buffer.from('fit').toString('base64') })?.length, 3);
assert.deepEqual(
  extractCorosMcpFitUrls({
    result: { content: [{ type: 'resource', resource: { uri: 'https://api.coros.com/a.fit' } }] },
  }),
  ['https://api.coros.com/a.fit'],
);
assert.equal(extractCorosMcpFitBytes({ fitUrl: 'https://api.coros.com/a.fit' }), null);
assert.equal(
  extractCorosMcpFitBytes({
    content: [{ type: 'resource', resource: { blob: Buffer.from('fit').toString('base64') } }],
  })?.length,
  3,
);
