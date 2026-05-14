import { BadRequestException, Injectable } from '@nestjs/common';
import { Json } from '../../../types/database.types';
import { SupabaseAdminService } from '../../../core/supabase/supabase.service';
import { SourceChannel, SyncDomain, SyncStatus, WearableProvider } from '../domain/wearable.types';

interface SyncStateIdentity {
  userId: string;
  provider: WearableProvider;
  sourceChannel: SourceChannel;
  sourcePackage: string | null;
  syncDomain: SyncDomain;
}

interface SaveSyncStateInput extends SyncStateIdentity {
  cursorToken?: string | null;
  anchorToken?: string | null;
  lastRecordAt?: string | null;
  status?: SyncStatus;
  lastError?: string | null;
  metadata?: Record<string, unknown> | null;
}

@Injectable()
export class IntegrationSyncStateService {
  constructor(private readonly supabaseAdminService: SupabaseAdminService) {}

  public async saveState(input: SaveSyncStateInput): Promise<void> {
    const existingId = await this.findExistingId(input);
    const now = new Date().toISOString();
    const payload = {
      cursor_token: input.cursorToken,
      anchor_token: input.anchorToken,
      last_record_at: input.lastRecordAt,
      status: input.status ?? 'success',
      last_error: input.lastError ?? null,
      metadata: this.toJson(input.metadata),
      last_attempt_at: now,
      last_success_at: input.status === 'error' ? undefined : now,
      updated_at: now,
    };

    if (existingId) {
      const { error } = await this.supabaseAdminService.client
        .from('integration_sync_state')
        .update(payload)
        .eq('id', existingId);
      if (error) throw new BadRequestException('SYNC_STATE_UPDATE_FAILED');
      return;
    }

    const { error } = await this.supabaseAdminService.client.from('integration_sync_state').insert({
      user_id: input.userId,
      provider: input.provider,
      source_channel: input.sourceChannel,
      source_package: input.sourcePackage,
      sync_domain: input.syncDomain,
      ...payload,
    });
    if (error) throw new BadRequestException('SYNC_STATE_INSERT_FAILED');
  }

  public async markFailed(input: SyncStateIdentity, errorMessage: string): Promise<void> {
    await this.saveState({ ...input, status: 'error', lastError: errorMessage });
  }

  private async findExistingId(input: SyncStateIdentity): Promise<string | null> {
    let query = this.supabaseAdminService.client
      .from('integration_sync_state')
      .select('id')
      .eq('user_id', input.userId)
      .eq('provider', input.provider)
      .eq('source_channel', input.sourceChannel)
      .eq('sync_domain', input.syncDomain);
    query = input.sourcePackage ? query.eq('source_package', input.sourcePackage) : query.is('source_package', null);
    const { data, error } = await query.maybeSingle();
    if (error) throw new BadRequestException('SYNC_STATE_READ_FAILED');
    return data?.id ?? null;
  }

  private toJson(value: Record<string, unknown> | null | undefined): Json | null {
    if (!value) return null;
    return value as Json;
  }
}
