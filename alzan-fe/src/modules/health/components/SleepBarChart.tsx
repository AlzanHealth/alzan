import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SimpleChart } from '../../../components/stats/SimpleChart';
import { colors, typography } from '../../../theme';
import { SleepSession } from '../services/sleepApi';
import { useTranslation } from 'react-i18next';

interface SleepBarChartProps {
  data: SleepSession[];
}

export const SleepBarChart: React.FC<SleepBarChartProps> = ({ data }) => {
  const { t } = useTranslation();
  if (!data || data.length === 0) {
    return null;
  }

  // Last 7 days
  const chartData = data
    .slice(0, 7)
    .reverse()
    .map(log => ({
      label: new Date(log.date).getDate().toString(),
      value: (log.total_sleep_min || 0) / 60, // Convert to hours
    }));

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{t('health.last7Days')}</Text>
      <SimpleChart data={chartData} type="bar" height={150} color="#5856D6" />
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
