import React, { useCallback, useState } from 'react';
import { formLayout } from '../../components/common/formLayout';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, TouchableOpacity, Modal, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing, typography, borderRadius, shadows } from '../../theme';
import { useSettingsStyles } from '../../hooks/useSettingsStyles';
import { useSettingsNotifications } from '../../hooks/settings/useSettingsNotifications';
import { AlzanSwitch } from '../../components/common/AlzanSwitch';
import { Utensils, Dumbbell, Heart, Smartphone, Clock, LucideIcon } from 'lucide-react-native';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';
import { useFocusEffect } from '@react-navigation/native';

export const NotificationsSettingsScreen = () => {
  const { t } = useTranslation();
  const { styles: dynamicStyles, colors: themeColors, isDark } = useSettingsStyles();
  const {
    settings,
    loading,
    updateMealReminder,
    updateTrainingSettings,
    updateHealthSettings,
    updateAppSettings,
    refetch,
  } = useSettingsNotifications();

  // Time Picker State
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [pickerMode, setPickerMode] = useState<'training' | null>(null);
  const [tempDate, setTempDate] = useState(new Date());

  useFocusEffect(
    useCallback(() => {
      void refetch();
    }, [refetch]),
  );

  const handleOpenTimePicker = (timeStr: string) => {
    setPickerMode('training');
    const [hours, minutes] = timeStr.split(':').map(Number);
    const now = new Date();
    now.setHours(hours || 0, minutes || 0, 0, 0);
    setTempDate(now);
    setShowTimePicker(true);
  };

  const handleTimeChange = (_event: DateTimePickerEvent, selectedDate?: Date) => {
    if (Platform.OS === 'android') {
      setShowTimePicker(false);
    }

    if (selectedDate && pickerMode) {
      setTempDate(selectedDate);
      const hours = selectedDate.getHours().toString().padStart(2, '0');
      const minutes = selectedDate.getMinutes().toString().padStart(2, '0');
      const newTime = `${hours}:${minutes}`;

      updateTrainingSettings({ scheduled_reminder_time: newTime });
    }
  };

  const closePicker = () => {
    setShowTimePicker(false);
    setPickerMode(null);
  };

  const SectionHeader = ({ title, icon: Icon }: { title: string; icon: LucideIcon }) => (
    <View style={styles.sectionHeaderRow}>
      <Icon size={18} color={themeColors.primary} />
      <Text style={[styles.sectionHeader, dynamicStyles.sectionHeader]}>{title}</Text>
    </View>
  );

  const ToggleRow = ({
    label,
    description,
    value,
    onToggle,
    time,
    onTimePress,
  }: {
    label: string;
    description?: string;
    value: boolean;
    onToggle: (value: boolean) => void;
    time?: string;
    onTimePress?: () => void;
  }) => (
    <View style={styles.toggleRow}>
      <View style={styles.toggleInfo}>
        <Text style={[styles.toggleLabel, { color: themeColors.textPrimary }]}>{label}</Text>
        {description && (
          <Text style={[styles.toggleDescription, { color: themeColors.textSecondary }]}>{description}</Text>
        )}
        {value && time && !onTimePress && (
          <Text style={[styles.readOnlyTime, { color: themeColors.textSecondary }]}>
            {t('settings.atTime')} {time}
          </Text>
        )}
      </View>
      <View style={styles.rightContainer}>
        {value && time && onTimePress && (
          <TouchableOpacity
            style={[styles.timeButton, { backgroundColor: themeColors.background }]}
            onPress={onTimePress}
          >
            <Text style={[styles.timeText, { color: themeColors.primary }]}>{time}</Text>
            <Clock size={14} color={themeColors.primary} />
          </TouchableOpacity>
        )}
        <AlzanSwitch value={value} onValueChange={onToggle} />
      </View>
    </View>
  );

  const DAYS = [
    { key: 1, label: 'L' },
    { key: 2, label: 'M' },
    { key: 3, label: 'X' },
    { key: 4, label: 'J' },
    { key: 5, label: 'V' },
    { key: 6, label: 'S' },
    { key: 0, label: 'D' },
  ];

  const DaySelector = ({
    selectedDays,
    onDayToggle,
  }: {
    selectedDays: number[];
    onDayToggle: (day: number) => void;
  }) => (
    <View style={styles.daySelectorContainer}>
      {DAYS.map(({ key, label }) => {
        const isSelected = selectedDays.includes(key);
        return (
          <TouchableOpacity
            key={key}
            style={[
              styles.dayChip,
              isSelected
                ? {
                    backgroundColor: themeColors.primary,
                    borderColor: themeColors.primary,
                  }
                : {
                    backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.04)',
                    borderColor: isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.1)',
                  },
            ]}
            onPress={() => onDayToggle(key)}
            activeOpacity={0.7}
          >
            <Text
              style={[
                styles.dayChipText,
                {
                  color: isSelected ? '#FFFFFF' : isDark ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.5)',
                  fontWeight: isSelected ? '700' : '500',
                },
              ]}
            >
              {label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );

  const MealReminderRow = ({
    label,
    enabled,
    time,
    onToggle,
  }: {
    label: string;
    enabled: boolean;
    time: string;
    onToggle: (enabled: boolean) => void;
  }) => (
    <View style={styles.mealRow}>
      <View style={styles.mealInfo}>
        <Text style={[styles.toggleLabel, { color: themeColors.textPrimary }]}>{label}</Text>
        {enabled && (
          <Text style={[styles.mealTimeReadOnly, { color: themeColors.textSecondary }]}>
            {t('settings.atTime')} {time}
          </Text>
        )}
      </View>
      <AlzanSwitch value={enabled} onValueChange={onToggle} />
    </View>
  );

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <LinearGradient colors={dynamicStyles.gradientColors} style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <ScrollView contentContainerStyle={styles.content}>
          {/* Meals Section */}
          <View style={styles.section}>
            <SectionHeader title={t('settings.meals')} icon={Utensils} />
            <View style={[styles.card, dynamicStyles.card]}>
              <MealReminderRow
                label={t('settings.breakfast')}
                enabled={settings.meals.breakfast.enabled}
                time={settings.meals.breakfast.time}
                onToggle={enabled => updateMealReminder('breakfast', { enabled })}
              />
              <View style={[styles.divider, dynamicStyles.divider]} />
              <MealReminderRow
                label={t('settings.lunch')}
                enabled={settings.meals.almuerzo?.enabled ?? false}
                time={settings.meals.almuerzo?.time ?? '11:00'}
                onToggle={enabled => updateMealReminder('almuerzo', { enabled })}
              />
              <View style={[styles.divider, dynamicStyles.divider]} />
              <MealReminderRow
                label={t('nutrition.meal')}
                enabled={settings.meals.lunch.enabled}
                time={settings.meals.lunch.time}
                onToggle={enabled => updateMealReminder('lunch', { enabled })}
              />
              <View style={[styles.divider, dynamicStyles.divider]} />
              <MealReminderRow
                label={t('settings.snack')}
                enabled={settings.meals.merienda?.enabled ?? false}
                time={settings.meals.merienda?.time ?? '17:30'}
                onToggle={enabled => updateMealReminder('merienda', { enabled })}
              />
              <View style={[styles.divider, dynamicStyles.divider]} />
              <MealReminderRow
                label={t('settings.dinner')}
                enabled={settings.meals.dinner.enabled}
                time={settings.meals.dinner.time}
                onToggle={enabled => updateMealReminder('dinner', { enabled })}
              />
            </View>
          </View>

          {/* Training Section */}
          <View style={styles.section}>
            <SectionHeader title={t('settings.workout')} icon={Dumbbell} />
            <View style={[styles.card, dynamicStyles.card]}>
              <ToggleRow
                label={t('settings.workoutReminder')}
                description={t('settings.workoutAlertHint')}
                value={settings.training.scheduled_reminder}
                onToggle={val => updateTrainingSettings({ scheduled_reminder: val })}
                time={settings.training.scheduled_reminder_time}
                onTimePress={() => handleOpenTimePicker(settings.training.scheduled_reminder_time)}
              />
              <View style={[styles.divider, dynamicStyles.divider]} />
              <ToggleRow
                label={t('settings.inactivityAlert')}
                description={t('settings.inactivityReminder')}
                value={settings.training.inactivity_days !== null}
                onToggle={val =>
                  updateTrainingSettings({
                    inactivity_days: val ? 3 : null,
                  })
                }
              />
            </View>
          </View>

          {/* Health Section */}
          <View style={styles.section}>
            <SectionHeader title={t('tabs.health')} icon={Heart} />
            <View style={[styles.card, dynamicStyles.card]}>
              <ToggleRow
                label={t('settings.weightReminder')}
                description={t('settings.reminderDays')}
                value={settings.health.weight_reminder !== null}
                onToggle={val =>
                  updateHealthSettings({
                    weight_reminder: val ? 'weekly' : null,
                    weight_days: val ? [0, 1, 2, 3, 4, 5, 6] : [], // Default to All Days
                  })
                }
                time={settings.health.weight_time}
              />
              {settings.health.weight_reminder !== null && (
                <DaySelector
                  selectedDays={settings.health.weight_days}
                  onDayToggle={day => {
                    const currentDays = settings.health.weight_days || [];
                    const allDaysSelected = currentDays.length === 7;

                    let newDays;
                    if (allDaysSelected) {
                      // If all days are selected, clicking one selects ONLY that one
                      newDays = [day];
                    } else {
                      // Standard toggle behavior
                      newDays = currentDays.includes(day) ? currentDays.filter(d => d !== day) : [...currentDays, day];
                    }
                    updateHealthSettings({ weight_days: newDays });
                  }}
                />
              )}
              <View style={[styles.divider, dynamicStyles.divider]} />
              <ToggleRow
                label={t('settings.sleep')}
                description={t('settings.sleepReminder')}
                value={settings.health.sleep}
                onToggle={val => updateHealthSettings({ sleep: val })}
                time={settings.health.sleep_time}
              />
              <View style={[styles.divider, dynamicStyles.divider]} />
              <ToggleRow
                label={t('health.hydration')}
                description={t('settings.hydrationReminder')}
                value={settings.health.hydration}
                onToggle={val => updateHealthSettings({ hydration: val })}
                time={settings.health.hydration_time}
              />
            </View>
          </View>

          {/* App Section */}
          <View style={styles.section}>
            <SectionHeader title={t('settings.app')} icon={Smartphone} />
            <View style={[styles.card, dynamicStyles.card]}>
              <ToggleRow
                label={t('settings.generalNotifications')}
                value={settings.app.general}
                onToggle={val => updateAppSettings({ general: val })}
              />
              <View style={[styles.divider, dynamicStyles.divider]} />
              <ToggleRow
                label={t('settings.whatsNew')}
                description={t('settings.appUpdates')}
                value={settings.app.news}
                onToggle={val => updateAppSettings({ news: val })}
              />
              <View style={[styles.divider, dynamicStyles.divider]} />
              <ToggleRow
                label={t('settings.smartReminders')}
                description={t('settings.activitySuggestions')}
                value={settings.app.smart_reminders}
                onToggle={val => updateAppSettings({ smart_reminders: val })}
              />
            </View>
          </View>
        </ScrollView>

        {/* Date Picker - Platform Specific */}
        {Platform.OS === 'ios' ? (
          <Modal visible={showTimePicker} transparent={true} animationType="slide" onRequestClose={closePicker}>
            <View style={styles.modalOverlay}>
              <TouchableOpacity style={styles.modalBackdrop} onPress={closePicker} />
              <View style={styles.modalContent}>
                <View style={styles.iosPickerToolbar}>
                  <TouchableOpacity onPress={closePicker} style={styles.iosPickerDone}>
                    <Text style={styles.iosPickerDoneText}>{t('common.done')}</Text>
                  </TouchableOpacity>
                </View>
                <DateTimePicker
                  value={tempDate}
                  mode="time"
                  is24Hour={true}
                  display="spinner"
                  onChange={handleTimeChange}
                  style={styles.iosPicker}
                  textColor="black"
                />
              </View>
            </View>
          </Modal>
        ) : (
          showTimePicker && (
            <DateTimePicker
              value={tempDate}
              mode="time"
              is24Hour={true}
              display="default"
              onChange={handleTimeChange}
            />
          )
        )}
      </SafeAreaView>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    // Background handled by LinearGradient
  },
  safeArea: {
    flex: 1,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    ...formLayout.settings,
    padding: spacing.m,
    paddingBottom: 120,
  },
  section: {
    marginBottom: spacing.l,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s,
    marginBottom: spacing.s,
    marginLeft: spacing.xs,
  },
  sectionHeader: {
    ...typography.caption,
    textTransform: 'uppercase',
  },
  card: {
    borderRadius: borderRadius.m,
    padding: spacing.m,
    ...shadows.soft,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.s,
  },
  toggleInfo: {
    flex: 1,
    marginRight: spacing.m,
  },
  toggleLabel: {
    fontSize: 16,
  },
  toggleDescription: {
    fontSize: 13,
    marginTop: 2,
  },
  readOnlyTime: {
    fontSize: 13,
    marginTop: 4,
  },
  mealRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.s,
  },
  mealInfo: {
    flex: 1,
  },
  mealTimeReadOnly: {
    fontSize: 13,
    marginTop: 2,
  },
  divider: {
    height: 1,
    marginVertical: spacing.xs,
  },
  rightContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s,
  },
  timeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.s,
    paddingVertical: 4,
    borderRadius: borderRadius.s,
  },
  timeText: {
    fontSize: 14,
    fontWeight: '600',
  },
  // Modal & Picker Styles
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
  },
  modalBackdrop: {
    flex: 1,
  },
  modalContent: {
    backgroundColor: colors.white,
    paddingBottom: 30, // SafeArea
    borderTopLeftRadius: borderRadius.l,
    borderTopRightRadius: borderRadius.l,
    ...shadows.soft,
  },
  iosPickerToolbar: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    padding: spacing.m,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  iosPickerDone: {
    paddingHorizontal: spacing.s,
  },
  iosPickerDoneText: {
    color: colors.primary,
    fontWeight: '600',
    fontSize: 17,
  },
  iosPicker: {
    height: 200,
    backgroundColor: colors.white,
  },
  daySelectorContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: spacing.m,
    paddingTop: spacing.m,
    paddingHorizontal: spacing.xs,
  },
  dayChip: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
  },
  dayChipText: {
    fontSize: 14,
    letterSpacing: 0.3,
  },
});
