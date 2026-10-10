import React, { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { SimpleChart, type ChartDataPoint, type ChartDataPointSelect } from '../../../components/stats/SimpleChart';
import { useHealthStyles } from '../../../hooks/useHealthStyles';
import { formatLocalizedDate, getLocaleTag } from '../../../i18n/dateLocale';
import { getHealthHistoryChartReadout, getSelectedHealthHistoryPoint } from './healthHistoryChartPresentation';

type ChartRange = 'D' | 'S' | 'M' | '6M' | 'A';

type HealthHistoryChartProps = {
  data: ChartDataPoint[];
  summaryValue: string;
  summaryDate: string;
  summaryLabel?: string;
  color: string;
  unit?: string;
  range?: ChartRange;
  height?: number;
  showYAxis?: boolean;
  includeTimeInSelectedDate?: boolean;
  formatSelectedValue?: (value: number) => string;
  formatSelectedDate?: (point: ChartDataPointSelect) => string;
  onSelectedPointChange?: (point: ChartDataPointSelect | undefined) => void;
};

export const HealthHistoryChart = ({
  data,
  summaryValue,
  summaryDate,
  summaryLabel,
  color,
  unit,
  range = 'M',
  height = 220,
  showYAxis = true,
  includeTimeInSelectedDate = false,
  formatSelectedValue,
  formatSelectedDate,
  onSelectedPointChange,
}: HealthHistoryChartProps) => {
  const { t } = useTranslation();
  const { styles: healthStyles, colors } = useHealthStyles();
  const [selectedPoint, setSelectedPoint] = useState<ChartDataPointSelect>();

  const formatValue = useCallback(
    (value: number) =>
      formatSelectedValue?.(value) ??
      `${value.toLocaleString(getLocaleTag(), { maximumFractionDigits: 1 })}${unit ? ` ${unit}` : ''}`,
    [formatSelectedValue, unit],
  );
  const formatDate = useCallback(
    (point: ChartDataPointSelect) => {
      if (formatSelectedDate) return formatSelectedDate(point);
      if (!point.date) return point.dateRange;
      return includeTimeInSelectedDate
        ? formatLocalizedDate(point.date, { en: 'MMM d, yyyy · HH:mm', es: 'd MMM yyyy · HH:mm' })
        : formatLocalizedDate(point.date, { en: 'EEEE, MMM d, yyyy', es: "EEEE, d 'de' MMMM yyyy" });
    },
    [formatSelectedDate, includeTimeInSelectedDate],
  );
  const currentSelectedPoint = getSelectedHealthHistoryPoint(data, selectedPoint);
  const readout = getHealthHistoryChartReadout({
    selectedPoint: currentSelectedPoint,
    summaryValue,
    summaryDate,
    formatValue,
    formatDate,
  });

  const handlePointSelect = useCallback(
    (point: ChartDataPointSelect) => {
      setSelectedPoint(point);
      onSelectedPointChange?.(point);
    },
    [onSelectedPointChange],
  );
  const handleClearSelection = useCallback(() => {
    setSelectedPoint(undefined);
    onSelectedPointChange?.(undefined);
  }, [onSelectedPointChange]);

  return (
    <View style={styles.container}>
      <View style={styles.readout}>
        <Text style={[styles.readoutLabel, healthStyles.subtitle]}>
          {readout.isSelected ? t('health.selectedRecord') : (summaryLabel ?? t('health.averageAllCaps'))}
        </Text>
        <Text style={[styles.readoutValue, healthStyles.title]}>{readout.value}</Text>
        <Text style={[styles.readoutDate, healthStyles.subtitle]}>{readout.date}</Text>
        {readout.isSelected ? (
          <Pressable onPress={handleClearSelection} accessibilityRole="button" style={styles.clearSelection}>
            <Text style={[styles.clearSelectionText, { color: colors.primary }]}>{t('health.showPeriodAverage')}</Text>
          </Pressable>
        ) : null}
      </View>
      <SimpleChart
        data={data}
        type="line"
        lineStyle="linear"
        height={height}
        color={color}
        unit={unit}
        range={range}
        showYAxis={showYAxis}
        selectedPoint={currentSelectedPoint}
        onPointSelect={handlePointSelect}
        onClearSelection={handleClearSelection}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { width: '100%' },
  readout: { marginBottom: 14, paddingHorizontal: 4 },
  readoutLabel: { fontSize: 13, fontWeight: '600', letterSpacing: 0.5, marginBottom: 4, textTransform: 'uppercase' },
  readoutValue: { fontSize: 36, fontVariant: ['tabular-nums'], fontWeight: '700', letterSpacing: -1 },
  readoutDate: { fontSize: 15, fontWeight: '500', marginTop: 2 },
  clearSelection: { minHeight: 44, alignSelf: 'flex-start', justifyContent: 'center' },
  clearSelectionText: { fontSize: 14, fontWeight: '600' },
});
