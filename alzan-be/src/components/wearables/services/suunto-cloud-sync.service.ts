import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { createHash } from 'crypto';
import { SupabaseAdminService } from '../../../core/supabase/supabase.service';
import { parseActivityFileToCanonical } from '../../activity-import/parsers/activity-import-canonical.parser';
import { applySuuntoWorkoutSummaryTimeMetadata } from '../../activity-import/parsers/suunto-activity-canonical.mapper';
import { CanonicalProvenance } from '../domain/wearable.types';
import { CanonicalActivityWriterService } from './canonical-activity-writer.service';
import { IntegrationSyncStateService } from './integration-sync-state.service';
import { RawPayloadService } from './raw-payload.service';
import { WearableImportLifecycleService } from './wearable-import-lifecycle.service';
import {
  SuuntoWorkoutPaginationStrategy,
  UnverifiedSinglePageWorkoutPaginationStrategy,
} from './suunto-workout-pagination.strategy';

type JsonRecord = Record<string, unknown>;
type ProviderTokenRow = {
  connectionId: string;
  accessToken: string;
  refreshToken: string | null;
  expiresAt: string | null;
};

export interface SuuntoSyncResult {
  provider: 'suunto';
  jobId: string;
  status: 'running' | 'success' | 'partial';
  activitiesImported: number;
  activitiesSkipped: number;
  activitiesRepaired: number;
  activitiesFailed: number;
  activitiesReconciled: number;
  errorsByCode: Record<string, number>;
  phaseDurationsMs: Record<string, number>;
  lastSuccessAt: string | null;
}

type WorkoutImportOutcome = {
  kind: 'failed' | 'imported' | 'repaired' | 'skipped';
  errorCode?: string;
};

type WorkoutSummaryFetchResult = {
  workouts: JsonRecord[];
  isPaginationVerified: boolean;
};

const FIRST_SYNC_LOOKBACK_DAYS = 30;
const NORMAL_SYNC_OVERLAP_DAYS = 3;
const REPAIR_LOOKBACK_DAYS = 20;
const WORKOUT_LIST_LIMIT = 100;
const WORKOUT_IMPORT_CONCURRENCY = 3;
const SUUNTO_REQUEST_RETRIES = 3;
const SUUNTO_RETRY_BASE_DELAY_MS = 250;
const CANONICAL_ACTIVITY_VERSION = 7;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const EPOCH_MS_THRESHOLD = 100_000_000_000;

@Injectable()
export class SuuntoCloudSyncService {
  private readonly logger = new Logger(SuuntoCloudSyncService.name);
  private readonly apiBaseUrl = 'https://cloudapi.suunto.com';
  private readonly tokenUrl = 'https://cloudapi-oauth.suunto.com/oauth/token';
  private readonly workoutPaginationStrategy: SuuntoWorkoutPaginationStrategy =
    new UnverifiedSinglePageWorkoutPaginationStrategy(WORKOUT_LIST_LIMIT);

  constructor(
    private readonly configService: ConfigService,
    private readonly supabaseAdminService: SupabaseAdminService,
    private readonly rawPayloadService: RawPayloadService,
    private readonly syncStateService: IntegrationSyncStateService,
    private readonly activityWriterService: CanonicalActivityWriterService,
    private readonly importLifecycleService: WearableImportLifecycleService,
  ) {}

