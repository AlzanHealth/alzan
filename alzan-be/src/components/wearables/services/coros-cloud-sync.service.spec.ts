import { strict as assert } from 'assert';
import { BadGatewayException, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosError } from 'axios';
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

async function assertMissingFitIsPending(): Promise<void> {
  const service = createService();
  const originalGet = axios.get;
  axios.get = (async () => ({ data: { result: '0000', data: {} } })) as typeof axios.get;
  try {
    await assert.rejects(service.fetchWorkoutFits(token, { mode: 8, subMode: 1 }, 'label-1'), /COROS_FIT_URL_MISSING/);
  } finally {
    axios.get = originalGet;
  }
}

async function assertSyncRetriesPendingWithoutDuplicates(): Promise<void> {
  let claimed = false;
  let complete = false;
  let active = false;
  let cancelRequested = false;
  let writes = 0;
  let finishedWith: string | null = null;
  let workoutFetchCalls = 0;
  const service = new CorosCloudSyncService(
    {} as ConfigService,
    {} as SupabaseAdminService,
    { storeRawPayload: async () => ({ id: 'raw-id' }) } as unknown as RawPayloadService,
    { saveState: async () => undefined } as unknown as IntegrationSyncStateService,
    {
      upsertActivity: async () => {
        writes += 1;
      },
    } as unknown as CanonicalActivityWriterService,
    {} as CanonicalHealthWriterService,
    {
      claimSyncJob: async () => ({ action: active ? 'active' : 'claimed', jobId: 'job', leaseToken: 'lease' }),
      claimActivity: async (input: { userId: string; sourceRecordId: string }) => {
        assert.equal(input.userId, 'user-1');
        assert.equal(input.sourceRecordId, '418173315956375553');
        claimed = true;
        return { action: complete ? 'skip' : 'claimed', importId: 'import-id' };
      },
      finishSyncJob: async (input: { lastError: string | null }) => {
        finishedWith = input.lastError;
      },
      isSyncCancellationRequested: async () => cancelRequested,
    } as unknown as WearableImportLifecycleService,
    { isUserAllowed: (userId: string) => userId === 'user-1' } as unknown as CorosOAuthService,
  );
  const internals = service as unknown as {
    getUsableToken: () => Promise<CorosToken>;
    fetchWorkouts: (
      _token: CorosToken,
      windows: Array<{ startDate: string; endDate: string }>,
    ) => Promise<Record<string, unknown>[]>;
    fetchWorkoutFits: () => Promise<Uint8Array[]>;
    hasHealthConsent: () => Promise<boolean>;
    markConnectionResult: () => Promise<void>;
    startLeaseHeartbeat: () => () => void;
  };
  internals.getUsableToken = async () => token;
  internals.hasHealthConsent = async () => false;
  internals.markConnectionResult = async () => undefined;
  internals.startLeaseHeartbeat = () => () => undefined;
  internals.fetchWorkoutFits = async () => {
    throw new Error('COROS_FIT_URL_MISSING');
  };
  internals.fetchWorkouts = async (_token, windows) => {
    workoutFetchCalls += 1;
    assert.ok(windows.length >= 3, 'revisit old pending imports, not just a three-day overlap');
    const summary = {
      labelId: '418173315956375553',
      mode: 8,
      subMode: 1,
      startTime: 1788501600,
      duration: 1800,
      distance: 5000,
    };
    return [summary, summary];
  };
  await assert.rejects(service.sync('other-user'), /not enabled/);
  assert.equal(claimed, false);
  const first = await service.sync('user-1');
  assert.equal(first.status, 'partial');
  assert.equal(first.fitPending, 1);
  assert.equal(writes, 1, 'duplicate summaries should be imported once');
  await service.sync('user-1');
  assert.equal(writes, 2, 'pending FIT must be retried');
  complete = true;
  const skipped = await service.sync('user-1');
  assert.equal(skipped.activitiesSkipped, 1);
  assert.equal(writes, 2, 'complete activity must not be overwritten by a summary-only retry');
  active = true;
  assert.equal((await service.sync('user-1')).status, 'running');
  assert.equal(writes, 2);
  active = false;
  cancelRequested = true;
  const cancelled = await service.sync('user-1');
  assert.equal(cancelled.cancelled, true);
  assert.equal(cancelled.status, 'partial');
  assert.equal(finishedWith, 'WEARABLE_SYNC_CANCEL_REQUESTED');
  assert.equal(workoutFetchCalls, 3, 'a cancellation already requested must stop before fetching more data');
}

