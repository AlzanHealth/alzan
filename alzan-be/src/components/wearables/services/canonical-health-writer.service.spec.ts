import { strict as assert } from 'assert';
import { InternalServerErrorException } from '@nestjs/common';
import { SupabaseAdminService } from '../../../core/supabase/supabase.service';
import { ProviderDailyActivityCanonical } from '../../activity-import/parsers/activity-import-canonical.types';
import { UpsertDailyActivityInput } from '../domain/wearable.types';
import { RawPayloadService } from './raw-payload.service';
import { CanonicalHealthWriterService } from './canonical-health-writer.service';

type FakeSupabaseError = {
  code: string;
  details: string;
  hint: string;
  message: string;
};

type Filter = {
  column: string;
  mode: 'eq' | 'is';
  value: unknown;
};

type Mutation = {
  filters: Filter[];
  payload?: Record<string, unknown>;
  rows?: Array<Record<string, unknown>>;
  table: string;
};

type FakeResult = {
  data?: Record<string, unknown> | null;
  error: FakeSupabaseError | null;
};

interface FakeQuery extends PromiseLike<FakeResult> {
  eq(column: string, value: unknown): FakeQuery;
  is(column: string, value: unknown): FakeQuery;
  maybeSingle(): Promise<FakeResult>;
  select(columns?: string): FakeQuery;
  single(): Promise<FakeResult>;
}

interface FakeTable {
  delete(): FakeQuery;
  insert(payload: Array<Record<string, unknown>> | Record<string, unknown>): FakeQuery;
  select(columns?: string): FakeQuery;
  update(payload: Record<string, unknown>): FakeQuery;
}

class FakeSupabaseClient {
  public readonly deletes: Mutation[] = [];
  public readonly inserts: Mutation[] = [];
  public readonly updates: Mutation[] = [];
  public readonly selectFilters: Mutation[] = [];
  public insertDailyStepsError: FakeSupabaseError | null = null;
  private dailyStepsLookupCount = 0;

  public constructor(public readonly rows: Record<string, Array<Record<string, unknown>>>) {}

  public from(table: string): FakeTable {
    return {
      delete: () => this.createQuery(table, 'delete'),
      insert: payload => this.createQuery(table, 'insert', undefined, Array.isArray(payload) ? payload : [payload]),
      select: () => this.createQuery(table, 'select'),
      update: payload => this.createQuery(table, 'update', payload),
    };
  }

  private createQuery(
    table: string,
    kind: 'delete' | 'insert' | 'select' | 'update',
    payload?: Record<string, unknown>,
    rows?: Array<Record<string, unknown>>,
  ): FakeQuery {
    const filters: Filter[] = [];
    const matches = (row: Record<string, unknown>): boolean =>
      filters.every(filter => {
        if (filter.mode === 'is') return row[filter.column] === filter.value;
        return row[filter.column] === filter.value;
      });
    const execute = (): FakeResult => {
      if (kind === 'insert') {
        this.inserts.push({ filters: [...filters], rows, table });
        if (table === 'daily_steps' && this.insertDailyStepsError) {
          return { data: null, error: this.insertDailyStepsError };
        }
        if (table === 'daily_steps') {
          const insertedId = rows?.[0]?.id ?? 'inserted-daily-steps-id';
          return { data: { id: insertedId }, error: null };
        }
        return { data: null, error: null };
      }
      if (kind === 'update') {
        this.updates.push({ filters: [...filters], payload, table });
        this.rows[table] = (this.rows[table] ?? []).map(row => (matches(row) ? { ...row, ...payload } : row));
        return { data: null, error: null };
      }
      if (kind === 'delete') {
        this.deletes.push({ filters: [...filters], table });
        this.rows[table] = (this.rows[table] ?? []).filter(row => !matches(row));
        return { data: null, error: null };
      }
      return { data: null, error: null };
    };
    const query: FakeQuery = {
      eq: (column: string, value: unknown): FakeQuery => {
        filters.push({ column, mode: 'eq', value });
        return query;
      },
      is: (column: string, value: unknown): FakeQuery => {
        filters.push({ column, mode: 'is', value });
        return query;
      },
      maybeSingle: async (): Promise<FakeResult> => {
        this.selectFilters.push({ filters: [...filters], table });
        const tableRows = this.rows[table] ?? [];
        if (table === 'daily_steps') {
          this.dailyStepsLookupCount += 1;
          if (this.dailyStepsLookupCount === 1) return { data: null, error: null };
        }
        return { data: tableRows.find(matches) ?? null, error: null };
      },
      select: (): FakeQuery => query,
      single: async (): Promise<FakeResult> => execute(),
      then: <TResult1 = FakeResult, TResult2 = never>(
        onfulfilled?: ((value: FakeResult) => TResult1 | PromiseLike<TResult1>) | null,
        onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
      ): PromiseLike<TResult1 | TResult2> => Promise.resolve(execute()).then(onfulfilled, onrejected),
    };
    return query;
  }
}

