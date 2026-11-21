import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createHash } from 'crypto';
import { gunzipSync, gzipSync } from 'zlib';
import { Row } from '../../../types/requests.types';
import { SupabaseAdminService } from '../../../core/supabase/supabase.service';

const ARCHIVE_BUCKET = 'activity-stream-archives';
const ARCHIVE_MINIMUM_AGE_DAYS = 90;
const ARCHIVE_STORAGE_BUDGET_BYTES = 512 * 1024 * 1024;
const MAX_ARCHIVE_FILE_BYTES = 50 * 1024 * 1024;
const SAMPLE_PAGE_SIZE = 1000;
const ARCHIVE_FORMAT_VERSION = 2;
const ARCHIVED_STREAM_TYPES = ['heart_rate', 'speed', 'power'] as const;
type ArchivedStreamType = (typeof ARCHIVED_STREAM_TYPES)[number];

type ActivityStreamSampleRow = Row<'activity_stream_samples'>;
type ActivityStreamSourceRow = Pick<ActivityStreamSampleRow, 'id' | 'stream_type' | 'timestamp' | 'offset_s' | 'value'>;
type ActivityStreamArchiveManifest = Row<'activity_stream_archives'>;
type ArchiveSession = Pick<Row<'activity_sessions'>, 'id' | 'user_id' | 'start_time'>;
type ArchiveSample = Pick<ActivityStreamSourceRow, 'stream_type' | 'timestamp' | 'offset_s' | 'value'> & {
  stream_type: ArchivedStreamType;
};
type ArchivePayloadV2 = {
  archive_version: 2;
  session_id: string;
  user_id: string;
  sample_count: number;
  source_sample_count: number;
  source_sample_ids_md5: string;
  samples: ArchiveSample[];
};
type ArchivePayloadV1 = {
  archive_version: 1;
  session_id: string;
  user_id: string;
  sample_count: number;
  samples: ActivityStreamSampleRow[];
};
type VerifiedArchivePayload = ArchivePayloadV1 | ArchivePayloadV2;
type PreparedArchive = {
  payload: ArchivePayloadV2 | null;
  compressed: Buffer | null;
  checksum: string | null;
  sourceSampleCount: number;
  idsMd5: string;
  discardedSampleCount: number;
  uncompressedBytes: number;
};
export type ActivityStreamArchiveRunSummary = {
  effective_before: string;
  minimum_age_days: number;
  eligible_sessions: number;
  archived_sessions: number;
  cleaned_duplicate_sessions: number;
  already_archived_sessions: number;
  empty_sessions: number;
  changed_during_archive_sessions: number;
  duplicate_live_sessions: number;
  duplicate_sample_count: number;
  source_sample_count: number;
  archived_sample_count: number;
  discarded_sample_count: number;
  sessions_without_cardio_samples: number;
  discarded_only_sessions: number;
  uncompressed_bytes: number;
  compressed_bytes: number;
  existing_archive_bytes: number;
  pending_cleanup_objects: number;
  cleaned_archive_objects: number;
};
export type ArchivedActivityStreamSample = {
  session_id: string;
  stream_type: string;
  offset_s: number | null;
  timestamp: string | null;
  value: number;
};
export type ReadArchivedActivityStreamsResult = {
  archived_session_ids: string[];
  samples: ArchivedActivityStreamSample[];
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const hasOnlyKeys = (record: Record<string, unknown>, keys: readonly string[]): boolean =>
  Object.keys(record).every(key => keys.includes(key));

const isArchivedStreamType = (value: unknown): value is ArchivedStreamType =>
  typeof value === 'string' && (ARCHIVED_STREAM_TYPES as readonly string[]).includes(value);

const isAppConsumedCardioSample = (
  sample: ActivityStreamSourceRow,
): sample is ActivityStreamSourceRow & { stream_type: ArchivedStreamType } =>
  isArchivedStreamType(sample.stream_type) &&
  (sample.timestamp !== null || sample.offset_s !== null) &&
  (sample.timestamp === null || Number.isFinite(Date.parse(sample.timestamp))) &&
  (sample.offset_s === null || (Number.isInteger(sample.offset_s) && sample.offset_s >= 0)) &&
  Number.isFinite(sample.value);

const isArchiveSample = (value: unknown): value is ArchiveSample => {
  if (!isRecord(value)) return false;
  return (
    hasOnlyKeys(value, ['stream_type', 'timestamp', 'offset_s', 'value']) &&
    isArchivedStreamType(value.stream_type) &&
    (typeof value.timestamp === 'string' || value.timestamp === null) &&
    (typeof value.offset_s === 'number' || value.offset_s === null) &&
    (value.timestamp !== null || value.offset_s !== null) &&
    (value.timestamp === null || Number.isFinite(Date.parse(value.timestamp))) &&
    (value.offset_s === null || (Number.isInteger(value.offset_s) && value.offset_s >= 0)) &&
    typeof value.value === 'number' &&
    Number.isFinite(value.value)
  );
};

const isLegacyStreamSampleRow = (
  value: unknown,
  sessionId: string,
  userId: string,
): value is ActivityStreamSampleRow => {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === 'string' &&
    value.session_id === sessionId &&
    value.user_id === userId &&
    typeof value.stream_type === 'string' &&
    (typeof value.timestamp === 'string' || value.timestamp === null) &&
    (typeof value.offset_s === 'number' || value.offset_s === null) &&
    (value.timestamp !== null || value.offset_s !== null) &&
    typeof value.value === 'number' &&
    Number.isFinite(value.value) &&
    typeof value.created_at === 'string'
  );
};

