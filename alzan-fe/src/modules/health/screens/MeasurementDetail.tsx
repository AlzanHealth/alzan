import React from 'react';
import { View, Text, FlatList, StyleSheet, TouchableOpacity } from 'react-native';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { HealthScreenNavigationProp, HealthStackParamList } from '../../../types/navigation.types';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Plus, Trash2 } from 'lucide-react-native';
import { colors as defaultColors, typography } from '../../../theme';
import { useMeasurements, useDeleteMeasurement } from '../hooks/useMeasurements';
import { format } from 'date-fns';
import { HealthHistoryChart } from '../components/HealthHistoryChart';
import { getLast30DaysRecords } from '../components/healthHistoryChartPresentation';
import { BodyMeasurement } from '../../../types/requests.types';
import { useTranslation } from 'react-i18next';
import { getMeasurementLabelKey, matchesMeasurementSeries } from '../helpers/measurementProtocols';
import { useHealthStyles } from '../../../hooks/useHealthStyles';
import { getDateFnsLocale } from '../../../i18n/dateLocale';

export const MeasurementDetail = () => {
  const { t } = useTranslation();
  const { colors } = useHealthStyles();
  const navigation = useNavigation<HealthScreenNavigationProp>();
  const route = useRoute<RouteProp<HealthStackParamList, 'MeasurementDetail'>>();
  const type = route.params.type ?? route.params.measurementType ?? route.params.defaultType ?? 'abdomen';
  const protocol = route.params.protocol ?? (type === 'abdomen' ? 'abdomen_navel' : null);
  const label =
    route.params.label ?? String(t(getMeasurementLabelKey({ measurement_type: type, measurement_protocol: protocol })));

  const { data: allLogs } = useMeasurements(type);
  const logs = allLogs?.filter(log => matchesMeasurementSeries(log, type, protocol));
  const deleteMutation = useDeleteMeasurement();

  const handleDelete = (id: string) => {
    deleteMutation.mutate(id);
  };

  const renderItem = ({ item }: { item: BodyMeasurement }) => (
    <View style={[styles.logItem, { borderBottomColor: colors.border }]}>
      <View>
        <Text style={[styles.logValue, { color: colors.textPrimary }]}>
          {item.value_cm}
          {t('health.cm')}
        </Text>
        <Text style={[styles.logDate, { color: colors.textSecondary }]}>
          {format(new Date(item.measured_at), 'd MMM yyyy, HH:mm', { locale: getDateFnsLocale() })}
        </Text>
      </View>
      <TouchableOpacity onPress={() => handleDelete(item.id)} style={styles.deleteButton}>
        <Trash2 size={18} color={colors.textSecondary} />
      </TouchableOpacity>
    </View>
  );

  const recentLogs = getLast30DaysRecords(logs ?? []);
  const chartData = recentLogs
    .map(l => ({
      label: new Date(l.measured_at).getDate().toString(),
      value: l.value_cm,
      date: new Date(l.measured_at),
    }))
    .reverse();
  const averageCm = recentLogs.length
    ? recentLogs.reduce((sum, log) => sum + log.value_cm, 0) / recentLogs.length
    : null;

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={[styles.backButtonText, { color: colors.primary }]}>{t('common.back')}</Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>{label}</Text>
        <TouchableOpacity
          onPress={() => navigation.navigate('MeasurementAdd', { defaultType: type, defaultProtocol: protocol })}
          style={styles.addButton}
        >
          <Plus size={24} color={colors.primary} />
        </TouchableOpacity>
      </View>

      <FlatList
        data={logs}
        renderItem={renderItem}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          recentLogs.length > 0 ? (
            <View style={[styles.chartContainer, { backgroundColor: colors.surface }]}>
              <Text style={[styles.chartTitle, { color: colors.textPrimary }]}>{t('health.progress30Days')}</Text>
              <HealthHistoryChart
                data={chartData}
                height={220}
                color={colors.secondary}
                unit={t('health.cm')}
                range="M"
                summaryValue={averageCm === null ? '—' : `${averageCm.toFixed(1)} ${t('health.cm')}`}
                summaryDate={t('health.last30Days')}
                formatSelectedValue={value => `${value.toFixed(1)} ${t('health.cm')}`}
              />
            </View>
          ) : null
        }
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: defaultColors.background,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  backButton: {
    padding: 8,
  },
  backButtonText: {
    ...typography.body,
    color: defaultColors.primary,
  },
  headerTitle: {
    ...typography.h2,
    color: defaultColors.textPrimary,
  },
  addButton: {
    padding: 8,
  },
  content: {
    padding: 20,
  },
  logItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: defaultColors.border,
  },
  logValue: {
    ...typography.h3,
    fontWeight: '600',
    color: defaultColors.textPrimary,
  },
  logDate: {
    ...typography.caption,
    color: defaultColors.textSecondary,
  },
  deleteButton: {
    padding: 8,
  },
  chartContainer: {
    backgroundColor: defaultColors.surface,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  chartTitle: {
    ...typography.h3,
    marginBottom: 16,
    color: defaultColors.textPrimary,
  },
});
