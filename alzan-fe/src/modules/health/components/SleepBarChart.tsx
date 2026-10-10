import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { HealthHistoryChart } from './HealthHistoryChart';
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
  const recentSessions = data
    .slice(0, 7)
    .reverse()
    .map(log => ({
      date: new Date(`${log.date}T12:00:00`),
      label: new Date(log.date).getDate().toString(),
      value: (log.total_sleep_min || 0) / 60, // Convert to hours
    }));
  const averageSleepMinutes = recentSessions.length
    ? Math.round((recentSessions.reduce((sum, point) => sum + point.value, 0) / recentSessions.length) * 60)
    : 0;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{t('health.last7Days')}</Text>
      <HealthHistoryChart
        data={recentSessions}
        height={200}
        color="#5856D6"
        unit="h"
        range="S"
        summaryValue={`${Math.floor(averageSleepMinutes / 60)}h ${averageSleepMinutes % 60}m`}
        summaryDate={t('health.last7Days')}
        formatSelectedValue={value => {
          const minutes = Math.round(value * 60);
          return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
        }}
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
