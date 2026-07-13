export class CloudProviderSyncOutputDto {
  provider!: string;
  job_id?: string;
  status?: string;
  activities_imported!: number;
  activities_skipped?: number;
  activities_updated?: number;
  activities_repaired?: number;
  activities_failed?: number;
  activities_reconciled?: number;
  errors_by_code?: Record<string, number>;
  phase_durations_ms?: Record<string, number>;
  last_success_at!: string | null;
}
