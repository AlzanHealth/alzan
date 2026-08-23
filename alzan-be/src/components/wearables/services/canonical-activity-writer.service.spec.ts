import { strict as assert } from 'assert';
import { SupabaseAdminService } from '../../../core/supabase/supabase.service';
import {
  CanonicalActivity,
  CanonicalActivityPointSample,
} from '../../activity-import/parsers/activity-import-canonical.types';
import { UpsertActivityInput } from '../domain/wearable.types';
import { CanonicalActivityWriterService } from './canonical-activity-writer.service';
import { DedupeService } from './dedupe.service';
import { ImportReconciliationService } from './import-reconciliation.service';
import { RawPayloadService } from './raw-payload.service';

type InsertableTable = 'activity_route_points' | 'activity_stream_samples';

type FakeSupabaseError = {
  code: string;
  details: string;
  hint: string;
  message: string;
};

type FakeInsert = {
  rowCount: number;
  table: string;
};

type FakeFilter = {
  column: string;
  value: unknown;
};

type FakeMutationKind = 'delete' | 'insert' | 'select' | 'update';

type FakeMutationResult = {
  data?: Record<string, unknown> | null;
  error: FakeSupabaseError | null;
};

type FakeRecordedMutation = {
  filters: FakeFilter[];
  payload?: Record<string, unknown>;
  rows?: Array<Record<string, unknown>>;
  table: string;
};

interface CanonicalActivityWriterServicePrivate {
  insertInChunks(table: InsertableTable, rows: Array<Record<string, unknown>>, errorCode: string): Promise<void>;
  persistActivityBundle(params: {
    clearProvenanceSessionId: string | null;
    input: UpsertActivityInput;
    replaceLaps: boolean;
    sessionId: string;
    sessionPayload: Record<string, unknown>;
  }): Promise<void>;
  replaceLaps(sessionId: string, userId: string, activity: CanonicalActivity): Promise<void>;
  resolveExistingWriteSessionId(sessionId: string): Promise<string>;
  sanitizePositionSamples(samples: CanonicalActivityPointSample[]): CanonicalActivityPointSample[];
}

interface FakeSupabaseTableClient {
  insert(rows: Array<Record<string, unknown>>): Promise<{ error: FakeSupabaseError | null }>;
  select(columns: string): FakeSupabaseQueryClient;
}

interface FakeSupabaseQueryClient {
  eq(column: string, value: unknown): FakeSupabaseQueryClient;
  maybeSingle(): Promise<{ data: Record<string, unknown> | null; error: FakeSupabaseError | null }>;
}

interface FakeSupabaseClient {
  inserts: FakeInsert[];
  rows: Record<string, Array<Record<string, unknown>>>;
  from(table: string): FakeSupabaseTableClient;
}

interface FakeFullQuery extends PromiseLike<FakeMutationResult> {
  eq(column: string, value: unknown): FakeFullQuery;
  is(column: string, value: unknown): FakeFullQuery;
  maybeSingle(): Promise<FakeMutationResult>;
  select(columns?: string): FakeFullQuery;
  single(): Promise<FakeMutationResult>;
}

interface FakeFullTableClient {
  delete(): FakeFullQuery;
  insert(rows: Array<Record<string, unknown>> | Record<string, unknown>): FakeFullQuery;
  select(columns?: string): FakeFullQuery;
  update(payload: Record<string, unknown>): FakeFullQuery;
  upsert(payload: Record<string, unknown>, options?: Record<string, unknown>): Promise<{ error: null }>;
}

interface FakeFullSupabaseClient {
  deletes: FakeRecordedMutation[];
  inserts: FakeRecordedMutation[];
  rpcCalls: Array<{ args: Record<string, unknown>; fn: string }>;
  rpcErrors: FakeSupabaseError[];
  rows: Record<string, Array<Record<string, unknown>>>;
  updates: FakeRecordedMutation[];
  upserts: FakeRecordedMutation[];
  from(table: string): FakeFullTableClient;
  rpc(fn: string, args: Record<string, unknown>): Promise<{ data: unknown; error: FakeSupabaseError | null }>;
}

