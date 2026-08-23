import React, { useState } from 'react';
import { View, Text, FlatList, StyleSheet, TouchableOpacity, TextInput, Modal } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { HealthScreenNavigationProp } from '../../../types/navigation.types';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Plus, Trash2, Heart } from 'lucide-react-native';
import { colors, typography } from '../../../theme';
import { useRestingHRLogs, useAddRestingHRLog, useDeleteRestingHRLog } from '../hooks/useRestingHR';
import { SimpleChart } from '../../../components/stats/SimpleChart'; // Reuse generic
import { format } from 'date-fns';
import { RestingHRLog } from '../../../types/requests.types';
import { Alert } from '../../../components/common/Alert';
import { useTranslation } from 'react-i18next';
import { getDateFnsLocale } from '../../../i18n/dateLocale';
import { INTEGER_INPUT_PROPS } from '../../../utils/numericInput';

export const RestingHRList = () => {
  const { t } = useTranslation();
  const navigation = useNavigation<HealthScreenNavigationProp>();
  const { data: logs } = useRestingHRLogs();
  const [showAdd, setShowAdd] = useState(false);
  const [bpm, setBpm] = useState('');

  const addMutation = useAddRestingHRLog();
  const deleteMutation = useDeleteRestingHRLog(); // Now we have this hook!

  const handleSave = () => {
    const val = parseInt(bpm);
    if (isNaN(val) || val < 25 || val > 120) {
      Alert.alert(t('common.error'), t('health.invalidBpmRange'));
      return;
    }
    addMutation.mutate(
      { resting_hr_bpm: val },
      {
        onSuccess: () => {
          setShowAdd(false);
          setBpm('');
        },
      },
    );
  };

  const handleDelete = (id: string) => {
    deleteMutation.mutate(id);
  };

  const renderItem = ({ item }: { item: RestingHRLog }) => (
    <View style={styles.logItem}>
      <View>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Heart size={16} color={colors.danger} style={{ marginRight: 8 }} />
          <Text style={styles.logValue}>
            {item.resting_hr_bpm}
            {t('health.unitBpm')}
          </Text>
        </View>
        <Text style={styles.logDate}>
          {format(new Date(item.measured_at), 'd MMM yyyy, HH:mm', { locale: getDateFnsLocale() })}
        </Text>
      </View>
      <TouchableOpacity onPress={() => handleDelete(item.id)} style={styles.deleteButton}>
        <Trash2 size={18} color={colors.textSecondary} />
      </TouchableOpacity>
    </View>
  );

  const chartData =
    logs
      ?.map(l => ({
        value: l.resting_hr_bpm,
        label: new Date(l.measured_at).getDate().toString(),
      }))
      .reverse() || [];

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={styles.backButtonText}>{t('common.back')}</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('health.heartRate')}</Text>
        <TouchableOpacity onPress={() => setShowAdd(true)} style={styles.addButton}>
          <Plus size={24} color={colors.primary} />
        </TouchableOpacity>
      </View>

      <FlatList
        data={logs}
        renderItem={renderItem}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          logs && logs.length > 0 ? (
            <View style={styles.chartContainer}>
              <SimpleChart data={chartData} type="line" height={150} color={colors.danger} />
            </View>
          ) : null
        }
      />

      <Modal visible={showAdd} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{t('health.registerBpm')}</Text>
            <TextInput
              style={styles.input}
              value={bpm}
              onChangeText={setBpm}
              {...INTEGER_INPUT_PROPS}
              placeholder="60"
              autoFocus
            />
            <View style={styles.modalActions}>
              <TouchableOpacity onPress={() => setShowAdd(false)} style={styles.modalCancel}>
                <Text style={styles.modalCancelText}>{t('common.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleSave} style={styles.modalSave}>
                <Text style={styles.modalSaveText}>{t('common.save')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
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
    color: colors.primary,
  },
  headerTitle: {
    ...typography.h2,
    color: colors.textPrimary,
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
    borderBottomColor: colors.border,
  },
  logValue: {
    ...typography.h3,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  logDate: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  chartContainer: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: colors.surface,
    padding: 24,
    borderRadius: 16,
    width: '80%',
    alignItems: 'center',
  },
  modalTitle: {
    ...typography.h3,
    marginBottom: 16,
    color: colors.textPrimary,
  },
  input: {
    ...typography.h1,
    borderBottomWidth: 2,
    borderBottomColor: colors.danger,
    width: 100,
    textAlign: 'center',
    marginBottom: 24,
  },
  modalActions: {
    flexDirection: 'row',
    width: '100%',
    justifyContent: 'space-between',
  },
  modalCancel: {
    padding: 12,
  },
  modalCancelText: {
    color: colors.textSecondary,
  },
  modalSave: {
    padding: 12,
    backgroundColor: colors.danger,
    borderRadius: 8,
  },
  modalSaveText: {
    color: '#FFF',
    fontWeight: '600',
  },
  deleteButton: {
    padding: 8,
  },
});
