import React, { useEffect, useMemo, useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Calendar, ChevronRight, X } from 'lucide-react-native';
import { addDays, formatISO, subDays } from 'date-fns';
import { useTranslation } from 'react-i18next';
import { CalendarDatePickerModal } from '../../../components/common/CalendarDatePickerModal';
import { formatLocalizedDate } from '../../../i18n/dateLocale';
import { useNutritionStyles } from '../../../hooks/useNutritionStyles';
import { getInclusiveMealRangeDays, validateMealRange, type MealRange } from '../services/mealBatchPlanner';

export type MealBatchModalMode = 'selection' | 'day' | 'range';
export type MealBatchModalOperation = 'copy' | 'move';
export type MealBatchModalValues = {
  destinationDate?: string;
  sourceStartDate?: string;
  sourceEndDate?: string;
  destinationStartDate?: string;
};

type MealBatchActionModalProps = {
  visible: boolean;
  mode: MealBatchModalMode;
  operation: MealBatchModalOperation;
  selectedCount?: number;
  sourceDate: Date;
  initialDestinationDate: Date;
  initialSourceEndDate?: Date;
  minimumDate: Date;
  maximumDate: Date;
  onCancel: () => void;
  onSubmit: (values: MealBatchModalValues) => Promise<void>;
};

type DateField = 'destination' | 'sourceStart' | 'sourceEnd' | 'destinationStart';

const toIsoDate = (date: Date): string => formatISO(date, { representation: 'date' });
const clampDate = (date: Date, minimumDate: Date, maximumDate: Date): Date => {
  if (date < minimumDate) return new Date(minimumDate);
  if (date > maximumDate) return new Date(maximumDate);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
};