function createFakeSupabaseClient(
  maxStreamSampleRowsPerInsert: number,
  rows: Record<string, Array<Record<string, unknown>>> = {},
): FakeSupabaseClient {
  const client: FakeSupabaseClient = {
    inserts: [],
    rows,
    from(table: string): FakeSupabaseTableClient {
      return {
        async insert(rows: Array<Record<string, unknown>>): Promise<{ error: FakeSupabaseError | null }> {
          client.inserts.push({ rowCount: rows.length, table });
          if (table === 'activity_stream_samples' && rows.length > maxStreamSampleRowsPerInsert) {
            return {
              error: {
                code: '',
                details: 'SocketError: other side closed',
                hint: '',
                message: 'TypeError: fetch failed',
              },
            };
          }
          return { error: null };
        },
        select(): FakeSupabaseQueryClient {
          const filters: Array<{ column: string; value: unknown }> = [];
          return {
            eq(column: string, value: unknown): FakeSupabaseQueryClient {
              filters.push({ column, value });
              return this;
            },
            async maybeSingle(): Promise<{ data: Record<string, unknown> | null; error: FakeSupabaseError | null }> {
              const tableRows = client.rows[table] ?? [];
              const data = tableRows.find(row => filters.every(filter => row[filter.column] === filter.value)) ?? null;
              return { data, error: null };
            },
          };
        },
      };
    },
  };
  return client;
}

function createService(client: FakeSupabaseClient): CanonicalActivityWriterServicePrivate {
  const supabaseAdminService = { client } as unknown as SupabaseAdminService;
  const service = new CanonicalActivityWriterService(
    supabaseAdminService,
    {} as unknown as RawPayloadService,
    {} as unknown as DedupeService,
    {} as unknown as ImportReconciliationService,
  );
  return service as unknown as CanonicalActivityWriterServicePrivate;
}

function createFullQuery(
  client: FakeFullSupabaseClient,
  table: string,
  kind: FakeMutationKind,
  payload?: Record<string, unknown>,
  rows?: Array<Record<string, unknown>>,
): FakeFullQuery {
  const filters: FakeFilter[] = [];
  const matchesFilters = (row: Record<string, unknown>) => filters.every(filter => row[filter.column] === filter.value);

  const runMutation = (): FakeMutationResult => {
    if (kind === 'insert' && rows) {
      client.inserts.push({ filters: [...filters], rows, table });
      return { data: null, error: null };
    }
    if (kind === 'update' && payload) {
      client.updates.push({ filters: [...filters], payload, table });
      client.rows[table] = (client.rows[table] ?? []).map(row => (matchesFilters(row) ? { ...row, ...payload } : row));
      return { data: null, error: null };
    }
    if (kind === 'delete') {
      client.deletes.push({ filters: [...filters], table });
      client.rows[table] = (client.rows[table] ?? []).filter(row => !matchesFilters(row));
      return { data: null, error: null };
    }
    return { data: null, error: null };
  };

  const query: FakeFullQuery = {
    eq(column: string, value: unknown): FakeFullQuery {
      filters.push({ column, value });
      return query;
    },
    is(column: string, value: unknown): FakeFullQuery {
      filters.push({ column, value });
      return query;
    },
    async maybeSingle(): Promise<FakeMutationResult> {
      const data = (client.rows[table] ?? []).find(matchesFilters) ?? null;
      return { data, error: null };
    },
    select(): FakeFullQuery {
      return query;
    },
    async single(): Promise<FakeMutationResult> {
      runMutation();
      return { data: { id: 'inserted-session' }, error: null };
    },
    then<TResult1 = FakeMutationResult, TResult2 = never>(
      onfulfilled?: ((value: FakeMutationResult) => TResult1 | PromiseLike<TResult1>) | null,
      onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ): PromiseLike<TResult1 | TResult2> {
      return Promise.resolve(runMutation()).then(onfulfilled, onrejected);
    },
  };

  return query;
}

