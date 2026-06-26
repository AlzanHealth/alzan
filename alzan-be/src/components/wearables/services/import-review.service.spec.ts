import { strict as assert } from 'assert';
import { NotFoundException } from '@nestjs/common';
import { SupabaseAdminService } from '../../../core/supabase/supabase.service';
import { ImportReconciliationService } from './import-reconciliation.service';
import { ImportReviewService } from './import-review.service';
import { RawPayloadService } from './raw-payload.service';

type FakeSupabaseError = {
  message: string;
};

type FakeFilter = {
  column: string;
  value: unknown;
};

type FakeOperation = {
  filters: FakeFilter[];
  payload?: Record<string, unknown>;
  table: string;
};

type FakeRpcOperation = {
  args: Record<string, unknown>;
  name: string;
};

type FakeQueryResult = {
  data?: Record<string, unknown> | null;
  error: FakeSupabaseError | null;
};

interface FakeSupabaseQueryClient extends PromiseLike<{ error: FakeSupabaseError | null }> {
  eq(column: string, value: unknown): FakeSupabaseQueryClient;
  maybeSingle(): Promise<FakeQueryResult>;
  select(columns: string): FakeSupabaseQueryClient;
  update(payload: Record<string, unknown>): FakeSupabaseQueryClient;
}

interface FakeSupabaseTableClient {
  select(columns: string): FakeSupabaseQueryClient;
  update(payload: Record<string, unknown>): FakeSupabaseQueryClient;
}

interface FakeSupabaseClient {
  rows: Record<string, Array<Record<string, unknown>>>;
  rpcCalls: FakeRpcOperation[];
  updates: FakeOperation[];
  from(table: string): FakeSupabaseTableClient;
  rpc(name: string, args: Record<string, unknown>): Promise<{ error: FakeSupabaseError | null }>;
}

type FakeReconciliationService = Pick<
  ImportReconciliationService,
  'buildPendingWatchMetrics' | 'runEnduranceTemplateMatch'
> & {
  templateMatches: string[];
};

function matchesFilters(row: Record<string, unknown>, filters: FakeFilter[]): boolean {
  return filters.every(filter => row[filter.column] === filter.value);
}

function createQueryClient(
  client: FakeSupabaseClient,
  table: string,
  initialPayload?: Record<string, unknown>,
): FakeSupabaseQueryClient {
  const filters: FakeFilter[] = [];
  let payload = initialPayload;
  const execute = (): { error: FakeSupabaseError | null } => {
    if (payload) {
      client.updates.push({ filters: [...filters], payload, table });
      client.rows[table] = (client.rows[table] ?? []).map(row =>
        matchesFilters(row, filters) ? { ...row, ...payload } : row,
      );
    }
    return { error: null };
  };
  const query: FakeSupabaseQueryClient = {
    eq(column: string, value: unknown): FakeSupabaseQueryClient {
      filters.push({ column, value });
      return query;
    },
    async maybeSingle(): Promise<FakeQueryResult> {
      const data = (client.rows[table] ?? []).find(row => matchesFilters(row, filters)) ?? null;
      return { data, error: null };
    },
    select(): FakeSupabaseQueryClient {
      return query;
    },
    update(nextPayload: Record<string, unknown>): FakeSupabaseQueryClient {
      payload = nextPayload;
      return query;
    },
    then<TResult1 = { error: FakeSupabaseError | null }, TResult2 = never>(
      onfulfilled?: ((value: { error: FakeSupabaseError | null }) => TResult1 | PromiseLike<TResult1>) | null,
      onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ): PromiseLike<TResult1 | TResult2> {
      return Promise.resolve(execute()).then(onfulfilled, onrejected);
    },
  };
  return query;
}