  public async syncActivities(userId: string): Promise<SuuntoSyncResult> {
    const token = await this.getUsableToken(userId);
    const job = await this.importLifecycleService.claimSyncJob({
      userId,
      provider: 'suunto',
      syncDomain: 'activities',
      leaseSeconds: 1800,
    });
    if (job.action === 'active') return this.buildActiveJobResult(job.jobId);
    const stopLeaseHeartbeat = this.startLeaseHeartbeat(job.jobId, job.leaseToken);
    const phaseDurationsMs: Record<string, number> = {};
    try {
      const fetchStartedAt = Date.now();
      const workoutFetch = await this.fetchWorkoutSummaries(token.accessToken, userId);
      const workouts = workoutFetch.workouts;
      phaseDurationsMs.fetchSummaries = Date.now() - fetchStartedAt;
      const keyedWorkouts = workouts
        .map(workout => ({ workout, workoutKey: this.readWorkoutKey(workout) }))
        .filter((entry): entry is { workout: JsonRecord; workoutKey: string } => entry.workoutKey != null)
        .sort((a, b) => {
          const timeA = this.readWorkoutStartedAtMs(a.workout) || 0;
          const timeB = this.readWorkoutStartedAtMs(b.workout) || 0;
          return timeB - timeA;
        });
      const importStartedAt = Date.now();
      const outcomes = await this.mapWithConcurrency(keyedWorkouts, WORKOUT_IMPORT_CONCURRENCY, async entry =>
        this.processWorkout({
          userId,
          accessToken: token.accessToken,
          workoutKey: entry.workoutKey,
          summary: entry.workout,
          jobId: job.jobId,
          phaseDurationsMs,
        }),
      );
      phaseDurationsMs.importWorkouts = Date.now() - importStartedAt;
      const activitiesImported = this.countOutcomes(outcomes, 'imported');
      const activitiesSkipped = this.countOutcomes(outcomes, 'skipped');
      const activitiesRepaired = this.countOutcomes(outcomes, 'repaired');
      const activitiesFailed = this.countOutcomes(outcomes, 'failed');
      const errorsByCode = this.countErrors(outcomes);
      if (!workoutFetch.isPaginationVerified) errorsByCode.SUUNTO_PAGINATION_UNVERIFIED = 1;
      const activitiesReconciled = activitiesImported + activitiesRepaired;
      phaseDurationsMs.reconcile = 0;
      const lastSuccessAt = new Date().toISOString();
      const status = activitiesFailed > 0 || !workoutFetch.isPaginationVerified ? 'partial' : 'success';
      await this.markConnectionResult(userId, lastSuccessAt, status, errorsByCode);
      await this.syncStateService.saveState({
        userId,
        provider: 'suunto',
        sourceChannel: 'cloud',
        sourcePackage: null,
        syncDomain: 'activities',
        cursorToken: null,
        anchorToken: null,
        lastRecordAt: workoutFetch.isPaginationVerified ? lastSuccessAt : null,
        status,
        metadata: {
          jobId: job.jobId,
          activitiesImported,
          activitiesSkipped,
          activitiesRepaired,
          activitiesFailed,
          activitiesReconciled,
          errorsByCode,
          phaseDurationsMs,
          canonicalVersion: CANONICAL_ACTIVITY_VERSION,
          paginationVerified: workoutFetch.isPaginationVerified,
        },
      });
      await this.importLifecycleService.finishSyncJob({
        jobId: job.jobId,
        leaseToken: job.leaseToken,
        status,
        counters: {
          activitiesImported,
          activitiesSkipped,
          activitiesRepaired,
          activitiesFailed,
          activitiesReconciled,
        },
        lastError: activitiesFailed > 0 ? 'SUUNTO_SYNC_PARTIAL' : null,
      });
      return {
        provider: 'suunto',
        jobId: job.jobId,
        status,
        activitiesImported,
        activitiesSkipped,
        activitiesRepaired,
        activitiesFailed,
        activitiesReconciled,
        errorsByCode,
        phaseDurationsMs,
        lastSuccessAt,
      };
    } catch (error: unknown) {
      await this.finishFailedJob(job.jobId, job.leaseToken, error);
      await this.markConnectionError(userId, this.getErrorMessage(error));
      throw error;
    } finally {
      stopLeaseHeartbeat();
    }
  }

  private buildActiveJobResult(jobId: string): SuuntoSyncResult {
    return {
      provider: 'suunto',
      jobId,
      status: 'running',
      activitiesImported: 0,
      activitiesSkipped: 0,
      activitiesRepaired: 0,
      activitiesFailed: 0,
      activitiesReconciled: 0,
      errorsByCode: {},
      phaseDurationsMs: {},
      lastSuccessAt: null,
    };
  }

