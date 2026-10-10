import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { Insert } from '../../../types/requests.types';
import {
  mapSuuntoDailyActivityToCanonical,
  mapSuuntoRecoveryToCanonical,
  mapSuuntoSleepToCanonical,
} from '../../activity-import/parsers/suunto-health-canonical.mapper';
import { CanonicalProvenance } from '../domain/wearable.types';
import { CanonicalHealthWriterService } from './canonical-health-writer.service';
import { IntegrationSyncStateService } from './integration-sync-state.service';
import { SuuntoCloudSyncService } from './suunto-cloud-sync.service';
import { WearableImportLifecycleService, WearableSyncJobClaim } from './wearable-import-lifecycle.service';
import { WEARABLE_SYNC_CANCEL_REQUESTED } from './wearable-import-lifecycle.service';

type JsonRecord = Record<string, unknown>;
type SyncOutcome = {
  status: 'success' | 'partial' | 'unavailable' | 'running';
  cancelled?: boolean;
  healthSamplesImported: number;
  healthDaysImported: number;
  sleepsImported: number;
  recoveriesImported: number;
  errorCode?: string;
  lastSyncedAt: string | null;
  retryAfterAt?: string | null;
};

const MS_PER_DAY = 86_400_000;
const HEALTH_LOOKBACK_DAYS = 56;
const MAX_API_WINDOW_DAYS = 28;

@Injectable()
export class SuuntoHealthSyncService {
  private readonly logger = new Logger(SuuntoHealthSyncService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly suunto: SuuntoCloudSyncService,
    private readonly writer: CanonicalHealthWriterService,
    private readonly states: IntegrationSyncStateService,
    private readonly lifecycle: WearableImportLifecycleService,
  ) {}

