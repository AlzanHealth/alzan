import { Platform } from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Asset } from 'expo-asset';
import * as FileSystem from 'expo-file-system/legacy';
import { addDays, differenceInCalendarDays, format, parseISO } from 'date-fns';
import { supabase } from '../../../lib/supabaseClient';
import { getDateFnsLocale } from '../../../i18n/dateLocale';
import i18n from '../../../i18n';
import { TranslationKey } from '../../../i18n/locales/en';
import { DistanceUnit, MeasurementType, Row, User, WeightUnit } from '../../../types/requests.types';
import { convertLengthToUi, convertWeightToUi } from '../../../utils/unitConversionUtils';
import iconSource from '../../../../assets/icon.png';

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

type WeightLog = Row<'weight_logs'>;
type BodyMeasurement = Row<'body_measurements'>;
type SleepLog = Row<'sleep_logs'>;
type RestingHrLog = Row<'resting_hr_logs'>;
type DailyHydration = Row<'daily_hydration'>;
type SessionFeedback = Row<'session_feedback'>;
type UserGoal = Row<'user_goals'>;

type SummaryCard = {
  label: string;
  value: string;
  meta?: string;
};

type DayBucket = {
  date: string;
  weights: WeightLog[];
  measurements: BodyMeasurement[];
  sleep: SleepLog[];
  restingHr: RestingHrLog[];
  hydration: DailyHydration[];
  feedback: SessionFeedback[];
};

const t = (key: TranslationKey) => String(i18n.t(key));
const isEnglish = () => i18n.language?.startsWith('en');
const getPdfDatePattern = () => (isEnglish() ? 'MMMM d, yyyy' : 'd MMMM yyyy');
const getPdfDateTimePattern = () => (isEnglish() ? 'MMM d, HH:mm' : 'd MMM, HH:mm');

const MEASUREMENT_LABEL_KEYS: Record<MeasurementType, TranslationKey> = {
  waist: 'health.waist',
  chest: 'health.chest',
  hips: 'health.hips',
  thigh: 'health.thigh',
  arm: 'health.arm',
  calf: 'health.calf',
  neck: 'health.neck',
  shoulders: 'health.shoulders',
  abdomen: 'health.abdomen',
};

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

const openWebExportWindow = (): WebExportWindow | null => {
  if (Platform.OS !== 'web') return null;
  return (
    (globalThis as { open?: (url?: string, target?: string) => WebExportWindow | null }).open?.('', '_blank') ?? null
  );
};

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const formatNumber = (value: number | null | undefined, digits = 1): string => {
  if (value == null || Number.isNaN(value)) return '-';
  return Number(value).toFixed(digits).replace(/\.0$/, '');
};

const formatSignedNumber = (value: number | null | undefined, unit: string, digits = 1): string => {
  if (value == null || Number.isNaN(value)) return '-';
  const prefix = value > 0 ? '+' : '';
  return `${prefix}${formatNumber(value, digits)} ${unit}`;
};

const formatDurationMinutes = (minutes: number | null | undefined): string => {
  if (!minutes || minutes <= 0) return '-';
  const hours = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  if (hours <= 0) return `${mins}m`;
  return `${hours}h ${mins}m`;
};

const formatDateTime = (value: string | null | undefined): string => {
  if (!value) return '-';
  return format(parseISO(value), getPdfDateTimePattern(), { locale: getDateFnsLocale() });
};

const getDateKeyFromTimestamp = (value: string): string => format(parseISO(value), 'yyyy-MM-dd');

const getBmi = (weightKg: number | null | undefined, heightCm: number | null | undefined): number | null => {
  if (!weightKg || !heightCm || heightCm <= 0) return null;
  const heightM = heightCm / 100;
  return Number((weightKg / (heightM * heightM)).toFixed(1));
};

const getDelta = (first: number | null | undefined, last: number | null | undefined): number | null => {
  if (first == null || last == null) return null;
  return Number((last - first).toFixed(1));
};

