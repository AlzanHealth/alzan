import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';

export class TemplateAssociationInputDto {
  @ApiPropertyOptional({ name: 'endurance_template_id', format: 'uuid', nullable: true })
  @IsOptional()
  @IsUUID()
  endurance_template_id?: string | null;

  @ApiPropertyOptional({ name: 'workout_template_id', format: 'uuid', nullable: true })
  @IsOptional()
  @IsUUID()
  workout_template_id?: string | null;
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
  @ApiProperty({ name: 'session_id', format: 'uuid', description: 'Surviving/updated session id after the action.' })
  session_id!: string;
}
