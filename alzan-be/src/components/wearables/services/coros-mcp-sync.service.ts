import {
  BadGatewayException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SupabaseAdminService } from '../../../core/supabase/supabase.service';
import { parseCorosActivityFileToCanonical } from '../../activity-import/parsers/coros-activity-canonical.mapper';
import {
  mapCorosDailyActivityToCanonical,
  mapCorosRecoveryToCanonical,
  mapCorosSleepToCanonical,
} from '../../activity-import/parsers/coros-health-canonical.mapper';
import { CorosMcpOAuthService } from '../../providers/oauth/coros-mcp-oauth.service';
import { CorosMcpClient, CorosMcpTool } from './coros-mcp.client';
import { CorosMcpRpcError } from './coros-mcp.protocol';
import {
  buildCorosMcpDateWindows,
  buildCorosMcpToolArguments,
  extractCorosMcpActivityPage,
  extractCorosMcpFitByteArrays,
  extractCorosMcpFitUrls,
  mergeCorosMcpActivityPayload,
  readActivityId,
  uniqueCorosMcpRecords,
} from './coros-mcp-sync.helpers';
import { mergeCorosMultisportActivities } from './coros-multisport.utils';
import { CanonicalProvenance } from '../domain/wearable.types';
import { CanonicalActivityWriterService } from './canonical-activity-writer.service';
import { CanonicalHealthWriterService } from './canonical-health-writer.service';
import { IntegrationSyncStateService } from './integration-sync-state.service';
import { RawPayloadService } from './raw-payload.service';
import { WearableImportLifecycleService } from './wearable-import-lifecycle.service';

type JsonRecord = Record<string, unknown>;
type McpSyncMetadata = {
  backfillComplete: boolean;
  backfillNextDate: string | null;
  lastActivityAt: string | null;
  fitDownloadDate: string | null;
  fitDownloadsToday: number;
  fitPendingRecordIds: string[];
};

export interface CorosMcpSyncResult {
  provider: 'coros';
  jobId: string;
  status: 'running' | 'success' | 'partial';
  activitiesImported: number;
  activitiesSkipped: number;
  activitiesFailed: number;
  healthDaysImported: number;
  healthConsentRequired: boolean;
  errorsByCode: Record<string, number>;
  lastSuccessAt: string | null;
  backfillComplete: boolean;
  backfillNextDate: string | null;
  fitPending: number;
}

const CANONICAL_ACTIVITY_VERSION = 9;
const BACKFILL_START_DATE = '2000-01-01';
const NORMAL_SYNC_OVERLAP_DAYS = 3;
const DEFAULT_WINDOW_DAYS = 30;
const DEFAULT_WINDOWS_PER_SYNC = 10;
const MAX_PAGES_PER_WINDOW = 100;
const FIT_DAILY_LIMIT = 50;
const MAX_FIT_BYTES = 25 * 1024 * 1024;
const COROS_HEALTH_CONSENT_VERSION = 'health_integrations_v2_2026_08_22';
const SOURCE_CHANNEL = 'cloud' as const;

@Injectable()
export class CorosMcpSyncService {
  private readonly logger = new Logger(CorosMcpSyncService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly supabaseAdminService: SupabaseAdminService,
    private readonly rawPayloadService: RawPayloadService,
    private readonly syncStateService: IntegrationSyncStateService,
    private readonly activityWriterService: CanonicalActivityWriterService,
    private readonly healthWriterService: CanonicalHealthWriterService,
    private readonly importLifecycleService: WearableImportLifecycleService,
    private readonly corosMcpOAuthService: CorosMcpOAuthService,
  ) {}

