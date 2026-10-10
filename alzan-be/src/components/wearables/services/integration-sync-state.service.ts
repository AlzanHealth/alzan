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
    const now = new Date().toISOString();
    const { error } = await this.supabaseAdminService.client.rpc('upsert_integration_sync_state', {
      p_user_id: input.userId,
      p_provider: input.provider,
      p_source_channel: input.sourceChannel,
      p_source_package: input.sourcePackage as string,
      p_sync_domain: input.syncDomain,
      p_cursor_token: (input.cursorToken ?? null) as string,
      p_anchor_token: (input.anchorToken ?? null) as string,
      p_last_record_at: (input.lastRecordAt ?? null) as string,
      p_status: input.status ?? 'success',
      p_last_error: (input.lastError ?? null) as string,
      p_metadata: this.toJson(input.metadata),
      p_attempted_at: now,
    });
    if (error) throw new BadRequestException('SYNC_STATE_UPSERT_FAILED');
  }

  public async markFailed(input: SyncStateIdentity, errorMessage: string): Promise<void> {
    await this.saveState({ ...input, status: 'error', lastError: errorMessage });
  }

  public async getCursor(input: SyncStateIdentity): Promise<string | null> {
    let query = this.supabaseAdminService.client
      .from('integration_sync_state')
      .select('cursor_token')
      .eq('user_id', input.userId)
      .eq('provider', input.provider)
      .eq('source_channel', input.sourceChannel)
      .eq('sync_domain', input.syncDomain);
    query = input.sourcePackage ? query.eq('source_package', input.sourcePackage) : query.is('source_package', null);
    const { data, error } = await query.maybeSingle();
    if (error) throw new BadRequestException('SYNC_STATE_LOOKUP_FAILED');
    return data?.cursor_token ?? null;
  }

  private toJson(value: Record<string, unknown> | null | undefined): Json | null {
    if (!value) return null;
    return value as Json;
  }
}