  private startLeaseHeartbeat(jobId: string, leaseToken: string): () => void {
    const timer = setInterval(() => {
      void this.importLifecycleService.renewSyncJob(jobId, leaseToken).catch(error => {
        this.logger.error('Failed to renew Suunto sync job lease', error as Error);
      });
    }, 60_000);
    timer.unref();
    return () => clearInterval(timer);
  }

  private async processWorkout(input: {
    userId: string;
    accessToken: string;
    workoutKey: string;
    summary: JsonRecord;
    jobId: string;
    phaseDurationsMs: Record<string, number>;
  }): Promise<WorkoutImportOutcome> {
    const startedAt = Date.now();
    const userIdHash = this.anonymize(input.userId);
    const workoutKeyHash = this.anonymize(input.workoutKey);
    let importId: string | null = null;
    try {
      const claimStartedAt = Date.now();
      const claim = await this.importLifecycleService.claimActivity({
        userId: input.userId,
        provider: 'suunto',
        sourceChannel: 'cloud',
        sourcePackage: null,
        sourceRecordId: input.workoutKey,
        canonicalVersion: CANONICAL_ACTIVITY_VERSION,
        jobId: input.jobId,
      });
      this.addPhaseDuration(input.phaseDurationsMs, 'claim', Date.now() - claimStartedAt);
      importId = claim.importId;
      if (claim.action === 'skip') {
        this.logger.log({
          jobId: input.jobId,
          traceId: input.jobId,
          userIdHash,
          workoutKeyHash,
          provider: 'suunto',
          phase: 'claim',
          result: 'skipped',
          durationMs: Date.now() - startedAt,
        });
        return { kind: 'skipped' };
      }
      await this.importWorkout(
        input.userId,
        input.accessToken,
        input.workoutKey,
        input.summary,
        importId,
        input.jobId,
        input.phaseDurationsMs,
      );
      const result = claim.action === 'repair' ? 'repaired' : 'imported';
      this.logger.log({
        jobId: input.jobId,
        traceId: input.jobId,
        userIdHash,
        workoutKeyHash,
        provider: 'suunto',
        phase: 'persist',
        result,
        durationMs: Date.now() - startedAt,
      });
      return { kind: result };
    } catch (error: unknown) {
      const errorCode = this.getErrorMessage(error);
      if (importId) {
        try {
          await this.importLifecycleService.failActivity(importId, errorCode, this.isRetryableError(error));
        } catch (lifecycleError) {
          this.logger.error('Failed to persist Suunto activity lifecycle error', lifecycleError as Error);
        }
      }
      this.logger.warn({
        jobId: input.jobId,
        traceId: input.jobId,
        userIdHash,
        workoutKeyHash,
        provider: 'suunto',
        phase: 'persist',
        result: 'failed',
        errorCode,
        durationMs: Date.now() - startedAt,
        message: 'Suunto workout import failed',
      });
      return { kind: 'failed', errorCode };
    }
  }

  private async importWorkout(
    userId: string,
    accessToken: string,
    workoutKey: string,
    summary: JsonRecord,
    lifecycleImportId: string,
    lifecycleJobId: string,
    phaseDurationsMs: Record<string, number>,
  ): Promise<string> {
    const rawPayload = await this.rawPayloadService.storeRawPayload({
      userId,
      provider: 'suunto',
      sourceChannel: 'cloud',
      sourcePackage: null,
      objectType: 'activity',
      sourceRecordId: workoutKey,
      payload: summary,
      traceId: null,
    });
    const downloadStartedAt = Date.now();
    const fitBytes = await this.fetchWorkoutFit(accessToken, workoutKey);
    this.addPhaseDuration(phaseDurationsMs, 'downloadFit', Date.now() - downloadStartedAt);
    const parseStartedAt = Date.now();
    const activity = applySuuntoWorkoutSummaryTimeMetadata(
      parseActivityFileToCanonical(fitBytes, `suunto-${workoutKey}.fit`),
      summary,
    );
    this.addPhaseDuration(phaseDurationsMs, 'parseFit', Date.now() - parseStartedAt);
    const provenance: CanonicalProvenance = {
      provider: 'suunto',
      sourceChannel: 'cloud',
      sourcePackage: null,
      sourceProviderKey: 'suunto',
      sourceRecordId: workoutKey,
      sourceUpdatedAt: null,
      rawPayloadId: rawPayload.id,
    };
    const persistStartedAt = Date.now();
    const sessionId = await this.activityWriterService.upsertActivity({
      userId,
      activity,
      provenance,
      lifecycleImportId,
      lifecycleJobId,
      canonicalVersion: CANONICAL_ACTIVITY_VERSION,
    });
    this.addPhaseDuration(phaseDurationsMs, 'persist', Date.now() - persistStartedAt);
    return sessionId;
  }

