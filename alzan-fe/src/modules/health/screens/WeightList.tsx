import React from 'react';
import { View, Text, FlatList, StyleSheet, TouchableOpacity } from 'react-native';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { HealthScreenNavigationProp, HealthStackParamList } from '../../../types/navigation.types';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Plus, Trash2 } from 'lucide-react-native';
import { typography } from '../../../theme';
import { useWeightLogs, useDeleteWeightLog } from '../hooks/useWeight';
import { useMeasurements, useDeleteMeasurement } from '../hooks/useMeasurements';
import { useBodyCompositionLogs } from '../hooks/useBodyCompositionLogs';
import { format } from 'date-fns';
import { useHealthStyles } from '../../../hooks/useHealthStyles';
import { LinearGradient } from 'expo-linear-gradient';
import { useUnitConversion } from '../../../hooks/useUnitConversion';
import { useProfile } from '../../../hooks/settings/useProfile';
import { BodyMeasurement, MeasurementType, WeightLog } from '../../../types/requests.types';
import { useTranslation } from 'react-i18next';
import { getDateFnsLocale } from '../../../i18n/dateLocale';
import { Alert } from '../../../components/common/Alert';
import { BodyCompositionLog } from '../services/bodyCompositionService';

export const WeightList = () => {
  const { t } = useTranslation();
  const navigation = useNavigation<HealthScreenNavigationProp>();
  const route = useRoute<RouteProp<HealthStackParamList, 'WeightList'>>();
  const { metric = 'weight', label = 'Peso' } = route.params || {};

  // Hooks
  const { styles: dynamicStyles, colors: themeColors } = useHealthStyles();
  const { convertWeightToUi } = useUnitConversion();
  const { profile } = useProfile();

  // Determine if it is a weight-based log, computed composition metric, or direct body measurement.
  const isWeightLog = ['weight', 'bmi', 'bodyFat', 'muscle'].includes(metric);
  const isAbdominalCompositionMetric = metric === 'waistToHeight' || metric === 'waistToHip';

  // Fetch Data
  const weightQuery = useWeightLogs();
  const compositionQuery = useBodyCompositionLogs();
  // safe cast since we check above for the non measurements
  const measurementQuery = useMeasurements(
    isWeightLog || isAbdominalCompositionMetric ? undefined : (metric as MeasurementType),
  );

  const logs: (WeightLog | BodyMeasurement | BodyCompositionLog)[] = isWeightLog
    ? weightQuery.data || []
    : isAbdominalCompositionMetric
      ? compositionQuery.data || []
      : measurementQuery.data || [];
  const isLoading = isWeightLog
    ? weightQuery.isLoading
    : isAbdominalCompositionMetric
      ? compositionQuery.isLoading
      : measurementQuery.isLoading;

  // Delete Mutations
  const deleteWeightLog = useDeleteWeightLog();
  const deleteMeasurement = useDeleteMeasurement();

  const handleDelete = (id: string, valueDisplay: string) => {
    Alert.alert(t('common.delete'), `${t('health.confirmDeleteRecord')} (${valueDisplay})`, [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: () => {
          if (isWeightLog) {
            deleteWeightLog.mutate(id);
          } else {
            deleteMeasurement.mutate(id);
          }
        },
      },
    ]);
  };

  const getValueAndUnit = (item: WeightLog | BodyMeasurement | BodyCompositionLog) => {
    if (isAbdominalCompositionMetric) {
      const compositionLog = item as BodyCompositionLog;
      const value =
        metric === 'waistToHeight' ? compositionLog.waist_to_height_ratio : compositionLog.waist_to_hip_ratio;
      return { value: value != null ? value.toFixed(2) : '-', unit: '' };
    }

    item = item as unknown as WeightLog;
    if (metric === 'weight') {
      const converted = convertWeightToUi(item.weight_kg);
      return { value: converted.value.toFixed(1), unit: converted.unit };
    }
    if (metric === 'bmi') {
      const heightM = (profile?.height_cm || 170) / 100;
      const bmi = item.weight_kg / (heightM * heightM);
      return { value: bmi.toFixed(1), unit: '' };
    }
    if (metric === 'bodyFat') {
      return { value: item.bodyfat_percent ? item.bodyfat_percent.toFixed(1) : '-', unit: '%' };
    }
    if (metric === 'muscle') {
      // Calculate muscle % if we have muscle mass kg and weight
      if (item.muscle_mass_kg && item.weight_kg) {
        const percent = (item.muscle_mass_kg / item.weight_kg) * 100;
        return { value: percent.toFixed(1), unit: '%' };
      }
      return { value: '-', unit: '%' };
    }
    const measurement = item as unknown as BodyMeasurement;
    // Measurements
    return { value: measurement?.value_cm ? measurement?.value_cm.toFixed(1) : '-', unit: 'cm' };
  };

  const getItemDate = (item: WeightLog | BodyMeasurement | BodyCompositionLog) => {
    if (isAbdominalCompositionMetric) {
      return new Date(`${(item as BodyCompositionLog).calculated_for_date}T12:00:00`);
    }
    return new Date((item as WeightLog | BodyMeasurement).measured_at);
  };

  const renderItem = ({ item }: { item: WeightLog | BodyMeasurement | BodyCompositionLog }) => {
    const { value, unit } = getValueAndUnit(item);

    // Skip rendering items that don't have valid values for the selected metric
    if (value === '-') return null;

    return (
      <View style={[styles.logItem, dynamicStyles.border]}>
        <View>
          <Text style={[styles.logValue, dynamicStyles.title]}>
            {value} <Text style={{ fontSize: 16, color: themeColors.textSecondary }}>{unit}</Text>
          </Text>
          <Text style={[styles.logDate, dynamicStyles.subtitle]}>
            {format(getItemDate(item), isAbdominalCompositionMetric ? 'd MMM yyyy' : 'd MMM yyyy, HH:mm', {
              locale: getDateFnsLocale(),
            })}
          </Text>
        </View>
        {!isAbdominalCompositionMetric && (
          <TouchableOpacity onPress={() => handleDelete(item.id, `${value} ${unit}`)} style={styles.deleteButton}>
            <Trash2 size={18} color={themeColors.textSecondary} />
          </TouchableOpacity>
        )}
      </View>
    );
  };

  return (
    <LinearGradient colors={dynamicStyles.gradientColors} style={styles.safeArea}>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <Text style={[styles.backButtonText, { color: themeColors.primary }]}>{t('common.back')}</Text>
          </TouchableOpacity>
          <Text style={[styles.headerTitle, dynamicStyles.title]}>{`${t('health.history')} ${label}`}</Text>

          {/* Only show Add button for Weight for now, simpler specific UI for adding others might be needed or reused */}
          <TouchableOpacity
            onPress={() => navigation.navigate(isWeightLog ? 'WeightAdd' : 'HealthStatistics')}
            style={[styles.addButton, { opacity: isWeightLog ? 1 : 0 }]}
          >
            {isWeightLog && <Plus size={24} color={themeColors.primary} />}
          </TouchableOpacity>
        </View>

        <FlatList
          data={logs
            ?.sort((a, b) => getItemDate(b).getTime() - getItemDate(a).getTime())
            .filter((item, index, self) => {
              // Deduplicate logic:
              // For all metrics, if there are multiple entries on the same day with the SAME value,
              // only show the oldest one (last in the sorted array).
              // If values are different on the same day, show both.

              const itemDate = getItemDate(item).toDateString();
              const { value: itemValue } = getValueAndUnit(item);

              // Find all items with same date and same displayed value
              // We compare the formatted string value to handle precision differences effectively
              const sameDaySameValueItems = self.filter(i => {
                const iDate = getItemDate(i).toDateString();
                const { value: iValue } = getValueAndUnit(i);
                return iDate === itemDate && iValue === itemValue;
              });

              // If only one, show it
              if (sameDaySameValueItems.length <= 1) return true;

              // If multiple identical values on same day, show only the OLDEST (last in sorted array)
              const oldestItem = sameDaySameValueItems[sameDaySameValueItems.length - 1];
              return item.id === oldestItem.id;
            })}
          renderItem={renderItem}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.content}
          ListEmptyComponent={
            !isLoading ? (
              <Text style={[styles.emptyText, dynamicStyles.subtitle]}>
                {t('health.noRecordsOf')} {label.toLowerCase()}.
              </Text>
            ) : null
          }
        />
      </SafeAreaView>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
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
    fontSize: 16,
  },
  headerTitle: {
    ...typography.h2,
    fontSize: 20,
  },
  addButton: {
    padding: 8,
    width: 40,
    alignItems: 'flex-end',
  },
  content: {
    padding: 20,
  },
  logItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  logValue: {
    ...typography.h3,
    fontWeight: '700',
    fontSize: 22,
  },
  logDate: {
    ...typography.caption,
    marginTop: 4,
  },
  deleteButton: {
    padding: 8,
  },
  emptyText: {
    textAlign: 'center',
    marginTop: 40,
    ...typography.body,
  },
});
