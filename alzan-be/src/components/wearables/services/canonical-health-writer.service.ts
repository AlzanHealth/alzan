import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { Json } from '../../../types/database.types';
import { Insert, Update } from '../../../types/requests.types';
import { SupabaseAdminService } from '../../../core/supabase/supabase.service';
import {
  CanonicalHealthMetricSample,
  CanonicalSleepStageInterval,
  ProviderDailyActivityCanonical,
  ProviderRecoveryCanonical,
  ProviderSleepCanonical,
} from '../../activity-import/parsers/activity-import-canonical.types';
import {
  CanonicalProvenance,
  HealthMetricSampleInput,
  UpsertDailyActivityInput,
  UpsertRecoveryInput,
  UpsertSleepInput,
} from '../domain/wearable.types';
import { RawPayloadService } from './raw-payload.service';

type DailyStepsInsert = Insert<'daily_steps'>;
type DailyStepsUpdate = Update<'daily_steps'>;
type StepIntervalInsert = Insert<'step_intervals'>;
type SleepSessionInsert = Insert<'sleep_sessions'>;
type SleepSessionUpdate = Update<'sleep_sessions'>;
type SleepStageIntervalInsert = Insert<'sleep_stage_intervals'>;
type DailyRecoveryInsert = Insert<'daily_recovery'>;
type DailyRecoveryUpdate = Update<'daily_recovery'>;
type HealthMetricSampleInsert = Insert<'health_metric_samples'>;
type HealthMetricSampleUpdate = Update<'health_metric_samples'>;
type Vo2MaxLogInsert = Insert<'vo2_max_logs'>;
type WeightLogInsert = Insert<'weight_logs'>;
type RestingHrLogInsert = Insert<'resting_hr_logs'>;

const INSERT_CHUNK_SIZE = 1000;

@Injectable()
export class CanonicalHealthWriterService {
  constructor(
    private readonly supabaseAdminService: SupabaseAdminService,
    private readonly rawPayloadService: RawPayloadService,
  ) {}

  public async upsertDailyActivity(input: UpsertDailyActivityInput): Promise<string> {
    const existingId = await this.findDailyStepsId(input.userId, input.dailyActivity, input.provenance);
    const payload = this.buildDailyStepsPayload(input);
    const dailyStepsId = existingId
      ? await this.updateDailySteps(existingId, payload)
      : await this.insertOrUpdateDailyStepsAfterConflict(
          input.userId,
          input.dailyActivity,
          input.provenance,
          payload as DailyStepsInsert,
        );
    await this.replaceStepIntervals(dailyStepsId, input.userId, input.dailyActivity, input.provenance);
    await this.rawPayloadService.linkPayload({
      rawPayloadId: input.provenance.rawPayloadId,
      relatedTable: 'daily_steps',
      relatedId: dailyStepsId,
    });
    return dailyStepsId;
  }

  public async upsertSleep(input: UpsertSleepInput): Promise<string> {
    const existingId = await this.findSleepSessionId(input.userId, input.sleep, input.provenance);
    const payload = this.buildSleepSessionPayload(input);
    const sleepSessionId = existingId
      ? await this.updateSleepSession(existingId, payload)
      : await this.insertSleepSession(payload as SleepSessionInsert);
    await this.replaceSleepStages(sleepSessionId, input.userId, input.sleep.stageIntervals ?? [], input.provenance);
    await this.writeCanonicalHealthSamples(
      input.userId,
      input.provenance,
      input.sleep.healthSamples ?? [],
      sleepSessionId,
      null,
    );
    await this.rawPayloadService.linkPayload({
      rawPayloadId: input.provenance.rawPayloadId,
      relatedTable: 'sleep_sessions',
      relatedId: sleepSessionId,
    });
    return sleepSessionId;
  }

  public async upsertRecovery(input: UpsertRecoveryInput): Promise<string> {
    const existingId = await this.findDailyRecoveryId(input.userId, input.recovery, input.provenance);
    const payload = this.buildDailyRecoveryPayload(input);
    const recoveryId = existingId
      ? await this.updateDailyRecovery(existingId, payload)
      : await this.insertDailyRecovery(payload as DailyRecoveryInsert);
    await this.writeCanonicalHealthSamples(
      input.userId,
      input.provenance,
      input.recovery.healthSamples ?? [],
      null,
      null,
    );
    await this.rawPayloadService.linkPayload({
      rawPayloadId: input.provenance.rawPayloadId,
      relatedTable: 'daily_recovery',
      relatedId: recoveryId,
    });
    return recoveryId;
  }