  private addPhaseDuration(durations: Record<string, number>, phase: string, durationMs: number): void {
    durations[phase] = (durations[phase] ?? 0) + durationMs;
  }

  private async mapWithConcurrency<T, TResult>(
    items: T[],
    concurrency: number,
    task: (item: T) => Promise<TResult>,
  ): Promise<TResult[]> {
    let nextIndex = 0;
    const results: TResult[] = new Array<TResult>(items.length);
    const workerCount = Math.min(Math.max(concurrency, 1), items.length);
    await Promise.all(
      Array.from({ length: workerCount }, async () => {
        while (nextIndex < items.length) {
          const currentIndex = nextIndex;
          nextIndex += 1;
          results[currentIndex] = await task(items[currentIndex]);
        }
      }),
    );
    return results;
  }

  private countOutcomes(outcomes: WorkoutImportOutcome[], kind: WorkoutImportOutcome['kind']): number {
    return outcomes.filter(outcome => outcome.kind === kind).length;
  }

  private countErrors(outcomes: WorkoutImportOutcome[]): Record<string, number> {
    return outcomes.reduce<Record<string, number>>((counts, outcome) => {
      if (outcome.kind !== 'failed' || !outcome.errorCode) return counts;
      counts[outcome.errorCode] = (counts[outcome.errorCode] ?? 0) + 1;
      return counts;
    }, {});
  }

  private async fetchWorkoutSummaries(accessToken: string, userId?: string): Promise<WorkoutSummaryFetchResult> {
    const since = await this.resolveWorkoutLookbackStartMs(userId);
    const response = await this.getSuunto<JsonRecord | JsonRecord[]>(
      '/v2/workouts',
      accessToken,
      this.workoutPaginationStrategy.buildRequest(String(since)),
    );
    const page = this.extractWorkoutSummaries(response);
    const workoutsByKey = new Map<string, JsonRecord>();
    page.forEach(workout => {
      const workoutKey = this.readWorkoutKey(workout);
      if (workoutKey && !workoutsByKey.has(workoutKey)) workoutsByKey.set(workoutKey, workout);
    });
    return {
      workouts: this.filterRecentWorkoutSummaries([...workoutsByKey.values()], since),
      isPaginationVerified: this.workoutPaginationStrategy.isComplete(page.length),
    };
  }

  private extractWorkoutSummaries(response: JsonRecord | JsonRecord[]): JsonRecord[] {
    if (Array.isArray(response)) return response.filter(this.isRecord);
    const workouts = response.payload ?? response.workouts ?? response.data;
    if (Array.isArray(workouts)) return workouts.filter(this.isRecord);
    return [];
  }

  private filterRecentWorkoutSummaries(values: unknown[], since: number): JsonRecord[] {
    return values.filter(this.isRecord).filter(workout => this.isWorkoutWithinLookback(workout, since));
  }

  private isWorkoutWithinLookback(workout: JsonRecord, sinceMs: number): boolean {
    const startedAtMs = this.readWorkoutStartedAtMs(workout);
    return startedAtMs != null && startedAtMs >= sinceMs;
  }

