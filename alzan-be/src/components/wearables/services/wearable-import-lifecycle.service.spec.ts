import { strict as assert } from 'assert';
import { SupabaseAdminService } from '../../../core/supabase/supabase.service';
import { WearableImportLifecycleService } from './wearable-import-lifecycle.service';

type QueryResponse = { data: unknown; error: null };

function createQuery(response: QueryResponse, calls: Array<{ method: string; args: unknown[] }>) {
  const query = {
    select: (...args: unknown[]) => {
      calls.push({ method: 'select', args });
      return query;
    },
    update: (...args: unknown[]) => {
      calls.push({ method: 'update', args });
      return query;
    },
    eq: (...args: unknown[]) => {
      calls.push({ method: 'eq', args });
      return query;
    },
    is: (...args: unknown[]) => {
      calls.push({ method: 'is', args });
      return query;
    },
    or: (...args: unknown[]) => {
      calls.push({ method: 'or', args });
      return query;
    },
    order: (...args: unknown[]) => {
      calls.push({ method: 'order', args });
      return query;
    },
    lt: (...args: unknown[]) => {
      calls.push({ method: 'lt', args });
      return query;
    },
    maybeSingle: () => Promise.resolve(response),
    then: (resolve: (value: QueryResponse) => unknown, reject: (reason: unknown) => unknown) =>
      Promise.resolve(response).then(resolve, reject),
  };
  return query;
}

async function assertActiveJobsAreScopedToCurrentUser(): Promise<void> {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  let queryCount = 0;
  const client = {
    from: (table: string) => {
      calls.push({ method: 'from', args: [table] });
      queryCount += 1;
      return createQuery(
        {
          data:
            queryCount <= 3
              ? []
              : [
                  {
                    id: 'job-1',
                    provider: 'suunto',
                    sync_domain: 'activities',
                    started_at: '2026-10-10T10:00:00.000Z',
                    updated_at: '2026-10-10T10:01:00.000Z',
                    last_error: 'WEARABLE_SYNC_CANCEL_REQUESTED',
                  },
                ],
          error: null,
        },
        calls,
      );
    },
  };
  const service = new WearableImportLifecycleService({ client } as unknown as SupabaseAdminService);

  const jobs = await service.listActiveSyncJobs('user-1');

  assert.deepEqual(jobs, [
    {
      id: 'job-1',
      provider: 'suunto',
      syncDomain: 'activities',
      startedAt: '2026-10-10T10:00:00.000Z',
      updatedAt: '2026-10-10T10:01:00.000Z',
      cancellationRequested: true,
    },
  ]);
  assert(calls.some(call => call.method === 'eq' && call.args[0] === 'user_id' && call.args[1] === 'user-1'));
  assert(calls.some(call => call.method === 'eq' && call.args[0] === 'status' && call.args[1] === 'running'));
}

async function assertCancellationOnlyMarksJobsAndDoesNotFinishThem(): Promise<void> {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  const client = {
    from: () =>
      createQuery(
        {
          data: [{ id: 'job-1' }, { id: 'job-2' }],
          error: null,
        },
        calls,
      ),
  };
  const service = new WearableImportLifecycleService({ client } as unknown as SupabaseAdminService);

  const count = await service.requestActiveSyncCancellation('user-1');

  assert.equal(count, 2);
  assert(
    calls.some(
      call => call.method === 'update' && JSON.stringify(call.args[0]).includes('WEARABLE_SYNC_CANCEL_REQUESTED'),
    ),
  );
  assert(calls.some(call => call.method === 'eq' && call.args[0] === 'user_id' && call.args[1] === 'user-1'));
  assert(calls.some(call => call.method === 'eq' && call.args[0] === 'status' && call.args[1] === 'running'));
  assert(!calls.some(call => call.method === 'update' && JSON.stringify(call.args[0]).includes('status')));
}

async function assertCancellationMarkerIsObservedByWorker(): Promise<void> {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  const client = {
    from: () =>
      createQuery(
        {
          data: { status: 'running', last_error: 'WEARABLE_SYNC_CANCEL_REQUESTED' },
          error: null,
        },
        calls,
      ),
  };
  const service = new WearableImportLifecycleService({ client } as unknown as SupabaseAdminService);

  assert.equal(await service.isSyncCancellationRequested('job-1'), true);
  assert(calls.some(call => call.method === 'eq' && call.args[0] === 'id' && call.args[1] === 'job-1'));
}

async function assertFinishKeepsConcurrentCancellation(): Promise<void> {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  let updateCount = 0;
  const client = {
    from: () => {
      updateCount += 1;
      return createQuery({ data: updateCount === 1 ? [] : [{ id: 'job-1' }], error: null }, calls);
    },
  };
  const service = new WearableImportLifecycleService({ client } as unknown as SupabaseAdminService);

  await service.finishSyncJob({
    jobId: 'job-1',
    leaseToken: 'lease-1',
    status: 'success',
    counters: {},
    lastError: null,
  });

  assert.equal(updateCount, 2, 'a concurrent cancellation must be finished as partial');
  const updates = calls.filter(call => call.method === 'update');
  assert.equal((updates[1].args[0] as Record<string, unknown>).status, 'partial');
  assert.equal((updates[1].args[0] as Record<string, unknown>).last_error, 'WEARABLE_SYNC_CANCEL_REQUESTED');
  assert(calls.some(call => call.method === 'eq' && call.args[0] === 'lease_token' && call.args[1] === 'lease-1'));
  assert(
    calls.some(
      call => call.method === 'or' && String(call.args[0]).includes('last_error.neq.WEARABLE_SYNC_CANCEL_REQUESTED'),
    ),
  );
}

async function assertExpiredWorkerIsClosedInsteadOfShownAsActive(): Promise<void> {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  let reads = 0;
  const client = {
    from: () => {
      reads += 1;
      return createQuery(
        {
          data: reads === 1 ? [{ id: 'stale-job', last_error: null }] : [],
          error: null,
        },
        calls,
      );
    },
  };
  const service = new WearableImportLifecycleService({ client } as unknown as SupabaseAdminService);

  assert.deepEqual(await service.listActiveSyncJobs('user-1'), []);
  const closeUpdate = calls.find(call => call.method === 'update');
  const updateValues = closeUpdate?.args[0];
  assert(updateValues && typeof updateValues === 'object');
  assert.equal((updateValues as Record<string, unknown>).status, 'error');
  assert.equal((updateValues as Record<string, unknown>).last_error, 'WEARABLE_SYNC_JOB_HEARTBEAT_EXPIRED');
  assert.equal(typeof (updateValues as Record<string, unknown>).completed_at, 'string');
  assert(calls.some(call => call.method === 'eq' && call.args[0] === 'user_id' && call.args[1] === 'user-1'));
  const staleCondition = calls.find(
    call => call.method === 'lt' && call.args[0] === 'updated_at' && typeof call.args[1] === 'string',
  );
  assert(staleCondition, 'stale jobs must be rechecked during the close update to protect a renewed heartbeat');
  const closeUpdateIndex = calls.findIndex(call => call.method === 'update');
  assert(
    calls
      .slice(closeUpdateIndex)
      .some(call => call.method === 'lt' && call.args[0] === 'updated_at' && call.args[1] === staleCondition.args[1]),
  );
}

async function run(): Promise<void> {
  await assertActiveJobsAreScopedToCurrentUser();
  await assertCancellationOnlyMarksJobsAndDoesNotFinishThem();
  await assertCancellationMarkerIsObservedByWorker();
  await assertFinishKeepsConcurrentCancellation();
  await assertExpiredWorkerIsClosedInsteadOfShownAsActive();
}

void run();
