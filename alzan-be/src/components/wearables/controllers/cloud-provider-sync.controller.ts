import { Controller, Get, Post } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { UserContext, UserCtx } from '../../../common/decorators/user-context.decorator';
import { SupabaseUserAuth } from '../../../core/guards/auth.decorator';
import {
  ActiveCloudSyncsOutputDto,
  CancelCloudSyncsOutputDto,
  CloudProviderSyncOutputDto,
} from '../dto/cloud-provider-sync.dto';
import { PolarAccessLinkService } from '../services/polar-access-link.service';
import { SuuntoCloudSyncService } from '../services/suunto-cloud-sync.service';
import { CorosCloudSyncService } from '../services/coros-cloud-sync.service';
import { SuuntoHealthSyncService } from '../services/suunto-health-sync.service';
import { WearableImportLifecycleService } from '../services/wearable-import-lifecycle.service';

@ApiTags('Wearables')
@Controller('wearables/cloud')
@SupabaseUserAuth()
export class CloudProviderSyncController {
  constructor(
    private readonly polarAccessLinkService: PolarAccessLinkService,
    private readonly suuntoCloudSyncService: SuuntoCloudSyncService,
    private readonly suuntoHealthSyncService: SuuntoHealthSyncService,
    private readonly corosCloudSyncService: CorosCloudSyncService,
    private readonly importLifecycleService: WearableImportLifecycleService,
  ) {}

  @Get('active')
  @ApiOkResponse({ type: ActiveCloudSyncsOutputDto })
  public async listActiveSyncs(@UserContext() ctx: UserCtx): Promise<ActiveCloudSyncsOutputDto> {
    const jobs = await this.importLifecycleService.listActiveSyncJobs(ctx.user.id);
    return {
      jobs: jobs.map(job => ({
        id: job.id,
        provider: job.provider,
        sync_domain: job.syncDomain,
        started_at: job.startedAt,
        updated_at: job.updatedAt,
        cancellation_requested: job.cancellationRequested,
      })),
    };
  }

  @Post('cancel')
  @ApiOkResponse({ type: CancelCloudSyncsOutputDto })
  public async cancelActiveSyncs(@UserContext() ctx: UserCtx): Promise<CancelCloudSyncsOutputDto> {
    return { requested_count: await this.importLifecycleService.requestActiveSyncCancellation(ctx.user.id) };
  }

  @Post('polar/sync')
  @ApiOkResponse({ type: CloudProviderSyncOutputDto })
  public async syncPolar(@UserContext() ctx: UserCtx): Promise<CloudProviderSyncOutputDto> {
    const result = await this.polarAccessLinkService.syncActivities(ctx.user.id);
    return {
      provider: result.provider,
      job_id: result.jobId,
      status: result.status,
      cancelled: result.cancelled,
      retry_after_at: result.retryAfterAt,
      activities_imported: result.activitiesImported,
      last_success_at: result.lastSuccessAt,
    };
  }

  @Post('suunto/sync')
  @ApiOkResponse({ type: CloudProviderSyncOutputDto })
  public async syncSuunto(@UserContext() ctx: UserCtx): Promise<CloudProviderSyncOutputDto> {
    const result = await this.suuntoCloudSyncService.syncActivities(ctx.user.id);
    const health =
      result.status === 'running' || result.cancelled ? null : await this.suuntoHealthSyncService.sync(ctx.user.id);
    const status =
      result.status === 'running' || health?.status === 'running'
        ? 'running'
        : result.status === 'partial' || health?.status !== 'success'
          ? 'partial'
          : 'success';
    const errorsByCode = { ...result.errorsByCode };
    if (health?.errorCode) errorsByCode[health.errorCode] = (errorsByCode[health.errorCode] ?? 0) + 1;
    return {
      provider: result.provider,
      job_id: result.jobId,
      status,
      cancelled: result.cancelled || health?.cancelled,
      activities_imported: result.activitiesImported,
      activities_skipped: result.activitiesSkipped,
      activities_updated: 0,
      activities_repaired: result.activitiesRepaired,
      activities_failed: result.activitiesFailed,
      activities_reconciled: result.activitiesReconciled,
      errors_by_code: errorsByCode,
      phase_durations_ms: result.phaseDurationsMs,
      last_success_at: result.lastSuccessAt,
      health_sync_status: health?.status ?? 'skipped',
      retry_after_at: result.status === 'running' ? result.retryAfterAt : health?.retryAfterAt,
      health_sync_error: health?.errorCode,
      health_samples_imported: health?.healthSamplesImported ?? 0,
      health_days_imported: health?.healthDaysImported ?? 0,
      health_sleeps_imported: health?.sleepsImported ?? 0,
      health_recoveries_imported: health?.recoveriesImported ?? 0,
      health_last_synced_at: health?.lastSyncedAt ?? null,
    };
  }

  @Post('coros/sync')
  @ApiOkResponse({ type: CloudProviderSyncOutputDto })
  public async syncCoros(@UserContext() ctx: UserCtx): Promise<CloudProviderSyncOutputDto> {
    const result = await this.corosCloudSyncService.sync(ctx.user.id);
    return {
      provider: result.provider,
      job_id: result.jobId,
      status: result.status,
      cancelled: result.cancelled,
      activities_imported: result.activitiesImported,
      activities_skipped: result.activitiesSkipped,
      activities_failed: result.activitiesFailed,
      errors_by_code: result.errorsByCode,
      health_days_imported: result.healthDaysImported,
      health_consent_required: result.healthConsentRequired,
      backfill_complete:
        'backfillComplete' in result && typeof result.backfillComplete === 'boolean'
          ? result.backfillComplete
          : undefined,
      backfill_next_date:
        'backfillNextDate' in result &&
        (typeof result.backfillNextDate === 'string' || result.backfillNextDate === null)
          ? result.backfillNextDate
          : undefined,
      fit_pending: 'fitPending' in result && typeof result.fitPending === 'number' ? result.fitPending : undefined,
      last_success_at: result.lastSuccessAt,
    };
  }
}
