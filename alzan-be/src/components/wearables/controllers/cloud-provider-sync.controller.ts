import { Controller, Post } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { UserContext, UserCtx } from '../../../common/decorators/user-context.decorator';
import { SupabaseUserAuth } from '../../../core/guards/auth.decorator';
import { CloudProviderSyncOutputDto } from '../dto/cloud-provider-sync.dto';
import { PolarAccessLinkService } from '../services/polar-access-link.service';
import { SuuntoCloudSyncService } from '../services/suunto-cloud-sync.service';
import { CorosCloudSyncService } from '../services/coros-cloud-sync.service';
import { SuuntoHealthSyncService } from '../services/suunto-health-sync.service';

@ApiTags('Wearables')
@Controller('wearables/cloud')
@SupabaseUserAuth()
export class CloudProviderSyncController {
  constructor(
    private readonly polarAccessLinkService: PolarAccessLinkService,
    private readonly suuntoCloudSyncService: SuuntoCloudSyncService,
    private readonly suuntoHealthSyncService: SuuntoHealthSyncService,
    private readonly corosCloudSyncService: CorosCloudSyncService,
  ) {}

  @Post('polar/sync')
  @ApiOkResponse({ type: CloudProviderSyncOutputDto })
  public async syncPolar(@UserContext() ctx: UserCtx): Promise<CloudProviderSyncOutputDto> {
    const result = await this.polarAccessLinkService.syncActivities(ctx.user.id);
    return {
      provider: result.provider,
      activities_imported: result.activitiesImported,
      last_success_at: result.lastSuccessAt,
    };
  }

  @Post('suunto/sync')
  @ApiOkResponse({ type: CloudProviderSyncOutputDto })
  public async syncSuunto(@UserContext() ctx: UserCtx): Promise<CloudProviderSyncOutputDto> {
    const result = await this.suuntoCloudSyncService.syncActivities(ctx.user.id);
    const health = result.status === 'running' ? null : await this.suuntoHealthSyncService.sync(ctx.user.id);
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
