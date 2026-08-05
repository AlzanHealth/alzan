import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose } from 'class-transformer';
import { IsOptional, IsUUID } from 'class-validator';

export class TemplateAssociationInputDto {
  @ApiPropertyOptional({ name: 'endurance_template_id', format: 'uuid', nullable: true })
  @IsOptional()
  @IsUUID('loose')
  endurance_template_id?: string | null;

  @ApiPropertyOptional({ name: 'workout_template_id', format: 'uuid', nullable: true })
  @IsOptional()
  @IsUUID('loose')
  workout_template_id?: string | null;

  @ApiPropertyOptional({ name: 'workout_plan_id', format: 'uuid' })
  @IsOptional()
  @IsUUID('loose')
  workout_plan_id?: string;

  @ApiPropertyOptional({ name: 'target_session_id', format: 'uuid' })
  @IsOptional()
  @IsUUID()
  target_session_id?: string;
}

export class ImportReviewTargetInputDto {
  @ApiPropertyOptional({ name: 'target_session_id', format: 'uuid' })
  @IsOptional()
  @IsUUID()
  target_session_id?: string;
}

export class DuplicateMergeInputDto {
  @ApiPropertyOptional({ name: 'target_session_id', format: 'uuid' })
  @IsOptional()
  @IsUUID()
  target_session_id?: string;
}

export class StrengthAssignmentInputDto {
  @ApiPropertyOptional({ name: 'target_session_id', format: 'uuid' })
  @IsOptional()
  @IsUUID()
  target_session_id?: string;
}

export class ImportReviewSessionOutputDto {
  @Expose()
  @ApiProperty({ name: 'session_id', format: 'uuid', description: 'Surviving/updated session id after the action.' })
  session_id!: string;
}
