import { strict as assert } from 'assert';
import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SupabaseAdminService } from '../../../core/supabase/supabase.service';
import { CorosWorkoutPushDto } from '../dto/coros-webhook.dto';
import { CorosCloudSyncService } from './coros-cloud-sync.service';
import { CorosWebhookService } from './coros-webhook.service';
import { RawPayloadService } from './raw-payload.service';

type FakeResult = { data: Record<string, unknown> | Record<string, unknown>[] | null; error: null };

class FakeQuery implements PromiseLike<FakeResult> {
  constructor(
    private readonly table: string,
    private readonly connection: Record<string, unknown> | null,
  ) {}

  public select(): this {
    return this;
  }

  public eq(): this {
    return this;
  }

  public in(): this {
    return this;
  }

  public is(): this {
    return this;
  }

  public lte(): this {
    return this;
  }

  public order(): this {
    return this;
  }

  public limit(): this {
    return this;
  }

  public maybeSingle(): Promise<FakeResult> {
    return Promise.resolve({ data: this.table === 'user_connections' ? this.connection : null, error: null });
  }

  public then<TResult1 = FakeResult, TResult2 = never>(
    onfulfilled?: ((value: FakeResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    const data = this.table === 'external_raw_payloads_v2' ? [] : null;
    return Promise.resolve({ data, error: null }).then(onfulfilled, onrejected);
  }
}

class FakeSupabaseClient {
  public from(table: string): FakeQuery {
    const connection = table === 'user_connections' ? { id: 'connection-1', user_id: 'user-1' } : null;
    return new FakeQuery(table, connection);
  }
}

async function assertWebhookPayloadIsRetainedForRetry(): Promise<void> {
  const storedInputs: Array<Record<string, unknown>> = [];
  const service = new CorosWebhookService(
    {} as ConfigService,
    { client: new FakeSupabaseClient() } as unknown as SupabaseAdminService,
    {
      storeRawPayload: async (input: Record<string, unknown>) => {
        storedInputs.push(input);
        return { id: 'raw-payload-1', payloadHash: 'hash' };
      },
    } as unknown as RawPayloadService,
    {} as CorosCloudSyncService,
  );
  const body = { sportDataList: [{ openId: 'provider-user-1', labelId: 'workout-1', sportType: 1 }] };

  await service.enqueue(body as unknown as CorosWorkoutPushDto);

  assert.equal(storedInputs.length, 1);
  assert.equal(storedInputs[0]?.userId, 'user-1');
  assert.equal(storedInputs[0]?.provider, 'coros');
  assert.equal(storedInputs[0]?.objectType, 'coros_workout_push');
  assert.equal(storedInputs[0]?.sourceRecordId, 'workout-1');
  assert.deepEqual(storedInputs[0]?.payload, body.sportDataList[0]);
  assert.equal(storedInputs[0]?.retainPayloadForRetry, true);
}

async function assertWebhookRejectsWhenRetryPayloadCannotBeStored(): Promise<void> {
  const service = new CorosWebhookService(
    {} as ConfigService,
    { client: new FakeSupabaseClient() } as unknown as SupabaseAdminService,
    { storeRawPayload: async () => ({ id: null, payloadHash: 'hash' }) } as unknown as RawPayloadService,
    {} as CorosCloudSyncService,
  );

  await assert.rejects(
    service.enqueue({
      sportDataList: [{ openId: 'provider-user-1', labelId: 'workout-1' }],
    } as unknown as CorosWorkoutPushDto),
    (error: unknown) =>
      error instanceof ServiceUnavailableException && error.message === 'COROS_WEBHOOK_PERSISTENCE_FAILED',
  );
}

async function run(): Promise<void> {
  await assertWebhookPayloadIsRetainedForRetry();
  await assertWebhookRejectsWhenRetryPayloadCannotBeStored();
  console.log('COROS webhook retry payload verification passed (2 scenarios).');
}

void run().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
