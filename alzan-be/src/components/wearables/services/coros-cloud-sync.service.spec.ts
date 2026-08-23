import { strict as assert } from 'assert';
import { BadGatewayException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { SupabaseAdminService } from '../../../core/supabase/supabase.service';
import { CorosOAuthService } from '../../providers/oauth/coros-oauth.service';
import { CanonicalActivityWriterService } from './canonical-activity-writer.service';
import { CanonicalHealthWriterService } from './canonical-health-writer.service';
import { CorosCloudSyncService } from './coros-cloud-sync.service';
import { IntegrationSyncStateService } from './integration-sync-state.service';
import { RawPayloadService } from './raw-payload.service';
import { WearableImportLifecycleService } from './wearable-import-lifecycle.service';

type CorosToken = {
  connectionId: string;
  accessToken: string;
  refreshToken: string | null;
  expiresAt: string | null;
  openId: string;
};

interface CorosCloudSyncPrivate {
  fetchWorkoutFits(token: CorosToken, summary: Record<string, unknown>, labelId: string): Promise<Uint8Array[]>;
  getCoros(path: string, token: CorosToken, window: { startDate: string; endDate: string }): Promise<unknown>;
}

const token: CorosToken = {
  connectionId: 'connection-id',
  accessToken: 'access-token',
  refreshToken: 'refresh-token',
  expiresAt: null,
  openId: 'open-id',
};

function createService(): CorosCloudSyncPrivate {
  return new CorosCloudSyncService(
    {
      get: (key: string) => {
        if (key === 'COROS_API_BASE_URL') return 'https://opentest.coros.com';
        if (key === 'COROS_FIT_ALLOWED_HOSTS') return 'oss.coros.com';
        return undefined;
      },
    } as unknown as ConfigService,
    {} as SupabaseAdminService,
    {} as RawPayloadService,
    {} as IntegrationSyncStateService,
    {} as CanonicalActivityWriterService,
    {} as CanonicalHealthWriterService,
    {} as WearableImportLifecycleService,
    {} as CorosOAuthService,
  ) as unknown as CorosCloudSyncPrivate;
}

function fitArrayBuffer(): ArrayBuffer {
  const bytes = new Uint8Array(16);
  bytes[0] = 14;
  bytes.set(Buffer.from('.FIT'), 8);
  return bytes.buffer;
}

async function assertFitDetailUrlIsDownloaded(): Promise<void> {
  const service = createService();
  const requestedUrls: string[] = [];
  const originalGet = axios.get;
  axios.get = (async (url: string) => {
    requestedUrls.push(url);
    if (url.endsWith('/v2/coros/sport/detail/fit')) {
      return { data: { result: '0000', data: { fitUrl: 'https://oss.coros.com/workout.fit' } } };
    }
    return { data: fitArrayBuffer() };
  }) as typeof axios.get;
  try {
    const files = await service.fetchWorkoutFits(token, { mode: 8, subMode: 0 }, 'label-1');
    assert.equal(files.length, 1);
    assert.deepEqual(requestedUrls, [
      'https://opentest.coros.com/v2/coros/sport/detail/fit',
      'https://oss.coros.com/workout.fit',
    ]);
  } finally {
    axios.get = originalGet;
  }
}

async function assertApplicationErrorsAreRejected(): Promise<void> {
  const service = createService();
  const originalGet = axios.get;
  axios.get = (async () => ({ data: { result: '5011', message: 'The date is out of range' } })) as typeof axios.get;
  try {
    await assert.rejects(
      service.getCoros('/coros/daily/query', token, { startDate: '20260801', endDate: '20260823' }),
      (error: unknown) => error instanceof BadGatewayException && error.message === 'COROS_API_ERROR_5011',
    );
  } finally {
    axios.get = originalGet;
  }
}

async function run(): Promise<void> {
  await assertFitDetailUrlIsDownloaded();
  await assertApplicationErrorsAreRejected();
}

void run();
