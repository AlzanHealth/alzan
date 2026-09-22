import React, { useCallback, useState } from 'react';
import { formLayout } from '../../components/common/formLayout';
import { ActivityIndicator, Modal, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { Download, Clock } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';
import { colors, spacing, typography, borderRadius, shadows } from '../../theme';
import { useHealthStyles } from '../../hooks/useHealthStyles';
import { NotificationSettings, useSettingsNotifications } from '../../hooks/settings/useSettingsNotifications';
import { HealthExportModal } from '../../modules/health/components/HealthExportModal';
import { useHealthPdfExport } from '../../modules/health/hooks/useHealthPdfExport';

type HealthTimeKey = 'weight_time' | 'sleep_time' | 'hydration_time';

export const HealthSettingsScreen = () => {
  const { t } = useTranslation();
  const { styles: dynamicStyles, colors: themeColors } = useHealthStyles();
  const { settings, loading, updating, updateHealthSettings, refetch } = useSettingsNotifications();
  const healthExport = useHealthPdfExport();
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [selectedTimeKey, setSelectedTimeKey] = useState<HealthTimeKey | null>(null);
  const [tempDate, setTempDate] = useState(new Date());

  useFocusEffect(
    useCallback(() => {
      void refetch();
    }, [refetch]),
  );

  const handleOpenTimePicker = (key: HealthTimeKey, time: string) => {
    const [hours, minutes] = time.split(':').map(Number);
    const date = new Date();
    date.setHours(hours || 0, minutes || 0, 0, 0);
    setSelectedTimeKey(key);
    setTempDate(date);
    setShowTimePicker(true);
  };

  const handleTimeChange = (_event: DateTimePickerEvent, selectedDate?: Date) => {
    if (Platform.OS === 'android') {
      setShowTimePicker(false);
    }

    if (!selectedDate || !selectedTimeKey) return;

    setTempDate(selectedDate);
    const hours = selectedDate.getHours().toString().padStart(2, '0');
    const minutes = selectedDate.getMinutes().toString().padStart(2, '0');
    const time = `${hours}:${minutes}`;
    const updates: Partial<NotificationSettings['health']> =
      selectedTimeKey === 'weight_time'
        ? { weight_time: time }
        : selectedTimeKey === 'sleep_time'
          ? { sleep_time: time }
          : { hydration_time: time };

    void updateHealthSettings(updates);
  };

  const closePicker = () => {
    setShowTimePicker(false);
    setSelectedTimeKey(null);
  };

  const TimeRow = ({ label, value, timeKey }: { label: string; value: string; timeKey: HealthTimeKey }) => (
    <View style={styles.timeRow}>
      <Text style={[styles.timeLabel, dynamicStyles.label]}>{label}</Text>
      <TouchableOpacity
        style={[styles.timeButton, dynamicStyles.input]}
        onPress={() => handleOpenTimePicker(timeKey, value)}
        activeOpacity={0.7}
        disabled={updating}
      >
        <Clock size={15} color={themeColors.primary} />
        <Text style={[styles.timeValue, { color: themeColors.primary }]}>{value}</Text>
      </TouchableOpacity>
    </View>
  );

  if (loading) {
    return (
      <View style={[styles.center, dynamicStyles.container]}>
        <ActivityIndicator size="large" color={themeColors.primary} />
      </View>
    );
  }

  return (
    <LinearGradient colors={dynamicStyles.gradientColors} style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <ScrollView
          style={styles.container}
          contentContainerStyle={styles.contentContainer}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.section}>
            <Text style={[styles.sectionHeader, dynamicStyles.sublabel]}>{t('health.registrationTimesAllCaps')}</Text>
            <View style={[styles.card, dynamicStyles.glassCard]}>
              <Text style={[styles.sectionHint, dynamicStyles.sublabel]}>{t('health.registrationTimesHint')}</Text>
              <View style={[styles.divider, dynamicStyles.divider]} />
              <TimeRow label={t('health.logWeight')} value={settings.health.weight_time} timeKey="weight_time" />
              <View style={[styles.divider, dynamicStyles.divider]} />
              <TimeRow label={t('health.logSleep')} value={settings.health.sleep_time} timeKey="sleep_time" />
              <View style={[styles.divider, dynamicStyles.divider]} />
              <TimeRow label={t('health.hydration')} value={settings.health.hydration_time} timeKey="hydration_time" />
            </View>
          </View>

          <View style={[styles.section, styles.lastSection]}>
            <Text style={[styles.sectionHeader, dynamicStyles.sublabel]}>{t('health.settingsData')}</Text>
            <View style={[styles.card, dynamicStyles.glassCard]}>
              <TouchableOpacity style={styles.actionRow} onPress={healthExport.openModal} activeOpacity={0.75}>
                <Download size={20} color={themeColors.primary} />
                <Text style={[styles.actionText, { color: themeColors.primary }]}>
                  {t('health.exportHealthHistory')}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>

        {Platform.OS === 'ios' ? (
          <Modal visible={showTimePicker} transparent animationType="slide" onRequestClose={closePicker}>
            <View style={styles.modalOverlay}>
              <TouchableOpacity style={styles.modalBackdrop} onPress={closePicker} />
              <View style={[styles.modalContent, dynamicStyles.modalContent]}>
                <View style={[styles.pickerToolbar, dynamicStyles.divider]}>
                  <TouchableOpacity onPress={closePicker} style={styles.doneButton}>
                    <Text style={[styles.doneText, { color: themeColors.primary }]}>{t('common.done')}</Text>
                  </TouchableOpacity>
                </View>
                <DateTimePicker
                  value={tempDate}
                  mode="time"
                  is24Hour
                  display="spinner"
                  onChange={handleTimeChange}
                  style={styles.iosPicker}
                />
              </View>
            </View>
          </Modal>
        ) : (
          showTimePicker && (
            <DateTimePicker value={tempDate} mode="time" is24Hour display="default" onChange={handleTimeChange} />
          )
        )}

        <HealthExportModal controller={healthExport} />
      </SafeAreaView>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  container: {
    flex: 1,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  contentContainer: {
    ...formLayout.settings,
    padding: spacing.m,
    paddingBottom: 80,
  },
  section: {
    marginBottom: spacing.l,
  },
  lastSection: {
    marginBottom: spacing.xl * 2,
  },
  sectionHeader: {
    ...typography.caption,
    marginBottom: spacing.s,
    marginLeft: spacing.xs,
    textTransform: 'uppercase',
  },
  card: {
    borderRadius: borderRadius.m,
    padding: spacing.m,
    borderWidth: 1,
    ...shadows.soft,
  },
  sectionHint: {
    ...typography.caption,
    lineHeight: 19,
  },
  divider: {
    height: 1,
    marginVertical: spacing.s,
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 44,
  },
  timeLabel: {
    ...typography.body,
    fontWeight: '600',
  },
  timeButton: {
    minHeight: 44,
    minWidth: 94,
    borderRadius: borderRadius.s,
    paddingHorizontal: spacing.s,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.xs,
  },
  timeValue: {
    ...typography.body,
    fontWeight: '600',
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 44,
    gap: spacing.s,
  },
  actionText: {
    ...typography.body,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
  },
  modalBackdrop: {
    flex: 1,
  },
  modalContent: {
    paddingBottom: 30,
    borderTopLeftRadius: borderRadius.l,
    borderTopRightRadius: borderRadius.l,
    ...shadows.soft,
  },
  pickerToolbar: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    padding: spacing.m,
    borderBottomWidth: 1,
  },
  doneButton: {
    paddingHorizontal: spacing.s,
  },
  doneText: {
    fontWeight: '600',
    fontSize: 17,
  },
  iosPicker: {
    height: 200,
    backgroundColor: colors.white,
  },
});
