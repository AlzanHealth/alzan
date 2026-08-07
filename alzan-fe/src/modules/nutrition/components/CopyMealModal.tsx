import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react-native';
import { formatISO, isValid, parseISO } from 'date-fns';
import { useTranslation } from 'react-i18next';
import { formatLocalizedDate } from '../../../i18n/dateLocale';
import { MEAL_TYPE_LABELS } from '../constants';
import type { MealType } from '../../../types/requests.types';
import { useNutritionStyles } from '../../../hooks/useNutritionStyles';

export type CopyMealDestination = {
  date: string;
  mealType: MealType;
};

type CopyMealModalProps = {
  visible: boolean;
  sourceName: string;
  initialDate: Date;
  minimumDate: Date;
  maximumDate: Date;
  mealTypes: MealType[];
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
  sourceName,
  initialDate,
  minimumDate,
  maximumDate,
  mealTypes,
  onCancel,
  onCopy,
}: CopyMealModalProps) => {
  const { t } = useTranslation();
  const { colors: themeColors, isDark } = useNutritionStyles();
  const [step, setStep] = useState<CopyMealStep>('date');
  const [selectedDate, setSelectedDate] = useState(() => clampDate(initialDate, minimumDate, maximumDate));
  const [selectedMealType, setSelectedMealType] = useState<MealType | null>(mealTypes[0] ?? null);
  const [showNativePicker, setShowNativePicker] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const mealTypeKey = mealTypes.join('|');

  useEffect(() => {
    if (!visible) {
      setShowNativePicker(false);
      return;
    }

    setStep('date');
    setSelectedDate(clampDate(initialDate, minimumDate, maximumDate));
    setSelectedMealType(mealTypes[0] ?? null);
    setErrorMessage(null);
  }, [initialDate, maximumDate, mealTypeKey, minimumDate, visible]);

  const openWebPicker = useCallback(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;

    const input = document.createElement('input');
    input.type = 'date';
    input.value = toIsoDate(selectedDate);
    input.min = toIsoDate(minimumDate);
    input.max = toIsoDate(maximumDate);
    input.style.position = 'fixed';
    input.style.left = '-9999px';
    input.style.opacity = '0';

    const cleanup = () => {
      input.removeEventListener('change', handleChange);
      input.removeEventListener('blur', cleanup);
      input.remove();
    };
    const handleChange = () => {
      const nextDate = parseISO(input.value);
      if (input.value && isValid(nextDate)) {
        setSelectedDate(clampDate(nextDate, minimumDate, maximumDate));
      }
      cleanup();
    };

    input.addEventListener('change', handleChange);
    input.addEventListener('blur', cleanup);
    document.body.appendChild(input);
    try {
      if (typeof input.showPicker === 'function') input.showPicker();
      else input.click();
    } catch {
      input.click();
    }
  }, [maximumDate, minimumDate, selectedDate]);

  const selectDate = useCallback(
    (date: Date) => {
      setSelectedDate(clampDate(date, minimumDate, maximumDate));
      setShowNativePicker(false);
    },
    [maximumDate, minimumDate],
  );

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
      setErrorMessage(t('nutrition.copyMealError'));
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
              <Text style={[styles.title, { color: themeColors.textPrimary }]}>{t('nutrition.copyMealTitle')}</Text>
              <Text style={[styles.sourceName, { color: themeColors.textSecondary }]} numberOfLines={2}>
                {sourceName}
              </Text>
            </View>
            <TouchableOpacity
              onPress={onCancel}
              accessibilityRole="button"
              accessibilityLabel={t('nutrition.copyMealCancel')}
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
                  if (Platform.OS === 'web') openWebPicker();
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

              <Text style={[styles.rangeHint, { color: themeColors.textSecondary }]}>
                {formatLocalizedDate(minimumDate, { en: 'MMM d, yyyy', es: "d 'de' MMM yyyy" })} –{' '}
                {formatLocalizedDate(maximumDate, { en: 'MMM d, yyyy', es: "d 'de' MMM yyyy" })}
              </Text>

              <View style={styles.actions}>
                <TouchableOpacity onPress={onCancel} style={styles.secondaryButton}>
                  <Text style={[styles.secondaryButtonText, { color: themeColors.textSecondary }]}>
                    {t('nutrition.copyMealCancel')}
                  </Text>
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

              {errorMessage ? <Text style={[styles.error, { color: themeColors.danger }]}>{errorMessage}</Text> : null}

              <View style={styles.actions}>
                <TouchableOpacity onPress={onCancel} disabled={isSubmitting} style={styles.secondaryButton}>
                  <Text style={[styles.secondaryButtonText, { color: themeColors.textSecondary }]}>
                    {t('nutrition.copyMealCancel')}
                  </Text>
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
                    <Text style={styles.primaryButtonText}>{t('nutrition.copyMealAction')}</Text>
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