class FakeRawPayloadService {
  public readonly links: Array<{ rawPayloadId: string | null; relatedId: string; relatedTable: string }> = [];

  public async linkPayload(input: {
    rawPayloadId: string | null;
    relatedId: string;
    relatedTable: string;
  }): Promise<void> {
    this.links.push(input);
  }
}

function dailyActivity(): ProviderDailyActivityCanonical<'garmin'> {
  return {
    source: 'garmin',
    sourceRecordId: 'garmin-daily-2026-06-25',
    sourceUpdatedAt: '2026-06-25T23:59:00.000Z',
    date: '2026-06-25',
    timezone: 'Europe/Madrid',
    totalSteps: 9300,
    caloriesKcal: 410,
    distanceM: 6800,
    intervals: [
      {
        startTime: '2026-06-25T08:00:00.000Z',
        endTime: '2026-06-25T09:00:00.000Z',
        steps: 1200,
        caloriesKcal: 60,
        distanceM: 850,
        rawPayload: { bucket: 'morning' },
      },
      {
        startTime: '2026-06-25T09:00:00.000Z',
        endTime: null,
        steps: 400,
        caloriesKcal: 20,
        distanceM: 270,
        rawPayload: { bucket: 'open-ended' },
      },
    ],
    rawPayload: { summaryId: 'garmin-daily-2026-06-25' },
  };
}

function createInput(): UpsertDailyActivityInput {
  return {
    userId: 'user-1',
    dailyActivity: dailyActivity(),
    provenance: {
      provider: 'garmin',
      sourceChannel: 'cloud',
      sourcePackage: null,
      sourceProviderKey: 'garmin-connect',
      sourceRecordId: 'garmin-daily-2026-06-25',
      sourceUpdatedAt: '2026-06-25T23:59:00.000Z',
      rawPayloadId: 'raw-1',
    },
  };
}

async function assertDailyActivityConflictFallsBackToUpdate(): Promise<void> {
  const conflictError: FakeSupabaseError = {
    code: '23505',
    details: '',
    hint: '',
    message: 'duplicate key value violates unique constraint "uq_daily_steps_source_package"',
  };
  const client = new FakeSupabaseClient({
    daily_steps: [
      {
        date: '2026-06-25',
        id: 'existing-daily-steps-id',
        source: 'garmin',
        source_package: null,
        user_id: 'user-1',
      },
    ],
    step_intervals: [{ daily_steps_id: 'existing-daily-steps-id', id: 'stale-interval' }],
  });
  client.insertDailyStepsError = conflictError;
  const rawPayloadService = new FakeRawPayloadService();
  const service = new CanonicalHealthWriterService(
    { client } as unknown as SupabaseAdminService,
    rawPayloadService as unknown as RawPayloadService,
  );

  const dailyStepsId = await service.upsertDailyActivity(createInput());

  assert.equal(dailyStepsId, 'existing-daily-steps-id');
  assert.equal(client.inserts.filter(insert => insert.table === 'daily_steps').length, 1);
  assert.equal(client.updates.filter(update => update.table === 'daily_steps').length, 1);
  assert.equal(client.deletes.filter(item => item.table === 'step_intervals').length, 1);
  assert.equal(client.inserts.filter(insert => insert.table === 'step_intervals')[0]?.rows?.length, 1);
  assert.deepEqual(rawPayloadService.links, [
    { rawPayloadId: 'raw-1', relatedTable: 'daily_steps', relatedId: 'existing-daily-steps-id' },
  ]);
}

async function assertNonConflictInsertErrorStillFails(): Promise<void> {
  const client = new FakeSupabaseClient({ daily_steps: [] });
  client.insertDailyStepsError = {
    code: '42501',
    details: '',
    hint: '',
    message: 'permission denied',
  };
  const service = new CanonicalHealthWriterService(
    { client } as unknown as SupabaseAdminService,
    new FakeRawPayloadService() as unknown as RawPayloadService,
  );

  await assert.rejects(() => service.upsertDailyActivity(createInput()), InternalServerErrorException);
}

async function run(): Promise<void> {
  await assertDailyActivityConflictFallsBackToUpdate();
  await assertNonConflictInsertErrorStillFails();
}

void run();
