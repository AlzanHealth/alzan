import {
  BadGatewayException,
  Injectable,
  InternalServerErrorException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { SupabaseAdminService } from '../../../core/supabase/supabase.service';
import { parseActivityFileToCanonical } from '../../activity-import/parsers/activity-import-canonical.parser';
import { CanonicalProvenance } from '../domain/wearable.types';
import { CanonicalActivityWriterService } from './canonical-activity-writer.service';
import { IntegrationSyncStateService } from './integration-sync-state.service';
import { RawPayloadService } from './raw-payload.service';
import { WearableImportLifecycleService, WEARABLE_SYNC_CANCEL_REQUESTED } from './wearable-import-lifecycle.service';

type JsonRecord = Record<string, unknown>;
type ProviderTokenRow = {
  connectionId: string;
  accessToken: string;
  refreshToken: string | null;
  expiresAt: string | null;
};

const POLAR_REQUEST_TIMEOUT_MS = 30_000;

export interface PolarSyncResult {
  provider: 'polar';
  jobId: string;
  status: 'running' | 'success' | 'partial';
  retryAfterAt?: string | null;
  cancelled: boolean;
  activitiesImported: number;
  lastSuccessAt: string | null;
}

@Injectable()
export class PolarAccessLinkService {
  private readonly apiBaseUrl = 'https://www.polaraccesslink.com';
  private readonly tokenUrl = 'https://polarremote.com/v2/oauth2/token';

  constructor(
    private readonly configService: ConfigService,
    private readonly supabaseAdminService: SupabaseAdminService,
    private readonly rawPayloadService: RawPayloadService,
    private readonly syncStateService: IntegrationSyncStateService,
    private readonly activityWriterService: CanonicalActivityWriterService,
    private readonly importLifecycleService: WearableImportLifecycleService,
  ) {}

  public async syncActivities(userId: string): Promise<PolarSyncResult> {
    const job = await this.importLifecycleService.claimSyncJob({
      userId,
      provider: 'polar',
      syncDomain: 'activities',
      leaseSeconds: 1800,
    });
    if (job.action === 'active') {
      return {
        provider: 'polar',
        jobId: job.jobId,
        status: 'running',
        cancelled: false,
        retryAfterAt: job.retryAfterAt,
        activitiesImported: 0,
        lastSuccessAt: null,
      };
    }
    const stopHeartbeat = this.startLeaseHeartbeat(job.jobId, job.leaseToken);
    let activitiesImported = 0;
    try {
      const token = await this.getUsableToken(userId, job.jobId);
      if (await this.importLifecycleService.isSyncCancellationRequested(job.jobId)) {
        return this.finishCancelled(job.jobId, job.leaseToken, 0);
      }
      const summaries = await this.fetchExerciseSummaries(token.accessToken, job.jobId);
      for (const summary of summaries) {
        if (await this.importLifecycleService.isSyncCancellationRequested(job.jobId)) {
          return this.finishCancelled(job.jobId, job.leaseToken, activitiesImported);
        }
        const detail = await this.fetchExerciseDetail(token.accessToken, summary, job.jobId);
        if (!detail) continue;
        await this.importExercise(userId, detail);
        activitiesImported += 1;
      }
      if (await this.importLifecycleService.isSyncCancellationRequested(job.jobId)) {
        return this.finishCancelled(job.jobId, job.leaseToken, activitiesImported);
      }
      const lastSuccessAt = new Date().toISOString();
      await this.markConnectionSuccess(userId, lastSuccessAt);
      await this.syncStateService.saveState({
        userId,
        provider: 'polar',
        sourceChannel: 'cloud',
        sourcePackage: null,
        syncDomain: 'activities',
        cursorToken: null,
        anchorToken: null,
        lastRecordAt: lastSuccessAt,
        status: 'success',
      });
      const cancelledAtFinish = await this.importLifecycleService.finishSyncJob({
        jobId: job.jobId,
        leaseToken: job.leaseToken,
        status: 'success',
        counters: { activitiesImported },
        lastError: null,
      });
      return {
        provider: 'polar',
        jobId: job.jobId,
        status: cancelledAtFinish ? 'partial' : 'success',
        cancelled: cancelledAtFinish,
        activitiesImported,
        lastSuccessAt: cancelledAtFinish ? null : lastSuccessAt,
      };
    } catch (error: unknown) {
      if (await this.importLifecycleService.isSyncCancellationRequested(job.jobId).catch(() => false)) {
        return await this.finishCancelled(job.jobId, job.leaseToken, activitiesImported);
      }
      await this.importLifecycleService
        .finishSyncJob({
          jobId: job.jobId,
          leaseToken: job.leaseToken,
          status: 'error',
          counters: {},
          lastError: this.getErrorMessage(error),
        })
        .catch(() => undefined);
      await this.markConnectionError(userId, this.getErrorMessage(error));
      throw error;
    } finally {
      stopHeartbeat();
      this.importLifecycleService.releaseSyncJob?.(job.jobId);
    }
  }

  private startLeaseHeartbeat(jobId: string, leaseToken: string): () => void {
    const timer = setInterval(() => {
      void this.importLifecycleService.renewSyncJob(jobId, leaseToken).catch(() => undefined);
    }, 60_000);
    timer.unref();
    return () => clearInterval(timer);
  }

  private async finishCancelled(
    jobId: string,
    leaseToken: string,
    activitiesImported: number,
  ): Promise<PolarSyncResult> {
    await this.importLifecycleService.finishSyncJob({
      jobId,
      leaseToken,
      status: 'partial',
      counters: { activitiesImported },
      lastError: WEARABLE_SYNC_CANCEL_REQUESTED,
    });
    return {
      provider: 'polar',
      jobId,
      status: 'partial',
      cancelled: true,
      activitiesImported,
      lastSuccessAt: null,
    };
  }

  private async importExercise(userId: string, exercise: JsonRecord): Promise<void> {
    const sourceRecordId = this.readExerciseId(exercise);
    const rawPayload = await this.rawPayloadService.storeRawPayload({
      userId,
      provider: 'polar',
      sourceChannel: 'cloud',
      sourcePackage: null,
      objectType: 'activity',
      sourceRecordId,
      payload: exercise,
      traceId: null,
    });
    const activity = parseActivityFileToCanonical(JSON.stringify(exercise), 'polar-accesslink-exercise.json');
    const provenance: CanonicalProvenance = {
      provider: 'polar',
      sourceChannel: 'cloud',
      sourcePackage: null,
      sourceProviderKey: 'polar',
      sourceRecordId: sourceRecordId ?? activity.providerActivityId,
      sourceUpdatedAt: null,
      rawPayloadId: rawPayload.id,
    };
    await this.activityWriterService.upsertActivity({ userId, activity, provenance });
  }

  private async fetchExerciseSummaries(accessToken: string, jobId: string): Promise<JsonRecord[]> {
    const response = await this.getPolar<JsonRecord | JsonRecord[]>(
      '/v3/exercises',
      accessToken,
      {
        samples: 'true',
        zones: 'true',
        route: 'true',
      },
      jobId,
    );
    if (Array.isArray(response)) return response.filter(this.isRecord);
    const exercises = response.exercises ?? response.exercise ?? response.data;
    if (Array.isArray(exercises)) return exercises.filter(this.isRecord);
    return [];
  }

  private async fetchExerciseDetail(
    accessToken: string,
    summary: JsonRecord,
    jobId: string,
  ): Promise<JsonRecord | null> {
    const url = this.readString(summary.url);
    const id = this.readExerciseId(summary);
    if (url) {
      return this.getPolarUrl<JsonRecord>(url, accessToken, { samples: 'true', zones: 'true', route: 'true' }, jobId);
    }
    if (!id) return summary;
    return this.getPolar<JsonRecord>(
      `/v3/exercises/${encodeURIComponent(id)}`,
      accessToken,
      {
        samples: 'true',
        zones: 'true',
        route: 'true',
      },
      jobId,
    );
  }

  private async getUsableToken(userId: string, jobId?: string): Promise<ProviderTokenRow> {
    const token = await this.readToken(userId);
    if (!this.isTokenExpired(token.expiresAt)) return token;
    if (!token.refreshToken) throw new UnauthorizedException('POLAR_REFRESH_TOKEN_MISSING');
    return this.refreshToken(userId, token, jobId);
  }

  private async readToken(userId: string): Promise<ProviderTokenRow> {
    const { data: connection, error: connectionError } = await this.supabaseAdminService.client
      .from('user_connections')
      .select('id, status')
      .eq('user_id', userId)
      .eq('provider', 'polar')
      .maybeSingle();
    if (connectionError) throw new InternalServerErrorException('POLAR_CONNECTION_READ_FAILED');
    if (!connection || connection.status !== 'active') throw new UnauthorizedException('POLAR_CONNECTION_REQUIRED');

    const { data: token, error: tokenError } = await this.supabaseAdminService.client
      .from('provider_connection_tokens')
      .select('access_token, refresh_token, token_expires_at')
      .eq('connection_id', connection.id)
      .maybeSingle();
    if (tokenError) throw new InternalServerErrorException('POLAR_TOKEN_READ_FAILED');
    if (!token?.access_token) throw new UnauthorizedException('POLAR_ACCESS_TOKEN_MISSING');
    return {
      connectionId: connection.id,
      accessToken: token.access_token,
      refreshToken: token.refresh_token,
      expiresAt: token.token_expires_at,
    };
  }

  private async refreshToken(userId: string, token: ProviderTokenRow, jobId?: string): Promise<ProviderTokenRow> {
    const clientId = this.configService.get<string>('POLAR_CLIENT_ID');
    const clientSecret = this.configService.get<string>('POLAR_CLIENT_SECRET');
    if (!clientId || !clientSecret) throw new InternalServerErrorException('POLAR_CLIENT_CREDENTIALS_MISSING');
    if (!token.refreshToken) throw new UnauthorizedException('POLAR_REFRESH_TOKEN_MISSING');
    const response = await axios.post(
      this.tokenUrl,
      new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: token.refreshToken,
      }).toString(),
      {
        headers: {
          Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        timeout: POLAR_REQUEST_TIMEOUT_MS,
        signal: jobId ? this.importLifecycleService.getSyncJobSignal?.(jobId) : undefined,
      },
    );
    const data = response.data as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
      token_type?: string;
    };
    if (!data.access_token) throw new BadGatewayException('POLAR_TOKEN_REFRESH_FAILED');
    const expiresAt = new Date(Date.now() + (data.expires_in ?? 3600) * 1000).toISOString();
    const refreshToken = data.refresh_token ?? token.refreshToken;
    await this.supabaseAdminService.client
      .from('provider_connection_tokens')
      .update({
        access_token: data.access_token,
        refresh_token: refreshToken,
        token_type: data.token_type ?? null,
        token_expires_at: expiresAt,
        updated_at: new Date().toISOString(),
      })
      .eq('connection_id', token.connectionId);
    await this.supabaseAdminService.client
      .from('user_connections')
      .update({
        token_expires_at: expiresAt,
        status: 'active',
        last_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', token.connectionId)
      .eq('user_id', userId);
    return {
      connectionId: token.connectionId,
      accessToken: data.access_token,
      refreshToken,
      expiresAt,
    };
  }

  private async getPolar<T>(
    path: string,
    accessToken: string,
    params?: Record<string, string>,
    jobId?: string,
  ): Promise<T> {
    return this.getPolarUrl<T>(`${this.apiBaseUrl}${path}`, accessToken, params, jobId);
  }

  private async getPolarUrl<T>(
    url: string,
    accessToken: string,
    params?: Record<string, string>,
    jobId?: string,
  ): Promise<T> {
    try {
      const response = await axios.get<T>(url, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/json',
        },
        params,
        timeout: POLAR_REQUEST_TIMEOUT_MS,
        signal: jobId ? this.importLifecycleService.getSyncJobSignal?.(jobId) : undefined,
      });
      return response.data;
    } catch (error: unknown) {
      if (axios.isAxiosError(error) && error.response?.status === 429) {
        throw new ServiceUnavailableException('POLAR_RATE_LIMITED');
      }
      if (axios.isAxiosError(error) && (error.response?.status === 401 || error.response?.status === 403)) {
        throw new UnauthorizedException('POLAR_TOKEN_EXPIRED_OR_REVOKED');
      }
      throw new BadGatewayException('POLAR_ACCESSLINK_REQUEST_FAILED');
    }
  }

  private async markConnectionSuccess(userId: string, syncedAt: string): Promise<void> {
    await this.supabaseAdminService.client
      .from('user_connections')
      .update({
        last_synced_at: syncedAt,
        status: 'active',
        last_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId)
      .eq('provider', 'polar');
  }

  private async markConnectionError(userId: string, message: string): Promise<void> {
    await this.supabaseAdminService.client
      .from('user_connections')
      .update({
        status: 'error',
        last_error: message,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId)
      .eq('provider', 'polar');
  }

  private readExerciseId(exercise: JsonRecord): string | null {
    const identifier = this.isRecord(exercise.identifier) ? exercise.identifier : null;
    return (
      this.readString(identifier?.id) ??
      this.readString(exercise.id) ??
      this.readString(exercise['exercise-id']) ??
      this.readString(exercise.exerciseId)
    );
  }

  private isTokenExpired(expiresAt: string | null): boolean {
    if (!expiresAt) return false;
    return new Date(expiresAt).getTime() <= Date.now() + 60000;
  }

  private getErrorMessage(error: unknown): string {
    if (error instanceof Error) return error.message;
    return 'POLAR_SYNC_FAILED';
  }

  private readString(value: unknown): string | null {
    return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
  }

  private isRecord(value: unknown): value is JsonRecord {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
}