function createFullSupabaseClient(
  rows: Record<string, Array<Record<string, unknown>>>,
  rpcErrors: FakeSupabaseError[] = [],
): FakeFullSupabaseClient {
  const client: FakeFullSupabaseClient = {
    deletes: [],
    inserts: [],
    rpcCalls: [],
    rpcErrors: [...rpcErrors],
    rows,
    updates: [],
    upserts: [],
    async rpc(fn: string, args: Record<string, unknown>): Promise<{ data: unknown; error: FakeSupabaseError | null }> {
      assert.equal(fn, 'persist_wearable_activity_bundle');
      client.rpcCalls.push({ fn, args });
      const rpcError = client.rpcErrors.shift();
      if (rpcError) return { data: null, error: rpcError };
      const sessionId = String(args.p_session_id);
      const sessionPayload = args.p_session_payload as Record<string, unknown>;
      client.updates.push({
        filters: [{ column: 'id', value: sessionId }],
        payload: sessionPayload,
        table: 'activity_sessions',
      });
      if (args.p_clear_provenance_session_id) {
        client.updates.push({
          filters: [{ column: 'id', value: args.p_clear_provenance_session_id }],
          payload: { provider_activity_id: null, source_record_id: null },
          table: 'activity_sessions',
        });
      }
      for (const [argument, table] of [
        ['p_laps', 'activity_laps'],
        ['p_heart_rate_zones', 'activity_heart_rate_zones'],
        ['p_streams', 'activity_streams'],
        ['p_stream_samples', 'activity_stream_samples'],
        ['p_route_points', 'activity_route_points'],
      ] as const) {
        const rows = args[argument] as Array<Record<string, unknown>>;
        if (rows.length > 0) client.inserts.push({ filters: [], rows, table });
      }
      client.upserts.push({
        filters: [],
        payload: args.p_provider_fields as Record<string, unknown>,
        table: 'activity_provider_fields',
      });
      return { data: sessionId, error: null };
    },
    from(table: string): FakeFullTableClient {
      return {
        delete(): FakeFullQuery {
          return createFullQuery(client, table, 'delete');
        },
        insert(rowsOrRow: Array<Record<string, unknown>> | Record<string, unknown>): FakeFullQuery {
          const rows = Array.isArray(rowsOrRow) ? rowsOrRow : [rowsOrRow];
          return createFullQuery(client, table, 'insert', undefined, rows);
        },
        select(): FakeFullQuery {
          return createFullQuery(client, table, 'select');
        },
        update(payload: Record<string, unknown>): FakeFullQuery {
          return createFullQuery(client, table, 'update', payload);
        },
        async upsert(payload: Record<string, unknown>): Promise<{ error: null }> {
          client.upserts.push({ filters: [], payload, table });
          return { error: null };
        },
      };
    },
  };
  return client;
}

function buildCanonicalRun(): CanonicalActivity {
  return {
    provider: 'suunto',
    sourceFileType: 'json',
    sportType: 'running',
    sportSubtype: null,
    providerActivityId: 'suunto-run-1',
    summary: {
      startedAt: '2026-06-15T08:00:00.000Z',
      endedAt: '2026-06-15T08:34:00.000Z',
      durationSeconds: 2040,
      elapsedSeconds: 2040,
      distanceM: 6080,
      caloriesKcal: 591,
      avgHeartRate: 149,
      maxHeartRate: 171,
      minHeartRate: 98,
      avgSpeedMps: 2.98,
      maxSpeedMps: null,
      avgCadence: null,
      maxCadence: null,
      avgPowerW: null,
      maxPowerW: null,
      elevationGainM: 153,
      elevationLossM: 24,
      avgTemperatureC: null,
      maxTemperatureC: null,
      totalSteps: 2416,
      recoveryTimeSeconds: null,
      vo2Max: null,
      epoc: null,
      pte: null,
      tss: null,
    },
    streams: {
      position: [
        { lat: 39.47, lon: -0.37, offsetSeconds: 0, timestamp: '2026-06-15T08:00:00.000Z' },
        { lat: 39.471, lon: -0.371, offsetSeconds: 10, timestamp: '2026-06-15T08:00:10.000Z' },
      ],
      heartRate: [],
      speed: [],
      distance: [],
      altitude: [],
      cadence: [],
      power: [],
      temperature: [],
    },
    laps: [
      {
        lapIndex: 1,
        lapType: 'manual',
        distanceM: 400,
        durationSeconds: 105.3,
        avgPaceSecondsPerKm: 263.25,
        avgHeartRate: 153,
        maxHeartRate: 160,
        startOffsetSeconds: 600,
        endOffsetSeconds: 705.3,
      },
    ],
    heartRateZones: [],
    device: null,
    vendorFields: {},
  };
}

function buildEpipeError(): FakeSupabaseError {
  return {
    code: '',
    details: 'TypeError: fetch failed\nCaused by: Error: write EPIPE (EPIPE)',
    hint: '',
    message: 'TypeError: fetch failed',
  };
}

