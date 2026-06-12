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

type JsonRecord = Record<string, unknown>;
type ProviderTokenRow = {
  connectionId: string;
  accessToken: string;
  refreshToken: string | null;
  expiresAt: string | null;
};

export interface SuuntoSyncResult {
  provider: 'suunto';
  activitiesImported: number;
  lastSuccessAt: string;
}

const WORKOUT_LOOKBACK_DAYS = 30;
const WORKOUT_LIST_LIMIT = 100;

@Injectable()
export class SuuntoCloudSyncService {
  private readonly apiBaseUrl = 'https://cloudapi.suunto.com';
  private readonly tokenUrl = 'https://cloudapi-oauth.suunto.com/oauth/token';

  constructor(
    private readonly configService: ConfigService,
    private readonly supabaseAdminService: SupabaseAdminService,
    private readonly rawPayloadService: RawPayloadService,
    private readonly syncStateService: IntegrationSyncStateService,
    private readonly activityWriterService: CanonicalActivityWriterService,
  ) {}

  public async syncActivities(userId: string): Promise<SuuntoSyncResult> {
    const token = await this.getUsableToken(userId);
    try {
      const workouts = await this.fetchWorkoutSummaries(token.accessToken);
      let activitiesImported = 0;
      for (const workout of workouts) {
        const workoutKey = this.readWorkoutKey(workout);
        if (!workoutKey) continue;
        await this.importWorkout(userId, token.accessToken, workoutKey, workout);
        activitiesImported += 1;
      }
      const lastSuccessAt = new Date().toISOString();
      await this.markConnectionSuccess(userId, lastSuccessAt);
      await this.syncStateService.saveState({
        userId,
        provider: 'suunto',
        sourceChannel: 'cloud',
        sourcePackage: null,
        syncDomain: 'activities',
        cursorToken: null,
        anchorToken: null,
        lastRecordAt: lastSuccessAt,
        status: 'success',
      });
      return { provider: 'suunto', activitiesImported, lastSuccessAt };
    } catch (error: unknown) {
      await this.markConnectionError(userId, this.getErrorMessage(error));
      throw error;
    }
  }

  private async importWorkout(
    userId: string,
    accessToken: string,
    workoutKey: string,
    summary: JsonRecord,
  ): Promise<void> {
    const rawPayload = await this.rawPayloadService.storeRawPayload({
      userId,
      provider: 'suunto',
      sourceChannel: 'cloud',
      sourcePackage: null,
      objectType: 'activity',
      sourceRecordId: workoutKey,
      payload: summary,
      traceId: null,
    });
    const fitBytes = await this.fetchWorkoutFit(accessToken, workoutKey);
    const activity = parseActivityFileToCanonical(fitBytes, `suunto-${workoutKey}.fit`);
    const provenance: CanonicalProvenance = {
      provider: 'suunto',
      sourceChannel: 'cloud',
      sourcePackage: null,
      sourceProviderKey: 'suunto',
      sourceRecordId: workoutKey,
      sourceUpdatedAt: null,
      rawPayloadId: rawPayload.id,
    };
    await this.activityWriterService.upsertActivity({ userId, activity, provenance });
  }

  private async fetchWorkoutSummaries(accessToken: string): Promise<JsonRecord[]> {
    const since = Date.now() - WORKOUT_LOOKBACK_DAYS * 24 * 60 * 60 * 1000;
    const response = await this.getSuunto<JsonRecord | JsonRecord[]>('/v2/workouts', accessToken, {
      since: String(since),
      limit: String(WORKOUT_LIST_LIMIT),
    });
    if (Array.isArray(response)) return response.filter(this.isRecord);
    const workouts = response.payload ?? response.workouts ?? response.data;
    if (Array.isArray(workouts)) return workouts.filter(this.isRecord);
    return [];
  }

  private async fetchWorkoutFit(accessToken: string, workoutKey: string): Promise<Uint8Array> {
    try {
      const response = await axios.get<ArrayBuffer>(
        `${this.apiBaseUrl}/v2/workout/exportFit/${encodeURIComponent(workoutKey)}`,
        {
          headers: this.buildApiHeaders(accessToken),
          responseType: 'arraybuffer',
        },
      );
      return new Uint8Array(response.data);
    } catch (error: unknown) {
      throw this.toHttpException(error);
    }
  }

