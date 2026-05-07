import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBooleanString, IsOptional, IsString, IsUUID } from 'class-validator';

export class ApplyStrengthActivityImportDto {
  @ApiProperty({ name: 'session_id' })
  @IsUUID()
  session_id!: string;
}

export class ParseRouteActivityImportDto {
  @ApiPropertyOptional({ name: 'estimated_max_heart_rate' })
  @IsOptional()
  @IsString()
  estimated_max_heart_rate?: string;
}

export class ApplyRouteActivityImportDto {
  @ApiProperty({ name: 'session_id' })
  @IsUUID()
  session_id!: string;

  @ApiProperty({ name: 'persist_details', enum: ['true', 'false'] })
  @IsBooleanString()
  persist_details!: string;

  @ApiPropertyOptional({ name: 'estimated_max_heart_rate' })
  @IsOptional()
  @IsString()
  estimated_max_heart_rate?: string;
}
