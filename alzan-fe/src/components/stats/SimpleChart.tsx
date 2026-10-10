import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  LayoutChangeEvent,
  Pressable,
  ScrollView,
  NativeScrollEvent,
  NativeSyntheticEvent,
} from 'react-native';
import Svg, { Path, Line, Circle, Defs, LinearGradient, Stop } from 'react-native-svg';
import { colors } from '../../theme';
import { format } from 'date-fns';
import { getDateFnsLocale } from '../../i18n/dateLocale';

export type ChartDataPoint = {
  label?: string;
  value: number | null;
  date?: Date;
  count?: number;
  rawValues?: number[];
};

export type ChartDataPointSelect = ChartDataPoint & {
  dateRange: string;
};

export type ChartAxisTick = {
  label: string;
  date: Date;
};

type SelectedPointTooltipContent = {
  primaryText: string;
  secondaryText?: string;
};

interface SimpleChartProps {
  data: ChartDataPoint[];
  height?: number;
  type: 'bar' | 'line';
  color?: string;
  lineStyle?: 'smooth' | 'linear';
  showLabels?: boolean;
  showYAxis?: boolean;
  unit?: string;
  onPointSelect?: (point: ChartDataPointSelect) => void;
  selectedPoint?: ChartDataPointSelect;
  range?: 'D' | 'S' | 'M' | '6M' | 'A';
  xAxisTicks?: ChartAxisTick[];
  domainStart?: Date;
  domainEnd?: Date;
  visibleDurationMs?: number;
  onVisibleRangeChange?: (range: { start: Date; end: Date }) => void;
  onClearSelection?: () => void;
  showSelectedPointTooltip?: boolean;
  getSelectedPointTooltipContent?: (point: ChartDataPointSelect) => SelectedPointTooltipContent;
  yAxisBaseStep?: number;
}

