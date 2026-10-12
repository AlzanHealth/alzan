import {
  Injectable,
  InternalServerErrorException,
  Logger,
  OnModuleDestroy,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Json } from '../../../types/database.types';
import { SupabaseAdminService } from '../../../core/supabase/supabase.service';
import { SyncDomain, WearableProvider } from '../domain/wearable.types';

export type WearableImportClaimAction = 'import' | 'repair' | 'skip';

export interface WearableImportClaimInput {
  userId: string;
  provider: WearableProvider;
  sourceChannel: string;
  sourcePackage: string | null;
  sourceRecordId: string;
  canonicalVersion: number;
  jobId: string;
}

export interface WearableImportClaim {
  action: WearableImportClaimAction;
  importId: string;
  sessionId: string | null;
}

export interface WearableSyncJobClaimInput {
  userId: string;
  provider: WearableProvider;
  syncDomain: SyncDomain;
  leaseSeconds?: number;
}

export interface WearableSyncJobClaim {
  action: 'acquired' | 'active';
  jobId: string;
  leaseToken: string;
  leaseExpiresAt: string;
  retryAfterAt: string | null;
}

export interface ActiveWearableSyncJob {
  id: string;
  provider: WearableProvider;
  syncDomain: SyncDomain;
  startedAt: string;
  updatedAt: string;
  cancellationRequested: boolean;
}

export const WEARABLE_SYNC_CANCEL_REQUESTED = 'WEARABLE_SYNC_CANCEL_REQUESTED';
const STALE_SYNC_WORKER_EXIT_MS = 5 * 60 * 1000;

const STALE_SYNC_HEARTBEAT_MS = 5 * 60 * 1000;

interface ActiveSyncRuntime {
  controller: AbortController;
  completed: Promise<void>;
  markCompleted: () => void;
}

export interface FinishWearableSyncJobInput {
  jobId: string;
  leaseToken: string;
  status: 'success' | 'partial' | 'error';
  counters: Record<string, number>;
  lastError: string | null;
}

type JsonRecord = Record<string, Json | undefined>;

@Injectable()
export class WearableImportLifecycleService implements OnModuleDestroy {
  private readonly logger = new Logger(WearableImportLifecycleService.name);
  private readonly activeSyncRuntimes = new Map<string, ActiveSyncRuntime>();
  private readonly idleWaiters = new Set<() => void>();
  private pendingClaims = 0;
  private shuttingDown = false;

  constructor(private readonly supabaseAdminService: SupabaseAdminService) {}

  public async claimActivity(input: WearableImportClaimInput): Promise<WearableImportClaim> {
    const { data, error } = await this.supabaseAdminService.client.rpc('claim_wearable_activity_import', {
      p_user_id: input.userId,
      p_provider: input.provider,
      p_source_channel: input.sourceChannel,
      p_source_package: input.sourcePackage ?? '',
      p_source_record_id: input.sourceRecordId,
      p_canonical_version: input.canonicalVersion,
      p_job_id: input.jobId,
    });
    if (error) throw new InternalServerErrorException('WEARABLE_ACTIVITY_IMPORT_CLAIM_FAILED');
    return this.parseActivityClaim(data);
  }

  public async completeActivity(importId: string, sessionId: string, canonicalVersion: number): Promise<void> {
    const { error } = await this.supabaseAdminService.client.rpc('complete_wearable_activity_import', {
      p_import_id: importId,
      p_session_id: sessionId,
      p_canonical_version: canonicalVersion,
    });
    if (error) throw new InternalServerErrorException('WEARABLE_ACTIVITY_IMPORT_COMPLETE_FAILED');
  }

  public async failActivity(importId: string, errorCode: string, retryable: boolean): Promise<void> {
    const { error } = await this.supabaseAdminService.client.rpc('fail_wearable_activity_import', {
      p_import_id: importId,
      p_error_code: errorCode,
      p_retryable: retryable,
    });
    if (error) throw new InternalServerErrorException('WEARABLE_ACTIVITY_IMPORT_FAIL_FAILED');
  }

