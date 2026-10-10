import { strict as assert } from 'assert';
import axios from 'axios';
import { CanonicalHealthWriterService } from './canonical-health-writer.service';
import { SuuntoHealthSyncService } from './suunto-health-sync.service';

async function assertMissingPartnerAccessDoesNotClaimJob(): Promise<void> {
  let claimCalls = 0;
  let savedError = '';
  const service = new SuuntoHealthSyncService(
    { get: () => undefined } as never,
    {} as never,
    {} as never,
    {
      getCursor: async () => null,
      markFailed: async (_identity: unknown, code: string) => {
        savedError = code;
      },
    } as never,
    {
      claimSyncJob: async () => {
        claimCalls += 1;
      },
    } as never,
  );
  const result = await service.sync('user-1');
  assert.equal(result.status, 'unavailable');
  assert.equal(result.errorCode, 'SUUNTO_247_API_NOT_CONFIGURED');
  assert.equal(savedError, 'SUUNTO_247_API_NOT_CONFIGURED');
  assert.equal(claimCalls, 0);
}

async function assertHealthSyncUsesIndependentDomainAndMapsPayloads(): Promise<void> {
  const originalGet = axios.get;
  const claims: Array<Record<string, unknown>> = [];
  const savedStates: Array<Record<string, unknown>> = [];
  const metricRows: Array<Record<string, unknown>> = [];
  let dailyCount = 0;
  let dailySteps = 0;
  let dailyCalories = 0;
  let sleepCount = 0;
  let recoveryCount = 0;
  const savedSleeps: Array<Record<string, unknown>> = [];
  const savedRecoveries: Array<Record<string, unknown>> = [];
  const endpointCalls = new Map<string, number>();
  axios.get = (async (url: string) => {
    const call = (endpointCalls.get(url) ?? 0) + 1;
    endpointCalls.set(url, call);
    if (call > 1) return { data: [] } as never;
    if (url.endsWith('/activity'))
      return {
        data: [
          {
            timestamp: '2026-09-10T12:00:00Z',
            entryData: { HR: 80, HRV: 44, SpO2: 0.98, StepCount: 8500, EnergyConsumption: 9000 },
          },
          {
            timestamp: '2026-09-10T12:10:00Z',
            entryData: { HR: 75, StepCount: 100, EnergyConsumption: 4000 },
          },
          {
            timestamp: '2026-09-10T12:20:00Z',
            entryData: { HR: 350, HRV: -2, SpO2: 1.2, StepCount: -40, EnergyConsumption: -100 },
          },
        ],
      } as never;
    if (url.endsWith('/sleep'))
      return {
        data: [
          {
            timestamp: '2026-09-10T03:00:00Z',
            entryData: {
              SleepId: 123,
              BedtimeStart: '2026-09-09T23:00:00+02:00',
              BedtimeEnd: '2026-09-10T07:00:00+02:00',
              Duration: 25200,
              HRAvg: 47,
              HRMin: 42,
              AvgHRV: 52,
              MaxSpo2: 0.99,
            },
          },
        ],
      } as never;
    return { data: [{ timestamp: '2026-09-10T07:00:00Z', entryData: { Balance: 0.72, StressState: 2 } }] } as never;
  }) as typeof axios.get;
  try {
    const service = new SuuntoHealthSyncService(
      {
        get: (key: string) =>
          key === 'SUUNTO_247_ENABLED' ? 'true' : key === 'SUUNTO_247_SUBSCRIPTION_KEY' ? 'health-key' : undefined,
      } as never,
      { getHealthAccessToken: async () => 'token' } as never,
      {
        replaceHealthMetricSamples: async (input: { rows: Array<Record<string, unknown>> }) => {
          metricRows.push(...input.rows);
          return input.rows.length;
        },
        upsertDailyActivity: async (input: { dailyActivity: { totalSteps: number; caloriesKcal: number } }) => {
          dailyCount += 1;
          dailySteps = input.dailyActivity.totalSteps;
          dailyCalories = input.dailyActivity.caloriesKcal;
        },
        upsertSleep: async (input: { sleep: Record<string, unknown> }) => {
          sleepCount += 1;
          savedSleeps.push(input.sleep);
        },
        upsertRecovery: async (input: { recovery: Record<string, unknown> }) => {
          recoveryCount += 1;
          savedRecoveries.push(input.recovery);
        },
      } as never,
      {
        getCursor: async () => null,
        saveState: async (input: Record<string, unknown>) => {
          savedStates.push(input);
        },
        markFailed: async () => undefined,
      } as never,
      {
        claimSyncJob: async (input: Record<string, unknown>) => {
          claims.push(input);
          return { action: 'claimed', jobId: 'job', leaseToken: 'lease' };
        },
        finishSyncJob: async () => undefined,
      } as never,
    );
    const result = await service.sync('user-1');
    assert.equal(result.status, 'success');
    assert.equal(claims[0].syncDomain, 'health_metrics');
    assert.equal(dailyCount, 1);
    assert.equal(dailySteps, 8600);
    assert.ok(Math.abs(dailyCalories - 13000 / 4184) < 0.001);
    assert.equal(sleepCount, 1);
    assert.equal(savedSleeps[0]?.totalSleepMin, 420);
    assert.equal(savedSleeps[0]?.avgHeartRateBpm, 47);
    assert.equal(savedSleeps[0]?.minHeartRateBpm, 42);
    assert.equal(savedSleeps[0]?.avgHrvMs, 52);
    assert.equal(savedSleeps[0]?.maxSpo2Pct, 99);
    assert.equal((savedSleeps[0]?.healthSamples as Array<Record<string, unknown>>).length, 4);
    assert.equal(recoveryCount, 1);
    assert.equal(savedRecoveries[0]?.balance, 0.72);
    assert.equal(savedRecoveries[0]?.stressState, 2);
    assert.ok(metricRows.some(row => row.metric_type === 'heart_rate' && row.value === 80));
    assert.ok(metricRows.some(row => row.metric_type === 'spo2' && row.value === 98 && row.unit === '%'));
    assert.ok(metricRows.some(row => row.metric_type === 'recovery_balance' && row.value === 0.72));
    assert.equal(metricRows.length, 6);
    assert.equal(savedStates[0].syncDomain, 'health_metrics');
  } finally {
    axios.get = originalGet;
  }
}

