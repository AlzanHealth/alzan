import { strict as assert } from 'assert';
import { createHash } from 'crypto';
import { gunzipSync, gzipSync } from 'zlib';
import { BadRequestException, InternalServerErrorException, ServiceUnavailableException } from '@nestjs/common';
import { SupabaseAdminService } from '../../../core/supabase/supabase.service';
import { ActivityStreamArchiveService } from './activity-stream-archive.service';

type FakeRow = Record<string, unknown>;
type FakeError = { message: string };
type FakeQueryResult = {
  data: FakeRow[] | FakeRow | null;
  error: FakeError | null;
  count: number | null;
};
type FakeCondition =
  | { kind: 'eq' | 'lt'; column: string; value: unknown }
  | { kind: 'in'; column: string; value: unknown[] }
  | { kind: 'not'; column: string; operator: string; value: unknown };
type FakeSort = { column: string; ascending: boolean };
type FakeOperation = 'delete' | 'insert' | 'select' | 'update' | 'upsert';
type FakeEvent = {
  args?: FakeRow;
  kind: 'delete' | 'download' | 'insert' | 'rpc' | 'select' | 'update' | 'upload' | 'upsert';
  objectPath?: string;
  table?: string;
};

class FakeQuery implements PromiseLike<FakeQueryResult> {
  public operation: FakeOperation = 'select';
  public readonly conditions: FakeCondition[] = [];
  public readonly sorts: FakeSort[] = [];
  public headOnly = false;
  public countMode = false;
  public endIndex: number | null = null;
  public payload: FakeRow | FakeRow[] | null = null;
  public startIndex: number | null = null;
  public rowLimit: number | null = null;

  constructor(
    private readonly client: FakeArchiveClient,
    public readonly table: string,
  ) {}

  public select(_columns?: string, options?: { count?: string; head?: boolean }): this {
    this.operation = 'select';
    this.countMode = options?.count === 'exact';
    this.headOnly = options?.head === true;
    return this;
  }

  public eq(column: string, value: unknown): this {
    this.conditions.push({ kind: 'eq', column, value });
    return this;
  }

  public in(column: string, value: unknown[]): this {
    this.conditions.push({ kind: 'in', column, value });
    return this;
  }

  public lt(column: string, value: unknown): this {
    this.conditions.push({ kind: 'lt', column, value });
    return this;
  }

  public not(column: string, operator: string, value: unknown): this {
    this.conditions.push({ kind: 'not', column, operator, value });
    return this;
  }

  public order(column: string, options?: { ascending?: boolean }): this {
    this.sorts.push({ column, ascending: options?.ascending !== false });
    return this;
  }

  public range(startIndex: number, endIndex: number): this {
    this.startIndex = startIndex;
    this.endIndex = endIndex;
    return this;
  }

  public limit(rowLimit: number): this {
    this.rowLimit = rowLimit;
    return this;
  }

  public maybeSingle(): Promise<FakeQueryResult> {
    const result = this.client.execute(this);
    const rows = Array.isArray(result.data) ? result.data : [];
    return Promise.resolve({ ...result, data: rows[0] ?? null });
  }

  public insert(payload: FakeRow | FakeRow[]): this {
    this.operation = 'insert';
    this.payload = payload;
    return this;
  }

  public upsert(payload: FakeRow | FakeRow[]): this {
    this.operation = 'upsert';
    this.payload = payload;
    return this;
  }

  public update(payload: FakeRow): this {
    this.operation = 'update';
    this.payload = payload;
    return this;
  }

  public delete(): this {
    this.operation = 'delete';
    return this;
  }

