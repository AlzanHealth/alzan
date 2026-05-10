import { strict as assert } from 'assert';
import { ActivityImportService } from './activity-import.service';
import { RouteImportDetails, RouteImportLap } from './parsers/route-import.parser';
import { ImportedStrengthActivitySummary } from './parsers/strength-activity-import.parser';

interface ActivityImportServicePrivate {
  buildStrengthSessionUpdate(
    summary: ImportedStrengthActivitySummary,
    deviceId: string | null,
  ): Record<string, unknown>;
  replaceStrengthHeartRateZones(
    ctx: FakeUserCtx,
    sessionId: string,
    summary: ImportedStrengthActivitySummary,
  ): Promise<void>;
  replaceStrengthStream(ctx: FakeUserCtx, sessionId: string, summary: ImportedStrengthActivitySummary): Promise<void>;
  resolveRouteTabs(details: RouteImportDetails): Array<{
    splitGroup: 'custom' | 'distance';
    splitDistanceM: number | null;
    laps: RouteImportLap[];
  }>;
}

interface FakeUserCtx {
  user: { id: string };
  supabase: FakeSupabaseClient;
}

interface FakeOperation {
  table: string;
  action: 'delete' | 'insert';
  payload?: unknown;
  filters: Array<{ column: string; value: unknown }>;
}

interface FakeSupabaseClient {
  operations: FakeOperation[];
  from(table: string): FakeTableClient;
}

interface FakeTableClient {
  delete(): FakeFilterBuilder;
  insert(payload: unknown): Promise<{ error: null }>;
}

interface FakeFilterBuilder extends PromiseLike<{ error: null }> {
  eq(column: string, value: unknown): FakeFilterBuilder;
}

const summary: ImportedStrengthActivitySummary = {
  provider: 'suunto',
  sourceFileType: 'json',
  startedAt: '2026-05-01T08:00:00.000Z',
  endedAt: '2026-05-01T09:04:42.000Z',
  durationSeconds: 3882,
  caloriesKcal: 347,
  avgHeartRate: 83,
  maxHeartRate: 112,
  minHeartRate: 66,
  totalSteps: 346,
  recoveryTimeSeconds: 10800,
  epoc: 4,
  pte: 1.3,
  tss: 34,
  trainingLoadPeak: 2.5,
  device: { name: 'Suunto Race', model: 'Race', serial: 'REDACTED' },
  heartRateZones: [
    { zone: 1, durationSeconds: 1800, percentage: 46.4 },
    { zone: 2, durationSeconds: 2082, percentage: 53.6 },
  ],
  heartRateStream: [
    { offsetSeconds: 10, timestamp: '2026-05-01T08:00:10.000Z', bpm: 66 },
    { offsetSeconds: 1800, timestamp: '2026-05-01T08:30:00.000Z', bpm: 112 },
  ],
};

function createFakeSupabaseClient(): FakeSupabaseClient {
  const client: FakeSupabaseClient = {
    operations: [],
    from(table: string): FakeTableClient {
      return {
        delete(): FakeFilterBuilder {
          const operation: FakeOperation = { table, action: 'delete', filters: [] };
          client.operations.push(operation);
          return {
            eq(column: string, value: unknown): FakeFilterBuilder {
              operation.filters.push({ column, value });
              return this;
            },
            then<TResult1 = { error: null }, TResult2 = never>(
              onfulfilled?: ((value: { error: null }) => TResult1 | PromiseLike<TResult1>) | null,
              _onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
            ): PromiseLike<TResult1 | TResult2> {
              const value = onfulfilled ? onfulfilled({ error: null }) : ({ error: null } as TResult1);
              return Promise.resolve(value);
            },
          };
        },
        async insert(payload: unknown): Promise<{ error: null }> {
          client.operations.push({ table, action: 'insert', payload, filters: [] });
          return { error: null };
        },
      };
    },
  };
  return client;
}

function getPrivateService(): ActivityImportServicePrivate {
  return new ActivityImportService() as unknown as ActivityImportServicePrivate;
}

function assertBuildStrengthSessionUpdateUsesImportedMasterValues(): void {
  const service = getPrivateService();
  const actualUpdate = service.buildStrengthSessionUpdate(summary, 'device-1');

  assert.equal(actualUpdate.provider, 'suunto');
  assert.equal(actualUpdate.device_id, 'device-1');
  assert.equal(actualUpdate.start_time, summary.startedAt);
  assert.equal(actualUpdate.end_time, summary.endedAt);
  assert.equal(actualUpdate.duration_s, 3882);
  assert.equal(actualUpdate.calories_kcal, 347);
  assert.equal(actualUpdate.avg_heart_rate, 83);
  assert.equal(actualUpdate.max_heart_rate, 112);
  assert.equal(actualUpdate.min_heart_rate, 66);
  assert.equal(actualUpdate.total_steps, 346);
  assert.equal(actualUpdate.recovery_time_s, 10800);
  assert.equal(actualUpdate.tss_hr, 34);
  assert.equal(actualUpdate.epoc, 4);
  assert.equal(actualUpdate.pte, 1.3);
  assert.ok(typeof actualUpdate.imported_at === 'string');
}