  public async sync(userId: string): Promise<CorosMcpSyncResult> {
    if (!this.corosMcpOAuthService.isUserAllowed(userId)) {
      throw new ForbiddenException('COROS integration is not enabled for this user');
    }
    const client = await this.corosMcpOAuthService.getMcpClient(userId);
    const tools = await client.listTools();
    const recordsTool = this.findTool(tools, ['querySportRecords'], tool =>
      /sport.*record|activity.*record/i.test(tool.name),
    );
    if (!recordsTool) throw new BadGatewayException('COROS_MCP_QUERY_SPORT_RECORDS_UNAVAILABLE');

    const job = await this.importLifecycleService.claimSyncJob({
      userId,
      provider: 'coros',
      syncDomain: 'activities',
      leaseSeconds: 1800,
    });
    if (job.action === 'active') return this.activeResult(job.jobId);

    const stopHeartbeat = this.startLeaseHeartbeat(job.jobId, job.leaseToken);
    try {
      const previous = await this.readSyncMetadata(userId);
      const plan = this.buildSyncPlan(previous);
      const activityFetch = await this.fetchActivityRecords(client, recordsTool, plan.windows);
      const records = activityFetch.records;
      const pendingFitRecordIds = new Set(previous.fitPendingRecordIds);
      const pendingRecords = previous.fitPendingRecordIds.map(activityId => ({ activityId }));
      const summaries = uniqueCorosMcpRecords([...records, ...pendingRecords]);
      const counters = {
        activitiesImported: 0,
        activitiesSkipped: 0,
        activitiesFailed: 0,
        healthDaysImported: 0,
      };
      const errorsByCode: Record<string, number> = {};
      const pendingFitIds = new Set(previous.fitPendingRecordIds);
      let fitDownloadsToday = this.fitDownloadsToday(previous);
      const fitDownloadDate = this.todayString();
      if (activityFetch.paginationTruncated) {
        this.incrementError(errorsByCode, 'COROS_MCP_ACTIVITY_PAGINATION_TRUNCATED');
      }
      const detailTool = this.findTool(tools, ['getActivityDetail', 'analyzeActivityDetail'], tool =>
        /activity.*detail|detail.*activity/i.test(tool.name),
      );
      const lapsTool = this.findTool(tools, ['queryActivityLapData', 'queryCustomActivityLapData'], tool =>
        /activity.*lap|lap.*data/i.test(tool.name),
      );
      const fitTool = this.findTool(tools, ['downloadActivityFitFiles', 'queryActivityFitFileDownloadUrls'], tool =>
        /fit.*(download|file|url)|download.*fit/i.test(tool.name),
      );

      for (const summary of summaries) {
        const outcome = await this.importActivity({
          userId,
          client,
          summary,
          detailTool,
          lapsTool,
          fitTool,
          jobId: job.jobId,
          fitDownloadsToday,
          fitDownloadDate,
          fitRetry: pendingFitRecordIds.has(readActivityId(summary) ?? ''),
        });
        if (outcome.status === 'imported') counters.activitiesImported += 1;
        if (outcome.status === 'skipped') counters.activitiesSkipped += 1;
        if (outcome.status === 'failed') counters.activitiesFailed += 1;
        if (outcome.fitDownloaded) fitDownloadsToday += outcome.fitDownloaded;
        if (outcome.fitPending) pendingFitIds.add(outcome.activityId);
        else pendingFitIds.delete(outcome.activityId);
        if (outcome.errorCode) this.incrementError(errorsByCode, outcome.errorCode);
      }

      const healthTool = this.findTool(tools, ['queryDailyHealthData', 'queryDailyActivity', 'queryDailyRecords']);
      const healthConsent = await this.hasHealthConsent(userId);
      if (healthConsent && healthTool) {
        try {
          const healthFetch = await this.fetchActivityRecords(client, healthTool, plan.windows);
          if (healthFetch.paginationTruncated) {
            this.incrementError(errorsByCode, 'COROS_MCP_HEALTH_PAGINATION_TRUNCATED');
          }
          for (const record of this.uniqueDailyRecords(healthFetch.records)) {
            await this.importDailyHealth(userId, record);
            counters.healthDaysImported += 1;
          }
        } catch (error) {
          this.incrementError(errorsByCode, this.errorMessage(error));
        }
      }

      const nextMetadata = this.nextMetadata({
        previous,
        plan,
        records,
        pendingFitIds,
        fitDownloadDate,
        fitDownloadsToday,
        paginationTruncated: activityFetch.paginationTruncated,
        paginationRetryFromDate: activityFetch.retryFromDate,
      });
      const status = counters.activitiesFailed > 0 || Object.keys(errorsByCode).length > 0 ? 'partial' : 'success';
      const lastSuccessAt = new Date().toISOString();
      await this.markConnectionResult(userId, lastSuccessAt, status, errorsByCode);
      await this.syncStateService.saveState({
        userId,
        provider: 'coros',
        sourceChannel: SOURCE_CHANNEL,
        sourcePackage: null,
        syncDomain: 'activities',
        cursorToken: nextMetadata.backfillNextDate,
        anchorToken: null,
        lastRecordAt: lastSuccessAt,
        status,
        lastError: status === 'partial' ? 'COROS_MCP_SYNC_PARTIAL' : null,
        metadata: {
          ...nextMetadata,
          fitPending: nextMetadata.fitPendingRecordIds.length,
          canonicalVersion: CANONICAL_ACTIVITY_VERSION,
        },
      });
      await this.importLifecycleService.finishSyncJob({
        jobId: job.jobId,
        leaseToken: job.leaseToken,
        status,
        counters,
        lastError: status === 'partial' ? 'COROS_MCP_SYNC_PARTIAL' : null,
      });
      return {
        provider: 'coros',
        jobId: job.jobId,
        status,
        ...counters,
        healthConsentRequired: !healthConsent,
        errorsByCode,
        lastSuccessAt,
        backfillComplete: nextMetadata.backfillComplete,
        backfillNextDate: nextMetadata.backfillNextDate,
        fitPending: nextMetadata.fitPendingRecordIds.length,
      };
    } catch (error) {
      await this.finishFailedJob(job.jobId, job.leaseToken, error);
      await this.markConnectionError(userId, this.errorMessage(error));
      throw error;
    } finally {
      stopHeartbeat();
    }
  }