  public async claimSyncJob(input: WearableSyncJobClaimInput): Promise<WearableSyncJobClaim> {
    if (this.shuttingDown) throw new ServiceUnavailableException('WEARABLE_SYNC_BACKEND_SHUTTING_DOWN');
    this.pendingClaims += 1;
    try {
      if (input.provider === 'suunto' || input.provider === 'coros' || input.provider === 'polar') {
        await this.reclaimStaleSyncJob(input);
      }
      const { data, error } = await this.supabaseAdminService.client.rpc('claim_wearable_sync_job', {
        p_user_id: input.userId,
        p_provider: input.provider,
        p_sync_domain: input.syncDomain,
        p_lease_seconds: input.leaseSeconds ?? 300,
      });
      if (error) throw new InternalServerErrorException('WEARABLE_SYNC_JOB_CLAIM_FAILED');
      const claim = this.parseSyncJobClaim(data);
      if (claim.action !== 'active') {
        this.trackActiveSyncJob(claim.jobId);
        return claim;
      }

      const { data: activeJob, error: activeJobError } = await this.supabaseAdminService.client
        .from('wearable_sync_jobs')
        .select('updated_at')
        .eq('id', claim.jobId)
        .maybeSingle();
      if (activeJobError) throw new InternalServerErrorException('WEARABLE_SYNC_JOB_READ_FAILED');
      const heartbeatAt = activeJob?.updated_at ? Date.parse(activeJob.updated_at) : Number.NaN;
      return {
        ...claim,
        retryAfterAt: Number.isFinite(heartbeatAt)
          ? new Date(heartbeatAt + STALE_SYNC_HEARTBEAT_MS).toISOString()
          : null,
      };
    } finally {
      this.pendingClaims -= 1;
      this.resolveIdleWaiters();
    }
  }

  public getSyncJobSignal(jobId: string): AbortSignal | undefined {
    return this.activeSyncRuntimes.get(jobId)?.controller.signal;
  }

  public releaseSyncJob(jobId: string): void {
    const runtime = this.activeSyncRuntimes.get(jobId);
    if (!runtime) return;
    this.activeSyncRuntimes.delete(jobId);
    runtime.markCompleted();
    this.resolveIdleWaiters();
  }

  public async onModuleDestroy(): Promise<void> {
    this.shuttingDown = true;
    await this.waitForPendingClaims();
    const activeJobs = [...this.activeSyncRuntimes.entries()];
    if (activeJobs.length === 0) return;

    for (const [, runtime] of activeJobs) runtime.controller.abort();
    await Promise.all(activeJobs.map(([jobId]) => this.requestShutdownCancellation(jobId)));
    await Promise.all(activeJobs.map(([, runtime]) => runtime.completed));
  }

  public async finishSyncJob(input: FinishWearableSyncJobInput): Promise<boolean> {
    const completedAt = new Date().toISOString();
    const fields = {
      status: input.status,
      counters: input.counters as Json,
      last_error: input.lastError,
      completed_at: completedAt,
      updated_at: completedAt,
    };
    const { data, error } = await this.supabaseAdminService.client
      .from('wearable_sync_jobs')
      .update(fields)
      .eq('id', input.jobId)
      .eq('lease_token', input.leaseToken)
      .eq('status', 'running')
      .or(`last_error.is.null,last_error.neq.${WEARABLE_SYNC_CANCEL_REQUESTED}`)
      .select('id');
    if (error) throw new InternalServerErrorException('WEARABLE_SYNC_JOB_FINISH_FAILED');
    if (data?.length) return input.lastError === WEARABLE_SYNC_CANCEL_REQUESTED;
    const { data: cancelled, error: cancellationError } = await this.supabaseAdminService.client
      .from('wearable_sync_jobs')
      .update({ ...fields, status: 'partial', last_error: WEARABLE_SYNC_CANCEL_REQUESTED })
      .eq('id', input.jobId)
      .eq('lease_token', input.leaseToken)
      .eq('status', 'running')
      .eq('last_error', WEARABLE_SYNC_CANCEL_REQUESTED)
      .select('id');
    if (cancellationError || !cancelled?.length)
      throw new InternalServerErrorException('WEARABLE_SYNC_JOB_FINISH_FAILED');
    return true;
  }

