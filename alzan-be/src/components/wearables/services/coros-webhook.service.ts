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
import { assertCorosWebhookPayloadSize, getCorosWebhookFailureState } from './coros-api.utils';
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
        .select('id, user_id, payload, processing_attempts')
        .eq('provider', 'coros')
        .eq('source_channel', 'cloud')
        .eq('object_type', 'coros_workout_push')
        .in('processing_status', ['pending', 'retry'])
        .is('processed_at', null)
        .lte('next_processing_at', new Date().toISOString())
        .order('next_processing_at', { ascending: true })
        .order('received_at', { ascending: true })
        .limit(100);
      if (error) throw error;

      for (const event of events ?? []) {
        try {
          if (!this.isRecord(event.payload)) {
            await this.markDeadLetter(event.id, event.processing_attempts, 'COROS_WEBHOOK_STORED_PAYLOAD_INVALID');
            continue;
          }
          const result = await this.corosCloudSyncService.syncWorkoutPush(event.user_id, event.payload);
          if (result.status === 'running') {
            await this.deferEvent(event.id);
            continue;
          }
          if (result.status === 'failed') {
            await this.markFailure(event.id, event.processing_attempts, 'COROS_ACTIVITY_IMPORT_FAILED');
            continue;
          }
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
              processing_status: 'processed',
              processing_error: null,
              related_table: 'user_connections',
              related_id: connection?.id ?? null,
            })
            .eq('id', event.id);
          if (updateError) throw updateError;
        } catch (syncError) {
          this.logger.warn('Deferred a queued COROS webhook after sync failure', syncError as Error);
          await this.markFailure(event.id, event.processing_attempts, this.errorMessage(syncError));
        }
      }
    } catch (error) {
      this.logger.error('Failed to drain durable COROS webhook queue', error as Error);
    } finally {
      this.draining = false;
    }
  }

  private async deferEvent(eventId: string): Promise<void> {
    const { error } = await this.supabaseAdminService.client
      .from('external_raw_payloads_v2')
      .update({
        processing_status: 'retry',
        next_processing_at: new Date(Date.now() + 60_000).toISOString(),
      })
      .eq('id', eventId);
    if (error) throw error;
  }

  private async markFailure(eventId: string, previousAttempts: number, message: string): Promise<void> {
    const failure = getCorosWebhookFailureState(previousAttempts);
    if (failure.isDeadLetter || !failure.nextAttemptAt) {
      await this.markDeadLetter(eventId, previousAttempts, message);
      return;
    }
    const { error } = await this.supabaseAdminService.client
      .from('external_raw_payloads_v2')
      .update({
        processing_status: 'retry',
        processing_attempts: failure.attempts,
        next_processing_at: failure.nextAttemptAt,
        processing_error: message,
      })
      .eq('id', eventId);
    if (error) throw error;
  }

  private async markDeadLetter(eventId: string, previousAttempts: number, message: string): Promise<void> {
    const { error } = await this.supabaseAdminService.client
      .from('external_raw_payloads_v2')
      .update({
        processing_status: 'dead_letter',
        processing_attempts: Math.max(previousAttempts + 1, 10),
        processing_error: message,
        processed_at: new Date().toISOString(),
      })
      .eq('id', eventId);
    if (error) throw error;
  }

  private readIdentifier(value: unknown): string | null {
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) return String(Math.round(value));
    return null;
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : 'COROS_WEBHOOK_PROCESSING_FAILED';
  }
}
