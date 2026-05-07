import { Body, Controller, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { UserContext, UserCtx } from '../../common/decorators/user-context.decorator';
import { SupabaseUserAuth } from '../../core/guards/auth.decorator';
import { ActivityImportService } from './activity-import.service';
import { ACTIVITY_IMPORT_MAX_FILE_SIZE_BYTES, ActivityImportUploadedFile } from './activity-import.types';
import {
  ApplyRouteActivityImportDto,
  ApplyStrengthActivityImportDto,
  ParseRouteActivityImportDto,
} from './dto/activity-import-input.dto';
import {
  ApplyRouteActivityImportResponseDto,
  ImportedStrengthActivitySummaryDto,
  ParsedRouteImportDto,
} from './dto/activity-import-output.dto';
import { detectFormat } from './parsers/route-import.parser';

@ApiTags('Activity imports')
@Controller('activity-imports')
@SupabaseUserAuth()
export class ActivityImportController {
  constructor(private readonly activityImportService: ActivityImportService) {}

  @Post('strength/apply')
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file', 'session_id'],
      properties: {
        file: { type: 'string', format: 'binary' },
        session_id: { type: 'string', format: 'uuid' },
      },
    },
  })
  @ApiOkResponse({ type: ImportedStrengthActivitySummaryDto })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: ACTIVITY_IMPORT_MAX_FILE_SIZE_BYTES } }))
  async applyStrengthImport(
    @UserContext() ctx: UserCtx,
    @UploadedFile() file: ActivityImportUploadedFile,
    @Body() body: ApplyStrengthActivityImportDto,
  ): Promise<ImportedStrengthActivitySummaryDto> {
    return this.activityImportService.applyStrengthFile({ ctx, file, sessionId: body.session_id });
  }

  @Post('route/parse')
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: { type: 'string', format: 'binary' },
        estimated_max_heart_rate: { type: 'string' },
      },
    },
  })
  @ApiOkResponse({ type: ParsedRouteImportDto })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: ACTIVITY_IMPORT_MAX_FILE_SIZE_BYTES } }))
  async parseRouteImport(
    @UserContext() ctx: UserCtx,
    @UploadedFile() file: ActivityImportUploadedFile,
    @Body() body: ParseRouteActivityImportDto,
  ): Promise<ParsedRouteImportDto> {
    return this.activityImportService.parseRouteFileForUser({
      ctx,
      file,
      estimatedMaxHeartRate: this.parseNullableNumber(body.estimated_max_heart_rate),
    });
  }

  @Post('route/apply')
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file', 'session_id', 'persist_details'],
      properties: {
        file: { type: 'string', format: 'binary' },
        session_id: { type: 'string', format: 'uuid' },
        persist_details: { type: 'string', enum: ['true', 'false'] },
        estimated_max_heart_rate: { type: 'string' },
      },
    },
  })
  @ApiOkResponse({ type: ApplyRouteActivityImportResponseDto })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: ACTIVITY_IMPORT_MAX_FILE_SIZE_BYTES } }))
  async applyRouteImport(
    @UserContext() ctx: UserCtx,
    @UploadedFile() file: ActivityImportUploadedFile,
    @Body() body: ApplyRouteActivityImportDto,
  ): Promise<ApplyRouteActivityImportResponseDto> {
    const parsed = await this.activityImportService.applyRouteFile({
      ctx,
      file,
      sessionId: body.session_id,
      persistDetails: body.persist_details === 'true',
      estimatedMaxHeartRate: this.parseNullableNumber(body.estimated_max_heart_rate),
    });

    return { format: detectFormat(file.originalname) ?? 'fit', parsed };
  }

  private parseNullableNumber(value: string | undefined): number | null {
    if (!value) return null;
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
}