  public async listActiveSyncJobs(userId: string): Promise<ActiveWearableSyncJob[]> {
    await this.closeSyncJobsWithExpiredHeartbeats(userId);
    const { data, error } = await this.supabaseAdminService.client
      .from('wearable_sync_jobs')
      .select('id, provider, sync_domain, started_at, updated_at, last_error')
      .eq('user_id', userId)
      .eq('status', 'running')
      .order('started_at', { ascending: false });
    if (error) throw new InternalServerErrorException('WEARABLE_SYNC_JOBS_READ_FAILED');
    return (data ?? []).map(job => ({
      id: job.id,
      provider: job.provider,
      syncDomain: job.sync_domain as SyncDomain,
      startedAt: job.started_at,
      updatedAt: job.updated_at,
      cancellationRequested: job.last_error === WEARABLE_SYNC_CANCEL_REQUESTED,
    }));
  }

  public async requestActiveSyncCancellation(userId: string): Promise<number> {
    const { data, error } = await this.supabaseAdminService.client
      .from('wearable_sync_jobs')
      .update({ last_error: WEARABLE_SYNC_CANCEL_REQUESTED, updated_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('status', 'running')
      .select('id');
    if (error) throw new InternalServerErrorException('WEARABLE_SYNC_CANCELLATION_REQUEST_FAILED');
    for (const job of data ?? []) this.activeSyncRuntimes.get(job.id)?.controller.abort();
    return data?.length ?? 0;
  }

  public async isSyncCancellationRequested(jobId: string): Promise<boolean> {
    if (this.activeSyncRuntimes.get(jobId)?.controller.signal.aborted) return true;
    const { data, error } = await this.supabaseAdminService.client
      .from('wearable_sync_jobs')
      .select('status, last_error')
      .eq('id', jobId)
      .maybeSingle();
    if (error) throw new InternalServerErrorException('WEARABLE_SYNC_JOB_READ_FAILED');
    return !data || data.status !== 'running' || data.last_error === WEARABLE_SYNC_CANCEL_REQUESTED;
  }

  public async renewSyncJob(jobId: string, leaseToken: string, leaseSeconds = 1800): Promise<void> {
    const { error } = await this.supabaseAdminService.client.rpc('renew_wearable_sync_job', {
      p_job_id: jobId,
      p_lease_token: leaseToken,
      p_lease_seconds: leaseSeconds,
    });
    if (error) throw new InternalServerErrorException('WEARABLE_SYNC_JOB_RENEW_FAILED');
  }

  private parseActivityClaim(value: Json): WearableImportClaim {
    const record: JsonRecord = this.requireRecord(value, 'WEARABLE_ACTIVITY_IMPORT_CLAIM_INVALID');
    const action: Json | undefined = record.action;
    const importId: Json | undefined = record.import_id;
    const sessionId: Json | undefined = record.session_id;
    if ((action !== 'import' && action !== 'repair' && action !== 'skip') || typeof importId !== 'string') {
      throw new InternalServerErrorException('WEARABLE_ACTIVITY_IMPORT_CLAIM_INVALID');
    }
    if (sessionId !== null && sessionId !== undefined && typeof sessionId !== 'string') {
      throw new InternalServerErrorException('WEARABLE_ACTIVITY_IMPORT_CLAIM_INVALID');
    }
    return { action, importId, sessionId: typeof sessionId === 'string' ? sessionId : null };
  }

  private trackActiveSyncJob(jobId: string): void {
    let markCompleted: () => void = () => undefined;
    const completed = new Promise<void>(resolve => {
      markCompleted = resolve;
    });
    const runtime: ActiveSyncRuntime = { controller: new AbortController(), completed, markCompleted };
    this.activeSyncRuntimes.set(jobId, runtime);
    if (this.shuttingDown) runtime.controller.abort();
  }

  private async requestShutdownCancellation(jobId: string): Promise<void> {
    const now = new Date().toISOString();
    const { error } = await this.supabaseAdminService.client
      .from('wearable_sync_jobs')
      .update({ last_error: WEARABLE_SYNC_CANCEL_REQUESTED, updated_at: now })
      .eq('id', jobId)
      .eq('status', 'running');
    if (error) {
      this.logger.error(`Failed to persist shutdown cancellation for wearable sync job ${jobId}`, error.message);
    }
  }

  private async waitForPendingClaims(): Promise<void> {
    if (this.pendingClaims === 0) return;
    await new Promise<void>(resolve => this.idleWaiters.add(resolve));
  }

  private resolveIdleWaiters(): void {
    if (this.pendingClaims > 0) return;
    for (const resolve of this.idleWaiters) resolve();
    this.idleWaiters.clear();
  }

  private parseSyncJobClaim(value: Json): WearableSyncJobClaim {
    const record: JsonRecord = this.requireRecord(value, 'WEARABLE_SYNC_JOB_CLAIM_INVALID');
    const action: Json | undefined = record.action;
    const jobId: Json | undefined = record.job_id;
    const leaseToken: Json | undefined = record.lease_token;
    const leaseExpiresAt: Json | undefined = record.lease_expires_at;
    const retryAfterAt: Json | undefined = record.retry_after_at;
    if (
      (action !== 'acquired' && action !== 'active') ||
      typeof jobId !== 'string' ||
      typeof leaseToken !== 'string' ||
      typeof leaseExpiresAt !== 'string'
    ) {
      throw new InternalServerErrorException('WEARABLE_SYNC_JOB_CLAIM_INVALID');
    }
    return {
      action,
      jobId,
      leaseToken,
      leaseExpiresAt,
      retryAfterAt: typeof retryAfterAt === 'string' ? retryAfterAt : null,
    };
  }

  private async reclaimStaleSyncJob(input: WearableSyncJobClaimInput): Promise<void> {
    const now = Date.now();
    const { error } = await this.supabaseAdminService.client
      .from('wearable_sync_jobs')
      .update({
        status: 'error',
        last_error: 'WEARABLE_SYNC_JOB_HEARTBEAT_EXPIRED',
        completed_at: new Date(now).toISOString(),
        updated_at: new Date(now).toISOString(),
      })
      .eq('user_id', input.userId)
      .eq('provider', input.provider)
      .eq('sync_domain', input.syncDomain)
      .eq('status', 'running')
      .lt('updated_at', new Date(now - STALE_SYNC_HEARTBEAT_MS).toISOString())
      .gt('lease_expires_at', new Date(now).toISOString());
    if (error) throw new InternalServerErrorException('WEARABLE_SYNC_JOB_RECLAIM_FAILED');
  }

  private async closeSyncJobsWithExpiredHeartbeats(userId: string): Promise<void> {
    const now = Date.now();
    const staleBefore = new Date(now - STALE_SYNC_WORKER_EXIT_MS).toISOString();
    const completedAt = new Date(now).toISOString();
    for (const provider of ['suunto', 'coros', 'polar'] as const) {
      const { data: staleJobs, error: staleJobsError } = await this.supabaseAdminService.client
        .from('wearable_sync_jobs')
        .select('id, last_error')
        .eq('user_id', userId)
        .eq('provider', provider)
        .eq('status', 'running')
        .lt('updated_at', staleBefore);
      if (staleJobsError) throw new InternalServerErrorException('WEARABLE_SYNC_JOBS_READ_FAILED');

      for (const job of staleJobs ?? []) {
        const lastError =
          job.last_error === WEARABLE_SYNC_CANCEL_REQUESTED
            ? 'WEARABLE_SYNC_CANCELLED_AFTER_WORKER_EXIT'
            : 'WEARABLE_SYNC_JOB_HEARTBEAT_EXPIRED';
        const { error } = await this.supabaseAdminService.client
          .from('wearable_sync_jobs')
          .update({ status: 'error', last_error: lastError, completed_at: completedAt, updated_at: completedAt })
          .eq('id', job.id)
          .eq('user_id', userId)
          .eq('status', 'running')
          .lt('updated_at', staleBefore);
        if (error) throw new InternalServerErrorException('WEARABLE_SYNC_JOB_RECLAIM_FAILED');
      }
    }
  }

  private requireRecord(value: Json, errorCode: string): JsonRecord {
    if (value == null || Array.isArray(value) || typeof value !== 'object') {
      throw new InternalServerErrorException(errorCode);
    }
    return value;
  }
}