@Injectable()
export class ActivityStreamArchiveService {
  private readonly logger = new Logger(ActivityStreamArchiveService.name);

  constructor(private readonly supabaseAdminService: SupabaseAdminService) {}

  public async previewBefore(requestedBefore?: Date): Promise<ActivityStreamArchiveRunSummary> {
    const effectiveBefore = this.getEffectiveBefore(requestedBefore);
    const sessions = await this.listEligibleSessions(effectiveBefore);
    let summary = this.emptySummary(effectiveBefore, sessions.length);

    for (const session of sessions) {
      const existing = await this.getManifest(session.id, session.user_id);
      if (existing) {
        const isDuplicate = await this.hasExactArchivedDuplicate(session, existing);
        summary = isDuplicate
          ? {
              ...summary,
              duplicate_live_sessions: summary.duplicate_live_sessions + 1,
              duplicate_sample_count: summary.duplicate_sample_count + existing.sample_count,
            }
          : { ...summary, already_archived_sessions: summary.already_archived_sessions + 1 };
        continue;
      }
      const prepared = await this.prepareArchive(session);
      if (!prepared) {
        summary = { ...summary, empty_sessions: summary.empty_sessions + 1 };
        continue;
      }
      summary = this.addPreparedArchive(summary, prepared);
    }

    return { ...summary, pending_cleanup_objects: await this.getPendingCleanupCount() };
  }

  public async archiveBefore(requestedBefore?: Date): Promise<ActivityStreamArchiveRunSummary> {
    const cleanup = await this.processPendingCleanupQueue();
    if (cleanup.failed > 0) throw new ServiceUnavailableException('ACTIVITY_STREAM_ARCHIVE_CLEANUP_FAILED');
    const preview = await this.previewBefore(requestedBefore);
    const existingArchiveBytes = await this.getExistingArchiveBytes();
    if (existingArchiveBytes + preview.compressed_bytes > ARCHIVE_STORAGE_BUDGET_BYTES) {
      throw new ServiceUnavailableException('ACTIVITY_STREAM_ARCHIVE_STORAGE_BUDGET_EXCEEDED');
    }

    const effectiveBefore = new Date(preview.effective_before);
    const sessions = await this.listEligibleSessions(effectiveBefore);
    let summary = {
      ...preview,
      cleaned_duplicate_sessions: 0,
      existing_archive_bytes: existingArchiveBytes,
      cleaned_archive_objects: cleanup.cleaned,
    };

    for (const session of sessions) {
      const existing = await this.getManifest(session.id, session.user_id);
      if (existing) {
        if (await this.deleteExactArchivedDuplicate(session, existing)) {
          summary = { ...summary, cleaned_duplicate_sessions: summary.cleaned_duplicate_sessions + 1 };
        }
        continue;
      }
      const prepared = await this.prepareArchive(session);
      if (!prepared) continue;
      if (!prepared.payload) {
        const deleted = await this.deleteSourceSamples(session, prepared.sourceSampleCount, prepared.idsMd5);
        summary = deleted
          ? { ...summary, discarded_only_sessions: summary.discarded_only_sessions + 1 }
          : { ...summary, changed_during_archive_sessions: summary.changed_during_archive_sessions + 1 };
        continue;
      }
      const result = await this.persistArchive(session, prepared);
      if (result === 'archived') {
        summary = { ...summary, archived_sessions: summary.archived_sessions + 1 };
      } else if (result === 'changed') {
        summary = { ...summary, changed_during_archive_sessions: summary.changed_during_archive_sessions + 1 };
      }
    }

    return summary;
  }

