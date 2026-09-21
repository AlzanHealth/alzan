import React, { useState, useMemo, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Download } from 'lucide-react-native';
import { HealthScreenNavigationProp } from '../../../types/navigation.types';
import {
  ChartAxisTick,
  ChartDataPoint,
  ChartDataPointSelect,
  SimpleChart,
} from '../../../components/stats/SimpleChart';
import { useWeightLogs } from '../hooks/useWeight';
import { useMeasurements } from '../hooks/useMeasurements';
import { useBodyCompositionLogs } from '../hooks/useBodyCompositionLogs';
import { useProfile } from '../../../hooks/settings/useProfile';
import { useUnitConversion } from '../../../hooks/useUnitConversion';
import { GlassCard } from '../../../components/GlassCard';
import { useHealthStyles } from '../../../hooks/useHealthStyles';
import { MetricRangeBar } from './MetricRangeBar';
import { HealthPeriodSelector } from './HealthPeriodSelector';
import {
  format,
  subDays,
  subMonths,
  eachMonthOfInterval,
  eachDayOfInterval,
  endOfMonth,
  startOfMonth,
  differenceInYears,
} from 'date-fns';
import { MeasurementType } from '../../../types/requests.types';
import { useTranslation } from 'react-i18next';
import { getDateFnsLocale } from '../../../i18n/dateLocale';

type TimeRange = 'S' | 'M' | '6M' | 'A';
type AbdominalHistoryMetric = 'waistToHeight' | 'waistToHip';
export type MetricType = 'weight' | 'bmi' | 'bodyFat' | 'muscle' | AbdominalHistoryMetric | MeasurementType;

type HealthInteractiveChartProps = {
  onExportPress?: () => void;
  isExporting?: boolean;
};

