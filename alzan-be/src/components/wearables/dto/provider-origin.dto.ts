import { Type } from 'class-transformer';
import { IsIn, IsObject, IsOptional, IsString, IsUUID, ValidateNested } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SourceChannel, WearableProvider } from '../domain/wearable.types';

const WEARABLE_PROVIDERS: WearableProvider[] = [
  'strava',
  'garmin',
  'polar',
  'suunto',
  'whoop',
  'oura',
  'fitbit',
  'ultrahuman',
  'apple_health',
  'health_connect',
  'manual',
  'coros',
];

const SOURCE_CHANNELS: SourceChannel[] = ['cloud', 'apple_health', 'health_connect', 'file_import', 'manual'];

export class ProviderOriginDto {
  @ApiProperty({ enum: SOURCE_CHANNELS })
  @IsIn(SOURCE_CHANNELS)
  source_channel!: SourceChannel;

  @ApiProperty({ enum: WEARABLE_PROVIDERS })
  @IsIn(WEARABLE_PROVIDERS)
  provider!: WearableProvider;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  source_package?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  source_provider_key?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  display_name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  platform?: string;

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  @IsObject()
  raw_payload?: Record<string, unknown>;
}

export class UpsertProviderOriginsDto {
  @ApiProperty({ type: [ProviderOriginDto] })
  @ValidateNested({ each: true })
  @Type(() => ProviderOriginDto)
  origins!: ProviderOriginDto[];
}

export class SelectHealthConnectOriginDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  origin_id!: string;
}

export class ProviderOriginOutputDto {
  id!: string;
  source_channel!: string;
  provider!: WearableProvider;
  source_package!: string | null;
  source_provider_key!: string | null;
  display_name!: string | null;
  platform!: string | null;
  last_seen_at!: string;
}