  public async readForUser(userId: string, sessionIds: string[]): Promise<ReadArchivedActivityStreamsResult> {
    if (sessionIds.length === 0) return { archived_session_ids: [], samples: [] };
    const { data: manifests, error } = await this.supabaseAdminService.client
      .from('activity_stream_archives')
      .select(
        'session_id, user_id, object_path, sample_count, compressed_bytes, sha256, archive_version, source_sample_count, source_sample_ids_md5, archived_at',
      )
      .eq('user_id', userId)
      .in('session_id', sessionIds);
    if (error) throw new InternalServerErrorException('ACTIVITY_STREAM_ARCHIVE_MANIFEST_READ_FAILED');

    const samples: ArchivedActivityStreamSample[] = [];
    const archivedSessionIds: string[] = [];
    for (const manifest of manifests ?? []) {
      const payload = await this.downloadAndVerifyArchive(manifest, userId);
      archivedSessionIds.push(manifest.session_id);
      samples.push(
        ...this.mergeCardioSamples(
          this.getArchiveCardioSamples(payload),
          await this.loadCardioSamples(userId, manifest.session_id),
        ),
      );
    }
    return { archived_session_ids: archivedSessionIds, samples };
  }

  private async loadCardioSamples(userId: string, sessionId: string): Promise<ArchivedActivityStreamSample[]> {
    const samples: ArchivedActivityStreamSample[] = [];
    for (let page = 0; ; page += 1) {
      const start = page * SAMPLE_PAGE_SIZE;
      const { data, error } = await this.supabaseAdminService.client
        .from('activity_stream_samples')
        .select('session_id, stream_type, offset_s, timestamp, value')
        .eq('user_id', userId)
        .eq('session_id', sessionId)
        .in('stream_type', ['heart_rate', 'speed', 'power'])
        .order('id', { ascending: true })
        .range(start, start + SAMPLE_PAGE_SIZE - 1);
      if (error) throw new InternalServerErrorException('ACTIVITY_STREAM_ARCHIVE_LIVE_SAMPLE_READ_FAILED');
      const pageSamples = (data ?? []).map(sample => ({ ...sample }));
      samples.push(...pageSamples);
      if (pageSamples.length < SAMPLE_PAGE_SIZE) return samples;
    }
  }

  private mergeCardioSamples(
    archiveRows: ArchivedActivityStreamSample[],
    liveRows: ArchivedActivityStreamSample[],
  ): ArchivedActivityStreamSample[] {
    const merged: ArchivedActivityStreamSample[] = [];
    const indexByOffset = new Map<string, number>();
    const indexByTimestamp = new Map<string, number>();
    const addSample = (sample: ArchivedActivityStreamSample): void => {
      const offsetKey = sample.offset_s === null ? null : `${sample.stream_type}:offset:${sample.offset_s}`;
      const timestampKey = sample.timestamp === null ? null : `${sample.stream_type}:timestamp:${sample.timestamp}`;
      const existingIndex =
        (offsetKey ? indexByOffset.get(offsetKey) : undefined) ??
        (timestampKey ? indexByTimestamp.get(timestampKey) : undefined);
      const index = existingIndex ?? merged.length;
      if (existingIndex === undefined) merged.push(sample);
      else merged[index] = sample;
      if (offsetKey) indexByOffset.set(offsetKey, index);
      if (timestampKey) indexByTimestamp.set(timestampKey, index);
    };

    for (const row of archiveRows) addSample(row);
    for (const row of liveRows) addSample(row);
    return merged;
  }

