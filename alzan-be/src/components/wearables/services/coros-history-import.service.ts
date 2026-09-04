import { createHash } from 'crypto';
import { BadRequestException, Injectable, InternalServerErrorException } from '@nestjs/common';
import { SupabaseAdminService } from '../../../core/supabase/supabase.service';
import { parseCorosActivityFileToCanonical } from '../../activity-import/parsers/coros-activity-canonical.mapper';
import {
  ActivityImportUploadedFile,
  ACTIVITY_IMPORT_MAX_FILE_SIZE_BYTES,
} from '../../activity-import/activity-import.types';
import { CanonicalActivity } from '../../activity-import/parsers/activity-import-canonical.types';
import { CanonicalProvenance } from '../domain/wearable.types';
import { CanonicalActivityWriterService } from './canonical-activity-writer.service';
import { buildCorosHistoricalSourceRecordId, isLikelyCorosHistoricalDuplicate } from './coros-history-import.utils';
import { assertCorosFitBytes } from './coros-api.utils';
import { RawPayloadService } from './raw-payload.service';

const COROS_HISTORY_SOURCE_PACKAGE = 'coros_training_hub';
const COROS_HISTORY_SOURCE_KEY = 'coros_training_hub';
const COROS_HISTORY_MAX_FILES = 50;

export interface CorosHistoryImportFileError {
  fileName: string;
  code: string;
}

export interface CorosHistoryImportResult {
  filesImported: number;
  filesSkipped: number;
  filesFailed: number;
  errorsByFile: CorosHistoryImportFileError[];
}

@Injectable()
export class CorosHistoryImportService {
  constructor(
    private readonly supabaseAdminService: SupabaseAdminService,
    private readonly rawPayloadService: RawPayloadService,
    private readonly activityWriterService: CanonicalActivityWriterService,
  ) {}

  public async importFiles(userId: string, files: ActivityImportUploadedFile[]): Promise<CorosHistoryImportResult> {
    if (!files || files.length === 0) throw new BadRequestException('COROS_HISTORY_FILES_REQUIRED');
    if (files.length > COROS_HISTORY_MAX_FILES) throw new BadRequestException('COROS_HISTORY_TOO_MANY_FILES');

    const result: CorosHistoryImportResult = {
      filesImported: 0,
      filesSkipped: 0,
      filesFailed: 0,
      errorsByFile: [],
    };

    for (const file of files) {
      const outcome = await this.importFile(userId, file);
      if (outcome === 'imported') result.filesImported += 1;
      else if (outcome === 'skipped') result.filesSkipped += 1;
      else {
        result.filesFailed += 1;
        result.errorsByFile.push(outcome);
      }
    }

    return result;
  }

  private async importFile(
    userId: string,
    file: ActivityImportUploadedFile,
  ): Promise<'imported' | 'skipped' | CorosHistoryImportFileError> {
    const fileName = file.originalname?.trim() || 'activity.fit';
    try {
      this.assertFitFile(file);
      const fileHash = createHash('sha256').update(file.buffer.toString('base64')).digest('hex');
      const parsed = parseCorosActivityFileToCanonical(new Uint8Array(file.buffer), fileName, {
        estimatedMaxHeartRate: null,
      });
      const sourceRecordId = buildCorosHistoricalSourceRecordId(parsed.providerActivityId, `sha256:${fileHash}`);
      const providerActivityId = parsed.providerActivityId ?? sourceRecordId;
      if (await this.isDuplicate(userId, providerActivityId, sourceRecordId, parsed)) return 'skipped';

      const activity: CanonicalActivity = {
        ...parsed,
        providerActivityId,
        pendingWatchMetrics: null,
      };
      const rawPayload = await this.rawPayloadService.storeRawPayload({
        userId,
        provider: 'coros',
        sourceChannel: 'file_import',
        sourcePackage: COROS_HISTORY_SOURCE_PACKAGE,
        objectType: 'activity',
        sourceRecordId,
        payload: {
          fileName,
          fileHash,
          sizeBytes: file.buffer.length,
          providerActivityId: parsed.providerActivityId,
          sportType: parsed.sportType,
          sportSubtype: parsed.sportSubtype,
        },
        traceId: null,
      });
      const provenance: CanonicalProvenance = {
        provider: 'coros',
        sourceChannel: 'file_import',
        sourcePackage: COROS_HISTORY_SOURCE_PACKAGE,
        sourceProviderKey: COROS_HISTORY_SOURCE_KEY,
        sourceRecordId,
        sourceUpdatedAt: null,
        rawPayloadId: rawPayload.id,
      };
      await this.activityWriterService.upsertActivity({ userId, activity, provenance });
      return 'imported';
    } catch (error: unknown) {
      return { fileName, code: this.errorCode(error) };
    }
  }

