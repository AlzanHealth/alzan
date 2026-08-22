import { Body, Controller, Get, Headers, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiHeader, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { PublicAuth } from '../../../core/guards/auth.decorator';
import { CorosWebhookResponseDto, CorosWebhookStatusDto, CorosWorkoutPushDto } from '../dto/coros-webhook.dto';
import { CorosWebhookService } from '../services/coros-webhook.service';

@ApiTags('Wearables')
@Controller('webhooks/coros')
@PublicAuth()
export class CorosWebhookController {
  constructor(private readonly corosWebhookService: CorosWebhookService) {}

  @Get('status')
  @ApiOkResponse({ type: CorosWebhookStatusDto })
  public status(): CorosWebhookStatusDto {
    return { status: 'ok' };
  }

  @Post('workouts')
  @HttpCode(HttpStatus.OK)
  @ApiHeader({ name: 'client', required: true })
  @ApiHeader({ name: 'secret', required: true })
  @ApiOkResponse({ type: CorosWebhookResponseDto })
  public async receiveWorkouts(
    @Headers('client') client: string | undefined,
    @Headers('secret') secret: string | undefined,
    @Body() body: CorosWorkoutPushDto,
  ): Promise<CorosWebhookResponseDto> {
    this.corosWebhookService.authenticate(client, secret);
    await this.corosWebhookService.enqueue(body);
    return { message: 'ok', result: '0000' };
  }
}
