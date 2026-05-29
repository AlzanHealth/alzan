import { Platform } from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { supabase } from '../../../lib/supabaseClient';
import { Asset } from 'expo-asset';
import * as FileSystem from 'expo-file-system/legacy';
import { format, parseISO } from 'date-fns';
import { convertDistanceToUi, convertSpeedToUi, convertWeightToUi } from '../../../utils/unitConversionUtils';
import {
  ActivityHeartRateZone,
  ActivityLap,
  DistanceUnit,
  EnduranceWorkoutStep,
  SportType,
  WeightUnit,
  WorkoutSet,
} from '../../../types/requests.types';
import iconSource from '../../../../assets/icon.png';
import { TranslationKey } from '../../../i18n/locales/en';
import { getPhaseLabel } from '../../../screens/training/helpers/phase.helper';
import i18n from '../../../i18n';
import { getDateFnsLocale } from '../../../i18n/dateLocale';

const loadAssetAsBase64 = async (module: number): Promise<string | null> => {
  try {
    const asset = Asset.fromModule(module);
    await asset.downloadAsync();
    if (!asset.localUri) return null;
    return await FileSystem.readAsStringAsync(asset.localUri, { encoding: 'base64' });
  } catch {
    return null;
  }
};

interface PDFExportOptions {
  startDate: string;
  endDate: string;
  user: {
    id: string;
    display_name?: string | null;
    email?: string;
  };
  webPrintWindow?: WebExportWindow | null;
}

interface WebExportWindow {
  document: {
    open: () => void;
    write: (content: string) => void;
    close: () => void;
  };
  focus?: () => void;
  print?: () => void;
  close?: () => void;
}

export type { WebExportWindow };

const SPORT_CONFIG: Record<string, { label: TranslationKey; color: string }> = {
  strength: { label: 'constants.strength', color: '#007AFF' },
  running: { label: 'constants.running', color: '#E9A73C' },
  cycling: { label: 'constants.cycling', color: '#E56353' },
  swimming: { label: 'constants.swimming', color: '#34AADC' },
  hiking: { label: 'constants.hiking', color: '#A9825A' },
  football: { label: 'constants.football', color: '#2E7D32' },
  basketball: { label: 'constants.basketball', color: '#FF9500' },
  tennis: { label: 'constants.tennis', color: '#F2D648' },
  padel: { label: 'constants.padel', color: '#8A5CC8' },
  martial_arts: { label: 'constants.martialArts', color: '#D64B7F' },
  climbing: { label: 'constants.climbing', color: '#6B8E4E' },
  other: { label: 'constants.other', color: '#8E8E93' },
};

const PHASE_COLORS: Record<string, string> = {
  warmup: '#34C759',
  interval: '#FF3B30',
  work: '#FF3B30',
  recovery: '#8E8E93',
  cooldown: '#5AC8FA',
  rest: '#8E8E93',
};

const t = (key: TranslationKey) => String(i18n.t(key));
const isEnglish = () => i18n.language?.startsWith('en');
const getPdfDatePattern = () => (isEnglish() ? 'MMMM d, yyyy' : 'd MMMM yyyy');
const getPdfDateTimePattern = () => (isEnglish() ? 'EEEE, MMMM d, HH:mm' : 'EEEE d MMMM, HH:mm');

const formatDuration = (seconds: number): string => {
  const normalized = Math.max(0, Math.round(seconds));
  const hrs = Math.floor(normalized / 3600);
  const mins = Math.floor((normalized % 3600) / 60);
  const secs = normalized % 60;
  if (hrs > 0) return `${hrs}h ${mins}m`;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const normalizeText = (value: string | null | undefined): string | null => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
};

const getStringField = (record: Record<string, unknown>, key: string): string | null => {
  const value = record[key];
  return typeof value === 'string' ? normalizeText(value) : null;
};

const isActivityLap = (value: unknown): value is ActivityLap => {
  if (!value || typeof value !== 'object') return false;

  const maybeLap = value as Record<string, unknown>;
  return (
    typeof maybeLap.id === 'string' && typeof maybeLap.session_id === 'string' && typeof maybeLap.lap_index === 'number'
  );
};

const resolveExerciseName = (exerciseRelation: unknown): string | null => {
  const exerciseValue = Array.isArray(exerciseRelation) ? exerciseRelation[0] : exerciseRelation;
  if (!exerciseValue || typeof exerciseValue !== 'object') return null;

  const record = exerciseValue as Record<string, unknown>;
  if (isEnglish()) {
    return (
      getStringField(record, 'base_name_en') ??
      getStringField(record, 'base_name_es') ??
      getStringField(record, 'base_name')
    );
  }

  return (
    getStringField(record, 'base_name_es') ??
    getStringField(record, 'base_name_en') ??
    getStringField(record, 'base_name')
  );
};

const toSportType = (value: string): SportType => {
  switch (value) {
    case 'strength':
    case 'running':
    case 'cycling':
    case 'swimming':
    case 'hiking':
    case 'football':
    case 'basketball':
    case 'tennis':
    case 'padel':
    case 'martial_arts':
    case 'climbing':
    case 'other':
      return value;
    default:
      return 'other';
  }
};

