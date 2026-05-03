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
import { useProfile } from '../../../hooks/settings/useProfile';
import { useUnitConversion } from '../../../hooks/useUnitConversion';
import { GlassCard } from '../../../components/GlassCard';
import { useHealthStyles } from '../../../hooks/useHealthStyles';
import { MetricRangeBar } from './MetricRangeBar';
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
import { calculateBodyComposition, BodyCompositionInput } from '../algorithms/bodyComposition';
import { BodyMeasurement, MaleOrFemale, MeasurementType } from '../../../types/requests.types';
import { useTranslation } from 'react-i18next';
import { getDateFnsLocale } from '../../../i18n/dateLocale';

type TimeRange = 'S' | 'M' | '6M' | 'A';
export type MetricType = 'weight' | 'bmi' | 'bodyFat' | 'muscle' | MeasurementType;

type HealthInteractiveChartProps = {
  onExportPress?: () => void;
  isExporting?: boolean;
};

const RANGES: { label: string; value: TimeRange }[] = [
  { label: 'S', value: 'S' },
  { label: 'M', value: 'M' },
  { label: '6M', value: '6M' },
  { label: 'A', value: 'A' },
];

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
      { label: t('health.thigh'), value: 'thigh' },
    ],
    [t],
  );

  // Calculate Age and Sex for Ranges
  const { age, sex } = useMemo(() => {
    let calculatedAge = 30; // Default
    if (profile?.date_of_birth) {
      calculatedAge = differenceInYears(new Date(), new Date(profile.date_of_birth));
    }
    return {
      age: calculatedAge,
      sex: (profile?.sex === 'female' ? 'female' : 'male') as MaleOrFemale,
    };
  }, [profile]);

  // Get user height in meters for BMI calculation
  const heightM = useMemo(() => {
    if (profile?.height_cm && profile.height_cm > 0) {
      return profile.height_cm / 100;
    }
    return 1.7; // Default fallback 170cm
  }, [profile?.height_cm]);

  const { chartData, dateRange, xAxisTicks, domainStart, domainEnd, visibleDurationMs } = useMemo(() => {
    if (!weightLogs && !measurements) {
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
        weightLogs?.map(l => ({
          date: new Date(l.measured_at),
          value: l.weight_kg / (heightM * heightM),
        })) || [];
    } else if (metric === 'bodyFat') {
      rawData =
        weightLogs
          ?.filter(l => l.bodyfat_percent && l.bodyfat_percent > 0)
          .map(l => ({
            date: new Date(l.measured_at),
            value: l.bodyfat_percent!,
          })) || [];
    } else if (metric === 'muscle') {
      rawData =
        weightLogs
          ?.filter(l => l.muscle_mass_kg && l.muscle_mass_kg > 0 && l.weight_kg > 0)
          .map(l => ({
            date: new Date(l.measured_at),
            value: (l.muscle_mass_kg! / l.weight_kg) * 100,
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
  }, [weightLogs, measurements, metric, range, heightM, convertWeightToUi]);

  const isLoading = loadingWeight || loadingMeas;

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

  // Calculate formula metadata for body fat and muscle
  const formulaInfo = useMemo(() => {
    if (!['bodyFat', 'muscle'].includes(metric)) return null;
    if (!profile || !weightLogs) return null;

    const latestWeight = weightLogs.length > 0 ? weightLogs[0].weight_kg : 70;

    const measInput: { [key: string]: number } = {};
    if (measurements) {
      const latestByType: { [key: string]: BodyMeasurement } = {};
      measurements.forEach(m => {
        if (
          !latestByType[m.measurement_type] ||
          new Date(m.measured_at) > new Date(latestByType[m.measurement_type].measured_at)
        ) {
          latestByType[m.measurement_type] = m;
        }
      });

      Object.keys(latestByType).forEach(type => {
        let key = type;
        if (key === 'hips') key = 'hip';
        measInput[key] = latestByType[type].value_cm;
      });
    }

    const input: BodyCompositionInput = {
      weightKg: latestWeight,
      heightCm: profile.height_cm || 170,
      age,
      sex,
      measurements: measInput,
    };

    const result = calculateBodyComposition(input);

    if (metric === 'bodyFat' && result.bodyFat) {
      return result.bodyFat.methodLabel;
    }
    if (metric === 'muscle' && result.muscle) {
      return result.muscle.methodLabel;
    }

    return null;
  }, [metric, profile, weightLogs, measurements, age, sex]);

  const getUnit = () => {
    if (metric === 'bodyFat' || metric === 'muscle') return '%';
    if (metric === 'weight') return units.weight;
    if (metric === 'bmi') return '';
    return 'cm';
  };

  const handlePointSelect = (point: ChartDataPointSelect) => {
    setSelectedPoint(point);
  };

  const handleVisibleRangeChange = useCallback((nextVisibleRange: { start: Date; end: Date }) => {
    setVisibleRange(nextVisibleRange);
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
          >
            <Text style={styles.historyButtonText}>{t('health.history')}</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.metricsContent}
        style={styles.metricScroll}
      >
        {metrics.map(m => (
          <TouchableOpacity
            key={m.value}
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
        <View
          style={[
            styles.rangeContainer,
            { backgroundColor: isDark ? 'rgba(120,120,128,0.24)' : 'rgba(120,120,128,0.12)' },
          ]}
        >
          {RANGES.map(r => (
            <TouchableOpacity
              key={r.value}
              style={[
                styles.rangeBtn,
                range === r.value && {
                  backgroundColor: isDark ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.9)',
                },
              ]}
              onPress={() => {
                setRange(r.value);
                setSelectedPoint(undefined);
                setVisibleRange(undefined);
              }}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.rangeText,
                  { color: themeColors.textPrimary },
                  range === r.value && { color: isDark ? '#FFFFFF' : '#000000', fontWeight: '600' },
                ]}
              >
                {r.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.infoContainer}>
          {!selectedPoint && (
            <Text style={[styles.infoLabel, { color: themeColors.textSecondary }]}>{t('health.averageAllCaps')}</Text>
          )}
          <View style={styles.valueRow}>
            <Text style={[styles.infoValue, { color: themeColors.textPrimary }]}>
              {displayValue !== null ? displayValue.toFixed(1) : '-'}
            </Text>
            <Text style={[styles.infoUnit, { color: themeColors.textSecondary }]}>{getUnit()}</Text>
          </View>
          <Text style={[styles.infoDate, { color: themeColors.textSecondary }]}>{displayDate}</Text>
        </View>

        {isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator color="#007AFF" size="large" />
          </View>
        ) : (
          <SimpleChart
            data={chartData}
            type="line"
            height={260}
            color="#007AFF"
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

        {rangeMetricKey && rangeBarValue > 0 && (
          <View style={{ marginTop: 24 }}>
            <MetricRangeBar value={rangeBarValue} metricKey={rangeMetricKey} age={age} sex={sex} />
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
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  historyButton: {
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
  rangeContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 10,
    padding: 2,
    marginBottom: 20,
  },
  rangeBtn: {
    flex: 1,
    paddingVertical: 7,
    borderRadius: 8,
    alignItems: 'center',
  },
  rangeText: {
    fontSize: 13,
    fontWeight: '400',
  },
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
    alignItems: 'flex-end',
    marginBottom: 4,
  },
  infoValue: {
    fontSize: 34,
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
    opacity: 0.7,
  },
});
