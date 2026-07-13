import { strict as assert } from 'assert';
import { SupabaseAdminService } from '../../../core/supabase/supabase.service';
import { WearableImportClaimInput, WearableImportLifecycleService } from './wearable-import-lifecycle.service';

type RpcResult = {
  data: unknown;
  error: { message: string } | null;
};

type RpcCall = {
  args: Record<string, unknown>;
  name: string;
};

interface FakeSupabaseClient {
  calls: RpcCall[];
  rpc(name: string, args: Record<string, unknown>): Promise<RpcResult>;
}

const baseInput: WearableImportClaimInput = {
  userId: '11111111-1111-4111-8111-111111111111',
  provider: 'suunto',
  sourceChannel: 'cloud',
  sourcePackage: null,
  sourceRecordId: 'workout-1',
  canonicalVersion: 1,
  jobId: '22222222-2222-4222-8222-222222222222',
};

function createService(results: unknown[]): {
  client: FakeSupabaseClient;
  service: WearableImportLifecycleService;
} {
  const pendingResults = [...results];
  const client: FakeSupabaseClient = {
    calls: [],
    async rpc(name: string, args: Record<string, unknown>): Promise<RpcResult> {
      client.calls.push({ args, name });
      return { data: pendingResults.shift() ?? null, error: null };
    },
  };
  return {
    client,
    service: new WearableImportLifecycleService({ client } as unknown as SupabaseAdminService),
  };
}

async function assertCompleteImportIsSkipped(): Promise<void> {
  const { client, service } = createService([
    { action: 'skip', import_id: '33333333-3333-4333-8333-333333333333', session_id: 'session-1' },
  ]);

  const result = await service.claimActivity(baseInput);

  assert.deepEqual(result, {
    action: 'skip',
    importId: '33333333-3333-4333-8333-333333333333',
    sessionId: 'session-1',
  });
  assert.equal(client.calls[0]?.name, 'claim_wearable_activity_import');
  assert.equal(client.calls[0]?.args.p_canonical_version, 1);
}

async function assertMissingLifecycleIsImported(): Promise<void> {
  const { service } = createService([
    { action: 'import', import_id: '44444444-4444-4444-8444-444444444444', session_id: null },
  ]);

  const result = await service.claimActivity(baseInput);

  assert.equal(result.action, 'import');
  assert.equal(result.sessionId, null);
}

async function assertFailedLifecycleIsRepaired(): Promise<void> {
  const { service } = createService([
    { action: 'repair', import_id: '55555555-5555-4555-8555-555555555555', session_id: 'session-2' },
  ]);

  const result = await service.claimActivity(baseInput);

  assert.equal(result.action, 'repair');
  assert.equal(result.sessionId, 'session-2');
}

async function run(): Promise<void> {
  await assertCompleteImportIsSkipped();
  await assertMissingLifecycleIsImported();
  await assertFailedLifecycleIsRepaired();
}

void run();