  public async sync(userId: string): Promise<SyncOutcome> {
    const enabled = this.config.get<string>('SUUNTO_247_ENABLED') === 'true';
    const subscriptionKey =
      this.config.get<string>('SUUNTO_247_SUBSCRIPTION_KEY') ?? this.config.get<string>('SUUNTO_SUBSCRIPTION_KEY');
    if (!enabled || !subscriptionKey) {
      const errorCode = 'SUUNTO_247_API_NOT_CONFIGURED';
      await this.states
        .markFailed(
          {
            userId,
            provider: 'suunto',
            sourceChannel: 'cloud',
            sourcePackage: null,
            syncDomain: 'health_metrics',
          },
          errorCode,
        )
        .catch(() => undefined);
      return this.outcome('unavailable', errorCode);
    }

    let job: Awaited<ReturnType<WearableImportLifecycleService['claimSyncJob']>> | null = null;
    let stopLeaseHeartbeat: (() => void) | null = null;
    try {
      job = await this.lifecycle.claimSyncJob({
        userId,
        provider: 'suunto',
        syncDomain: 'health_metrics',
        leaseSeconds: 1800,
      });
      if (job.action === 'active') return this.outcome('running', undefined, job.retryAfterAt);
      stopLeaseHeartbeat = this.startLeaseHeartbeat(job.jobId, job.leaseToken);
      if (await this.lifecycle.isSyncCancellationRequested(job.jobId)) return this.finishCancelled(job, 0, 0, 0, 0);
      const accessToken = await this.suunto.getHealthAccessToken(userId, job.jobId);
      const now = Date.now();
      const previousCursor = await this.states.getCursor({
        userId,
        provider: 'suunto',
        sourceChannel: 'cloud',
        sourcePackage: null,
        syncDomain: 'health_metrics',
      });
      const cursorTime = previousCursor ? Date.parse(previousCursor) : Number.NaN;
      const from = Number.isFinite(cursorTime)
        ? Math.max(now - HEALTH_LOOKBACK_DAYS * MS_PER_DAY, cursorTime - 3 * MS_PER_DAY)
        : now - HEALTH_LOOKBACK_DAYS * MS_PER_DAY;
      const samples = await this.fetchWindowedSamples(accessToken, subscriptionKey, from, now, job.jobId);
      if (await this.lifecycle.isSyncCancellationRequested(job.jobId)) return this.finishCancelled(job, 0, 0, 0, 0);
      const activity = this.records(samples.activity);
      const sleepRecords = this.records(samples.sleep);
      const recoveryRecords = this.records(samples.recovery);
      const fromIso = new Date(from).toISOString();
      const toIso = new Date(now + 1).toISOString();

      // Keep the existing activities domain and importer independent. This phase only writes wellness data.
      const rows = this.buildMetricRows(userId, activity, recoveryRecords);
      const healthSamplesImported = await this.writer.replaceHealthMetricSamples({
        userId,
        provider: 'suunto',
        sourceChannel: 'cloud',
        from: fromIso,
        to: toIso,
        rows,
      });
      if (await this.lifecycle.isSyncCancellationRequested(job.jobId)) {
        return this.finishCancelled(job, healthSamplesImported, 0, 0, 0);
      }

      const provenance: CanonicalProvenance = {
        provider: 'suunto',
        sourceChannel: 'cloud',
        sourcePackage: null,
        sourceProviderKey: null,
        sourceRecordId: null,
        sourceUpdatedAt: null,
        rawPayloadId: null,
      };
      const dailyByDate = new Map<
        string,
        { latest: unknown; steps: number; energyKcal: number; hasSteps: boolean; hasEnergy: boolean }
      >();
      let healthDaysImported = 0;
      let sleepsImported = 0;
      let recoveriesImported = 0;
      for (const record of activity) {
        const mapped = mapSuuntoDailyActivityToCanonical(record);
        const current = dailyByDate.get(mapped.date) ?? {
          latest: record,
          steps: 0,
          energyKcal: 0,
          hasSteps: false,
          hasEnergy: false,
        };
        const data = this.entryData(record);
        const steps = this.number(data.StepCount) ?? this.number(data.Steps) ?? this.number(data.steps);
        const joules = this.number(data.EnergyConsumption);
        const calories = joules != null ? joules / 4184 : (this.number(data.Calories) ?? this.number(data.calories));
        if (steps != null && steps >= 0) {
          current.steps += steps;
          current.hasSteps = true;
        }
        if (calories != null && calories >= 0) {
          current.energyKcal += calories;
          current.hasEnergy = true;
        }
        if (Date.parse(this.timestamp(record)) >= Date.parse(this.timestamp(current.latest))) current.latest = record;
        dailyByDate.set(mapped.date, current);
      }
      for (const [date, daily] of dailyByDate) {
        if (await this.lifecycle.isSyncCancellationRequested(job.jobId)) {
          return this.finishCancelled(
            job,
            healthSamplesImported,
            healthDaysImported,
            sleepsImported,
            recoveriesImported,
          );
        }
        const mapped = mapSuuntoDailyActivityToCanonical(daily.latest);
        await this.writer.upsertDailyActivity({
          userId,
          dailyActivity: {
            ...mapped,
            totalSteps: daily.hasSteps ? Math.round(daily.steps) : mapped.totalSteps,
            caloriesKcal: daily.hasEnergy ? daily.energyKcal : mapped.caloriesKcal,
          },
          provenance: { ...provenance, sourceRecordId: `daily:${date}` },
        });
        healthDaysImported += 1;
      }
      for (const record of sleepRecords) {
        if (await this.lifecycle.isSyncCancellationRequested(job.jobId)) {
          return this.finishCancelled(
            job,
            healthSamplesImported,
            healthDaysImported,
            sleepsImported,
            recoveriesImported,
          );
        }
        const sleep = mapSuuntoSleepToCanonical(record);
        const entryData = this.entryData(record);
        sleep.healthSamples = [
          this.optionalSample('heart_rate_sleep_average', sleep.avgHeartRateBpm, 'bpm', sleep.startTime, entryData),
          this.optionalSample('heart_rate_sleep_minimum', sleep.minHeartRateBpm, 'bpm', sleep.startTime, entryData),
          this.optionalSample('hrv_rmssd', sleep.avgHrvMs, 'ms', sleep.startTime, entryData),
          this.optionalSample('spo2_max', sleep.maxSpo2Pct ?? null, '%', sleep.startTime, entryData),
        ].filter((sample): sample is NonNullable<typeof sample> => sample !== null);
        await this.writer.upsertSleep({
          userId,
          sleep,
          provenance: { ...provenance, sourceRecordId: sleep.sourceSleepId },
        });
        sleepsImported += 1;
      }
      for (const record of recoveryRecords) {
        if (await this.lifecycle.isSyncCancellationRequested(job.jobId)) {
          return this.finishCancelled(
            job,
            healthSamplesImported,
            healthDaysImported,
            sleepsImported,
            recoveriesImported,
          );
        }
        const recovery = mapSuuntoRecoveryToCanonical(record);
        recovery.healthSamples = [];
        await this.writer.upsertRecovery({
          userId,
          recovery: { ...recovery, sourceRecordId: `recovery:${recovery.date}` },
          provenance: { ...provenance, sourceRecordId: `recovery:${recovery.date}` },
        });
        recoveriesImported += 1;
      }

      if (await this.lifecycle.isSyncCancellationRequested(job.jobId)) {
        return this.finishCancelled(job, healthSamplesImported, healthDaysImported, sleepsImported, recoveriesImported);
      }

      const lastSyncedAt = new Date().toISOString();
      await this.states.saveState({
        userId,
        provider: 'suunto',
        sourceChannel: 'cloud',
        sourcePackage: null,
        syncDomain: 'health_metrics',
        cursorToken: lastSyncedAt,
        lastRecordAt: lastSyncedAt,
        status: 'success',
        metadata: {
          windowDays: Math.ceil((now - from) / MS_PER_DAY),
          samples: activity.length,
          sleeps: sleepRecords.length,
          recoveries: recoveryRecords.length,
        },
      });
      await this.lifecycle.finishSyncJob({
        jobId: job.jobId,
        leaseToken: job.leaseToken,
        status: 'success',
        counters: { healthSamplesImported, healthDaysImported, sleepsImported, recoveriesImported },
        lastError: null,
      });
      return {
        status: 'success',
        healthSamplesImported,
        healthDaysImported,
        sleepsImported,
        recoveriesImported,
        lastSyncedAt,
      };
    } catch (error: unknown) {
      const errorCode = this.errorCode(error);
      if (
        job?.action === 'acquired' &&
        (await this.lifecycle.isSyncCancellationRequested(job.jobId).catch(() => false))
      ) {
        return this.finishCancelled(job, 0, 0, 0, 0);
      }
      await this.states
        .markFailed(
          {
            userId,
            provider: 'suunto',
            sourceChannel: 'cloud',
            sourcePackage: null,
            syncDomain: 'health_metrics',
          },
          errorCode,
        )
        .catch(() => undefined);
      if (job && job.action === 'acquired') {
        await this.lifecycle
          .finishSyncJob({
            jobId: job.jobId,
            leaseToken: job.leaseToken,
            status: 'error',
            counters: {},
            lastError: errorCode,
          })
          .catch(() => undefined);
      }
      return this.outcome('partial', errorCode);
    } finally {
      stopLeaseHeartbeat?.();
      if (job?.action === 'acquired') this.lifecycle.releaseSyncJob?.(job.jobId);
    }
  }

