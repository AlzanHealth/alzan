import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  Platform,
  KeyboardAvoidingView,
  ActivityIndicator,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { HealthScreenNavigationProp, HealthStackParamList } from '../../../types/navigation.types';
import { SafeAreaView } from 'react-native-safe-area-context';
import { typography, spacing } from '../../../theme';
import { useAddWeightLog } from '../hooks/useWeight';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, X } from 'lucide-react-native';
import { useUnitConversion } from '../../../hooks/useUnitConversion';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useHealthStyles } from '../../../hooks/useHealthStyles';
import { Alert } from '../../../components/common/Alert';
import { useTranslation } from 'react-i18next';
import { getLocaleTag } from '../../../i18n/dateLocale';
import { DECIMAL_INPUT_PROPS, parseLocalizedDecimal } from '../../../utils/numericInput';

type WeightAddRouteProp = RouteProp<HealthStackParamList, 'WeightAdd'>;

const isToday = (someDate: Date) => {
  const today = new Date();
  return (
    someDate.getDate() == today.getDate() &&
    someDate.getMonth() == today.getMonth() &&
    someDate.getFullYear() == today.getFullYear()
  );
};

const isYesterday = (someDate: Date) => {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  return (
    someDate.getDate() == yesterday.getDate() &&
    someDate.getMonth() == yesterday.getMonth() &&
    someDate.getFullYear() == yesterday.getFullYear()
  );
};

export const WeightAdd = () => {
  const { t } = useTranslation();
  const navigation = useNavigation<HealthScreenNavigationProp>();
  const route = useRoute<WeightAddRouteProp>();
  const addWeightMutation = useAddWeightLog();
  const { parseWeightToKg, units } = useUnitConversion();
  const { colors: themeColors, isDark } = useHealthStyles();
  const [weight, setWeight] = useState('');
  const [date, setDate] = useState(route.params?.date ? new Date(route.params.date) : new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);

  const handleSave = () => {
    const weightVal = parseLocalizedDecimal(weight);

    // Validate based on unit
    const minVal = units.weight === 'kg' ? 20 : 44;
    const maxVal = units.weight === 'kg' ? 300 : 660;

    if (weightVal === null || weightVal < minVal || weightVal > maxVal) {
      Alert.alert(t('common.error'), t('health.invalidWeightRange', { min: minVal, max: maxVal, unit: units.weight }));
      return;
    }

    // Convert to kg for storage
    const weightInKg = parseWeightToKg(weightVal);

    addWeightMutation.mutate(
      {
        weight_kg: weightInKg,
        measured_at: date.toISOString(),
      },
      {
        onSuccess: () => {
          navigation.goBack();
        },
        onError: (error: unknown) => {
          const err = error as { type?: string; message?: string };
          console.error('Error guardando peso:', error);
          Alert.alert(
            t('common.error'),
            t('health.saveWeightErrorWithDetails', {
              message: err.message || JSON.stringify(error),
            }),
          );
        },
      },
    );
  };

  const onDateChange = (event: DateTimePickerEvent, selectedDate?: Date) => {
    // On Android, always close after selection (popup behavior)
    // On iOS inline, only close when user explicitly taps a date (type 'set')
    if (Platform.OS === 'android' || event.type === 'set') {
      setShowDatePicker(false);
    }

    if (selectedDate) {
      setDate(selectedDate);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1, justifyContent: 'flex-end' }}
      >
        {/* Overlay to close on tap */}
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={() => navigation.goBack()}>
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.65)' }} />
        </TouchableOpacity>

        <View style={[styles.content, { backgroundColor: isDark ? '#1C1C1E' : '#FFFFFF' }]}>
          <View style={styles.headerRow}>
            <Text style={[styles.title, { color: themeColors.textPrimary }]}>{t('health.registerWeight')}</Text>
            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.closeButton}>
              <X size={24} color={themeColors.textSecondary} />
            </TouchableOpacity>
          </View>

          <View style={styles.inputContainer}>
            <TextInput
              style={[styles.input, { color: themeColors.textPrimary, borderBottomColor: themeColors.primary }]}
              value={weight}
              onChangeText={setWeight}
              placeholder="0.0"
              placeholderTextColor={themeColors.textSecondary}
              {...DECIMAL_INPUT_PROPS}
              autoFocus
            />
            <Text style={[styles.unit, { color: themeColors.textSecondary }]}>{units.weight}</Text>
          </View>

          <Text style={[styles.sectionLabel, { color: themeColors.textSecondary }]}>{t('health.recordDate')}</Text>
          <View style={styles.dateSelectorContainer}>
            {/* Quick Action Buttons */}
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
                onPress={() =>
                  setDate(_d => {
                    const newDate = new Date();
                    newDate.setDate(newDate.getDate() - 1);
                    return newDate;
                  })
                }
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
                  isToday(date) && {
                    backgroundColor: themeColors.primary + '20',
                    borderColor: themeColors.primary,
                  },
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

            {/* Date Display with Arrows and Calendar Trigger */}
            <View style={styles.dateDisplayRow}>
              <TouchableOpacity
                onPress={() => setDate(d => new Date(d.setDate(d.getDate() - 1)))}
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
                  {date.toLocaleDateString(getLocaleTag(), {
                    weekday: 'long',
                    day: 'numeric',
                    month: 'long',
                  })}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => setDate(d => new Date(d.setDate(d.getDate() + 1)))}
                style={styles.arrowButton}
                disabled={isToday(date)}
              >
                <ChevronRight size={24} color={isToday(date) ? themeColors.textSecondary : themeColors.primary} />
              </TouchableOpacity>
            </View>
          </View>

          {/* Inline DateTimePicker for iOS */}
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
              disabled={addWeightMutation.isPending}
            >
              <Text style={[styles.cancelText, { color: themeColors.textPrimary }]}>{t('common.cancel')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.saveButton,
                { backgroundColor: themeColors.primary },
                addWeightMutation.isPending && { opacity: 0.8 },
              ]}
              onPress={handleSave}
              disabled={addWeightMutation.isPending}
            >
              {addWeightMutation.isPending ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <Text style={styles.saveText}>{t('common.save')}</Text>
              )}
            </TouchableOpacity>
          </View>

          {/* Android DateTimePicker Logic (Popup) */}
          {showDatePicker && Platform.OS === 'android' && (
            <DateTimePicker value={date} mode="date" display="default" onChange={onDateChange} />
          )}
        </View>
      </KeyboardAvoidingView>

      {/* Duplicate Day Modal removed */}
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
    minWidth: 140,
    textAlign: 'center',
    borderBottomWidth: 2,
  },
  unit: {
    ...typography.h2,
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
  actions: {
    flexDirection: 'row',
    width: '100%',
    justifyContent: 'space-between',
    marginTop: 8,
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
  actionsInline: {
    flexDirection: 'row',
    marginTop: spacing.l,
    marginBottom: spacing.xl,
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
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalContent: {
    width: '100%',
    maxWidth: 320,
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
  },
  modalIconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    ...typography.h3,
    textAlign: 'center',
    marginBottom: 8,
  },
  modalMessage: {
    ...typography.body,
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 22,
  },
  modalButton: {
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 12,
    width: '100%',
    alignItems: 'center',
  },
  modalButtonText: {
    ...typography.body,
    color: '#FFFFFF',
    fontWeight: '600',
  },
});
