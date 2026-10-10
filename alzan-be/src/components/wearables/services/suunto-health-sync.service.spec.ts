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
        isSyncCancellationRequested: async () => false,
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
        isSyncCancellationRequested: async () => false,
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
        is: () => query,
        gte: () => query,
        lt: () => query,
        order: () => query,
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

async function assertCorrectedSampleUpdatesWithoutChangingOtherOwners(): Promise<void> {
  const recordedAt = '2026-09-10T12:00:00.000Z';
  const sourceRecordId = `heart_rate:${recordedAt}`;
  const stored = [
    {
      id: 'own',
      user_id: 'user-1',
      provider: 'suunto',
      source_channel: 'cloud',
      source_package: null,
      source_record_id: sourceRecordId,
      recorded_at: recordedAt,
      value: 70,
      unit: 'bpm',
      local_date: '2026-09-10',
      timezone: 'UTC',
      raw_payload: { HR: 70 },
    },
    {
      id: 'other-user',
      user_id: 'user-2',
      provider: 'suunto',
      source_channel: 'cloud',
      source_package: null,
      source_record_id: sourceRecordId,
      recorded_at: recordedAt,
      value: 90,
      unit: 'bpm',
      local_date: '2026-09-10',
      timezone: 'UTC',
      raw_payload: { HR: 90 },
    },
    {
      id: 'other-provider',
      user_id: 'user-1',
      provider: 'garmin',
      source_channel: 'cloud',
      source_package: null,
      source_record_id: sourceRecordId,
      recorded_at: recordedAt,
      value: 100,
      unit: 'bpm',
      local_date: '2026-09-10',
      timezone: 'UTC',
      raw_payload: { HR: 100 },
    },
    {
      id: 'other-package',
      user_id: 'user-1',
      provider: 'suunto',
      source_channel: 'cloud',
      source_package: 'other-app',
      source_record_id: sourceRecordId,
      recorded_at: recordedAt,
      value: 110,
      unit: 'bpm',
      local_date: '2026-09-10',
      timezone: 'UTC',
      raw_payload: { HR: 110 },
    },
  ];
  let updates = 0;
  let inserts = 0;
  const client = {
    from: () => {
      const filters = new Map<string, unknown>();
      const query = {
        select: () => query,
        eq: (column: string, value: unknown) => {
          filters.set(column, value);
          return query;
        },
        is: (column: string, value: unknown) => {
          filters.set(column, value);
          return query;
        },
        gte: () => query,
        lt: () => query,
        order: () => query,
        range: async () => ({
          data: stored.filter(row => [...filters].every(([key, value]) => row[key as keyof typeof row] === value)),
          error: null,
        }),
        update: (patch: Record<string, unknown>) => {
          const updateFilters = new Map<string, unknown>();
          const updateQuery = {
            eq: (column: string, value: unknown) => {
              updateFilters.set(column, value);
              return updateQuery;
            },
            is: (column: string, value: unknown) => {
              updateFilters.set(column, value);
              return updateQuery;
            },
            then: (resolve: (result: { error: null }) => void) => {
              const target = stored.find(row =>
                [...updateFilters].every(([key, value]) => row[key as keyof typeof row] === value),
              );
              if (target) Object.assign(target, patch);
              updates += 1;
              resolve({ error: null });
            },
          };
          return updateQuery;
        },
        insert: async () => {
          inserts += 1;
          return { error: null };
        },
      };
      return query;
    },
  };
  const writer = new CanonicalHealthWriterService({ client } as never, {} as never);
  const input = {
    userId: 'user-1',
    provider: 'suunto',
    sourceChannel: 'cloud',
    from: '2026-09-10T00:00:00.000Z',
    to: '2026-09-11T00:00:00.000Z',
    rows: [
      {
        user_id: 'user-1',
        provider: 'suunto',
        source_channel: 'cloud',
        source_record_id: sourceRecordId,
        recorded_at: recordedAt,
        metric_type: 'heart_rate',
        value: 75,
        unit: 'bpm',
        local_date: '2026-09-10',
        timezone: 'UTC',
        raw_payload: { HR: 75 },
      },
    ],
  } as never;
  assert.equal(await writer.replaceHealthMetricSamples(input), 0);
  assert.equal(stored[0].value, 75);
  assert.equal(stored[1].value, 90);
  assert.equal(stored[2].value, 100);
  assert.equal(stored[3].value, 110);
  assert.equal(stored[0].raw_payload.HR, 75);
  assert.equal(updates, 1);
  assert.equal(inserts, 0);
  assert.equal(await writer.replaceHealthMetricSamples(input), 0);
  assert.equal(updates, 1);
  const revised = (input as { rows: Array<{ unit: string; timezone: string }> }).rows[0];
  revised.unit = 'beats/min';
  revised.timezone = 'UTC+02:00';
  assert.equal(await writer.replaceHealthMetricSamples(input), 0);
  assert.equal(stored[0].unit, 'beats/min');
  assert.equal(stored[0].timezone, 'UTC+02:00');
  assert.equal(updates, 2);
  assert.equal(await writer.replaceHealthMetricSamples(input), 0);
  assert.equal(updates, 2);
}

