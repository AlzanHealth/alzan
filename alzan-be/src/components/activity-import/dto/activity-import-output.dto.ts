import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose } from 'class-transformer';
import {
  ImportedStrengthActivityDevice,
  ImportedStrengthActivityHeartRateSample,
  ImportedStrengthActivityHeartRateZone,
  StrengthActivityProvider,
  StrengthActivitySourceFileType,
} from '../parsers/strength-activity-import.parser';
import {
  ParsedRouteImport,
  RouteImportDetails,
  RouteImportSummary,
  SupportedRouteFormat,
} from '../parsers/route-import.parser';

export type ActivityImportErrorCode =
  | 'ACTIVITY_IMPORT_FILE_REQUIRED'
  | 'ACTIVITY_IMPORT_FILE_TOO_LARGE'
  | 'ACTIVITY_IMPORT_UNSUPPORTED_FORMAT'
  | 'STRENGTH_ACTIVITY_PARSE_ERROR'
  | 'STRENGTH_ACTIVITY_UNSUPPORTED_ERROR'
  | 'ROUTE_PARSE_ERROR';

export class ImportedStrengthActivitySummaryDto {
  @Expose()
  @ApiProperty()
  provider!: StrengthActivityProvider;

  @Expose()
  @ApiProperty()
  sourceFileType!: StrengthActivitySourceFileType;

  @Expose()
  @ApiPropertyOptional({ nullable: true })
  startedAt!: string | null;

  @Expose()
  @ApiPropertyOptional({ nullable: true })
  endedAt!: string | null;

  @Expose()
  @ApiPropertyOptional({ nullable: true })
  durationSeconds!: number | null;

  @Expose()
  @ApiPropertyOptional({ nullable: true })
  caloriesKcal!: number | null;

  @Expose()
  @ApiPropertyOptional({ nullable: true })
  avgHeartRate!: number | null;

  @Expose()
  @ApiPropertyOptional({ nullable: true })
  maxHeartRate!: number | null;

  @Expose()
  @ApiPropertyOptional({ nullable: true })
  minHeartRate!: number | null;

  @Expose()
  @ApiPropertyOptional({ nullable: true })
  totalSteps!: number | null;

  @Expose()
  @ApiPropertyOptional({ nullable: true })
  recoveryTimeSeconds!: number | null;

  @Expose()
  @ApiPropertyOptional({ nullable: true })
  epoc!: number | null;

  @Expose()
  @ApiPropertyOptional({ nullable: true })
  pte!: number | null;

  @Expose()
  @ApiPropertyOptional({ nullable: true })
  tss!: number | null;

  @Expose()
  @ApiPropertyOptional({ nullable: true })
  trainingLoadPeak!: number | null;

  @Expose()
  @ApiPropertyOptional({ nullable: true })
  device!: ImportedStrengthActivityDevice | null;

  @Expose()
  @ApiProperty()
  heartRateZones!: ImportedStrengthActivityHeartRateZone[];

  @Expose()
  @ApiProperty()
  heartRateStream!: ImportedStrengthActivityHeartRateSample[];
}

export class ParsedRouteImportDto {
  @Expose()
  @ApiProperty()
  polyline!: string;

  @Expose()
  @ApiProperty()
  summary!: RouteImportSummary;

  @Expose()
  @ApiProperty()
  details!: RouteImportDetails;
}

export class ApplyRouteActivityImportResponseDto {
  @Expose()
  @ApiProperty()
  format!: SupportedRouteFormat;

  @Expose()
  @ApiProperty()
  parsed!: ParsedRouteImport;
}
