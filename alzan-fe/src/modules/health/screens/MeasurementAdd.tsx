import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Platform,
  KeyboardAvoidingView,
  Modal,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { HealthScreenNavigationProp, HealthStackParamList } from '../../../types/navigation.types';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, Info, X, AlertTriangle } from 'lucide-react-native';
import { typography, spacing } from '../../../theme';
import { useAddMeasurement } from '../hooks/useMeasurements';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useHealthStyles } from '../../../hooks/useHealthStyles';
import { LinearGradient } from 'expo-linear-gradient';
import { MeasurementType } from '../../../types/requests.types';
import { Alert } from '../../../components/common/Alert';
import { useTranslation } from 'react-i18next';
import { getLocaleTag } from '../../../i18n/dateLocale';
import { TranslationKey } from '../../../i18n/locales/en';
import { DECIMAL_INPUT_PROPS, parseLocalizedDecimal } from '../../../utils/numericInput';

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

export type MeasurementAddParams = {
  key: MeasurementType;
  labelKey: TranslationKey;
  tipKey: TranslationKey;
  color: string;
};

const MEASUREMENT_TYPES: MeasurementAddParams[] = [
  {
    key: 'abdomen',
    labelKey: 'health.abdomen',
    tipKey: 'health.measureTipAbdomen',
    color: '#10B981',
  },
  {
    key: 'hips',
    labelKey: 'health.hips',
    tipKey: 'health.measureTipHips',
    color: '#F59E0B',
  },
  {
    key: 'chest',
    labelKey: 'health.chest',
    tipKey: 'health.measureTipChest',
    color: '#3B82F6',
  },
  {
    key: 'arm',
    labelKey: 'health.arm',
    tipKey: 'health.measureTipArm',
    color: '#8B5CF6',
  },
  {
    key: 'thigh',
    labelKey: 'health.thigh',
    tipKey: 'health.measureTipThigh',
    color: '#EC4899',
  },
];

