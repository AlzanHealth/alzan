import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Keyboard } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { HealthScreenNavigationProp } from '../../../types/navigation.types';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChevronLeft, Moon, Clock, Star, ChevronUp, ChevronDown, Calendar } from 'lucide-react-native';
import { useAddSleepSession } from '../hooks/useSleep';
import { HealthStyles, useHealthStyles } from '../../../hooks/useHealthStyles';
import { GlassCard } from '../../../components/GlassCard';
import { format, subDays, addDays, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, isAfter } from 'date-fns';
import { LinearGradient } from 'expo-linear-gradient';
import { ThemeColors } from '../../../context/ThemeContext';
import { Alert } from '../../../components/common/Alert';
import { useTranslation } from 'react-i18next';
import { formatLocalizedDate, getDateFnsLocale } from '../../../i18n/dateLocale';

// Time picker component
interface TimePickerProps {
  value: { hours: number; minutes: number };
  onChange: (value: { hours: number; minutes: number }) => void;
  label: string;
  themeColors: ThemeColors;
  dynamicStyles: HealthStyles;
}

const TimePicker: React.FC<TimePickerProps> = ({ value, onChange, label, themeColors, dynamicStyles }) => {
  const adjustHours = (delta: number) => {
    let newHours = value.hours + delta;
    if (newHours < 0) newHours = 23;
    if (newHours > 23) newHours = 0;
    onChange({ ...value, hours: newHours });
  };

  const adjustMinutes = (delta: number) => {
    let newMinutes = value.minutes + delta;
    if (newMinutes < 0) {
      newMinutes = 55;
      adjustHours(-1);
    } else if (newMinutes >= 60) {
      newMinutes = 0;
      adjustHours(1);
    }
    onChange({ ...value, minutes: newMinutes });
  };

  return (
    <View style={styles.timePickerContainer}>
      <Text style={[styles.timePickerLabel, dynamicStyles.subtitle]}>{label}</Text>
      <View style={styles.timePickerRow}>
        {/* Hours */}
        <View style={styles.timeUnit}>
          <TouchableOpacity onPress={() => adjustHours(1)} style={styles.timeButton}>
            <ChevronUp size={24} color={themeColors.textSecondary} />
          </TouchableOpacity>
          <Text style={[styles.timeValue, dynamicStyles.title]}>{String(value.hours).padStart(2, '0')}</Text>
          <TouchableOpacity onPress={() => adjustHours(-1)} style={styles.timeButton}>
            <ChevronDown size={24} color={themeColors.textSecondary} />
          </TouchableOpacity>
        </View>

        <Text style={[styles.timeSeparator, dynamicStyles.title]}>:</Text>

        {/* Minutes - increments of 5 */}
        <View style={styles.timeUnit}>
          <TouchableOpacity onPress={() => adjustMinutes(5)} style={styles.timeButton}>
            <ChevronUp size={24} color={themeColors.textSecondary} />
          </TouchableOpacity>
          <Text style={[styles.timeValue, dynamicStyles.title]}>{String(value.minutes).padStart(2, '0')}</Text>
          <TouchableOpacity onPress={() => adjustMinutes(-5)} style={styles.timeButton}>
            <ChevronDown size={24} color={themeColors.textSecondary} />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

// Compact Date Selector - expandable calendar
interface DateSelectorProps {
  selectedDate: Date;
  onSelectDate: (date: Date) => void;
  themeColors: ThemeColors;
  dynamicStyles: HealthStyles;
  isDark: boolean;
}

const DateSelector: React.FC<DateSelectorProps> = ({
  selectedDate,
  onSelectDate,
  themeColors,
  dynamicStyles,
  isDark,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const today = new Date();

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });

  const firstDayOfWeek = monthStart.getDay();
  const startOffset = firstDayOfWeek === 0 ? 6 : firstDayOfWeek - 1;

  const weekDays = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

  const goToPrevMonth = () => {
    setCurrentMonth(prev => subDays(startOfMonth(prev), 1));
  };

  const goToNextMonth = () => {
    setCurrentMonth(prev => addDays(endOfMonth(prev), 1));
  };

  const handleDateSelect = (date: Date) => {
    onSelectDate(date);
    setIsExpanded(false);
  };

  return (
    <View style={styles.dateSelectorContainer}>
      {/* Compact view */}
      <TouchableOpacity
        style={[styles.dateCompact, { backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)' }]}
        onPress={() => setIsExpanded(!isExpanded)}
      >
        <Calendar size={18} color="#8B5CF6" />
        <Text style={[styles.dateCompactText, dynamicStyles.title]}>
          {formatLocalizedDate(selectedDate, {
            en: 'EEEE, MMMM d',
            es: "EEEE, d 'de' MMMM",
          })}
        </Text>
        <ChevronDown
          size={20}
          color={themeColors.textSecondary}
          style={{ transform: [{ rotate: isExpanded ? '180deg' : '0deg' }] }}
        />
      </TouchableOpacity>

      {/* Expanded calendar */}
      {isExpanded && (
        <View
          style={[styles.calendarExpanded, { backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)' }]}
        >
          {/* Month Header */}
          <View style={styles.calendarHeader}>
            <TouchableOpacity onPress={goToPrevMonth} style={styles.calendarNavButton}>
              <ChevronLeft size={20} color={themeColors.textPrimary} />
            </TouchableOpacity>
            <Text style={[styles.calendarMonthText, dynamicStyles.title]}>
              {format(currentMonth, 'MMMM yyyy', { locale: getDateFnsLocale() })}
            </Text>
            <TouchableOpacity onPress={goToNextMonth} style={styles.calendarNavButton}>
              <ChevronLeft size={20} color={themeColors.textPrimary} style={{ transform: [{ rotate: '180deg' }] }} />
            </TouchableOpacity>
          </View>

          {/* Week Days */}
          <View style={styles.weekDaysRow}>
            {weekDays.map((day, i) => (
              <Text key={i} style={[styles.weekDayText, dynamicStyles.subtitle]}>
                {day}
              </Text>
            ))}
          </View>

          {/* Days Grid */}
          <View style={styles.daysGrid}>
            {Array.from({ length: startOffset }).map((_, i) => (
              <View key={`empty-${i}`} style={styles.dayCell} />
            ))}

            {daysInMonth.map(day => {
              const isSelected = isSameDay(day, selectedDate);
              const isToday = isSameDay(day, today);
              const isFuture = isAfter(day, today);

              return (
                <TouchableOpacity
                  key={day.toISOString()}
                  style={[
                    styles.dayCell,
                    isSelected && styles.dayCellSelected,
                    isToday && !isSelected && styles.dayCellToday,
                  ]}
                  onPress={() => !isFuture && handleDateSelect(day)}
                  disabled={isFuture}
                >
                  <Text
                    style={[
                      styles.dayText,
                      dynamicStyles.title,
                      isSelected && styles.dayTextSelected,
                      isFuture && styles.dayTextDisabled,
                      isToday && !isSelected && { color: '#8B5CF6' },
                    ]}
                  >
                    {format(day, 'd')}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      )}
    </View>
  );
};

export const SleepAdd = () => {
  const { t } = useTranslation();
  const navigation = useNavigation<HealthScreenNavigationProp>();
  const addMutation = useAddSleepSession();
  const { styles: dynamicStyles, colors: themeColors, isDark } = useHealthStyles();

  // States
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [sleepStart, setSleepStart] = useState({ hours: 23, minutes: 0 });
  const [sleepEnd, setSleepEnd] = useState({ hours: 7, minutes: 0 });
  const [quality, setQuality] = useState(3);

  // Calculate duration
  const duration = useMemo(() => {
    const startMinutes = sleepStart.hours * 60 + sleepStart.minutes;
    let endMinutes = sleepEnd.hours * 60 + sleepEnd.minutes;

    if (endMinutes <= startMinutes) {
      endMinutes += 24 * 60;
    }

    return endMinutes - startMinutes;
  }, [sleepStart, sleepEnd]);

  const formatDuration = (minutes: number) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}h ${mins}m`;
  };

  const getDurationColor = () => {
    if (duration >= 420) return '#10B981';
    if (duration >= 360) return '#F59E0B';
    return '#EF4444';
  };

  const handleSave = () => {
    Keyboard.dismiss();

    if (duration < 30 || duration > 15 * 60) {
      Alert.alert(t('common.error'), t('health.invalidSleepDurationRange'));
      return;
    }

    const dateStr = format(selectedDate, 'yyyy-MM-dd');

    // Logic for "Night of [Selected Date]"
    // If user selects "Tuesday", and enters 23:00 - 07:00:
    // Start: Tuesday 23:00
    // End: Wednesday 07:00
    //
    // If user selects "Tuesday" and enters 01:00 - 08:00:
    // Start: Wednesday 01:00
    // End: Wednesday 08:00
    //
    // Threshold: 14:00 (2 PM). If hour < 14, assume it belongs to the "next day" morning/early morning.
    // If hour >= 14, assume it belongs to the "selected day" afternoon/night.

    const THRESHOLD_HOUR = 14;

    const finalStartDate = new Date(selectedDate);
    finalStartDate.setHours(sleepStart.hours, sleepStart.minutes, 0, 0);
    if (sleepStart.hours < THRESHOLD_HOUR) {
      // e.g. 01:00 AM -> It's the next day relative to the "night of" date
      finalStartDate.setDate(finalStartDate.getDate() + 1);
    }

    const finalEndDate = new Date(selectedDate);
    finalEndDate.setHours(sleepEnd.hours, sleepEnd.minutes, 0, 0);
    if (sleepEnd.hours < THRESHOLD_HOUR) {
      // e.g. 07:00 AM -> It's the next day relative to the "night of" date
      finalEndDate.setDate(finalEndDate.getDate() + 1);
    }

    // Safety check: if end is before start, add 1 day to end (e.g. nap crossing midnight? unlikely with above logic but safe)
    if (finalEndDate < finalStartDate) {
      finalEndDate.setDate(finalEndDate.getDate() + 1);
    }

    addMutation.mutate(
      {
        date: dateStr,
        total_sleep_min: duration,
        sleep_score: quality * 20,
        start_time: finalStartDate.toISOString(),
        end_time: finalEndDate.toISOString(),
      },
      {
        onSuccess: () => navigation.goBack(),
        onError: () => Alert.alert(t('common.error'), t('health.saveLogError')),
      },
    );
  };

  const qualityLabels = ['Muy mal', 'Mal', 'Regular', 'Bien', 'Excelente'];

  return (
    <LinearGradient colors={dynamicStyles.gradientColors} style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={styles.backButton}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <ChevronLeft size={28} color={themeColors.textPrimary} />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Moon size={20} color="#8B5CF6" style={{ marginRight: 8 }} />
            <Text style={[styles.headerTitle, dynamicStyles.title]}>{t('health.registerSleep')}</Text>
          </View>
          <View style={{ width: 28 }} />
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {/* Date Selector - Collapsible */}
          <GlassCard style={[styles.sectionCard, dynamicStyles.glassCard]}>
            <DateSelector
              selectedDate={selectedDate}
              onSelectDate={setSelectedDate}
              themeColors={themeColors}
              dynamicStyles={dynamicStyles}
              isDark={isDark}
            />
          </GlassCard>
          {/* Time Pickers */}
          <GlassCard style={[styles.sectionCard, dynamicStyles.glassCard]}>
            <View style={styles.sectionHeader}>
              <Clock size={18} color="#8B5CF6" />
              <Text style={[styles.sectionTitle, dynamicStyles.title]}>{t('health.schedule')}</Text>
            </View>
            <View style={styles.timePickersRow}>
              <TimePicker
                value={sleepStart}
                onChange={setSleepStart}
                label={t('health.fellAsleep')}
                themeColors={themeColors}
                dynamicStyles={dynamicStyles}
              />
              <TimePicker
                value={sleepEnd}
                onChange={setSleepEnd}
                label={t('health.wakeUp')}
                themeColors={themeColors}
                dynamicStyles={dynamicStyles}
              />
            </View>

            {/* Duration Display */}
            <View
              style={[styles.durationCard, { backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)' }]}
            >
              <Clock size={20} color={getDurationColor()} />
              <Text style={[styles.durationValue, { color: getDurationColor() }]}>{formatDuration(duration)}</Text>
              <Text style={[styles.durationLabel, dynamicStyles.subtitle]}>{t('health.totalDuration')}</Text>
            </View>
          </GlassCard>
          {/* Quality Selector */}
          <GlassCard style={[styles.sectionCard, dynamicStyles.glassCard]}>
            <View style={styles.sectionHeader}>
              <Star size={18} color="#F59E0B" fill="#F59E0B" />
              <Text style={[styles.sectionTitle, dynamicStyles.title]}>{t('health.sleepQuality')}</Text>
            </View>
            <View style={styles.qualitySelector}>
              {[1, 2, 3, 4, 5].map(q => (
                <TouchableOpacity
                  key={q}
                  style={[
                    styles.qualityButton,
                    quality === q && styles.qualityButtonActive,
                    {
                      backgroundColor:
                        quality === q ? '#8B5CF6' : isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)',
                    },
                  ]}
                  onPress={() => setQuality(q)}
                >
                  <Star
                    size={24}
                    color={quality >= q ? (quality === q ? '#FFF' : '#8B5CF6') : themeColors.textSecondary}
                    fill={quality >= q ? (quality === q ? '#FFF' : '#8B5CF6') : 'transparent'}
                  />
                </TouchableOpacity>
              ))}
            </View>
            <Text style={[styles.qualityLabel, dynamicStyles.subtitle]}>{qualityLabels[quality - 1]}</Text>
          </GlassCard>
          {/* Bottom Save Button - Fixed above tab bar */}
          <View style={styles.bottomButtonContainer}>
            <SafeAreaView edges={['bottom']} style={styles.bottomButtonSafeArea}>
              <TouchableOpacity
                style={[styles.saveButton, addMutation.isPending && styles.saveButtonDisabled]}
                onPress={handleSave}
                disabled={addMutation.isPending}
                activeOpacity={0.8}
              >
                <Text style={styles.saveText}>{addMutation.isPending ? 'Guardando...' : t('health.saveLog')}</Text>
              </TouchableOpacity>
            </SafeAreaView>
          </View>
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backButton: {
    padding: 4,
  },
  headerCenter: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 120,
  },
  sectionCard: {
    padding: 20,
    borderRadius: 24,
    marginBottom: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    gap: 8,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  // Date selector styles
  dateSelectorContainer: {
    gap: 12,
  },
  dateCompact: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 16,
    gap: 12,
  },
  dateCompactText: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  calendarExpanded: {
    padding: 16,
    borderRadius: 16,
    marginTop: 8,
  },
  calendarHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  calendarNavButton: {
    padding: 8,
  },
  calendarMonthText: {
    fontSize: 15,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  weekDaysRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 8,
  },
  weekDayText: {
    width: 36,
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '600',
    opacity: 0.6,
  },
  daysGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  dayCell: {
    width: '14.28%',
    aspectRatio: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dayCellSelected: {
    backgroundColor: '#8B5CF6',
    borderRadius: 20,
  },
  dayCellToday: {
    borderWidth: 2,
    borderColor: '#8B5CF6',
    borderRadius: 20,
  },
  dayText: {
    fontSize: 14,
    fontWeight: '500',
  },
  dayTextSelected: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  dayTextDisabled: {
    opacity: 0.3,
  },
  // Time picker styles
  timePickersRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  timePickerContainer: {
    alignItems: 'center',
  },
  timePickerLabel: {
    fontSize: 13,
    marginBottom: 12,
    opacity: 0.7,
  },
  timePickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  timeUnit: {
    alignItems: 'center',
  },
  timeButton: {
    padding: 8,
  },
  timeValue: {
    fontSize: 36,
    fontWeight: '700',
    width: 60,
    textAlign: 'center',
  },
  timeSeparator: {
    fontSize: 36,
    fontWeight: '300',
    marginHorizontal: 4,
  },
  durationCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    marginTop: 20,
    borderRadius: 16,
    gap: 12,
  },
  durationValue: {
    fontSize: 28,
    fontWeight: '700',
  },
  durationLabel: {
    fontSize: 14,
    opacity: 0.7,
  },
  // Quality styles
  qualitySelector: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
  },
  qualityButton: {
    width: 52,
    height: 52,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  qualityButtonActive: {
    transform: [{ scale: 1.1 }],
  },
  qualityLabel: {
    textAlign: 'center',
    marginTop: 16,
    fontSize: 15,
    fontWeight: '500',
  },
  // Bottom button
  bottomButtonContainer: {
    backgroundColor: 'transparent',
  },
  bottomButtonSafeArea: {
    backgroundColor: 'transparent',
  },
  saveButton: {
    backgroundColor: '#8B5CF6',
    paddingVertical: 18,
    borderRadius: 16,
    alignItems: 'center',
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveText: {
    fontSize: 17,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