  public async isActiveConnection(userId: string): Promise<boolean> {
    return this.corosMcpOAuthService.isActiveConnection(userId);
  }

  private async fetchActivityRecords(
    client: CorosMcpClient,
    tool: CorosMcpTool,
    windows: Array<{ startDate: string; endDate: string }>,
  ): Promise<{ records: JsonRecord[]; paginationTruncated: boolean; retryFromDate: string | null }> {
    const records: JsonRecord[] = [];
    let paginationTruncated = false;
    let retryFromDate: string | null = null;
    for (const window of windows) {
      let cursor: string | null = null;
      const seenCursors = new Set<string>();
      for (let page = 0; page < MAX_PAGES_PER_WINDOW; page += 1) {
        const result = await client.callTool<unknown>(
          tool.name,
          buildCorosMcpToolArguments(tool, { ...window, cursor }),
        );
        const activityPage = extractCorosMcpActivityPage(result);
        records.push(...activityPage.records);
        if (
          activityPage.hasMore &&
          (!activityPage.nextCursor || page === MAX_PAGES_PER_WINDOW - 1 || seenCursors.has(activityPage.nextCursor))
        ) {
          paginationTruncated = true;
          retryFromDate = window.startDate;
          break;
        }
        if (!activityPage.hasMore || !activityPage.nextCursor || seenCursors.has(activityPage.nextCursor)) break;
        seenCursors.add(activityPage.nextCursor);
        cursor = activityPage.nextCursor;
      }
      if (paginationTruncated) break;
    }
    return { records, paginationTruncated, retryFromDate };
  }

