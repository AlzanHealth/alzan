import { Controller, Post } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { UserContext, UserCtx } from '../../../common/decorators/user-context.decorator';
import { SupabaseUserAuth } from '../../../core/guards/auth.decorator';
import { CloudProviderSyncOutputDto } from '../dto/cloud-provider-sync.dto';
import { PolarAccessLinkService } from '../services/polar-access-link.service';
import { SuuntoCloudSyncService } from '../services/suunto-cloud-sync.service';
import { CorosCloudSyncService } from '../services/coros-cloud-sync.service';
import { CorosMcpSyncService } from '../services/coros-mcp-sync.service';

@ApiTags('Wearables')
@Controller('wearables/cloud')
@SupabaseUserAuth()
export class CloudProviderSyncController {
  constructor(
    private readonly polarAccessLinkService: PolarAccessLinkService,
    private readonly suuntoCloudSyncService: SuuntoCloudSyncService,
    private readonly corosCloudSyncService: CorosCloudSyncService,
    private readonly corosMcpSyncService: CorosMcpSyncService,
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
    return {
      provider: result.provider,
      job_id: result.jobId,
      status: result.status,
      activities_imported: result.activitiesImported,
      activities_skipped: result.activitiesSkipped,
      activities_updated: 0,
      activities_repaired: result.activitiesRepaired,
      activities_failed: result.activitiesFailed,
      activities_reconciled: result.activitiesReconciled,
      errors_by_code: result.errorsByCode,
      phase_durations_ms: result.phaseDurationsMs,
      last_success_at: result.lastSuccessAt,
    };
  }

  @Post('coros/sync')
  @ApiOkResponse({ type: CloudProviderSyncOutputDto })
  public async syncCoros(@UserContext() ctx: UserCtx): Promise<CloudProviderSyncOutputDto> {
    const result = await ((await this.corosMcpSyncService.isActiveConnection(ctx.user.id))
      ? this.corosMcpSyncService.sync(ctx.user.id)
      : this.corosCloudSyncService.sync(ctx.user.id));
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