export const MealBatchActionModal = ({
  visible,
  mode,
  operation,
  selectedCount = 0,
  sourceDate,
  initialDestinationDate,
  initialSourceEndDate,
  minimumDate,
  maximumDate,
  onCancel,
  onSubmit,
}: MealBatchActionModalProps) => {
  const { t } = useTranslation();
  const { colors, isDark } = useNutritionStyles();
  const [destinationDate, setDestinationDate] = useState(initialDestinationDate);
  const [sourceStartDate, setSourceStartDate] = useState(sourceDate);
  const [sourceEndDate, setSourceEndDate] = useState(initialSourceEndDate ?? sourceDate);
  const [destinationStartDate, setDestinationStartDate] = useState(initialDestinationDate);
  const [activeField, setActiveField] = useState<DateField | null>(null);
  const [showNativePicker, setShowNativePicker] = useState(false);
  const [showWebCalendar, setShowWebCalendar] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) {
      setShowNativePicker(false);
      setShowWebCalendar(false);
      setActiveField(null);
      return;
    }
    setDestinationDate(clampDate(initialDestinationDate, minimumDate, maximumDate));
    setSourceStartDate(clampDate(sourceDate, minimumDate, maximumDate));
    setSourceEndDate(clampDate(initialSourceEndDate ?? sourceDate, minimumDate, maximumDate));
    setDestinationStartDate(clampDate(initialDestinationDate, minimumDate, maximumDate));
    setErrorMessage(null);
  }, [initialDestinationDate, initialSourceEndDate, maximumDate, minimumDate, sourceDate, visible]);

  const title = useMemo(() => {
    if (mode === 'day') return t('nutrition.duplicateDayTitle');
    if (mode === 'selection') {
      return operation === 'copy' ? t('nutrition.batchCopyTitle') : t('nutrition.batchMoveTitle');
    }
    return operation === 'copy' ? t('nutrition.batchCopyRangeTitle') : t('nutrition.batchMoveRangeTitle');
  }, [mode, operation, t]);

  const currentDateForField = (field: DateField): Date => {
    if (field === 'destination') return destinationDate;
    if (field === 'sourceStart') return sourceStartDate;
    if (field === 'sourceEnd') return sourceEndDate;
    return destinationStartDate;
  };

  const getFieldBounds = (field: DateField): { minimum: Date; maximum: Date } => {
    if (field === 'sourceEnd') {
      return { minimum: sourceStartDate, maximum: clampDate(addDays(sourceStartDate, 29), minimumDate, maximumDate) };
    }
    if (field === 'destinationStart' && mode === 'range') {
      const days = (() => {
        try {
          return getInclusiveMealRangeDays({
            startDate: toIsoDate(sourceStartDate),
            endDate: toIsoDate(sourceEndDate),
          });
        } catch {
          return 1;
        }
      })();
      return { minimum: minimumDate, maximum: clampDate(subDays(maximumDate, days - 1), minimumDate, maximumDate) };
    }
    return { minimum: minimumDate, maximum: maximumDate };
  };

  const openDatePicker = (field: DateField) => {
    setActiveField(field);
    if (Platform.OS === 'web') setShowWebCalendar(true);
    else setShowNativePicker(true);
  };

  const selectDate = (date: Date) => {
    if (!activeField) return;
    const bounds = getFieldBounds(activeField);
    const nextDate = clampDate(date, bounds.minimum, bounds.maximum);
    if (activeField === 'destination') setDestinationDate(nextDate);
    if (activeField === 'sourceStart') {
      setSourceStartDate(nextDate);
      if (sourceEndDate < nextDate) setSourceEndDate(nextDate);
    }
    if (activeField === 'sourceEnd') setSourceEndDate(nextDate);
    if (activeField === 'destinationStart') setDestinationStartDate(nextDate);
    setShowNativePicker(false);
    setShowWebCalendar(false);
    setActiveField(null);
  };

  const submit = async () => {
    if (isSubmitting) return;
    if (mode === 'selection' && selectedCount === 0) {
      setErrorMessage(t('nutrition.batchSelectAtLeastOne'));
      return;
    }

    const range: MealRange = { startDate: toIsoDate(sourceStartDate), endDate: toIsoDate(sourceEndDate) };
    if (mode === 'range') {
      try {
        validateMealRange(range);
      } catch {
        setErrorMessage(t('nutrition.batchRangeLimit'));
        return;
      }
    }

    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      await onSubmit(
        mode === 'range'
          ? {
              sourceStartDate: range.startDate,
              sourceEndDate: range.endDate,
              destinationStartDate: toIsoDate(destinationStartDate),
            }
          : { destinationDate: toIsoDate(destinationDate) },
      );
    } catch {
      setErrorMessage(t('nutrition.batchError'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderDateButton = (field: DateField, label: string) => {
    const date = currentDateForField(field);
    return (
      <TouchableOpacity
        key={field}
        style={[
          styles.dateButton,
          { borderColor: colors.border, backgroundColor: isDark ? colors.background : '#FAFAFC' },
        ]}
        onPress={() => openDatePicker(field)}
        disabled={isSubmitting}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${formatLocalizedDate(date, { en: 'EEEE, MMM d, yyyy', es: "EEEE, d 'de' MMMM 'de' yyyy" })}`}
      >
        <Calendar size={20} color={colors.primary} />
        <View style={styles.dateCopy}>
          <Text style={[styles.dateLabel, { color: colors.textSecondary }]}>{label}</Text>
          <Text style={[styles.dateValue, { color: colors.textPrimary }]}>
            {formatLocalizedDate(date, { en: 'EEEE, MMM d, yyyy', es: "EEEE, d 'de' MMMM 'de' yyyy" })}
          </Text>
        </View>
        <ChevronRight size={20} color={colors.textSecondary} />
      </TouchableOpacity>
    );
  };

  const pickerBounds = activeField ? getFieldBounds(activeField) : { minimum: minimumDate, maximum: maximumDate };
  const pickerDate = activeField ? currentDateForField(activeField) : destinationDate;
  const pickerTitle =
    activeField === 'sourceStart'
      ? t('nutrition.batchSourceStart')
      : activeField === 'sourceEnd'
        ? t('nutrition.batchSourceEnd')
        : activeField === 'destinationStart'
          ? t('nutrition.batchDestinationStart')
          : t('nutrition.batchDestinationDate');

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel} statusBarTranslucent>
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onCancel} accessibilityLabel={t('common.cancel')} />
        <View style={[styles.content, { backgroundColor: colors.surfaceSolid }]}>
          <View style={styles.header}>
            <View style={styles.headerCopy}>
              <Text style={[styles.title, { color: colors.textPrimary }]}>{title}</Text>
              {mode === 'selection' ? (
                <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
                  {t('nutrition.selectedMealsCount', { count: selectedCount })}
                </Text>
              ) : null}
            </View>
            <TouchableOpacity onPress={onCancel} style={styles.closeButton} accessibilityLabel={t('common.close')}>
              <X size={22} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {mode === 'range' ? (
            <>
              {renderDateButton('sourceStart', t('nutrition.batchSourceStart'))}
              {renderDateButton('sourceEnd', t('nutrition.batchSourceEnd'))}
              {renderDateButton('destinationStart', t('nutrition.batchDestinationStart'))}
              <Text style={[styles.hint, { color: colors.textSecondary }]}>{t('nutrition.batchOperationWarning')}</Text>
            </>
          ) : (
            <>
              {renderDateButton('destination', t('nutrition.batchDestinationDate'))}
              <Text style={[styles.hint, { color: colors.textSecondary }]}>
                {mode === 'day' ? t('nutrition.duplicateDayDescription') : t('nutrition.batchOperationWarning')}
              </Text>
            </>
          )}

          {errorMessage ? <Text style={[styles.error, { color: colors.danger }]}>{errorMessage}</Text> : null}
          <View style={styles.actions}>
            <TouchableOpacity onPress={onCancel} style={[styles.secondaryButton, { borderColor: colors.border }]}>
              <Text style={[styles.secondaryText, { color: colors.textSecondary }]}>{t('common.cancel')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={submit}
              disabled={isSubmitting}
              style={[styles.primaryButton, { backgroundColor: colors.primary }, isSubmitting && styles.disabled]}
            >
              <Text style={styles.primaryText}>
                {mode === 'day'
                  ? t('nutrition.duplicateDayAction')
                  : operation === 'copy'
                    ? t('nutrition.batchCopyAction')
                    : t('nutrition.batchMoveAction')}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {showNativePicker && activeField && Platform.OS !== 'web' ? (
        <DateTimePicker
          value={pickerDate}
          mode="date"
          display="default"
          minimumDate={pickerBounds.minimum}
          maximumDate={pickerBounds.maximum}
          themeVariant={isDark ? 'dark' : 'light'}
          onChange={(_event, date) => {
            if (date) selectDate(date);
            else setShowNativePicker(false);
          }}
        />
      ) : null}

      {Platform.OS === 'web' && activeField ? (
        <CalendarDatePickerModal
          visible={showWebCalendar}
          value={pickerDate}
          title={pickerTitle}
          minimumDate={pickerBounds.minimum}
          maximumDate={pickerBounds.maximum}
          onCancel={() => {
            setShowWebCalendar(false);
            setActiveField(null);
          }}
          onConfirm={selectDate}
        />
      ) : null}
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.48)' },
  content: {
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    padding: 18,
    paddingBottom: 24,
  },
  header: { minHeight: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerCopy: { flex: 1 },
  title: { fontSize: 20, fontWeight: '800' },
  subtitle: { fontSize: 14, marginTop: 4 },
  closeButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  dateButton: {
    minHeight: 68,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 14,
    marginTop: 10,
    gap: 12,
  },
  dateCopy: { flex: 1 },
  dateLabel: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase' },
  dateValue: { fontSize: 15, fontWeight: '700', marginTop: 3 },
  hint: { fontSize: 13, lineHeight: 19, marginTop: 12 },
  error: { fontSize: 14, fontWeight: '600', marginTop: 12 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 18 },
  secondaryButton: {
    flex: 1,
    minHeight: 50,
    borderWidth: 1,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButton: { flex: 1, minHeight: 50, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  secondaryText: { fontSize: 15, fontWeight: '700' },
  primaryText: { color: '#FFF', fontSize: 15, fontWeight: '800' },
  disabled: { opacity: 0.55 },
});