  private async importActivity(input: {
    userId: string;
    client: CorosMcpClient;
    summary: JsonRecord;
    detailTool: CorosMcpTool | null;
    lapsTool: CorosMcpTool | null;
    fitTool: CorosMcpTool | null;
    jobId: string;
    fitDownloadsToday: number;
    fitDownloadDate: string;
    fitRetry: boolean;
  }): Promise<{
    status: 'failed' | 'imported' | 'skipped';
    activityId: string;
    fitPending: boolean;
    fitDownloaded: number;
    errorCode: string | null;
  }> {
    const activityId = readActivityId(input.summary);
    if (!activityId) {
      return {
        status: 'failed',
        activityId: 'unknown',
        fitPending: false,
        fitDownloaded: 0,
        errorCode: 'COROS_ACTIVITY_ID_MISSING',
      };
    }
    let lifecycleImportId: string | null = null;
    if (!input.fitRetry) {
      const claim = await this.importLifecycleService.claimActivity({
        userId: input.userId,
        provider: 'coros',
        sourceChannel: SOURCE_CHANNEL,
        sourcePackage: null,
        sourceRecordId: activityId,
        canonicalVersion: CANONICAL_ACTIVITY_VERSION,
        jobId: input.jobId,
      });
      if (claim.action === 'skip') {
        return { status: 'skipped', activityId, fitPending: false, fitDownloaded: 0, errorCode: null };
      }
      lifecycleImportId = claim.importId;
    }

    let fitPending = input.fitRetry;
    let fitDownloaded = 0;
    let errorCode: string | null = null;
    try {
      const detail = input.detailTool ? await this.callOptionalTool(input.client, input.detailTool, activityId) : null;
      const laps = input.lapsTool ? await this.callOptionalTool(input.client, input.lapsTool, activityId) : null;
      const merged = mergeCorosMcpActivityPayload(input.summary, detail, laps);
      let fitActivities: Array<ReturnType<typeof parseCorosActivityFileToCanonical>> = [];

      if (input.fitTool && input.fitDownloadsToday < FIT_DAILY_LIMIT) {
        const fitResponse = await this.callOptionalTool(input.client, input.fitTool, activityId);
        const fitBytes = await this.downloadFitResponses(input.client, fitResponse);
        if (fitBytes.length > 0) {
          const usableFitBytes = fitBytes.filter(bytes => bytes.byteLength <= MAX_FIT_BYTES);
          const hasOversizedFit = usableFitBytes.length !== fitBytes.length;
          fitDownloaded = usableFitBytes.length;
          fitPending = hasOversizedFit;
          errorCode = hasOversizedFit ? 'COROS_FIT_FILE_TOO_LARGE' : null;
          fitActivities = usableFitBytes.flatMap((bytes, index) => {
            try {
              return [parseCorosActivityFileToCanonical(bytes, `coros-${activityId}-${index + 1}.fit`)];
            } catch {
              return [];
            }
          });
          if (fitActivities.length === 0) {
            fitPending = true;
            errorCode = errorCode ?? 'COROS_FIT_INVALID';
          }
        } else {
          fitPending = true;
          errorCode = 'COROS_FIT_UNAVAILABLE';
        }
      } else if (input.fitTool && input.fitDownloadsToday >= FIT_DAILY_LIMIT) {
        fitPending = true;
        errorCode = 'COROS_FIT_DAILY_LIMIT_REACHED';
      } else {
        fitPending = true;
        errorCode = 'COROS_FIT_TOOL_UNAVAILABLE';
      }

      const jsonActivity = this.hasUsefulActivityData(merged)
        ? parseCorosActivityFileToCanonical(JSON.stringify(merged), `coros-${activityId}.json`)
        : null;
      if (!jsonActivity && fitActivities.length === 0) {
        throw new BadGatewayException('COROS_ACTIVITY_DETAILS_UNAVAILABLE');
      }
      const fitActivity = fitActivities.length > 0 ? mergeCorosMultisportActivities(fitActivities) : null;
      const activity = fitActivity
        ? {
            ...fitActivity,
            providerActivityId: activityId,
            sportType: jsonActivity?.sportType ?? fitActivity.sportType,
            sportSubtype: jsonActivity?.sportSubtype ?? fitActivity.sportSubtype,
            summary: {
              ...fitActivity.summary,
              startedAt: jsonActivity?.summary.startedAt ?? fitActivity.summary.startedAt,
              endedAt: jsonActivity?.summary.endedAt ?? fitActivity.summary.endedAt,
              durationSeconds: jsonActivity?.summary.durationSeconds ?? fitActivity.summary.durationSeconds,
              distanceM: jsonActivity?.summary.distanceM ?? fitActivity.summary.distanceM,
              caloriesKcal: jsonActivity?.summary.caloriesKcal ?? fitActivity.summary.caloriesKcal,
            },
            device: jsonActivity?.device ?? fitActivity.device,
            vendorFields: { ...fitActivity.vendorFields, ...(jsonActivity?.vendorFields ?? {}) },
          }
        : { ...jsonActivity!, providerActivityId: activityId };
      const rawPayload = await this.rawPayloadService.storeRawPayload({
        userId: input.userId,
        provider: 'coros',
        sourceChannel: SOURCE_CHANNEL,
        sourcePackage: null,
        objectType: 'activity',
        sourceRecordId: activityId,
        payload: { summary: input.summary, detail, laps, fitAvailable: fitActivities.length > 0, fitPending },
        traceId: input.jobId,
      });
      const provenance: CanonicalProvenance = {
        provider: 'coros',
        sourceChannel: SOURCE_CHANNEL,
        sourcePackage: null,
        sourceProviderKey: 'coros',
        sourceRecordId: activityId,
        sourceUpdatedAt: null,
        rawPayloadId: rawPayload.id,
      };
      await this.activityWriterService.upsertActivity({
        userId: input.userId,
        activity,
        provenance,
        lifecycleImportId,
        lifecycleJobId: input.jobId,
        canonicalVersion: CANONICAL_ACTIVITY_VERSION,
      });
      return { status: 'imported', activityId, fitPending, fitDownloaded, errorCode };
    } catch (error) {
      if (error instanceof CorosMcpRpcError) {
        this.logger.warn({ provider: 'coros', rpcCode: error.rpcCode, message: error.message });
      }
      if (lifecycleImportId) {
        await this.importLifecycleService.failActivity(
          lifecycleImportId,
          this.errorMessage(error),
          this.isRetryable(error),
        );
      }
      this.logger.warn({ provider: 'coros', activityId, errorCode: this.errorMessage(error) });
      return {
        status: 'failed',
        activityId,
        fitPending,
        fitDownloaded,
        errorCode: this.errorMessage(error),
      };
    }
  }

