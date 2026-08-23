import { createHash } from 'crypto';
import { Injectable, InternalServerErrorException, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SupabaseAdminService } from '../../../core/supabase/supabase.service';
import { CorosOAuthService } from '../../providers/oauth/coros-oauth.service';
import { decryptCorosToken } from '../../providers/oauth/coros-security';

type RolloutMode = 'disabled' | 'pilot' | 'public';

@Injectable()
export class CorosConnectionService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CorosConnectionService.name);
  private retryTimer: NodeJS.Timeout | null = null;
  private retrying = false;

  constructor(
    private readonly configService: ConfigService,
    private readonly supabaseAdminService: SupabaseAdminService,
    private readonly corosOAuthService: CorosOAuthService,
  ) {}

  public onModuleInit(): void {
    this.retryTimer = setInterval(() => void this.retryDeauthorizations(), 10 * 60_000);
    this.retryTimer.unref();
    void this.retryDeauthorizations();
  }

  public onModuleDestroy(): void {
    if (this.retryTimer) clearInterval(this.retryTimer);
  }

  public capability(userId: string): { enabled: boolean; mode: RolloutMode } {
    const configuredMode = this.configService.get<string>('COROS_ROLLOUT_MODE')?.trim().toLowerCase();
    const mode: RolloutMode = configuredMode === 'public' || configuredMode === 'pilot' ? configuredMode : 'disabled';
    return {
      enabled: this.corosOAuthService.isConfigured() && this.corosOAuthService.isUserAllowed(userId),
      mode,
    };
  }

  public async disconnect(userId: string): Promise<{ disconnected: boolean; remoteDeauthorizationPending: boolean }> {
    const { data: connection, error: connectionError } = await this.supabaseAdminService.client
      .from('user_connections')
      .select('id')
      .eq('user_id', userId)
      .eq('provider', 'coros')
      .maybeSingle();
    if (connectionError) throw new InternalServerErrorException('COROS_CONNECTION_READ_FAILED');

    let remoteDeauthorizationPending = false;
    if (connection) {
      const { data: token, error: tokenError } = await this.supabaseAdminService.client
        .from('provider_connection_tokens')
        .select('access_token')
        .eq('connection_id', connection.id)
        .maybeSingle();
      if (tokenError) throw new InternalServerErrorException('COROS_TOKEN_READ_FAILED');
      if (token?.access_token) {
        try {
          await this.corosOAuthService.deregisterUser(this.decryptToken(token.access_token));
        } catch (error) {
          remoteDeauthorizationPending = true;
          try {
            await this.enqueueDeauthorization(userId, token.access_token, error);
          } catch (enqueueError) {
            this.logger.error('Failed to durably queue COROS remote deauthorization; local deletion aborted', {
              error: this.errorMessage(enqueueError),
              userReferenceHash: createHash('sha256').update(userId).digest('hex'),
            });
            throw enqueueError;
          }
        }
      }
    }

    const { error: deleteError } = await this.supabaseAdminService.client.rpc('delete_coros_user_data', {
      p_user_id: userId,
    });
    if (deleteError) throw new InternalServerErrorException('COROS_LOCAL_DATA_DELETE_FAILED');
    return { disconnected: true, remoteDeauthorizationPending };
  }

  public async retryDeauthorizations(): Promise<void> {
    if (this.retrying) return;
    this.retrying = true;
    try {
      const now = new Date().toISOString();
      await this.supabaseAdminService.client
        .from('provider_deauthorization_jobs')
        .delete()
        .eq('provider', 'coros')
        .lte('expires_at', now);

      const { data: jobs, error } = await this.supabaseAdminService.client
        .from('provider_deauthorization_jobs')
        .select('id, encrypted_access_token, attempts')
        .eq('provider', 'coros')
        .gt('expires_at', now)
        .lte('next_attempt_at', now)
        .lt('attempts', 10)
        .order('next_attempt_at', { ascending: true })
        .limit(25);
      if (error) throw error;

      for (const job of jobs ?? []) {
        try {
          await this.corosOAuthService.deregisterUser(this.decryptToken(job.encrypted_access_token));
          await this.supabaseAdminService.client.from('provider_deauthorization_jobs').delete().eq('id', job.id);
        } catch (retryError) {
          const attempts = job.attempts + 1;
          const delayMinutes = Math.min(2 ** attempts, 240);
          await this.supabaseAdminService.client
            .from('provider_deauthorization_jobs')
            .update({
              attempts,
              next_attempt_at: new Date(Date.now() + delayMinutes * 60_000).toISOString(),
              last_error: this.errorMessage(retryError),
              updated_at: new Date().toISOString(),
            })
            .eq('id', job.id);
        }
      }
    } catch (error) {
      this.logger.error('Failed to process COROS deauthorization retries', error as Error);
    } finally {
      this.retrying = false;
    }
  }

  private async enqueueDeauthorization(userId: string, encryptedAccessToken: string, error: unknown): Promise<void> {
    const { error: insertError } = await this.supabaseAdminService.client.from('provider_deauthorization_jobs').insert({
      provider: 'coros',
      user_reference_hash: createHash('sha256').update(userId).digest('hex'),
      encrypted_access_token: encryptedAccessToken,
      attempts: 1,
      next_attempt_at: new Date(Date.now() + 2 * 60_000).toISOString(),
      expires_at: new Date(Date.now() + 24 * 60 * 60_000).toISOString(),
      last_error: this.errorMessage(error),
    });
    if (insertError) throw new InternalServerErrorException('COROS_DEAUTHORIZATION_RETRY_ENQUEUE_FAILED');
  }

  private decryptToken(value: string): string {
    const key = this.configService.get<string>('COROS_TOKEN_ENCRYPTION_KEY_V1');
    if (!key) throw new InternalServerErrorException('COROS_TOKEN_ENCRYPTION_KEY_MISSING');
    return decryptCorosToken(value, key);
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : 'COROS_DEAUTHORIZATION_FAILED';
  }
}
