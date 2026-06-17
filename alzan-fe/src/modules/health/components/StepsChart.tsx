import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import {
  eachMonthOfInterval,
  endOfMonth,
  format,
  isSameDay,
  isSameMonth,
  startOfMonth,
  subDays,
  subMonths,
} from 'date-fns';
import { GlassCard } from '../../../components/GlassCard';
import { useHealthStyles } from '../../../hooks/useHealthStyles';
import { getDateFnsLocale, getLocaleTag } from '../../../i18n/dateLocale';
import { useTranslation } from 'react-i18next';
import { aggregateStepsByDate, useStepsRange } from '../hooks/useSteps';

type TimeRange = 'S' | 'M' | '6M' | 'A';

const RANGES: TimeRange[] = ['S', 'M', '6M', 'A'];

type Bucket = {
  /** Anchor date for the bucket (day for S/M, month start for 6M/A). */
  date: Date;
  /** Axis label. */
  label: string;
  /** Full label shown when the bucket is selected. */
  fullLabel: string;
  value: number;
  hasData: boolean;
  /** True for monthly buckets (value is a daily average). */
  isMonthly: boolean;
};

const niceCeil = (value: number): number => {
  if (value <= 0) return 1000;
  const magnitude = Math.pow(10, Math.floor(Math.log10(value)));
  const normalized = value / magnitude;
  let step: number;
  if (normalized <= 1) step = 1;
  else if (normalized <= 2) step = 2;
  else if (normalized <= 5) step = 5;
  else step = 10;
  return step * magnitude;
};

const formatSteps = (value: number): string => {
  const rounded = Math.round(value);
  return rounded.toLocaleString(getLocaleTag());
};

const formatAxis = (value: number): string => {
  if (value >= 1000) return `${(value / 1000).toFixed(value % 1000 === 0 ? 0 : 1)}k`;
  return `${Math.round(value)}`;
};