  public async writeHealthSample(input: HealthMetricSampleInput): Promise<string> {
    const existingId = await this.findHealthMetricSampleId(input);
    const payload: HealthMetricSampleInsert = {
      user_id: input.userId,
      provider: input.provider,
      source_channel: input.sourceChannel,
      source_package: input.sourcePackage,
      source_record_id: input.sourceRecordId,
      metric_type: input.metricType,
      recorded_at: input.recordedAt,
      local_date: input.localDate,
      timezone: input.timezone,
      value: input.value,
      unit: input.unit,
      sleep_session_id: input.sleepSessionId ?? null,
      activity_session_id: input.activitySessionId ?? null,
      raw_payload_id: input.rawPayloadId ?? null,
      raw_payload: this.toJson(input.rawPayload),
    };
    const sampleId = existingId
      ? await this.updateHealthSample(existingId, payload)
      : await this.insertHealthSample(payload);
    await this.writeDerivedMetricLogs(input);
    return sampleId;
  }

  /** Inserts unseen provider samples and refreshes corrected samples in a bounded window. */
  public async replaceHealthMetricSamples(input: {
    userId: string;
    provider: HealthMetricSampleInsert['provider'];
    sourceChannel: string;
    from: string;
    to: string;
    rows: HealthMetricSampleInsert[];
  }): Promise<number> {
    const existingBySourceId = new Map<
      string,
      Pick<HealthMetricSampleInsert, 'value' | 'unit' | 'recorded_at' | 'local_date' | 'timezone'> & {
        id: string;
      }
    >();
    for (let offset = 0; ; offset += INSERT_CHUNK_SIZE) {
      const { data: existingRows, error: lookupError } = await this.supabaseAdminService.client
        .from('health_metric_samples')
        .select('id, source_record_id, value, unit, recorded_at, local_date, timezone')
        .eq('user_id', input.userId)
        .eq('provider', input.provider)
        .eq('source_channel', input.sourceChannel)
        .is('source_package', null)
        .gte('recorded_at', input.from)
        .lt('recorded_at', input.to)
        .order('id', { ascending: true })
        .range(offset, offset + INSERT_CHUNK_SIZE - 1);
      if (lookupError) throw new InternalServerErrorException('WEARABLE_HEALTH_SAMPLES_LOOKUP_FAILED');
      for (const row of existingRows ?? []) {
        if (row.source_record_id) existingBySourceId.set(row.source_record_id, row);
      }
      if (!existingRows || existingRows.length < INSERT_CHUNK_SIZE) break;
    }
    const seenIncomingIds = new Set<string>();
    const unseenRows = input.rows.filter(row => {
      if (!row.source_record_id) return true;
      if (existingBySourceId.has(row.source_record_id) || seenIncomingIds.has(row.source_record_id)) return false;
      seenIncomingIds.add(row.source_record_id);
      return true;
    });
    for (const row of input.rows) {
      if (!row.source_record_id) continue;
      const existing = existingBySourceId.get(row.source_record_id);
      if (!existing?.id) continue;
      const changed =
        existing.value !== row.value ||
        existing.unit !== row.unit ||
        existing.recorded_at !== row.recorded_at ||
        existing.local_date !== row.local_date ||
        existing.timezone !== row.timezone;
      if (!changed) continue;
      const { error } = await this.supabaseAdminService.client
        .from('health_metric_samples')
        .update({
          value: row.value,
          unit: row.unit,
          recorded_at: row.recorded_at,
          local_date: row.local_date,
          timezone: row.timezone,
          raw_payload: row.raw_payload,
        })
        .eq('id', existing.id)
        .eq('user_id', input.userId)
        .eq('provider', input.provider)
        .eq('source_channel', input.sourceChannel)
        .is('source_package', null);
      if (error) throw new InternalServerErrorException('WEARABLE_HEALTH_SAMPLES_UPDATE_FAILED');
    }
    for (let index = 0; index < unseenRows.length; index += INSERT_CHUNK_SIZE) {
      const { error } = await this.supabaseAdminService.client
        .from('health_metric_samples')
        .insert(unseenRows.slice(index, index + INSERT_CHUNK_SIZE));
      if (error) throw new InternalServerErrorException('WEARABLE_HEALTH_SAMPLES_INSERT_FAILED');
    }
    return unseenRows.length;
  }

