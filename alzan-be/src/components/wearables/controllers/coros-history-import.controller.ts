import { Controller, HttpCode, HttpStatus, Post, UploadedFiles, UseInterceptors } from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { UserContext, UserCtx } from '../../../common/decorators/user-context.decorator';
import { SupabaseUserAuth } from '../../../core/guards/auth.decorator';
import {
  ACTIVITY_IMPORT_MAX_FILE_SIZE_BYTES,
  ActivityImportUploadedFile,
} from '../../activity-import/activity-import.types';
import { CorosHistoryImportResultDto } from '../dto/coros-history-import.dto';
import { CorosHistoryImportResult, CorosHistoryImportService } from '../services/coros-history-import.service';

@ApiTags('Activity imports')
@Controller('activity-imports/coros')
@SupabaseUserAuth()
export class CorosHistoryImportController {
  constructor(private readonly corosHistoryImportService: CorosHistoryImportService) {}

  @Post('history')
  @HttpCode(HttpStatus.OK)
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['files'],
      properties: {
        files: { type: 'array', items: { type: 'string', format: 'binary' }, maxItems: 50 },
      },
    },
  })
  @ApiOkResponse({ type: CorosHistoryImportResultDto, description: 'COROS Training Hub FIT files imported' })
  @UseInterceptors(FilesInterceptor('files', 50, { limits: { fileSize: ACTIVITY_IMPORT_MAX_FILE_SIZE_BYTES } }))
  public async importHistory(
    @UserContext() ctx: UserCtx,
    @UploadedFiles() files: ActivityImportUploadedFile[],
  ): Promise<CorosHistoryImportResult> {
    return this.corosHistoryImportService.importFiles(ctx.user.id, files);
  }
}