  private async processPendingCleanupQueue(): Promise<{ cleaned: number; failed: number }> {
    let cleaned = 0;
    let failed = 0;
    for (;;) {
      const { data, error } = await this.supabaseAdminService.client
        .from('activity_stream_archive_cleanup_queue')
        .select('object_path, user_id, attempts')
        .order('queued_at', { ascending: true })
        .limit(100);
      if (error) throw new InternalServerErrorException('ACTIVITY_STREAM_ARCHIVE_CLEANUP_QUEUE_READ_FAILED');
      if (!data?.length) return { cleaned, failed };

      for (const item of data) {
        const { data: referencingManifest, error: manifestError } = await this.supabaseAdminService.client
          .from('activity_stream_archives')
          .select('session_id')
          .eq('object_path', item.object_path)
          .maybeSingle();
        if (manifestError) {
          failed += 1;
          continue;
        }
        if (referencingManifest) {
          const { error: deleteQueueError } = await this.supabaseAdminService.client
            .from('activity_stream_archive_cleanup_queue')
            .delete()
            .eq('object_path', item.object_path);
          if (deleteQueueError) failed += 1;
          continue;
        }

        const { error: storageError } = await this.supabaseAdminService.client.storage
          .from(ARCHIVE_BUCKET)
          .remove([item.object_path]);
        if (storageError) {
          const { error: updateError } = await this.supabaseAdminService.client
            .from('activity_stream_archive_cleanup_queue')
            .update({ attempts: item.attempts + 1, last_error: storageError.message.slice(0, 200) })
            .eq('object_path', item.object_path);
          if (updateError) this.logger.warn('Failed to update an activity stream archive cleanup attempt');
          failed += 1;
          continue;
        }
        const { error: deleteError } = await this.supabaseAdminService.client
          .from('activity_stream_archive_cleanup_queue')
          .delete()
          .eq('object_path', item.object_path);
        if (deleteError) {
          failed += 1;
          continue;
        }
        cleaned += 1;
      }
      if (failed > 0 || data.length < 100) return { cleaned, failed };
    }
  }

  private async enqueueCleanup(objectPath: string, userId: string): Promise<void> {
    const { error } = await this.supabaseAdminService.client
      .from('activity_stream_archive_cleanup_queue')
      .upsert({ object_path: objectPath, user_id: userId }, { onConflict: 'object_path', ignoreDuplicates: true });
    if (error) this.logger.error('Failed to enqueue activity stream archive object cleanup');
  }

  private async getPendingCleanupCount(): Promise<number> {
    const { count, error } = await this.supabaseAdminService.client
      .from('activity_stream_archive_cleanup_queue')
      .select('object_path', { count: 'exact', head: true });
    if (error) throw new InternalServerErrorException('ACTIVITY_STREAM_ARCHIVE_CLEANUP_QUEUE_READ_FAILED');
    return count ?? 0;
  }

  private getEffectiveBefore(requestedBefore?: Date): Date {
    if (requestedBefore && !Number.isFinite(requestedBefore.getTime())) {
      throw new BadRequestException('ACTIVITY_STREAM_ARCHIVE_INVALID_CUTOFF');
    }
    const minimumAgeCutoff = new Date(Date.now() - ARCHIVE_MINIMUM_AGE_DAYS * 24 * 60 * 60 * 1000);
    return requestedBefore && requestedBefore.getTime() < minimumAgeCutoff.getTime()
      ? requestedBefore
      : minimumAgeCutoff;
  }

  private emptySummary(effectiveBefore: Date, eligibleSessions: number): ActivityStreamArchiveRunSummary {
    return {
      effective_before: effectiveBefore.toISOString(),
      minimum_age_days: ARCHIVE_MINIMUM_AGE_DAYS,
      eligible_sessions: eligibleSessions,
      archived_sessions: 0,
      cleaned_duplicate_sessions: 0,
      already_archived_sessions: 0,
      empty_sessions: 0,
      changed_during_archive_sessions: 0,
      duplicate_live_sessions: 0,
      duplicate_sample_count: 0,
      source_sample_count: 0,
      archived_sample_count: 0,
      discarded_sample_count: 0,
      sessions_without_cardio_samples: 0,
      discarded_only_sessions: 0,
      uncompressed_bytes: 0,
      compressed_bytes: 0,
      existing_archive_bytes: 0,
      pending_cleanup_objects: 0,
      cleaned_archive_objects: 0,
    };
  }