  private async isDuplicate(
    userId: string,
    providerActivityId: string,
    sourceRecordId: string,
    parsed: CanonicalActivity,
  ): Promise<boolean> {
    const { data: providerMatches, error: providerError } = await this.supabaseAdminService.client
      .from('activity_sessions')
      .select('id')
      .eq('user_id', userId)
      .eq('provider', 'coros')
      .eq('provider_activity_id', providerActivityId)
      .limit(1);
    if (providerError) throw new InternalServerErrorException('COROS_HISTORY_DUPLICATE_LOOKUP_FAILED');
    if ((providerMatches?.length ?? 0) > 0) return true;

    const { data: sourceMatches, error: sourceError } = await this.supabaseAdminService.client
      .from('activity_sessions')
      .select('id')
      .eq('user_id', userId)
      .eq('provider', 'coros')
      .eq('source_channel', 'file_import')
      .eq('source_package', COROS_HISTORY_SOURCE_PACKAGE)
      .eq('source_record_id', sourceRecordId)
      .limit(1);
    if (sourceError) throw new InternalServerErrorException('COROS_HISTORY_DUPLICATE_LOOKUP_FAILED');
    if ((sourceMatches?.length ?? 0) > 0) return true;

    if (!parsed.summary.startedAt) return false;
    const start = new Date(Date.parse(parsed.summary.startedAt) - 5 * 60_000).toISOString();
    const end = new Date(Date.parse(parsed.summary.startedAt) + 5 * 60_000).toISOString();
    const { data: nearbySessions, error: nearbyError } = await this.supabaseAdminService.client
      .from('activity_sessions')
      .select('start_time, duration_s, distance_m, sport_type')
      .eq('user_id', userId)
      .eq('provider', 'coros')
      .eq('sport_type', parsed.sportType)
      .gte('start_time', start)
      .lte('start_time', end)
      .limit(25);
    if (nearbyError) throw new InternalServerErrorException('COROS_HISTORY_DUPLICATE_LOOKUP_FAILED');
    return (nearbySessions ?? []).some(session =>
      isLikelyCorosHistoricalDuplicate({
        candidateStartedAt: parsed.summary.startedAt,
        candidateDurationSeconds: parsed.summary.durationSeconds,
        candidateDistanceM: parsed.summary.distanceM,
        existingStartedAt: session.start_time,
        existingDurationSeconds: session.duration_s,
        existingDistanceM: session.distance_m,
      }),
    );
  }

  private assertFitFile(file: ActivityImportUploadedFile): void {
    if (!file?.buffer || file.buffer.length === 0) throw new BadRequestException('COROS_HISTORY_FILE_REQUIRED');
    if (file.buffer.length > ACTIVITY_IMPORT_MAX_FILE_SIZE_BYTES) {
      throw new BadRequestException('COROS_HISTORY_FILE_TOO_LARGE');
    }
    assertCorosFitBytes(new Uint8Array(file.buffer), ACTIVITY_IMPORT_MAX_FILE_SIZE_BYTES);
  }

  private errorCode(error: unknown): string {
    if (error instanceof Error && error.message.startsWith('COROS_')) return error.message;
    if (error instanceof BadRequestException) {
      const response = error.getResponse();
      if (typeof response === 'string') return response;
    }
    return 'COROS_HISTORY_FILE_IMPORT_FAILED';
  }
}