function createFakeSupabaseClient(rows: Record<string, Array<Record<string, unknown>>>): FakeSupabaseClient {
  const client: FakeSupabaseClient = {
    rows,
    rpcCalls: [],
    updates: [],
    from(table: string): FakeSupabaseTableClient {
      return {
        select(): FakeSupabaseQueryClient {
          return createQueryClient(client, table);
        },
        update(payload: Record<string, unknown>): FakeSupabaseQueryClient {
          return createQueryClient(client, table, payload);
        },
      };
    },
    async rpc(name: string, args: Record<string, unknown>): Promise<{ error: FakeSupabaseError | null }> {
      client.rpcCalls.push({ args, name });
      if (name === 'absorb_and_delete_session') {
        client.rows.activity_sessions = (client.rows.activity_sessions ?? []).filter(row => row.id !== args.p_source);
      }
      return { error: null };
    },
  };
  return client;
}

function createReconciliationService(): FakeReconciliationService {
  return {
    templateMatches: [],
    buildPendingWatchMetrics: () => null,
    async runEnduranceTemplateMatch(_userId: string, sessionId: string): Promise<void> {
      this.templateMatches.push(sessionId);
    },
  };
}

function createService(
  client: FakeSupabaseClient,
  reconciliation = createReconciliationService(),
): ImportReviewService {
  const supabaseAdminService = { client } as unknown as SupabaseAdminService;
  return new ImportReviewService(
    supabaseAdminService,
    { linkPayload: async () => undefined } as unknown as RawPayloadService,
    reconciliation as unknown as ImportReconciliationService,
  );
}

function baseSession(overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    id: 'session-1',
    user_id: 'user-1',
    sport_type: 'running',
    start_time: '2026-06-15T10:00:00Z',
    status: 'completed',
    source: 'manual',
    ...overrides,
  };
}

async function assertMergeIsIdempotentWhenSourceWasAlreadyDeleted(): Promise<void> {
  const service = createService(
    createFakeSupabaseClient({
      activity_sessions: [baseSession({ id: 'survivor-session' })],
    }),
  );

  const survivorId = await service.mergeDuplicate('user-1', 'already-deleted-import', 'survivor-session');

  assert.equal(survivorId, 'survivor-session');
}

async function assertMissingSourceWithoutTargetStillFails(): Promise<void> {
  const service = createService(createFakeSupabaseClient({ activity_sessions: [] }));

  await assert.rejects(
    () => service.keepWatchMetrics('user-1', 'missing-session'),
    (error: unknown) => error instanceof NotFoundException,
  );
}

async function assertAssociateTemplateUsesTargetWhenSourceWasDeleted(): Promise<void> {
  const client = createFakeSupabaseClient({
    activity_sessions: [baseSession({ id: 'survivor-session', endurance_template_id: null })],
    endurance_workout_templates: [{ id: 'template-1', user_id: 'user-1', sport_type: 'running' }],
  });
  const service = createService(client);

  const sessionId = await service.associateTemplate(
    'user-1',
    'deleted-import',
    { enduranceTemplateId: 'template-1' },
    'survivor-session',
  );

  assert.equal(sessionId, 'survivor-session');
  assert.equal(client.rows.activity_sessions[0].endurance_template_id, 'template-1');
  assert.equal(
    client.updates.some(
      update =>
        update.table === 'activity_sessions' &&
        update.filters.some(filter => filter.column === 'id' && filter.value === 'deleted-import'),
    ),
    false,
  );
}

async function assertAssociateTemplateUsesTargetForPendingDuplicate(): Promise<void> {
  const client = createFakeSupabaseClient({
    activity_sessions: [
      baseSession({
        id: 'imported-session',
        duplicate_of_session_id: 'survivor-session',
        duplicate_resolution: 'pending',
        duplicate_score: 95,
        source: 'imported',
      }),
      baseSession({ id: 'survivor-session', endurance_template_id: null }),
    ],
    endurance_workout_templates: [{ id: 'template-1', user_id: 'user-1', sport_type: 'running' }],
  });
  const service = createService(client);

  const sessionId = await service.associateTemplate(
    'user-1',
    'imported-session',
    { enduranceTemplateId: 'template-1' },
    'survivor-session',
  );

  const imported = client.rows.activity_sessions.find(row => row.id === 'imported-session');
  const survivor = client.rows.activity_sessions.find(row => row.id === 'survivor-session');
  assert.equal(sessionId, 'survivor-session');
  assert.equal(imported?.endurance_template_id ?? null, null);
  assert.equal(survivor?.endurance_template_id, 'template-1');
}