function buildLifecycleInput(activity: CanonicalActivity): UpsertActivityInput {
  return {
    userId: 'user-1',
    activity,
    provenance: {
      provider: 'suunto',
      sourceChannel: 'cloud',
      sourcePackage: null,
      sourceProviderKey: 'suunto',
      sourceRecordId: 'suunto-run-1',
      sourceUpdatedAt: null,
      rawPayloadId: 'raw-1',
    },
    lifecycleImportId: 'import-1',
    lifecycleJobId: 'job-1',
    canonicalVersion: 8,
  };
}

async function assertStreamSamplesUseTransportSafeChunks(): Promise<void> {
  const client = createFakeSupabaseClient(100);
  const service = createService(client);
  const rows = Array.from({ length: 275 }, (_, index) => ({ value: index }));

  await service.insertInChunks('activity_stream_samples', rows, 'WEARABLE_ACTIVITY_STREAM_SAMPLES_INSERT_FAILED');

  assert.deepEqual(
    client.inserts.map(insert => insert.rowCount),
    [100, 100, 75],
  );
}

async function assertRoutePointsUseSmallChunks(): Promise<void> {
  const client = createFakeSupabaseClient(100);
  const service = createService(client);
  const rows = Array.from({ length: 450 }, (_, index) => ({ point_index: index }));

  await service.insertInChunks('activity_route_points', rows, 'WEARABLE_ACTIVITY_ROUTE_INSERT_FAILED');

  assert.deepEqual(
    client.inserts.map(insert => insert.rowCount),
    [200, 200, 50],
  );
}

async function assertRetryableChunkFailuresAreSplit(): Promise<void> {
  const client = createFakeSupabaseClient(60);
  const service = createService(client);
  const rows = Array.from({ length: 100 }, (_, index) => ({ value: index }));

  await service.insertInChunks('activity_stream_samples', rows, 'WEARABLE_ACTIVITY_STREAM_SAMPLES_INSERT_FAILED');

  assert.deepEqual(
    client.inserts.map(insert => insert.rowCount),
    [100, 50, 50],
  );
}

async function assertStrongPendingDuplicateWritesToSurvivor(): Promise<void> {
  const client = createFakeSupabaseClient(100, {
    activity_sessions: [
      {
        id: 'imported-session',
        duplicate_of_session_id: 'alzan-session',
        duplicate_resolution: 'pending',
        duplicate_score: 95,
      },
    ],
  });
  const service = createService(client);

  const actualSessionId = await service.resolveExistingWriteSessionId('imported-session');

  assert.equal(actualSessionId, 'alzan-session');
}

