import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Json } from '../../../types/database.types';
import { SupabaseAdminService } from '../../../core/supabase/supabase.service';
import { ProviderOrigin, ProviderOriginInput } from '../domain/wearable.types';

type ProviderOriginRow = {
  id: string;
  user_id: string;
  source_channel: string;
  provider: ProviderOrigin['provider'];
  source_package: string | null;
  source_provider_key: string | null;
  display_name: string | null;
  platform: string | null;
  last_seen_at: string;
};

@Injectable()
export class ProviderOriginService {
  constructor(private readonly supabaseAdminService: SupabaseAdminService) {}

  public async upsertOrigin(input: ProviderOriginInput): Promise<ProviderOrigin> {
    const existing = await this.findExistingOrigin(input);
    const now = new Date().toISOString();
    if (existing) {
      const { data, error } = await this.supabaseAdminService.client
        .from('provider_data_origins')
        .update({
          source_provider_key: input.sourceProviderKey,
          display_name: input.displayName,
          platform: input.platform,
          raw_payload: this.toJson(input.rawPayload),
          last_seen_at: now,
          updated_at: now,
        })
        .eq('id', existing.id)
        .select(
          'id,user_id,source_channel,provider,source_package,source_provider_key,display_name,platform,last_seen_at',
        )
        .single();
      if (error) throw new BadRequestException('PROVIDER_ORIGIN_UPDATE_FAILED');
      return this.toProviderOrigin(data);
    }

    const { data, error } = await this.supabaseAdminService.client
      .from('provider_data_origins')
      .insert({
        user_id: input.userId,
        source_channel: input.sourceChannel,
        provider: input.provider,
        source_package: input.sourcePackage,
        source_provider_key: input.sourceProviderKey,
        display_name: input.displayName,
        platform: input.platform,
        raw_payload: this.toJson(input.rawPayload),
      })
      .select(
        'id,user_id,source_channel,provider,source_package,source_provider_key,display_name,platform,last_seen_at',
      )
      .single();
    if (error) throw new BadRequestException('PROVIDER_ORIGIN_INSERT_FAILED');
    return this.toProviderOrigin(data);
  }

  public async listOrigins(userId: string, sourceChannel?: string): Promise<ProviderOrigin[]> {
    let query = this.supabaseAdminService.client
      .from('provider_data_origins')
      .select(
        'id,user_id,source_channel,provider,source_package,source_provider_key,display_name,platform,last_seen_at',
      )
      .eq('user_id', userId)
      .order('last_seen_at', { ascending: false });
    if (sourceChannel) query = query.eq('source_channel', sourceChannel);
    const { data, error } = await query;
    if (error) throw new BadRequestException('PROVIDER_ORIGIN_LIST_FAILED');
    return data.map(row => this.toProviderOrigin(row));
  }

  public async selectHealthConnectOrigin(userId: string, originId: string): Promise<ProviderOrigin> {
    const { data: origin, error: originError } = await this.supabaseAdminService.client
      .from('provider_data_origins')
      .select(
        'id,user_id,source_channel,provider,source_package,source_provider_key,display_name,platform,last_seen_at',
      )
      .eq('id', originId)
      .eq('user_id', userId)
      .eq('source_channel', 'health_connect')
      .eq('provider', 'health_connect')
      .single();
    if (originError || !origin) throw new NotFoundException('HEALTH_CONNECT_ORIGIN_NOT_FOUND');
    if (!origin.source_package) throw new BadRequestException('HEALTH_CONNECT_ORIGIN_PACKAGE_REQUIRED');

    const { error: selectionError } = await this.supabaseAdminService.client
      .from('health_connect_provider_selection')
      .upsert(
        {
          user_id: userId,
          origin_id: origin.id,
          selected_package_name: origin.source_package,
          selected_provider_key: origin.source_provider_key,
          selected_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' },
      );
    if (selectionError) throw new BadRequestException('HEALTH_CONNECT_ORIGIN_SELECTION_FAILED');
    return this.toProviderOrigin(origin);
  }

  public async getHealthConnectSelection(userId: string): Promise<ProviderOrigin | null> {
    const { data, error } = await this.supabaseAdminService.client
      .from('health_connect_provider_selection')
      .select('origin_id')
      .eq('user_id', userId)
      .maybeSingle();
    if (error) throw new BadRequestException('HEALTH_CONNECT_SELECTION_READ_FAILED');
    if (!data?.origin_id) return null;

    const { data: origin, error: originError } = await this.supabaseAdminService.client
      .from('provider_data_origins')
      .select(
        'id,user_id,source_channel,provider,source_package,source_provider_key,display_name,platform,last_seen_at',
      )
      .eq('id', data.origin_id)
      .eq('user_id', userId)
      .maybeSingle();
    if (originError) throw new BadRequestException('HEALTH_CONNECT_SELECTION_ORIGIN_READ_FAILED');
    return origin ? this.toProviderOrigin(origin) : null;
  }

  private async findExistingOrigin(input: ProviderOriginInput): Promise<ProviderOriginRow | null> {
    let query = this.supabaseAdminService.client
      .from('provider_data_origins')
      .select(
        'id,user_id,source_channel,provider,source_package,source_provider_key,display_name,platform,last_seen_at',
      )
      .eq('user_id', input.userId)
      .eq('source_channel', input.sourceChannel)
      .eq('provider', input.provider);
    query = input.sourcePackage ? query.eq('source_package', input.sourcePackage) : query.is('source_package', null);
    query = input.sourceProviderKey
      ? query.eq('source_provider_key', input.sourceProviderKey)
      : query.is('source_provider_key', null);
    const { data, error } = await query.maybeSingle();
    if (error) throw new BadRequestException('PROVIDER_ORIGIN_READ_FAILED');
    return data;
  }

  private toProviderOrigin(row: ProviderOriginRow): ProviderOrigin {
    return {
      id: row.id,
      userId: row.user_id,
      sourceChannel: row.source_channel,
      provider: row.provider,
      sourcePackage: row.source_package,
      sourceProviderKey: row.source_provider_key,
      displayName: row.display_name,
      platform: row.platform,
      lastSeenAt: row.last_seen_at,
    };
  }

  private toJson(value: Record<string, unknown> | null): Json | null {
    if (!value) return null;
    return value as Json;
  }
}