async function assertAssignStrengthIsIdempotentWhenSourceWasDeleted(): Promise<void> {
  const client = createFakeSupabaseClient({
    activity_sessions: [baseSession({ id: 'strength-target', sport_type: 'strength' })],
  });
  const service = createService(client);

  const sessionId = await service.assignStrengthSession('user-1', 'deleted-import', 'strength-target');

  assert.equal(sessionId, 'strength-target');
  assert.equal(client.rpcCalls.length, 0);
}

async function assertReviewNoOpsAreIdempotentOnResolvedState(): Promise<void> {
  const reconciliation = createReconciliationService();
  const client = createFakeSupabaseClient({
    activity_sessions: [
      baseSession({
        id: 'resolved-session',
        duplicate_resolution: 'merged',
        endurance_template_id: 'template-1',
        pending_watch_metrics: null,
        suggested_endurance_template_id: null,
      }),
    ],
  });
  const service = createService(client, reconciliation);

  assert.equal(await service.dismissSuggestion('user-1', 'resolved-session'), 'resolved-session');
  assert.equal(await service.keepWatchMetrics('user-1', 'resolved-session'), 'resolved-session');
  assert.equal(await service.revertWatchMetrics('user-1', 'resolved-session'), 'resolved-session');
  assert.equal(await service.keepBothDuplicates('user-1', 'resolved-session'), 'resolved-session');
  assert.deepEqual(reconciliation.templateMatches, []);
}

async function assertExpiredWatchMetricsCleanupKeepsCurrentWatchValues(): Promise<void> {
  const client = createFakeSupabaseClient({
    activity_sessions: [
      baseSession({
        id: 'expired-watch-session',
        duration_s: 3600,
        avg_heart_rate: 130,
        pending_watch_metrics: {
          previous: { duration_s: 3000, avg_heart_rate: 110 },
          received_at: '2026-06-22T09:59:59.000Z',
        },
      }),
    ],
  });
  const service = createService(client);

  const sessionId = await service.clearExpiredWatchMetricsReview(
    'user-1',
    'expired-watch-session',
    new Date('2026-06-26T10:00:00.000Z'),
  );

  const session = client.rows.activity_sessions[0];
  assert.equal(sessionId, 'expired-watch-session');
  assert.equal(session.duration_s, 3600);
  assert.equal(session.avg_heart_rate, 130);
  assert.equal(session.pending_watch_metrics, null);
}

async function assertExpiredWatchMetricsRevertKeepsWatchValues(): Promise<void> {
  const client = createFakeSupabaseClient({
    activity_sessions: [
      baseSession({
        id: 'old-watch-session',
        duration_s: 3600,
        avg_heart_rate: 130,
        pending_watch_metrics: {
          previous: { duration_s: 3000, avg_heart_rate: 110 },
          received_at: '2020-01-01T00:00:00.000Z',
        },
      }),
    ],
  });
  const service = createService(client);

  const sessionId = await service.revertWatchMetrics('user-1', 'old-watch-session');

  const session = client.rows.activity_sessions[0];
  assert.equal(sessionId, 'old-watch-session');
  assert.equal(session.duration_s, 3600);
  assert.equal(session.avg_heart_rate, 130);
  assert.equal(session.pending_watch_metrics, null);
}

async function run(): Promise<void> {
  await assertMergeIsIdempotentWhenSourceWasAlreadyDeleted();
  await assertMissingSourceWithoutTargetStillFails();
  await assertAssociateTemplateUsesTargetWhenSourceWasDeleted();
  await assertAssociateTemplateUsesTargetForPendingDuplicate();
  await assertAssignStrengthIsIdempotentWhenSourceWasDeleted();
  await assertReviewNoOpsAreIdempotentOnResolvedState();
  await assertExpiredWatchMetricsCleanupKeepsCurrentWatchValues();
  await assertExpiredWatchMetricsRevertKeepsWatchValues();
}

void run();