const average = (values: number[]): number | null => {
  const valid = values.filter(value => Number.isFinite(value));
  if (valid.length === 0) return null;
  return valid.reduce((sum, value) => sum + value, 0) / valid.length;
};

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error && error.message.trim()) return error.message;
  if (typeof error === 'string' && error.trim()) return error;

  if (typeof error === 'object' && error !== null) {
    const maybeError = error as { message?: unknown; details?: unknown; hint?: unknown; code?: unknown };
    const parts = [maybeError.message, maybeError.details, maybeError.hint, maybeError.code]
      .filter(part => typeof part === 'string' && part.trim())
      .map(part => String(part));

    if (parts.length > 0) return parts.join(' · ');
  }

  return t('health.pdfGenerateRetry');
};

const renderSummaryCards = (cards: SummaryCard[]): string => `
  <div class="summary-grid">
    ${cards
      .map(
        card => `
          <div class="summary-card">
            <div class="summary-val">${escapeHtml(card.value)}</div>
            <div class="summary-label">${escapeHtml(card.label)}</div>
            ${card.meta ? `<div class="summary-meta">${escapeHtml(card.meta)}</div>` : ''}
          </div>
        `,
      )
      .join('')}
  </div>
`;

const renderTable = (headers: string[], rows: string[][], emptyLabel: string): string => {
  if (rows.length === 0) return `<div class="empty-block">${escapeHtml(emptyLabel)}</div>`;
  return `
    <table>
      <thead>
        <tr>${headers.map(header => `<th>${escapeHtml(header)}</th>`).join('')}</tr>
      </thead>
      <tbody>
        ${rows.map(row => `<tr>${row.map(cell => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`).join('')}
      </tbody>
    </table>
  `;
};

const getLatestMeasurementByType = (
  measurements: BodyMeasurement[],
): Partial<Record<MeasurementType, BodyMeasurement>> => {
  return measurements.reduce<Partial<Record<MeasurementType, BodyMeasurement>>>((acc, measurement) => {
    const current = acc[measurement.measurement_type];
    if (!current || measurement.measured_at > current.measured_at) {
      acc[measurement.measurement_type] = measurement;
    }
    return acc;
  }, {});
};

export const generateHealthPDF = async ({ startDate, endDate, user, webPrintWindow }: PDFExportOptions) => {
  try {
    const start = parseISO(startDate);
    const end = parseISO(endDate);
    const endExclusive = addDays(end, 1);
    const totalDays = differenceInCalendarDays(end, start) + 1;
    const dateLocale = getDateFnsLocale();
    const datePattern = getPdfDatePattern();

    const [
      iconBase64,
      profileResult,
      preferencesResult,
      weightsResult,
      measurementsResult,
      sleepResult,
      hrResult,
      hydrationResult,
      feedbackResult,
      goalsResult,
    ] = await Promise.all([
      loadAssetAsBase64(iconSource),
      supabase.from('users').select('*').eq('id', user.id).single(),
      supabase.from('user_preferences').select('weight_unit, distance_unit').eq('user_id', user.id).maybeSingle(),
      supabase
        .from('weight_logs')
        .select('*')
        .eq('user_id', user.id)
        .gte('measured_at', start.toISOString())
        .lt('measured_at', endExclusive.toISOString())
        .order('measured_at', { ascending: true }),
      supabase
        .from('body_measurements')
        .select('*')
        .eq('user_id', user.id)
        .gte('measured_at', start.toISOString())
        .lt('measured_at', endExclusive.toISOString())
        .order('measured_at', { ascending: true }),
      supabase
        .from('sleep_logs')
        .select('*')
        .eq('user_id', user.id)
        .gte('date', startDate)
        .lte('date', endDate)
        .order('date', { ascending: true }),
      supabase
        .from('resting_hr_logs')
        .select('*')
        .eq('user_id', user.id)
        .gte('measured_at', start.toISOString())
        .lt('measured_at', endExclusive.toISOString())
        .order('measured_at', { ascending: true }),
      supabase
        .from('daily_hydration')
        .select('*')
        .eq('user_id', user.id)
        .gte('date', startDate)
        .lte('date', endDate)
        .order('date', { ascending: true }),
      supabase
        .from('session_feedback')
        .select('*')
        .eq('user_id', user.id)
        .gte('created_at', start.toISOString())
        .lt('created_at', endExclusive.toISOString())
        .order('created_at', { ascending: true }),
      supabase
        .from('user_goals')
        .select('*')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .order('created_at', { ascending: false }),
    ]);

    const queryError = [
      profileResult.error,
      preferencesResult.error,
      weightsResult.error,
      measurementsResult.error,
      sleepResult.error,
      hrResult.error,
      hydrationResult.error,
      feedbackResult.error,
      goalsResult.error,
    ].find(Boolean);
    if (queryError) throw queryError;

    const profile = profileResult.data as User | null;
    const weightUnit: WeightUnit = preferencesResult.data?.weight_unit === 'lb' ? 'lb' : 'kg';
    const distanceUnit: DistanceUnit = preferencesResult.data?.distance_unit === 'miles' ? 'miles' : 'km';
    const weights = (weightsResult.data ?? []) as WeightLog[];
    const measurements = (measurementsResult.data ?? []) as BodyMeasurement[];
    const sleepLogs = (sleepResult.data ?? []) as SleepLog[];
    const restingHrLogs = (hrResult.data ?? []) as RestingHrLog[];
    const hydrationLogs = (hydrationResult.data ?? []) as DailyHydration[];
    const feedbackLogs = (feedbackResult.data ?? []) as SessionFeedback[];
    const goals = (goalsResult.data ?? []) as UserGoal[];

    const hasData =
      weights.length > 0 ||
      measurements.length > 0 ||
      sleepLogs.length > 0 ||
      restingHrLogs.length > 0 ||
      hydrationLogs.length > 0 ||
      feedbackLogs.length > 0;
    if (!hasData) throw new Error(t('health.pdfNoRecordsInRange'));

    const displayName =
      user.display_name || profile?.display_name || profile?.username || user.email || t('nutrition.pdfUnknownUser');
    const iconSrc = iconBase64 ? `data:image/png;base64,${iconBase64}` : null;
    const firstWeight = weights[0];
    const lastWeight = weights[weights.length - 1];
    const latestBodyFat = [...weights].reverse().find(log => log.bodyfat_percent != null)?.bodyfat_percent ?? null;
    const latestMuscleMass = [...weights].reverse().find(log => log.muscle_mass_kg != null)?.muscle_mass_kg ?? null;
    const latestBmi = getBmi(lastWeight?.weight_kg, profile?.height_cm ?? null);
    const weightDeltaKg = getDelta(firstWeight?.weight_kg, lastWeight?.weight_kg);
    const bodyFatDelta = getDelta(firstWeight?.bodyfat_percent, lastWeight?.bodyfat_percent);
    const muscleDeltaKg = getDelta(firstWeight?.muscle_mass_kg, lastWeight?.muscle_mass_kg);
    const avgSleepMinutes = average(sleepLogs.map(log => log.duration_min ?? Number.NaN));
    const avgSleepQuality = average(sleepLogs.map(log => log.quality_score ?? Number.NaN));
    const avgRestingHr = average(restingHrLogs.map(log => log.resting_hr_bpm));
    const restingHrDelta = getDelta(
      restingHrLogs[0]?.resting_hr_bpm,
      restingHrLogs[restingHrLogs.length - 1]?.resting_hr_bpm,
    );
    const avgHydrationMl = average(hydrationLogs.map(log => log.total_ml));
    const goodSleepPercent = sleepLogs.length
      ? Math.round((sleepLogs.filter(log => (log.duration_min ?? 0) >= 7 * 60).length / sleepLogs.length) * 100)
      : null;

    const weightDisplay = lastWeight ? convertWeightToUi(lastWeight.weight_kg, weightUnit, 1).label : '-';
    const weightDeltaDisplay =
      weightDeltaKg == null
        ? '-'
        : formatSignedNumber(
            convertWeightToUi(weightDeltaKg, weightUnit, 1).value,
            convertWeightToUi(weightDeltaKg, weightUnit, 1).unit,
            1,
          );
    const muscleMassDisplay = latestMuscleMass ? convertWeightToUi(latestMuscleMass, weightUnit, 1).label : '-';
    const muscleDeltaDisplay =
      muscleDeltaKg == null
        ? '-'
        : formatSignedNumber(
            convertWeightToUi(muscleDeltaKg, weightUnit, 1).value,
            convertWeightToUi(muscleDeltaKg, weightUnit, 1).unit,
            1,
          );

    const summaryCards: SummaryCard[] = [
      {
        label: t('settings.weight'),
        value: weightDisplay,
        meta: `${t('health.pdfChange')}: ${weightDeltaDisplay}`,
      },
      {
        label: t('health.imc'),
        value: latestBmi != null ? formatNumber(latestBmi, 1) : '-',
        meta: profile?.height_cm
          ? `${t('health.yourHeight')}: ${convertLengthToUi(profile.height_cm, distanceUnit, 1).label}`
          : undefined,
      },
      {
        label: t('health.bodyFat'),
        value: latestBodyFat != null ? `${formatNumber(latestBodyFat, 1)}%` : '-',
        meta:
          bodyFatDelta == null ? undefined : `${t('health.pdfChange')}: ${formatSignedNumber(bodyFatDelta, '%', 1)}`,
      },
      {
        label: t('health.muscleMass'),
        value: muscleMassDisplay,
        meta: muscleDeltaKg == null ? undefined : `${t('health.pdfChange')}: ${muscleDeltaDisplay}`,
      },
      {
        label: t('settings.sleep'),
        value: avgSleepMinutes ? formatDurationMinutes(avgSleepMinutes) : '-',
        meta: goodSleepPercent == null ? undefined : `${goodSleepPercent}% ${t('health.pdfGoodSleepNights')}`,
      },
      {
        label: t('health.heartRate'),
        value: avgRestingHr ? `${Math.round(avgRestingHr)} ${t('health.unitBpm')}` : '-',
        meta:
          restingHrDelta == null
            ? undefined
            : `${t('health.pdfChange')}: ${formatSignedNumber(restingHrDelta, t('health.unitBpm'), 0)}`,
      },
      {
        label: t('health.hydration'),
        value: avgHydrationMl ? `${Math.round(avgHydrationMl)} ml` : '-',
        meta: `${hydrationLogs.length}/${totalDays} ${t('health.days')}`,
      },
      {
        label: t('health.pdfDataPoints'),
        value: `${weights.length + measurements.length + sleepLogs.length + restingHrLogs.length + hydrationLogs.length + feedbackLogs.length}`,
        meta: `${totalDays} ${t('health.days')}`,
      },
    ];

    const activeGoalRows = goals
      .filter(goal => goal.target_weight_kg != null || goal.target_bodyfat_percent != null)
      .map(goal => [
        goal.description || goal.goal_type,
        goal.target_weight_kg != null ? convertWeightToUi(goal.target_weight_kg, weightUnit, 1).label : '-',
        goal.target_bodyfat_percent != null ? `${formatNumber(goal.target_bodyfat_percent, 1)}%` : '-',
        goal.valid_from,
      ]);

    const weightRows = weights.map(log => {
      const bmi = getBmi(log.weight_kg, profile?.height_cm ?? null);
      const bodyFatKg = log.bodyfat_percent != null ? log.weight_kg * (log.bodyfat_percent / 100) : null;
      const leanKg = bodyFatKg != null ? log.weight_kg - bodyFatKg : null;
      return [
        formatDateTime(log.measured_at),
        convertWeightToUi(log.weight_kg, weightUnit, 1).label,
        bmi != null ? formatNumber(bmi, 1) : '-',
        log.bodyfat_percent != null ? `${formatNumber(log.bodyfat_percent, 1)}%` : '-',
        bodyFatKg != null ? convertWeightToUi(bodyFatKg, weightUnit, 1).label : '-',
        leanKg != null ? convertWeightToUi(leanKg, weightUnit, 1).label : '-',
        log.muscle_mass_kg != null ? convertWeightToUi(log.muscle_mass_kg, weightUnit, 1).label : '-',
      ];
    });

    const measurementRows = measurements.map(measurement => [
      formatDateTime(measurement.measured_at),
      t(MEASUREMENT_LABEL_KEYS[measurement.measurement_type]),
      convertLengthToUi(measurement.value_cm, distanceUnit, 1).label,
    ]);

    const latestMeasurements = getLatestMeasurementByType(measurements);
    const latestMeasurementRows = Object.entries(latestMeasurements).map(([type, measurement]) => [
      t(MEASUREMENT_LABEL_KEYS[type as MeasurementType]),
      convertLengthToUi(measurement.value_cm, distanceUnit, 1).label,
      format(parseISO(measurement.measured_at), datePattern, { locale: dateLocale }),
    ]);

    const sleepRows = sleepLogs.map(log => [
      format(parseISO(log.date), datePattern, { locale: dateLocale }),
      formatDurationMinutes(log.duration_min),
      log.quality_score != null ? `${log.quality_score}/5` : '-',
      log.sleep_start ? format(parseISO(log.sleep_start), 'HH:mm') : '-',
      log.sleep_end ? format(parseISO(log.sleep_end), 'HH:mm') : '-',
    ]);

    const restingHrRows = restingHrLogs.map(log => [
      formatDateTime(log.measured_at),
      `${Math.round(log.resting_hr_bpm)} ${t('health.unitBpm')}`,
    ]);

    const hydrationRows = hydrationLogs.map(log => [
      format(parseISO(log.date), datePattern, { locale: dateLocale }),
      `${Math.round(log.total_ml)} ml`,
    ]);

    const feedbackRows = feedbackLogs.map(log => [
      formatDateTime(log.created_at),
      log.mood != null ? `${log.mood}/5` : '-',
      log.stress != null ? `${log.stress}/5` : '-',
      log.soreness != null ? `${log.soreness}/5` : '-',
      log.sleep_quality != null ? `${log.sleep_quality}/5` : '-',
      log.rpe != null ? `${log.rpe}/10` : '-',
    ]);

    const dayBuckets = new Map<string, DayBucket>();
    const ensureDay = (date: string): DayBucket => {
      const existing = dayBuckets.get(date);
      if (existing) return existing;
      const next = { date, weights: [], measurements: [], sleep: [], restingHr: [], hydration: [], feedback: [] };
      dayBuckets.set(date, next);
      return next;
    };

    weights.forEach(log => ensureDay(getDateKeyFromTimestamp(log.measured_at)).weights.push(log));
    measurements.forEach(log => ensureDay(getDateKeyFromTimestamp(log.measured_at)).measurements.push(log));
    sleepLogs.forEach(log => ensureDay(log.date).sleep.push(log));
    restingHrLogs.forEach(log => ensureDay(getDateKeyFromTimestamp(log.measured_at)).restingHr.push(log));
    hydrationLogs.forEach(log => ensureDay(log.date).hydration.push(log));
    feedbackLogs.forEach(log => ensureDay(getDateKeyFromTimestamp(log.created_at)).feedback.push(log));

    const renderDailyTimeline = () =>
      Array.from(dayBuckets.values())
        .sort((a, b) => a.date.localeCompare(b.date))
        .map(bucket => {
          const lines: string[] = [];
          bucket.weights.forEach(log => {
            const parts = [convertWeightToUi(log.weight_kg, weightUnit, 1).label];
            const bmi = getBmi(log.weight_kg, profile?.height_cm ?? null);
            if (bmi != null) parts.push(`${t('health.imc')} ${formatNumber(bmi, 1)}`);
            if (log.bodyfat_percent != null)
              parts.push(`${t('health.bodyFat')} ${formatNumber(log.bodyfat_percent, 1)}%`);
            if (log.muscle_mass_kg != null)
              parts.push(`${t('health.muscleMass')} ${convertWeightToUi(log.muscle_mass_kg, weightUnit, 1).label}`);
            lines.push(`${t('settings.weight')}: ${parts.join(' · ')}`);
          });
          if (bucket.measurements.length) {
            lines.push(
              `${t('health.measurements')}: ${bucket.measurements
                .map(
                  log =>
                    `${t(MEASUREMENT_LABEL_KEYS[log.measurement_type])} ${convertLengthToUi(log.value_cm, distanceUnit, 1).label}`,
                )
                .join(' · ')}`,
            );
          }
          bucket.sleep.forEach(log => {
            lines.push(
              `${t('settings.sleep')}: ${formatDurationMinutes(log.duration_min)}${log.quality_score != null ? ` · ${t('health.quality')} ${log.quality_score}/5` : ''}`,
            );
          });
          bucket.restingHr.forEach(log =>
            lines.push(`${t('health.heartRate')}: ${log.resting_hr_bpm} ${t('health.unitBpm')}`),
          );
          bucket.hydration.forEach(log => lines.push(`${t('health.hydration')}: ${Math.round(log.total_ml)} ml`));
          bucket.feedback.forEach(log => {
            const parts = [
              log.mood != null ? `${t('health.pdfMood')} ${log.mood}/5` : null,
              log.stress != null ? `${t('health.pdfStress')} ${log.stress}/5` : null,
              log.soreness != null ? `${t('health.pdfSoreness')} ${log.soreness}/5` : null,
              log.rpe != null ? `RPE ${log.rpe}/10` : null,
            ].filter(Boolean);
            if (parts.length) lines.push(`${t('health.pdfRecoveryFeedback')}: ${parts.join(' · ')}`);
          });

          return `
            <div class="day-block avoid-break">
              <div class="day-title">${escapeHtml(format(parseISO(bucket.date), datePattern, { locale: dateLocale }))}</div>
              <ul>${lines.map(line => `<li>${escapeHtml(line)}</li>`).join('')}</ul>
            </div>
          `;
        })
        .join('');

    const html = `
      <html>
      <head>
        <meta charset="utf-8" />
        <style>
          @page { margin: 40px; }
          :root {
            --primary: #007AFF;
            --text: #1D1D1F;
            --text-secondary: #6E6E73;
            --border: #E5E5EA;
            --surface: #F5F5F7;
            --green: #34C759;
            --purple: #8B5CF6;
          }
          body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
            color: var(--text);
            line-height: 1.45;
            font-size: 12px;
          }
          .cover {
            height: 90vh;
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            text-align: center;
          }
          .logo { font-size: 26px; font-weight: 800; margin-bottom: 18px; }
          .cover-title { font-size: 46px; font-weight: 800; letter-spacing: -1px; margin-bottom: 12px; }
          .cover-user { font-size: 18px; color: var(--text-secondary); }
          .page-break { page-break-before: always; }
          .avoid-break { page-break-inside: avoid; }
          .section-title {
            font-size: 22px;
            font-weight: 800;
            margin: 30px 0 14px;
            letter-spacing: -0.3px;
          }
          .section-subtitle {
            color: var(--text-secondary);
            font-size: 12px;
            margin: -6px 0 14px;
          }
          .summary-grid {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 12px;
            margin-bottom: 18px;
          }
          .summary-card {
            background: var(--surface);
            border-radius: 16px;
            padding: 16px;
            min-height: 70px;
          }
          .summary-val { font-size: 22px; font-weight: 800; margin-bottom: 4px; }
          .summary-label { font-size: 10px; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.4px; font-weight: 700; }
          .summary-meta { font-size: 10px; color: var(--text-secondary); margin-top: 6px; }
          table { width: 100%; border-collapse: collapse; margin: 8px 0 18px; }
          th { text-align: left; font-size: 10px; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.35px; padding: 8px; border-bottom: 1px solid var(--border); }
          td { padding: 8px; border-bottom: 1px solid var(--border); vertical-align: top; }
          .data-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
          .panel { border: 1px solid var(--border); border-radius: 16px; padding: 14px; margin-bottom: 16px; }
          .panel-title { font-size: 14px; font-weight: 800; margin-bottom: 8px; }
          .empty-block { border: 1px dashed var(--border); border-radius: 10px; padding: 12px; color: var(--text-secondary); background: #FAFAFA; }
          .day-block { border: 1px solid var(--border); border-radius: 16px; padding: 14px 16px; margin-bottom: 12px; }
          .day-title { font-size: 14px; font-weight: 800; margin-bottom: 8px; }
          ul { margin: 0; padding-left: 18px; }
          li { margin-bottom: 5px; }
          .footer {
            position: fixed;
            bottom: 20px;
            left: 40px;
            right: 40px;
            text-align: center;
            font-size: 10px;
            color: #C7C7CC;
          }
        </style>
      </head>
      <body>
        <div class="cover">
          <div class="logo">
            ${iconSrc ? `<img src="${iconSrc}" style="width: 80px; height: 80px; margin: 0 auto 15px; display: block; border-radius: 16px;" />` : ''}
            ${escapeHtml(t('health.pdfTitle'))}
          </div>
          <div class="cover-title">${escapeHtml(t('health.pdfSubtitle'))}</div>
          <div class="cover-user">${escapeHtml(displayName)}</div>
          <div style="color:#666; margin-top:10px;">
            ${escapeHtml(format(start, datePattern, { locale: dateLocale }))} - ${escapeHtml(format(end, datePattern, { locale: dateLocale }))}
          </div>
          <div style="font-size:12px; color:#888; margin-top:28px;">${escapeHtml(t('nutrition.pdfGeneratedAt'))}: ${escapeHtml(format(new Date(), datePattern, { locale: dateLocale }))}</div>
        </div>

        <div class="page-break"></div>
        <div class="section-title">${escapeHtml(t('health.pdfPeriodSummary'))}</div>
        <div class="section-subtitle">${escapeHtml(t('health.pdfPeriodSummaryHint'))}</div>
        ${renderSummaryCards(summaryCards)}

        ${
          activeGoalRows.length > 0
            ? `
          <div class="section-title">${escapeHtml(t('health.pdfActiveGoals'))}</div>
          ${renderTable(
            [t('settings.goal'), t('settings.weight'), t('health.bodyFat'), t('nutrition.startDate')],
            activeGoalRows,
            t('health.pdfNoGoals'),
          )}
        `
            : ''
        }

        <div class="section-title">${escapeHtml(t('health.pdfBodyCompositionSection'))}</div>
        ${renderTable(
          [
            t('health.recordDate'),
            t('settings.weight'),
            t('health.imc'),
            t('health.bodyFat'),
            t('health.pdfFatMass'),
            t('health.leanMass'),
            t('health.muscleMass'),
          ],
          weightRows,
          t('health.pdfNoWeightData'),
        )}

        <div class="data-grid">
          <div class="panel avoid-break">
            <div class="panel-title">${escapeHtml(t('health.pdfLatestMeasurements'))}</div>
            ${renderTable([t('health.measure'), t('health.pdfLatestValue'), t('health.recordDate')], latestMeasurementRows, t('health.pdfNoMeasurements'))}
          </div>
          <div class="panel avoid-break">
            <div class="panel-title">${escapeHtml(t('health.pdfSleepAndRecovery'))}</div>
            ${renderSummaryCards([
              {
                label: t('settings.sleep'),
                value: avgSleepMinutes ? formatDurationMinutes(avgSleepMinutes) : '-',
                meta: `${sleepLogs.length}/${totalDays} ${t('health.days')}`,
              },
              {
                label: t('health.quality'),
                value: avgSleepQuality ? `${formatNumber(avgSleepQuality, 1)}/5` : '-',
                meta: goodSleepPercent == null ? undefined : `${goodSleepPercent}% ${t('health.pdfGoodSleepNights')}`,
              },
              {
                label: t('health.heartRate'),
                value: avgRestingHr ? `${Math.round(avgRestingHr)} ${t('health.unitBpm')}` : '-',
                meta:
                  restingHrDelta == null
                    ? undefined
                    : `${t('health.pdfChange')}: ${formatSignedNumber(restingHrDelta, t('health.unitBpm'), 0)}`,
              },
              {
                label: t('health.hydration'),
                value: avgHydrationMl ? `${Math.round(avgHydrationMl)} ml` : '-',
                meta: `${hydrationLogs.length}/${totalDays} ${t('health.days')}`,
              },
            ])}
          </div>
        </div>

        <div class="section-title">${escapeHtml(t('health.measurements'))}</div>
        ${renderTable([t('health.recordDate'), t('health.measure'), t('health.pdfValue')], measurementRows, t('health.pdfNoMeasurements'))}

        <div class="section-title">${escapeHtml(t('settings.sleep'))}</div>
        ${renderTable([t('health.recordDate'), t('health.totalDuration'), t('health.quality'), t('health.fellAsleep'), t('health.wakeUp')], sleepRows, t('health.pdfNoSleepData'))}

        <div class="section-title">${escapeHtml(t('health.heartRate'))}</div>
        ${renderTable([t('health.recordDate'), t('health.unitBpm')], restingHrRows, t('health.pdfNoHeartRateData'))}

        <div class="section-title">${escapeHtml(t('health.hydration'))}</div>
        ${renderTable([t('health.recordDate'), t('health.pdfWater')], hydrationRows, t('health.pdfNoHydrationData'))}

        <div class="section-title">${escapeHtml(t('health.pdfRecoveryFeedback'))}</div>
        ${renderTable([t('health.recordDate'), t('health.pdfMood'), t('health.pdfStress'), t('health.pdfSoreness'), t('health.sleepQuality'), 'RPE'], feedbackRows, t('health.pdfNoRecoveryData'))}

        <div class="section-title">${escapeHtml(t('health.pdfDailyTimeline'))}</div>
        ${renderDailyTimeline()}

        <div class="footer">${escapeHtml(t('training.pdfGeneratedBy'))} - ${escapeHtml(format(new Date(), datePattern, { locale: dateLocale }))}</div>
      </body>
      </html>
    `;

    const rawFileName = `${t('health.pdfFilePrefix')}_${startDate}_${endDate}.pdf`;
    const fileName = rawFileName.replace(/[\\/:*?"<>|]/g, '-');

    if (Platform.OS === 'web') {
      const targetWindow = webPrintWindow ?? openWebExportWindow();
      if (!targetWindow) throw new Error(t('health.pdfWebOpenBlocked'));
      targetWindow.document.open();
      targetWindow.document.write(`
        ${html}
        <script>
          window.addEventListener('load', function () {
            setTimeout(function () {
              window.focus();
              window.print();
            }, 120);
          });
        </script>
      `);
      targetWindow.document.close();
      return;
    }

    const { uri } = await Print.printToFileAsync({ html, base64: false });
    const baseDirectory = FileSystem.documentDirectory || FileSystem.cacheDirectory;
    if (!baseDirectory) throw new Error(t('health.pdfGenerateRetry'));

    const newUri = `${baseDirectory}${fileName}`;
    await FileSystem.moveAsync({ from: uri, to: newUri });

    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(newUri, {
        UTI: '.pdf',
        mimeType: 'application/pdf',
        dialogTitle: t('health.pdfShareDialogTitle'),
      });
      return;
    }

    await Print.printAsync({ html });
  } catch (error: unknown) {
    if (!(error instanceof Error) || !error.message.includes(t('health.pdfNoRecordsInRange'))) {
      console.error('Error generating health PDF:', error);
    }
    throw new Error(getErrorMessage(error));
  }
};
