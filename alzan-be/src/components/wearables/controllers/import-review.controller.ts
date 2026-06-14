import { Body, Controller, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { UserContext, UserCtx } from '../../../common/decorators/user-context.decorator';
import { SupabaseUserAuth } from '../../../core/guards/auth.decorator';
import {
  DuplicateMergeInputDto,
  ImportReviewSessionOutputDto,
  StrengthAssignmentInputDto,
  TemplateAssociationInputDto,
} from '../dto/import-review.dto';
import { ImportReviewService } from '../services/import-review.service';

@ApiTags('Activity import review')
@Controller('activity-sessions')
@SupabaseUserAuth()
export class ImportReviewController {
  constructor(private readonly importReviewService: ImportReviewService) {}

  @Post(':id/template-association')
  @ApiOkResponse({ type: ImportReviewSessionOutputDto })
  public async associateTemplate(
    @UserContext() ctx: UserCtx,
    @Param('id', ParseUUIDPipe) sessionId: string,
    @Body() body: TemplateAssociationInputDto,
  ): Promise<ImportReviewSessionOutputDto> {
    const id = await this.importReviewService.associateTemplate(ctx.user.id, sessionId, {
      enduranceTemplateId: body.endurance_template_id ?? null,
      workoutTemplateId: body.workout_template_id ?? null,
    });
    return { session_id: id };
  }

  @Post(':id/template-suggestion/dismiss')
  @ApiOkResponse({ type: ImportReviewSessionOutputDto })
  public async dismissSuggestion(
    @UserContext() ctx: UserCtx,
    @Param('id', ParseUUIDPipe) sessionId: string,
  ): Promise<ImportReviewSessionOutputDto> {
    return { session_id: await this.importReviewService.dismissSuggestion(ctx.user.id, sessionId) };
  }

  @Post(':id/duplicate/merge')
  @ApiOkResponse({ type: ImportReviewSessionOutputDto })
  public async mergeDuplicate(
    @UserContext() ctx: UserCtx,
    @Param('id', ParseUUIDPipe) sessionId: string,
    @Body() body: DuplicateMergeInputDto,
  ): Promise<ImportReviewSessionOutputDto> {
    return {
      session_id: await this.importReviewService.mergeDuplicate(ctx.user.id, sessionId, body.target_session_id),
    };
  }

  @Post(':id/duplicate/keep-both')
  @ApiOkResponse({ type: ImportReviewSessionOutputDto })
  public async keepBothDuplicates(
    @UserContext() ctx: UserCtx,
    @Param('id', ParseUUIDPipe) sessionId: string,
  ): Promise<ImportReviewSessionOutputDto> {
    return { session_id: await this.importReviewService.keepBothDuplicates(ctx.user.id, sessionId) };
  }

  @Post(':id/watch-metrics/revert')
  @ApiOkResponse({ type: ImportReviewSessionOutputDto })
  public async revertWatchMetrics(
    @UserContext() ctx: UserCtx,
    @Param('id', ParseUUIDPipe) sessionId: string,
  ): Promise<ImportReviewSessionOutputDto> {
    return { session_id: await this.importReviewService.revertWatchMetrics(ctx.user.id, sessionId) };
  }

  @Post(':id/watch-metrics/keep')
  @ApiOkResponse({ type: ImportReviewSessionOutputDto })
  public async keepWatchMetrics(
    @UserContext() ctx: UserCtx,
    @Param('id', ParseUUIDPipe) sessionId: string,
  ): Promise<ImportReviewSessionOutputDto> {
    return { session_id: await this.importReviewService.keepWatchMetrics(ctx.user.id, sessionId) };
  }

  @Post(':id/strength-assignment')
  @ApiOkResponse({ type: ImportReviewSessionOutputDto })
  public async assignStrengthSession(
    @UserContext() ctx: UserCtx,
    @Param('id', ParseUUIDPipe) sessionId: string,
    @Body() body: StrengthAssignmentInputDto,
  ): Promise<ImportReviewSessionOutputDto> {
    return {
      session_id: await this.importReviewService.assignStrengthSession(ctx.user.id, sessionId, body.target_session_id),
    };
  }
}