  private async resolveWorkoutLookbackStartMs(userId?: string): Promise<number> {
    const now = Date.now();
    if (!userId) return now - FIRST_SYNC_LOOKBACK_DAYS * MS_PER_DAY;
    try {
      const { data: syncState, error: syncStateError } = await this.supabaseAdminService.client
        .from('integration_sync_state')
        .select('metadata, status, last_success_at')
        .eq('user_id', userId)
        .eq('provider', 'suunto')
        .eq('source_channel', 'cloud')
        .eq('sync_domain', 'activities')
        .is('source_package', null)
        .maybeSingle();
      if (syncStateError) throw syncStateError;
      const metadata = this.isRecord(syncState?.metadata) ? syncState.metadata : null;
      const incompletePreviousSync = syncState?.status === 'partial' || syncState?.status === 'error';
      let since = this.selectWorkoutLookbackStartMs(
        now,
        metadata?.canonicalVersion,
        incompletePreviousSync,
        syncState?.last_success_at,
      );

      const repairThreshold = new Date(now - REPAIR_LOOKBACK_DAYS * MS_PER_DAY).toISOString();
      const { data: pendingImport, error: pendingError } = await this.supabaseAdminService.client
        .from('wearable_activity_imports')
        .select('id')
        .eq('user_id', userId)
        .eq('provider', 'suunto')
        .eq('source_channel', 'cloud')
        .in('status', ['processing', 'retryable_error'])
        .gte('updated_at', repairThreshold)
        .limit(1)
        .maybeSingle();
      if (pendingError) throw pendingError;
      if (pendingImport) {
        since = this.selectWorkoutLookbackStartMs(now, metadata?.canonicalVersion, true, syncState?.last_success_at);
      }
      return since;
    } catch {
      return now - FIRST_SYNC_LOOKBACK_DAYS * MS_PER_DAY;
    }
  }

  private selectWorkoutLookbackStartMs(
    now: number,
    canonicalVersion: unknown,
    hasPendingImport: boolean,
    lastSuccessAt?: string | null,
  ): number {
    if (canonicalVersion !== CANONICAL_ACTIVITY_VERSION) return now - FIRST_SYNC_LOOKBACK_DAYS * MS_PER_DAY;
    const firstSyncCutoff = now - FIRST_SYNC_LOOKBACK_DAYS * MS_PER_DAY;
    const parsedLastSuccessAt = lastSuccessAt ? Date.parse(lastSuccessAt) : Number.NaN;
    const normalStart = Number.isFinite(parsedLastSuccessAt)
      ? parsedLastSuccessAt - NORMAL_SYNC_OVERLAP_DAYS * MS_PER_DAY
      : firstSyncCutoff;
    const requestedStart = hasPendingImport
      ? Math.min(normalStart, now - REPAIR_LOOKBACK_DAYS * MS_PER_DAY)
      : normalStart;
    return Math.max(firstSyncCutoff, requestedStart);
  }

  private readWorkoutStartedAtMs(workout: JsonRecord): number | null {
    return this.readTimestampMs(
      workout.startTime ??
        workout.start_time ??
        workout.startedAt ??
        workout.started_at ??
        workout.startDate ??
        workout.start_date ??
        workout.startDateTime ??
        workout.start_date_time ??
        workout.date ??
        workout.timestamp ??
        workout.startTimeInSeconds ??
        workout.StartTimeInSeconds,
    );
  }

  private readTimestampMs(value: unknown): number | null {
    if (typeof value === 'number') return this.normalizeEpochMs(value);
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    if (!trimmed) return null;
    const numericValue = Number(trimmed);
    if (Number.isFinite(numericValue) && /^\d+(\.\d+)?$/.test(trimmed)) return this.normalizeEpochMs(numericValue);
    const parsedMs = Date.parse(trimmed);
    return Number.isFinite(parsedMs) ? parsedMs : null;
  }

  private normalizeEpochMs(value: number): number | null {
    if (!Number.isFinite(value) || value <= 0) return null;
    return value < EPOCH_MS_THRESHOLD ? value * 1000 : value;
  }

  private async fetchWorkoutFit(accessToken: string, workoutKey: string): Promise<Uint8Array> {
    try {
      const response = await this.executeSuuntoRequest(() =>
        axios.get<ArrayBuffer>(`${this.apiBaseUrl}/v2/workout/exportFit/${encodeURIComponent(workoutKey)}`, {
          headers: this.buildApiHeaders(accessToken),
          responseType: 'arraybuffer',
        }),
      );
      return new Uint8Array(response.data);
    } catch (error: unknown) {
      throw this.toHttpException(error);
    }
  }

