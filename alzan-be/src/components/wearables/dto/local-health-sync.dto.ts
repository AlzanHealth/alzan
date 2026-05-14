import { Type } from 'class-transformer';
import { IsArray, IsDateString, IsIn, IsNumber, IsObject, IsOptional, IsString, ValidateNested } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { LocalSyncObjectType, SourceChannel, SyncDomain } from '../domain/wearable.types';
import { ProviderOriginDto } from './provider-origin.dto';

const LOCAL_SOURCE_CHANNELS: SourceChannel[] = ['apple_health', 'health_connect'];
const LOCAL_SYNC_OBJECT_TYPES: LocalSyncObjectType[] = [
  'activity',
  'daily_activity',
  'sleep',
  'recovery',
  'health_sample',
  'vo2_max',
  'weight',
];
const SYNC_DOMAINS: SyncDomain[] = ['activities', 'daily_activity', 'sleep', 'recovery', 'health_metrics', 'body'];

export class LocalHealthSyncRecordDto {
  @ApiProperty({ enum: LOCAL_SYNC_OBJECT_TYPES })
  @IsIn(LOCAL_SYNC_OBJECT_TYPES)
  object_type!: LocalSyncObjectType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  source_record_id?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  source_updated_at?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  source_package?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  metric_type?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  value?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  unit?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  recorded_at?: string;

  @ApiProperty({ type: Object })
  @IsObject()
  payload!: Record<string, unknown>;
}

export class LocalHealthSyncStateDto {
  @ApiProperty({ enum: SYNC_DOMAINS })
  @IsIn(SYNC_DOMAINS)
  sync_domain!: SyncDomain;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  cursor_token?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  anchor_token?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  last_record_at?: string;
}

export class LocalHealthSyncDto {
  @ApiProperty({ enum: LOCAL_SOURCE_CHANNELS })
  @IsIn(LOCAL_SOURCE_CHANNELS)
  source_channel!: 'apple_health' | 'health_connect';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  source_package?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  trace_id?: string;

  @ApiPropertyOptional({ type: [ProviderOriginDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProviderOriginDto)
  origins?: ProviderOriginDto[];

  @ApiProperty({ type: [LocalHealthSyncRecordDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LocalHealthSyncRecordDto)
  records!: LocalHealthSyncRecordDto[];

  @ApiPropertyOptional({ type: [LocalHealthSyncStateDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LocalHealthSyncStateDto)
  sync_states?: LocalHealthSyncStateDto[];
}

export class LocalHealthSyncOutputDto {
  activities_imported!: number;
  daily_activities_imported!: number;
  sleeps_imported!: number;
  recoveries_imported!: number;
  health_samples_imported!: number;
  origins_upserted!: number;
}