  private async callOptionalTool(client: CorosMcpClient, tool: CorosMcpTool, activityId: string): Promise<unknown> {
    try {
      return await client.callTool<unknown>(tool.name, buildCorosMcpToolArguments(tool, { activityId }));
    } catch (error) {
      this.logger.warn({ provider: 'coros', tool: tool.name, activityId, errorCode: this.errorMessage(error) });
      return null;
    }
  }

  private async downloadFitResponses(client: CorosMcpClient, response: unknown): Promise<Uint8Array[]> {
    const directBytes = extractCorosMcpFitByteArrays(response);
    if (directBytes.length > 0) return directBytes;
    const urls = extractCorosMcpFitUrls(response);
    const downloaded: Uint8Array[] = [];
    for (const url of urls) {
      try {
        downloaded.push(await client.downloadFitFile(url));
      } catch (error) {
        this.logger.warn({ provider: 'coros', fitUrl: url, errorCode: this.errorMessage(error) });
      }
    }
    return downloaded;
  }

  private buildSyncPlan(previous: McpSyncMetadata): {
    windows: Array<{ startDate: string; endDate: string }>;
    backfillComplete: boolean;
    nextDateAfterWindows: string | null;
  } {
    const today = this.todayString();
    const startDate = previous.backfillComplete
      ? subtractDays(previous.lastActivityAt?.slice(0, 10) ?? today, NORMAL_SYNC_OVERLAP_DAYS - 1)
      : (previous.backfillNextDate ?? this.configuredBackfillStartDate());
    const allWindows = buildCorosMcpDateWindows(
      new Date(`${startDate}T00:00:00.000Z`),
      new Date(`${today}T00:00:00.000Z`),
      this.windowDays(),
    );
    const windows = previous.backfillComplete ? allWindows : allWindows.slice(0, this.windowsPerSync());
    const lastWindow = windows[windows.length - 1];
    const complete = previous.backfillComplete || !lastWindow || lastWindow.endDate === today;
    return {
      windows,
      backfillComplete: complete,
      nextDateAfterWindows: complete ? null : addDays(lastWindow.endDate, 1),
    };
  }

  private nextMetadata(input: {
    previous: McpSyncMetadata;
    plan: { backfillComplete: boolean; nextDateAfterWindows: string | null };
    records: JsonRecord[];
    pendingFitIds: Set<string>;
    fitDownloadDate: string;
    fitDownloadsToday: number;
    paginationTruncated: boolean;
    paginationRetryFromDate: string | null;
  }): McpSyncMetadata {
    const latestActivityMs = input.records.reduce((latest, record) => Math.max(latest, readActivityStartMs(record)), 0);
    const previousActivityMs = input.previous.lastActivityAt ? Date.parse(input.previous.lastActivityAt) : 0;
    return {
      backfillComplete: input.plan.backfillComplete && !input.paginationTruncated,
      backfillNextDate: input.paginationTruncated
        ? (input.paginationRetryFromDate ?? input.plan.nextDateAfterWindows)
        : input.plan.nextDateAfterWindows,
      lastActivityAt:
        latestActivityMs > 0
          ? new Date(Math.max(latestActivityMs, previousActivityMs)).toISOString()
          : input.previous.lastActivityAt,
      fitDownloadDate: input.fitDownloadDate,
      fitDownloadsToday: input.fitDownloadsToday,
      fitPendingRecordIds: [...input.pendingFitIds],
    };
  }

