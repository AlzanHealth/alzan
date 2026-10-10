import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { ChartDataPoint } from '../../../components/stats/SimpleChart';
import type { TranslationKey } from '../../../i18n/locales/en';
import { formatLocalizedDate } from '../../../i18n/dateLocale';
import type { HealthStyles } from '../../../hooks/useHealthStyles';
import { useUnitConversion } from '../../../hooks/useUnitConversion';
import type { SportType } from '../../../types/requests.types';
import { normalizeSportType } from '../../../utils/sportTypeNormalization';
import type { CardioActivity, CardioPeriod } from '../algorithms/cardioEvolution';
import { getCardioHeartRateTrendSeries, type CardioSportEvaluation } from '../algorithms/cardioSportEvaluation';
import { getCardioPerformanceChangeCopy } from '../algorithms/cardioSportPresentation';
import { HealthHistoryChart } from './HealthHistoryChart';

type TranslateCardio = (key: TranslationKey, options?: Record<string, unknown>) => string;

const CARDIO_PERIOD_TRANSLATIONS = {
  day: 'health.cardioPeriodDay',
  week: 'health.cardioPeriodWeek',
  month: 'health.cardioPeriodMonth',
  three_months: 'health.cardioPeriodThreeMonths',
  six_months: 'health.cardioPeriodSixMonths',
  all: 'health.cardioPeriodAll',
} satisfies Record<CardioPeriod, TranslationKey>;

const formatEvaluationMetric = (
  value: number | null,
  metric: CardioSportEvaluation['performance']['metric'],
  sportType: SportType,
  convertSpeedToUi: ReturnType<typeof useUnitConversion>['convertSpeedToUi'],
): string => {
  if (value === null || !Number.isFinite(value)) return '—';
  if (metric === 'power') return `${Math.round(value)} W`;
  if (metric === 'lap_pace') return convertSpeedToUi((sportType === 'swimming' ? 100 : 1000) / value, sportType).label;
  if (metric === 'speed') return convertSpeedToUi(value, sportType).label;
  return '—';
};

const formatDuration = (minutes: number | null): string => {
  if (minutes === null) return '—';
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return hours > 0 ? `${hours} h ${remainingMinutes} min` : `${remainingMinutes} min`;
};

const signed = (value: number, precision = 0): string => `${value > 0 ? '+' : ''}${value.toFixed(precision)}`;
const signedDuration = (minutes: number): string =>
  `${minutes > 0 ? '+' : minutes < 0 ? '−' : ''}${formatDuration(Math.abs(minutes))}`;
const signedLabel = (value: number, label: string): string => `${value > 0 ? '+' : value < 0 ? '−' : ''}${label}`;

