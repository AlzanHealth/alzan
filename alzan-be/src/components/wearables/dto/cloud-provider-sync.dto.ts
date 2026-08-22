import { Expose } from 'class-transformer';

export class CloudProviderSyncOutputDto {
  @Expose()
  provider!: string;

  @Expose()
  job_id?: string;

  @Expose()
  status?: string;

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
}