  private async getUsableToken(userId: string): Promise<ProviderTokenRow> {
    const token = await this.readToken(userId);
    if (!this.isTokenExpired(token.expiresAt)) return token;
    if (!token.refreshToken) throw new UnauthorizedException('SUUNTO_REFRESH_TOKEN_MISSING');
    return this.refreshToken(userId, token);
  }

  private async readToken(userId: string): Promise<ProviderTokenRow> {
    const { data: connection, error: connectionError } = await this.supabaseAdminService.client
      .from('user_connections')
      .select('id, status')
      .eq('user_id', userId)
      .eq('provider', 'suunto')
      .maybeSingle();
    if (connectionError) throw new InternalServerErrorException('SUUNTO_CONNECTION_READ_FAILED');
    if (!connection || connection.status !== 'active') throw new UnauthorizedException('SUUNTO_CONNECTION_REQUIRED');

    const { data: token, error: tokenError } = await this.supabaseAdminService.client
      .from('provider_connection_tokens')
      .select('access_token, refresh_token, token_expires_at')
      .eq('connection_id', connection.id)
      .maybeSingle();
    if (tokenError) throw new InternalServerErrorException('SUUNTO_TOKEN_READ_FAILED');
    if (!token?.access_token) throw new UnauthorizedException('SUUNTO_ACCESS_TOKEN_MISSING');
    return {
      connectionId: connection.id,
      accessToken: token.access_token,
      refreshToken: token.refresh_token,
      expiresAt: token.token_expires_at,
    };
  }

  private async refreshToken(userId: string, token: ProviderTokenRow): Promise<ProviderTokenRow> {
    const clientId = this.configService.get<string>('SUUNTO_CLIENT_ID');
    const clientSecret = this.configService.get<string>('SUUNTO_CLIENT_SECRET');
    if (!clientId || !clientSecret) throw new InternalServerErrorException('SUUNTO_CLIENT_CREDENTIALS_MISSING');
    if (!token.refreshToken) throw new UnauthorizedException('SUUNTO_REFRESH_TOKEN_MISSING');
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
      },
    );
    const data = response.data as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
      token_type?: string;
    };
    if (!data.access_token) throw new BadGatewayException('SUUNTO_TOKEN_REFRESH_FAILED');
    const expiresAt = new Date(Date.now() + (data.expires_in ?? 86400) * 1000).toISOString();
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

  private async getSuunto<T>(path: string, accessToken: string, params?: Record<string, string>): Promise<T> {
    try {
      const response = await axios.get<T>(`${this.apiBaseUrl}${path}`, {
        headers: {
          ...this.buildApiHeaders(accessToken),
          Accept: 'application/json',
        },
        params,
      });
      return response.data;
    } catch (error: unknown) {
      throw this.toHttpException(error);
    }
  }

  // Suunto Cloud API requires the APIZONE subscription key alongside the user token.
  private buildApiHeaders(accessToken: string): Record<string, string> {
    const subscriptionKey = this.configService.get<string>('SUUNTO_SUBSCRIPTION_KEY');
    if (!subscriptionKey) throw new InternalServerErrorException('SUUNTO_SUBSCRIPTION_KEY_MISSING');
    return {
      Authorization: `Bearer ${accessToken}`,
      'Ocp-Apim-Subscription-Key': subscriptionKey,
    };
  }

  private toHttpException(error: unknown): Error {
    if (axios.isAxiosError(error) && error.response?.status === 429) {
      return new ServiceUnavailableException('SUUNTO_RATE_LIMITED');
    }
    if (axios.isAxiosError(error) && (error.response?.status === 401 || error.response?.status === 403)) {
      return new UnauthorizedException('SUUNTO_TOKEN_EXPIRED_OR_REVOKED');
    }
    return new BadGatewayException('SUUNTO_CLOUDAPI_REQUEST_FAILED');
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
      .eq('provider', 'suunto');
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
      .eq('provider', 'suunto');
  }

  private readWorkoutKey(workout: JsonRecord): string | null {
    return this.readString(workout.workoutKey) ?? this.readString(workout.workoutId) ?? this.readString(workout.key);
  }

  private isTokenExpired(expiresAt: string | null): boolean {
    if (!expiresAt) return false;
    return new Date(expiresAt).getTime() <= Date.now() + 60000;
  }

  private getErrorMessage(error: unknown): string {
    if (error instanceof Error) return error.message;
    return 'SUUNTO_SYNC_FAILED';
  }

  private readString(value: unknown): string | null {
    return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
  }

  private isRecord(value: unknown): value is JsonRecord {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
}