export const CardioDimensionSummary = ({
  assessment,
  activities,
  sportType,
  period,
  chartColor,
  colors,
  t,
}: {
  assessment: CardioSportEvaluation;
  activities: CardioActivity[];
  sportType: string;
  period: CardioPeriod;
  chartColor: string;
  colors: HealthStyles;
  t: TranslateCardio;
}) => {
  const { convertDistanceToUi, convertWeightToUi, convertSpeedToUi, units } = useUnitConversion();
  const normalizedSportType = normalizeSportType(sportType) ?? 'other';
  const recent = assessment.volume.recent;
  const previous = assessment.volume.previous;
  const recentIds = new Set(recent.sessionIds);
  const previousIds = new Set(previous.sessionIds);
  const periodIds = new Set([...recent.sessionIds, ...previous.sessionIds]);
  const heartRateTrendData: ChartDataPoint[] = getCardioHeartRateTrendSeries(activities, [...periodIds], period).map(
    point => ({
      date: point.date,
      label: formatLocalizedDate(
        point.date,
        period === 'all' ? { en: 'MMM yy', es: 'MMM yy' } : { en: 'MMM d', es: 'd MMM' },
      ),
      value: point.value,
      count: point.sessionCount,
    }),
  );
  const trendBucketTranslation =
    period === 'all'
      ? 'health.cardioTrendBucketMonth'
      : period === 'three_months' || period === 'six_months'
        ? 'health.cardioTrendBucketWeek'
        : 'health.cardioTrendBucketDay';
  const chartRange =
    period === 'day' ? 'D' : period === 'week' ? 'S' : period === 'all' ? 'A' : period === 'month' ? 'M' : '6M';
  const preferredEvidenceIds = assessment.performance.sessionIds.filter(id => periodIds.has(id));
  const heartRateEvidence = activities
    .filter(
      activity =>
        periodIds.has(activity.id) &&
        activity.avg_heart_rate !== null &&
        Number.isFinite(activity.avg_heart_rate) &&
        activity.avg_heart_rate >= 40 &&
        activity.avg_heart_rate <= 220,
    )
    .map(activity => activity.id);
  const evidenceIds = new Set(
    preferredEvidenceIds.length > 0
      ? preferredEvidenceIds
      : heartRateEvidence.length > 0
        ? heartRateEvidence
        : [...periodIds],
  );
  const evidence = (ids: Set<string>, period: 'recent' | 'previous') =>
    activities
      .filter(activity => ids.has(activity.id) && (period === 'recent' ? recentIds : previousIds).has(activity.id))
      .sort((left, right) => Date.parse(right.start_time) - Date.parse(left.start_time))
      .slice(0, 3);
  const evidenceActivities = [...evidence(evidenceIds, 'recent'), ...evidence(evidenceIds, 'previous')];
  const performanceLabel =
    assessment.performance.metric === 'power'
      ? t('health.cardioMetricPower')
      : assessment.performance.metric === 'lap_pace' && sportType === 'swimming'
        ? t('health.cardioMetricSwimPace')
        : assessment.performance.metric === 'speed' && sportType === 'cycling'
          ? t('health.cardioMetricSpeed')
          : assessment.performance.metric !== null
            ? t('health.cardioMetricPace')
            : null;
  const performanceSourceNote =
    assessment.performance.metricSource === 'distance_duration'
      ? t('health.cardioMetricDerivedSpeed')
      : assessment.performance.metricSource === 'mixed'
        ? t('health.cardioMetricMixedSpeedSources')
        : null;
  const dimensions: Array<{ label: string; value: string; previous?: string; footnote?: string; change?: string }> = [
    {
      label: t('health.cardioMetricHeartRate'),
      value:
        assessment.cardiovascular.recentMedianBpm === null
          ? '—'
          : `${Math.round(assessment.cardiovascular.recentMedianBpm)} ${t('health.cardioBpm')}`,
      previous:
        assessment.cardiovascular.previousMedianBpm === null
          ? '—'
          : `${Math.round(assessment.cardiovascular.previousMedianBpm)} ${t('health.cardioBpm')}`,
      footnote: t('health.cardioMetricHeartRateCounts', {
        recent: assessment.cardiovascular.recentSessionCount,
        previous: assessment.cardiovascular.previousSessionCount,
      }),
      change:
        assessment.cardiovascular.deltaBpm === null
          ? undefined
          : t('health.cardioMetricHeartRateChange', {
              change: `${signed(assessment.cardiovascular.deltaBpm)} ${t('health.cardioBpm')}`,
            }),
    },
    {
      label: t('health.cardioMetricSessions'),
      value: recent.sessionCount.toString(),
      previous: previous.sessionCount.toString(),
      change: t('health.cardioMetricAbsoluteChange', {
        change: signed(recent.sessionCount - previous.sessionCount),
      }),
    },
    {
      label: t('health.cardioMetricDuration'),
      value: formatDuration(recent.durationMinutes),
      previous: formatDuration(previous.durationMinutes),
      footnote: t('health.cardioMetricDurationCoverage', {
        recent: recent.durationSessionCount,
        previous: previous.durationSessionCount,
      }),
      change:
        recent.durationMinutes === null || previous.durationMinutes === null
          ? undefined
          : t('health.cardioMetricAbsoluteChange', {
              change: signedDuration(recent.durationMinutes - previous.durationMinutes),
            }),
    },
  ];

  if (recent.medianMaximumHeartRateBpm !== null || previous.medianMaximumHeartRateBpm !== null) {
    dimensions.push({
      label: t('health.cardioMetricMaximumHeartRate'),
      value:
        recent.medianMaximumHeartRateBpm === null
          ? '—'
          : `${Math.round(recent.medianMaximumHeartRateBpm)} ${t('health.cardioBpm')}`,
      previous:
        previous.medianMaximumHeartRateBpm === null
          ? '—'
          : `${Math.round(previous.medianMaximumHeartRateBpm)} ${t('health.cardioBpm')}`,
      footnote: t('health.cardioMetricMaximumHeartRateCounts', {
        recent: recent.sessionsWithMaximumHeartRate,
        previous: previous.sessionsWithMaximumHeartRate,
      }),
    });
  }

  if (recent.distanceKm !== null || previous.distanceKm !== null) {
    dimensions.push({
      label: t('health.cardioMetricDistance'),
      value: recent.distanceKm === null ? '—' : convertDistanceToUi(recent.distanceKm * 1000, 1).label,
      previous: previous.distanceKm === null ? '—' : convertDistanceToUi(previous.distanceKm * 1000, 1).label,
      footnote: t('health.cardioMetricDistanceCoverage', {
        recent: recent.distanceSessionCount,
        previous: previous.distanceSessionCount,
      }),
      change:
        recent.distanceKm === null || previous.distanceKm === null
          ? undefined
          : t('health.cardioMetricAbsoluteChange', {
              change: signedLabel(
                recent.distanceKm - previous.distanceKm,
                convertDistanceToUi(Math.abs(recent.distanceKm - previous.distanceKm) * 1000, 1).label,
              ),
            }),
    });
  }
  if (recent.elevationGainM !== null || previous.elevationGainM !== null) {
    dimensions.push({
      label: t('health.cardioMetricElevation'),
      value:
        recent.elevationGainM === null
          ? '—'
          : units.distance === 'km'
            ? `${recent.elevationGainM} m`
            : `${Math.round(recent.elevationGainM * 3.28084)} ft`,
      previous:
        previous.elevationGainM === null
          ? '—'
          : units.distance === 'km'
            ? `${previous.elevationGainM} m`
            : `${Math.round(previous.elevationGainM * 3.28084)} ft`,
      footnote: t('health.cardioMetricElevationCoverage', {
        recent: recent.elevationSessionCount,
        previous: previous.elevationSessionCount,
      }),
    });
  }
  if (performanceLabel) {
    const performanceCopy = getCardioPerformanceChangeCopy(assessment.performance);
    dimensions.push({
      label: performanceLabel,
      value: formatEvaluationMetric(
        assessment.performance.recentValue,
        assessment.performance.metric,
        normalizedSportType,
        convertSpeedToUi,
      ),
      previous: formatEvaluationMetric(
        assessment.performance.previousValue,
        assessment.performance.metric,
        normalizedSportType,
        convertSpeedToUi,
      ),
      footnote: [performanceSourceNote, t(performanceCopy.key, performanceCopy.options)].filter(Boolean).join(' '),
    });
  }
  if (recent.strengthVolumeKg !== null || previous.strengthVolumeKg !== null) {
    dimensions.push({
      label: t('health.cardioMetricStrengthVolume'),
      value: recent.strengthVolumeKg === null ? '—' : convertWeightToUi(recent.strengthVolumeKg, 0).label,
      previous: previous.strengthVolumeKg === null ? '—' : convertWeightToUi(previous.strengthVolumeKg, 0).label,
      footnote: t('health.cardioMetricStrengthVolumeCoverage', {
        recent: recent.strengthVolumeSessionCount,
        previous: previous.strengthVolumeSessionCount,
      }),
      change:
        recent.strengthVolumeKg === null || previous.strengthVolumeKg === null
          ? undefined
          : t('health.cardioMetricAbsoluteChange', {
              change: signedLabel(
                recent.strengthVolumeKg - previous.strengthVolumeKg,
                convertWeightToUi(Math.abs(recent.strengthVolumeKg - previous.strengthVolumeKg), 0).label,
              ),
            }),
    });
  }
  if (recent.strengthSetCount !== null || previous.strengthSetCount !== null) {
    dimensions.push({
      label: t('health.cardioMetricStrengthSets'),
      value: recent.strengthSetCount?.toString() ?? '—',
      previous: previous.strengthSetCount?.toString() ?? '—',
      footnote: t('health.cardioMetricStrengthSetsCoverage', {
        recent: recent.strengthSetSessionCount,
        previous: previous.strengthSetSessionCount,
      }),
      change:
        recent.strengthSetCount === null || previous.strengthSetCount === null
          ? undefined
          : t('health.cardioMetricAbsoluteChange', {
              change: signed(recent.strengthSetCount - previous.strengthSetCount),
            }),
    });
  }
  if (recent.strengthRepCount !== null || previous.strengthRepCount !== null) {
    dimensions.push({
      label: t('health.cardioMetricStrengthReps'),
      value: recent.strengthRepCount?.toString() ?? '—',
      previous: previous.strengthRepCount?.toString() ?? '—',
      footnote: t('health.cardioMetricStrengthRepsCoverage', {
        recent: recent.strengthRepSessionCount,
        previous: previous.strengthRepSessionCount,
      }),
      change:
        recent.strengthRepCount === null || previous.strengthRepCount === null
          ? undefined
          : t('health.cardioMetricAbsoluteChange', {
              change: signed(recent.strengthRepCount - previous.strengthRepCount),
            }),
    });
  }

  return (
    <View style={styles.dimensionSummary}>
      <Text style={[styles.dimensionTitle, colors.title]}>{t('health.cardioDimensionSummaryTitle')}</Text>
      {normalizeSportType(sportType) === null ? (
        <Text style={[styles.dimensionFootnote, colors.subtitle]}>{t('health.cardioGenericSportDescription')}</Text>
      ) : null}
      <View style={styles.dimensionGrid}>
        {dimensions.map(dimension => (
          <View key={dimension.label} style={[styles.dimensionTile, colors.emptyState]}>
            <Text style={[styles.dimensionLabel, colors.subtitle]}>{dimension.label}</Text>
            <Text style={[styles.dimensionValue, colors.title]}>{dimension.value}</Text>
            <Text style={[styles.dimensionPrevious, colors.subtitle]}>
              {t('health.cardioMetricPrevious', { value: dimension.previous ?? '—' })}
            </Text>
            {dimension.footnote ? (
              <Text style={[styles.dimensionFootnote, colors.subtitle]}>{dimension.footnote}</Text>
            ) : null}
            {dimension.change ? (
              <Text style={[styles.dimensionFootnote, colors.subtitle]}>{dimension.change}</Text>
            ) : null}
          </View>
        ))}
      </View>
      {heartRateTrendData.length > 1 ? (
        <View style={styles.trendChartBlock}>
          <View style={styles.trendChartHeading}>
            <Text style={[styles.dimensionTitle, colors.title]}>{t('health.cardioHeartRateTrendTitle')}</Text>
            <Text style={[styles.dimensionFootnote, colors.subtitle]}>
              {t('health.cardioHeartRateTrendDescription', { bucket: t(trendBucketTranslation) })}
            </Text>
          </View>
          <HealthHistoryChart
            key={`${normalizedSportType}-${period}`}
            data={heartRateTrendData}
            height={200}
            color={chartColor}
            unit={t('health.cardioBpm')}
            range={chartRange}
            summaryValue={
              assessment.cardiovascular.recentMedianBpm === null
                ? '—'
                : `${Math.round(assessment.cardiovascular.recentMedianBpm)} ${t('health.cardioBpm')}`
            }
            summaryDate={t(CARDIO_PERIOD_TRANSLATIONS[period])}
            summaryLabel={t('health.cardioMetricHeartRate')}
            formatSelectedValue={value => `${Math.round(value)} ${t('health.cardioBpm')}`}
            formatSelectedDate={point => point.label ?? point.dateRange}
          />
        </View>
      ) : null}
      {assessment.strengthExercises.length > 0 ? (
        <View style={styles.strengthComparisonBlock}>
          <Text style={[styles.dimensionTitle, colors.title]}>{t('health.cardioStrengthComparisonTitle')}</Text>
          {assessment.strengthExercises.map(comparison => (
            <Text
              key={`${comparison.exerciseId}-${comparison.repsPerSet}`}
              style={[styles.dimensionFootnote, colors.subtitle]}
            >
              {t('health.cardioStrengthComparison', {
                exercise: comparison.exerciseName || t('health.cardioUnknownExercise'),
                reps: comparison.repsPerSet,
                recent: convertWeightToUi(comparison.recentMedianLoadKg).label,
                previous: convertWeightToUi(comparison.previousMedianLoadKg).label,
                change: `${comparison.changePercent > 0 ? '+' : ''}${comparison.changePercent.toFixed(1)}`,
                recentSessions: comparison.recentSessionCount,
                previousSessions: comparison.previousSessionCount,
              })}
            </Text>
          ))}
          <Text style={[styles.dimensionFootnote, colors.subtitle]}>{t('health.cardioStrengthComparisonCaution')}</Text>
        </View>
      ) : null}
      {evidenceActivities.length > 0 ? (
        <View style={styles.evidenceBlock}>
          <Text style={[styles.dimensionTitle, colors.title]}>
            {t('health.cardioEvidenceTitle', { shown: evidenceActivities.length, total: evidenceIds.size })}
          </Text>
          {evidenceActivities.map(activity => {
            const isRecent = recentIds.has(activity.id);
            const details = [
              activity.avg_heart_rate !== null &&
              Number.isFinite(activity.avg_heart_rate) &&
              activity.avg_heart_rate >= 40 &&
              activity.avg_heart_rate <= 220
                ? `${Math.round(activity.avg_heart_rate)} ${t('health.cardioBpm')}`
                : null,
              activity.duration_s !== null && Number.isFinite(activity.duration_s) && activity.duration_s > 0
                ? formatDuration(Math.round(activity.duration_s / 60))
                : null,
              activity.distance_m !== null && Number.isFinite(activity.distance_m) && activity.distance_m > 0
                ? convertDistanceToUi(activity.distance_m, 1).label
                : null,
            ].filter(Boolean);
            return (
              <Text key={activity.id} style={[styles.dimensionFootnote, colors.subtitle]}>
                {formatLocalizedDate(new Date(activity.start_time), { en: 'MMM d, yyyy', es: 'd MMM yyyy' })}
                {' · '}
                {isRecent ? t('health.cardioRecentPeriod') : t('health.cardioEarlierPeriod')}
                {details.length > 0 ? ` · ${details.join(' · ')}` : ''}
              </Text>
            );
          })}
          {evidenceIds.size > evidenceActivities.length ? (
            <Text style={[styles.dimensionFootnote, colors.subtitle]}>
              {t('health.cardioEvidenceMore', { count: evidenceIds.size - evidenceActivities.length })}
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  dimensionSummary: { gap: 9, marginTop: 12 },
  dimensionTitle: { fontSize: 13, fontWeight: '700' },
  dimensionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  trendChartBlock: { gap: 5, marginTop: 2 },
  trendChartHeading: { gap: 2 },
  dimensionTile: { flexGrow: 1, flexBasis: '47%', minWidth: 140, borderRadius: 14, padding: 11, gap: 3 },
  dimensionLabel: { fontSize: 11, lineHeight: 15 },
  dimensionValue: { fontSize: 17, fontWeight: '700' },
  dimensionPrevious: { fontSize: 11, lineHeight: 15 },
  dimensionFootnote: { fontSize: 10, lineHeight: 14, marginTop: 2 },
  strengthComparisonBlock: { gap: 5, marginTop: 2 },
  evidenceBlock: { gap: 5, marginTop: 2 },
});