  private async listEligibleSessions(before: Date): Promise<ArchiveSession[]> {
    const sessions: ArchiveSession[] = [];
    for (let page = 0; ; page += 1) {
      const start = page * SAMPLE_PAGE_SIZE;
      const { data, error } = await this.supabaseAdminService.client
        .from('activity_sessions')
        .select('id, user_id, start_time')
        .eq('status', 'completed')
        .not('end_time', 'is', null)
        .lt('start_time', before.toISOString())
        .order('start_time', { ascending: true })
        .order('id', { ascending: true })
        .range(start, start + SAMPLE_PAGE_SIZE - 1);
      if (error) throw new InternalServerErrorException('ACTIVITY_STREAM_ARCHIVE_SESSION_LIST_FAILED');
      sessions.push(...(data ?? []));
      if (!data || data.length < SAMPLE_PAGE_SIZE) return sessions;
    }
  }

  private async prepareArchive(session: ArchiveSession): Promise<PreparedArchive | null> {
    const sourceSamples = await this.loadSamples(session.id, session.user_id);
    if (sourceSamples.length === 0) return null;

    const archivedSamples = sourceSamples.flatMap(sample =>
      isAppConsumedCardioSample(sample)
        ? [
            {
              stream_type: sample.stream_type,
              timestamp: sample.timestamp,
              offset_s: sample.offset_s,
              value: sample.value,
            },
          ]
        : [],
    );
    const idsMd5 = this.hashSampleIds(sourceSamples);
    const discardedSampleCount = sourceSamples.length - archivedSamples.length;
    if (archivedSamples.length === 0) {
      return {
        payload: null,
        compressed: null,
        checksum: null,
        sourceSampleCount: sourceSamples.length,
        idsMd5,
        discardedSampleCount,
        uncompressedBytes: 0,
      };
    }

    const payload: ArchivePayloadV2 = {
      archive_version: ARCHIVE_FORMAT_VERSION,
      session_id: session.id,
      user_id: session.user_id,
      sample_count: archivedSamples.length,
      source_sample_count: sourceSamples.length,
      source_sample_ids_md5: idsMd5,
      samples: archivedSamples,
    };
    const json = new Uint8Array(Buffer.from(JSON.stringify(payload)));
    const compressed = gzipSync(json, { level: 9 });
    if (compressed.byteLength > MAX_ARCHIVE_FILE_BYTES) {
      throw new ServiceUnavailableException('ACTIVITY_STREAM_ARCHIVE_FILE_TOO_LARGE');
    }
    return {
      payload,
      compressed,
      checksum: createHash('sha256').update(new Uint8Array(compressed)).digest('hex'),
      sourceSampleCount: sourceSamples.length,
      idsMd5,
      discardedSampleCount,
      uncompressedBytes: json.byteLength,
    };
  }

  private async loadSamples(sessionId: string, userId: string): Promise<ActivityStreamSourceRow[]> {
    const samples: ActivityStreamSourceRow[] = [];
    for (let page = 0; ; page += 1) {
      const start = page * SAMPLE_PAGE_SIZE;
      const { data, error } = await this.supabaseAdminService.client
        .from('activity_stream_samples')
        .select('id, stream_type, timestamp, offset_s, value')
        .eq('session_id', sessionId)
        .eq('user_id', userId)
        .order('id', { ascending: true })
        .range(start, start + SAMPLE_PAGE_SIZE - 1);
      if (error) throw new InternalServerErrorException('ACTIVITY_STREAM_ARCHIVE_SAMPLE_READ_FAILED');
      samples.push(...(data ?? []));
      if (!data || data.length < SAMPLE_PAGE_SIZE) return samples;
    }
  }