  private async getUsableToken(userId: string): Promise<ProviderTokenRow> {
    const token = await this.readToken(userId);
    if (!this.isTokenExpired(token.expiresAt)) return token;
    if (!token.refreshToken) throw new UnauthorizedException('SUUNTO_REFRESH_TOKEN_MISSING');
    return this.refreshToken(userId, token);
  }

  private async readToken(userId: string): Promise<ProviderTokenRow> {
    const { data: connection, error: connectionError } = await this.supabaseAdminService.client
      .from('user_connections')
      .select('id, status')
      .eq('user_id', userId)
      .eq('provider', 'suunto')
      .maybeSingle();
    if (connectionError) throw new InternalServerErrorException('SUUNTO_CONNECTION_READ_FAILED');
    if (!connection || connection.status !== 'active') throw new UnauthorizedException('SUUNTO_CONNECTION_REQUIRED');

    const { data: token, error: tokenError } = await this.supabaseAdminService.client
      .from('provider_connection_tokens')
      .select('access_token, refresh_token, token_expires_at')
      .eq('connection_id', connection.id)
      .maybeSingle();
    if (tokenError) throw new InternalServerErrorException('SUUNTO_TOKEN_READ_FAILED');
    if (!token?.access_token) throw new UnauthorizedException('SUUNTO_ACCESS_TOKEN_MISSING');
    return {
      connectionId: connection.id,
      accessToken: token.access_token,
      refreshToken: token.refresh_token,
      expiresAt: token.token_expires_at,
    };
  }

