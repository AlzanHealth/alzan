import { BadRequestException, Injectable, InternalServerErrorException } from '@nestjs/common';
import { UserCtx } from '../../common/decorators/user-context.decorator';
import { Database } from '../../types/database.types';
import {
  ActivityHeartRateZoneInsert,
  ActivityLap,
  ActivityLapInsert,
  DeviceInsert,
  Device,
} from '../../types/requests.types';
import {
  ActivityImportUploadedFile,
  ACTIVITY_IMPORT_MAX_FILE_SIZE_BYTES,
  STRENGTH_FILE_IMPORT_SOURCE,
} from './activity-import.types';
import {
  getDatabaseProviderForStrengthImport,
  ImportedStrengthActivitySummary,
  parseStrengthActivityFile,
  STRENGTH_ACTIVITY_PARSE_ERROR_TAG,
  STRENGTH_ACTIVITY_UNSUPPORTED_ERROR_TAG,
} from './parsers/strength-activity-import.parser';
import {
  detectFormat,
  parseRouteFileWithSummary,
  ParsedRouteImport,
  ParseRouteFileOptions,
  RouteImportDetails,
  RouteImportLap,
} from './parsers/route-import.parser';

type ActivitySessionUpdate = Database['public']['Tables']['activity_sessions']['Update'];
type ActivityStreamInsert = Database['public']['Tables']['activity_streams']['Insert'];
type ActivityStreamData = ActivityStreamInsert['data'];
type RouteImportFileContent = string | Uint8Array;

@Injectable()
export class ActivityImportService {
  public async parseRouteFileForUser(params: {
    ctx: UserCtx;
    file: ActivityImportUploadedFile;
    estimatedMaxHeartRate?: number | null;
  }): Promise<ParsedRouteImport> {
    const estimatedMaxHeartRate =
      params.estimatedMaxHeartRate ?? (await this.resolveUserEstimatedMaxHeartRate(params.ctx));
    return this.parseRouteFile(params.file, estimatedMaxHeartRate);
  }

  public parseRouteFile(file: ActivityImportUploadedFile, estimatedMaxHeartRate?: number | null): ParsedRouteImport {
    this.assertValidFile(file);
    const content = this.readRouteFileContent(file);
    const filename = this.resolveRouteFilename(file, content);
    const options: ParseRouteFileOptions = { estimatedMaxHeartRate: estimatedMaxHeartRate ?? null };

    try {
      return parseRouteFileWithSummary(content, filename, options);
    } catch (error) {
      throw this.toRouteParseException(error);
    }
  }

  public async applyRouteFile(params: {
    ctx: UserCtx;
    file: ActivityImportUploadedFile;
    sessionId: string;
    persistDetails: boolean;
    estimatedMaxHeartRate?: number | null;
  }): Promise<ParsedRouteImport> {
    const estimatedMaxHeartRate =
      params.estimatedMaxHeartRate ?? (await this.resolveUserEstimatedMaxHeartRate(params.ctx));
    const parsedRoute = this.parseRouteFile(params.file, estimatedMaxHeartRate);

    await this.updateSessionRoute(params.ctx, params.sessionId, parsedRoute.polyline);

    if (params.persistDetails) {
      await this.persistRouteDetails(params.ctx, params.sessionId, parsedRoute.details);
    }

    return parsedRoute;
  }

  public async applyStrengthFile(params: {
    ctx: UserCtx;
    file: ActivityImportUploadedFile;
    sessionId: string;
  }): Promise<ImportedStrengthActivitySummary> {
    const estimatedMaxHeartRate = await this.resolveUserEstimatedMaxHeartRate(params.ctx);
    const summary = this.parseStrengthFile(params.file, estimatedMaxHeartRate);
    const deviceId = await this.ensureDevice(params.ctx, summary);
    const sessionUpdate = this.buildStrengthSessionUpdate(summary, deviceId);

    const { error: updateError } = await params.ctx.supabase
      .from('activity_sessions')
      .update(sessionUpdate)
      .eq('id', params.sessionId)
      .eq('user_id', params.ctx.user.id);

    if (updateError) throw new InternalServerErrorException('Failed to update imported activity session');

    await this.replaceStrengthHeartRateZones(params.ctx, params.sessionId, summary);
    await this.replaceStrengthStream(params.ctx, params.sessionId, summary);

    return summary;
  }

