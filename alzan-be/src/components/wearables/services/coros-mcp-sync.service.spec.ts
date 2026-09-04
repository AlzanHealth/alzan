import { strict as assert } from 'assert';
import { ConfigService } from '@nestjs/config';
import { CorosMcpOAuthService } from '../../providers/oauth/coros-mcp-oauth.service';
import { CorosMcpClient, CorosMcpTool } from './coros-mcp.client';
import { CorosMcpSyncService } from './coros-mcp-sync.service';

const savedStates: Array<Record<string, unknown>> = [];
const importedActivities: Array<Record<string, unknown>> = [];
const failedActivities: string[] = [];
let activityClaimCount = 0;
let finishedJob: Record<string, unknown> | null = null;
let savedState: Record<string, unknown> | null = null;
let fitDownloadCount = 0;

function createQuery(data: unknown = null): Record<string, unknown> {
  const query: Record<string, unknown> = {
    select: () => query,
    eq: () => query,
    is: () => query,
    update: () => query,
    insert: async () => ({ data: null, error: null }),
    upsert: async () => ({ data: null, error: null }),
    maybeSingle: async () => ({ data, error: null }),
  };
  return query;
}

const supabase = {
  client: {
    from: (table: string) => {
      if (table === 'integration_sync_state') {
        return createQuery(savedState ? { metadata: savedState.metadata } : null);
      }
      if (table === 'user_preferences') return createQuery(null);
      if (table === 'user_connections') return createQuery(null);
      throw new Error(`Unexpected table ${table}`);
    },
    rpc: async (_name: string, args: Record<string, unknown>) => {
      if (_name === 'upsert_integration_sync_state') savedStates.push(args);
      return { data: null, error: null };
    },
  },
};

const config = {
  get: (key: string) => {
    const values: Record<string, string> = {
      COROS_MCP_BACKFILL_START_DATE: new Date().toISOString().slice(0, 10),
      COROS_MCP_BACKFILL_WINDOW_DAYS: '30',
      COROS_MCP_WINDOWS_PER_SYNC: '10',
    };
    return values[key];
  },
};

const tools: CorosMcpTool[] = [
  { name: 'querySportRecords', inputSchema: { properties: { startDate: {}, endDate: {} } } },
  { name: 'getActivityDetail', inputSchema: { properties: { activityId: {} } } },
  { name: 'queryActivityLapData', inputSchema: { properties: { activityId: {} } } },
  { name: 'queryActivityFitFileDownloadUrls', inputSchema: { properties: { activityId: {} } } },
];

const client = {
  listTools: async () => tools,
  callTool: async <T>(name: string, args: Record<string, unknown>) => {
    if (name === 'querySportRecords') {
      assert.equal(typeof args.startDate, 'string');
      assert.equal(typeof args.endDate, 'string');
      return {
        activities: [
          {
            activityId: 'mcp-activity-1',
            mode: 8,
            subMode: 1,
            startTime: args.startDate,
            duration: 600,
            distance: 1000,
          },
        ],
      } as T;
    }
    if (name === 'getActivityDetail') return { activityId: args.activityId, duration: 605, distance: 1010 } as T;
    if (name === 'queryActivityFitFileDownloadUrls') return { urls: ['https://api.coros.com/a.fit'] } as T;
    return { laps: [{ lapIndex: 1, duration: 605, distance: 1010 }] } as T;
  },
  downloadFitFile: async () => {
    fitDownloadCount += 1;
    return Uint8Array.from([1, 2, 3]);
  },
} as unknown as CorosMcpClient;

const lifecycle = {
  claimSyncJob: async () => ({
    action: 'acquired' as const,
    jobId: 'job-1',
    leaseToken: 'lease-1',
    leaseExpiresAt: '',
  }),
  finishSyncJob: async (value: Record<string, unknown>) => {
    finishedJob = value;
  },
  renewSyncJob: async () => undefined,
  claimActivity: async () => {
    activityClaimCount += 1;
    return { action: 'import' as const, importId: `import-${activityClaimCount}`, sessionId: null };
  },
  failActivity: async (id: string) => {
    failedActivities.push(id);
  },
};

const service = new CorosMcpSyncService(
  config as unknown as ConfigService,
  supabase as never,
  { storeRawPayload: async () => ({ id: null, payloadHash: 'hash' }) } as never,
  {
    saveState: async (value: Record<string, unknown>) => {
      savedState = value;
      savedStates.push(value);
    },
  } as never,
  {
    upsertActivity: async (value: { activity: Record<string, unknown> }) => importedActivities.push(value.activity),
  } as never,
  {} as never,
  lifecycle as never,
  {
    isUserAllowed: () => true,
    getMcpClient: async () => client,
  } as unknown as CorosMcpOAuthService,
);

async function run(): Promise<void> {
  const result = await service.sync('user-1');
  assert.equal(result.status, 'partial');
  assert.equal(result.activitiesImported, 1);
  assert.equal(result.activitiesSkipped, 0);
  assert.equal(result.activitiesFailed, 0);
  assert.equal(result.fitPending, 1);
  assert.equal(result.backfillComplete, true);
  assert.equal(importedActivities.length, 1);
  assert.equal(importedActivities[0].providerActivityId, 'mcp-activity-1');
  assert.equal(activityClaimCount, 1);
  assert.equal(fitDownloadCount, 1);
  assert.equal(failedActivities.length, 0);
  assert.equal(savedStates.length, 1);
  assert.equal(finishedJob?.status, 'partial');
  assert.equal((savedState?.metadata as { fitDownloadsToday?: unknown }).fitDownloadsToday, 1);

  const retryResult = await service.sync('user-1');
  assert.equal(retryResult.activitiesImported, 1);
  assert.equal(retryResult.fitPending, 1);
  assert.equal(activityClaimCount, 1);
  assert.equal(fitDownloadCount, 2);
}

void run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