export const MeasurementAdd = () => {
  const { t } = useTranslation();
  const navigation = useNavigation<HealthScreenNavigationProp>();
  const route = useRoute<RouteProp<HealthStackParamList, 'MeasurementAdd'>>();
  const addMutation = useAddMeasurement();
  const { styles: dynamicStyles, colors: themeColors, isDark } = useHealthStyles();

  const [type, setType] = useState<MeasurementType>(route.params?.defaultType || 'abdomen');
  const [value, setValue] = useState('');
  const [date, setDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showDuplicateModal, setShowDuplicateModal] = useState(false);

  const currentMeasurement = MEASUREMENT_TYPES.find(m => m.key === type);

  if (!currentMeasurement) {
    return null;
  }

  const handleSave = () => {
    const val = parseLocalizedDecimal(value);
    if (val === null || val < 10 || val > 200) {
      Alert.alert(t('common.error'), t('health.invalidMeasurementRange'));
      return;
    }

    addMutation.mutate(
      {
        measurement_type: type,
        value_cm: val,
        measured_at: date.toISOString(),
      },
      {
        onSuccess: () => navigation.goBack(),
        onError: (error: unknown) => {
          const errorType = typeof error === 'object' && error !== null ? Reflect.get(error, 'type') : undefined;
          const errorMessage = typeof error === 'object' && error !== null ? Reflect.get(error, 'message') : undefined;

          // Check for duplicate day error (expected case, not a real error)
          if (errorType === 'DUPLICATE_DAY' || errorMessage === 'DUPLICATE_DAY') {
            setShowDuplicateModal(true);
            return;
          }

          console.error('Error guardando medida:', error);
          Alert.alert(t('common.error'), t('health.saveMeasurementError'));
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
    <LinearGradient colors={dynamicStyles.gradientColors} style={styles.container}>
      <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
        {/* Header */}
        <View style={[styles.header, { borderBottomColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)' }]}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.closeButton}>
            <X size={24} color={themeColors.textPrimary} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: themeColors.textPrimary }]}>
            {t('health.registerMeasureTitle')}
          </Text>
          <View style={styles.headerSpacer} />
        </View>

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.keyboardView}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 10 : 0}
        >
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {/* Type Selector */}
            <Text style={[styles.sectionLabel, { color: themeColors.textSecondary }]}>{t('health.measureType')}</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.typeScroll}
              contentContainerStyle={styles.typeScrollContent}
            >
              {MEASUREMENT_TYPES.map(measurement => (
                <TouchableOpacity
                  key={measurement.key}
                  style={[
                    styles.typeButton,
                    { backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)' },
                    type === measurement.key && {
                      backgroundColor: measurement.color + '20',
                      borderColor: measurement.color,
                    },
                  ]}
                  onPress={() => setType(measurement.key)}
                >
                  <Text
                    style={[
                      styles.typeText,
                      { color: themeColors.textSecondary },
                      type === measurement.key && { color: measurement.color, fontWeight: '700' },
                    ]}
                  >
                    {String(t(measurement.labelKey))}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* Value Input */}
            <View style={styles.inputSection}>
              <Text style={[styles.sectionLabel, { color: themeColors.textSecondary }]}>{t('health.measure')}</Text>
              <View style={styles.inputContainer}>
                <TextInput
                  style={[styles.input, { color: themeColors.textPrimary, borderBottomColor: themeColors.primary }]}
                  value={value}
                  onChangeText={setValue}
                  placeholder="0.0"
                  placeholderTextColor={themeColors.textSecondary}
                  {...DECIMAL_INPUT_PROPS}
                />
                <Text style={[styles.unit, { color: themeColors.textSecondary }]}>{t('health.cm')}</Text>
              </View>
            </View>

            {/* Date Selector */}
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

            {/* Measurement Tip - at the bottom */}
            <View
              style={[
                styles.tipBox,
                {
                  borderLeftColor: currentMeasurement.color,
                  backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.03)',
                },
              ]}
            >
              <Info size={18} color={currentMeasurement.color} style={styles.tipIcon} />
              <Text style={[styles.tipText, { color: themeColors.textPrimary }]}>
                {String(t(currentMeasurement.tipKey))}
              </Text>
            </View>

            {/* Actions - inside ScrollView for better keyboard behavior */}
            <View style={styles.actionsInline}>
              <TouchableOpacity
                style={[
                  styles.cancelButton,
                  { backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)' },
                ]}
                onPress={() => navigation.goBack()}
              >
                <Text style={[styles.cancelText, { color: themeColors.textPrimary }]}>{t('common.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.saveButton, { backgroundColor: currentMeasurement.color }]}
                onPress={handleSave}
              >
                <Text style={styles.saveText}>{t('common.save')}</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>

        {/* Android DateTimePicker Logic (Popup) */}
        {showDatePicker && Platform.OS === 'android' && (
          <DateTimePicker value={date} mode="date" display="default" onChange={onDateChange} />
        )}
      </SafeAreaView>

      {/* Duplicate Day Modal */}
      <Modal
        visible={showDuplicateModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowDuplicateModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: isDark ? '#2C2C2E' : '#FFFFFF' }]}>
            <View style={[styles.modalIconContainer, { backgroundColor: currentMeasurement.color + '20' }]}>
              <AlertTriangle size={32} color={currentMeasurement.color} />
            </View>
            <Text style={[styles.modalTitle, { color: themeColors.textPrimary }]}>{t('common.recordExists')}</Text>
            <Text style={[styles.modalMessage, { color: themeColors.textSecondary }]}>
              {t('health.overwriteMeasureStart')}
              {String(t(currentMeasurement.labelKey)).toLowerCase()}
              {t('health.overwriteMeasureEnd')}
            </Text>
            <TouchableOpacity
              style={[styles.modalButton, { backgroundColor: currentMeasurement.color }]}
              onPress={() => setShowDuplicateModal(false)}
            >
              <Text style={styles.modalButtonText}>{t('common.gotIt')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.m,
    paddingVertical: spacing.s,
    borderBottomWidth: 1,
  },
  closeButton: {
    padding: 8,
  },
  headerTitle: {
    ...typography.h3,
  },
  headerSpacer: {
    width: 40,
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    padding: spacing.m,
    paddingBottom: 100,
  },
  sectionLabel: {
    ...typography.caption,
    marginBottom: spacing.xs,
    marginTop: spacing.m,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  typeScroll: {
    marginBottom: spacing.m,
  },
  typeScrollContent: {
    paddingRight: spacing.m,
  },
  typeButton: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 20,
    marginRight: 10,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  typeText: {
    ...typography.body,
    fontWeight: '500',
  },
  tipBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: spacing.m,
    borderRadius: 12,
    borderLeftWidth: 4,
    marginBottom: spacing.l,
  },
  tipIcon: {
    marginRight: spacing.s,
    marginTop: 2,
  },
  tipText: {
    ...typography.body,
    flex: 1,
    lineHeight: 22,
  },
  inputSection: {
    alignItems: 'center',
    marginBottom: spacing.l,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
  },
  input: {
    fontSize: 56,
    fontWeight: '700',
    borderBottomWidth: 2,
    paddingHorizontal: 12,
    minWidth: 140,
    textAlign: 'center',
  },
  unit: {
    ...typography.h2,
    marginLeft: 8,
  },
  dateSelectorContainer: {
    marginBottom: spacing.l,
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
