import { Expose } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CloudProviderSyncOutputDto {
  @Expose()
  provider!: string;

  @Expose()
  job_id?: string;

  @Expose()
  status?: string;

  @ApiPropertyOptional()
  @Expose()
  cancelled?: boolean;

  @Expose()
  retry_after_at?: string | null;

  @Expose()
  activities_imported!: number;

  @Expose()
  activities_skipped?: number;

  @Expose()
  activities_updated?: number;

  @Expose()
  activities_repaired?: number;

  @Expose()
  activities_failed?: number;

  @Expose()
  activities_reconciled?: number;

  @Expose()
  errors_by_code?: Record<string, number>;

  @Expose()
  phase_durations_ms?: Record<string, number>;

  @Expose()
  last_success_at!: string | null;

  @Expose()
  health_days_imported?: number;

  @Expose()
  health_consent_required?: boolean;

  @Expose()
  backfill_complete?: boolean;

  @Expose()
  backfill_next_date?: string | null;

  @Expose()
  fit_pending?: number;

  @Expose()
  health_sync_status?: string;

  @Expose()
  health_sync_error?: string;

  @Expose()
  health_samples_imported?: number;

  @Expose()
  health_sleeps_imported?: number;

  @Expose()
  health_recoveries_imported?: number;

  @Expose()
  health_last_synced_at?: string | null;
}

export class ActiveCloudSyncDto {
  @ApiProperty()
  @Expose()
  id!: string;

  @ApiProperty()
  @Expose()
  provider!: string;

  @ApiProperty()
  @Expose()
  sync_domain!: string;

  @ApiProperty()
  @Expose()
  started_at!: string;

  @ApiProperty()
  @Expose()
  updated_at!: string;

  @ApiProperty()
  @Expose()
  cancellation_requested!: boolean;
}

export class ActiveCloudSyncsOutputDto {
  @ApiProperty({ type: [ActiveCloudSyncDto] })
  @Expose()
  jobs!: ActiveCloudSyncDto[];
}

export class CancelCloudSyncsOutputDto {
  @ApiProperty()
  @Expose()
  requested_count!: number;
}
