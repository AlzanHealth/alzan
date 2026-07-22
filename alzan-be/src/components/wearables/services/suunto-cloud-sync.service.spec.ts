import { strict as assert } from 'assert';
import { ConfigService } from '@nestjs/config';
import { SupabaseAdminService } from '../../../core/supabase/supabase.service';
import { CanonicalActivityWriterService } from './canonical-activity-writer.service';
import { IntegrationSyncStateService } from './integration-sync-state.service';
import { RawPayloadService } from './raw-payload.service';
import { SuuntoCloudSyncService } from './suunto-cloud-sync.service';
import { WearableImportLifecycleService } from './wearable-import-lifecycle.service';
import { UnverifiedSinglePageWorkoutPaginationStrategy } from './suunto-workout-pagination.strategy';

type JsonRecord = Record<string, unknown>;

interface SuuntoCloudSyncServicePrivate {
  fetchWorkoutSummaries(accessToken: string): Promise<{ workouts: JsonRecord[]; isPaginationVerified: boolean }>;
  getSuunto<T>(path: string, accessToken: string, params?: Record<string, string>): Promise<T>;
  executeSuuntoRequest<T>(request: () => Promise<T>): Promise<T>;
  selectWorkoutLookbackStartMs(
    now: number,
    canonicalVersion: unknown,
    hasPendingImport: boolean,
    lastSuccessAt?: string | null,
  ): number;
  sleep(milliseconds: number): Promise<void>;
}

type CapturedRequest = {
  accessToken: string | null;
  params: Record<string, string> | null;
  path: string | null;
};

function assertUnverifiedStrategyNeverInventsAnOffset(): void {
  const strategy = new UnverifiedSinglePageWorkoutPaginationStrategy(100);
  assert.deepEqual(strategy.buildRequest('123'), { since: '123', limit: '100' });
  assert.equal(strategy.isComplete(99), true);
  assert.equal(strategy.isComplete(100), false);
}

function createService(response: JsonRecord[]): {
  capturedRequest: CapturedRequest;
  service: SuuntoCloudSyncServicePrivate;
} {
  const capturedRequest: CapturedRequest = {
    accessToken: null,
    params: null,
    path: null,
  };
  const service = new SuuntoCloudSyncService(
    { get: () => 'unused' } as unknown as ConfigService,
    {} as unknown as SupabaseAdminService,
    {} as unknown as RawPayloadService,
    {} as unknown as IntegrationSyncStateService,
    {} as unknown as CanonicalActivityWriterService,
    {} as unknown as WearableImportLifecycleService,
  ) as unknown as SuuntoCloudSyncServicePrivate;
  service.getSuunto = async <T>(path: string, accessToken: string, params?: Record<string, string>): Promise<T> => {
    capturedRequest.path = path;
    capturedRequest.accessToken = accessToken;
    capturedRequest.params = params ?? null;
    return response as T;
  };
  return { capturedRequest, service };
}

async function assertFirstWorkoutSyncIsLimitedToLastThirtyDays(): Promise<void> {
  const originalNow = Date.now;
  const fixedNowMs = Date.parse('2026-06-15T10:00:00.000Z');
  const cutoffMs = fixedNowMs - 30 * 24 * 60 * 60 * 1000;
  Date.now = (): number => fixedNowMs;
  try {
    const { capturedRequest, service } = createService([
      { startTime: '2026-06-14T09:00:00.000Z', workoutKey: 'recent-iso' },
      { startTime: new Date(cutoffMs).toISOString(), workoutKey: 'boundary-iso' },
      { startTimeInSeconds: Math.floor((fixedNowMs - 1000) / 1000), workoutKey: 'recent-seconds' },
      { startTime: fixedNowMs - 2000, workoutKey: 'recent-millis' },
      { startTime: '2026-05-01T09:00:00.000Z', workoutKey: 'old-iso' },
      { workoutKey: 'undated' },
    ]);

    const actualResult = await service.fetchWorkoutSummaries('access-token');

    assert.equal(capturedRequest.path, '/v2/workouts');
    assert.equal(capturedRequest.accessToken, 'access-token');
    assert.equal(capturedRequest.params?.since, String(cutoffMs));
    assert.deepEqual(
      actualResult.workouts.map(workout => workout.workoutKey),
      ['recent-iso', 'boundary-iso', 'recent-seconds', 'recent-millis'],
    );
  } finally {
    Date.now = originalNow;
  }
}

