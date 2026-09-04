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
  @ApiHeader({ name: 'client_id', required: true })
  @ApiHeader({ name: 'secret', required: true })
  @ApiOkResponse({ type: CorosWebhookResponseDto })
  public async receiveWorkouts(
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Body() body: CorosWorkoutPushDto,
  ): Promise<CorosWebhookResponseDto> {
    const client = this.readHeader(headers, ['client_id', 'client-id', 'client']);
    const secret = this.readHeader(headers, ['secret', 'client_secret', 'client-secret']);
    this.corosWebhookService.authenticate(client, secret);
    await this.corosWebhookService.enqueue(body);
    return { message: 'ok', result: '0000' };
  }

  private readHeader(headers: Record<string, string | string[] | undefined>, names: string[]): string | undefined {
    for (const name of names) {
      const value = headers[name];
      if (typeof value === 'string') return value;
      if (Array.isArray(value) && typeof value[0] === 'string') return value[0];
    }
    return undefined;
  }
}