const formatSetType = (setType: string): string =>
  setType
    .split('_')
    .filter(Boolean)
    .map(word => `${word.charAt(0).toUpperCase()}${word.slice(1).toLowerCase()}`)
    .join(' ');

const formatElevation = (elevationM: number, distanceUnit: DistanceUnit): string => {
  if (distanceUnit === 'miles') {
    return `${Math.round(elevationM * 3.28084)} ft`;
  }
  return `${Math.round(elevationM)} m`;
};

const renderTagList = (items: string[]): string => {
  if (!items.length) return '';
  return items.map(item => `<span class="set-tag">${escapeHtml(item)}</span>`).join('');
};

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error && error.message.trim()) return error.message;
  if (typeof error === 'string' && error.trim()) return error;

  if (typeof error === 'object' && error !== null) {
    const maybeError = error as {
      message?: unknown;
      details?: unknown;
      hint?: unknown;
      code?: unknown;
    };
    const parts = [maybeError.message, maybeError.details, maybeError.hint, maybeError.code]
      .filter(part => typeof part === 'string' && part.trim())
      .map(part => String(part));

    if (parts.length > 0) {
      return parts.join(' · ');
    }
  }

  return t('nutrition.unknownError');
};

const openWebExportWindow = (): WebExportWindow | null => {
  if (Platform.OS !== 'web') return null;

  const maybeGlobal = globalThis as {
    open?: (url?: string, target?: string) => WebExportWindow | null;
  };
  if (typeof maybeGlobal.open !== 'function') return null;
  return maybeGlobal.open('', '_blank');
};

