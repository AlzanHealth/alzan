import { createHash } from 'crypto';
import { Injectable, Logger } from '@nestjs/common';
import { Json } from '../../../types/database.types';
import { SupabaseAdminService } from '../../../core/supabase/supabase.service';
import { RawPayloadInput, RawPayloadLinkInput, StoredRawPayload } from '../domain/wearable.types';

@Injectable()
export class RawPayloadService {
  private readonly logger = new Logger(RawPayloadService.name);

  constructor(private readonly supabaseAdminService: SupabaseAdminService) {}

  public async storeRawPayload(input: RawPayloadInput): Promise<StoredRawPayload> {
    const payloadJson = this.toJson(input.payload);
    const payloadHash = this.hashPayload({
      provider: input.provider,
      sourceChannel: input.sourceChannel,
      sourcePackage: input.sourcePackage,
      objectType: input.objectType,
      sourceRecordId: input.sourceRecordId,
      payload: payloadJson,
    });

    const { data, error } = await this.supabaseAdminService.client
      .from('external_raw_payloads_v2')
      .insert({
        user_id: input.userId,
        provider: input.provider,
        source_channel: input.sourceChannel,
        source_package: input.sourcePackage,
        object_type: input.objectType,
        source_record_id: input.sourceRecordId,
        payload_hash: payloadHash,
        payload: payloadJson,
        size_bytes: Buffer.byteLength(JSON.stringify(payloadJson), 'utf8'),
        trace_id: input.traceId,
      })
      .select('id')
      .single();

    if (error) {
      this.logger.warn({
        err: error,
        provider: input.provider,
        objectType: input.objectType,
        sourceRecordId: input.sourceRecordId,
        message: 'Failed to store wearable raw payload',
      });
      return { id: null, payloadHash };
    }

    return { id: data.id, payloadHash };
  }

  public async linkPayload(input: RawPayloadLinkInput): Promise<void> {
    if (!input.rawPayloadId) return;
    const { error } = await this.supabaseAdminService.client
      .from('external_raw_payloads_v2')
      .update({
        related_table: input.relatedTable,
        related_id: input.relatedId,
        processed_at: new Date().toISOString(),
      })
      .eq('id', input.rawPayloadId);
    if (error) {
      this.logger.warn({
        err: error,
        rawPayloadId: input.rawPayloadId,
        relatedTable: input.relatedTable,
        relatedId: input.relatedId,
        message: 'Failed to link wearable raw payload',
      });
    }
  }

  public hashPayload(value: unknown): string {
    return createHash('sha256').update(this.stableStringify(value)).digest('hex');
  }

  private stableStringify(value: unknown): string {
    if (value === null || typeof value !== 'object') return JSON.stringify(value);
    if (Array.isArray(value)) return `[${value.map(item => this.stableStringify(item)).join(',')}]`;
    const record = value as Record<string, unknown>;
    const body = Object.keys(record)
      .sort()
      .map(key => `${JSON.stringify(key)}:${this.stableStringify(record[key])}`)
      .join(',');
    return `{${body}}`;
  }

  private toJson(value: unknown): Json {
    if (value == null) return null;
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
    if (Array.isArray(value)) return value.map(item => this.toJson(item));
    if (typeof value === 'object') {
      return Object.entries(value as Record<string, unknown>).reduce<Record<string, Json>>(
        (accumulator, [key, item]) => {
          if (item !== undefined) accumulator[key] = this.toJson(item);
          return accumulator;
        },
        {},
      );
    }
    return String(value);
  }
}