  private async persistArchive(session: ArchiveSession, prepared: PreparedArchive): Promise<'archived' | 'changed'> {
    if (!prepared.payload || !prepared.compressed || !prepared.checksum) {
      throw new InternalServerErrorException('ACTIVITY_STREAM_ARCHIVE_PAYLOAD_INVALID');
    }
    // Content-addressed paths prevent concurrent archivers from replacing another snapshot.
    const objectPath = `${session.user_id}/${session.id}/${prepared.checksum}.json.gz`;
    const { error: uploadError } = await this.supabaseAdminService.client.storage
      .from(ARCHIVE_BUCKET)
      .upload(objectPath, prepared.compressed, { contentType: 'application/gzip', upsert: true });
    if (uploadError) throw new InternalServerErrorException('ACTIVITY_STREAM_ARCHIVE_UPLOAD_FAILED');

    let verification: Buffer;
    try {
      verification = await this.downloadObject(objectPath);
      this.verifyCompressedArchive(verification, prepared.checksum, prepared.compressed.byteLength);
      this.validatePayload(
        this.decodeJson(verification),
        session.id,
        session.user_id,
        prepared.payload.sample_count,
        ARCHIVE_FORMAT_VERSION,
        prepared.payload.source_sample_count,
        prepared.payload.source_sample_ids_md5,
      );
    } catch (error) {
      await this.enqueueCleanupIfUnreferenced(objectPath, session.user_id);
      throw error;
    }

    const { error: insertError } = await this.supabaseAdminService.client.from('activity_stream_archives').insert({
      session_id: session.id,
      user_id: session.user_id,
      object_path: objectPath,
      sample_count: prepared.payload.sample_count,
      compressed_bytes: prepared.compressed.byteLength,
      sha256: prepared.checksum,
      archive_version: ARCHIVE_FORMAT_VERSION,
      source_sample_count: prepared.sourceSampleCount,
      source_sample_ids_md5: prepared.idsMd5,
    });
    if (insertError) {
      const existingManifest = await this.getManifest(session.id, session.user_id);
      if (existingManifest?.object_path !== objectPath || existingManifest.sha256 !== prepared.checksum) {
        await this.enqueueCleanupIfUnreferenced(objectPath, session.user_id);
        throw new InternalServerErrorException('ACTIVITY_STREAM_ARCHIVE_MANIFEST_WRITE_FAILED');
      }
    }

    const { data: deleted, error: deleteError } = await this.supabaseAdminService.client.rpc(
      'delete_archived_activity_stream_samples',
      {
        p_session_id: session.id,
        p_user_id: session.user_id,
        p_expected_sample_count: prepared.sourceSampleCount,
        p_expected_ids_md5: prepared.idsMd5,
        p_minimum_age_days: ARCHIVE_MINIMUM_AGE_DAYS,
      },
    );
    if (deleteError) throw new InternalServerErrorException('ACTIVITY_STREAM_ARCHIVE_SAMPLE_DELETE_FAILED');
    if (deleted) return 'archived';

    // A concurrent resync or archiver can invalidate the guarded delete. Keep
    // the verified archive and live rows; reads merge them without data loss.
    return 'changed';
  }

  private async hasExactArchivedDuplicate(
    session: ArchiveSession,
    manifest: ActivityStreamArchiveManifest,
  ): Promise<boolean> {
    return (await this.getExactArchivedDuplicateSamples(session, manifest)) !== null;
  }

  private async getExactArchivedDuplicateSamples(
    session: ArchiveSession,
    manifest: ActivityStreamArchiveManifest,
  ): Promise<ActivityStreamSourceRow[] | null> {
    const liveSamples = await this.loadSamples(session.id, session.user_id);
    if (liveSamples.length === 0) return null;
    const payload = await this.downloadAndVerifyArchive(manifest, session.user_id);
    if (payload.archive_version === 1) {
      const legacySamples = payload.samples;
      const isExactLegacySnapshot =
        liveSamples.length === legacySamples.length &&
        this.hashSampleIds(liveSamples) === this.hashSampleIds(legacySamples) &&
        this.hashAppSamples(liveSamples) === this.hashAppSamples(legacySamples);
      return isExactLegacySnapshot ? liveSamples : null;
    }

    const isExactCurrentSnapshot =
      manifest.source_sample_count === liveSamples.length &&
      manifest.source_sample_ids_md5 === this.hashSampleIds(liveSamples) &&
      this.hashAppSamples(this.getCardioSourceSamples(liveSamples)) === this.hashAppSamples(payload.samples);
    return isExactCurrentSnapshot ? liveSamples : null;
  }

  private async deleteExactArchivedDuplicate(
    session: ArchiveSession,
    manifest: ActivityStreamArchiveManifest,
  ): Promise<boolean> {
    const liveSamples = await this.getExactArchivedDuplicateSamples(session, manifest);
    if (!liveSamples) return false;
    return this.deleteSourceSamples(session, liveSamples.length, this.hashSampleIds(liveSamples));
  }

  private async deleteSourceSamples(session: ArchiveSession, expectedSampleCount: number, expectedIdsMd5: string) {
    const { data, error } = await this.supabaseAdminService.client.rpc('delete_archived_activity_stream_samples', {
      p_session_id: session.id,
      p_user_id: session.user_id,
      p_expected_sample_count: expectedSampleCount,
      p_expected_ids_md5: expectedIdsMd5,
      p_minimum_age_days: ARCHIVE_MINIMUM_AGE_DAYS,
    });
    if (error) throw new InternalServerErrorException('ACTIVITY_STREAM_ARCHIVE_SAMPLE_DELETE_FAILED');
    return data;
  }

