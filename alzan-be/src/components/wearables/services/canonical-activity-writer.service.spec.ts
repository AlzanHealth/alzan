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
  rows: Record<string, Array<Record<string, unknown>>>;
  updates: FakeRecordedMutation[];
  upserts: FakeRecordedMutation[];
  from(table: string): FakeFullTableClient;
  rpc(fn: string, args: Record<string, unknown>): Promise<{ data: unknown; error: null }>;
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

function createFullSupabaseClient(rows: Record<string, Array<Record<string, unknown>>>): FakeFullSupabaseClient {
  const client: FakeFullSupabaseClient = {
    deletes: [],
    inserts: [],
    rows,
    updates: [],
    upserts: [],
    async rpc(fn: string, args: Record<string, unknown>): Promise<{ data: unknown; error: null }> {
      assert.equal(fn, 'persist_wearable_activity_bundle');
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
        source: 'planned',
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
        insert.rows?.every(row => row.session_id === 'survivor-session') === true,
    ),
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
  await assertOneKilometerWearableLapsArePersistedAsDistanceGroups();
}

void run();
