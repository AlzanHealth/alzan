import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { AlertTriangle, Calendar, ChevronLeft, ChevronRight } from 'lucide-react-native';
import { formatISO } from 'date-fns';
import { useTranslation } from 'react-i18next';
import { CalendarDatePickerModal } from '../../../components/common/CalendarDatePickerModal';
import { formatLocalizedDate } from '../../../i18n/dateLocale';
import { MEAL_TYPE_LABELS } from '../constants';
import type { MealType } from '../../../types/requests.types';
import { useNutritionStyles } from '../../../hooks/useNutritionStyles';
import { findMealDestinationConflict, type MealDestinationConflict } from '../services/mealMovePlanner';
import type { MealLog } from '../../../types/requests.types';

export type CopyMealDestination = {
  date: string;
  mealType: MealType;
};

type CopyMealModalProps = {
  visible: boolean;
  variant?: 'copy' | 'move';
  sourceName: string;
  initialDate: Date;
  initialMealType?: MealType;
  minimumDate: Date;
  maximumDate: Date;
  mealTypes: MealType[];
  existingMeals?: readonly Pick<MealLog, 'id' | 'date' | 'meal_type' | 'name'>[];
  sourceMealId?: string;
  onCancel: () => void;
  onCopy: (destination: CopyMealDestination) => Promise<void>;
};

type CopyMealStep = 'date' | 'mealType';

const toIsoDate = (date: Date): string => formatISO(date, { representation: 'date' });

const clampDate = (date: Date, minimumDate: Date, maximumDate: Date): Date => {
  if (date < minimumDate) return minimumDate;
  if (date > maximumDate) return maximumDate;
  return date;
};

