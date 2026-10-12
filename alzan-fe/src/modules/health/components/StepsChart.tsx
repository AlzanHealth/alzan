import React, { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { GestureResponderEvent, LayoutChangeEvent, NativeScrollEvent, NativeSyntheticEvent } from 'react-native';
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
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { GlassCard } from '../../../components/GlassCard';
import { useHealthStyles } from '../../../hooks/useHealthStyles';
import { getDateFnsLocale, getLocaleTag } from '../../../i18n/dateLocale';
import { useTranslation } from 'react-i18next';
import { useStepsRange } from '../hooks/useSteps';
import { aggregateStepsByDate } from '../services/stepsAggregation';
import { HealthPeriodSelector } from './HealthPeriodSelector';

type TimeRange = 'S' | 'M' | '6M' | 'A';

const CHART_TOP_PADDING_STEPS = 2000;
const CHART_AXIS_STEP = 500;
const WEEK_PAGE_DAYS = 7;
const WEEK_PAGE_COUNT = 52;
const MONTH_PAGE_DAYS = 30;
const MONTH_PAGE_COUNT = 12;

export type StepsChartHandle = {
  clearSelection: () => void;
};

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

type BucketPage = {
  key: string;
  buckets: Bucket[];
};

const roundDownToAxisStep = (value: number): number => Math.floor(value / CHART_AXIS_STEP) * CHART_AXIS_STEP;

const formatSteps = (value: number): string => {
  const rounded = Math.round(value);
  return rounded.toLocaleString(getLocaleTag());
};

const formatAxis = (value: number): string => {
  if (value >= 1000) return `${(value / 1000).toFixed(value % 1000 === 0 ? 0 : 1)}k`;
  return `${Math.round(value)}`;
};

const chunkBuckets = (buckets: Bucket[], pageSize: number): BucketPage[] => {
  const pages: BucketPage[] = [];

  for (let index = 0; index < buckets.length; index += pageSize) {
    const pageBuckets = buckets.slice(index, index + pageSize);
    const firstBucket = pageBuckets[0];
    const lastBucket = pageBuckets[pageBuckets.length - 1];
    pages.push({
      key: `${firstBucket?.fullLabel ?? index}-${lastBucket?.fullLabel ?? index}`,
      buckets: pageBuckets,
    });
  }

  return pages;
};

export const StepsChart = React.forwardRef<StepsChartHandle>((_, ref) => {
  const { t } = useTranslation();
  const { styles: dynamicStyles, colors: themeColors, isDark } = useHealthStyles();
  const [range, setRange] = useState<TimeRange>('S');
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [pageIndex, setPageIndex] = useState(Number.MAX_SAFE_INTEGER);
  const [plotWidth, setPlotWidth] = useState(0);
  const pageScrollRef = useRef<ScrollView>(null);

  const { data: rows, isLoading } = useStepsRange(366);

  const chartPages = useMemo<BucketPage[]>(() => {
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
          label: numDays <= 7 ? format(day, 'EEE', { locale }).replace('.', '').toLowerCase() : format(day, 'd'),
          fullLabel: format(day, 'd MMM yyyy', { locale }),
          value,
          hasData: byDate.has(format(day, 'yyyy-MM-dd')),
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
        return chunkBuckets(dailyBuckets(WEEK_PAGE_DAYS * WEEK_PAGE_COUNT), WEEK_PAGE_DAYS);
      case 'M':
        return chunkBuckets(dailyBuckets(MONTH_PAGE_DAYS * MONTH_PAGE_COUNT), MONTH_PAGE_DAYS);
      case '6M':
        return [{ key: '6M', buckets: monthlyBuckets(6) }];
      case 'A':
        return [{ key: 'A', buckets: monthlyBuckets(12) }];
    }
  }, [rows, range]);

  const lastPageIndex = Math.max(chartPages.length - 1, 0);
  const activePageIndex = Math.min(pageIndex, lastPageIndex);
  const isPagedRange = chartPages.length > 1;
  const buckets = chartPages[activePageIndex]?.buckets ?? [];
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

  const maxValue = useMemo(() => {
    const highestVisibleValue = Math.max(...buckets.map(b => b.value), 0);
    const paddedValue = highestVisibleValue + CHART_TOP_PADDING_STEPS;
    return Math.max(roundDownToAxisStep(paddedValue), CHART_AXIS_STEP);
  }, [buckets]);
  const yTicks = useMemo(() => {
    const midpoint = roundDownToAxisStep(maxValue / 2);
    return Array.from(new Set([0, midpoint, maxValue]));
  }, [maxValue]);

  const barColor = themeColors.primary;
  const clearSelection = useCallback(() => setSelectedIndex(null), []);
  const stopPropagation = useCallback((event: GestureResponderEvent) => event.stopPropagation(), []);
  const handlePlotLayout = useCallback((event: LayoutChangeEvent) => {
    const nextWidth = Math.round(event.nativeEvent.layout.width);
    setPlotWidth(previousWidth => (previousWidth === nextWidth ? previousWidth : nextWidth));
  }, []);
  const scrollToPage = useCallback(
    (nextPageIndex: number, animated: boolean) => {
      if (plotWidth <= 0) {
        return;
      }

      pageScrollRef.current?.scrollTo({ x: nextPageIndex * plotWidth, animated });
    },
    [plotWidth],
  );
  const goToPage = useCallback(
    (nextPageIndex: number) => {
      const clampedPageIndex = Math.min(Math.max(nextPageIndex, 0), lastPageIndex);
      setSelectedIndex(null);
      setPageIndex(clampedPageIndex);
      scrollToPage(clampedPageIndex, true);
    },
    [lastPageIndex, scrollToPage],
  );
  const handlePageScrollEnd = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (plotWidth <= 0) {
        return;
      }

      const nextPageIndex = Math.round(event.nativeEvent.contentOffset.x / plotWidth);
      const clampedPageIndex = Math.min(Math.max(nextPageIndex, 0), lastPageIndex);
      setSelectedIndex(null);
      setPageIndex(previousPageIndex =>
        previousPageIndex === clampedPageIndex ? previousPageIndex : clampedPageIndex,
      );
    },
    [lastPageIndex, plotWidth],
  );
  const handleRangePress = useCallback((nextRange: TimeRange) => {
    setRange(nextRange);
    setSelectedIndex(null);
    setPageIndex(Number.MAX_SAFE_INTEGER);
  }, []);
  const selectBucket = useCallback(
    (event: GestureResponderEvent, index: number) => {
      event.stopPropagation();
      setSelectedIndex(selectedIndex === index ? null : index);
    },
    [selectedIndex],
  );

  useImperativeHandle(ref, () => ({ clearSelection }), [clearSelection]);

  useEffect(() => {
    if (!isPagedRange) {
      return;
    }

    scrollToPage(activePageIndex, false);
  }, [activePageIndex, isPagedRange, plotWidth, range, scrollToPage]);

  const canGoToPreviousPage = isPagedRange && activePageIndex > 0;
  const canGoToNextPage = isPagedRange && activePageIndex < lastPageIndex;

  const renderBars = (pageBuckets: Bucket[], isActivePage: boolean) => (
    <View style={styles.barsRow}>
      {pageBuckets.map((bucket, i) => {
        const barHeight = bucket.hasData ? Math.max((bucket.value / maxValue) * plotHeight, 2) : 0;
        const showLabel =
          pageBuckets.length <= 7 ||
          (isMonthly ? true : i % Math.ceil(pageBuckets.length / 6) === 0) ||
          i === pageBuckets.length - 1;
        const isSel = isActivePage && selectedIndex === i;
        const isToday = !isMonthly && isSameDay(bucket.date, new Date());
        const isThisMonth = isMonthly && isSameMonth(bucket.date, new Date());
        const isDimmed = isActivePage && selectedIndex !== null && !isSel;

        return (
          <View key={`${bucket.fullLabel}-${i}`} style={styles.barTouch}>
            <View style={[styles.barColumn, { height: plotHeight }]}>
              {bucket.hasData && (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${bucket.fullLabel}, ${formatSteps(bucket.value)} ${t('steps.unit')}`}
                  onPress={event => selectBucket(event, i)}
                  style={[styles.barHitBox, { height: Math.max(barHeight, 44) }]}
                >
                  <View
                    style={[
                      styles.bar,
                      {
                        height: barHeight,
                        backgroundColor: barColor,
                        opacity: isDimmed ? 0.35 : 1,
                      },
                    ]}
                  />
                </Pressable>
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
          </View>
        );
      })}
    </View>
  );

  return (
    <Pressable style={styles.container} onPress={stopPropagation}>
      <View style={styles.headerRow}>
        <Text style={[styles.title, { color: themeColors.textPrimary }]}>{t('home.steps')}</Text>
      </View>

      <GlassCard style={[styles.card, dynamicStyles.glassCard]}>
        {/* Range selector */}
        <HealthPeriodSelector value={range} onChange={handleRangePress} />

        {/* Header value */}
        <View style={styles.infoContainer}>
          <Text style={[styles.infoLabel, { color: themeColors.textSecondary }]}>{headerTitle}</Text>
          <View style={styles.valueRow}>
            <Text style={[styles.infoValue, { color: themeColors.textPrimary }]}>
              {dataBuckets.length > 0 ? formatSteps(headerValue) : '--'}
            </Text>
            <Text style={[styles.infoUnit, { color: themeColors.textSecondary }]}>{t('steps.unit')}</Text>
          </View>
          {isPagedRange ? (
            <View style={styles.periodRow}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('common.back')}
                disabled={!canGoToPreviousPage}
                onPress={() => goToPage(activePageIndex - 1)}
                style={[
                  styles.periodButton,
                  { borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)' },
                  !canGoToPreviousPage && styles.periodButtonDisabled,
                ]}
              >
                <ChevronLeft size={22} color={themeColors.textPrimary} />
              </Pressable>
              <Text style={[styles.infoDate, styles.periodText, { color: themeColors.textSecondary }]}>
                {headerSubtitle}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('common.next')}
                disabled={!canGoToNextPage}
                onPress={() => goToPage(activePageIndex + 1)}
                style={[
                  styles.periodButton,
                  { borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)' },
                  !canGoToNextPage && styles.periodButtonDisabled,
                ]}
              >
                <ChevronRight size={22} color={themeColors.textPrimary} />
              </Pressable>
            </View>
          ) : (
            <Text style={[styles.infoDate, { color: themeColors.textSecondary }]}>{headerSubtitle}</Text>
          )}
        </View>

        {/* Chart */}
        {isLoading ? (
          <View style={[styles.chartArea, { height: chartHeight }]}>
            <ActivityIndicator color={barColor} size="large" />
          </View>
        ) : (
          <Pressable style={[styles.chartArea, { height: chartHeight }]} onPress={clearSelection}>
            <View style={styles.chartRow}>
              <View style={[styles.yAxis, { height: plotHeight }]}>
                {[...yTicks].reverse().map(tick => (
                  <Text key={`ylabel-${tick}`} style={[styles.yLabel, { color: themeColors.textSecondary }]}>
                    {formatAxis(tick)}
                  </Text>
                ))}
              </View>

              <View style={styles.plotContainer} onLayout={handlePlotLayout}>
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

                {isPagedRange && plotWidth > 0 ? (
                  <ScrollView
                    ref={pageScrollRef}
                    horizontal
                    pagingEnabled
                    bounces={false}
                    showsHorizontalScrollIndicator={false}
                    scrollEventThrottle={16}
                    onMomentumScrollEnd={handlePageScrollEnd}
                    style={styles.pageScroll}
                  >
                    {chartPages.map((page, index) => (
                      <View
                        key={page.key}
                        pointerEvents={index === activePageIndex ? 'auto' : 'none'}
                        style={[styles.page, { width: plotWidth }]}
                      >
                        {renderBars(page.buckets, index === activePageIndex)}
                      </View>
                    ))}
                  </ScrollView>
                ) : (
                  renderBars(buckets, true)
                )}
              </View>
            </View>
          </Pressable>
        )}

        {!isLoading && dataBuckets.length === 0 && (
          <Text style={[styles.emptyText, { color: themeColors.textSecondary }]}>{t('steps.empty')}</Text>
        )}
      </GlassCard>
    </Pressable>
  );
});

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
    alignItems: 'baseline',
    flexWrap: 'wrap',
    marginBottom: 4,
  },
  infoValue: {
    fontSize: 42,
    fontVariant: ['tabular-nums'],
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
  periodRow: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  periodButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  periodButtonDisabled: {
    opacity: 0.28,
  },
  periodText: {
    flex: 1,
    textAlign: 'center',
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
  pageScroll: {
    width: '100%',
    height: '100%',
  },
  page: {
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
  barHitBox: {
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