async function assertHealthFailureIsPartial(): Promise<void> {
  const originalGet = axios.get;
  let markedError = '';
  axios.get = (async () => {
    throw Object.assign(new Error('forbidden'), { isAxiosError: true, response: { status: 403 } });
  }) as typeof axios.get;
  try {
    const service = new SuuntoHealthSyncService(
      {
        get: (key: string) =>
          key === 'SUUNTO_247_ENABLED' ? 'true' : key === 'SUUNTO_SUBSCRIPTION_KEY' ? 'key' : undefined,
      } as never,
      { getHealthAccessToken: async () => 'token' } as never,
      {} as never,
      {
        getCursor: async () => null,
        markFailed: async (_identity: unknown, code: string) => {
          markedError = code;
        },
      } as never,
      {
        claimSyncJob: async () => ({ action: 'claimed', jobId: 'job', leaseToken: 'lease' }),
        finishSyncJob: async () => undefined,
      } as never,
    );
    const result = await service.sync('user-1');
    assert.equal(result.status, 'partial');
    assert.equal(result.errorCode, 'SUUNTO_247_ACCESS_DENIED');
    assert.equal(markedError, 'SUUNTO_247_ACCESS_DENIED');
  } finally {
    axios.get = originalGet;
  }
}

async function assertBatchMetricWritesAreIdempotent(): Promise<void> {
  const existingIds = new Set<string>(['heart_rate:existing']);
  const inserted: Array<Record<string, unknown>> = [];
  const client = {
    from: () => {
      const query = {
        select: () => query,
        eq: () => query,
        gte: () => query,
        lt: () => query,
        range: async () => ({ data: [...existingIds].map(source_record_id => ({ source_record_id })), error: null }),
        insert: async (rows: Array<Record<string, unknown>>) => {
          inserted.push(...rows);
          rows.forEach(row => existingIds.add(String(row.source_record_id)));
          return { error: null };
        },
      };
      return query;
    },
  };
  const writer = new CanonicalHealthWriterService({ client } as never, {} as never);
  const rows = [{ source_record_id: 'heart_rate:existing' }, { source_record_id: 'heart_rate:new' }] as never;
  const input = {
    userId: 'user-1',
    provider: 'suunto',
    sourceChannel: 'cloud',
    from: '2026-09-01T00:00:00.000Z',
    to: '2026-10-01T00:00:00.000Z',
    rows,
  } as never;
  assert.equal(await writer.replaceHealthMetricSamples(input), 1);
  assert.equal(await writer.replaceHealthMetricSamples(input), 0);
  assert.deepEqual(
    inserted.map(row => row.source_record_id),
    ['heart_rate:new'],
  );
}

void (async () => {
  await assertMissingPartnerAccessDoesNotClaimJob();
  await assertHealthSyncUsesIndependentDomainAndMapsPayloads();
  await assertHealthFailureIsPartial();
  await assertBatchMetricWritesAreIdempotent();
})();