async function run(): Promise<void> {
  await assertHttpErrorsKeepRetrySemantics();
  await assertFitDetailUrlIsDownloaded();
  await assertApplicationErrorsAreRejected();
  await assertMissingFitIsPending();
  await assertSyncRetriesPendingWithoutDuplicates();
}

async function assertHttpErrorsKeepRetrySemantics(): Promise<void> {
  const originalAdapter = axios.defaults.adapter;
  const longId = '418173315956375553';
  try {
    for (const endpoint of ['daily', 'fit']) {
      for (const body of ['<html>Unavailable</html>', '']) {
        for (const status of [503, 429, 401, 403]) {
          let attempts = 0;
          axios.defaults.adapter = async config => {
            attempts += 1;
            throw new AxiosError('HTTP failure', 'ERR_BAD_RESPONSE', config, undefined, {
              data: body,
              status,
              statusText: 'HTTP failure',
              headers: { 'retry-after': '0' },
              config,
            });
          };
          const service = createService();
          const request =
            endpoint === 'daily'
              ? service.getCoros('/coros/daily/query', token, { startDate: '20260901', endDate: '20260904' })
              : service.fetchWorkoutFits(token, { mode: 8, subMode: 1 }, longId);
          await assert.rejects(request, error => {
            if (status === 429)
              return error instanceof ServiceUnavailableException && error.message === 'COROS_RATE_LIMITED';
            if (status === 401 || status === 403) return error instanceof UnauthorizedException;
            return error instanceof BadGatewayException;
          });
          assert.equal(
            attempts,
            status === 503 || status === 429 ? 4 : 1,
            `${endpoint}: ${status} ${JSON.stringify(body)}`,
          );
        }
      }
    }
    let attempts = 0;
    axios.defaults.adapter = async config => {
      attempts += 1;
      if (attempts === 1) {
        throw new AxiosError('Unavailable', 'ERR_BAD_RESPONSE', config, undefined, {
          data: '<html>Unavailable</html>',
          status: 503,
          statusText: 'Unavailable',
          headers: { 'retry-after': '0' },
          config,
        });
      }
      return {
        data: `{"result":"0000","data":{"labelId":${longId}}}`,
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
      };
    };
    assert.deepEqual(
      await createService().getCoros('/coros/daily/query', token, { startDate: '20260901', endDate: '20260904' }),
      {
        result: '0000',
        data: { labelId: longId },
      },
    );
    assert.equal(attempts, 2);
    attempts = 0;
    axios.defaults.adapter = async config => {
      attempts += 1;
      if (config.url?.endsWith('/v2/coros/sport/detail/fit')) {
        assert.equal((config.params as { labelId: string }).labelId, longId);
        if (attempts === 1) {
          throw new AxiosError('Unavailable', 'ERR_BAD_RESPONSE', config, undefined, {
            data: '',
            status: 503,
            statusText: 'Unavailable',
            headers: { 'retry-after': '0' },
            config,
          });
        }
        return {
          data: `{"result":"0000","data":{"fitUrl":"https://oss.coros.com/${longId}.fit"}}`,
          status: 200,
          statusText: 'OK',
          headers: {},
          config,
        };
      }
      assert.equal(config.url, `https://oss.coros.com/${longId}.fit`);
      return { data: fitArrayBuffer(), status: 200, statusText: 'OK', headers: {}, config };
    };
    assert.equal((await createService().fetchWorkoutFits(token, { mode: 8, subMode: 1 }, longId)).length, 1);
    assert.equal(attempts, 3);

    // Invalid successful responses and application errors still fail without retrying.
    for (const body of ['', '<html>Not JSON</html>', '{"result":"5011"}']) {
      attempts = 0;
      axios.defaults.adapter = async config => {
        attempts += 1;
        return { data: body, status: 200, statusText: 'OK', headers: {}, config };
      };
      await assert.rejects(
        createService().getCoros('/coros/daily/query', token, { startDate: '20260901', endDate: '20260904' }),
        (error: unknown) => error instanceof BadGatewayException,
      );
      assert.equal(attempts, 1);
    }
  } finally {
    axios.defaults.adapter = originalAdapter;
  }
}

void run();