async function assertReplaceStrengthHeartRateZonesReplacesRows(): Promise<void> {
  const service = getPrivateService();
  const supabase = createFakeSupabaseClient();
  const ctx: FakeUserCtx = { user: { id: 'user-1' }, supabase };

  await service.replaceStrengthHeartRateZones(ctx, 'session-1', summary);

  assert.deepEqual(supabase.operations[0], {
    table: 'activity_heart_rate_zones',
    action: 'delete',
    filters: [{ column: 'session_id', value: 'session-1' }],
  });
  assert.equal(supabase.operations[1].table, 'activity_heart_rate_zones');
  assert.equal(supabase.operations[1].action, 'insert');
  assert.deepEqual(supabase.operations[1].payload, [
    { session_id: 'session-1', zone: 1, duration_s: 1800, percentage: 46.4 },
    { session_id: 'session-1', zone: 2, duration_s: 2082, percentage: 53.6 },
  ]);
}

async function assertReplaceStrengthStreamPersistsImportedMetrics(): Promise<void> {
  const service = getPrivateService();
  const supabase = createFakeSupabaseClient();
  const ctx: FakeUserCtx = { user: { id: 'user-1' }, supabase };

  await service.replaceStrengthStream(ctx, 'session-1', summary);

  assert.deepEqual(supabase.operations[0], {
    table: 'activity_streams',
    action: 'delete',
    filters: [
      { column: 'session_id', value: 'session-1' },
      { column: 'source', value: 'strength_file_import' },
    ],
  });
  assert.equal(supabase.operations[1].table, 'activity_streams');
  assert.equal(supabase.operations[1].action, 'insert');

  const rows = supabase.operations[1].payload as Array<{ data: Record<string, unknown> }>;
  assert.equal(rows[0].data.caloriesKcal, 347);
  assert.equal(rows[0].data.avgHeartRate, 83);
  assert.equal(rows[0].data.maxHeartRate, 112);
  assert.equal(rows[0].data.minHeartRate, 66);
  assert.equal(rows[0].data.recoveryTimeSeconds, 10800);
  assert.equal(rows[0].data.epoc, 4);
  assert.equal(rows[0].data.pte, 1.3);
  assert.equal(rows[0].data.tss, 34);
  assert.deepEqual(rows[0].data.samples, [
    { bpm: 66, timestamp: '2026-05-01T08:00:10.000Z', offsetSeconds: 10 },
    { bpm: 112, timestamp: '2026-05-01T08:30:00.000Z', offsetSeconds: 1800 },
  ]);
}

function assertProviderSplitsAreNotHiddenByComputedDistanceBuckets(): void {
  const service = getPrivateService();
  const providerSplits: RouteImportLap[] = [
    {
      lapIndex: 1,
      lapType: 'auto',
      distanceM: 1000,
      durationSeconds: 316.7,
      avgPaceSecondsPerKm: 316.7,
      avgHeartRate: 136,
      maxHeartRate: 148,
      startOffsetSeconds: 0,
      endOffsetSeconds: 316.7,
    },
    {
      lapIndex: 2,
      lapType: 'auto',
      distanceM: 1000,
      durationSeconds: 318.2,
      avgPaceSecondsPerKm: 318.2,
      avgHeartRate: 159,
      maxHeartRate: 167,
      startOffsetSeconds: 316.7,
      endOffsetSeconds: 634.9,
    },
    {
      lapIndex: 3,
      lapType: 'auto',
      distanceM: 1000,
      durationSeconds: 321.9,
      avgPaceSecondsPerKm: 321.9,
      avgHeartRate: 164,
      maxHeartRate: 169,
      startOffsetSeconds: 634.9,
      endOffsetSeconds: 956.8,
    },
  ];
  const computedSplits: RouteImportLap[] = providerSplits.map((lap, index) => ({
    ...lap,
    durationSeconds: index === 2 ? 346.9 : lap.durationSeconds,
    avgPaceSecondsPerKm: index === 2 ? 346.9 : lap.avgPaceSecondsPerKm,
  }));
  const tabs = service.resolveRouteTabs({
    customSplits: providerSplits,
    distanceSplits: [{ splitDistanceM: 1000, laps: computedSplits }],
    splits1k: computedSplits,
    splits5k: [],
    splits10k: [],
    heartRateZones: [],
  });

  assert.equal(tabs[0].splitGroup, 'custom');
  assert.equal(tabs[0].laps[2].durationSeconds, 321.9);
  assert.equal(tabs[1].splitGroup, 'distance');
  assert.equal(tabs[1].laps[2].durationSeconds, 346.9);
}

async function run(): Promise<void> {
  assertBuildStrengthSessionUpdateUsesImportedMasterValues();
  assertProviderSplitsAreNotHiddenByComputedDistanceBuckets();
  await assertReplaceStrengthHeartRateZonesReplacesRows();
  await assertReplaceStrengthStreamPersistsImportedMetrics();
}

void run();