  private async readSyncMetadata(userId: string): Promise<McpSyncMetadata> {
    const { data, error } = await this.supabaseAdminService.client
      .from('integration_sync_state')
      .select('metadata')
      .eq('user_id', userId)
      .eq('provider', 'coros')
      .eq('source_channel', SOURCE_CHANNEL)
      .is('source_package', null)
      .eq('sync_domain', 'activities')
      .maybeSingle();
    if (error) throw new InternalServerErrorException('COROS_MCP_SYNC_STATE_READ_FAILED');
    const metadata = this.isRecord(data?.metadata) ? data.metadata : {};
    return {
      backfillComplete: metadata.backfillComplete === true,
      backfillNextDate: this.readDate(metadata.backfillNextDate),
      lastActivityAt: this.readTimestamp(metadata.lastActivityAt),
      fitDownloadDate: this.readDate(metadata.fitDownloadDate),
      fitDownloadsToday: this.readNonNegativeInteger(metadata.fitDownloadsToday),
      fitPendingRecordIds: Array.isArray(metadata.fitPendingRecordIds)
        ? metadata.fitPendingRecordIds.filter((value): value is string => typeof value === 'string')
        : [],
    };
  }

  private async hasHealthConsent(userId: string): Promise<boolean> {
    const { data, error } = await this.supabaseAdminService.client
      .from('user_preferences')
      .select('health_data_consent, health_data_consent_version')
      .eq('user_id', userId)
      .maybeSingle();
    if (error) throw new InternalServerErrorException('HEALTH_CONSENT_READ_FAILED');
    return data?.health_data_consent === true && data.health_data_consent_version === COROS_HEALTH_CONSENT_VERSION;
  }

  private async importDailyHealth(userId: string, record: JsonRecord): Promise<void> {
    const sourceRecordId = this.readString(record.happenDay) ?? this.readString(record.date);
    if (!sourceRecordId) throw new BadGatewayException('COROS_DAILY_RECORD_ID_MISSING');
    const rawPayload = await this.rawPayloadService.storeRawPayload({
      userId,
      provider: 'coros',
      sourceChannel: SOURCE_CHANNEL,
      sourcePackage: null,
      objectType: 'daily_health',
      sourceRecordId,
      payload: record,
      traceId: null,
    });
    const provenance: CanonicalProvenance = {
      provider: 'coros',
      sourceChannel: SOURCE_CHANNEL,
      sourcePackage: null,
      sourceProviderKey: 'coros',
      sourceRecordId,
      sourceUpdatedAt: null,
      rawPayloadId: rawPayload.id,
    };
    await this.healthWriterService.upsertDailyActivity({
      userId,
      dailyActivity: mapCorosDailyActivityToCanonical(record),
      provenance,
    });
    if (this.readString(record.sleepStartTime) && this.readString(record.sleepEndTime)) {
      await this.healthWriterService.upsertSleep({ userId, sleep: mapCorosSleepToCanonical(record), provenance });
    }
    if (this.readNumber(record.rhr) != null || this.readNumber(record.ppgHrv) != null) {
      await this.healthWriterService.upsertRecovery({
        userId,
        recovery: mapCorosRecoveryToCanonical(record),
        provenance,
      });
    }
  }

  private findTool(
    tools: CorosMcpTool[],
    names: string[],
    fallback?: (tool: CorosMcpTool) => boolean,
  ): CorosMcpTool | null {
    return tools.find(tool => names.includes(tool.name)) ?? (fallback ? (tools.find(fallback) ?? null) : null);
  }

  private hasUsefulActivityData(record: JsonRecord): boolean {
    const identityKeys = new Set(['activityId', 'activity_id', 'labelId', 'label_id', 'workoutId', 'workout_id', 'id']);
    return Object.keys(record).some(key => !identityKeys.has(key));
  }