  private startLeaseHeartbeat(jobId: string, leaseToken: string): () => void {
    const timer = setInterval(() => {
      void this.lifecycle.renewSyncJob(jobId, leaseToken).catch(error => {
        this.logger.error('Failed to renew Suunto health sync job lease', error as Error);
      });
    }, 60_000);
    timer.unref();
    return () => clearInterval(timer);
  }

  private async fetchWindowedSamples(
    token: string,
    key: string,
    from: number,
    to: number,
    jobId: string,
  ): Promise<{ activity: unknown[]; sleep: unknown[]; recovery: unknown[] }> {
    const result = { activity: [] as unknown[], sleep: [] as unknown[], recovery: [] as unknown[] };
    const headers = { Authorization: `Bearer ${token}`, 'Ocp-Apim-Subscription-Key': key };
    for (let start = from; start < to; start += MAX_API_WINDOW_DAYS * MS_PER_DAY) {
      if (await this.lifecycle.isSyncCancellationRequested(jobId)) break;
      const end = Math.min(start + MAX_API_WINDOW_DAYS * MS_PER_DAY, to);
      const params = { from: start, to: end };
      const signal = this.lifecycle.getSyncJobSignal?.(jobId);
      const [activity, sleep, recovery] = await Promise.all([
        axios.get<unknown>('https://cloudapi.suunto.com/247samples/activity', {
          headers,
          params,
          timeout: 30_000,
          signal,
        }),
        axios.get<unknown>('https://cloudapi.suunto.com/247samples/sleep', {
          headers,
          params,
          timeout: 30_000,
          signal,
        }),
        axios.get<unknown>('https://cloudapi.suunto.com/247samples/recovery', {
          headers,
          params,
          timeout: 30_000,
          signal,
        }),
      ]);
      result.activity.push(...this.records(activity.data));
      result.sleep.push(...this.records(sleep.data));
      result.recovery.push(...this.records(recovery.data));
      if (await this.lifecycle.isSyncCancellationRequested(jobId)) break;
    }
    return result;
  }