export const StepsChart: React.FC = () => {
  const { t } = useTranslation();
  const { styles: dynamicStyles, colors: themeColors, isDark } = useHealthStyles();
  const [range, setRange] = useState<TimeRange>('S');
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  const { data: rows, isLoading } = useStepsRange(366);

  const buckets = useMemo<Bucket[]>(() => {
    const byDate = aggregateStepsByDate(rows ?? []);
    const now = new Date();
    const locale = getDateFnsLocale();

    const dailyBuckets = (numDays: number): Bucket[] => {
      const result: Bucket[] = [];
      for (let i = numDays - 1; i >= 0; i--) {
        const day = subDays(now, i);
        const value = byDate.get(format(day, 'yyyy-MM-dd')) ?? 0;
        result.push({
          date: day,
          label: numDays <= 7 ? format(day, 'EEEEE', { locale }) : format(day, 'd'),
          fullLabel: format(day, 'd MMM yyyy', { locale }),
          value,
          hasData: value > 0,
          isMonthly: false,
        });
      }
      return result;
    };

    const monthlyBuckets = (numMonths: number): Bucket[] => {
      const start = startOfMonth(subMonths(now, numMonths - 1));
      const months = eachMonthOfInterval({ start, end: now });
      return months.map(month => {
        const monthEnd = endOfMonth(month);
        let sum = 0;
        let daysWithData = 0;
        for (const [dateStr, value] of byDate.entries()) {
          const d = new Date(`${dateStr}T00:00:00`);
          if (d >= month && d <= monthEnd) {
            sum += value;
            daysWithData += 1;
          }
        }
        const avg = daysWithData > 0 ? sum / daysWithData : 0;
        return {
          date: month,
          label: format(month, 'MMM', { locale }).replace('.', ''),
          fullLabel: format(month, 'MMMM yyyy', { locale }),
          value: avg,
          hasData: daysWithData > 0,
          isMonthly: true,
        };
      });
    };

    switch (range) {
      case 'S':
        return dailyBuckets(7);
      case 'M':
        return dailyBuckets(30);
      case '6M':
        return monthlyBuckets(6);
      case 'A':
        return monthlyBuckets(12);
    }
  }, [rows, range]);

  const dataBuckets = buckets.filter(b => b.hasData);
  const isMonthly = buckets[0]?.isMonthly ?? false;

  const average = dataBuckets.length > 0 ? dataBuckets.reduce((s, b) => s + b.value, 0) / dataBuckets.length : 0;

  const selected = selectedIndex !== null ? buckets[selectedIndex] : null;
  const headerValue = selected ? selected.value : average;
  const headerTitle = selected
    ? selected.isMonthly
      ? t('steps.dailyAverage')
      : t('steps.total')
    : t('steps.dailyAverage');
  const headerSubtitle = selected
    ? selected.fullLabel
    : `${format(buckets[0]?.date ?? new Date(), isMonthly ? 'MMM yyyy' : 'd MMM', { locale: getDateFnsLocale() })} - ${format(
        buckets[buckets.length - 1]?.date ?? new Date(),
        isMonthly ? 'MMM yyyy' : 'd MMM',
        { locale: getDateFnsLocale() },
      )}`;

  // Chart geometry
  const chartHeight = 220;
  const plotHeight = 174;

  const maxValue = useMemo(() => niceCeil(Math.max(...buckets.map(b => b.value), 1)), [buckets]);
  const yTicks = useMemo(() => [0, maxValue / 2, maxValue], [maxValue]);

  const barColor = themeColors.primary;

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={[styles.title, { color: themeColors.textPrimary }]}>{t('home.steps')}</Text>
      </View>

      <GlassCard style={[styles.card, dynamicStyles.glassCard]}>
        {/* Range selector */}
        <View
          style={[
            styles.rangeContainer,
            { backgroundColor: isDark ? 'rgba(120,120,128,0.24)' : 'rgba(120,120,128,0.12)' },
          ]}
        >
          {RANGES.map(r => (
            <Pressable
              key={r}
              style={[
                styles.rangeBtn,
                range === r && { backgroundColor: isDark ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.9)' },
              ]}
              onPress={() => {
                setRange(r);
                setSelectedIndex(null);
              }}
            >
              <Text
                style={[styles.rangeText, { color: themeColors.textPrimary }, range === r && { fontWeight: '600' }]}
              >
                {t(`steps.range.${r}`)}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* Header value */}
        <View style={styles.infoContainer}>
          <Text style={[styles.infoLabel, { color: themeColors.textSecondary }]}>{headerTitle}</Text>
          <View style={styles.valueRow}>
            <Text style={[styles.infoValue, { color: themeColors.textPrimary }]}>
              {dataBuckets.length > 0 ? formatSteps(headerValue) : '--'}
            </Text>
            <Text style={[styles.infoUnit, { color: themeColors.textSecondary }]}>{t('steps.unit')}</Text>
          </View>
          <Text style={[styles.infoDate, { color: themeColors.textSecondary }]}>{headerSubtitle}</Text>
        </View>

        {/* Chart */}
        {isLoading ? (
          <View style={[styles.chartArea, { height: chartHeight }]}>
            <ActivityIndicator color={barColor} size="large" />
          </View>
        ) : (
          <View style={[styles.chartArea, { height: chartHeight }]}>
            <View style={styles.chartRow}>
              <View style={[styles.yAxis, { height: plotHeight }]}>
                {[...yTicks].reverse().map(tick => (
                  <Text key={`ylabel-${tick}`} style={[styles.yLabel, { color: themeColors.textSecondary }]}>
                    {formatAxis(tick)}
                  </Text>
                ))}
              </View>

              <View style={styles.plotContainer}>
                <View pointerEvents="none" style={styles.gridLayer}>
                  {yTicks.map(tick => {
                    const bottom = (tick / maxValue) * plotHeight;
                    return (
                      <View
                        key={`grid-${tick}`}
                        style={[
                          styles.gridLine,
                          { bottom, backgroundColor: themeColors.textSecondary, opacity: tick === 0 ? 0.18 : 0.12 },
                        ]}
                      />
                    );
                  })}
                </View>

                <View style={styles.barsRow}>
                  {buckets.map((bucket, i) => {
                    const barHeight = bucket.hasData ? Math.max((bucket.value / maxValue) * plotHeight, 2) : 0;
                    const showLabel =
                      buckets.length <= 7 ||
                      (isMonthly ? true : i % Math.ceil(buckets.length / 6) === 0) ||
                      i === buckets.length - 1;
                    const isSel = selectedIndex === i;
                    const isToday = !isMonthly && isSameDay(bucket.date, new Date());
                    const isThisMonth = isMonthly && isSameMonth(bucket.date, new Date());

                    return (
                      <Pressable
                        key={`${bucket.fullLabel}-${i}`}
                        accessibilityRole="button"
                        accessibilityLabel={`${bucket.fullLabel}, ${formatSteps(bucket.value)} ${t('steps.unit')}`}
                        onPress={() => setSelectedIndex(isSel ? null : i)}
                        style={styles.barTouch}
                      >
                        <View style={[styles.barColumn, { height: plotHeight }]}>
                          {bucket.hasData && (
                            <View
                              style={[
                                styles.bar,
                                {
                                  height: barHeight,
                                  backgroundColor: barColor,
                                  opacity: selectedIndex === null || isSel ? 1 : 0.35,
                                },
                              ]}
                            />
                          )}
                        </View>
                        <Text
                          style={[
                            styles.xLabel,
                            {
                              color: isSel || isToday || isThisMonth ? themeColors.primary : themeColors.textSecondary,
                              fontWeight: isSel ? '700' : '500',
                              opacity: showLabel ? 1 : 0,
                            },
                          ]}
                          numberOfLines={1}
                        >
                          {showLabel ? bucket.label : ' '}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            </View>
          </View>
        )}

        {!isLoading && dataBuckets.length === 0 && (
          <Text style={[styles.emptyText, { color: themeColors.textSecondary }]}>{t('steps.empty')}</Text>
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
    marginBottom: 16,
    paddingHorizontal: 4,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  card: {
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
    marginBottom: 16,
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
    marginRight: 6,
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
  chartArea: {
    width: '100%',
    justifyContent: 'center',
  },
  chartRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    width: '100%',
  },
  yAxis: {
    width: 38,
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    paddingRight: 6,
  },
  plotContainer: {
    flex: 1,
    height: 204,
    position: 'relative',
  },
  gridLayer: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: 174,
  },
  gridLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: StyleSheet.hairlineWidth,
  },
  barsRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    width: '100%',
    height: '100%',
  },
  yLabel: {
    textAlign: 'right',
    fontSize: 10,
    opacity: 0.7,
  },
  barTouch: {
    flex: 1,
    height: '100%',
    minWidth: 4,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  barColumn: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  bar: {
    width: '56%',
    minWidth: 3,
    maxWidth: 22,
    borderTopLeftRadius: 5,
    borderTopRightRadius: 5,
  },
  xLabel: {
    width: '100%',
    textAlign: 'center',
    fontSize: 10,
    height: 20,
    marginTop: 6,
  },
  emptyText: {
    textAlign: 'center',
    paddingVertical: 24,
    fontSize: 14,
  },
});