async function assertResyncWritesSurvivorArtifactsForStrongPendingDuplicate(): Promise<void> {
  const activity = buildCanonicalRun();
  const client = createFullSupabaseClient({
    activity_sessions: [
      {
        id: 'imported-session',
        user_id: 'user-1',
        provider: 'suunto',
        provider_activity_id: 'suunto-run-1',
        source_channel: 'cloud',
        source_package: null,
        source_record_id: 'suunto-run-1',
        sport_type: 'running',
        source: 'imported',
        duplicate_of_session_id: 'survivor-session',
        duplicate_resolution: 'pending',
        duplicate_score: 95,
      },
      {
        id: 'survivor-session',
        user_id: 'user-1',
        provider: null,
        provider_activity_id: null,
        source_channel: null,
        source_package: null,
        source_record_id: null,
        sport_type: 'running',
        sport_subtype: 'planned_easy',
        source: 'planned',
        start_time: '2026-08-23T08:00:00.000Z',
        end_time: null,
        duration_s: null,
        timezone: 'Europe/Madrid',
        status: 'active',
        pre_wearable_merge_snapshot: null,
        duplicate_of_session_id: null,
        duplicate_resolution: null,
        duplicate_score: null,
      },
    ],
  });
  const completedPlans: string[] = [];
  const linkedPayloads: Array<Record<string, unknown>> = [];
  const service = new CanonicalActivityWriterService(
    { client } as unknown as SupabaseAdminService,
    {
      linkPayload: async (payload: Record<string, unknown>) => {
        linkedPayloads.push(payload);
      },
    } as unknown as RawPayloadService,
    {
      buildActivityFingerprint: () => 'fingerprint',
      buildStrongActivityKey: () => 'strong-key',
    } as unknown as DedupeService,
    {
      completePlansForAssociatedSession: async (_userId: string, sessionId: string) => {
        completedPlans.push(sessionId);
      },
    } as unknown as ImportReconciliationService,
  );
  const input: UpsertActivityInput = {
    userId: 'user-1',
    activity,
    provenance: {
      provider: 'suunto',
      sourceChannel: 'cloud',
      sourcePackage: null,
      sourceProviderKey: 'suunto',
      sourceRecordId: 'suunto-run-1',
      sourceUpdatedAt: null,
      rawPayloadId: 'raw-1',
    },
  };

  const sessionId = await service.upsertActivity(input);

  assert.equal(sessionId, 'survivor-session');
  assert.ok(
    client.updates.some(
      update =>
        update.table === 'activity_sessions' &&
        update.filters.some(filter => filter.column === 'id' && filter.value === 'survivor-session') &&
        typeof update.payload?.pre_wearable_merge_snapshot === 'object' &&
        (update.payload.pre_wearable_merge_snapshot as Record<string, unknown>).start_time ===
          '2026-08-23T08:00:00.000Z',
    ),
    'native session values must be snapshotted before wearable association',
  );
  assert.ok(
    client.updates.some(
      update =>
        update.table === 'activity_sessions' &&
        update.filters.some(filter => filter.column === 'id' && filter.value === 'imported-session') &&
        update.payload?.provider_activity_id === null &&
        update.payload?.source_record_id === null,
    ),
  );
  assert.ok(
    client.updates.some(
      update =>
        update.table === 'activity_sessions' &&
        update.filters.some(filter => filter.column === 'id' && filter.value === 'survivor-session') &&
        update.payload?.duplicate_resolution === 'merged' &&
        update.payload?.source !== 'imported',
    ),
  );
  assert.ok(
    client.inserts.some(
      insert =>
        insert.table === 'activity_route_points' &&
        insert.rows?.every(row => row.lat != null && row.lon != null) === true,
    ),
    'compact route points should contain lat/lon fields',
  );
  assert.ok(
    client.inserts.some(
      insert =>
        insert.table === 'activity_laps' &&
        insert.rows?.some(row => row.session_id === 'survivor-session' && row.duration_s === 105.3) === true,
    ),
  );
  assert.equal(completedPlans[0], 'survivor-session');
  assert.equal(linkedPayloads.length, 0, 'bundle transaction owns raw-payload linking');
}

async function assertBundleFailureFallsBackToGenericActivityWithLaps(): Promise<void> {
  const activity = buildCanonicalRun();
  const client = createFullSupabaseClient(
    {
      activity_sessions: [
        {
          id: 'session-1',
          user_id: 'user-1',
          provider: 'suunto',
          provider_activity_id: 'suunto-run-1',
          source_channel: 'cloud',
          source_package: null,
          source_record_id: 'suunto-run-1',
          sport_type: 'running',
          source: 'imported',
          endurance_template_id: 'template-1',
          duplicate_of_session_id: null,
          duplicate_resolution: null,
          duplicate_score: null,
        },
      ],
    },
    [{ code: 'PGRST500', message: 'simulated optional payload failure', details: '', hint: '' }],
  );
  const service = new CanonicalActivityWriterService(
    { client } as unknown as SupabaseAdminService,
    {} as unknown as RawPayloadService,
    {
      buildActivityFingerprint: () => 'fingerprint',
      buildStrongActivityKey: () => 'strong-key',
    } as unknown as DedupeService,
    {} as unknown as ImportReconciliationService,
  );

  const sessionId = await service.upsertActivity({
    userId: 'user-1',
    activity,
    provenance: {
      provider: 'suunto',
      sourceChannel: 'cloud',
      sourcePackage: null,
      sourceProviderKey: 'suunto',
      sourceRecordId: 'suunto-run-1',
      sourceUpdatedAt: null,
      rawPayloadId: 'raw-1',
    },
  });

  assert.equal(sessionId, 'session-1');
  assert.equal(client.rpcCalls.length, 2);
  assert.equal((client.rpcCalls[1]?.args.p_streams as Array<unknown>).length, 0);
  assert.ok((client.rpcCalls[1]?.args.p_laps as Array<unknown>).length > 0);
  assert.equal(
    client.inserts.some(
      insert => insert.table === 'activity_route_points' || insert.table === 'activity_stream_samples',
    ),
    false,
  );
}