  private parseStrengthFile(
    file: ActivityImportUploadedFile,
    estimatedMaxHeartRate?: number | null,
  ): ImportedStrengthActivitySummary {
    this.assertValidFile(file);
    const filename = this.resolveFilename(file);
    const { content, parseFilename } = this.readStrengthFileContent(file, filename);

    try {
      return parseStrengthActivityFile(content, parseFilename, { estimatedMaxHeartRate });
    } catch (error) {
      throw this.toStrengthParseException(error);
    }
  }

  private async resolveUserEstimatedMaxHeartRate(ctx: UserCtx): Promise<number | null> {
    const { data, error } = await ctx.supabase.from('users').select('date_of_birth').eq('id', ctx.user.id).maybeSingle();
    if (error) return null;

    const dateOfBirth = data?.date_of_birth;
    if (!dateOfBirth) return null;

    const parsedDate = Date.parse(dateOfBirth);
    if (!Number.isFinite(parsedDate)) return null;

    const ageInYears = Math.floor((Date.now() - parsedDate) / (365.25 * 24 * 60 * 60 * 1000));
    if (!Number.isFinite(ageInYears) || ageInYears <= 0) return null;

    // Simple age-based fallback when user-specific max HR is not stored explicitly.
    const estimated = 220 - ageInYears;
    const clamped = Math.max(120, Math.min(220, estimated));
    return Number.isFinite(clamped) ? clamped : null;
  }

  private assertValidFile(file: ActivityImportUploadedFile | undefined): asserts file is ActivityImportUploadedFile {
    if (!file?.buffer || file.size <= 0) throw new BadRequestException('ACTIVITY_IMPORT_FILE_REQUIRED');
    if (file.size > ACTIVITY_IMPORT_MAX_FILE_SIZE_BYTES)
      throw new BadRequestException('ACTIVITY_IMPORT_FILE_TOO_LARGE');
  }

  private resolveFilename(file: ActivityImportUploadedFile): string {
    return file.originalname?.trim() || 'activity-import.fit';
  }