export const generateTrainingPDF = async ({ startDate, endDate, user, webPrintWindow }: PDFExportOptions) => {
  try {
    const userId = user.id;
    if (!userId) throw new Error('User ID not provided');

    const { data: prefsData } = await supabase
      .from('user_preferences')
      .select('distance_unit, weight_unit')
      .eq('user_id', userId)
      .single();

    const distanceUnit: DistanceUnit = prefsData?.distance_unit === 'miles' ? 'miles' : 'km';
    const weightUnit: WeightUnit = prefsData?.weight_unit === 'lb' ? 'lb' : 'kg';

    let finalDisplayName = user.display_name;
    if (!finalDisplayName) {
      const { data: profile } = await supabase.from('users').select('display_name').eq('id', userId).single();
      if (profile) finalDisplayName = profile.display_name;
    }
    finalDisplayName = finalDisplayName || t('training.pdfAthleteFallback');

    const iconBase64 = await loadAssetAsBase64(iconSource);
    const iconSrc = iconBase64 ? `data:image/png;base64,${iconBase64}` : null;

    const endDateInclusive = new Date(endDate);
    endDateInclusive.setDate(endDateInclusive.getDate() + 1);
    const endDateStr = endDateInclusive.toISOString();

    const { data: sessions, error: sessionsError } = await supabase
      .from('activity_sessions')
      .select(
        `
          *,
          workout_sets (
            *,
            exercise:exercises (
              *
            )
          ),
          activity_laps (
            *
          )
        `,
      )
      .eq('user_id', userId)
      .gte('start_time', startDate)
      .lt('start_time', endDateStr)
      .order('start_time', { ascending: true });

    if (sessionsError) throw new Error(getErrorMessage(sessionsError));
    if (!sessions?.length) throw new Error(t('training.pdfNoWorkoutsInRange'));

    const sessionIds = sessions.map(session => session.id);
    const heartRateZonesBySessionId: Record<string, ActivityHeartRateZone[]> = {};
    if (sessionIds.length > 0) {
      const { data: heartRateZones, error: heartRateZonesError } = await supabase
        .from('activity_heart_rate_zones')
        .select('*')
        .in('session_id', sessionIds)
        .order('zone', { ascending: false });

      if (heartRateZonesError) throw new Error(getErrorMessage(heartRateZonesError));

      (heartRateZones ?? []).forEach(zone => {
        const bucket = heartRateZonesBySessionId[zone.session_id] ?? [];
        bucket.push(zone);
        heartRateZonesBySessionId[zone.session_id] = bucket;
      });
    }

    const templateIdSet = new Set<string>();
    sessions.forEach(session => {
      if (session.endurance_template_id) {
        templateIdSet.add(session.endurance_template_id);
      }
    });

    const templateStepsMap: Record<string, EnduranceWorkoutStep[]> = {};
    const templateIds = Array.from(templateIdSet);
    if (templateIds.length > 0) {
      const { data: steps } = await supabase
        .from('endurance_workout_steps')
        .select('*')
        .in('template_id', templateIds)
        .order('order_index', { ascending: true });

      (steps || []).forEach(step => {
        if (!templateStepsMap[step.template_id]) {
          templateStepsMap[step.template_id] = [];
        }
        templateStepsMap[step.template_id].push(step);
      });
    }

    let totalVolume = 0;
    let totalDurationSeconds = 0;
    let totalDistanceM = 0;
    let totalCalories = 0;
    let totalSteps = 0;
    let totalElevGainM = 0;
    let totalElevLossM = 0;
    const avgHrSamples: number[] = [];

    const processedSessions = sessions.map(session => {
      let sessionVolume = 0;
      const isGym = session.sport_type === 'strength';
      const exerciseMap = new Map<string, WorkoutSet[]>();
      const workoutSets = session.workout_sets || [];
      const rawSessionLaps = Array.isArray(session.activity_laps) ? session.activity_laps : [];
      const sessionLaps = rawSessionLaps
        .filter(isActivityLap)
        .slice()
        .sort((a, b) => a.lap_index - b.lap_index);

      workoutSets.forEach(set => {
        const exerciseName = resolveExerciseName(set.exercise) || t('training.pdfUnknownExercise');

        if (!exerciseMap.has(exerciseName)) {
          exerciseMap.set(exerciseName, []);
        }
        exerciseMap.get(exerciseName)?.push(set);

        if (set.weight_kg > 0 && set.reps > 0) {
          sessionVolume += set.weight_kg * set.reps;
        }
      });

      totalVolume += sessionVolume;
      totalDurationSeconds += session.duration_s || 0;
      totalDistanceM += session.distance_m || 0;
      totalCalories += session.calories_kcal || 0;
      totalSteps += session.total_steps || 0;
      totalElevGainM += session.elev_gain_m || 0;
      totalElevLossM += session.elev_loss_m || 0;
      if (session.avg_heart_rate != null && session.avg_heart_rate > 0) {
        avgHrSamples.push(session.avg_heart_rate);
      }

      const templateSteps = session.endurance_template_id ? templateStepsMap[session.endurance_template_id] || [] : [];

      return {
        ...session,
        isGym,
        volume: sessionVolume,
        sessionNotes: normalizeText(session.description),
        exercises: Array.from(exerciseMap.entries()).map(([name, sets]) => ({
          name,
          sets: sets.slice().sort((a, b) => a.set_number - b.set_number),
        })),
        laps: sessionLaps,
        templateSteps,
        heartRateZones: heartRateZonesBySessionId[session.id] ?? [],
      };
    });

    const totalHours = Math.floor(totalDurationSeconds / 3600);
    const totalMinutes = Math.floor((totalDurationSeconds % 3600) / 60);
    const totalDistanceUi = convertDistanceToUi(totalDistanceM, distanceUnit, 1);
    const totalVolumeUi = convertWeightToUi(totalVolume, weightUnit, 0);
    const volumeSummary =
      totalVolumeUi.value >= 1000
        ? `${(totalVolumeUi.value / 1000).toFixed(1)}k ${totalVolumeUi.unit}`
        : `${totalVolumeUi.value.toFixed(0)} ${totalVolumeUi.unit}`;
    const dateLocale = getDateFnsLocale();
    const datePattern = getPdfDatePattern();
    const dateTimePattern = getPdfDateTimePattern();
    const averageHeartRate =
      avgHrSamples.length > 0
        ? Math.round(avgHrSamples.reduce((sum, value) => sum + value, 0) / avgHrSamples.length)
        : null;

    const renderOptionalSummaryCards = (): string => {
      const cards: Array<{ value: string; label: string }> = [];

      if (totalCalories > 0) {
        cards.push({ value: `${Math.round(totalCalories)}`, label: `${t('training.pdfMetricCalories')} (kcal)` });
      }
      if (averageHeartRate != null) {
        cards.push({ value: `${averageHeartRate}`, label: `${t('training.pdfAvgHr')} (bpm)` });
      }
      if (totalSteps > 0) {
        cards.push({ value: `${Math.round(totalSteps)}`, label: t('training.pdfMetricSteps') });
      }
      if (totalElevGainM > 0 || totalElevLossM > 0) {
        cards.push({
          value: `+${formatElevation(totalElevGainM, distanceUnit)} / -${formatElevation(totalElevLossM, distanceUnit)}`,
          label: t('training.pdfElevationBalance'),
        });
      }

      if (cards.length === 0) return '';

      return `
        <div class="summary-grid summary-grid-secondary">
          ${cards
            .map(
              card => `
                <div class="summary-card summary-card-secondary">
                  <div class="summary-val">${escapeHtml(card.value)}</div>
                  <div class="summary-label">${escapeHtml(card.label)}</div>
                </div>
              `,
            )
            .join('')}
        </div>
      `;
    };

    const formatStepTarget = (step: EnduranceWorkoutStep, sportType: SportType): string => {
      if (!step.target_type || step.target_type === 'none') return '';
      const min = step.target_min;
      const max = step.target_max;
      if (min == null && max == null) return '';

      if (step.target_type === 'heart_rate_zone' || (step.target_type === 'heart_rate' && (max ?? min ?? 0) <= 5)) {
        return `${t('training.hrZone')} ${max || min}`;
      }

      if (step.target_type === 'heart_rate') {
        if (min != null && max != null) return min === max ? `${min} bpm` : `${min}-${max} bpm`;
        return `${min || max} bpm`;
      }

      if (step.target_type === 'pace') {
        let mpsMin = 0;
        let mpsMax = 0;
        const isSwim = sportType === 'swimming';
        const distBase = isSwim ? 100 : 1000;

        if (min) mpsMin = distBase / min;
        if (max) mpsMax = distBase / max;

        const labelMin = min ? convertSpeedToUi(mpsMin, sportType, distanceUnit).label : '';
        const labelMax = max ? convertSpeedToUi(mpsMax, sportType, distanceUnit).label : '';

        if (min != null && max != null) return min === max ? labelMin : `${labelMin} - ${labelMax}`;
        return labelMin || labelMax;
      }

      if (step.target_type === 'power') {
        if (min != null && max != null) return min === max ? `${min}W` : `${min}-${max}W`;
        return `${min || max}W`;
      }

      if (step.target_type === 'rpe') {
        if (min != null && max != null) return min === max ? `RPE ${min}` : `RPE ${min}-${max}`;
        return `RPE ${min || max}`;
      }

      if (step.target_type === 'speed') {
        if (min != null && max != null) return min === max ? `${min}` : `${min}-${max}`;
        return `${min || max}`;
      }

      return '';
    };

    const renderTemplateSteps = (steps: EnduranceWorkoutStep[], sportType: SportType): string => {
      const topLevel = steps.filter(step => !step.parent_step_id);
      const getChildren = (id: string) => steps.filter(step => step.parent_step_id === id);

      const renderStep = (step: EnduranceWorkoutStep, isChild = false): string => {
        const children = getChildren(step.id);
        const isGroup = step.is_group || children.length > 0;
        const color = isGroup ? '#007AFF' : PHASE_COLORS[step.phase_type] || '#007AFF';
        const label = t(getPhaseLabel(step.phase_type, isGroup));

        let durationStr = '';
        if (step.duration_type === 'distance' && step.distance_m) {
          durationStr = convertDistanceToUi(step.distance_m, distanceUnit, 2).label;
        } else if (step.duration_type === 'time' && step.duration_s) {
          durationStr = formatDuration(step.duration_s);
        }

        const targetStr = formatStepTarget(step, sportType);
        const repsStr =
          (step.repetitions || 0) > 1 ? `<span class="step-badge">${escapeHtml(`${step.repetitions}x`)}</span>` : '';

        return `
          <div class="step-row ${isChild ? 'step-row-child' : ''}">
            <div class="step-stripe" style="background:${color};"></div>
            <div class="step-content">
              <div class="step-title-row">
                <span class="step-title" style="color:${color};">${escapeHtml(label)}</span>
                ${repsStr}
              </div>
              ${
                durationStr || targetStr
                  ? `
                    <div class="step-metrics">
                      ${durationStr ? `<span>${escapeHtml(durationStr)}</span>` : ''}
                      ${targetStr ? `<span>${escapeHtml(targetStr)}</span>` : ''}
                    </div>
                  `
                  : ''
              }
              ${
                children.length
                  ? `
                    <div class="step-children">
                      ${children.map(child => renderStep(child, true)).join('')}
                    </div>
                  `
                  : ''
              }
            </div>
          </div>
        `;
      };

      return topLevel.map(step => renderStep(step)).join('');
    };

    const renderSessionMetrics = (session: (typeof processedSessions)[number]): string => {
      const sportType = toSportType(session.sport_type);
      const stats: string[] = [];

      if (session.distance_m != null && session.distance_m > 0) {
        stats.push(
          `${t('training.pdfMetricDistance')}: ${convertDistanceToUi(session.distance_m, distanceUnit, 2).label}`,
        );
      }
      if (session.avg_speed_m_per_s != null && session.avg_speed_m_per_s > 0) {
        stats.push(
          `${t('training.pdfMetricPace')}: ${convertSpeedToUi(session.avg_speed_m_per_s, sportType, distanceUnit).label}`,
        );
      }
      if (session.elev_gain_m != null && session.elev_gain_m > 0) {
        stats.push(`${t('training.pdfMetricElevation')}: ${formatElevation(session.elev_gain_m, distanceUnit)}`);
      }
      if (session.elev_loss_m != null && session.elev_loss_m > 0) {
        stats.push(`${t('training.pdfMetricElevationLoss')}: ${formatElevation(session.elev_loss_m, distanceUnit)}`);
      }
      if (session.calories_kcal != null && session.calories_kcal > 0) {
        stats.push(`${t('training.pdfMetricCalories')}: ${Math.round(session.calories_kcal)} kcal`);
      }
      if (session.rpe != null) {
        stats.push(`${t('training.pdfMetricRpe')}: ${Math.round(session.rpe)}/10`);
      }
      if (session.avg_heart_rate != null && session.avg_heart_rate > 0) {
        stats.push(`${t('training.pdfAvgHr')}: ${Math.round(session.avg_heart_rate)} bpm`);
      }
      if (session.max_heart_rate != null && session.max_heart_rate > 0) {
        stats.push(`${t('training.pdfMaxHr')}: ${Math.round(session.max_heart_rate)} bpm`);
      }
      if (session.avg_cadence != null && session.avg_cadence > 0) {
        stats.push(`${t('training.pdfAvgCadence')}: ${Math.round(session.avg_cadence)}`);
      }
      if (session.max_cadence != null && session.max_cadence > 0) {
        stats.push(`${t('training.pdfMaxCadence')}: ${Math.round(session.max_cadence)}`);
      }
      if (session.avg_power_w != null && session.avg_power_w > 0) {
        stats.push(`${t('training.pdfAvgPower')}: ${Math.round(session.avg_power_w)}W`);
      }
      if (session.max_power_w != null && session.max_power_w > 0) {
        stats.push(`${t('training.pdfMaxPower')}: ${Math.round(session.max_power_w)}W`);
      }
      if (session.total_steps != null && session.total_steps > 0) {
        stats.push(`${t('training.pdfMetricSteps')}: ${Math.round(session.total_steps)}`);
      }
      if (session.vo2_max != null && session.vo2_max > 0) {
        stats.push(`${t('training.pdfVo2Max')}: ${Number(session.vo2_max).toFixed(1)}`);
      }
      if (session.recovery_time_s != null && session.recovery_time_s > 0) {
        stats.push(`${t('training.pdfRecoveryTime')}: ${formatDuration(session.recovery_time_s)}`);
      }
      if (session.avg_temp_c != null) {
        stats.push(`${t('training.pdfAvgTemperature')}: ${Math.round(session.avg_temp_c)}°C`);
      }
      if (session.max_temp_c != null) {
        stats.push(`${t('training.pdfMaxTemperature')}: ${Math.round(session.max_temp_c)}°C`);
      }
      if (session.total_sets != null && session.total_sets > 0) {
        stats.push(`${t('training.pdfTotalSets')}: ${Math.round(session.total_sets)}`);
      }
      if (session.total_reps != null && session.total_reps > 0) {
        stats.push(`${t('training.pdfTotalReps')}: ${Math.round(session.total_reps)}`);
      }
      if (session.total_volume_kg != null && session.total_volume_kg > 0) {
        stats.push(
          `${t('training.pdfStoredVolume')}: ${convertWeightToUi(session.total_volume_kg, weightUnit, 0).label}`,
        );
      }

      return stats.map(stat => escapeHtml(stat)).join(' · ');
    };

    const renderSetDetails = (set: WorkoutSet): string => {
      const primaryMetrics: string[] = [];
      const contextualMetrics: string[] = [];

      if (set.reps > 0) primaryMetrics.push(`${set.reps} ${t('training.repetitions').toLowerCase()}`);
      if (set.weight_kg > 0) primaryMetrics.push(convertWeightToUi(set.weight_kg, weightUnit, 1).label);
      if (set.distance_m != null && set.distance_m > 0)
        primaryMetrics.push(convertDistanceToUi(set.distance_m, distanceUnit, 2).label);
      if (set.duration_s != null && set.duration_s > 0) primaryMetrics.push(formatDuration(set.duration_s));

      if (set.set_type && set.set_type !== 'normal') {
        contextualMetrics.push(`${t('training.pdfSetType')}: ${formatSetType(set.set_type)}`);
      }
      if (set.is_warmup) contextualMetrics.push(t('training.pdfSetWarmup'));
      if (set.is_pr) contextualMetrics.push(t('training.pdfSetPr'));
      if (set.rest_s != null && set.rest_s > 0)
        contextualMetrics.push(`${t('training.pdfSetRest')}: ${formatDuration(set.rest_s)}`);
      if (set.pause_s != null && set.pause_s > 0)
        contextualMetrics.push(`${t('training.pdfSetPause')}: ${formatDuration(set.pause_s)}`);
      if (normalizeText(set.tempo)) contextualMetrics.push(`${t('training.pdfSetTempo')}: ${set.tempo}`);
      if (set.rpe != null) contextualMetrics.push(`${t('training.pdfSetRpe')}: ${Math.round(set.rpe)}/10`);
      if (set.avg_hr_bpm != null && set.avg_hr_bpm > 0)
        contextualMetrics.push(`${t('training.pdfAvgHr')}: ${Math.round(set.avg_hr_bpm)} bpm`);
      if (set.max_hr_bpm != null && set.max_hr_bpm > 0)
        contextualMetrics.push(`${t('training.pdfMaxHr')}: ${Math.round(set.max_hr_bpm)} bpm`);
      if (set.calories_kcal != null && set.calories_kcal > 0)
        contextualMetrics.push(`${t('training.pdfMetricCalories')}: ${Math.round(set.calories_kcal)} kcal`);

      const note = normalizeText(set.notes);

      const primaryTag = `${t('training.pdfSetLabel')} ${set.set_number}: ${primaryMetrics.join(' - ') || '-'}`;
      return `
        <div class="set-detail">
          <div class="sets-row">
            ${renderTagList([primaryTag, ...contextualMetrics])}
          </div>
          ${note ? `<div class="set-notes"><b>${escapeHtml(`${t('training.pdfSetNotes')}:`)}</b> ${escapeHtml(note)}</div>` : ''}
        </div>
      `;
    };

    const renderSessionLaps = (laps: ActivityLap[], sportType: SportType): string => {
      if (laps.length === 0) return '';

      return `
        <div class="template-section">
          <div class="template-title">${escapeHtml(t('training.partials'))}</div>
          <div class="laps-grid-header">
            <div>#</div>
            <div>${escapeHtml(t('training.pace'))}</div>
            <div class="lap-cell-right">${escapeHtml(t('settings.distance'))}</div>
            <div class="lap-cell-right">${escapeHtml(t('training.time'))}</div>
            <div class="lap-cell-right">${escapeHtml(t('training.pdfAvgHr'))}</div>
            <div class="lap-cell-right">${escapeHtml(t('training.pdfMaxHr'))}</div>
          </div>
          ${laps
            .map(lap => {
              const paceLabel =
                lap.avg_pace_s_per_km != null && lap.avg_pace_s_per_km > 0
                  ? convertSpeedToUi(1000 / lap.avg_pace_s_per_km, sportType, distanceUnit).label
                  : '-';
              const distanceLabel =
                lap.distance_m != null && lap.distance_m > 0
                  ? convertDistanceToUi(lap.distance_m, distanceUnit, 2).label
                  : '-';
              const durationLabel = lap.duration_s != null && lap.duration_s > 0 ? formatDuration(lap.duration_s) : '-';
              const avgHrLabel =
                lap.avg_heart_rate != null && lap.avg_heart_rate > 0 ? `${Math.round(lap.avg_heart_rate)} bpm` : '-';
              const maxHrLabel =
                lap.max_heart_rate != null && lap.max_heart_rate > 0 ? `${Math.round(lap.max_heart_rate)} bpm` : '-';

              return `
                <div class="laps-grid-row">
                  <div>${lap.lap_index}</div>
                  <div>${escapeHtml(paceLabel)}</div>
                  <div class="lap-cell-right">${escapeHtml(distanceLabel)}</div>
                  <div class="lap-cell-right">${escapeHtml(durationLabel)}</div>
                  <div class="lap-cell-right">${escapeHtml(avgHrLabel)}</div>
                  <div class="lap-cell-right">${escapeHtml(maxHrLabel)}</div>
                </div>
              `;
            })
            .join('')}
        </div>
      `;
    };

    const renderHeartRateZones = (zones: ActivityHeartRateZone[]): string => {
      if (zones.length === 0) return '';

      return `
        <div class="template-section">
          <div class="template-title">${escapeHtml(t('training.pdfHeartRateZones'))}</div>
          <div class="zone-grid-header">
            <div>${escapeHtml(t('training.hrZone'))}</div>
            <div class="lap-cell-right">%</div>
            <div class="lap-cell-right">${escapeHtml(t('training.time'))}</div>
          </div>
          ${zones
            .map(
              zone => `
                <div class="zone-grid-row">
                  <div>${escapeHtml(`${t('training.hrZone')} ${zone.zone}`)}</div>
                  <div class="lap-cell-right">${Math.round(zone.percentage)}%</div>
                  <div class="lap-cell-right">${escapeHtml(formatDuration(zone.duration_s))}</div>
                </div>
              `,
            )
            .join('')}
        </div>
      `;
    };

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
            color: #333;
            margin: 0;
            padding: 40px;
            -webkit-print-color-adjust: exact;
          }
          @page { margin: 20px; }
          .page-break { page-break-before: always; }
          .avoid-break { page-break-inside: avoid; }
          :root {
            --primary: #007AFF;
            --text: #333;
            --text-secondary: #666;
            --border: #E5E5EA;
            --bg-header: #F5F5F7;
          }
          .cover {
            min-height: 500px;
            padding: 80px 40px;
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            text-align: center;
            page-break-after: always;
          }
          .logo {
            font-size: 40px;
            font-weight: 800;
            color: var(--primary);
            margin-bottom: 20px;
            letter-spacing: -1px;
          }
          .cover-title {
            font-size: 32px;
            font-weight: 300;
            margin-bottom: 40px;
            color: var(--text);
          }
          .cover-user {
            font-size: 24px;
            font-weight: 600;
            color: var(--text);
            margin-bottom: 10px;
          }
          .section-title {
            font-size: 18px;
            font-weight: 700;
            color: var(--primary);
            border-bottom: 2px solid var(--primary);
            padding-bottom: 8px;
            margin-bottom: 20px;
            margin-top: 40px;
            text-transform: uppercase;
            letter-spacing: 1px;
          }
          .summary-grid {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 15px;
            margin-bottom: 30px;
          }
          .summary-card {
            background: var(--bg-header);
            padding: 16px;
            border-radius: 12px;
            text-align: center;
          }
          .summary-val {
            font-size: 22px;
            font-weight: 800;
            color: var(--primary);
            margin-bottom: 4px;
          }
          .summary-label {
            font-size: 11px;
            color: var(--text-secondary);
            text-transform: uppercase;
          }
          .session-block {
            margin-bottom: 12px;
            border: 1px solid var(--border);
            border-radius: 10px;
            overflow: hidden;
          }
          .session-header {
            padding: 12px 15px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-bottom: 1px solid var(--border);
          }
          .session-title { font-weight: 700; font-size: 15px; }
          .session-meta { font-size: 11px; color: var(--text-secondary); }
          .sport-badge {
            display: inline-block;
            padding: 3px 8px;
            border-radius: 4px;
            font-size: 10px;
            font-weight: 600;
            color: white;
            text-transform: uppercase;
            margin-bottom: 4px;
          }
          .session-body {
            padding: 15px;
          }
          .stats-line {
            font-size: 13px;
            color: var(--text-secondary);
            margin-bottom: 12px;
            line-height: 1.5;
          }
          .session-note {
            font-size: 12px;
            color: var(--text-secondary);
            margin-bottom: 12px;
            white-space: pre-wrap;
            word-break: break-word;
          }
          .exercise-block {
            padding: 10px 0;
            border-bottom: 1px solid var(--border);
          }
          .exercise-block:last-child { border-bottom: none; }
          .exercise-name {
            font-weight: 600;
            font-size: 13px;
            margin-bottom: 6px;
            color: var(--text);
          }
          .set-detail {
            margin-bottom: 8px;
          }
          .set-detail:last-child {
            margin-bottom: 0;
          }
          .sets-row {
            display: flex;
            flex-wrap: wrap;
            gap: 6px;
          }
          .set-tag {
            background: #FFF;
            border: 1px solid var(--border);
            border-radius: 4px;
            padding: 2px 6px;
            font-size: 11px;
            color: var(--text-secondary);
          }
          .set-notes {
            margin-top: 6px;
            font-size: 11px;
            color: var(--text-secondary);
            white-space: pre-wrap;
            word-break: break-word;
          }
          .template-section {
            background: #FAFAFA;
            border-radius: 8px;
            padding: 12px;
            margin-top: 12px;
          }
          .template-title {
            font-size: 12px;
            font-weight: 600;
            color: var(--text-secondary);
            text-transform: uppercase;
            margin-bottom: 10px;
          }
          .step-row {
            display: flex;
            align-items: flex-start;
            margin-bottom: 8px;
          }
          .step-row-child {
            margin-left: 20px;
          }
          .step-stripe {
            width: 4px;
            min-height: 100%;
            border-radius: 2px;
            margin-right: 10px;
          }
          .step-content {
            flex: 1;
          }
          .step-title-row {
            display: flex;
            align-items: center;
            margin-bottom: 4px;
          }
          .step-title {
            font-weight: 600;
            font-size: 13px;
            text-transform: uppercase;
          }
          .step-badge {
            background: #F0F0F0;
            padding: 2px 6px;
            border-radius: 4px;
            font-size: 11px;
            margin-left: 8px;
          }
          .step-metrics {
            display: flex;
            gap: 12px;
            font-size: 12px;
            color: #666;
            flex-wrap: wrap;
          }
          .step-children {
            margin-top: 8px;
          }
          .laps-grid-header,
          .laps-grid-row {
            display: grid;
            grid-template-columns: 24px minmax(0, 1.2fr) minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr);
            gap: 8px;
            align-items: center;
          }
          .laps-grid-header {
            font-size: 10px;
            color: var(--text-secondary);
            text-transform: uppercase;
            letter-spacing: 0.4px;
            margin-bottom: 4px;
          }
          .laps-grid-row {
            font-size: 12px;
            color: var(--text);
            padding: 6px 0;
            border-top: 1px solid var(--border);
          }
          .lap-cell-right {
            text-align: right;
          }
          .summary-grid-secondary {
            margin-top: -15px;
          }
          .summary-card-secondary {
            padding: 14px;
          }
          .zone-grid-header,
          .zone-grid-row {
            display: grid;
            grid-template-columns: minmax(0, 1fr) minmax(0, 0.8fr) minmax(0, 1fr);
            gap: 8px;
            align-items: center;
          }
          .zone-grid-header {
            font-size: 10px;
            color: var(--text-secondary);
            text-transform: uppercase;
            letter-spacing: 0.4px;
            margin-bottom: 4px;
          }
          .zone-grid-row {
            font-size: 12px;
            color: var(--text);
            padding: 6px 0;
            border-top: 1px solid var(--border);
          }
          .empty-block {
            border: 1px dashed var(--border);
            border-radius: 8px;
            padding: 10px;
            font-size: 12px;
            color: var(--text-secondary);
            background: #FAFAFA;
          }
          .footer {
            position: fixed;
            bottom: 20px;
            left: 40px;
            right: 40px;
            text-align: center;
            font-size: 10px;
            color: #CCC;
          }
        </style>
      </head>
      <body>
        <div class="cover">
          <div class="logo">
            ${iconSrc ? `<img src="${iconSrc}" style="width: 80px; height: 80px; margin: 0 auto; display: block; border-radius: 16px; margin-bottom: 15px;" />` : ''}
            ${escapeHtml(t('training.pdfTitle'))}
          </div>
          <div class="cover-title">${escapeHtml(t('training.pdfSubtitle'))}</div>
          <div class="cover-user">${escapeHtml(finalDisplayName)}</div>
          <div style="color: #666; margin-top: 10px;">
            ${escapeHtml(format(parseISO(startDate), datePattern, { locale: dateLocale }))} - ${escapeHtml(format(parseISO(endDate), datePattern, { locale: dateLocale }))}
          </div>
        </div>

        <div class="page-break"></div>
        <div class="section-title">${escapeHtml(t('training.pdfPeriodSummary'))}</div>
        <div class="summary-grid">
          <div class="summary-card">
            <div class="summary-val">${processedSessions.length}</div>
            <div class="summary-label">${escapeHtml(t('training.pdfSessions'))}</div>
          </div>
          <div class="summary-card">
            <div class="summary-val">${escapeHtml(`${totalHours}h ${totalMinutes}m`)}</div>
            <div class="summary-label">${escapeHtml(t('training.pdfTotalTime'))}</div>
          </div>
          <div class="summary-card">
            <div class="summary-val">${escapeHtml(totalDistanceUi.label)}</div>
            <div class="summary-label">${escapeHtml(t('training.pdfDistance'))}</div>
          </div>
          <div class="summary-card">
            <div class="summary-val">${escapeHtml(volumeSummary)}</div>
            <div class="summary-label">${escapeHtml(t('training.pdfStrengthVolume'))}</div>
          </div>
        </div>
        ${renderOptionalSummaryCards()}

        <div class="section-title">${escapeHtml(t('training.pdfSessionDetails'))}</div>
        ${processedSessions
          .map(session => {
            const sportConfig = SPORT_CONFIG[session.sport_type] || SPORT_CONFIG.other;
            const sessionVolumeUi = convertWeightToUi(session.volume, weightUnit, 0);
            const sportType = toSportType(session.sport_type);
            const sessionStats = renderSessionMetrics(session);

            return `
              <div class="session-block avoid-break">
                <div class="session-header" style="background: ${sportConfig.color}10;">
                  <div>
                    <span class="sport-badge" style="background: ${sportConfig.color};">${escapeHtml(t(sportConfig.label))}</span>
                    <div class="session-title">${escapeHtml(normalizeText(session.name) || t('training.pdfWorkoutFallback'))}</div>
                    <div class="session-meta">${escapeHtml(format(parseISO(session.start_time), dateTimePattern, { locale: dateLocale }))}</div>
                  </div>
                  <div style="text-align: right;">
                    <div style="font-weight: 700; font-size: 16px;">${escapeHtml(formatDuration(session.duration_s || 0))}</div>
                    ${session.isGym ? `<div class="session-meta">${escapeHtml(`${sessionVolumeUi.label} ${t('training.pdfVolumeShort')}`)}</div>` : ''}
                  </div>
                </div>
                <div class="session-body">
                  ${sessionStats ? `<div class="stats-line">${sessionStats}</div>` : ''}
                  ${
                    session.sessionNotes
                      ? `<div class="session-note"><b>${escapeHtml(`${t('training.pdfSessionNotes')}:`)}</b> ${escapeHtml(session.sessionNotes)}</div>`
                      : ''
                  }
                  ${
                    session.isGym
                      ? session.exercises.length > 0
                        ? `
                          ${session.exercises
                            .map(
                              exercise => `
                                <div class="exercise-block">
                                  <div class="exercise-name">${escapeHtml(exercise.name)}</div>
                                  ${exercise.sets.map(set => renderSetDetails(set)).join('')}
                                </div>
                              `,
                            )
                            .join('')}
                        `
                        : `<div class="empty-block">${escapeHtml(t('training.pdfNoStrengthSets'))}</div>`
                      : ''
                  }
                  ${renderHeartRateZones(session.heartRateZones)}
                  ${!session.isGym && session.laps.length > 0 ? renderSessionLaps(session.laps, sportType) : ''}
                  ${
                    session.templateSteps.length > 0
                      ? `
                        <div class="template-section">
                          <div class="template-title">${escapeHtml(t('training.scheduledWorkout'))}</div>
                          ${renderTemplateSteps(session.templateSteps, sportType)}
                        </div>
                      `
                      : ''
                  }
                </div>
              </div>
            `;
          })
          .join('')}

        <div class="footer">${escapeHtml(t('training.pdfGeneratedBy'))} - ${escapeHtml(format(new Date(), datePattern, { locale: dateLocale }))}</div>
      </body>
      </html>
    `;

    const rawFileName = `${t('training.pdfFilePrefix')}_${startDate}_${endDate}.pdf`;
    const fileName = rawFileName.replace(/[\\/:*?"<>|]/g, '-');

    if (Platform.OS === 'web') {
      const targetWindow = webPrintWindow ?? openWebExportWindow();
      if (!targetWindow) {
        throw new Error(t('training.pdfWebOpenBlocked'));
      }

      const printableHtml = `
        ${html}
        <script>
          window.addEventListener('load', function () {
            setTimeout(function () {
              window.focus();
              window.print();
            }, 120);
          });
        </script>
      `;

      targetWindow.document.open();
      targetWindow.document.write(printableHtml);
      targetWindow.document.close();
      return;
    }

    const { uri } = await Print.printToFileAsync({
      html,
      base64: false,
    });

    const baseDirectory = FileSystem.documentDirectory || FileSystem.cacheDirectory;
    if (!baseDirectory) {
      throw new Error(t('training.pdfGenerateRetry'));
    }

    const newUri = `${baseDirectory}${fileName}`;

    await FileSystem.moveAsync({
      from: uri,
      to: newUri,
    });

    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(newUri, {
        UTI: '.pdf',
        mimeType: 'application/pdf',
        dialogTitle: t('training.pdfShareDialogTitle'),
      });
      return;
    }

    await Print.printAsync({ html });
  } catch (error: unknown) {
    if (!(error instanceof Error) || !error.message.includes(t('training.pdfNoWorkoutsInRange'))) {
      console.error('Error generando PDF:', error);
    }
    throw new Error(getErrorMessage(error));
  }
};