async function assertRetryableBundleFailureRetriesFullPayloadWithoutDegrading(): Promise<void> {
  const activity = buildCanonicalRun();
  const client = createFullSupabaseClient(
    {
      wearable_activity_imports: [
        {
          id: 'import-1',
          status: 'processing',
          session_id: null,
          canonical_version: 8,
        },
      ],
    },
    [buildEpipeError()],
  );
  const service = new CanonicalActivityWriterService(
    { client } as unknown as SupabaseAdminService,
    {} as unknown as RawPayloadService,
    {
      buildActivityFingerprint: () => 'fingerprint',
      buildStrongActivityKey: () => 'strong-key',
    } as unknown as DedupeService,
    {} as unknown as ImportReconciliationService,
  ) as unknown as CanonicalActivityWriterServicePrivate;

  await service.persistActivityBundle({
    input: buildLifecycleInput(activity),
    sessionId: 'session-1',
    sessionPayload: { distance_m: activity.summary.distanceM },
    clearProvenanceSessionId: null,
    replaceLaps: true,
  });

  assert.equal(client.rpcCalls.length, 2);
  assert.equal(client.rpcCalls[1]?.args.p_import_id, 'import-1');
  assert.notEqual(client.rpcCalls[1]?.args.p_route_polyline, null);
  assert.ok(client.inserts.some(insert => insert.table === 'activity_route_points'));
}

async function assertLostBundleResponseUsesAtomicallyCommittedFullPayload(): Promise<void> {
  const activity = buildCanonicalRun();
  const client = createFullSupabaseClient(
    {
      wearable_activity_imports: [
        {
          id: 'import-1',
          status: 'complete',
          session_id: 'session-1',
          canonical_version: 8,
        },
      ],
    },
    [buildEpipeError()],
  );
  const service = new CanonicalActivityWriterService(
    { client } as unknown as SupabaseAdminService,
    {} as unknown as RawPayloadService,
    {
      buildActivityFingerprint: () => 'fingerprint',
      buildStrongActivityKey: () => 'strong-key',
    } as unknown as DedupeService,
    {} as unknown as ImportReconciliationService,
  ) as unknown as CanonicalActivityWriterServicePrivate;

  await service.persistActivityBundle({
    input: buildLifecycleInput(activity),
    sessionId: 'session-1',
    sessionPayload: { distance_m: activity.summary.distanceM },
    clearProvenanceSessionId: null,
    replaceLaps: true,
  });

  assert.equal(client.rpcCalls.length, 1, 'a committed atomic bundle must not be replayed after a lost response');
  assert.ok(client.inserts.some(insert => insert.table === 'activity_route_points'));
}

async function assertGenericLifecycleFallbackRemainsRetryable(): Promise<void> {
  const activity = buildCanonicalRun();
  const client = createFullSupabaseClient(
    {
      wearable_activity_imports: [
        {
          id: 'import-1',
          status: 'processing',
          session_id: null,
          canonical_version: 8,
        },
      ],
    },
    [buildEpipeError(), buildEpipeError(), buildEpipeError()],
  );
  const service = new CanonicalActivityWriterService(
    { client } as unknown as SupabaseAdminService,
    {} as unknown as RawPayloadService,
    {
      buildActivityFingerprint: () => 'fingerprint',
      buildStrongActivityKey: () => 'strong-key',
    } as unknown as DedupeService,
    {} as unknown as ImportReconciliationService,
  ) as unknown as CanonicalActivityWriterServicePrivate;

  await assert.rejects(
    service.persistActivityBundle({
      input: buildLifecycleInput(activity),
      sessionId: 'session-1',
      sessionPayload: { distance_m: activity.summary.distanceM },
      clearProvenanceSessionId: null,
      replaceLaps: true,
    }),
    (error: unknown) => error instanceof Error && error.message === 'WEARABLE_ACTIVITY_BUNDLE_PERSIST_DEGRADED',
  );

  assert.equal(client.rpcCalls.length, 4);
  assert.equal(client.rpcCalls[3]?.args.p_import_id, 'import-1');
  assert.equal(client.rpcCalls[3]?.args.p_route_polyline, null);
  assert.ok((client.rpcCalls[3]?.args.p_laps as Array<unknown>).length > 0);
  assert.equal(
    client.inserts.some(insert => insert.table === 'activity_route_points'),
    false,
  );
}