export const CopyMealModal = ({
  visible,
  variant = 'copy',
  sourceName,
  initialDate,
  initialMealType,
  minimumDate,
  maximumDate,
  mealTypes,
  existingMeals = [],
  sourceMealId,
  onCancel,
  onCopy,
}: CopyMealModalProps) => {
  const { t } = useTranslation();
  const { colors: themeColors, isDark } = useNutritionStyles();
  const [step, setStep] = useState<CopyMealStep>('date');
  const [selectedDate, setSelectedDate] = useState(() => clampDate(initialDate, minimumDate, maximumDate));
  const [selectedMealType, setSelectedMealType] = useState<MealType | null>(mealTypes[0] ?? null);
  const [showNativePicker, setShowNativePicker] = useState(false);
  const [showWebCalendar, setShowWebCalendar] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const mealTypeKey = mealTypes.join('|');
  const titleKey = variant === 'move' ? 'nutrition.moveMealTitle' : 'nutrition.copyMealTitle';
  const actionKey = variant === 'move' ? 'nutrition.moveMealAction' : 'nutrition.copyMealAction';
  const errorKey = variant === 'move' ? 'nutrition.moveMealError' : 'nutrition.copyMealError';
  const cancelKey = variant === 'move' ? 'nutrition.moveMealCancel' : 'nutrition.copyMealCancel';
  const selectedInitialMealType =
    initialMealType && mealTypes.includes(initialMealType) ? initialMealType : (mealTypes[0] ?? null);
  const destinationConflict: MealDestinationConflict | null = useMemo(
    () =>
      selectedMealType
        ? findMealDestinationConflict(
            existingMeals,
            sourceMealId,
            { date: toIsoDate(selectedDate), mealType: selectedMealType },
            variant,
          )
        : null,
    [existingMeals, selectedDate, selectedMealType, sourceMealId, variant],
  );

  useEffect(() => {
    if (!visible) {
      setShowNativePicker(false);
      setShowWebCalendar(false);
      return;
    }

    setStep('date');
    setSelectedDate(clampDate(initialDate, minimumDate, maximumDate));
    setSelectedMealType(selectedInitialMealType);
    setErrorMessage(null);
  }, [initialDate, maximumDate, mealTypeKey, minimumDate, selectedInitialMealType, visible]);

  const selectDate = (date: Date) => {
    setSelectedDate(clampDate(date, minimumDate, maximumDate));
    setShowNativePicker(false);
  };

  const handleContinue = () => {
    if (mealTypes.length === 0) return;
    setErrorMessage(null);
    setStep('mealType');
  };

  const handleCopy = async () => {
    if (!selectedMealType || isSubmitting) return;

    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      await onCopy({ date: toIsoDate(selectedDate), mealType: selectedMealType });
    } catch {
      setErrorMessage(t(errorKey));
    } finally {
      setIsSubmitting(false);
    }
  };

  const selectedDateLabel = useMemo(
    () => formatLocalizedDate(selectedDate, { en: 'EEEE, MMM d', es: "EEEE, d 'de' MMMM" }),
    [selectedDate],
  );

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onCancel}>
      <View style={styles.overlay}>
        <View style={[styles.content, { backgroundColor: themeColors.surfaceSolid }]}>
          <View style={styles.header}>
            <View style={styles.headerCopy}>
              <Text style={[styles.title, { color: themeColors.textPrimary }]}>{t(titleKey)}</Text>
              <Text style={[styles.sourceName, { color: themeColors.textSecondary }]} numberOfLines={2}>
                {sourceName}
              </Text>
            </View>
            <TouchableOpacity
              onPress={onCancel}
              accessibilityRole="button"
              accessibilityLabel={t(cancelKey)}
              style={styles.closeButton}
            >
              <Text style={[styles.closeText, { color: themeColors.textSecondary }]}>×</Text>
            </TouchableOpacity>
          </View>

          {step === 'date' ? (
            <>
              <Text style={[styles.stepLabel, { color: themeColors.primary }]}>{t('nutrition.copyMealDateStep')}</Text>
              <TouchableOpacity
                style={[styles.dateButton, { borderColor: themeColors.border }]}
                onPress={() => {
                  if (Platform.OS === 'web') setShowWebCalendar(true);
                  else setShowNativePicker(true);
                }}
                accessibilityRole="button"
                accessibilityLabel={selectedDateLabel}
              >
                <Calendar size={20} color={themeColors.primary} />
                <View style={styles.dateCopy}>
                  <Text style={[styles.dateValue, { color: themeColors.textPrimary }]}>{selectedDateLabel}</Text>
                  <Text style={[styles.dateHint, { color: themeColors.textSecondary }]}>
                    {t('nutrition.copyMealDateStep')}
                  </Text>
                </View>
                <ChevronRight size={20} color={themeColors.textSecondary} />
              </TouchableOpacity>

              {showNativePicker && Platform.OS !== 'web' ? (
                <DateTimePicker
                  value={selectedDate}
                  mode="date"
                  display="default"
                  minimumDate={minimumDate}
                  maximumDate={maximumDate}
                  themeVariant={isDark ? 'dark' : 'light'}
                  onChange={(_event, date) => {
                    if (date) selectDate(date);
                    else setShowNativePicker(false);
                  }}
                />
              ) : null}

              {Platform.OS === 'web' ? (
                <CalendarDatePickerModal
                  visible={showWebCalendar}
                  value={selectedDate}
                  title={t('nutrition.copyMealDateStep')}
                  minimumDate={minimumDate}
                  maximumDate={maximumDate}
                  onCancel={() => setShowWebCalendar(false)}
                  onConfirm={date => {
                    selectDate(date);
                    setShowWebCalendar(false);
                  }}
                />
              ) : null}

              <Text style={[styles.rangeHint, { color: themeColors.textSecondary }]}>
                {formatLocalizedDate(minimumDate, { en: 'MMM d, yyyy', es: "d 'de' MMM yyyy" })} –{' '}
                {formatLocalizedDate(maximumDate, { en: 'MMM d, yyyy', es: "d 'de' MMM yyyy" })}
              </Text>

              <View style={styles.actions}>
                <TouchableOpacity onPress={onCancel} style={styles.secondaryButton}>
                  <Text style={[styles.secondaryButtonText, { color: themeColors.textSecondary }]}>{t(cancelKey)}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleContinue}
                  disabled={mealTypes.length === 0}
                  style={[styles.primaryButton, { backgroundColor: themeColors.primary }]}
                >
                  <Text style={styles.primaryButtonText}>{t('nutrition.copyMealContinue')}</Text>
                </TouchableOpacity>
              </View>
            </>
          ) : (
            <>
              <View style={styles.stepHeader}>
                <TouchableOpacity
                  onPress={() => setStep('date')}
                  style={styles.backButton}
                  accessibilityRole="button"
                  accessibilityLabel={t('nutrition.copyMealBack')}
                >
                  <ChevronLeft size={18} color={themeColors.primary} />
                  <Text style={[styles.backText, { color: themeColors.primary }]}>{t('nutrition.copyMealBack')}</Text>
                </TouchableOpacity>
                <Text style={[styles.stepLabel, { color: themeColors.primary }]}>
                  {t('nutrition.copyMealTypeStep')}
                </Text>
              </View>

              <Text style={[styles.selectedDate, { color: themeColors.textSecondary }]}>{selectedDateLabel}</Text>
              <ScrollView contentContainerStyle={styles.mealTypes} showsVerticalScrollIndicator={false}>
                {mealTypes.map(mealType => {
                  const isSelected = mealType === selectedMealType;
                  return (
                    <Pressable
                      key={mealType}
                      onPress={() => setSelectedMealType(mealType)}
                      disabled={isSubmitting}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: isSelected }}
                      style={[
                        styles.mealTypeButton,
                        { borderColor: isSelected ? themeColors.primary : themeColors.border },
                        isSelected && { backgroundColor: themeColors.primary + '14' },
                      ]}
                    >
                      <Text
                        style={[
                          styles.mealTypeText,
                          { color: isSelected ? themeColors.primary : themeColors.textPrimary },
                        ]}
                      >
                        {t(MEAL_TYPE_LABELS[mealType])}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>

              {destinationConflict ? (
                <View
                  style={[
                    styles.conflictBanner,
                    { backgroundColor: themeColors.warning + '16', borderColor: themeColors.warning + '55' },
                  ]}
                >
                  <AlertTriangle size={20} color={themeColors.warning} />
                  <View style={styles.conflictCopy}>
                    <Text style={[styles.conflictTitle, { color: themeColors.textPrimary }]}>
                      {t('nutrition.mealTransferConflictTitle')}
                    </Text>
                    <Text style={[styles.conflictMessage, { color: themeColors.textSecondary }]}>
                      {t('nutrition.mealTransferConflictMessage', {
                        mealType: t(MEAL_TYPE_LABELS[selectedMealType ?? mealTypes[0]]),
                        existingMeal: destinationConflict.existingMealNames[0],
                        count: destinationConflict.count,
                      })}
                    </Text>
                  </View>
                </View>
              ) : null}

              {errorMessage ? <Text style={[styles.error, { color: themeColors.danger }]}>{errorMessage}</Text> : null}

              <View style={styles.actions}>
                <TouchableOpacity onPress={onCancel} disabled={isSubmitting} style={styles.secondaryButton}>
                  <Text style={[styles.secondaryButtonText, { color: themeColors.textSecondary }]}>{t(cancelKey)}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleCopy}
                  disabled={!selectedMealType || isSubmitting}
                  style={[
                    styles.primaryButton,
                    { backgroundColor: themeColors.primary },
                    isSubmitting && styles.disabled,
                  ]}
                >
                  {isSubmitting ? (
                    <ActivityIndicator color="#FFFFFF" size="small" />
                  ) : (
                    <Text style={styles.primaryButtonText}>{t(actionKey)}</Text>
                  )}
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.42)',
  },
  content: {
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    paddingHorizontal: 22,
    paddingTop: 20,
    paddingBottom: 30,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 20,
  },
  headerCopy: { flex: 1 },
  title: { fontSize: 22, fontWeight: '800' },
  sourceName: { fontSize: 14, marginTop: 5 },
  closeButton: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  closeText: { fontSize: 30, lineHeight: 32, fontWeight: '300' },
  stepHeader: { marginBottom: 8 },
  stepLabel: { fontSize: 18, fontWeight: '800', marginBottom: 14 },
  backButton: { flexDirection: 'row', alignItems: 'center', minHeight: 44, alignSelf: 'flex-start' },
  backText: { fontSize: 14, fontWeight: '700', marginLeft: 2 },
  dateButton: {
    minHeight: 74,
    borderWidth: 1,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  dateCopy: { flex: 1, marginHorizontal: 12 },
  dateValue: { fontSize: 17, fontWeight: '700' },
  dateHint: { fontSize: 12, marginTop: 4 },
  rangeHint: { fontSize: 12, marginTop: 10 },
  selectedDate: { fontSize: 14, marginBottom: 12 },
  mealTypes: { gap: 10, paddingBottom: 6 },
  mealTypeButton: {
    minHeight: 52,
    borderWidth: 1,
    borderRadius: 14,
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  mealTypeText: { fontSize: 16, fontWeight: '700' },
  error: { fontSize: 13, lineHeight: 18, marginTop: 10 },
  conflictBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    marginTop: 12,
  },
  conflictCopy: { flex: 1 },
  conflictTitle: { fontSize: 14, fontWeight: '800' },
  conflictMessage: { fontSize: 13, lineHeight: 18, marginTop: 3 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 22 },
  secondaryButton: { minHeight: 48, minWidth: 92, alignItems: 'center', justifyContent: 'center' },
  secondaryButtonText: { fontSize: 15, fontWeight: '700' },
  primaryButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  primaryButtonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
  disabled: { opacity: 0.55 },
});
