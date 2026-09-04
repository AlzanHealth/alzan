import {
  BadGatewayException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { SupabaseAdminService } from '../../../core/supabase/supabase.service';
import { parseCorosActivityFileToCanonical } from '../../activity-import/parsers/coros-activity-canonical.mapper';
import {
  mapCorosDailyActivityToCanonical,
  mapCorosRecoveryToCanonical,
  mapCorosSleepToCanonical,
} from '../../activity-import/parsers/coros-health-canonical.mapper';
import { CorosOAuthService } from '../../providers/oauth/coros-oauth.service';
import { decryptCorosToken, encryptCorosToken, validateCorosFitUrl } from '../../providers/oauth/coros-security';
import { CanonicalProvenance } from '../domain/wearable.types';
import { CanonicalActivityWriterService } from './canonical-activity-writer.service';
import { CanonicalHealthWriterService } from './canonical-health-writer.service';
import {
  assertCorosFitBytes,
  assertCorosApiSuccess,
  buildCorosDateWindows,
  extractCorosDailyPage,
  extractCorosFitUrls,
  extractCorosWorkoutPage,
} from './coros-api.utils';
import { buildCorosCanonicalActivity } from './coros-activity.utils';
import { IntegrationSyncStateService } from './integration-sync-state.service';
import { RawPayloadService } from './raw-payload.service';
import { WearableImportLifecycleService } from './wearable-import-lifecycle.service';

type JsonRecord = Record<string, unknown>;
type CorosToken = {
  connectionId: string;
  accessToken: string;
  refreshToken: string | null;
  expiresAt: string | null;
  openId: string;
};

export interface CorosSyncResult {
  provider: 'coros';
  jobId: string;
  status: 'running' | 'success' | 'partial';
  activitiesImported: number;
  activitiesSkipped: number;
  activitiesFailed: number;
  healthDaysImported: number;
  healthConsentRequired: boolean;
  errorsByCode: Record<string, number>;
  fitPending: number;
  lastSuccessAt: string | null;
}

export interface CorosWorkoutPushSyncResult {
  jobId: string;
  status: 'failed' | 'imported' | 'running' | 'skipped';
  fitPending?: boolean;
}

type CorosWorkoutImportOutcome = {
  status: 'failed' | 'imported' | 'skipped';
  fitPending: boolean;
  errorCode?: string;
};

const FIRST_SYNC_LOOKBACK_DAYS = 90;
const NORMAL_SYNC_OVERLAP_DAYS = 3;
const COROS_TOKEN_LIFETIME_SECONDS = 30 * 24 * 60 * 60;
const CANONICAL_ACTIVITY_VERSION = 9;
const COROS_REQUEST_RETRIES = 3;
const COROS_RETRY_BASE_DELAY_MS = 250;
const MAX_FIT_BYTES = 25 * 1024 * 1024;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const COROS_HEALTH_CONSENT_VERSION = 'health_integrations_v2_2026_08_22';

@Injectable()
export class CorosCloudSyncService {
  private readonly logger = new Logger(CorosCloudSyncService.name);
  private readonly refreshes = new Map<string, Promise<CorosToken>>();

  constructor(
    private readonly configService: ConfigService,
    private readonly supabaseAdminService: SupabaseAdminService,
    private readonly rawPayloadService: RawPayloadService,
    private readonly syncStateService: IntegrationSyncStateService,
    private readonly activityWriterService: CanonicalActivityWriterService,
    private readonly healthWriterService: CanonicalHealthWriterService,
    private readonly importLifecycleService: WearableImportLifecycleService,
    private readonly corosOAuthService: CorosOAuthService,
  ) {}

  public async sync(userId: string): Promise<CorosSyncResult> {
    if (!this.corosOAuthService.isUserAllowed(userId)) {
      throw new ForbiddenException('COROS integration is not enabled for this user');
    }
    const token = await this.getUsableToken(userId);
    const job = await this.importLifecycleService.claimSyncJob({
      userId,
      provider: 'coros',
      syncDomain: 'activities',
      leaseSeconds: 1800,
    });
    if (job.action === 'active') return this.activeResult(job.jobId);

    const stopHeartbeat = this.startLeaseHeartbeat(job.jobId, job.leaseToken);
    try {
      const windows = await this.resolveDateWindows(userId);
      const workouts = await this.fetchWorkouts(token, windows);
      let activitiesImported = 0;
      let activitiesSkipped = 0;
      let activitiesFailed = 0;
      let fitPending = 0;
      const errorsByCode: Record<string, number> = {};

      for (const summary of this.uniqueWorkouts(workouts)) {
        const outcome = await this.importWorkout(userId, token, summary, job.jobId);
        if (outcome.status === 'imported') activitiesImported += 1;
        else if (outcome.status === 'skipped') activitiesSkipped += 1;
        else {
          activitiesFailed += 1;
          const errorCode = outcome.errorCode ?? 'COROS_ACTIVITY_IMPORT_FAILED';
          errorsByCode[errorCode] = (errorsByCode[errorCode] ?? 0) + 1;
        }
        if (outcome.fitPending) fitPending += 1;
      }

      const hasHealthConsent = await this.hasHealthConsent(userId);
      let healthDaysImported = 0;
      if (hasHealthConsent) {
        const dailyRecords = await this.fetchDailyHealth(token, windows);
        for (const record of this.uniqueDailyRecords(dailyRecords)) {
          await this.importDailyHealth(userId, record);
          healthDaysImported += 1;
        }
      }

      const status = activitiesFailed > 0 ? 'partial' : 'success';
      const lastSuccessAt = new Date().toISOString();
      await this.markConnectionResult(userId, lastSuccessAt, status, errorsByCode);
      await this.syncStateService.saveState({
        userId,
        provider: 'coros',
        sourceChannel: 'cloud',
        sourcePackage: null,
        syncDomain: 'activities',
        cursorToken: null,
        anchorToken: null,
        lastRecordAt: lastSuccessAt,
        status,
        metadata: {
          jobId: job.jobId,
          activitiesImported,
          activitiesSkipped,
          activitiesFailed,
          healthDaysImported,
          fitPending,
          healthConsentRequired: !hasHealthConsent,
          canonicalVersion: CANONICAL_ACTIVITY_VERSION,
        },
      });
      await this.importLifecycleService.finishSyncJob({
        jobId: job.jobId,
        leaseToken: job.leaseToken,
        status,
        counters: { activitiesImported, activitiesSkipped, activitiesFailed, healthDaysImported, fitPending },
        lastError: activitiesFailed > 0 ? 'COROS_SYNC_PARTIAL' : null,
      });
      return {
        provider: 'coros',
        jobId: job.jobId,
        status,
        activitiesImported,
        activitiesSkipped,
        activitiesFailed,
        healthDaysImported,
        healthConsentRequired: !hasHealthConsent,
        errorsByCode,
        fitPending,
        lastSuccessAt,
      };
    } catch (error: unknown) {
      await this.finishFailedJob(job.jobId, job.leaseToken, error);
      await this.markConnectionError(userId, this.errorMessage(error));
      throw error;
    } finally {
      stopHeartbeat();
    }
  }

  public async syncWorkoutPush(userId: string, summary: JsonRecord): Promise<CorosWorkoutPushSyncResult> {
    if (!this.corosOAuthService.isUserAllowed(userId)) {
      throw new ForbiddenException('COROS integration is not enabled for this user');
    }
    const token = await this.getUsableToken(userId);
    const job = await this.importLifecycleService.claimSyncJob({
      userId,
      provider: 'coros',
      syncDomain: 'activities',
      leaseSeconds: 1800,
    });
    if (job.action === 'active') return { jobId: job.jobId, status: 'running' };

    const stopHeartbeat = this.startLeaseHeartbeat(job.jobId, job.leaseToken);
    try {
      const result = await this.importWorkout(userId, token, summary, job.jobId);
      const status = result.status;
      await this.importLifecycleService.finishSyncJob({
        jobId: job.jobId,
        leaseToken: job.leaseToken,
        status: status === 'failed' ? 'partial' : 'success',
        counters: {
          activitiesImported: status === 'imported' ? 1 : 0,
          activitiesSkipped: status === 'skipped' ? 1 : 0,
          activitiesFailed: status === 'failed' ? 1 : 0,
        },
        lastError: status === 'failed' ? 'COROS_ACTIVITY_IMPORT_FAILED' : null,
      });
      if (status !== 'failed') {
        await this.markConnectionResult(userId, new Date().toISOString(), 'success', {});
      }
      return { jobId: job.jobId, status, fitPending: result.fitPending };
    } catch (error: unknown) {
      await this.finishFailedJob(job.jobId, job.leaseToken, error);
      throw error;
    } finally {
      stopHeartbeat();
    }
  }

  private activeResult(jobId: string): CorosSyncResult {
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
      fitPending: 0,
      lastSuccessAt: null,
    };
  }

  private async importWorkout(
    userId: string,
    token: CorosToken,
    summary: JsonRecord,
    jobId: string,
  ): Promise<CorosWorkoutImportOutcome> {
    const labelId = this.readIdentifier(summary.labelId);
    if (!labelId) return { status: 'failed', fitPending: false, errorCode: 'COROS_ACTIVITY_ID_MISSING' };
    const claim = await this.importLifecycleService.claimActivity({
      userId,
      provider: 'coros',
      sourceChannel: 'cloud',
      sourcePackage: null,
      sourceRecordId: labelId,
      canonicalVersion: CANONICAL_ACTIVITY_VERSION,
      jobId,
    });
    if (claim.action === 'skip') return { status: 'skipped', fitPending: false };

    try {
      const rawPayload = await this.rawPayloadService.storeRawPayload({
        userId,
        provider: 'coros',
        sourceChannel: 'cloud',
        sourcePackage: null,
        objectType: 'activity',
        sourceRecordId: labelId,
        payload: summary,
        traceId: jobId,
      });
      parseCorosActivityFileToCanonical(JSON.stringify(summary), `coros-${labelId}.json`);
      let fitFiles: Uint8Array[] = [];
      let fitPendingReason: string | null = null;
      try {
        fitFiles = await this.fetchWorkoutFits(token, summary, labelId);
      } catch (error: unknown) {
        fitPendingReason = this.errorMessage(error);
        this.logger.warn({ provider: 'coros', labelId, errorCode: fitPendingReason }, 'COROS FIT enrichment pending');
      }
      const { activity } = buildCorosCanonicalActivity(summary, labelId, fitFiles, fitPendingReason);
      const provenance: CanonicalProvenance = {
        provider: 'coros',
        sourceChannel: 'cloud',
        sourcePackage: null,
        sourceProviderKey: 'coros',
        sourceRecordId: labelId,
        sourceUpdatedAt: null,
        rawPayloadId: rawPayload.id,
      };
      await this.activityWriterService.upsertActivity({
        userId,
        activity,
        provenance,
        lifecycleImportId: claim.importId,
        lifecycleJobId: jobId,
        canonicalVersion: CANONICAL_ACTIVITY_VERSION,
      });
      return { status: 'imported', fitPending: fitPendingReason != null };
    } catch (error: unknown) {
      const errorCode = this.errorMessage(error);
      await this.importLifecycleService.failActivity(claim.importId, errorCode, this.isRetryable(error));
      this.logger.warn({ provider: 'coros', labelId, errorCode });
      return { status: 'failed', fitPending: false, errorCode };
    }
  }

  private async importDailyHealth(userId: string, record: JsonRecord): Promise<void> {
    const sourceRecordId = this.readIdentifier(record.happenDay);
    if (!sourceRecordId) throw new BadGatewayException('COROS_DAILY_RECORD_ID_MISSING');
    const rawPayload = await this.rawPayloadService.storeRawPayload({
      userId,
      provider: 'coros',
      sourceChannel: 'cloud',
      sourcePackage: null,
      objectType: 'daily_health',
      sourceRecordId,
      payload: record,
      traceId: null,
    });
    const provenance: CanonicalProvenance = {
      provider: 'coros',
      sourceChannel: 'cloud',
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
    await this.importHrvSamples(userId, record, provenance);
  }

  private async importHrvSamples(userId: string, record: JsonRecord, provenance: CanonicalProvenance): Promise<void> {
    if (!Array.isArray(record.hrvList)) return;
    for (const [index, value] of record.hrvList.entries()) {
      if (!this.isRecord(value)) continue;
      const hrv = this.readNumber(value.hrv);
      const timestamp = this.normalizeTimestamp(value.timestamp);
      if (hrv == null || !timestamp) continue;
      await this.healthWriterService.writeHealthSample({
        userId,
        provider: 'coros',
        sourceChannel: 'cloud',
        sourcePackage: null,
        sourceRecordId: `${provenance.sourceRecordId}:hrv:${index}`,
        metricType: 'hrv_ms',
        recordedAt: timestamp,
        localDate: mapCorosDailyActivityToCanonical(record).date,
        timezone: 'COROS_LOCAL',
        value: hrv,
        unit: 'ms',
        rawPayloadId: provenance.rawPayloadId,
        rawPayload: value,
      });
    }
  }

  private async fetchWorkouts(
    token: CorosToken,
    windows: Array<{ startDate: string; endDate: string }>,
  ): Promise<JsonRecord[]> {
    const pages = await Promise.all(windows.map(window => this.fetchWorkoutWindow(token, window)));
    return pages.flat();
  }

  private async fetchWorkoutWindow(
    token: CorosToken,
    window: { startDate: string; endDate: string },
  ): Promise<JsonRecord[]> {
    const records: JsonRecord[] = [];
    let response = await this.getCoros('/v2/coros/sport/list', token, window);
    let requestedPage: number | null = null;
    const seenPages = new Set<number>();
    for (let iteration = 0; iteration < 100; iteration += 1) {
      const page = extractCorosWorkoutPage(response);
      records.push(...page.records);
      if (page.nextPage == null) return records;
      if (seenPages.has(page.nextPage) || (requestedPage != null && page.nextPage <= requestedPage)) {
        throw new BadGatewayException('COROS_PAGINATION_INVALID');
      }
      seenPages.add(page.nextPage);
      requestedPage = page.nextPage;
      response = await this.getCoros('/v2/coros/sport/list', token, window, {
        pageNo: requestedPage,
        pageSize: 100,
      });
    }
    throw new BadGatewayException('COROS_PAGINATION_TOO_DEEP');
  }

  private async fetchDailyHealth(
    token: CorosToken,
    windows: Array<{ startDate: string; endDate: string }>,
  ): Promise<JsonRecord[]> {
    const pages = await Promise.all(windows.map(window => this.fetchDailyWindow(token, window)));
    return pages.flat();
  }

  private async fetchDailyWindow(
    token: CorosToken,
    window: { startDate: string; endDate: string },
  ): Promise<JsonRecord[]> {
    const records: JsonRecord[] = [];
    let response = await this.getCoros('/coros/daily/query', token, window);
    let requestedPage: number | null = null;
    const seenPages = new Set<number>();
    for (let iteration = 0; iteration < 100; iteration += 1) {
      const page = extractCorosDailyPage(response);
      records.push(...page.records);
      if (page.nextPage == null) return records;
      if (seenPages.has(page.nextPage) || (requestedPage != null && page.nextPage <= requestedPage)) {
        throw new BadGatewayException('COROS_PAGINATION_INVALID');
      }
      seenPages.add(page.nextPage);
      requestedPage = page.nextPage;
      response = await this.getCoros('/coros/daily/query', token, window, {
        pageNo: requestedPage,
        pageSize: 100,
      });
    }
    throw new BadGatewayException('COROS_PAGINATION_TOO_DEEP');
  }

  private async getCoros(
    path: string,
    token: CorosToken,
    window: { startDate: string; endDate: string },
    extraParams: Record<string, string | number> = {},
  ): Promise<unknown> {
    try {
      const response = await this.executeRequest(() =>
        axios.get(`${this.apiBaseUrl}${path}`, {
          params: { token: token.accessToken, openId: token.openId, ...window, ...extraParams },
          headers: { Accept: 'application/json', token: token.accessToken },
          timeout: 15_000,
        }),
      );
      assertCorosApiSuccess(response.data);
      return response.data;
    } catch (error: unknown) {
      throw this.toHttpException(error);
    }
  }

  private async fetchWorkoutFits(token: CorosToken, summary: JsonRecord, labelId: string): Promise<Uint8Array[]> {
    try {
      let fitUrls = extractCorosFitUrls(summary);
      if (fitUrls.length === 0) {
        const detailResponse = await this.executeRequest(() =>
          axios.get<unknown>(`${this.apiBaseUrl}/v2/coros/sport/detail/fit`, {
            params: {
              mode: summary.mode,
              subMode: summary.subMode,
              labelId,
              openId: token.openId,
              token: token.accessToken,
            },
            headers: { Accept: 'application/json', token: token.accessToken },
            timeout: 15_000,
          }),
        );
        fitUrls = extractCorosFitUrls(detailResponse.data);
      }
      if (fitUrls.length === 0) throw new Error('COROS_FIT_URL_MISSING');
      return Promise.all(fitUrls.map(fitUrl => this.downloadFit(fitUrl)));
    } catch (error: unknown) {
      if (error instanceof Error && error.message.startsWith('COROS_FIT_')) throw error;
      throw this.toHttpException(error);
    }
  }

  private async downloadFit(fitUrl: string): Promise<Uint8Array> {
    const url = validateCorosFitUrl(fitUrl, this.fitAllowedHosts);
    const response = await this.executeRequest(() =>
      axios.get<ArrayBuffer>(url.toString(), {
        responseType: 'arraybuffer',
        timeout: 15_000,
        maxRedirects: 0,
        maxContentLength: MAX_FIT_BYTES,
        maxBodyLength: MAX_FIT_BYTES,
      }),
    );
    const bytes = Uint8Array.from(new Uint8Array(response.data));
    assertCorosFitBytes(bytes, MAX_FIT_BYTES);
    return bytes;
  }

  private async getUsableToken(userId: string): Promise<CorosToken> {
    const token = await this.readToken(userId);
    if (!token.expiresAt || Date.parse(token.expiresAt) > Date.now() + 5 * 60_000) return token;
    const existingRefresh = this.refreshes.get(userId);
    if (existingRefresh) return existingRefresh;
    const refresh = this.refreshToken(userId, token).finally(() => this.refreshes.delete(userId));
    this.refreshes.set(userId, refresh);
    return refresh;
  }

  private async readToken(userId: string): Promise<CorosToken> {
    const { data: connection, error: connectionError } = await this.supabaseAdminService.client
      .from('user_connections')
      .select('id, status, provider_user_id')
      .eq('user_id', userId)
      .eq('provider', 'coros')
      .maybeSingle();
    if (connectionError) throw new InternalServerErrorException('COROS_CONNECTION_READ_FAILED');
    if (!connection || connection.status !== 'active' || !connection.provider_user_id) {
      throw new UnauthorizedException('COROS_CONNECTION_REQUIRED');
    }
    const { data: token, error: tokenError } = await this.supabaseAdminService.client
      .from('provider_connection_tokens')
      .select('access_token, refresh_token, token_expires_at')
      .eq('connection_id', connection.id)
      .maybeSingle();
    if (tokenError) throw new InternalServerErrorException('COROS_TOKEN_READ_FAILED');
    if (!token?.access_token) throw new UnauthorizedException('COROS_ACCESS_TOKEN_MISSING');
    const encryptionKey = this.encryptionKey;
    return {
      connectionId: connection.id,
      accessToken: decryptCorosToken(token.access_token, encryptionKey),
      refreshToken: token.refresh_token ? decryptCorosToken(token.refresh_token, encryptionKey) : null,
      expiresAt: token.token_expires_at,
      openId: connection.provider_user_id,
    };
  }

  private async refreshToken(userId: string, token: CorosToken): Promise<CorosToken> {
    if (!token.refreshToken) throw new UnauthorizedException('COROS_REFRESH_TOKEN_MISSING');
    const clientId = this.configService.get<string>('COROS_CLIENT_ID');
    const clientSecret = this.configService.get<string>('COROS_CLIENT_SECRET');
    if (!clientId || !clientSecret) throw new InternalServerErrorException('COROS_CLIENT_CREDENTIALS_MISSING');
    const response = await this.executeRequest(() =>
      axios.post<unknown>(
        `${this.apiBaseUrl}/oauth2/refresh-token`,
        new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          refresh_token: token.refreshToken as string,
          grant_type: 'refresh_token',
        }).toString(),
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 10_000 },
      ),
    );
    const responsePayload =
      this.isRecord(response.data) && this.isRecord(response.data.data) ? response.data.data : response.data;
    const resultCode = this.isRecord(response.data) ? this.readString(response.data.result) : null;
    if (resultCode != null && resultCode !== '0000') throw new UnauthorizedException('COROS_TOKEN_REFRESH_FAILED');
    if (!this.isRecord(responsePayload)) throw new UnauthorizedException('COROS_TOKEN_REFRESH_FAILED');
    const accessToken = this.readString(
      responsePayload.access_token ?? responsePayload.accessToken ?? responsePayload.token,
    );
    if (!accessToken) throw new UnauthorizedException('COROS_TOKEN_REFRESH_FAILED');
    const refreshedToken =
      this.readString(responsePayload.refresh_token ?? responsePayload.refreshToken) ?? token.refreshToken;
    const expiresIn =
      this.readNumber(responsePayload.expires_in ?? responsePayload.expiresIn) ?? COROS_TOKEN_LIFETIME_SECONDS;
    const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();
    const encryptionKey = this.encryptionKey;
    const { error } = await this.supabaseAdminService.client
      .from('provider_connection_tokens')
      .update({
        access_token: encryptCorosToken(accessToken, encryptionKey),
        refresh_token: refreshedToken ? encryptCorosToken(refreshedToken, encryptionKey) : null,
        token_expires_at: expiresAt,
        token_type: this.readString(responsePayload.token_type ?? responsePayload.tokenType),
        updated_at: new Date().toISOString(),
      })
      .eq('connection_id', token.connectionId);
    if (error) throw new InternalServerErrorException('COROS_TOKEN_REFRESH_PERSIST_FAILED');
    const { error: connectionError } = await this.supabaseAdminService.client
      .from('user_connections')
      .update({ token_expires_at: expiresAt, status: 'active', last_error: null, updated_at: new Date().toISOString() })
      .eq('id', token.connectionId)
      .eq('user_id', userId);
    if (connectionError) throw new InternalServerErrorException('COROS_CONNECTION_REFRESH_PERSIST_FAILED');
    return { ...token, accessToken, refreshToken: refreshedToken, expiresAt };
  }

  private async resolveDateWindows(userId: string): Promise<Array<{ startDate: string; endDate: string }>> {
    const { data } = await this.supabaseAdminService.client
      .from('user_connections')
      .select('last_synced_at')
      .eq('user_id', userId)
      .eq('provider', 'coros')
      .maybeSingle();
    const now = new Date();
    const earliest = now.getTime() - (FIRST_SYNC_LOOKBACK_DAYS - 1) * MS_PER_DAY;
    const lastSynced = data?.last_synced_at ? Date.parse(data.last_synced_at) : Number.NaN;
    const startMs = Number.isFinite(lastSynced)
      ? Math.max(earliest, lastSynced - (NORMAL_SYNC_OVERLAP_DAYS - 1) * MS_PER_DAY)
      : earliest;
    return buildCorosDateWindows(new Date(startMs), now);
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

  private uniqueWorkouts(values: JsonRecord[]): JsonRecord[] {
    const byId = new Map<string, JsonRecord>();
    for (const value of values) {
      const id = this.readIdentifier(value.labelId);
      if (id) byId.set(id, value);
    }
    return [...byId.values()];
  }

  private uniqueDailyRecords(values: JsonRecord[]): JsonRecord[] {
    const byDay = new Map<string, JsonRecord>();
    for (const value of values) {
      const day = this.readIdentifier(value.happenDay);
      if (day) byDay.set(day, value);
    }
    return [...byDay.values()];
  }

  private async executeRequest<T>(request: () => Promise<T>): Promise<T> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= COROS_REQUEST_RETRIES; attempt += 1) {
      try {
        return await request();
      } catch (error: unknown) {
        lastError = error;
        if (attempt === COROS_REQUEST_RETRIES || !this.shouldRetry(error)) throw error;
        await new Promise(resolve => setTimeout(resolve, this.retryDelayMs(error, attempt)));
      }
    }
    throw lastError;
  }

  private shouldRetry(error: unknown): boolean {
    if (!axios.isAxiosError(error)) return false;
    const status = error.response?.status;
    return status == null || status === 429 || status >= 500;
  }

  private retryDelayMs(error: unknown, attempt: number): number {
    if (axios.isAxiosError(error)) {
      const retryAfter = Number(error.response?.headers?.['retry-after']);
      if (Number.isFinite(retryAfter) && retryAfter >= 0) return retryAfter * 1000;
    }
    return COROS_RETRY_BASE_DELAY_MS * 2 ** attempt;
  }

  private toHttpException(error: unknown): Error {
    if (error instanceof Error && error.message.startsWith('COROS_API_ERROR_')) {
      return new BadGatewayException(error.message);
    }
    if (axios.isAxiosError(error) && error.response?.status === 429) {
      return new ServiceUnavailableException('COROS_RATE_LIMITED');
    }
    if (axios.isAxiosError(error) && (error.response?.status === 401 || error.response?.status === 403)) {
      return new UnauthorizedException('COROS_TOKEN_EXPIRED_OR_REVOKED');
    }
    return new BadGatewayException('COROS_API_REQUEST_FAILED');
  }

  private startLeaseHeartbeat(jobId: string, leaseToken: string): () => void {
    const timer = setInterval(() => {
      void this.importLifecycleService.renewSyncJob(jobId, leaseToken).catch(error => {
        this.logger.error('Failed to renew COROS sync job lease', error as Error);
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
      this.logger.error('Failed to close COROS sync job', finishError as Error);
    }
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
    if (error) throw new InternalServerErrorException('COROS_CONNECTION_UPDATE_FAILED');
  }

  private async markConnectionError(userId: string, message: string): Promise<void> {
    const { error } = await this.supabaseAdminService.client
      .from('user_connections')
      .update({ status: 'error', last_error: message, updated_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('provider', 'coros');
    if (error) throw new InternalServerErrorException('COROS_CONNECTION_ERROR_UPDATE_FAILED');
  }

  private get apiBaseUrl(): string {
    return (this.configService.get<string>('COROS_API_BASE_URL') || 'https://opentest.coros.com').replace(/\/$/, '');
  }

  private get fitAllowedHosts(): string[] {
    return (this.configService.get<string>('COROS_FIT_ALLOWED_HOSTS') || 'oss.coros.com')
      .split(',')
      .map(host => host.trim())
      .filter(Boolean);
  }

  private get encryptionKey(): string {
    const key = this.configService.get<string>('COROS_TOKEN_ENCRYPTION_KEY_V1');
    if (!key) throw new InternalServerErrorException('COROS_TOKEN_ENCRYPTION_KEY_MISSING');
    return key;
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : 'COROS_SYNC_FAILED';
  }

  private readIdentifier(value: unknown): string | null {
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) return String(Math.round(value));
    return null;
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

  private normalizeTimestamp(value: unknown): string | null {
    const number = this.readNumber(value);
    if (number == null || number <= 0) return null;
    const date = new Date(number < 100_000_000_000 ? number * 1000 : number);
    return Number.isFinite(date.getTime()) ? date.toISOString() : null;
  }

  private isRecord(value: unknown): value is JsonRecord {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  private isRetryable(error: unknown): boolean {
    return !(error instanceof UnauthorizedException || error instanceof ForbiddenException);
  }
}