  private hashSampleIds(samples: Array<Pick<ActivityStreamSourceRow, 'id'>>): string {
    return createHash('md5')
      .update(
        samples
          .map(sample => sample.id)
          .sort()
          .join(','),
      )
      .digest('hex');
  }

  private hashAppSamples(
    samples: Array<Pick<ActivityStreamSourceRow, 'stream_type' | 'timestamp' | 'offset_s' | 'value'>>,
  ): string {
    const orderedValues = samples
      .map(sample => [sample.stream_type, sample.offset_s, sample.timestamp, sample.value])
      .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
    return createHash('sha256').update(JSON.stringify(orderedValues)).digest('hex');
  }

  private getCardioSourceSamples(samples: ActivityStreamSourceRow[]): ArchiveSample[] {
    return samples.flatMap(sample =>
      isAppConsumedCardioSample(sample)
        ? [
            {
              stream_type: sample.stream_type,
              timestamp: sample.timestamp,
              offset_s: sample.offset_s,
              value: sample.value,
            },
          ]
        : [],
    );
  }

  private getArchiveCardioSamples(payload: VerifiedArchivePayload): ArchivedActivityStreamSample[] {
    return payload.samples.flatMap(sample =>
      isArchivedStreamType(sample.stream_type)
        ? [
            {
              session_id: payload.session_id,
              stream_type: sample.stream_type,
              timestamp: sample.timestamp,
              offset_s: sample.offset_s,
              value: sample.value,
            },
          ]
        : [],
    );
  }

  private async enqueueCleanupIfUnreferenced(objectPath: string, userId: string): Promise<void> {
    const { data, error } = await this.supabaseAdminService.client
      .from('activity_stream_archives')
      .select('session_id')
      .eq('object_path', objectPath)
      .maybeSingle();
    if (error) {
      this.logger.warn('Could not verify whether an activity stream archive object is still referenced');
      return;
    }
    if (data) return;
    await this.enqueueCleanup(objectPath, userId);
  }

  private async getManifest(sessionId: string, userId: string): Promise<ActivityStreamArchiveManifest | null> {
    const { data, error } = await this.supabaseAdminService.client
      .from('activity_stream_archives')
      .select(
        'session_id, user_id, object_path, sample_count, compressed_bytes, sha256, archive_version, source_sample_count, source_sample_ids_md5, archived_at',
      )
      .eq('session_id', sessionId)
      .eq('user_id', userId)
      .maybeSingle();
    if (error) throw new InternalServerErrorException('ACTIVITY_STREAM_ARCHIVE_MANIFEST_READ_FAILED');
    return data;
  }

  private async getExistingArchiveBytes(): Promise<number> {
    let totalBytes = 0;
    for (let page = 0; ; page += 1) {
      const start = page * SAMPLE_PAGE_SIZE;
      const { data, error } = await this.supabaseAdminService.client
        .from('activity_stream_archives')
        .select('compressed_bytes')
        .order('session_id', { ascending: true })
        .range(start, start + SAMPLE_PAGE_SIZE - 1);
      if (error) throw new InternalServerErrorException('ACTIVITY_STREAM_ARCHIVE_STORAGE_USAGE_READ_FAILED');
      totalBytes += (data ?? []).reduce((total, manifest) => total + manifest.compressed_bytes, 0);
      if (!data || data.length < SAMPLE_PAGE_SIZE) return totalBytes;
    }
  }

  private async downloadAndVerifyArchive(
    manifest: ActivityStreamArchiveManifest,
    userId: string,
  ): Promise<VerifiedArchivePayload> {
    const expectedPath = `${userId}/${manifest.session_id}/${manifest.sha256}.json.gz`;
    if (
      manifest.user_id !== userId ||
      manifest.object_path !== expectedPath ||
      (manifest.archive_version !== 1 && manifest.archive_version !== ARCHIVE_FORMAT_VERSION)
    ) {
      throw new InternalServerErrorException('ACTIVITY_STREAM_ARCHIVE_MANIFEST_INVALID');
    }
    const compressed = await this.downloadObject(manifest.object_path);
    this.verifyCompressedArchive(compressed, manifest.sha256, manifest.compressed_bytes);
    return this.validatePayload(
      this.decodeJson(compressed),
      manifest.session_id,
      userId,
      manifest.sample_count,
      manifest.archive_version,
      manifest.source_sample_count,
      manifest.source_sample_ids_md5,
    );
  }