  private async findDailyStepsId(
    userId: string,
    dailyActivity: ProviderDailyActivityCanonical,
    provenance: CanonicalProvenance,
  ): Promise<string | null> {
    let query = this.supabaseAdminService.client
      .from('daily_steps')
      .select('id')
      .eq('user_id', userId)
      .eq('date', dailyActivity.date)
      .eq('source', provenance.provider);
    query = provenance.sourcePackage
      ? query.eq('source_package', provenance.sourcePackage)
      : query.is('source_package', null);
    const { data, error } = await query.maybeSingle();
    if (error) throw new InternalServerErrorException('WEARABLE_DAILY_STEPS_LOOKUP_FAILED');
    return data?.id ?? null;
  }

  private buildDailyStepsPayload(input: UpsertDailyActivityInput): DailyStepsInsert {
    const daily = input.dailyActivity;
    return {
      user_id: input.userId,
      date: daily.date,
      timezone: daily.timezone,
      source: input.provenance.provider,
      total_steps: Math.max(0, Math.round(daily.totalSteps ?? 0)),
      active_steps: daily.activeSteps == null ? null : Math.round(daily.activeSteps),
      walking_steps: daily.walkingSteps == null ? null : Math.round(daily.walkingSteps),
      running_steps: daily.runningSteps == null ? null : Math.round(daily.runningSteps),
      distance_m: daily.distanceM,
      active_distance_m: daily.activeDistanceM,
      calories_kcal: daily.caloriesKcal,
      active_calories_kcal: daily.activeCaloriesKcal,
      floors_climbed: daily.floorsClimbed == null ? null : Math.round(daily.floorsClimbed),
      step_goal: daily.stepGoal == null ? null : Math.round(daily.stepGoal),
      goal_achieved: daily.goalAchieved,
      sedentary_minutes: daily.sedentaryMinutes,
      lightly_active_min: daily.lightlyActiveMin,
      fairly_active_min: daily.fairlyActiveMin,
      very_active_min: daily.veryActiveMin,
      data_quality: daily.totalSteps == null ? 'partial' : 'complete',
      source_record_id: input.provenance.sourceRecordId ?? daily.sourceRecordId ?? null,
      source_updated_at: input.provenance.sourceUpdatedAt ?? daily.sourceUpdatedAt ?? null,
      raw_payload: this.toJson(daily.rawPayload),
      source_channel: input.provenance.sourceChannel,
      source_package: input.provenance.sourcePackage,
      source_provider_key: input.provenance.sourceProviderKey,
      raw_payload_id: input.provenance.rawPayloadId,
      synced_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
  }

  private async insertDailySteps(payload: DailyStepsInsert): Promise<string> {
    const { data, error } = await this.supabaseAdminService.client
      .from('daily_steps')
      .insert(payload)
      .select('id')
      .single();
    if (error) throw error;
    return data.id;
  }

  private async insertOrUpdateDailyStepsAfterConflict(
    userId: string,
    dailyActivity: ProviderDailyActivityCanonical,
    provenance: CanonicalProvenance,
    payload: DailyStepsInsert,
  ): Promise<string> {
    try {
      return await this.insertDailySteps(payload);
    } catch (error: unknown) {
      if (!this.isUniqueViolation(error)) throw new InternalServerErrorException('WEARABLE_DAILY_STEPS_INSERT_FAILED');
      const existingId = await this.findDailyStepsId(userId, dailyActivity, provenance);
      if (!existingId) throw new InternalServerErrorException('WEARABLE_DAILY_STEPS_CONFLICT_LOOKUP_FAILED');
      return this.updateDailySteps(existingId, payload);
    }
  }

  private async updateDailySteps(id: string, payload: DailyStepsUpdate): Promise<string> {
    const { error } = await this.supabaseAdminService.client.from('daily_steps').update(payload).eq('id', id);
    if (error) throw new InternalServerErrorException('WEARABLE_DAILY_STEPS_UPDATE_FAILED');
    return id;
  }

  private isUniqueViolation(error: unknown): boolean {
    if (typeof error !== 'object' || error === null) return false;
    return (error as { code?: unknown }).code === '23505';
  }

  private async replaceStepIntervals(
    dailyStepsId: string,
    userId: string,
    dailyActivity: ProviderDailyActivityCanonical,
    provenance: CanonicalProvenance,
  ): Promise<void> {
    const { error: deleteError } = await this.supabaseAdminService.client
      .from('step_intervals')
      .delete()
      .eq('daily_steps_id', dailyStepsId);
    if (deleteError) throw new InternalServerErrorException('WEARABLE_STEP_INTERVALS_DELETE_FAILED');
    const rows: StepIntervalInsert[] = dailyActivity.intervals.flatMap(interval => {
      if (!interval.endTime) return [];
      return [
        {
          user_id: userId,
          daily_steps_id: dailyStepsId,
          source: provenance.provider,
          start_time: interval.startTime,
          end_time: interval.endTime,
          timezone: dailyActivity.timezone,
          steps: Math.max(0, Math.round(interval.steps ?? 0)),
          distance_m: interval.distanceM,
          calories_kcal: interval.caloriesKcal,
          source_record_id: provenance.sourceRecordId,
          raw_payload: this.toJson(interval.rawPayload),
          source_channel: provenance.sourceChannel,
          source_package: provenance.sourcePackage,
          source_provider_key: provenance.sourceProviderKey,
          raw_payload_id: provenance.rawPayloadId,
        },
      ];
    });
    await this.insertInChunks('step_intervals', rows, 'WEARABLE_STEP_INTERVALS_INSERT_FAILED');
  }

  private async findSleepSessionId(
    userId: string,
    sleep: ProviderSleepCanonical,
    provenance: CanonicalProvenance,
  ): Promise<string | null> {
    const recordId = provenance.sourceRecordId ?? sleep.sourceSleepId ?? sleep.sourceRecordId;
    if (recordId) {
      let query = this.supabaseAdminService.client
        .from('sleep_sessions')
        .select('id')
        .eq('user_id', userId)
        .eq('source', provenance.provider)
        .eq('source_record_id', recordId);
      query = provenance.sourcePackage
        ? query.eq('source_package', provenance.sourcePackage)
        : query.is('source_package', null);
      const { data, error } = await query.maybeSingle();
      if (error) throw new InternalServerErrorException('WEARABLE_SLEEP_LOOKUP_FAILED');
      if (data?.id) return data.id;
    }

    const { data, error } = await this.supabaseAdminService.client
      .from('sleep_sessions')
      .select('id')
      .eq('user_id', userId)
      .eq('source', provenance.provider)
      .eq('date', sleep.date)
      .eq('start_time', sleep.startTime)
      .maybeSingle();
    if (error) throw new InternalServerErrorException('WEARABLE_SLEEP_FALLBACK_LOOKUP_FAILED');
    return data?.id ?? null;
  }

  private buildSleepSessionPayload(input: UpsertSleepInput): SleepSessionInsert {
    const sleep = input.sleep;
    const endTime = this.ensureEndAfterStart(sleep.startTime, sleep.endTime);
    return {
      user_id: input.userId,
      source: input.provenance.provider,
      date: sleep.date,
      timezone: sleep.timezone,
      start_time: sleep.startTime,
      end_time: endTime,
      bedtime_start: sleep.bedtimeStart,
      bedtime_end: sleep.bedtimeEnd,
      sleep_start: sleep.startTime,
      sleep_end: endTime,
      is_main_sleep: !sleep.isNap,
      is_nap: sleep.isNap,
      duration_in_bed_min: sleep.durationInBedMin ?? null,
      total_sleep_min: sleep.totalSleepMin,
      awake_min: sleep.awakeMin,
      light_sleep_min: sleep.lightSleepMin,
      deep_sleep_min: sleep.deepSleepMin,
      rem_sleep_min: sleep.remSleepMin,
      sleep_latency_min: sleep.sleepLatencyMin,
      waso_min: sleep.wasoMin,
      after_wakeup_min: sleep.afterWakeupMin,
      sleep_score: sleep.sleepScore,
      avg_heart_rate_bpm: sleep.avgHeartRateBpm,
      min_heart_rate_bpm: sleep.minHeartRateBpm,
      max_heart_rate_bpm: sleep.maxHeartRateBpm,
      resting_hr_bpm: sleep.restingHrBpm,
      avg_hrv_ms: sleep.avgHrvMs,
      hrv_rmssd_ms: sleep.hrvRmssdMs,
      avg_respiratory_rpm: sleep.avgRespiratoryRpm,
      avg_spo2_pct: sleep.avgSpo2Pct,
      min_spo2_pct: sleep.minSpo2Pct,
      max_spo2_pct: sleep.maxSpo2Pct ?? null,
      data_quality: 'partial',
      source_sleep_id: sleep.sourceSleepId,
      source_record_id: input.provenance.sourceRecordId ?? sleep.sourceRecordId ?? sleep.sourceSleepId,
      source_updated_at: input.provenance.sourceUpdatedAt ?? sleep.sourceUpdatedAt ?? null,
      raw_payload: this.toJson(sleep.rawPayload),
      source_channel: input.provenance.sourceChannel,
      source_package: input.provenance.sourcePackage,
      source_provider_key: input.provenance.sourceProviderKey,
      raw_payload_id: input.provenance.rawPayloadId,
      synced_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
  }

  private async insertSleepSession(payload: SleepSessionInsert): Promise<string> {
    const { data, error } = await this.supabaseAdminService.client
      .from('sleep_sessions')
      .insert(payload)
      .select('id')
      .single();
    if (error) throw new InternalServerErrorException('WEARABLE_SLEEP_INSERT_FAILED');
    return data.id;
  }

  private async updateSleepSession(id: string, payload: SleepSessionUpdate): Promise<string> {
    const { error } = await this.supabaseAdminService.client.from('sleep_sessions').update(payload).eq('id', id);
    if (error) throw new InternalServerErrorException('WEARABLE_SLEEP_UPDATE_FAILED');
    return id;
  }

  private async replaceSleepStages(
    sleepSessionId: string,
    userId: string,
    stages: CanonicalSleepStageInterval[],
    provenance: CanonicalProvenance,
  ): Promise<void> {
    const { error: deleteError } = await this.supabaseAdminService.client
      .from('sleep_stage_intervals')
      .delete()
      .eq('sleep_session_id', sleepSessionId);
    if (deleteError) throw new InternalServerErrorException('WEARABLE_SLEEP_STAGES_DELETE_FAILED');
    const rows: SleepStageIntervalInsert[] = stages.map(stage => ({
      user_id: userId,
      sleep_session_id: sleepSessionId,
      source: provenance.provider,
      start_time: stage.startTime,
      end_time: stage.endTime,
      duration_min: this.minutesBetween(stage.startTime, stage.endTime),
      stage: stage.stage,
      provider_stage: stage.providerStage,
      confidence: stage.confidence,
      raw_payload: this.toJson(stage.rawPayload),
      source_channel: provenance.sourceChannel,
      source_package: provenance.sourcePackage,
      source_record_id: provenance.sourceRecordId,
      raw_payload_id: provenance.rawPayloadId,
    }));
    await this.insertInChunks('sleep_stage_intervals', rows, 'WEARABLE_SLEEP_STAGES_INSERT_FAILED');
  }

  private async findDailyRecoveryId(
    userId: string,
    recovery: ProviderRecoveryCanonical,
    provenance: CanonicalProvenance,
  ): Promise<string | null> {
    let query = this.supabaseAdminService.client
      .from('daily_recovery')
      .select('id')
      .eq('user_id', userId)
      .eq('date', recovery.date)
      .eq('source', provenance.provider);
    query = provenance.sourcePackage
      ? query.eq('source_package', provenance.sourcePackage)
      : query.is('source_package', null);
    const { data, error } = await query.maybeSingle();
    if (error) throw new InternalServerErrorException('WEARABLE_RECOVERY_LOOKUP_FAILED');
    return data?.id ?? null;
  }

  private buildDailyRecoveryPayload(input: UpsertRecoveryInput): DailyRecoveryInsert {
    const recovery = input.recovery;
    return {
      user_id: input.userId,
      date: recovery.date,
      timezone: recovery.timezone,
      source: input.provenance.provider,
      recovery_score: recovery.recoveryScore,
      readiness_score: recovery.readinessScore,
      sleep_score: recovery.sleepScore,
      strain_score: recovery.strainScore,
      body_battery_start: recovery.bodyBatteryStart,
      body_battery_min: recovery.bodyBatteryMin,
      body_battery_max: recovery.bodyBatteryMax,
      body_battery_end: recovery.bodyBatteryEnd,
      resting_hr_bpm: recovery.restingHrBpm,
      avg_hrv_ms: recovery.avgHrvMs ?? recovery.hrvRmssdMs,
      temp_deviation_c: recovery.temperatureDeviationC,
      respiratory_rate_rpm: recovery.respiratoryRateRpm,
      spo2_avg_pct: recovery.spo2AvgPct,
      data_quality: 'partial',
      source_record_id: input.provenance.sourceRecordId ?? recovery.sourceRecordId ?? null,
      raw_payload: this.toJson(recovery.rawPayload),
      source_channel: input.provenance.sourceChannel,
      source_package: input.provenance.sourcePackage,
      source_provider_key: input.provenance.sourceProviderKey,
      raw_payload_id: input.provenance.rawPayloadId,
      synced_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
  }

  private async insertDailyRecovery(payload: DailyRecoveryInsert): Promise<string> {
    const { data, error } = await this.supabaseAdminService.client
      .from('daily_recovery')
      .insert(payload)
      .select('id')
      .single();
    if (error) throw new InternalServerErrorException('WEARABLE_RECOVERY_INSERT_FAILED');
    return data.id;
  }

  private async updateDailyRecovery(id: string, payload: DailyRecoveryUpdate): Promise<string> {
    const { error } = await this.supabaseAdminService.client.from('daily_recovery').update(payload).eq('id', id);
    if (error) throw new InternalServerErrorException('WEARABLE_RECOVERY_UPDATE_FAILED');
    return id;
  }

  private async writeCanonicalHealthSamples(
    userId: string,
    provenance: CanonicalProvenance,
    samples: CanonicalHealthMetricSample[],
    sleepSessionId: string | null,
    activitySessionId: string | null,
  ): Promise<void> {
    for (const sample of samples) {
      await this.writeHealthSample({
        userId,
        provider: provenance.provider,
        sourceChannel: provenance.sourceChannel,
        sourcePackage: provenance.sourcePackage,
        sourceRecordId: sample.sourceRecordId ?? provenance.sourceRecordId,
        metricType: sample.metricType,
        recordedAt: sample.recordedAt,
        localDate: sample.localDate ?? sample.recordedAt.slice(0, 10),
        timezone: sample.timezone ?? null,
        value: sample.value,
        unit: sample.unit,
        sleepSessionId,
        activitySessionId,
        rawPayloadId: provenance.rawPayloadId,
        rawPayload: sample.rawPayload,
      });
    }
  }

  private async findHealthMetricSampleId(input: HealthMetricSampleInput): Promise<string | null> {
    if (input.sourceRecordId) {
      let query = this.supabaseAdminService.client
        .from('health_metric_samples')
        .select('id')
        .eq('user_id', input.userId)
        .eq('provider', input.provider)
        .eq('source_channel', input.sourceChannel)
        .eq('metric_type', input.metricType)
        .eq('source_record_id', input.sourceRecordId);
      query = input.sourcePackage ? query.eq('source_package', input.sourcePackage) : query.is('source_package', null);
      const { data, error } = await query.maybeSingle();
      if (error) throw new InternalServerErrorException('WEARABLE_HEALTH_SAMPLE_LOOKUP_FAILED');
      if (data?.id) return data.id;
    }

    let query = this.supabaseAdminService.client
      .from('health_metric_samples')
      .select('id')
      .eq('user_id', input.userId)
      .eq('provider', input.provider)
      .eq('source_channel', input.sourceChannel)
      .eq('metric_type', input.metricType)
      .eq('recorded_at', input.recordedAt);
    query = input.sourcePackage ? query.eq('source_package', input.sourcePackage) : query.is('source_package', null);
    const { data, error } = await query.maybeSingle();
    if (error) throw new InternalServerErrorException('WEARABLE_HEALTH_SAMPLE_TIME_LOOKUP_FAILED');
    return data?.id ?? null;
  }

  private async insertHealthSample(payload: HealthMetricSampleInsert): Promise<string> {
    const { data, error } = await this.supabaseAdminService.client
      .from('health_metric_samples')
      .insert(payload)
      .select('id')
      .single();
    if (error) throw new InternalServerErrorException('WEARABLE_HEALTH_SAMPLE_INSERT_FAILED');
    return data.id;
  }

  private async updateHealthSample(id: string, payload: HealthMetricSampleUpdate): Promise<string> {
    const { error } = await this.supabaseAdminService.client.from('health_metric_samples').update(payload).eq('id', id);
    if (error) throw new InternalServerErrorException('WEARABLE_HEALTH_SAMPLE_UPDATE_FAILED');
    return id;
  }

  private async writeDerivedMetricLogs(input: HealthMetricSampleInput): Promise<void> {
    if (input.metricType === 'vo2_max') await this.upsertVo2Max(input);
    if (input.metricType === 'weight_kg') await this.upsertWeight(input);
    if (input.metricType === 'body_fat_percent') await this.updateBodyFat(input);
    if (input.metricType === 'resting_heart_rate') await this.upsertRestingHeartRate(input);
  }

  private async upsertVo2Max(input: HealthMetricSampleInput): Promise<void> {
    if (input.value <= 0 || input.value > 100) return;
    const existingId = await this.findVo2MaxLogId(input);
    const payload: Vo2MaxLogInsert = {
      user_id: input.userId,
      measured_at: input.recordedAt,
      value_ml_kg_min: input.value,
      provider: input.provider,
      source_channel: input.sourceChannel,
      source_package: input.sourcePackage,
      source_record_id: input.sourceRecordId,
      activity_session_id: input.activitySessionId ?? null,
      raw_payload_id: input.rawPayloadId ?? null,
    };
    if (existingId) {
      const { error } = await this.supabaseAdminService.client
        .from('vo2_max_logs')
        .update(payload)
        .eq('id', existingId);
      if (error) throw new InternalServerErrorException('WEARABLE_VO2_MAX_UPDATE_FAILED');
      return;
    }
    const { error } = await this.supabaseAdminService.client.from('vo2_max_logs').insert(payload);
    if (error) throw new InternalServerErrorException('WEARABLE_VO2_MAX_INSERT_FAILED');
  }

  private async findVo2MaxLogId(input: HealthMetricSampleInput): Promise<string | null> {
    let query = this.supabaseAdminService.client
      .from('vo2_max_logs')
      .select('id')
      .eq('user_id', input.userId)
      .eq('provider', input.provider)
      .eq('measured_at', input.recordedAt);
    query = input.sourceChannel ? query.eq('source_channel', input.sourceChannel) : query.is('source_channel', null);
    query = input.sourcePackage ? query.eq('source_package', input.sourcePackage) : query.is('source_package', null);
    const { data, error } = await query.maybeSingle();
    if (error) throw new InternalServerErrorException('WEARABLE_VO2_MAX_LOOKUP_FAILED');
    return data?.id ?? null;
  }

  private async upsertWeight(input: HealthMetricSampleInput): Promise<void> {
    if (input.value <= 0) return;
    const existingId = await this.findWeightLogId(input);
    const payload: WeightLogInsert = {
      user_id: input.userId,
      measured_at: input.recordedAt,
      weight_kg: input.value,
      source: input.provider,
      source_channel: input.sourceChannel,
      source_package: input.sourcePackage,
      source_record_id: input.sourceRecordId,
      raw_payload_id: input.rawPayloadId ?? null,
    };
    if (existingId) {
      const { error } = await this.supabaseAdminService.client.from('weight_logs').update(payload).eq('id', existingId);
      if (error) throw new InternalServerErrorException('WEARABLE_WEIGHT_UPDATE_FAILED');
      return;
    }
    const { error } = await this.supabaseAdminService.client.from('weight_logs').insert(payload);
    if (error) throw new InternalServerErrorException('WEARABLE_WEIGHT_INSERT_FAILED');
  }

  private async updateBodyFat(input: HealthMetricSampleInput): Promise<void> {
    const existingId = await this.findWeightLogId(input);
    if (!existingId) return;
    const { error } = await this.supabaseAdminService.client
      .from('weight_logs')
      .update({ bodyfat_percent: input.value })
      .eq('id', existingId);
    if (error) throw new InternalServerErrorException('WEARABLE_BODY_FAT_UPDATE_FAILED');
  }

  private async findWeightLogId(input: HealthMetricSampleInput): Promise<string | null> {
    let query = this.supabaseAdminService.client
      .from('weight_logs')
      .select('id')
      .eq('user_id', input.userId)
      .eq('source', input.provider)
      .eq('measured_at', input.recordedAt);
    query = input.sourcePackage ? query.eq('source_package', input.sourcePackage) : query.is('source_package', null);
    const { data, error } = await query.maybeSingle();
    if (error) throw new InternalServerErrorException('WEARABLE_WEIGHT_LOOKUP_FAILED');
    return data?.id ?? null;
  }

  private async upsertRestingHeartRate(input: HealthMetricSampleInput): Promise<void> {
    const existingId = await this.findRestingHrLogId(input);
    const payload: RestingHrLogInsert = {
      user_id: input.userId,
      measured_at: input.recordedAt,
      resting_hr_bpm: Math.round(input.value),
      source: input.provider,
      source_channel: input.sourceChannel,
      source_package: input.sourcePackage,
      source_record_id: input.sourceRecordId,
      raw_payload_id: input.rawPayloadId ?? null,
    };
    if (existingId) {
      const { error } = await this.supabaseAdminService.client
        .from('resting_hr_logs')
        .update(payload)
        .eq('id', existingId);
      if (error) throw new InternalServerErrorException('WEARABLE_RESTING_HR_UPDATE_FAILED');
      return;
    }
    const { error } = await this.supabaseAdminService.client.from('resting_hr_logs').insert(payload);
    if (error) throw new InternalServerErrorException('WEARABLE_RESTING_HR_INSERT_FAILED');
  }

  private async findRestingHrLogId(input: HealthMetricSampleInput): Promise<string | null> {
    let query = this.supabaseAdminService.client
      .from('resting_hr_logs')
      .select('id')
      .eq('user_id', input.userId)
      .eq('source', input.provider)
      .eq('measured_at', input.recordedAt);
    query = input.sourcePackage ? query.eq('source_package', input.sourcePackage) : query.is('source_package', null);
    const { data, error } = await query.maybeSingle();
    if (error) throw new InternalServerErrorException('WEARABLE_RESTING_HR_LOOKUP_FAILED');
    return data?.id ?? null;
  }

  private ensureEndAfterStart(startTime: string, endTime: string): string {
    const startMs = Date.parse(startTime);
    const endMs = Date.parse(endTime);
    if (Number.isFinite(startMs) && Number.isFinite(endMs) && endMs > startMs) return endTime;
    return new Date(startMs + 1000).toISOString();
  }

  private minutesBetween(startTime: string, endTime: string): number {
    const startMs = Date.parse(startTime);
    const endMs = Date.parse(endTime);
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return 1 / 60;
    return (endMs - startMs) / 60000;
  }

  private toJson(value: Record<string, unknown> | null | undefined): Json | null {
    if (!value) return null;
    return value as Json;
  }

  private async insertInChunks<T extends StepIntervalInsert | SleepStageIntervalInsert>(
    table: 'step_intervals' | 'sleep_stage_intervals',
    rows: T[],
    errorCode: string,
  ): Promise<void> {
    for (let startIndex = 0; startIndex < rows.length; startIndex += INSERT_CHUNK_SIZE) {
      const chunk = rows.slice(startIndex, startIndex + INSERT_CHUNK_SIZE);
      const { error } = await this.supabaseAdminService.client.from(table).insert(chunk);
      if (error) throw new InternalServerErrorException(errorCode);
    }
  }
}
