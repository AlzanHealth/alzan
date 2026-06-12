import { Controller, Post } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { UserContext, UserCtx } from '../../../common/decorators/user-context.decorator';
import { SupabaseUserAuth } from '../../../core/guards/auth.decorator';
import { CloudProviderSyncOutputDto } from '../dto/cloud-provider-sync.dto';
import { PolarAccessLinkService } from '../services/polar-access-link.service';
import { SuuntoCloudSyncService } from '../services/suunto-cloud-sync.service';

@ApiTags('Wearables')
@Controller('wearables/cloud')
@SupabaseUserAuth()
export class CloudProviderSyncController {
  constructor(
    private readonly polarAccessLinkService: PolarAccessLinkService,
    private readonly suuntoCloudSyncService: SuuntoCloudSyncService,
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
      activities_imported: result.activitiesImported,
      last_success_at: result.lastSuccessAt,
    };
  }
}