export const HealthInteractiveChart = ({ onExportPress, isExporting = false }: HealthInteractiveChartProps) => {
  const { t } = useTranslation();
  const navigation = useNavigation<HealthScreenNavigationProp>();
  const [range, setRange] = useState<TimeRange>('M');
  const [metric, setMetric] = useState<MetricType>('weight');
  const [selectedPoint, setSelectedPoint] = useState<ChartDataPointSelect | undefined>(undefined);
  const [visibleRange, setVisibleRange] = useState<{ start: Date; end: Date } | undefined>(undefined);
  const { styles: dynamicStyles, colors: themeColors, isDark } = useHealthStyles();

  const { data: weightLogs, isLoading: loadingWeight } = useWeightLogs(365);
  const { data: measurements, isLoading: loadingMeas } = useMeasurements(undefined, 365);
  const { data: compositionLogs, isLoading: loadingComposition } = useBodyCompositionLogs(365);

  const { profile } = useProfile();
  const { convertWeightToUi, units } = useUnitConversion();
  const metrics: { label: string; value: MetricType }[] = useMemo(
    () => [
      { label: t('settings.weight'), value: 'weight' },
      { label: t('health.imc'), value: 'bmi' },
      { label: t('health.bodyFat'), value: 'bodyFat' },
      { label: t('health.muscle'), value: 'muscle' },
      { label: t('health.arm'), value: 'arm' },
      { label: t('health.chest'), value: 'chest' },
      { label: t('health.abdomen'), value: 'abdomen' },
      { label: t('health.hips'), value: 'hips' },
      { label: t('health.waistToHeight'), value: 'waistToHeight' },
      { label: t('health.waistToHip'), value: 'waistToHip' },
      { label: t('health.thigh'), value: 'thigh' },
    ],
    [t],
  );

  // Calculate Age and Sex for Ranges
  const demographicRange = useMemo(() => {
    if (!profile?.date_of_birth || (profile.sex !== 'male' && profile.sex !== 'female')) return null;
    return {
      age: differenceInYears(new Date(), new Date(profile.date_of_birth)),
      sex: profile.sex,
    };
  }, [profile]);

  const { chartData, dateRange, xAxisTicks, domainStart, domainEnd, visibleDurationMs } = useMemo(() => {
    if (!weightLogs && !measurements && !compositionLogs) {
      return {
        chartData: [],
        dateRange: '',
        xAxisTicks: [],
        domainStart: undefined,
        domainEnd: undefined,
        visibleDurationMs: undefined,
      };
    }

    let rawData: { date: Date; value: number }[] = [];

    // 1. Get raw data
    if (metric === 'weight') {
      rawData =
        weightLogs?.map(l => ({
          date: new Date(l.measured_at),
          value: convertWeightToUi(l.weight_kg).value,
        })) || [];
    } else if (metric === 'bmi') {
      rawData =
        compositionLogs
          ?.filter(log => log.calculation_status !== 'stale' && log.bmi != null)
          .map(log => ({
            date: new Date(`${log.calculated_for_date}T12:00:00`),
            value: log.bmi!,
          })) || [];
    } else if (metric === 'bodyFat') {
      rawData =
        compositionLogs
          ?.filter(log => log.calculation_status !== 'stale' && log.bodyfat_percent != null)
          .map(log => ({
            date: new Date(`${log.calculated_for_date}T12:00:00`),
            value: log.bodyfat_percent!,
          })) || [];
    } else if (metric === 'muscle') {
      rawData =
        compositionLogs
          ?.filter(log => log.calculation_status !== 'stale' && log.muscle_percent != null)
          .map(log => ({
            date: new Date(`${log.calculated_for_date}T12:00:00`),
            value: log.muscle_percent!,
          })) || [];
    } else if (metric === 'waistToHeight') {
      rawData =
        compositionLogs
          ?.filter(log => log.waist_to_height_ratio != null && log.waist_to_height_ratio > 0)
          .map(log => ({
            date: new Date(`${log.calculated_for_date}T12:00:00`),
            value: log.waist_to_height_ratio!,
          })) || [];
    } else if (metric === 'waistToHip') {
      rawData =
        compositionLogs
          ?.filter(log => log.waist_to_hip_ratio != null && log.waist_to_hip_ratio > 0)
          .map(log => ({
            date: new Date(`${log.calculated_for_date}T12:00:00`),
            value: log.waist_to_hip_ratio!,
          })) || [];
    } else {
      let typesToSearch: string[] = [metric];
      // Handle variations/aliases for measurement types
      if (metric === 'abdomen') typesToSearch = ['abdomen'];
      if (metric === 'hips') typesToSearch = ['hips', 'hip'];

      const typeLogs = measurements?.filter(m => typesToSearch.includes(m.measurement_type)) || [];
      rawData = typeLogs.map(l => ({
        date: new Date(l.measured_at),
        value: l.value_cm,
      }));
    }

    rawData.sort((a, b) => a.date.getTime() - b.date.getTime());

    const now = new Date();
    let chartDataPoints: ChartDataPoint[] = [];
    let chartTicks: ChartAxisTick[] = [];
    let dateRangeString = '';
    let startDate = subDays(now, 29);
    let rangeDomainEnd: Date = now;
    let visibleSpanMs: number | undefined;
    const rollingWeekStart = subDays(now, 6);

    switch (range) {
      case 'S': {
        startDate = subDays(now, 83);
        rangeDomainEnd = now;
        visibleSpanMs = 7 * 24 * 60 * 60 * 1000;
        const visibleData = rawData.filter(point => point.date >= startDate && point.date <= now);
        chartDataPoints = visibleData.map(point => ({
          date: point.date,
          value: point.value,
          count: 1,
          rawValues: [point.value],
        }));
        chartTicks = eachDayOfInterval({ start: startDate, end: now }).map(day => ({
          date: day,
          label: format(day, 'EEE', { locale: getDateFnsLocale() }).substring(0, 3),
        }));
        dateRangeString = `${format(rollingWeekStart, 'd MMM', { locale: getDateFnsLocale() })} - ${format(
          now,
          'd MMM',
          {
            locale: getDateFnsLocale(),
          },
        )}`;
        break;
      }

      case 'M': {
        startDate = subDays(now, 29);
        const visibleData = rawData.filter(point => point.date >= startDate && point.date <= now);
        const monthDays = eachDayOfInterval({ start: startDate, end: now });
        chartDataPoints = visibleData.map(point => ({
          date: point.date,
          value: point.value,
          count: 1,
          rawValues: [point.value],
        }));
        chartTicks = monthDays
          .filter((day, index) => index % 7 === 0 || index === monthDays.length - 1)
          .map(day => ({
            date: day,
            label: format(day, 'd'),
          }));
        visibleSpanMs = now.getTime() - startDate.getTime();
        dateRangeString = `${format(startDate, 'd MMM', { locale: getDateFnsLocale() })} - ${format(now, 'd MMM', {
          locale: getDateFnsLocale(),
        })}`;
        break;
      }

      case '6M': {
        startDate = startOfMonth(subMonths(now, 5));
        rangeDomainEnd = endOfMonth(now);
        const visibleData = rawData.filter(point => point.date >= startDate && point.date <= now);
        chartDataPoints = visibleData.map(point => ({
          date: point.date,
          value: point.value,
          count: 1,
          rawValues: [point.value],
        }));
        chartTicks = eachMonthOfInterval({ start: startDate, end: rangeDomainEnd }).map(month => ({
          date: month,
          label: format(month, 'MMM', { locale: getDateFnsLocale() }).replace('.', ''),
        }));
        visibleSpanMs = rangeDomainEnd.getTime() - startDate.getTime();
        dateRangeString = `${format(startDate, 'MMM yyyy', { locale: getDateFnsLocale() })} - ${format(
          now,
          'MMM yyyy',
          {
            locale: getDateFnsLocale(),
          },
        )}`;
        break;
      }

      case 'A': {
        startDate = startOfMonth(subMonths(now, 11));
        rangeDomainEnd = endOfMonth(now);
        const visibleData = rawData.filter(point => point.date >= startDate && point.date <= now);
        chartDataPoints = visibleData.map(point => ({
          date: point.date,
          value: point.value,
          count: 1,
          rawValues: [point.value],
        }));
        chartTicks = eachMonthOfInterval({ start: startDate, end: rangeDomainEnd }).map(month => ({
          date: month,
          label: format(month, 'MMM', { locale: getDateFnsLocale() }).substring(0, 1).toUpperCase(),
        }));
        visibleSpanMs = rangeDomainEnd.getTime() - startDate.getTime();
        dateRangeString = `${format(startDate, 'MMM yyyy', { locale: getDateFnsLocale() })} - ${format(
          now,
          'MMM yyyy',
          {
            locale: getDateFnsLocale(),
          },
        )}`;
        break;
      }
    }

    return {
      chartData: chartDataPoints,
      dateRange: dateRangeString,
      xAxisTicks: chartTicks,
      domainStart: startDate,
      domainEnd: rangeDomainEnd,
      visibleDurationMs: visibleSpanMs,
    };
  }, [weightLogs, measurements, compositionLogs, metric, range, convertWeightToUi]);

  const isLoading = loadingWeight || loadingMeas || loadingComposition;

  const effectiveVisibleRange = useMemo(() => {
    if (visibleRange) {
      return visibleRange;
    }

    if (!domainStart || !domainEnd) {
      return undefined;
    }

    if (!visibleDurationMs) {
      return { start: domainStart, end: domainEnd };
    }

    const startMs = Math.max(domainEnd.getTime() - visibleDurationMs, domainStart.getTime());
    return {
      start: new Date(startMs),
      end: domainEnd,
    };
  }, [domainEnd, domainStart, visibleDurationMs, visibleRange]);

  const visibleAverage = useMemo(() => {
    if (!effectiveVisibleRange) {
      return 0;
    }

    const values = chartData
      .filter(point => point.date && point.value !== null)
      .filter(point => {
        const pointTime = point.date!.getTime();
        return pointTime >= effectiveVisibleRange.start.getTime() && pointTime <= effectiveVisibleRange.end.getTime();
      })
      .map(point => point.value!);

    if (values.length === 0) {
      return 0;
    }

    return values.reduce((sum, value) => sum + value, 0) / values.length;
  }, [chartData, effectiveVisibleRange]);

  const visibleDateRange = useMemo(() => {
    if (!effectiveVisibleRange) {
      return dateRange;
    }

    return `${format(effectiveVisibleRange.start, 'd MMM', { locale: getDateFnsLocale() })} - ${format(
      effectiveVisibleRange.end,
      'd MMM',
      {
        locale: getDateFnsLocale(),
      },
    )}`;
  }, [dateRange, effectiveVisibleRange]);

  const displayValue = selectedPoint?.value ?? (visibleAverage > 0 ? visibleAverage : null);
  const displayDate = selectedPoint ? selectedPoint.dateRange : visibleDateRange;
  const rangeBarValue = displayValue ?? 0;

  const rangeMetricKey = useMemo(() => {
    switch (metric) {
      case 'bmi':
        return 'bmi';
      case 'bodyFat':
        return 'body_fat_pct';
      case 'muscle':
        return 'skeletal_muscle_pct';
      default:
        return null;
    }
  }, [metric]);

  const formulaInfo = useMemo(() => {
    const latestComplete = compositionLogs?.find(log => log.calculation_status !== 'stale');
    if (metric === 'bodyFat') return latestComplete?.bodyfat_method ?? null;
    if (metric === 'muscle') return latestComplete?.muscle_method ?? null;
    return null;
  }, [compositionLogs, metric]);

  const getUnit = () => {
    if (metric === 'waistToHeight' || metric === 'waistToHip') return '';
    if (metric === 'bodyFat' || metric === 'muscle') return '%';
    if (metric === 'weight') return units.weight;
    if (metric === 'bmi') return '';
    return 'cm';
  };

  const formatMetricValue = (value: number) => {
    if (metric === 'waistToHeight' || metric === 'waistToHip') return value.toFixed(2);
    return value.toFixed(1);
  };

  const handlePointSelect = (point: ChartDataPointSelect) => {
    setSelectedPoint(point);
  };

  const handleVisibleRangeChange = useCallback((nextVisibleRange: { start: Date; end: Date }) => {
    setVisibleRange(previousRange => {
      if (!previousRange) {
        return nextVisibleRange;
      }

      const startDiffMs = Math.abs(previousRange.start.getTime() - nextVisibleRange.start.getTime());
      const endDiffMs = Math.abs(previousRange.end.getTime() - nextVisibleRange.end.getTime());

      return startDiffMs < 1000 && endDiffMs < 1000 ? previousRange : nextVisibleRange;
    });
  }, []);

  const handleClearSelection = useCallback(() => {
    setSelectedPoint(undefined);
  }, []);

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={[styles.headerTitle, { color: themeColors.textPrimary }]}>{t('health.progress')}</Text>
        <View style={styles.headerActions}>
          {onExportPress ? (
            <TouchableOpacity
              onPress={onExportPress}
              style={[
                styles.exportButton,
                {
                  backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : themeColors.primary + '14',
                  borderColor: isDark ? 'rgba(255,255,255,0.12)' : themeColors.primary + '30',
                },
              ]}
              accessibilityRole="button"
              accessibilityLabel={t('health.exportHealthHistory')}
              disabled={isExporting}
              activeOpacity={0.75}
            >
              {isExporting ? (
                <ActivityIndicator size="small" color={themeColors.primary} />
              ) : (
                <Download size={18} color={themeColors.primary} />
              )}
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity
            onPress={() =>
              navigation.navigate('WeightList', {
                metric,
                label: metrics.find(m => m.value === metric)?.label,
              })
            }
            style={styles.historyButton}
            accessibilityRole="button"
          >
            <Text style={[styles.historyButtonText, { color: themeColors.primary }]}>{t('health.history')}</Text>
          </TouchableOpacity>
        </View>
      </View>

      <Text style={[styles.filterLabel, { color: themeColors.textSecondary }]}>{t('health.chartMetric')}</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.metricsContent}
        style={styles.metricScroll}
      >
        {metrics.map(m => (
          <TouchableOpacity
            key={m.value}
            accessibilityRole="button"
            accessibilityState={{ selected: metric === m.value }}
            style={[
              styles.metricChip,
              {
                backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)',
                borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)',
              },
              metric === m.value && {
                backgroundColor: isDark ? 'rgba(255,255,255,0.15)' : themeColors.primary + '20',
                borderColor: isDark ? 'rgba(255,255,255,0.2)' : themeColors.primary,
              },
            ]}
            onPress={() => {
              setMetric(m.value);
              setSelectedPoint(undefined);
              setVisibleRange(undefined);
            }}
            activeOpacity={0.7}
          >
            <Text
              style={[
                styles.metricText,
                { color: themeColors.textSecondary },
                metric === m.value && {
                  color: isDark ? themeColors.textPrimary : themeColors.primary,
                  fontWeight: '700',
                },
              ]}
            >
              {m.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <GlassCard style={[styles.chartWrapper, dynamicStyles.glassCard]}>
        <HealthPeriodSelector
          value={range}
          onChange={nextRange => {
            setRange(nextRange);
            setSelectedPoint(undefined);
            setVisibleRange(undefined);
          }}
        />

        <View style={styles.infoContainer}>
          <Text style={[styles.metricName, { color: themeColors.textPrimary }]}>
            {metrics.find(m => m.value === metric)?.label}
          </Text>
          <Text style={[styles.infoLabel, { color: themeColors.textSecondary }]}>
            {t(selectedPoint ? 'health.selectedRecord' : 'health.averageAllCaps')}
          </Text>
          <View style={styles.valueRow}>
            <Text style={[styles.infoValue, { color: themeColors.textPrimary }]}>
              {displayValue !== null ? formatMetricValue(displayValue) : '-'}
            </Text>
            <Text style={[styles.infoUnit, { color: themeColors.textSecondary }]}>{getUnit()}</Text>
          </View>
          <Text style={[styles.infoDate, { color: themeColors.textSecondary }]}>{displayDate}</Text>
          {selectedPoint && (
            <TouchableOpacity onPress={handleClearSelection} accessibilityRole="button" style={styles.clearSelection}>
              <Text style={{ color: themeColors.primary }}>{t('health.showPeriodAverage')}</Text>
            </TouchableOpacity>
          )}
        </View>

        {isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator color={themeColors.primary} size="large" />
          </View>
        ) : (
          <SimpleChart
            data={chartData}
            type="line"
            height={260}
            color={themeColors.primary}
            lineStyle="linear"
            unit={getUnit()}
            onPointSelect={handlePointSelect}
            selectedPoint={selectedPoint}
            range={range}
            xAxisTicks={xAxisTicks}
            domainStart={domainStart}
            domainEnd={domainEnd}
            visibleDurationMs={visibleDurationMs}
            onVisibleRangeChange={handleVisibleRangeChange}
            onClearSelection={handleClearSelection}
          />
        )}

        {rangeMetricKey && rangeBarValue > 0 && demographicRange && (
          <View style={{ marginTop: 24 }}>
            <MetricRangeBar
              value={rangeBarValue}
              metricKey={rangeMetricKey}
              age={demographicRange.age}
              sex={demographicRange.sex}
            />
            {formulaInfo && (
              <Text style={[styles.formulaText, { color: themeColors.textSecondary }]}>{formulaInfo}</Text>
            )}
          </View>
        )}
      </GlassCard>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: 24,
  },
  headerRow: {
    flexWrap: 'wrap',
    gap: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
    paddingHorizontal: 4,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  exportButton: {
    width: 44,
    height: 44,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  historyButton: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  historyButtonText: {
    color: '#007AFF',
    fontSize: 15,
    fontWeight: '600',
  },
  metricScroll: {
    marginBottom: 20,
  },
  metricsContent: {
    paddingHorizontal: 4,
  },
  metricChip: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 22,
    marginRight: 10,
    borderWidth: 1,
  },
  metricText: {
    fontSize: 14,
    fontWeight: '600',
  },
  chartWrapper: {
    padding: 16,
    borderRadius: 20,
    overflow: 'visible',
  },
  filterLabel: { fontSize: 13, fontWeight: '600', marginBottom: 8, paddingHorizontal: 4 },
  metricName: { fontSize: 20, fontWeight: '700', marginBottom: 8 },
  clearSelection: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' },
  infoContainer: {
    marginBottom: 24,
    paddingHorizontal: 4,
  },
  infoLabel: {
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.5,
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    flexWrap: 'wrap',
    marginBottom: 4,
  },
  infoValue: {
    fontSize: 42,
    fontVariant: ['tabular-nums'],
    fontWeight: '700',
    letterSpacing: -1,
    marginRight: 4,
  },
  infoUnit: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 6,
  },
  infoDate: {
    fontSize: 15,
    fontWeight: '400',
  },
  loadingContainer: {
    height: 260,
    justifyContent: 'center',
    alignItems: 'center',
  },
  formulaText: {
    marginTop: 8,
    fontSize: 12,
    textAlign: 'center',
    fontStyle: 'italic',
  },
});