  public then<TResult1 = FakeQueryResult, TResult2 = never>(
    onfulfilled?: ((value: FakeQueryResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve(this.client.execute(this)).then(onfulfilled, onrejected);
  }
}

type FakeArchiveOptions = {
  corruptDownload?: boolean;
  concurrentSamples?: FakeRow[];
  deleteSamples?: boolean;
  failDeleteRpc?: boolean;
  failManifestInsert?: boolean;
  cleanupQueue?: FakeRow[];
  manifests?: FakeRow[];
  sampleRows?: FakeRow[];
  sessions?: FakeRow[];
};

class FakeArchiveClient {
  public readonly events: FakeEvent[] = [];
  public readonly objects = new Map<string, Uint8Array>();
  public readonly tables = new Map<string, FakeRow[]>();
  public readonly storage: {
    from: (bucket: string) => {
      download: (path: string) => Promise<{ data: Blob | null; error: FakeError | null }>;
      remove: (paths: string[]) => Promise<{ error: FakeError | null }>;
      upload: (
        path: string,
        body: Uint8Array,
        options: FakeRow,
      ) => Promise<{ data: FakeRow | null; error: FakeError | null }>;
    };
  };
  private readonly deleteSamples: boolean;
  private failDeleteRpc: boolean;
  private corruptNextDownload: boolean;
  private readonly concurrentSamples: FakeRow[];
  private readonly failManifestInsert: boolean;

  constructor(seed: Record<string, FakeRow[]>, options: FakeArchiveOptions = {}) {
    for (const [table, rows] of Object.entries(seed))
      this.tables.set(
        table,
        rows.map(row => ({ ...row })),
      );
    this.deleteSamples = options.deleteSamples !== false;
    this.failDeleteRpc = options.failDeleteRpc === true;
    this.corruptNextDownload = options.corruptDownload === true;
    this.concurrentSamples = options.concurrentSamples ?? [];
    this.failManifestInsert = options.failManifestInsert === true;
    this.storage = {
      from: (_bucket: string) => ({
        download: async (path: string) => {
          this.events.push({ kind: 'download', objectPath: path });
          const stored = this.objects.get(path);
          if (!stored) return { data: null, error: { message: 'Object not found' } };
          const downloaded = Uint8Array.from(stored);
          if (this.corruptNextDownload && downloaded.length > 0) {
            downloaded[0] = downloaded[0]! ^ 0xff;
            this.corruptNextDownload = false;
          }
          const bytes = Uint8Array.from(downloaded).buffer;
          const blob = { arrayBuffer: async () => bytes } as unknown as Blob;
          return { data: blob, error: null };
        },
        remove: async (paths: string[]) => {
          for (const path of paths) {
            this.events.push({ kind: 'delete', objectPath: path, table: 'storage.objects' });
            this.objects.delete(path);
          }
          return { error: null };
        },
        upload: async (path: string, body: Uint8Array, _uploadOptions: FakeRow) => {
          this.events.push({ kind: 'upload', objectPath: path });
          this.objects.set(path, Uint8Array.from(body));
          return { data: { path }, error: null };
        },
      }),
    };
  }

  public from(table: string): FakeQuery {
    return new FakeQuery(this, table);
  }

  public setDeleteRpcFailure(enabled: boolean): void {
    this.failDeleteRpc = enabled;
  }

  public async rpc(name: string, args: FakeRow): Promise<{ data: boolean; error: FakeError | null }> {
    this.events.push({ kind: 'rpc', table: name, args: { ...args } });
    if (name !== 'delete_archived_activity_stream_samples') {
      return { data: false, error: { message: `Unexpected RPC: ${name}` } };
    }
    if (this.failDeleteRpc) return { data: false, error: { message: 'Simulated guarded delete failure' } };
    const sessionId = args.p_session_id;
    const userId = args.p_user_id;
    const rows = this.tables.get('activity_stream_samples') ?? [];
    if (this.concurrentSamples.length > 0) {
      this.tables.set('activity_stream_samples', [...rows, ...this.concurrentSamples.map(row => ({ ...row }))]);
      return { data: false, error: null };
    }
    if (!this.deleteSamples) return { data: false, error: null };
    this.tables.set(
      'activity_stream_samples',
      rows.filter(row => row.session_id !== sessionId || row.user_id !== userId),
    );
    return { data: true, error: null };
  }

  public execute(query: FakeQuery): FakeQueryResult {
    const rows = this.tables.get(query.table) ?? [];
    if (query.operation === 'select') {
      this.events.push({ kind: 'select', table: query.table });
      const filtered = rows.filter(row => this.matches(row, query.conditions));
      if (query.countMode && query.headOnly) return { data: null, error: null, count: filtered.length };
      let selected = filtered.map(row => ({ ...row }));
      for (const sort of [...query.sorts].reverse()) {
        selected.sort((left, right) => {
          const leftValue = String(left[sort.column] ?? '');
          const rightValue = String(right[sort.column] ?? '');
          const comparison = leftValue.localeCompare(rightValue);
          return sort.ascending ? comparison : -comparison;
        });
      }
      if (query.startIndex !== null && query.endIndex !== null) {
        selected = selected.slice(query.startIndex, query.endIndex + 1);
      }
      if (query.rowLimit !== null) selected = selected.slice(0, query.rowLimit);
      return { data: selected, error: null, count: query.countMode ? filtered.length : null };
    }

    const payloadRows = query.payload === null ? [] : Array.isArray(query.payload) ? query.payload : [query.payload];
    if (query.operation === 'insert') {
      this.events.push({ kind: 'insert', table: query.table });
      if (query.table === 'activity_stream_archives' && this.failManifestInsert) {
        return { data: null, error: { message: 'Simulated manifest insert failure' }, count: null };
      }
      this.tables.set(query.table, [...rows, ...payloadRows.map(row => ({ ...row }))]);
      return { data: null, error: null, count: null };
    }
    if (query.operation === 'upsert') {
      this.events.push({ kind: 'upsert', table: query.table });
      const updated = [...rows];
      for (const payloadRow of payloadRows) {
        const conflictColumn = query.table === 'activity_stream_archive_cleanup_queue' ? 'object_path' : 'id';
        const existingIndex = updated.findIndex(row => row[conflictColumn] === payloadRow[conflictColumn]);
        if (existingIndex < 0) updated.push({ ...payloadRow });
        else updated[existingIndex] = { ...updated[existingIndex], ...payloadRow };
      }
      this.tables.set(query.table, updated);
      return { data: null, error: null, count: null };
    }
    if (query.operation === 'update') {
      this.events.push({ kind: 'update', table: query.table });
      const updatePayload = query.payload && !Array.isArray(query.payload) ? query.payload : {};
      this.tables.set(
        query.table,
        rows.map(row => (this.matches(row, query.conditions) ? { ...row, ...updatePayload } : row)),
      );
      return { data: null, error: null, count: null };
    }

    this.events.push({ kind: 'delete', table: query.table });
    this.tables.set(
      query.table,
      rows.filter(row => !this.matches(row, query.conditions)),
    );
    return { data: null, error: null, count: null };
  }

  private matches(row: FakeRow, conditions: FakeCondition[]): boolean {
    return conditions.every(condition => {
      const value = row[condition.column];
      if (condition.kind === 'eq') return value === condition.value;
      if (condition.kind === 'in') return condition.value.includes(value);
      if (condition.kind === 'lt') return String(value ?? '') < String(condition.value ?? '');
      if (condition.kind === 'not' && condition.operator === 'is' && condition.value === null) {
        return value !== null && value !== undefined;
      }
      return false;
    });
  }
}

const DAY_IN_MS = 24 * 60 * 60 * 1000;
const USER_ID = 'user-1';
const SESSION_ID = 'session-1';

function buildSession(sessionId = SESSION_ID, userId = USER_ID, ageInDays = 200): FakeRow {
  const startTime = new Date(Date.now() - ageInDays * DAY_IN_MS).toISOString();
  return {
    id: sessionId,
    user_id: userId,
    start_time: startTime,
    end_time: new Date(Date.parse(startTime) + 30 * 60 * 1000).toISOString(),
    status: 'completed',
  };
}

function buildSamples(sessionId = SESSION_ID, userId = USER_ID, includeInvalidCardioSample = true): FakeRow[] {
  const samples: FakeRow[] = [
    {
      id: 'sample-0001',
      session_id: sessionId,
      user_id: userId,
      stream_type: 'heart_rate',
      timestamp: '2026-05-03T09:00:00.000Z',
      offset_s: 0,
      value: 140,
    },
    {
      id: 'sample-0002',
      session_id: sessionId,
      user_id: userId,
      stream_type: 'speed',
      timestamp: null,
      offset_s: 1,
      value: 3.2,
    },
    {
      id: 'sample-0003',
      session_id: sessionId,
      user_id: userId,
      stream_type: 'cadence',
      timestamp: '2026-05-03T09:00:02.000Z',
      offset_s: 2,
      value: 170,
    },
  ];
  if (includeInvalidCardioSample) {
    samples.push({
      id: 'sample-0004',
      session_id: sessionId,
      user_id: userId,
      stream_type: 'power',
      timestamp: 'invalid-timestamp',
      offset_s: 3,
      value: 220,
    });
  }
  return samples;
}

function createFixture(options: FakeArchiveOptions = {}): {
  client: FakeArchiveClient;
  service: ActivityStreamArchiveService;
} {
  const seed = {
    activity_sessions: options.sessions ?? [buildSession()],
    activity_stream_samples: options.sampleRows ?? buildSamples(),
    activity_stream_archives: options.manifests ?? [],
    activity_stream_archive_cleanup_queue: options.cleanupQueue ?? [],
  };
  const client = new FakeArchiveClient(seed, options);
  const service = new ActivityStreamArchiveService({ client } as unknown as SupabaseAdminService);
  return { client, service };
}

async function assertPreviewIsReadOnlyAndHonorsRetention(): Promise<void> {
  const before = Date.now() - 90 * DAY_IN_MS;
  const sessions = [
    buildSession(),
    buildSession('recent-session', USER_ID, 10),
    { ...buildSession('planned-session'), status: 'planned' },
    { ...buildSession('open-session'), end_time: null },
  ];
  const { client, service } = createFixture({ sessions });

  const summary = await service.previewBefore(new Date(Date.now() + DAY_IN_MS));

  assert.equal(summary.eligible_sessions, 1);
  assert.equal(summary.minimum_age_days, 90);
  assert.ok(Date.parse(summary.effective_before) <= before + 1000);
  assert.equal(summary.source_sample_count, 4);
  assert.equal(summary.archived_sample_count, 2);
  assert.equal(summary.discarded_sample_count, 2);
  assert.equal(summary.sessions_without_cardio_samples, 0);
  assert.equal(
    client.events.some(event => event.kind !== 'select'),
    false,
  );
  assert.equal(client.objects.size, 0);
  assert.equal(client.tables.get('activity_stream_samples')?.length, 4);
}

async function assertInvalidCutoffIsRejected(): Promise<void> {
  const { service } = createFixture();

  await assert.rejects(service.previewBefore(new Date(Number.NaN)), (error: unknown) => {
    return error instanceof BadRequestException && error.message === 'ACTIVITY_STREAM_ARCHIVE_INVALID_CUTOFF';
  });
}

async function assertArchiveVerifiesCopyBeforeDeletingSource(): Promise<void> {
  const { client, service } = createFixture();

  const summary = await service.archiveBefore();

  assert.equal(summary.archived_sessions, 1);
  assert.equal(summary.source_sample_count, 4);
  assert.equal(summary.archived_sample_count, 2);
  assert.equal(summary.discarded_sample_count, 2);
  assert.equal(client.tables.get('activity_stream_samples')?.length, 0);
  assert.equal(client.tables.get('activity_stream_archives')?.length, 1);
  assert.equal(client.objects.size, 1);

  const uploadIndex = client.events.findIndex(event => event.kind === 'upload');
  const downloadIndex = client.events.findIndex(event => event.kind === 'download');
  const manifestIndex = client.events.findIndex(
    event => event.kind === 'insert' && event.table === 'activity_stream_archives',
  );
  const deleteIndex = client.events.findIndex(event => event.kind === 'rpc');
  assert.ok(uploadIndex >= 0 && uploadIndex < downloadIndex);
  assert.ok(downloadIndex < manifestIndex);
  assert.ok(manifestIndex < deleteIndex);
  const deleteEvent = client.events[deleteIndex];
  assert.equal(deleteEvent?.kind, 'rpc');
  assert.equal(deleteEvent?.args?.p_expected_sample_count, 4);
  assert.equal(deleteEvent?.args?.p_minimum_age_days, 90);
  assert.match(String(deleteEvent?.args?.p_expected_ids_md5), /^[a-f0-9]{32}$/);

  const compressed = client.objects.values().next().value as Uint8Array;
  const payload = JSON.parse(gunzipSync(compressed).toString('utf8')) as {
    samples: Array<{ stream_type: string }>;
  };
  assert.deepEqual(
    payload.samples.map(sample => sample.stream_type),
    ['heart_rate', 'speed'],
  );
}

async function assertCorruptArchiveNeverDeletesSource(): Promise<void> {
  const { client, service } = createFixture({ corruptDownload: true });

  await assert.rejects(
    service.archiveBefore(),
    (error: unknown) =>
      error instanceof InternalServerErrorException && error.message === 'ACTIVITY_STREAM_ARCHIVE_CHECKSUM_MISMATCH',
  );

  assert.equal(client.tables.get('activity_stream_samples')?.length, 4);
  assert.equal(client.tables.get('activity_stream_archives')?.length, 0);
  assert.equal(
    client.events.some(event => event.kind === 'rpc'),
    false,
  );
  assert.equal(client.tables.get('activity_stream_archive_cleanup_queue')?.length, 1);

  const retry = await service.archiveBefore();
  assert.equal(retry.archived_sessions, 1);
  assert.equal(client.tables.get('activity_stream_samples')?.length, 0);
  assert.equal(client.tables.get('activity_stream_archive_cleanup_queue')?.length, 0);
  assert.ok(client.events.some(event => event.kind === 'delete' && event.table === 'storage.objects'));
}

async function assertConcurrentResyncKeepsRowsAndReadMergesDuplicates(): Promise<void> {
  const updatedHeartRate = {
    id: 'sample-resynced-hr',
    session_id: SESSION_ID,
    user_id: USER_ID,
    stream_type: 'heart_rate',
    timestamp: '2026-05-03T09:00:01.000Z',
    offset_s: 0,
    value: 145,
  };
  const addedPower = {
    id: 'sample-resynced-power',
    session_id: SESSION_ID,
    user_id: USER_ID,
    stream_type: 'power',
    timestamp: '2026-05-03T09:00:04.000Z',
    offset_s: 4,
    value: 220,
  };
  const { client, service } = createFixture({
    deleteSamples: false,
    concurrentSamples: [updatedHeartRate, addedPower],
    sampleRows: buildSamples(SESSION_ID, USER_ID, false),
  });

  const summary = await service.archiveBefore();
  const result = await service.readForUser(USER_ID, [SESSION_ID]);

  assert.equal(summary.changed_during_archive_sessions, 1);
  assert.equal(client.tables.get('activity_stream_samples')?.length, 5);
  assert.deepEqual(result.archived_session_ids, [SESSION_ID]);
  assert.equal(result.samples.length, 3);
  assert.deepEqual(
    result.samples.map(sample => [sample.stream_type, sample.value]),
    [
      ['heart_rate', 145],
      ['speed', 3.2],
      ['power', 220],
    ],
  );
}

async function assertChangedSampleValuesAreNotTreatedAsExactDuplicates(): Promise<void> {
  const { client, service } = createFixture();
  await service.archiveBefore();
  const liveRows = buildSamples();
  client.tables.set(
    'activity_stream_samples',
    liveRows.map(row => (row.id === 'sample-0001' ? { ...row, value: 151 } : row)),
  );
  const rpcCountBeforeRetry = client.events.filter(event => event.kind === 'rpc').length;

  const summary = await service.archiveBefore();
  const result = await service.readForUser(USER_ID, [SESSION_ID]);

  assert.equal(summary.cleaned_duplicate_sessions, 0);
  assert.equal(summary.already_archived_sessions, 1);
  assert.equal(client.events.filter(event => event.kind === 'rpc').length, rpcCountBeforeRetry);
  assert.equal(client.tables.get('activity_stream_samples')?.length, 4);
  assert.equal(result.samples.find(sample => sample.stream_type === 'heart_rate')?.value, 151);
}

async function assertCorruptStoredArchiveIsRejectedOnRead(): Promise<void> {
  const { client, service } = createFixture();
  await service.archiveBefore();
  const archivePath = [...client.objects.keys()][0];
  assert.ok(archivePath);
  const stored = client.objects.get(archivePath);
  assert.ok(stored && stored.length > 0);
  const corrupted = Uint8Array.from(stored);
  corrupted[0] = corrupted[0]! ^ 0xff;
  client.objects.set(archivePath, corrupted);

  await assert.rejects(service.readForUser(USER_ID, [SESSION_ID]), (error: unknown) => {
    return (
      error instanceof InternalServerErrorException && error.message === 'ACTIVITY_STREAM_ARCHIVE_CHECKSUM_MISMATCH'
    );
  });
}

async function assertManifestFailureKeepsSourceAndQueuesOrphan(): Promise<void> {
  const { client, service } = createFixture({ failManifestInsert: true });

  await assert.rejects(service.archiveBefore(), (error: unknown) => {
    return (
      error instanceof InternalServerErrorException && error.message === 'ACTIVITY_STREAM_ARCHIVE_MANIFEST_WRITE_FAILED'
    );
  });

  assert.equal(client.tables.get('activity_stream_samples')?.length, 4);
  assert.equal(client.tables.get('activity_stream_archives')?.length, 0);
  assert.equal(client.tables.get('activity_stream_archive_cleanup_queue')?.length, 1);
  assert.equal(
    client.events.some(event => event.kind === 'rpc'),
    false,
  );
}

async function assertDeleteFailureLeavesVerifiedArchiveAndIsRetryable(): Promise<void> {
  const { client, service } = createFixture({
    failDeleteRpc: true,
    sampleRows: buildSamples(SESSION_ID, USER_ID, false),
  });

  await assert.rejects(service.archiveBefore(), (error: unknown) => {
    return (
      error instanceof InternalServerErrorException && error.message === 'ACTIVITY_STREAM_ARCHIVE_SAMPLE_DELETE_FAILED'
    );
  });
  assert.equal(client.tables.get('activity_stream_archives')?.length, 1);
  assert.equal(client.tables.get('activity_stream_samples')?.length, 3);

  const read = await service.readForUser(USER_ID, [SESSION_ID]);
  assert.equal(read.samples.length, 2);
  client.setDeleteRpcFailure(false);
  const retry = await service.archiveBefore();

  assert.equal(retry.cleaned_duplicate_sessions, 1);
  assert.equal(client.tables.get('activity_stream_samples')?.length, 0);
  assert.equal(client.tables.get('activity_stream_archives')?.length, 1);
}

async function assertStorageBudgetStopsBeforeArchiveWrites(): Promise<void> {
  const { client, service } = createFixture({
    manifests: [
      {
        session_id: 'existing-session',
        user_id: 'other-user',
        object_path: 'other-user/existing-session/archive.json.gz',
        sample_count: 1,
        compressed_bytes: 512 * 1024 * 1024,
        sha256: 'a'.repeat(64),
        archive_version: 2,
        source_sample_count: 1,
        source_sample_ids_md5: 'b'.repeat(32),
      },
    ],
  });

  await assert.rejects(
    service.archiveBefore(),
    (error: unknown) =>
      error instanceof ServiceUnavailableException &&
      error.message === 'ACTIVITY_STREAM_ARCHIVE_STORAGE_BUDGET_EXCEEDED',
  );

  assert.equal(client.objects.size, 0);
  assert.equal(
    client.events.some(event => event.kind === 'upload' || event.kind === 'rpc'),
    false,
  );
  assert.equal(client.tables.get('activity_stream_samples')?.length, 4);
}

async function assertExactLiveDuplicateIsRemovedOnRetry(): Promise<void> {
  const { client, service } = createFixture();
  const originalSamples = buildSamples();
  await service.archiveBefore();
  client.tables.set('activity_stream_samples', originalSamples);

  const preview = await service.previewBefore();
  const retrySummary = await service.archiveBefore();

  assert.equal(preview.duplicate_live_sessions, 1);
  assert.equal(preview.duplicate_sample_count, 2);
  assert.equal(retrySummary.cleaned_duplicate_sessions, 1);
  assert.equal(client.tables.get('activity_stream_samples')?.length, 0);
  assert.equal(client.events.filter(event => event.kind === 'upload').length, 1);
}

async function assertDiscardOnlySamplesAreRemovedWithoutCreatingArchive(): Promise<void> {
  const samples = [
    {
      id: 'cadence-1',
      session_id: SESSION_ID,
      user_id: USER_ID,
      stream_type: 'cadence',
      timestamp: '2026-05-03T09:00:00.000Z',
      offset_s: 0,
      value: 170,
    },
  ];
  const { client, service } = createFixture({ sampleRows: samples });

  const summary = await service.archiveBefore();

  assert.equal(summary.sessions_without_cardio_samples, 1);
  assert.equal(summary.discarded_only_sessions, 1);
  assert.equal(summary.discarded_sample_count, 1);
  assert.equal(client.tables.get('activity_stream_samples')?.length, 0);
  assert.equal(client.tables.get('activity_stream_archives')?.length, 0);
  assert.equal(client.objects.size, 0);
}

async function assertSamplePaginationDoesNotTruncateArchive(): Promise<void> {
  const sampleRows = Array.from({ length: 1001 }, (_, index) => ({
    id: `sample-${String(index).padStart(4, '0')}`,
    session_id: SESSION_ID,
    user_id: USER_ID,
    stream_type: 'heart_rate',
    timestamp: new Date(Date.parse('2026-05-03T09:00:00.000Z') + index * 1000).toISOString(),
    offset_s: index,
    value: 100 + (index % 80),
  }));
  const { client, service } = createFixture({ sampleRows });

  const summary = await service.archiveBefore();
  const archiveBytes = [...client.objects.values()][0];
  assert.ok(archiveBytes);
  const payload = JSON.parse(gunzipSync(archiveBytes).toString('utf8')) as { samples: unknown[] };

  assert.equal(summary.source_sample_count, 1001);
  assert.equal(summary.archived_sample_count, 1001);
  assert.equal(payload.samples.length, 1001);
  assert.equal(client.tables.get('activity_stream_samples')?.length, 0);
}

async function assertReadDoesNotLeakOtherUsersArchives(): Promise<void> {
  const otherUserId = 'user-2';
  const otherSessionId = 'session-2';
  const { service } = createFixture({
    sessions: [buildSession(), buildSession(otherSessionId, otherUserId)],
    sampleRows: [...buildSamples(), ...buildSamples(otherSessionId, otherUserId, false)],
  });
  await service.archiveBefore();

  const result = await service.readForUser(USER_ID, [SESSION_ID, otherSessionId]);

  assert.deepEqual(result.archived_session_ids, [SESSION_ID]);
  assert.ok(result.samples.every(sample => sample.session_id === SESSION_ID));
}

async function assertLegacyArchiveVersionRemainsReadable(): Promise<void> {
  const legacySample = {
    id: 'legacy-sample-1',
    session_id: SESSION_ID,
    user_id: USER_ID,
    stream_type: 'heart_rate',
    timestamp: '2026-05-03T09:00:00.000Z',
    offset_s: 0,
    value: 140,
    created_at: '2026-05-03T09:00:00.000Z',
  };
  const payload = {
    archive_version: 1,
    session_id: SESSION_ID,
    user_id: USER_ID,
    sample_count: 1,
    samples: [legacySample],
  };
  const compressed = gzipSync(new Uint8Array(Buffer.from(JSON.stringify(payload))));
  const checksum = createHash('sha256').update(new Uint8Array(compressed)).digest('hex');
  const objectPath = `${USER_ID}/${SESSION_ID}/${checksum}.json.gz`;
  const { client, service } = createFixture({
    sessions: [],
    sampleRows: [],
    manifests: [
      {
        session_id: SESSION_ID,
        user_id: USER_ID,
        object_path: objectPath,
        sample_count: 1,
        compressed_bytes: compressed.byteLength,
        sha256: checksum,
        archive_version: 1,
        source_sample_count: 1,
        source_sample_ids_md5: null,
        archived_at: '2026-05-03T09:00:00.000Z',
      },
    ],
  });
  client.objects.set(objectPath, Uint8Array.from(compressed));

  const result = await service.readForUser(USER_ID, [SESSION_ID]);

  assert.deepEqual(result.archived_session_ids, [SESSION_ID]);
  assert.deepEqual(result.samples, [
    {
      session_id: SESSION_ID,
      stream_type: 'heart_rate',
      timestamp: '2026-05-03T09:00:00.000Z',
      offset_s: 0,
      value: 140,
    },
  ]);
}

async function assertCleanupNeverRemovesManifestReferencedArchive(): Promise<void> {
  const objectPath = `${USER_ID}/old-session/${'a'.repeat(64)}.json.gz`;
  const { client, service } = createFixture({
    cleanupQueue: [{ object_path: objectPath, user_id: USER_ID, attempts: 0, queued_at: '2026-01-01T00:00:00.000Z' }],
    manifests: [
      {
        session_id: 'old-session',
        user_id: USER_ID,
        object_path: objectPath,
        sample_count: 1,
        compressed_bytes: 100,
        sha256: 'a'.repeat(64),
        archive_version: 2,
        source_sample_count: 1,
        source_sample_ids_md5: 'b'.repeat(32),
        archived_at: '2026-01-01T00:00:00.000Z',
      },
    ],
    sessions: [],
    sampleRows: [],
  });
  client.objects.set(objectPath, Uint8Array.from([1, 2, 3]));

  const summary = await service.archiveBefore();

  assert.equal(summary.cleaned_archive_objects, 0);
  assert.equal(client.tables.get('activity_stream_archive_cleanup_queue')?.length, 0);
  assert.deepEqual([...client.objects.keys()], [objectPath]);
  assert.equal(
    client.events.some(event => event.kind === 'delete' && event.objectPath === objectPath),
    false,
  );
}

async function run(): Promise<void> {
  await assertPreviewIsReadOnlyAndHonorsRetention();
  await assertInvalidCutoffIsRejected();
  await assertArchiveVerifiesCopyBeforeDeletingSource();
  await assertCorruptArchiveNeverDeletesSource();
  await assertConcurrentResyncKeepsRowsAndReadMergesDuplicates();
  await assertChangedSampleValuesAreNotTreatedAsExactDuplicates();
  await assertCorruptStoredArchiveIsRejectedOnRead();
  await assertManifestFailureKeepsSourceAndQueuesOrphan();
  await assertDeleteFailureLeavesVerifiedArchiveAndIsRetryable();
  await assertStorageBudgetStopsBeforeArchiveWrites();
  await assertExactLiveDuplicateIsRemovedOnRetry();
  await assertDiscardOnlySamplesAreRemovedWithoutCreatingArchive();
  await assertSamplePaginationDoesNotTruncateArchive();
  await assertReadDoesNotLeakOtherUsersArchives();
  await assertLegacyArchiveVersionRemainsReadable();
  await assertCleanupNeverRemovesManifestReferencedArchive();
  console.log('Activity stream archive verification passed (16 scenarios).');
}

void run().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