  private uniqueDailyRecords(records: JsonRecord[]): JsonRecord[] {
    const seen = new Set<string>();
    return records.filter(record => {
      const key = this.readString(record.happenDay) ?? this.readString(record.date);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  private fitDownloadsToday(metadata: McpSyncMetadata): number {
    return metadata.fitDownloadDate === this.todayString() ? metadata.fitDownloadsToday : 0;
  }

  private configuredBackfillStartDate(): string {
    const configured = this.configService.get<string>('COROS_MCP_BACKFILL_START_DATE')?.trim();
    if (configured && /^\d{4}-\d{2}-\d{2}$/.test(configured)) return configured;
    return BACKFILL_START_DATE;
  }

  private windowDays(): number {
    return this.configuredInteger('COROS_MCP_BACKFILL_WINDOW_DAYS', DEFAULT_WINDOW_DAYS, 1, 90);
  }

  private windowsPerSync(): number {
    return this.configuredInteger('COROS_MCP_WINDOWS_PER_SYNC', DEFAULT_WINDOWS_PER_SYNC, 1, 100);
  }

  private configuredInteger(key: string, fallback: number, min: number, max: number): number {
    const value = Number(this.configService.get<string>(key));
    return Number.isInteger(value) && value >= min && value <= max ? value : fallback;
  }

  private async markConnectionResult(
    userId: string,
    syncedAt: string,
    status: 'success' | 'partial',
    errorsByCode: Record<string, number>,
  ): Promise<void> {
    const { error } = await this.supabaseAdminService.client
      .from('user_connections')
      .update({
        last_synced_at: syncedAt,
        status: 'active',
        last_error: status === 'partial' ? JSON.stringify(errorsByCode) : null,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId)
      .eq('provider', 'coros');
    if (error) throw new InternalServerErrorException('COROS_MCP_CONNECTION_STATUS_UPDATE_FAILED');
  }

  private async markConnectionError(userId: string, message: string): Promise<void> {
    await this.supabaseAdminService.client
      .from('user_connections')
      .update({ status: 'error', last_error: message, updated_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('provider', 'coros');
  }

  private activeResult(jobId: string): CorosMcpSyncResult {
    return {
      provider: 'coros',
      jobId,
      status: 'running',
      activitiesImported: 0,
      activitiesSkipped: 0,
      activitiesFailed: 0,
      healthDaysImported: 0,
      healthConsentRequired: false,
      errorsByCode: {},
      lastSuccessAt: null,
      backfillComplete: false,
      backfillNextDate: null,
      fitPending: 0,
    };
  }

  private startLeaseHeartbeat(jobId: string, leaseToken: string): () => void {
    const timer = setInterval(() => {
      void this.importLifecycleService.renewSyncJob(jobId, leaseToken).catch(error => {
        this.logger.error('Failed to renew COROS MCP sync job lease', error as Error);
      });
    }, 60_000);
    timer.unref();
    return () => clearInterval(timer);
  }

  private async finishFailedJob(jobId: string, leaseToken: string, error: unknown): Promise<void> {
    try {
      await this.importLifecycleService.finishSyncJob({
        jobId,
        leaseToken,
        status: 'error',
        counters: {},
        lastError: this.errorMessage(error),
      });
    } catch (finishError) {
      this.logger.error('Failed to close COROS MCP sync job', finishError as Error);
    }
  }

  private incrementError(errors: Record<string, number>, code: string): void {
    errors[code] = (errors[code] ?? 0) + 1;
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : 'COROS_MCP_SYNC_FAILED';
  }

  private isRetryable(error: unknown): boolean {
    return !(error instanceof UnauthorizedException || error instanceof ForbiddenException);
  }

  private readString(value: unknown): string | null {
    return typeof value === 'string' && value.trim() ? value.trim() : null;
  }

  private readNumber(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value !== 'string') return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  private readDate(value: unknown): string | null {
    return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
  }

  private readTimestamp(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
  }

  private readNonNegativeInteger(value: unknown): number {
    return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : 0;
  }

  private isRecord(value: unknown): value is JsonRecord {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  private todayString(): string {
    return new Date().toISOString().slice(0, 10);
  }
}

function readActivityStartMs(record: JsonRecord): number {
  for (const key of ['startTime', 'start_time', 'startedAt', 'started_at', 'startDate', 'start_date', 'date']) {
    const value = record[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value < 100_000_000_000 ? value * 1000 : value;
    if (typeof value === 'string' && value.trim()) {
      const numeric = Number(value);
      if (Number.isFinite(numeric) && /^\d+(?:\.\d+)?$/.test(value.trim()))
        return numeric < 100_000_000_000 ? numeric * 1000 : numeric;
      const parsed = Date.parse(value);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return 0;
}

function addDays(value: string, days: number): string {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function subtractDays(value: string, days: number): string {
  return addDays(value, -days);
}
