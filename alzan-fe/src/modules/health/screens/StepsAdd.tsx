import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, X } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { spacing, typography } from '../../../theme';
import { RootStackParamList } from '../../../types/navigation.types';
import { useHealthStyles } from '../../../hooks/useHealthStyles';
import { Alert } from '../../../components/common/Alert';
import { getLocaleTag } from '../../../i18n/dateLocale';
import { useManualStepsForDate, useUpsertManualSteps } from '../hooks/useSteps';
import { StackNavigationProp } from '@react-navigation/stack';

type StepsAddNavigationProp = StackNavigationProp<RootStackParamList, 'StepsAdd'>;
type StepsAddRouteProp = RouteProp<RootStackParamList, 'StepsAdd'>;

const MAX_STEPS = 200000;

const isSameDay = (a: Date, b: Date) =>
  a.getDate() === b.getDate() && a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear();

const isToday = (d: Date) => isSameDay(d, new Date());

const isYesterday = (d: Date) => {
  const y = new Date();
  y.setDate(y.getDate() - 1);
  return isSameDay(d, y);
};

export const StepsAdd = () => {
  const { t } = useTranslation();
  const navigation = useNavigation<StepsAddNavigationProp>();
  const route = useRoute<StepsAddRouteProp>();
  const upsertSteps = useUpsertManualSteps();
  const { colors: themeColors, isDark } = useHealthStyles();

  const [steps, setSteps] = useState('');
  const [date, setDate] = useState(route.params?.date ? new Date(route.params.date) : new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const manualStepsQuery = useManualStepsForDate(date);

  useEffect(() => {
    if (manualStepsQuery.isFetching) return;
    setSteps(manualStepsQuery.data ? String(manualStepsQuery.data.total_steps) : '');
  }, [manualStepsQuery.data, manualStepsQuery.isFetching]);

  const handleSave = () => {
    const value = parseInt(steps.replace(/[^0-9]/g, ''), 10);
    if (isNaN(value) || value < 0 || value > MAX_STEPS) {
      Alert.alert(t('common.error'), t('steps.invalidRange', { max: MAX_STEPS }));
      return;
    }

    upsertSteps.mutate(
      { date, steps: value },
      {
        onSuccess: () => navigation.goBack(),
        onError: (error: unknown) => {
          const err = error as { message?: string };
          Alert.alert(t('common.error'), t('steps.saveError', { message: err?.message ?? '' }));
        },
      },
    );
  };

  const onDateChange = (event: DateTimePickerEvent, selectedDate?: Date) => {
    if (Platform.OS === 'android' || event.type === 'set') {
      setShowDatePicker(false);
    }
    if (selectedDate) setDate(selectedDate);
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1, justifyContent: 'flex-end' }}
      >
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={() => navigation.goBack()}>
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.65)' }} />
        </TouchableOpacity>

        <View style={[styles.content, { backgroundColor: isDark ? '#1C1C1E' : '#FFFFFF' }]}>
          <View style={styles.headerRow}>
            <Text style={[styles.title, { color: themeColors.textPrimary }]}>{t('steps.addTitle')}</Text>
            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.closeButton}>
              <X size={24} color={themeColors.textSecondary} />
            </TouchableOpacity>
          </View>

          <View style={styles.inputContainer}>
            <TextInput
              style={[styles.input, { color: themeColors.textPrimary, borderBottomColor: themeColors.primary }]}
              value={steps}
              onChangeText={setSteps}
              placeholder="0"
              placeholderTextColor={themeColors.textSecondary}
              keyboardType="number-pad"
              autoFocus
              maxLength={6}
            />
            <Text style={[styles.unit, { color: themeColors.textSecondary }]}>{t('steps.unit')}</Text>
          </View>

          <Text style={[styles.sectionLabel, { color: themeColors.textSecondary }]}>{t('health.recordDate')}</Text>
          <View style={styles.dateSelectorContainer}>
            <View style={styles.dateQuickActions}>
              <TouchableOpacity
                style={[
                  styles.dateChip,
                  { backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)' },
                  isYesterday(date) && {
                    backgroundColor: themeColors.primary + '20',
                    borderColor: themeColors.primary,
                  },
                ]}
                onPress={() => {
                  const d = new Date();
                  d.setDate(d.getDate() - 1);
                  setDate(d);
                }}
              >
                <Text
                  style={[
                    styles.dateChipText,
                    { color: themeColors.textSecondary },
                    isYesterday(date) && { color: themeColors.primary },
                  ]}
                >
                  {t('health.yesterday')}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.dateChip,
                  { backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)' },
                  isToday(date) && { backgroundColor: themeColors.primary + '20', borderColor: themeColors.primary },
                ]}
                onPress={() => setDate(new Date())}
              >
                <Text
                  style={[
                    styles.dateChipText,
                    { color: themeColors.textSecondary },
                    isToday(date) && { color: themeColors.primary },
                  ]}
                >
                  {t('health.today')}
                </Text>
              </TouchableOpacity>
            </View>

            <View style={styles.dateDisplayRow}>
              <TouchableOpacity
                onPress={() => setDate(d => new Date(new Date(d).setDate(d.getDate() - 1)))}
                style={styles.arrowButton}
              >
                <ChevronLeft size={24} color={themeColors.primary} />
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.dateTextContainer,
                  { backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)' },
                  showDatePicker && Platform.OS === 'ios' && { borderColor: themeColors.primary },
                ]}
                onPress={() => setShowDatePicker(!showDatePicker)}
              >
                <CalendarIcon
                  size={18}
                  color={showDatePicker && Platform.OS === 'ios' ? themeColors.primary : themeColors.textSecondary}
                  style={{ marginRight: 8 }}
                />
                <Text
                  style={[
                    styles.dateTextMain,
                    { color: themeColors.textPrimary },
                    showDatePicker && Platform.OS === 'ios' && { color: themeColors.primary },
                  ]}
                >
                  {date.toLocaleDateString(getLocaleTag(), { weekday: 'long', day: 'numeric', month: 'long' })}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => setDate(d => new Date(new Date(d).setDate(d.getDate() + 1)))}
                style={styles.arrowButton}
                disabled={isToday(date)}
              >
                <ChevronRight size={24} color={isToday(date) ? themeColors.textSecondary : themeColors.primary} />
              </TouchableOpacity>
            </View>
          </View>

          {showDatePicker && Platform.OS === 'ios' && (
            <View
              style={[
                styles.inlinePickerContainer,
                { backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)' },
              ]}
            >
              <DateTimePicker
                value={date}
                mode="date"
                display="inline"
                onChange={onDateChange}
                accentColor={themeColors.primary}
                themeVariant={isDark ? 'dark' : 'light'}
                maximumDate={new Date()}
              />
            </View>
          )}

          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.cancelButton, { backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)' }]}
              onPress={() => navigation.goBack()}
              disabled={upsertSteps.isPending}
            >
              <Text style={[styles.cancelText, { color: themeColors.textPrimary }]}>{t('common.cancel')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.saveButton,
                { backgroundColor: themeColors.primary },
                upsertSteps.isPending && { opacity: 0.8 },
              ]}
              onPress={handleSave}
              disabled={upsertSteps.isPending}
            >
              {upsertSteps.isPending ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <Text style={styles.saveText}>{t('common.save')}</Text>
              )}
            </TouchableOpacity>
          </View>

          {showDatePicker && Platform.OS === 'android' && (
            <DateTimePicker
              value={date}
              mode="date"
              display="default"
              onChange={onDateChange}
              maximumDate={new Date()}
            />
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  content: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 40,
    width: '100%',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 32,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    letterSpacing: -0.5,
  },
  closeButton: {
    padding: 4,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
    marginBottom: 8,
  },
  input: {
    fontSize: 56,
    fontWeight: '700',
    paddingHorizontal: 12,
    minWidth: 160,
    textAlign: 'center',
    borderBottomWidth: 2,
  },
  unit: {
    ...typography.h3,
    marginLeft: 8,
  },
  sectionLabel: {
    ...typography.caption,
    marginBottom: spacing.xs,
    marginTop: 24,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  dateSelectorContainer: {
    marginBottom: 24,
    alignItems: 'center',
  },
  dateQuickActions: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: spacing.m,
  },
  dateChip: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  dateChipText: {
    ...typography.body,
    fontWeight: '600',
  },
  dateDisplayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
  },
  arrowButton: {
    padding: 10,
  },
  dateTextContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    flex: 1,
    marginHorizontal: 8,
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  dateTextMain: {
    ...typography.body,
    textTransform: 'capitalize',
    fontWeight: '500',
  },
  inlinePickerContainer: {
    width: '100%',
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: spacing.l,
  },
  actions: {
    flexDirection: 'row',
    width: '100%',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  cancelButton: {
    flex: 1,
    padding: 16,
    alignItems: 'center',
    marginRight: 8,
    borderRadius: 12,
  },
  cancelText: {
    ...typography.body,
    fontWeight: '600',
  },
  saveButton: {
    flex: 1,
    padding: 16,
    alignItems: 'center',
    marginLeft: 8,
    borderRadius: 12,
  },
  saveText: {
    ...typography.body,
    color: '#FFFFFF',
    fontWeight: '600',
  },
});