  private buildMetricRows(
    userId: string,
    activity: unknown[],
    recoveries: unknown[],
  ): Insert<'health_metric_samples'>[] {
    const rows: Insert<'health_metric_samples'>[] = [];
    for (const record of activity) {
      const data = this.entryData(record);
      const mapped = mapSuuntoDailyActivityToCanonical(record);
      const timestamp = this.timestamp(record);
      const values: Array<[string, unknown, string]> = [
        ['heart_rate', data.HR, 'bpm'],
        ['hrv_rmssd', data.HRV, 'ms'],
        ['spo2', data.SpO2, 'fraction'],
      ];
      for (const [metricType, raw, unit] of values) {
        if (typeof raw !== 'number' || !Number.isFinite(raw) || !this.isValidMetric(metricType, raw)) continue;
        rows.push(
          this.metricRow(
            userId,
            `${metricType}:${timestamp}`,
            metricType,
            timestamp,
            mapped.date,
            mapped.timezone,
            raw,
            unit,
            record,
          ),
        );
      }
    }
    for (const record of recoveries) {
      const data = this.entryData(record);
      const timestamp = this.timestamp(record);
      const mapped = mapSuuntoRecoveryToCanonical(record);
      for (const [metricType, raw, unit] of [
        ['recovery_balance', data.Balance, 'fraction'],
        ['stress_state', data.StressState, 'enum'],
      ] as const) {
        if (typeof raw !== 'number' || !Number.isFinite(raw) || !this.isValidMetric(metricType, raw)) continue;
        rows.push(
          this.metricRow(
            userId,
            `${metricType}:${timestamp}`,
            metricType,
            timestamp,
            mapped.date,
            mapped.timezone,
            raw,
            unit,
            record,
          ),
        );
      }
    }
    return rows;
  }

  private metricRow(
    userId: string,
    sourceRecordId: string,
    metricType: string,
    recordedAt: string,
    localDate: string,
    timezone: string,
    value: number,
    unit: string,
    raw: unknown,
  ): Insert<'health_metric_samples'> {
    return {
      user_id: userId,
      provider: 'suunto',
      source_channel: 'cloud',
      source_package: null,
      source_record_id: sourceRecordId,
      metric_type: metricType,
      recorded_at: recordedAt,
      local_date: localDate,
      timezone,
      value: unit === 'fraction' && metricType === 'spo2' ? (value <= 1 ? value * 100 : value) : value,
      unit: unit === 'fraction' && metricType === 'spo2' ? '%' : unit,
      sleep_session_id: null,
      activity_session_id: null,
      raw_payload_id: null,
      raw_payload: this.toJson(raw),
    };
  }

