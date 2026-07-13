import { Injectable, InternalServerErrorException } from '@nestjs/common';
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
export class WearableImportLifecycleService {
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
    const { data, error } = await this.supabaseAdminService.client.rpc('claim_wearable_sync_job', {
      p_user_id: input.userId,
      p_provider: input.provider,
      p_sync_domain: input.syncDomain,
      p_lease_seconds: input.leaseSeconds ?? 300,
    });
    if (error) throw new InternalServerErrorException('WEARABLE_SYNC_JOB_CLAIM_FAILED');
    return this.parseSyncJobClaim(data);
  }

  public async finishSyncJob(input: FinishWearableSyncJobInput): Promise<void> {
    const { error } = await this.supabaseAdminService.client.rpc('finish_wearable_sync_job', {
      p_job_id: input.jobId,
      p_lease_token: input.leaseToken,
      p_status: input.status,
      p_counters: input.counters,
      p_last_error: input.lastError ?? undefined,
    });
    if (error) throw new InternalServerErrorException('WEARABLE_SYNC_JOB_FINISH_FAILED');
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

  private parseSyncJobClaim(value: Json): WearableSyncJobClaim {
    const record: JsonRecord = this.requireRecord(value, 'WEARABLE_SYNC_JOB_CLAIM_INVALID');
    const action: Json | undefined = record.action;
    const jobId: Json | undefined = record.job_id;
    const leaseToken: Json | undefined = record.lease_token;
    const leaseExpiresAt: Json | undefined = record.lease_expires_at;
    if (
      (action !== 'acquired' && action !== 'active') ||
      typeof jobId !== 'string' ||
      typeof leaseToken !== 'string' ||
      typeof leaseExpiresAt !== 'string'
    ) {
      throw new InternalServerErrorException('WEARABLE_SYNC_JOB_CLAIM_INVALID');
    }
    return { action, jobId, leaseToken, leaseExpiresAt };
  }

  private requireRecord(value: Json, errorCode: string): JsonRecord {
    if (value == null || Array.isArray(value) || typeof value !== 'object') {
      throw new InternalServerErrorException(errorCode);
    }
    return value;
  }
}