async function assertTransportFailurePreservesPreviouslyImportedSession(): Promise<void> {
  const activity = buildCanonicalRun();
  const client = createFullSupabaseClient(
    {
      wearable_activity_imports: [
        {
          id: 'import-1',
          status: 'processing',
          session_id: 'session-1',
          canonical_version: 8,
        },
      ],
    },
    [buildEpipeError(), buildEpipeError(), buildEpipeError()],
  );
  const service = new CanonicalActivityWriterService(
    { client } as unknown as SupabaseAdminService,
    {} as unknown as RawPayloadService,
    {
      buildActivityFingerprint: () => 'fingerprint',
      buildStrongActivityKey: () => 'strong-key',
    } as unknown as DedupeService,
    {} as unknown as ImportReconciliationService,
  ) as unknown as CanonicalActivityWriterServicePrivate;

  await assert.rejects(
    service.persistActivityBundle({
      input: buildLifecycleInput(activity),
      sessionId: 'session-1',
      sessionPayload: { distance_m: activity.summary.distanceM },
      clearProvenanceSessionId: null,
      replaceLaps: true,
    }),
    (error: unknown) => error instanceof Error && error.message === 'WEARABLE_ACTIVITY_BUNDLE_PERSIST_DEGRADED',
  );

  assert.equal(client.rpcCalls.length, 3, 'an existing imported session must never be replaced by a generic bundle');
}

async function assertOneKilometerWearableLapsArePersistedAsDistanceGroups(): Promise<void> {
  const activity = buildCanonicalRun();
  activity.summary.distanceM = 9220;
  activity.laps = [
    ...Array.from({ length: 9 }, (_, index) => ({
      lapIndex: index + 1,
      lapType: 'auto' as const,
      distanceM: 1000,
      durationSeconds: 300 + index,
      avgPaceSecondsPerKm: 300 + index,
      avgHeartRate: 140 + index,
      maxHeartRate: 150 + index,
      startOffsetSeconds: index * 300,
      endOffsetSeconds: (index + 1) * 300,
    })),
    {
      lapIndex: 10,
      lapType: 'auto',
      distanceM: 220,
      durationSeconds: 70,
      avgPaceSecondsPerKm: 318.18,
      avgHeartRate: 155,
      maxHeartRate: 162,
      startOffsetSeconds: 2700,
      endOffsetSeconds: 2770,
    },
  ];
  const client = createFullSupabaseClient({});
  const service = new CanonicalActivityWriterService(
    { client } as unknown as SupabaseAdminService,
    {} as unknown as RawPayloadService,
    {} as unknown as DedupeService,
    {} as unknown as ImportReconciliationService,
  ) as unknown as CanonicalActivityWriterServicePrivate;

  await service.replaceLaps('session-1', 'user-1', activity);

  const insertedRows = client.inserts.find(insert => insert.table === 'activity_laps')?.rows ?? [];
  const splitDistances = Array.from(new Set(insertedRows.map(row => row.split_distance_m))).sort(
    (left, right) => Number(left) - Number(right),
  );

  assert.deepEqual(splitDistances, [1000, 5000, 10000]);
  assert.equal(
    insertedRows.some(row => row.split_group === 'custom'),
    false,
  );
  assert.ok(insertedRows.some(row => row.split_distance_m === 10000 && row.distance_m === 9220));
}