  private optionalSample(
    metricType: string,
    value: number | null,
    unit: string,
    recordedAt: string,
    payload: JsonRecord,
  ) {
    if (value == null || !Number.isFinite(value)) return null;
    return { metricType, value, unit, recordedAt, rawPayload: payload };
  }

  private records(value: unknown): unknown[] {
    if (Array.isArray(value)) return value;
    if (value && typeof value === 'object') {
      const record = value as JsonRecord;
      for (const key of ['samples', 'data', 'items', 'results'])
        if (Array.isArray(record[key])) return record[key] as unknown[];
    }
    return [];
  }

  private entryData(value: unknown): JsonRecord {
    if (!value || typeof value !== 'object') return {};
    const record = value as JsonRecord;
    return record.entryData && typeof record.entryData === 'object' ? (record.entryData as JsonRecord) : record;
  }

  private timestamp(value: unknown): string {
    const record = value && typeof value === 'object' ? (value as JsonRecord) : {};
    const timestamp = typeof record.timestamp === 'string' ? record.timestamp : '';
    const parsed = Date.parse(timestamp);
    return Number.isFinite(parsed) ? new Date(parsed).toISOString() : new Date(0).toISOString();
  }

  private number(value: unknown): number | null {
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
  }

  private isValidMetric(metricType: string, value: number): boolean {
    switch (metricType) {
      case 'heart_rate':
        return value > 0 && value <= 300;
      case 'hrv_rmssd':
        return value > 0 && value <= 2000;
      case 'spo2':
        return value > 0 && (value <= 1 || (value >= 70 && value <= 100));
      case 'recovery_balance':
        return value >= 0 && value <= 1;
      case 'stress_state':
        return Number.isInteger(value) && value >= 0 && value <= 4;
      default:
        return false;
    }
  }

  private toJson(value: unknown): Insert<'health_metric_samples'>['raw_payload'] {
    return JSON.parse(JSON.stringify(value ?? null)) as Insert<'health_metric_samples'>['raw_payload'];
  }

  private errorCode(error: unknown): string {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status;
      if (status === 401 || status === 403) return 'SUUNTO_247_ACCESS_DENIED';
      if (status === 429) return 'SUUNTO_247_RATE_LIMITED';
    }
    return error instanceof Error && /^[A-Z0-9_]+$/.test(error.message) ? error.message : 'SUUNTO_247_SYNC_FAILED';
  }

  private outcome(status: SyncOutcome['status'], errorCode?: string, retryAfterAt?: string | null): SyncOutcome {
    return {
      status,
      healthSamplesImported: 0,
      healthDaysImported: 0,
      sleepsImported: 0,
      recoveriesImported: 0,
      errorCode,
      lastSyncedAt: null,
      retryAfterAt,
    };
  }

  private async finishCancelled(
    job: Pick<WearableSyncJobClaim, 'jobId' | 'leaseToken'>,
    healthSamplesImported: number,
    healthDaysImported: number,
    sleepsImported: number,
    recoveriesImported: number,
  ): Promise<SyncOutcome> {
    await this.lifecycle.finishSyncJob({
      jobId: job.jobId,
      leaseToken: job.leaseToken,
      status: 'partial',
      counters: { healthSamplesImported, healthDaysImported, sleepsImported, recoveriesImported },
      lastError: WEARABLE_SYNC_CANCEL_REQUESTED,
    });
    return {
      status: 'partial',
      cancelled: true,
      healthSamplesImported,
      healthDaysImported,
      sleepsImported,
      recoveriesImported,
      errorCode: WEARABLE_SYNC_CANCEL_REQUESTED,
      lastSyncedAt: null,
    };
  }
}
