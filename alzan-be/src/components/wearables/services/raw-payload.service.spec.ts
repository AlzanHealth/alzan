import { strict as assert } from 'assert';
import { SupabaseAdminService } from '../../../core/supabase/supabase.service';
import { RawPayloadInput } from '../domain/wearable.types';
import { RawPayloadService } from './raw-payload.service';

type RpcCall = { args: Record<string, unknown>; name: string };

class FakeRawPayloadClient {
  public readonly calls: RpcCall[] = [];
  public error: { message: string } | null = null;

  public async rpc(name: string, args: Record<string, unknown>) {
    this.calls.push({ name, args });
    return { data: 'raw-payload-1', error: this.error };
  }
}

const sampleInput: RawPayloadInput = {
  userId: 'user-1',
  provider: 'coros',
  sourceChannel: 'cloud',
  sourcePackage: null,
  objectType: 'coros_workout_push',
  sourceRecordId: 'workout-1',
  payload: { label: 'Carrera 🏃', values: { speed: 3.2, ignored: undefined } },
  traceId: null,
};

async function assertPayloadIsDiscardedUnlessRetryRetentionIsExplicit(): Promise<void> {
  const client = new FakeRawPayloadClient();
  const service = new RawPayloadService({ client } as unknown as SupabaseAdminService);

  const ordinary = await service.storeRawPayload(sampleInput);
  const retryable = await service.storeRawPayload({ ...sampleInput, retainPayloadForRetry: true });

  assert.equal(client.calls.length, 2);
  assert.ok(client.calls.every(call => call.name === 'store_external_raw_payload'));
  assert.equal(client.calls[0]?.args.p_payload, null);
  assert.equal(client.calls[0]?.args.p_size_bytes, 0);
  assert.deepEqual(client.calls[1]?.args.p_payload, { label: 'Carrera 🏃', values: { speed: 3.2 } });
  assert.equal(
    client.calls[1]?.args.p_size_bytes,
    Buffer.byteLength(JSON.stringify(client.calls[1]?.args.p_payload), 'utf8'),
  );
  assert.equal(ordinary.payloadHash, retryable.payloadHash);
  assert.match(ordinary.payloadHash, /^[a-f0-9]{64}$/);
}

async function assertRpcFailureReturnsHashWithoutPersistingPayload(): Promise<void> {
  const client = new FakeRawPayloadClient();
  client.error = { message: 'database unavailable' };
  const service = new RawPayloadService({ client } as unknown as SupabaseAdminService);

  const result = await service.storeRawPayload(sampleInput);

  assert.equal(result.id, null);
  assert.match(result.payloadHash, /^[a-f0-9]{64}$/);
  assert.equal(client.calls[0]?.args.p_payload, null);
  assert.equal(client.calls[0]?.args.p_size_bytes, 0);
}

async function run(): Promise<void> {
  await assertPayloadIsDiscardedUnlessRetryRetentionIsExplicit();
  await assertRpcFailureReturnsHashWithoutPersistingPayload();
  console.log('Wearable raw payload retention verification passed (2 scenarios).');
}

void run().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