async function assertExistingSamplesUseStablePagination(): Promise<void> {
  const existing = Array.from({ length: 1001 }, (_, index) => ({
    id: `id-${String(index).padStart(4, '0')}`,
    source_record_id: `heart_rate:${new Date(Date.UTC(2026, 8, 10, 0, index)).toISOString()}`,
    value: 70,
    unit: 'bpm',
    recorded_at: new Date(Date.UTC(2026, 8, 10, 0, index)).toISOString(),
    local_date: '2026-09-10',
    timezone: 'UTC',
    raw_payload: null,
  }));
  const ranges: number[] = [];
  let orderedById = false;
  let inserted = 0;
  const client = {
    from: () => {
      const query = {
        select: () => query,
        eq: () => query,
        is: () => query,
        gte: () => query,
        lt: () => query,
        order: (column: string) => {
          orderedById = column === 'id';
          return query;
        },
        range: async (from: number, to: number) => {
          ranges.push(from);
          return { data: existing.slice(from, to + 1), error: null };
        },
        insert: async () => {
          inserted += 1;
          return { error: null };
        },
      };
      return query;
    },
  };
  const writer = new CanonicalHealthWriterService({ client } as never, {} as never);
  const result = await writer.replaceHealthMetricSamples({
    userId: 'user-1',
    provider: 'suunto',
    sourceChannel: 'cloud',
    from: '2026-09-10T00:00:00.000Z',
    to: '2026-09-11T00:00:00.000Z',
    rows: [
      { ...existing[1000], user_id: 'user-1', provider: 'suunto', source_channel: 'cloud', metric_type: 'heart_rate' },
    ],
  } as never);
  assert.equal(result, 0);
  assert.equal(inserted, 0);
  assert.equal(orderedById, true);
  assert.deepEqual(ranges, [0, 1000]);
}

async function assertHealthWriteFailurePreservesCursor(): Promise<void> {
  const originalGet = axios.get;
  axios.get = (async () => ({ data: [] })) as typeof axios.get;
  let savedStates = 0;
  let markedError = '';
  let finishedStatus = '';
  try {
    const service = new SuuntoHealthSyncService(
      {
        get: (key: string) =>
          key === 'SUUNTO_247_ENABLED' ? 'true' : key === 'SUUNTO_247_SUBSCRIPTION_KEY' ? 'key' : undefined,
      } as never,
      { getHealthAccessToken: async () => 'token' } as never,
      {
        replaceHealthMetricSamples: async () => {
          throw new Error('WEARABLE_HEALTH_SAMPLES_UPDATE_FAILED');
        },
      } as never,
      {
        getCursor: async () => '2026-09-10T00:00:00.000Z',
        saveState: async () => {
          savedStates += 1;
        },
        markFailed: async (_identity: unknown, error: string) => {
          markedError = error;
        },
      } as never,
      {
        claimSyncJob: async () => ({ action: 'acquired', jobId: 'job', leaseToken: 'lease' }),
        isSyncCancellationRequested: async () => false,
        finishSyncJob: async ({ status }: { status: string }) => {
          finishedStatus = status;
        },
      } as never,
    );
    const result = await service.sync('user-1');
    assert.equal(result.status, 'partial');
    assert.equal(result.errorCode, 'WEARABLE_HEALTH_SAMPLES_UPDATE_FAILED');
    assert.equal(savedStates, 0);
    assert.equal(markedError, 'WEARABLE_HEALTH_SAMPLES_UPDATE_FAILED');
    assert.equal(finishedStatus, 'error');
  } finally {
    axios.get = originalGet;
  }
}

void (async () => {
  await assertMissingPartnerAccessDoesNotClaimJob();
  await assertHealthSyncUsesIndependentDomainAndMapsPayloads();
  await assertHealthFailureIsPartial();
  await assertBatchMetricWritesAreIdempotent();
  await assertCorrectedSampleUpdatesWithoutChangingOtherOwners();
  await assertExistingSamplesUseStablePagination();
  await assertHealthWriteFailurePreservesCursor();
})();