  private async downloadObject(objectPath: string): Promise<Buffer> {
    const { data, error } = await this.supabaseAdminService.client.storage.from(ARCHIVE_BUCKET).download(objectPath);
    if (error || !data) throw new InternalServerErrorException('ACTIVITY_STREAM_ARCHIVE_DOWNLOAD_FAILED');
    return Buffer.from(await data.arrayBuffer());
  }

  private verifyCompressedArchive(compressed: Buffer, expectedChecksum: string, expectedSize: number): void {
    const checksum = createHash('sha256').update(new Uint8Array(compressed)).digest('hex');
    if (compressed.byteLength !== expectedSize || checksum !== expectedChecksum) {
      throw new InternalServerErrorException('ACTIVITY_STREAM_ARCHIVE_CHECKSUM_MISMATCH');
    }
  }

  private decodeJson(compressed: Buffer): unknown {
    try {
      return JSON.parse(gunzipSync(new Uint8Array(compressed)).toString('utf8')) as unknown;
    } catch {
      throw new InternalServerErrorException('ACTIVITY_STREAM_ARCHIVE_DECOMPRESSION_FAILED');
    }
  }

  private validatePayload(
    input: unknown,
    sessionId: string,
    userId: string,
    sampleCount: number,
    archiveVersion: number,
    expectedSourceSampleCount: number | null,
    expectedSourceSampleIdsMd5: string | null,
  ): VerifiedArchivePayload {
    if (
      !isRecord(input) ||
      (archiveVersion === ARCHIVE_FORMAT_VERSION &&
        !hasOnlyKeys(input, [
          'archive_version',
          'session_id',
          'user_id',
          'sample_count',
          'source_sample_count',
          'source_sample_ids_md5',
          'samples',
        ])) ||
      input.archive_version !== archiveVersion ||
      input.session_id !== sessionId ||
      input.user_id !== userId ||
      input.sample_count !== sampleCount ||
      !Array.isArray(input.samples) ||
      input.samples.length !== sampleCount
    ) {
      throw new InternalServerErrorException('ACTIVITY_STREAM_ARCHIVE_PAYLOAD_INVALID');
    }

    if (archiveVersion === 1) {
      if (!input.samples.every(sample => isLegacyStreamSampleRow(sample, sessionId, userId))) {
        throw new InternalServerErrorException('ACTIVITY_STREAM_ARCHIVE_PAYLOAD_INVALID');
      }
      return input as ArchivePayloadV1;
    }

    if (
      archiveVersion !== ARCHIVE_FORMAT_VERSION ||
      input.source_sample_count !== expectedSourceSampleCount ||
      input.source_sample_ids_md5 !== expectedSourceSampleIdsMd5 ||
      typeof input.source_sample_count !== 'number' ||
      !Number.isInteger(input.source_sample_count) ||
      input.source_sample_count < sampleCount ||
      typeof input.source_sample_ids_md5 !== 'string' ||
      !/^[0-9a-f]{32}$/.test(input.source_sample_ids_md5) ||
      !input.samples.every(isArchiveSample)
    ) {
      throw new InternalServerErrorException('ACTIVITY_STREAM_ARCHIVE_PAYLOAD_INVALID');
    }
    return input as ArchivePayloadV2;
  }

  private addPreparedArchive(
    summary: ActivityStreamArchiveRunSummary,
    prepared: PreparedArchive,
  ): ActivityStreamArchiveRunSummary {
    return {
      ...summary,
      source_sample_count: summary.source_sample_count + prepared.sourceSampleCount,
      archived_sample_count: summary.archived_sample_count + (prepared.payload?.sample_count ?? 0),
      discarded_sample_count: summary.discarded_sample_count + prepared.discardedSampleCount,
      sessions_without_cardio_samples: summary.sessions_without_cardio_samples + (prepared.payload ? 0 : 1),
      uncompressed_bytes: summary.uncompressed_bytes + prepared.uncompressedBytes,
      compressed_bytes: summary.compressed_bytes + (prepared.compressed?.byteLength ?? 0),
    };
  }
}