export const SimpleChart: React.FC<SimpleChartProps> = ({
  data,
  height = 200,
  color = '#007AFF',
  lineStyle = 'smooth',
  unit,
  onPointSelect,
  selectedPoint,
  range = 'M',
  xAxisTicks,
  domainStart,
  domainEnd,
  visibleDurationMs,
  onVisibleRangeChange,
  onClearSelection,
  showSelectedPointTooltip = false,
  getSelectedPointTooltipContent,
  yAxisBaseStep,
}) => {
  const [containerWidth, setContainerWidth] = useState(0);
  const scrollRef = useRef<ScrollView>(null);

  const onLayout = useCallback((event: LayoutChangeEvent) => {
    const nextWidth = Math.round(event.nativeEvent.layout.width);
    setContainerWidth(previousWidth => (previousWidth === nextWidth ? previousWidth : nextWidth));
  }, []);

  // Auto-scroll to end when data or range changes
  // Only scroll to end if we just loaded new data, not during interaction
  // We can assume if data length changes or range changes, we reset to end
  useEffect(() => {
    if (!scrollRef.current) {
      return;
    }

    const timeoutId = setTimeout(() => {
      scrollRef.current?.scrollToEnd({ animated: false });
    }, 50);

    return () => clearTimeout(timeoutId);
  }, [data.length, range, containerWidth]);

  const getPointSpacing = () => {
    if (!containerWidth) return 30; // Fallback

    const visiblePoints = Math.max(data.length, 1);

    // These values determine how many items are visible in one screen width
    // User scrolls left to see older data
    switch (range) {
      case 'D':
        // Show 8 hours visible at a time
        return containerWidth / 8;
      case 'S':
        // Show one calendar week at a time and allow scrolling to prior weeks
        return containerWidth / 7;
      case 'M':
        // Keep the full month visible without horizontal scroll
        return containerWidth / visiblePoints;
      case '6M':
        return containerWidth / visiblePoints;
      case 'A':
        return containerWidth / visiblePoints;
      default:
        return containerWidth / 7;
    }
  };

  const pointSpacing = getPointSpacing();
  const horizontalPadding = 18;
  const hasTimeScale = Boolean(domainStart && domainEnd && domainEnd.getTime() > domainStart.getTime());
  const safeContainerWidth = containerWidth || 1;
  const totalDurationMs = hasTimeScale && domainStart && domainEnd ? domainEnd.getTime() - domainStart.getTime() : 0;
  const effectiveVisibleDurationMs = hasTimeScale
    ? Math.max(Math.min(visibleDurationMs ?? totalDurationMs, totalDurationMs), 1)
    : 0;
  const scrollableDurationMs = hasTimeScale ? Math.max(totalDurationMs - effectiveVisibleDurationMs, 0) : 0;

  const computedWidth = hasTimeScale
    ? Math.max(safeContainerWidth, safeContainerWidth * (totalDurationMs / effectiveVisibleDurationMs))
    : Math.max(containerWidth, data.length * pointSpacing);
  const scrollableWidth = hasTimeScale ? Math.max(computedWidth - safeContainerWidth, 0) : 0;

  const emitVisibleRange = useCallback(
    (offsetX: number) => {
      if (!hasTimeScale || !domainStart || !domainEnd || !onVisibleRangeChange) {
        return;
      }

      if (scrollableDurationMs <= 0 || scrollableWidth <= 0) {
        onVisibleRangeChange({ start: domainStart, end: domainEnd });
        return;
      }

      const clampedOffset = Math.min(Math.max(offsetX, 0), scrollableWidth);
      const progress = clampedOffset / scrollableWidth;
      const startMs = domainStart.getTime() + progress * scrollableDurationMs;
      const endMs = Math.min(startMs + effectiveVisibleDurationMs, domainEnd.getTime());

      onVisibleRangeChange({
        start: new Date(startMs),
        end: new Date(endMs),
      });
    },
    [
      domainEnd,
      domainStart,
      effectiveVisibleDurationMs,
      hasTimeScale,
      onVisibleRangeChange,
      scrollableDurationMs,
      scrollableWidth,
    ],
  );

  // Y Axis logic
  const validValues = data.filter(d => d.value !== null).map(d => d.value!);
  const hasData = validValues.length > 0;
  const maxValue = hasData ? Math.max(...validValues) : 100;
  const minValue = hasData ? Math.min(...validValues) : 0;

  const yAxisModel = (() => {
    if (yAxisBaseStep && yAxisBaseStep > 0) {
      const baseStep = yAxisBaseStep;
      const maxTicks = 6;

      const firstPassMin = Math.max(0, Math.floor((minValue - baseStep) / baseStep) * baseStep);
      const firstPassMax = Math.max(firstPassMin + baseStep, Math.ceil((maxValue + baseStep) / baseStep) * baseStep);
      const firstPassTickCount = Math.round((firstPassMax - firstPassMin) / baseStep) + 1;
      const multiplier = firstPassTickCount > maxTicks ? Math.ceil((firstPassTickCount - 1) / (maxTicks - 1)) : 1;
      const tickStep = baseStep * multiplier;

      const yMinWithStep = Math.max(0, Math.floor((minValue - baseStep) / tickStep) * tickStep);
      const yMaxWithStep = Math.max(yMinWithStep + tickStep, Math.ceil((maxValue + baseStep) / tickStep) * tickStep);

      const tickCount = Math.floor((yMaxWithStep - yMinWithStep) / tickStep) + 1;
      const yTicksWithStep = Array.from({ length: Math.max(tickCount, 2) }, (_, index) =>
        Number((yMinWithStep + index * tickStep).toFixed(6)),
      );

      const yMin = yTicksWithStep[0];
      const yMax = yTicksWithStep[yTicksWithStep.length - 1];
      const yRange = Math.max(yMax - yMin, tickStep);

      return {
        yMin,
        yMax,
        yRange,
        yTicks: yTicksWithStep,
      };
    }

    const rangeValue = maxValue - minValue;
    const padding = rangeValue > 0 ? rangeValue * 0.2 : maxValue > 0 ? maxValue * 0.2 : 10;
    const yMin = Math.max(0, minValue - padding);
    const yMax = maxValue + padding;
    const yRange = yMax - yMin;

    return {
      yMin,
      yMax,
      yRange,
      yTicks: [yMin, (yMin + yMax) / 2, yMax],
    };
  })();

  const { yMin, yRange, yTicks } = yAxisModel;

  const paddingBottom = 26;
  const paddingTop = 20;
  const chartHeight = height - paddingBottom - paddingTop;

  const getY = (val: number | null) => {
    if (val === null || yRange === 0) return paddingTop + chartHeight / 2;
    return paddingTop + chartHeight - ((val - yMin) / yRange) * chartHeight;
  };

  const getX = (index: number) => {
    return index * pointSpacing + pointSpacing / 2;
  };

  const getScaledX = (date: Date) => {
    if (!hasTimeScale || !domainStart || totalDurationMs <= 0) {
      return 0;
    }

    const offsetMs = Math.min(Math.max(date.getTime() - domainStart.getTime(), 0), totalDurationMs);
    const drawableWidth = Math.max(computedWidth - horizontalPadding * 2, 1);
    return horizontalPadding + (offsetMs / totalDurationMs) * drawableWidth;
  };

  const getPointX = (point: ChartDataPoint, index: number) => {
    if (hasTimeScale && point.date) {
      return getScaledX(point.date);
    }
    return getX(index);
  };

  const formatYValue = (val: number) => {
    if (val >= 1000) return `${(val / 1000).toFixed(1)}k`;
    if (Number.isInteger(val)) return val.toString();
    return val.toFixed(1);
  };

  const formatDate = (date?: Date) => {
    if (!date) return '';
    if (range === 'D') return format(date, 'd MMM, HH:mm', { locale: getDateFnsLocale() });
    if (range === 'S') return format(date, 'EEEE, d MMM', { locale: getDateFnsLocale() });
    return format(date, 'd MMM yyyy', { locale: getDateFnsLocale() });
  };

  const shouldShowXLabel = (index: number) => {
    switch (range) {
      case 'M':
        return index % 5 === 0;
      case 'D':
        return index % 2 === 0;
      case 'S':
        return true;
      case '6M':
        return Boolean(data[index]?.label);
      case 'A':
        return Boolean(data[index]?.label);
      default:
        return true;
    }
  };

  const estimateTickWidth = (label: string) => {
    // Approximate width for 10px semibold labels to avoid overlap on narrow screens.
    return Math.max(40, Math.ceil(label.length * 6.8 + 10));
  };

  const rawAxisTicks =
    xAxisTicks && xAxisTicks.length > 0
      ? xAxisTicks.map((tick, index) => ({
          key: `tick-${index}`,
          label: tick.label,
          x: hasTimeScale ? getScaledX(tick.date) : getX(index),
          width: estimateTickWidth(tick.label),
        }))
      : data
          .map((point, index) => {
            if (!shouldShowXLabel(index)) return null;
            return {
              key: `tick-${index}`,
              label: point.label ?? '',
              x: getPointX(point, index),
              width: estimateTickWidth(point.label ?? ''),
            };
          })
          .filter((tick): tick is { key: string; label: string; x: number; width: number } => tick !== null);

  const minTickGapPx = 10;
  const areTicksOverlapping = (leftTick: { x: number; width: number }, rightTick: { x: number; width: number }) => {
    const leftEdge = leftTick.x + leftTick.width / 2;
    const rightEdge = rightTick.x - rightTick.width / 2;
    return rightEdge - leftEdge < minTickGapPx;
  };

  const axisTicksToRender = (() => {
    if (rawAxisTicks.length <= 1) {
      return rawAxisTicks;
    }

    const filteredTicks = [rawAxisTicks[0]];

    for (let index = 1; index < rawAxisTicks.length - 1; index += 1) {
      const tick = rawAxisTicks[index];
      const lastTick = filteredTicks[filteredTicks.length - 1];

      if (!areTicksOverlapping(lastTick, tick)) {
        filteredTicks.push(tick);
      }
    }

    const lastTick = rawAxisTicks[rawAxisTicks.length - 1];
    const lastFilteredTick = filteredTicks[filteredTicks.length - 1];

    if (areTicksOverlapping(lastFilteredTick, lastTick)) {
      while (filteredTicks.length > 1 && areTicksOverlapping(filteredTicks[filteredTicks.length - 1], lastTick)) {
        filteredTicks.pop();
      }

      const currentLastTick = filteredTicks[filteredTicks.length - 1];
      if (lastTick.key !== currentLastTick.key) {
        filteredTicks.push(lastTick);
      }
    } else {
      filteredTicks.push(lastTick);
    }

    return filteredTicks;
  })();

  const createSmoothPath = () => {
    if (!hasData) return '';

    const pointsWithValues = data.map((d, i) => ({ ...d, index: i })).filter(d => d.value !== null);

    if (pointsWithValues.length === 0) return '';
    if (pointsWithValues.length === 1) {
      const x = getPointX(pointsWithValues[0], pointsWithValues[0].index);
      const y = getY(pointsWithValues[0].value);
      return `M${x - 2},${y} L${x + 2},${y}`;
    }

    const first = pointsWithValues[0];
    let path = `M${getPointX(first, first.index)},${getY(first.value!)}`;

    for (let i = 0; i < pointsWithValues.length - 1; i++) {
      const current = pointsWithValues[i];
      const next = pointsWithValues[i + 1];

      const x0 = getPointX(current, current.index);
      const y0 = getY(current.value!);
      const x1 = getPointX(next, next.index);
      const y1 = getY(next.value!);

      const cpx = (x0 + x1) / 2;
      path += ` C${cpx},${y0} ${cpx},${y1} ${x1},${y1}`;
    }
    return path;
  };

  const createLinearPath = () => {
    if (!hasData) return '';

    const pointsWithValues = data.map((d, i) => ({ ...d, index: i })).filter(d => d.value !== null);

    if (pointsWithValues.length === 0) return '';
    if (pointsWithValues.length === 1) {
      const x = getPointX(pointsWithValues[0], pointsWithValues[0].index);
      const y = getY(pointsWithValues[0].value);
      return `M${x - 2},${y} L${x + 2},${y}`;
    }

    const first = pointsWithValues[0];
    let path = `M${getPointX(first, first.index)},${getY(first.value!)}`;

    for (let i = 1; i < pointsWithValues.length; i++) {
      const point = pointsWithValues[i];
      path += ` L${getPointX(point, point.index)},${getY(point.value!)}`;
    }

    return path;
  };

  const handlePointPress = (point: ChartDataPoint) => {
    onPointSelect?.({
      ...point,
      dateRange: formatDate(point.date),
    });
  };

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    emitVisibleRange(event.nativeEvent.contentOffset.x);
  };

  const selectedPointIndex = data.findIndex(point => {
    if (!selectedPoint?.date || !point.date) {
      return false;
    }

    return point.date.getTime() === selectedPoint.date.getTime();
  });

  const selectedPointCoordinates =
    selectedPointIndex >= 0
      ? {
          x: getPointX(data[selectedPointIndex], selectedPointIndex),
          y: getY(data[selectedPointIndex].value),
        }
      : null;

  const selectedPointTooltipContent =
    selectedPoint &&
    (getSelectedPointTooltipContent?.(selectedPoint) ?? {
      primaryText: selectedPoint.value !== null ? `${selectedPoint.value}${unit ? ` ${unit}` : ''}` : '-',
      secondaryText: selectedPoint.dateRange,
    });

  useEffect(() => {
    if (!hasTimeScale || !domainStart || !domainEnd || !onVisibleRangeChange) {
      return;
    }

    const initialOffset = scrollableWidth > 0 ? scrollableWidth : 0;
    emitVisibleRange(initialOffset);
  }, [domainEnd, domainStart, emitVisibleRange, hasTimeScale, onVisibleRangeChange, scrollableWidth]);

  return (
    <View style={[styles.container, { height }]} onLayout={onLayout}>
      {/* Y-Axis Grid (Fixed) */}
      <View style={[styles.gridContainer, { top: paddingTop, height: chartHeight }]}>
        {yTicks.map((tick, i) => (
          <View key={`tick-${i}`} style={[styles.gridLineContainer, { top: getY(tick) - paddingTop }]}>
            <View style={styles.gridLine} />
            <Text style={styles.yAxisLabel}>{formatYValue(tick)}</Text>
          </View>
        ))}
      </View>

      {/* Scrollable Chart */}
      <ScrollView
        ref={scrollRef}
        horizontal
        nestedScrollEnabled
        directionalLockEnabled
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ width: computedWidth }}
        style={styles.scrollView}
        bounces={true}
        onScroll={handleScroll}
        scrollEventThrottle={16}
      >
        <View style={{ width: computedWidth, height }}>
          <Pressable
            onPress={onClearSelection}
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              width: computedWidth,
              height,
              zIndex: 0,
            }}
          />

          <Svg width={computedWidth} height={height}>
            <Defs>
              <LinearGradient id="gradient" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0%" stopColor={color} stopOpacity="0.5" />
                <Stop offset="100%" stopColor={color} stopOpacity="0" />
              </LinearGradient>
            </Defs>

            {/* Vertical Grid Lines - at X label positions */}
            {axisTicksToRender.map(tick => {
              return (
                <Line
                  key={`vgrid-${tick.key}`}
                  x1={tick.x}
                  y1={paddingTop}
                  x2={tick.x}
                  y2={height - paddingBottom}
                  stroke={colors.textSecondary}
                  strokeOpacity={0.1}
                  strokeWidth={1}
                />
              );
            })}

            <Path
              d={lineStyle === 'linear' ? createLinearPath() : createSmoothPath()}
              stroke={color}
              strokeWidth="3"
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            {data.map((d, i) => {
              if (d.value === null) return null;
              const cx = getPointX(d, i);
              const cy = getY(d.value);
              const isSelected = selectedPoint?.date && d.date && selectedPoint.date.getTime() === d.date.getTime();

              return (
                <React.Fragment key={`p-${i}`}>
                  {isSelected && (
                    <Line
                      x1={cx}
                      y1={paddingTop}
                      x2={cx}
                      y2={height - paddingBottom}
                      stroke={color}
                      strokeOpacity={0.18}
                      strokeWidth={2}
                    />
                  )}
                  {isSelected && <Circle cx={cx} cy={cy} r="8" fill={color} opacity={0.24} />}
                  <Circle
                    cx={cx}
                    cy={cy}
                    r={isSelected ? '5' : '4'}
                    fill={color}
                    stroke="#fff"
                    strokeWidth={isSelected ? '2.5' : '2'}
                  />
                </React.Fragment>
              );
            })}
          </Svg>

          {/* Touch Targets & Labels */}
          {data.map((d, i) => {
            const cx = getPointX(d, i);
            const touchWidth = hasTimeScale ? 28 : pointSpacing;
            return (
              <View
                key={`col-${i}`}
                style={{
                  position: 'absolute',
                  left: cx - touchWidth / 2,
                  top: 0,
                  width: touchWidth,
                  height: height,
                }}
              >
                <Pressable onPress={() => handlePointPress(d)} style={styles.touchTarget} />
              </View>
            );
          })}

          {axisTicksToRender.map(tick => (
            <View
              key={`xlabel-${tick.key}`}
              style={{
                position: 'absolute',
                left: tick.x - tick.width / 2,
                top: 0,
                width: tick.width,
                height,
              }}
              pointerEvents="none"
            >
              <Text style={[styles.xLabel, { top: height - 16 }]}>{tick.label}</Text>
            </View>
          ))}

          {showSelectedPointTooltip && selectedPointCoordinates && selectedPointTooltipContent && (
            <View
              pointerEvents="none"
              style={[
                styles.selectedPointTooltip,
                {
                  left: (() => {
                    const tooltipWidth = 170;
                    const rightCandidate = selectedPointCoordinates.x + 12;
                    const leftCandidate = selectedPointCoordinates.x - tooltipWidth - 12;
                    const maxLeft = Math.max(computedWidth - tooltipWidth - 6, 6);
                    const base = rightCandidate + tooltipWidth <= computedWidth - 6 ? rightCandidate : leftCandidate;
                    return Math.min(Math.max(base, 6), maxLeft);
                  })(),
                  top: (() => {
                    const tooltipHeight = selectedPointTooltipContent.secondaryText ? 58 : 42;
                    const maxTop = Math.max(height - tooltipHeight - 6, 6);
                    const centered = selectedPointCoordinates.y - tooltipHeight / 2;
                    return Math.min(Math.max(centered, 6), maxTop);
                  })(),
                },
              ]}
            >
              <Text style={styles.selectedPointTooltipPrimary} numberOfLines={1}>
                {selectedPointTooltipContent.primaryText}
              </Text>
              {!!selectedPointTooltipContent.secondaryText && (
                <Text style={styles.selectedPointTooltipSecondary} numberOfLines={1}>
                  {selectedPointTooltipContent.secondaryText}
                </Text>
              )}
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
    position: 'relative',
  },
  gridContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    justifyContent: 'space-between',
    zIndex: 0,
  },
  gridLineContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  gridLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.textSecondary,
    opacity: 0.1,
  },
  yAxisLabel: {
    fontSize: 10,
    color: colors.textSecondary,
    opacity: 0.6,
    marginLeft: 8,
    width: 35,
    textAlign: 'right',
  },
  scrollView: {
    flex: 1,
    zIndex: 1,
  },
  touchTarget: {
    flex: 1,
    // backgroundColor: 'rgba(255,0,0,0.05)',
  },
  xLabel: {
    position: 'absolute',
    width: '100%',
    textAlign: 'center',
    fontSize: 10,
    color: colors.textSecondary,
    opacity: 0.7,
    fontWeight: '500',
  },
  selectedPointTooltip: {
    position: 'absolute',
    minWidth: 132,
    maxWidth: 170,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 7,
    backgroundColor: 'rgba(30, 30, 34, 0.9)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    zIndex: 5,
  },
  selectedPointTooltipPrimary: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  selectedPointTooltipSecondary: {
    marginTop: 1,
    fontSize: 11,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.75)',
  },
});
