import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { HealthHistoryChart } from './HealthHistoryChart';
import { getLast30DaysRecords } from './healthHistoryChartPresentation';
import { colors, typography } from '../../../theme';
import { WeightLog } from '../../../types/requests.types';
import { useTranslation } from 'react-i18next';

interface WeightChartProps {
  data: WeightLog[];
}

export const WeightChart: React.FC<WeightChartProps> = ({ data }) => {
  const { t } = useTranslation();
  const recentLogs = getLast30DaysRecords(data ?? []);
  if (recentLogs.length === 0) {
    return null;
  }

  // Transform data for SimpleChart (reverse to show chronologically)
  const chartData = recentLogs
    .slice()
    .reverse()
    .map(log => ({
      date: new Date(log.measured_at),
      label: new Date(log.measured_at).getDate().toString(),
      value: log.weight_kg,
    }));
  const averageWeight = chartData.reduce((sum, point) => sum + point.value, 0) / chartData.length;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{t('health.last30Days')}</Text>
      <HealthHistoryChart
        data={chartData}
        height={220}
        color={colors.primary}
        unit="kg"
        range="A"
        summaryValue={`${averageWeight.toFixed(1)} kg`}
        summaryDate={t('health.last30Days')}
        formatSelectedValue={value => `${value.toFixed(1)} kg`}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  title: {
    ...typography.h4,
    color: colors.textPrimary,
    marginBottom: 16,
  },
});
