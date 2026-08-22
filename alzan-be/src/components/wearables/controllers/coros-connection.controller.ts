import { Controller, Delete, Get } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { UserContext, UserCtx } from '../../../common/decorators/user-context.decorator';
import { SupabaseUserAuth } from '../../../core/guards/auth.decorator';
import { CorosCapabilityDto, CorosDisconnectDto } from '../dto/coros-connection.dto';
import { CorosConnectionService } from '../services/coros-connection.service';

@ApiTags('Wearables')
@Controller('wearables')
@SupabaseUserAuth()
export class CorosConnectionController {
  constructor(private readonly corosConnectionService: CorosConnectionService) {}

  @Get('cloud/coros/capability')
  @ApiOkResponse({ type: CorosCapabilityDto })
  public capability(@UserContext() ctx: UserCtx): CorosCapabilityDto {
    return this.corosConnectionService.capability(ctx.user.id);
  }

  @Delete('connections/coros')
  @ApiOkResponse({ type: CorosDisconnectDto })
  public async disconnect(@UserContext() ctx: UserCtx): Promise<CorosDisconnectDto> {
    const result = await this.corosConnectionService.disconnect(ctx.user.id);
    return {
      disconnected: result.disconnected,
      remote_deauthorization_pending: result.remoteDeauthorizationPending,
    };
  }
}
