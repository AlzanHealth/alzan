import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  PayloadTooLargeException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SupabaseAdminService } from '../../../core/supabase/supabase.service';
import { verifyCorosWebhookCredentials } from '../../providers/oauth/coros-security';
import { CorosWorkoutPushDto } from '../dto/coros-webhook.dto';
import { CorosCloudSyncService } from './coros-cloud-sync.service';
import { assertCorosWebhookPayloadSize } from './coros-api.utils';
import { RawPayloadService } from './raw-payload.service';

const MAX_COROS_WEBHOOK_BYTES = 2 * 1024 * 1024;

@Injectable()
export class CorosWebhookService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CorosWebhookService.name);
  private drainTimer: NodeJS.Timeout | null = null;
  private draining = false;

  constructor(
    private readonly configService: ConfigService,
    private readonly supabaseAdminService: SupabaseAdminService,
    private readonly rawPayloadService: RawPayloadService,
    private readonly corosCloudSyncService: CorosCloudSyncService,
  ) {}

  public onModuleInit(): void {
    this.drainTimer = setInterval(() => void this.drainQueue(), 60_000);
    this.drainTimer.unref();
    void this.drainQueue();
  }

  public onModuleDestroy(): void {
    if (this.drainTimer) clearInterval(this.drainTimer);
  }

  public authenticate(actualClient: string | undefined, actualSecret: string | undefined): void {
    const valid = verifyCorosWebhookCredentials({
      actualClient,
      actualSecret,
      expectedClient: this.configService.get<string>('COROS_WEBHOOK_CLIENT') || '',
      expectedSecret: this.configService.get<string>('COROS_WEBHOOK_SECRET') || '',
    });
    if (!valid) throw new UnauthorizedException('COROS_WEBHOOK_AUTHENTICATION_FAILED');
  }

  public async enqueue(body: CorosWorkoutPushDto): Promise<void> {
    try {
      assertCorosWebhookPayloadSize(body, MAX_COROS_WEBHOOK_BYTES);
    } catch {
      throw new PayloadTooLargeException('COROS_WEBHOOK_PAYLOAD_TOO_LARGE');
    }
    for (const summary of body.sportDataList) {
      const openId = this.readIdentifier(summary.openId);
      const labelId = this.readIdentifier(summary.labelId);
      if (!openId || !labelId) continue;
      const { data: connection, error } = await this.supabaseAdminService.client
        .from('user_connections')
        .select('id, user_id')
        .eq('provider', 'coros')
        .eq('provider_user_id', openId)
        .eq('status', 'active')
        .maybeSingle();
      if (error) throw error;
      if (!connection) {
        this.logger.warn('Ignored COROS webhook for an unknown connection');
        continue;
      }
      const stored = await this.rawPayloadService.storeRawPayload({
        userId: connection.user_id,
        provider: 'coros',
        sourceChannel: 'cloud',
        sourcePackage: null,
        objectType: 'coros_workout_push',
        sourceRecordId: labelId,
        payload: summary,
        traceId: null,
      });
      if (!stored.id) {
        throw new ServiceUnavailableException('COROS_WEBHOOK_PERSISTENCE_FAILED');
      }
    }
    void this.drainQueue();
  }

  public async drainQueue(): Promise<void> {
    if (this.draining) return;
    this.draining = true;
    try {
      const { data: events, error } = await this.supabaseAdminService.client
        .from('external_raw_payloads_v2')
        .select('id, user_id, payload')
        .eq('provider', 'coros')
        .eq('source_channel', 'cloud')
        .eq('object_type', 'coros_workout_push')
        .is('processed_at', null)
        .order('received_at', { ascending: true })
        .limit(100);
      if (error) throw error;

      for (const event of events ?? []) {
        try {
          if (!this.isRecord(event.payload)) {
            this.logger.warn('Deferred a queued COROS webhook with an invalid stored payload');
            continue;
          }
          const result = await this.corosCloudSyncService.syncWorkoutPush(event.user_id, event.payload);
          if (result.status === 'running' || result.status === 'failed') continue;
          const { data: connection } = await this.supabaseAdminService.client
            .from('user_connections')
            .select('id')
            .eq('user_id', event.user_id)
            .eq('provider', 'coros')
            .maybeSingle();
          const { error: updateError } = await this.supabaseAdminService.client
            .from('external_raw_payloads_v2')
            .update({
              processed_at: new Date().toISOString(),
              related_table: 'user_connections',
              related_id: connection?.id ?? null,
            })
            .eq('id', event.id);
          if (updateError) throw updateError;
        } catch (syncError) {
          this.logger.warn('Deferred a queued COROS webhook after sync failure', syncError as Error);
        }
      }
    } catch (error) {
      this.logger.error('Failed to drain durable COROS webhook queue', error as Error);
    } finally {
      this.draining = false;
    }
  }

  private readIdentifier(value: unknown): string | null {
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) return String(Math.round(value));
    return null;
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
}
