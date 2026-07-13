import { strict as assert } from 'assert';
import { instanceToPlain, plainToInstance } from 'class-transformer';
import { CloudProviderSyncOutputDto } from './cloud-provider-sync.dto';

function run(): void {
  const result = plainToInstance(
    CloudProviderSyncOutputDto,
    {
      provider: 'suunto',
      activities_imported: 3,
      activities_skipped: 2,
      activities_repaired: 1,
      activities_failed: 0,
      last_success_at: '2026-07-13T16:00:00.000Z',
    },
    { excludeExtraneousValues: true },
  );

  const responseBody = JSON.parse(JSON.stringify(instanceToPlain(result))) as Record<string, unknown>;

  assert.deepEqual(responseBody, {
    provider: 'suunto',
    activities_imported: 3,
    activities_skipped: 2,
    activities_repaired: 1,
    activities_failed: 0,
    last_success_at: '2026-07-13T16:00:00.000Z',
  });
}

run();