  private readStrengthFileContent(
    file: ActivityImportUploadedFile,
    filename: string,
  ): { content: RouteImportFileContent; parseFilename: string } {
    const lower = filename.toLowerCase();
    if (lower.endsWith('.fit') || this.isFitBinary(file.buffer)) {
      return {
        content: new Uint8Array(file.buffer),
        parseFilename: lower.endsWith('.fit') ? filename : `${filename}.fit`,
      };
    }
    if (lower.endsWith('.json') || file.mimetype.toLowerCase().includes('json')) {
      return { content: file.buffer.toString('utf8'), parseFilename: filename };
    }
    const text = file.buffer.toString('utf8');
    const trimmed = text.trim();
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      return { content: text, parseFilename: lower.endsWith('.json') ? filename : `${filename}.json` };
    }
    throw new BadRequestException('STRENGTH_ACTIVITY_PARSE_ERROR');
  }

  private readRouteFileContent(file: ActivityImportUploadedFile): RouteImportFileContent {
    const lower = this.resolveFilename(file).toLowerCase();
    if (lower.endsWith('.fit') || this.isFitBinary(file.buffer)) return new Uint8Array(file.buffer);
    return file.buffer.toString('utf8');
  }

  private resolveRouteFilename(file: ActivityImportUploadedFile, content: RouteImportFileContent): string {
    const filename = this.resolveFilename(file);
    if (detectFormat(filename) != null) return filename;
    if (typeof content !== 'string') return `${filename}.fit`;

    const trimmed = content.trim();
    const lowered = trimmed.toLowerCase();
    if (lowered.startsWith('<gpx')) return `${filename}.gpx`;
    if (lowered.includes('<trainingcenterdatabase')) return `${filename}.tcx`;
    if (lowered.startsWith('<kml') || lowered.includes('<kml ')) return `${filename}.kml`;
    if (lowered.startsWith('{') || lowered.startsWith('[')) return `${filename}.json`;
    return `${filename}.txt`;
  }

  private isFitBinary(buffer: Buffer): boolean {
    if (buffer.length < 12) return false;
    return String.fromCharCode(buffer[8], buffer[9], buffer[10], buffer[11]) === '.FIT';
  }

  private toStrengthParseException(error: unknown): BadRequestException {
    if (error instanceof Error && error.message === STRENGTH_ACTIVITY_UNSUPPORTED_ERROR_TAG) {
      return new BadRequestException(STRENGTH_ACTIVITY_UNSUPPORTED_ERROR_TAG);
    }

    if (error instanceof Error && error.message === STRENGTH_ACTIVITY_PARSE_ERROR_TAG) {
      return new BadRequestException(STRENGTH_ACTIVITY_PARSE_ERROR_TAG);
    }

    return new BadRequestException(STRENGTH_ACTIVITY_PARSE_ERROR_TAG);
  }

  private toRouteParseException(_error: unknown): BadRequestException {
    return new BadRequestException('ROUTE_PARSE_ERROR');
  }

  private async ensureDevice(ctx: UserCtx, summary: ImportedStrengthActivitySummary): Promise<string | null> {
    if (!summary.device) return null;

    const provider = getDatabaseProviderForStrengthImport(summary.provider);
    const serial = summary.device.serial?.trim() || null;
    const name = summary.device.name?.trim() || null;
    const model = summary.device.model?.trim() || null;

    if (!serial && !name && !model) return null;

    if (serial) {
      const { data: existingDevice, error: existingError } = await ctx.supabase
        .from('devices')
        .select('id')
        .eq('user_id', ctx.user.id)
        .eq('provider', provider)
        .eq('device_serial', serial)
        .maybeSingle();

      if (existingError) throw new InternalServerErrorException('Failed to read imported activity device');
      if (existingDevice) return existingDevice.id;
    }

    const payload: DeviceInsert = {
      user_id: ctx.user.id,
      provider,
      device_name: name,
      device_model: model,
      device_serial: serial,
    };

    const { data: createdDevice, error: createError } = await ctx.supabase
      .from('devices')
      .insert(payload)
      .select('id')
      .single<Device>();

    if (createError) throw new InternalServerErrorException('Failed to create imported activity device');
    return createdDevice.id;
  }

  private buildStrengthSessionUpdate(
    summary: ImportedStrengthActivitySummary,
    deviceId: string | null,
  ): ActivitySessionUpdate {
    const update: ActivitySessionUpdate = {
      provider: getDatabaseProviderForStrengthImport(summary.provider),
      imported_at: new Date().toISOString(),
    };

    if (deviceId) update.device_id = deviceId;
    if (summary.startedAt) update.start_time = summary.startedAt;
    if (summary.endedAt) update.end_time = summary.endedAt;
    if (summary.durationSeconds != null) update.duration_s = summary.durationSeconds;
    if (summary.caloriesKcal != null) update.calories_kcal = summary.caloriesKcal;
    if (summary.avgHeartRate != null) update.avg_heart_rate = summary.avgHeartRate;
    if (summary.maxHeartRate != null) update.max_heart_rate = summary.maxHeartRate;
    if (summary.minHeartRate != null) update.min_heart_rate = summary.minHeartRate;
    if (summary.totalSteps != null) update.total_steps = summary.totalSteps;
    if (summary.recoveryTimeSeconds != null) update.recovery_time_s = summary.recoveryTimeSeconds;
    if (summary.tss != null) update.tss_hr = summary.tss;
    if (summary.epoc != null) update.epoc = summary.epoc;
    if (summary.pte != null) update.pte = summary.pte;

    return update;
  }

  private async replaceStrengthHeartRateZones(
    ctx: UserCtx,
    sessionId: string,
    summary: ImportedStrengthActivitySummary,
  ): Promise<void> {
    const { error: deleteZonesError } = await ctx.supabase
      .from('activity_heart_rate_zones')
      .delete()
      .eq('session_id', sessionId);

    if (deleteZonesError) throw new InternalServerErrorException('Failed to replace imported heart-rate zones');
    if (summary.heartRateZones.length === 0) return;

    const zoneRows: ActivityHeartRateZoneInsert[] = summary.heartRateZones.map(zone => ({
      session_id: sessionId,
      zone: zone.zone,
      duration_s: zone.durationSeconds,
      percentage: zone.percentage,
    }));

    const { error: insertZonesError } = await ctx.supabase.from('activity_heart_rate_zones').insert(zoneRows);
    if (insertZonesError) throw new InternalServerErrorException('Failed to insert imported heart-rate zones');
  }

  private async replaceStrengthStream(
    ctx: UserCtx,
    sessionId: string,
    summary: ImportedStrengthActivitySummary,
  ): Promise<void> {
    const { error: deleteStreamsError } = await ctx.supabase
      .from('activity_streams')
      .delete()
      .eq('session_id', sessionId)
      .eq('source', STRENGTH_FILE_IMPORT_SOURCE);

    if (deleteStreamsError) throw new InternalServerErrorException('Failed to replace imported heart-rate stream');

    const streamSamples: ActivityStreamData[] = summary.heartRateStream.map(sample => ({
      bpm: sample.bpm,
      timestamp: sample.timestamp,
      offsetSeconds: sample.offsetSeconds,
    }));
    const streamData: ActivityStreamData = {
      provider: summary.provider,
      sourceFileType: summary.sourceFileType,
      trainingLoadPeak: summary.trainingLoadPeak,
      avgHeartRate: summary.avgHeartRate,
      maxHeartRate: summary.maxHeartRate,
      minHeartRate: summary.minHeartRate,
      caloriesKcal: summary.caloriesKcal,
      totalSteps: summary.totalSteps,
      recoveryTimeSeconds: summary.recoveryTimeSeconds,
      epoc: summary.epoc,
      pte: summary.pte,
      tss: summary.tss,
      samples: streamSamples,
    };
    const streamRows: ActivityStreamInsert[] = [
      {
        session_id: sessionId,
        user_id: ctx.user.id,
        stream_type: 'heart_rate',
        unit: 'bpm',
        source: STRENGTH_FILE_IMPORT_SOURCE,
        data: streamData,
      },
    ];

    const { error: insertStreamsError } = await ctx.supabase.from('activity_streams').insert(streamRows);
    if (insertStreamsError) throw new InternalServerErrorException('Failed to insert imported heart-rate stream');
  }

  private async updateSessionRoute(ctx: UserCtx, sessionId: string, polyline: string): Promise<void> {
    const { error } = await ctx.supabase
      .from('activity_sessions')
      .update({ route_polyline: polyline })
      .eq('id', sessionId)
      .eq('user_id', ctx.user.id);

    if (error) throw new InternalServerErrorException('Failed to update imported route');
  }

  private async persistRouteDetails(ctx: UserCtx, sessionId: string, details: RouteImportDetails): Promise<void> {
    const lapRows = this.buildRouteLapRows(ctx, sessionId, details);
    const zoneRows = this.buildRouteZoneRows(sessionId, details);

    if (lapRows.length > 0) await this.replaceRouteLaps(ctx, sessionId, lapRows);
    if (zoneRows.length > 0) await this.replaceRouteHeartRateZones(ctx, sessionId, zoneRows);
  }

  private buildRouteLapRows(ctx: UserCtx, sessionId: string, details: RouteImportDetails): ActivityLapInsert[] {
    const tabs = this.resolveRouteTabs(details);

    return tabs.flatMap((tab, tabIndex) =>
      tab.laps.map(lap => ({
        session_id: sessionId,
        user_id: ctx.user.id,
        lap_index: lap.lapIndex,
        lap_type: lap.lapType,
        split_group: tab.splitGroup,
        split_group_order: tabIndex,
        split_distance_m: tab.splitDistanceM != null ? Math.round(tab.splitDistanceM) : null,
        distance_m: lap.distanceM,
        duration_s: lap.durationSeconds != null ? Math.round(lap.durationSeconds) : null,
        avg_heart_rate: lap.avgHeartRate != null ? Math.round(lap.avgHeartRate) : null,
        max_heart_rate: lap.maxHeartRate != null ? Math.round(lap.maxHeartRate) : null,
        avg_pace_s_per_km: lap.avgPaceSecondsPerKm != null ? Math.round(lap.avgPaceSecondsPerKm) : null,
        start_offset_s: lap.startOffsetSeconds != null ? Math.round(lap.startOffsetSeconds) : null,
        end_offset_s: lap.endOffsetSeconds != null ? Math.round(lap.endOffsetSeconds) : null,
      })),
    );
  }

  private resolveRouteTabs(details: RouteImportDetails): Array<{
    splitGroup: 'custom' | 'distance';
    splitDistanceM: number | null;
    laps: RouteImportLap[];
  }> {
    const tabs: Array<{ splitGroup: 'custom' | 'distance'; splitDistanceM: number | null; laps: RouteImportLap[] }> =
      [];
    const distanceBuckets = details.distanceSplits
      .filter(bucket => bucket.laps.length > 0)
      .sort((left, right) => left.splitDistanceM - right.splitDistanceM);
    const customSplits = details.customSplits;
    const customSplitLooksRegular = customSplits.every(
      split => split.lapType === 'auto' || split.lapType === 'distance' || split.lapType === 'unknown',
    );
    const inferredRegularCustomDistance = this.inferRegularAutoSplitDistance(customSplits);
    const customMatchesRegularBucket =
      customSplitLooksRegular &&
      inferredRegularCustomDistance != null &&
      distanceBuckets.some(bucket => this.areCloseValues(bucket.splitDistanceM, inferredRegularCustomDistance, 10));
    const customDuplicatesDistanceBucket =
      customSplits.length > 0 && distanceBuckets.some(bucket => this.areEquivalentLaps(customSplits, bucket.laps));
    const shouldShowCustom = customSplits.length > 0 && !customDuplicatesDistanceBucket && !customMatchesRegularBucket;

    if (shouldShowCustom) {
      tabs.push({ splitGroup: 'custom', splitDistanceM: null, laps: customSplits });
    }

    tabs.push(
      ...distanceBuckets.map(bucket => ({
        splitGroup: 'distance' as const,
        splitDistanceM: bucket.splitDistanceM,
        laps: bucket.laps,
      })),
    );

    if (tabs.length === 0 && customSplits.length > 0) {
      tabs.push({ splitGroup: 'custom', splitDistanceM: null, laps: customSplits });
    }

    return tabs;
  }

  private areCloseValues(left: number, right: number, tolerance: number): boolean {
    return Math.abs(left - right) <= tolerance;
  }

  private areEquivalentLaps(left: RouteImportLap[], right: RouteImportLap[]): boolean {
    if (left.length !== right.length || left.length === 0) return false;

    return left.every((leftLap, index) => {
      const rightLap = right[index];
      if (!rightLap) return false;

      const distanceMatches = this.areCloseValues(leftLap.distanceM, rightLap.distanceM, 10);
      const leftDuration = leftLap.durationSeconds;
      const rightDuration = rightLap.durationSeconds;
      const durationMatches =
        leftDuration == null && rightDuration == null
          ? true
          : leftDuration != null && rightDuration != null
            ? this.areCloseValues(leftDuration, rightDuration, 2)
            : false;

      return distanceMatches && durationMatches;
    });
  }

  private inferRegularAutoSplitDistance(customSplits: RouteImportLap[]): number | null {
    if (customSplits.length < 2) return null;

    const candidateDistances = [1000, 5000, 10000, 15000, 20000];
    const distances = customSplits
      .map(split => split.distanceM)
      .filter(distance => Number.isFinite(distance) && distance > 0);
    if (distances.length !== customSplits.length) return null;

    for (const candidate of candidateDistances) {
      let nearTarget = 0;
      let shortRemainders = 0;

      distances.forEach((distance, index) => {
        if (this.areCloseValues(distance, candidate, 120)) {
          nearTarget += 1;
          return;
        }

        const isLast = index === distances.length - 1;
        if (isLast && distance < candidate - 120 && distance > 0) {
          shortRemainders += 1;
        }
      });

      if (nearTarget >= distances.length - 1 && shortRemainders <= 1) {
        return candidate;
      }
    }

    return null;
  }

  private buildRouteZoneRows(sessionId: string, details: RouteImportDetails): ActivityHeartRateZoneInsert[] {
    return details.heartRateZones.map(zone => ({
      session_id: sessionId,
      zone: zone.zone,
      duration_s: Math.max(0, Math.round(zone.durationSeconds)),
      percentage: Number.parseFloat(Math.max(0, Math.min(100, zone.percentage)).toFixed(2)),
    }));
  }

  private async replaceRouteLaps(ctx: UserCtx, sessionId: string, lapRows: ActivityLapInsert[]): Promise<void> {
    const { data: previousLaps, error: previousLapsError } = await ctx.supabase
      .from('activity_laps')
      .select('*')
      .eq('session_id', sessionId);

    if (previousLapsError) throw new InternalServerErrorException('Failed to read existing route laps');

    try {
      const { error: deleteLapsError } = await ctx.supabase.from('activity_laps').delete().eq('session_id', sessionId);
      if (deleteLapsError) throw deleteLapsError;

      const { error: insertLapsError } = await ctx.supabase.from('activity_laps').insert(lapRows);
      if (insertLapsError) throw insertLapsError;
    } catch (error) {
      await this.restoreRouteLaps(ctx, sessionId, previousLaps ?? []);
      throw new InternalServerErrorException('Failed to replace route laps', { cause: error });
    }
  }

  private async restoreRouteLaps(ctx: UserCtx, sessionId: string, previousLaps: ActivityLap[]): Promise<void> {
    const { error: clearLapsError } = await ctx.supabase.from('activity_laps').delete().eq('session_id', sessionId);
    if (clearLapsError) return;
    if (previousLaps.length === 0) return;

    const previousLapRows: ActivityLapInsert[] = previousLaps.map(lap => ({
      id: lap.id,
      session_id: lap.session_id,
      user_id: lap.user_id,
      lap_index: lap.lap_index,
      lap_type: lap.lap_type,
      distance_m: lap.distance_m,
      duration_s: lap.duration_s,
      avg_heart_rate: lap.avg_heart_rate,
      max_heart_rate: lap.max_heart_rate,
      avg_pace_s_per_km: lap.avg_pace_s_per_km,
      split_group: lap.split_group,
      split_group_order: lap.split_group_order,
      split_distance_m: lap.split_distance_m,
      start_offset_s: lap.start_offset_s,
      end_offset_s: lap.end_offset_s,
    }));

    await ctx.supabase.from('activity_laps').insert(previousLapRows);
  }

  private async replaceRouteHeartRateZones(
    ctx: UserCtx,
    sessionId: string,
    zoneRows: ActivityHeartRateZoneInsert[],
  ): Promise<void> {
    const { error: deleteZonesError } = await ctx.supabase
      .from('activity_heart_rate_zones')
      .delete()
      .eq('session_id', sessionId);

    if (deleteZonesError) throw new InternalServerErrorException('Failed to replace route heart-rate zones');

    const { error: insertZonesError } = await ctx.supabase.from('activity_heart_rate_zones').insert(zoneRows);
    if (insertZonesError) throw new InternalServerErrorException('Failed to insert route heart-rate zones');
  }
}
