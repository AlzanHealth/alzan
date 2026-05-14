import { BadRequestException, Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { UserContext, UserCtx } from '../../../common/decorators/user-context.decorator';
import { SupabaseUserAuth } from '../../../core/guards/auth.decorator';
import { LocalHealthSyncDto, LocalHealthSyncOutputDto } from '../dto/local-health-sync.dto';
import {
  ProviderOriginOutputDto,
  SelectHealthConnectOriginDto,
  UpsertProviderOriginsDto,
} from '../dto/provider-origin.dto';
import { LocalSyncResult } from '../domain/wearable.types';
import { LocalHealthSyncService } from '../services/local-health-sync.service';
import { ProviderOriginService } from '../services/provider-origin.service';

@ApiTags('Wearables')
@Controller('wearables')
@SupabaseUserAuth()
export class LocalHealthSyncController {
  constructor(
    private readonly localHealthSyncService: LocalHealthSyncService,
    private readonly providerOriginService: ProviderOriginService,
  ) {}

  @Get('health-connect/origins')
  @ApiOkResponse({ type: [ProviderOriginOutputDto] })
  public async listHealthConnectOrigins(@UserContext() ctx: UserCtx): Promise<ProviderOriginOutputDto[]> {
    const origins = await this.providerOriginService.listOrigins(ctx.user.id, 'health_connect');
    return origins.map(origin => ({
      id: origin.id,
      source_channel: origin.sourceChannel,
      provider: origin.provider,
      source_package: origin.sourcePackage,
      source_provider_key: origin.sourceProviderKey,
      display_name: origin.displayName,
      platform: origin.platform,
      last_seen_at: origin.lastSeenAt,
    }));
  }

  @Post('health-connect/origins')
  @ApiOkResponse({ type: [ProviderOriginOutputDto] })
  public async upsertHealthConnectOrigins(
    @UserContext() ctx: UserCtx,
    @Body() body: UpsertProviderOriginsDto,
  ): Promise<ProviderOriginOutputDto[]> {
    const origins = await Promise.all(
      body.origins.map(origin => {
        if (origin.source_channel !== 'health_connect' || origin.provider !== 'health_connect') {
          throw new BadRequestException('HEALTH_CONNECT_ORIGIN_REQUIRED');
        }
        return this.providerOriginService.upsertOrigin({
          userId: ctx.user.id,
          sourceChannel: origin.source_channel,
          provider: origin.provider,
          sourcePackage: origin.source_package ?? null,
          sourceProviderKey: origin.source_provider_key ?? null,
          displayName: origin.display_name ?? null,
          platform: origin.platform ?? null,
          rawPayload: origin.raw_payload ?? null,
        });
      }),
    );
    return origins.map(origin => ({
      id: origin.id,
      source_channel: origin.sourceChannel,
      provider: origin.provider,
      source_package: origin.sourcePackage,
      source_provider_key: origin.sourceProviderKey,
      display_name: origin.displayName,
      platform: origin.platform,
      last_seen_at: origin.lastSeenAt,
    }));
  }

  @Post('health-connect/origins/select')
  @ApiOkResponse({ type: ProviderOriginOutputDto })
  public async selectHealthConnectOrigin(
    @UserContext() ctx: UserCtx,
    @Body() body: SelectHealthConnectOriginDto,
  ): Promise<ProviderOriginOutputDto> {
    const origin = await this.providerOriginService.selectHealthConnectOrigin(ctx.user.id, body.origin_id);
    return {
      id: origin.id,
      source_channel: origin.sourceChannel,
      provider: origin.provider,
      source_package: origin.sourcePackage,
      source_provider_key: origin.sourceProviderKey,
      display_name: origin.displayName,
      platform: origin.platform,
      last_seen_at: origin.lastSeenAt,
    };
  }

  @Post('local-sync')
  @ApiOkResponse({ type: LocalHealthSyncOutputDto })
  public async syncLocalHealth(
    @UserContext() ctx: UserCtx,
    @Body() body: LocalHealthSyncDto,
  ): Promise<LocalHealthSyncOutputDto> {
    return this.toOutputDto(await this.localHealthSyncService.sync(ctx.user.id, body));
  }

  @Get('health-connect/selection')
  @ApiOkResponse({ type: ProviderOriginOutputDto })
  public async getHealthConnectSelection(
    @UserContext() ctx: UserCtx,
    @Query('source_channel') _sourceChannel?: string,
  ): Promise<ProviderOriginOutputDto | null> {
    const origin = await this.providerOriginService.getHealthConnectSelection(ctx.user.id);
    if (!origin) return null;
    return {
      id: origin.id,
      source_channel: origin.sourceChannel,
      provider: origin.provider,
      source_package: origin.sourcePackage,
      source_provider_key: origin.sourceProviderKey,
      display_name: origin.displayName,
      platform: origin.platform,
      last_seen_at: origin.lastSeenAt,
    };
  }

  private toOutputDto(result: LocalSyncResult): LocalHealthSyncOutputDto {
    return {
      activities_imported: result.activitiesImported,
      daily_activities_imported: result.dailyActivitiesImported,
      sleeps_imported: result.sleepsImported,
      recoveries_imported: result.recoveriesImported,
      health_samples_imported: result.healthSamplesImported,
      origins_upserted: result.originsUpserted,
    };
  }
}