async function assertExactSuuntoSeriesPersistsElevenNativeLaps(): Promise<void> {
  const activity = buildCanonicalRun();
  activity.summary.distanceM = 7739;
  activity.summary.durationSeconds = 2848.7;
  const values = [
    [1477.4, 600],
    [1000, 294.4],
    [190.1, 120],
    [1000, 284.4],
    [163.1, 120],
    [1000, 286.7],
    [173.1, 120],
    [1000, 289.6],
    [171, 120],
    [1525.9, 600],
  ] as const;
  let offsetSeconds = 0;
  activity.laps = values.map(([distanceM, durationSeconds], index) => {
    const startOffsetSeconds = offsetSeconds;
    offsetSeconds += durationSeconds;
    return {
      lapIndex: index + 1,
      lapType: 'manual' as const,
      distanceM,
      durationSeconds,
      avgPaceSecondsPerKm: (durationSeconds / distanceM) * 1000,
      avgHeartRate: 150,
      maxHeartRate: 170,
      startOffsetSeconds,
      endOffsetSeconds: offsetSeconds,
    };
  });
  activity.laps.push(
    {
      lapIndex: 11,
      lapType: 'distance',
      distanceM: 36,
      durationSeconds: 13.6,
      avgPaceSecondsPerKm: (13.6 / 36) * 1000,
      avgHeartRate: 165,
      maxHeartRate: 170,
      startOffsetSeconds: offsetSeconds,
      endOffsetSeconds: offsetSeconds + 13.6,
    },
    {
      lapIndex: 12,
      lapType: 'distance',
      distanceM: 739,
      durationSeconds: 309.3,
      avgPaceSecondsPerKm: (309.3 / 739) * 1000,
      avgHeartRate: 163,
      maxHeartRate: 170,
      startOffsetSeconds: null,
      endOffsetSeconds: null,
    },
  );
  const client = createFullSupabaseClient({});
  const service = new CanonicalActivityWriterService(
    { client } as unknown as SupabaseAdminService,
    {} as unknown as RawPayloadService,
    {} as unknown as DedupeService,
    {} as unknown as ImportReconciliationService,
  ) as unknown as CanonicalActivityWriterServicePrivate;

  await service.replaceLaps('session-1', 'user-1', activity);

  const insertedRows = client.inserts.find(insert => insert.table === 'activity_laps')?.rows ?? [];
  assert.equal(insertedRows.length, 11);
  assert.deepEqual(
    insertedRows.map(row => Math.round(Number(row.distance_m))),
    [1477, 1000, 190, 1000, 163, 1000, 173, 1000, 171, 1526, 36],
  );
  assert.equal(
    insertedRows.every(row => row.split_group === 'custom'),
    true,
  );
}

function assertPositionSamplesAreSanitizedForValidRoutes(): void {
  const client = createFakeSupabaseClient(250);
  const service = createService(client);
  const samples: CanonicalActivityPointSample[] = [
    { lat: Number.NaN, lon: -0.37, offsetSeconds: 0, timestamp: null },
    { lat: 91, lon: -0.37, offsetSeconds: 1, timestamp: null },
    { lat: 39.47, lon: -0.37, offsetSeconds: 2, timestamp: null },
    { lat: 39.47, lon: -0.37, offsetSeconds: 3, timestamp: null },
    { lat: 39.471, lon: -0.371, offsetSeconds: 4, timestamp: null },
    { lat: 39.472, lon: -181, offsetSeconds: 5, timestamp: null },
  ];

  const sanitized = service.sanitizePositionSamples(samples);

  assert.deepEqual(
    sanitized.map(sample => [sample.lat, sample.lon]),
    [
      [39.47, -0.37],
      [39.471, -0.371],
    ],
  );
}

function assertStaticOrInvalidPositionSamplesAreDropped(): void {
  const client = createFakeSupabaseClient(250);
  const service = createService(client);

  assert.deepEqual(
    service.sanitizePositionSamples([
      { lat: 39.47, lon: -0.37, offsetSeconds: 0, timestamp: null },
      { lat: 39.47, lon: -0.37, offsetSeconds: 1, timestamp: null },
    ]),
    [],
  );
  assert.deepEqual(
    service.sanitizePositionSamples([{ lat: 39.47, lon: -0.37, offsetSeconds: 0, timestamp: null }]),
    [],
  );
}

async function run(): Promise<void> {
  assertPositionSamplesAreSanitizedForValidRoutes();
  assertStaticOrInvalidPositionSamplesAreDropped();
  await assertStreamSamplesUseTransportSafeChunks();
  await assertRoutePointsUseSmallChunks();
  await assertRetryableChunkFailuresAreSplit();
  await assertStrongPendingDuplicateWritesToSurvivor();
  await assertResyncWritesSurvivorArtifactsForStrongPendingDuplicate();
  await assertBundleFailureFallsBackToGenericActivityWithLaps();
  await assertRetryableBundleFailureRetriesFullPayloadWithoutDegrading();
  await assertLostBundleResponseUsesAtomicallyCommittedFullPayload();
  await assertGenericLifecycleFallbackRemainsRetryable();
  await assertTransportFailurePreservesPreviouslyImportedSession();
  await assertOneKilometerWearableLapsArePersistedAsDistanceGroups();
  await assertExactSuuntoSeriesPersistsElevenNativeLaps();
}

void run();
