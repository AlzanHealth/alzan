import { Body, Controller, Post } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { UserContext, UserCtx } from '../../../common/decorators/user-context.decorator';
import { SupabaseUserAuth } from '../../../core/guards/auth.decorator';
import {
  ArchivedActivityStreamSampleDto,
  ReadArchivedActivityStreamsDto,
  ReadArchivedActivityStreamsOutputDto,
} from '../dto/activity-stream-archive.dto';
import { ActivityStreamArchiveService } from '../services/activity-stream-archive.service';

@ApiTags('Wearables')
@Controller('wearables')
@SupabaseUserAuth()
export class ActivityStreamArchiveController {
  constructor(private readonly activityStreamArchiveService: ActivityStreamArchiveService) {}

  @Post('activity-stream-archives/read')
  @ApiOkResponse({ type: ReadArchivedActivityStreamsOutputDto })
  public async readArchivedSamples(
    @UserContext() ctx: UserCtx,
    @Body() body: ReadArchivedActivityStreamsDto,
  ): Promise<ReadArchivedActivityStreamsOutputDto> {
    const result = await this.activityStreamArchiveService.readForUser(ctx.user.id, body.session_ids);
    const output = new ReadArchivedActivityStreamsOutputDto();
    output.archived_session_ids = result.archived_session_ids;
    output.samples = result.samples.map(sample => Object.assign(new ArchivedActivityStreamSampleDto(), sample));
    return output;
  }
}