  private async refreshToken(userId: string, token: ProviderTokenRow): Promise<ProviderTokenRow> {
    const clientId = this.configService.get<string>('SUUNTO_CLIENT_ID');
    const clientSecret = this.configService.get<string>('SUUNTO_CLIENT_SECRET');
    if (!clientId || !clientSecret) throw new InternalServerErrorException('SUUNTO_CLIENT_CREDENTIALS_MISSING');
    if (!token.refreshToken) throw new UnauthorizedException('SUUNTO_REFRESH_TOKEN_MISSING');
    const response = await axios.post(
      this.tokenUrl,
      new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: token.refreshToken,
      }).toString(),
      {
        headers: {
          Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      },
    );
    const data = response.data as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
      token_type?: string;
    };
    if (!data.access_token) throw new BadGatewayException('SUUNTO_TOKEN_REFRESH_FAILED');
    const expiresAt = new Date(Date.now() + (data.expires_in ?? 86400) * 1000).toISOString();
    const refreshToken = data.refresh_token ?? token.refreshToken;
    await this.supabaseAdminService.client
      .from('provider_connection_tokens')
      .update({
        access_token: data.access_token,
        refresh_token: refreshToken,
        token_type: data.token_type ?? null,
        token_expires_at: expiresAt,
        updated_at: new Date().toISOString(),
      })
      .eq('connection_id', token.connectionId);
    await this.supabaseAdminService.client
      .from('user_connections')
      .update({
        token_expires_at: expiresAt,
        status: 'active',
        last_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', token.connectionId)
      .eq('user_id', userId);
    return {
      connectionId: token.connectionId,
      accessToken: data.access_token,
      refreshToken,
      expiresAt,
    };
  }

  private async getSuunto<T>(path: string, accessToken: string, params?: Record<string, string>): Promise<T> {
    try {
      const response = await this.executeSuuntoRequest(() =>
        axios.get<T>(`${this.apiBaseUrl}${path}`, {
          headers: {
            ...this.buildApiHeaders(accessToken),
            Accept: 'application/json',
          },
          params,
        }),
      );
      return response.data;
    } catch (error: unknown) {
      throw this.toHttpException(error);
    }
  }

  private async executeSuuntoRequest<T>(request: () => Promise<T>): Promise<T> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= SUUNTO_REQUEST_RETRIES; attempt += 1) {
      try {
        return await request();
      } catch (error: unknown) {
        lastError = error;
        if (attempt === SUUNTO_REQUEST_RETRIES || !this.shouldRetrySuuntoRequest(error)) throw error;
        await this.sleep(this.retryDelayMs(error, attempt));
      }
    }
    throw lastError;
  }

  private shouldRetrySuuntoRequest(error: unknown): boolean {
    if (!axios.isAxiosError(error)) return false;
    const status = error.response?.status;
    return status == null || status === 429 || status >= 500;
  }

  private retryDelayMs(error: unknown, attempt: number): number {
    if (axios.isAxiosError(error)) {
      const retryAfter = error.response?.headers?.['retry-after'];
      const parsed = this.parseRetryAfterMs(retryAfter);
      if (parsed != null) return parsed;
    }
    return SUUNTO_RETRY_BASE_DELAY_MS * 2 ** attempt + Math.floor(Math.random() * 100);
  }

  private parseRetryAfterMs(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) return Math.max(0, value * 1000);
    if (typeof value !== 'string') return null;
    const seconds = Number(value);
    if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
    const timestamp = Date.parse(value);
    return Number.isFinite(timestamp) ? Math.max(0, timestamp - Date.now()) : null;
  }

  private async sleep(milliseconds: number): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, milliseconds));
  }

  // Suunto Cloud API requires the APIZONE subscription key alongside the user token.
  private buildApiHeaders(accessToken: string): Record<string, string> {
    const subscriptionKey = this.configService.get<string>('SUUNTO_SUBSCRIPTION_KEY');
    if (!subscriptionKey) throw new InternalServerErrorException('SUUNTO_SUBSCRIPTION_KEY_MISSING');
    return {
      Authorization: `Bearer ${accessToken}`,
      'Ocp-Apim-Subscription-Key': subscriptionKey,
    };
  }

  private toHttpException(error: unknown): Error {
    if (axios.isAxiosError(error) && error.response?.status === 429) {
      return new ServiceUnavailableException('SUUNTO_RATE_LIMITED');
    }
    if (axios.isAxiosError(error) && (error.response?.status === 401 || error.response?.status === 403)) {
      return new UnauthorizedException('SUUNTO_TOKEN_EXPIRED_OR_REVOKED');
    }
    return new BadGatewayException('SUUNTO_CLOUDAPI_REQUEST_FAILED');
  }

  private async markConnectionResult(
    userId: string,
    syncedAt: string,
    status: 'success' | 'partial',
    errorsByCode: Record<string, number>,
  ): Promise<void> {
    await this.supabaseAdminService.client
      .from('user_connections')
      .update({
        last_synced_at: syncedAt,
        status: 'active',
        last_error: status === 'partial' ? JSON.stringify(errorsByCode) : null,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId)
      .eq('provider', 'suunto');
  }

  private async finishFailedJob(jobId: string, leaseToken: string, error: unknown): Promise<void> {
    try {
      await this.importLifecycleService.finishSyncJob({
        jobId,
        leaseToken,
        status: 'error',
        counters: {},
        lastError: this.getErrorMessage(error),
      });
    } catch (finishError) {
      this.logger.error('Failed to close Suunto sync job', finishError as Error);
    }
  }

  private isRetryableError(error: unknown): boolean {
    return !(error instanceof UnauthorizedException || error instanceof BadRequestException);
  }

  private async markConnectionError(userId: string, message: string): Promise<void> {
    await this.supabaseAdminService.client
      .from('user_connections')
      .update({
        status: 'error',
        last_error: message,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId)
      .eq('provider', 'suunto');
  }

  private readWorkoutKey(workout: JsonRecord): string | null {
    return this.readString(workout.workoutKey) ?? this.readString(workout.workoutId) ?? this.readString(workout.key);
  }

  private isTokenExpired(expiresAt: string | null): boolean {
    if (!expiresAt) return false;
    return new Date(expiresAt).getTime() <= Date.now() + 60000;
  }

  private getErrorMessage(error: unknown): string {
    if (error instanceof Error) return error.message;
    return 'SUUNTO_SYNC_FAILED';
  }

  private readString(value: unknown): string | null {
    return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
  }

  private anonymize(value: string): string {
    return createHash('sha256').update(value).digest('hex').slice(0, 16);
  }

  private isRecord(value: unknown): value is JsonRecord {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
}