async function assertSaturatedWorkoutListIsReportedAsUnverified(): Promise<void> {
  const { service } = createService([]);
  const requestedOffsets: number[] = [];
  service.getSuunto = async <T>(_path: string, _token: string, params?: Record<string, string>): Promise<T> => {
    const offset = Number(params?.offset ?? 0);
    requestedOffsets.push(offset);
    return Array.from({ length: 100 }, (_, index) => ({
      workoutKey: `workout-${offset + index}`,
      startTime: Date.now(),
    })) as T;
  };

  const result = await service.fetchWorkoutSummaries('access-token');

  assert.equal(result.workouts.length, 100);
  assert.equal(result.isPaginationVerified, false);
  assert.deepEqual(requestedOffsets, [0]);
}

function assertIncrementalAndRepairLookbacks(): void {
  const { service } = createService([]);
  const now = Date.parse('2026-06-15T10:00:00.000Z');
  const dayMs = 24 * 60 * 60 * 1000;
  const lastSuccessAt = new Date(now).toISOString();

  assert.equal(service.selectWorkoutLookbackStartMs(now, 6, false, lastSuccessAt), now - 3 * dayMs);
  assert.equal(service.selectWorkoutLookbackStartMs(now, 6, true, lastSuccessAt), now - 20 * dayMs);
  assert.equal(service.selectWorkoutLookbackStartMs(now, 5, false, lastSuccessAt), now - 30 * dayMs);
  assert.equal(service.selectWorkoutLookbackStartMs(now, 4, false, lastSuccessAt), now - 30 * dayMs);
  assert.equal(service.selectWorkoutLookbackStartMs(now, 3, false, lastSuccessAt), now - 30 * dayMs);
  assert.equal(service.selectWorkoutLookbackStartMs(now, 2, false, lastSuccessAt), now - 30 * dayMs);
  assert.equal(service.selectWorkoutLookbackStartMs(now, 1, false, lastSuccessAt), now - 30 * dayMs);
  assert.equal(
    service.selectWorkoutLookbackStartMs(now, 6, false, new Date(now - 5 * dayMs).toISOString()),
    now - 8 * dayMs,
  );
  assert.equal(
    service.selectWorkoutLookbackStartMs(now, 6, false, new Date(now - 60 * dayMs).toISOString()),
    now - 30 * dayMs,
  );
  assert.equal(service.selectWorkoutLookbackStartMs(now, undefined, false), now - 30 * dayMs);
}

async function assertRateLimitRetriesRespectRetryAfter(): Promise<void> {
  const { service } = createService([]);
  let attempts = 0;
  const delays: number[] = [];
  service.sleep = async milliseconds => void delays.push(milliseconds);

  const result = await service.executeSuuntoRequest(async () => {
    attempts += 1;
    if (attempts < 3) {
      throw Object.assign(new Error('rate limited'), {
        isAxiosError: true,
        response: { status: 429, headers: { 'retry-after': '2' } },
      });
    }
    return 'ok';
  });

  assert.equal(result, 'ok');
  assert.equal(attempts, 3);
  assert.deepEqual(delays, [2000, 2000]);
}

async function assertSyncSkipsAlreadyImportedWorkouts(): Promise<void> {
  const importedWorkoutKeys: string[] = [];
  const completedImports: string[] = [];
  const finishedJobs: JsonRecord[] = [];
  const savedStates: JsonRecord[] = [];
  const service = new SuuntoCloudSyncService(
    { get: () => 'unused' } as unknown as ConfigService,
    {} as unknown as SupabaseAdminService,
    {} as unknown as RawPayloadService,
    {
      saveState: async (state: JsonRecord): Promise<void> => void savedStates.push(state),
    } as unknown as IntegrationSyncStateService,
    {} as unknown as CanonicalActivityWriterService,
    {
      claimSyncJob: async () => ({
        action: 'acquired',
        jobId: 'job-1',
        leaseToken: 'lease-1',
        leaseExpiresAt: '2026-06-15T10:05:00.000Z',
      }),
      claimActivity: async (input: { sourceRecordId: string }) =>
        input.sourceRecordId === 'existing-workout'
          ? { action: 'skip', importId: 'import-existing', sessionId: 'session-existing' }
          : { action: 'import', importId: `import-${input.sourceRecordId}`, sessionId: null },
      completeActivity: async (importId: string) => void completedImports.push(importId),
      failActivity: async () => {
        throw new Error('lifecycle write unavailable');
      },
      finishSyncJob: async (input: JsonRecord) => void finishedJobs.push(input),
    } as unknown as WearableImportLifecycleService,
  ) as unknown as {
    fetchWorkoutSummaries(accessToken: string): Promise<{ workouts: JsonRecord[]; isPaginationVerified: boolean }>;
    getUsableToken(
      userId: string,
    ): Promise<{ accessToken: string; connectionId: string; expiresAt: string | null; refreshToken: string | null }>;
    importWorkout(
      userId: string,
      accessToken: string,
      workoutKey: string,
      summary: JsonRecord,
      lifecycleImportId: string,
      lifecycleJobId: string,
      phaseDurationsMs: Record<string, number>,
    ): Promise<string>;
    markConnectionResult(
      userId: string,
      syncedAt: string,
      status: 'success' | 'partial',
      errorsByCode: Record<string, number>,
    ): Promise<void>;
    syncActivities(userId: string): Promise<{
      activitiesImported: number;
      activitiesSkipped: number;
      activitiesReconciled: number;
      activitiesRepaired: number;
      activitiesFailed: number;
      status: string;
    }>;
  };

  service.getUsableToken = async () => ({
    accessToken: 'access-token',
    connectionId: 'connection-id',
    expiresAt: null,
    refreshToken: null,
  });
  service.fetchWorkoutSummaries = async () => ({
    workouts: [
      { startTime: '2026-06-14T09:00:00.000Z', workoutKey: 'existing-workout' },
      { startTime: '2026-06-15T09:00:00.000Z', workoutKey: 'new-workout' },
      { startTime: '2026-06-15T09:30:00.000Z', workoutKey: 'broken-workout' },
    ],
    isPaginationVerified: false,
  });
  service.importWorkout = async (_userId: string, accessToken: string, workoutKey: string) => {
    assert.equal(accessToken, 'access-token');
    if (workoutKey === 'broken-workout') throw new Error('SUUNTO_FIT_UNAVAILABLE');
    importedWorkoutKeys.push(workoutKey);
    return `session-${workoutKey}`;
  };
  service.markConnectionResult = async () => undefined;

  const result = await service.syncActivities('user-id');

  assert.deepEqual(importedWorkoutKeys, ['new-workout']);
  assert.equal(result.activitiesImported, 1);
  assert.equal(result.activitiesSkipped, 1);
  assert.equal(result.activitiesReconciled, 1);
  assert.equal(result.activitiesRepaired, 0);
  assert.equal(result.activitiesFailed, 1);
  assert.equal(result.status, 'partial');
  assert.deepEqual(completedImports, [], 'bundle persistence owns the lifecycle completion');
  assert.equal(finishedJobs[0]?.status, 'partial');
  assert.equal(savedStates.length, 1);
  assert.equal(savedStates[0]?.lastRecordAt, null);
  assert.equal((savedStates[0]?.metadata as JsonRecord)?.paginationVerified, false);
  assert.equal((savedStates[0]?.metadata as JsonRecord)?.errorsByCode instanceof Object, true);
}

async function run(): Promise<void> {
  assertUnverifiedStrategyNeverInventsAnOffset();
  await assertFirstWorkoutSyncIsLimitedToLastThirtyDays();
  await assertSaturatedWorkoutListIsReportedAsUnverified();
  assertIncrementalAndRepairLookbacks();
  await assertRateLimitRetriesRespectRetryAfter();
  await assertSyncSkipsAlreadyImportedWorkouts();
}

void run();
