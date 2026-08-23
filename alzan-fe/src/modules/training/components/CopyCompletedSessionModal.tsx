import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Calendar, ChevronRight } from 'lucide-react-native';
import { formatISO, isValid, parseISO } from 'date-fns';
import { useTranslation } from 'react-i18next';
import { formatLocalizedDate } from '../../../i18n/dateLocale';
import { useTrainingStyles } from '../../../hooks/useTrainingStyles';
import { useCopyTargetSessionCount } from '../hooks/useCopyCompletedSession';
import { validateCopyTargetDate } from '../helpers/copyCompletedSession.helper';

type CopyCompletedSessionModalProps = {
  visible: boolean;
  sourceName: string;
  sourceDate: string;
  initialDate: Date;
  onCancel: () => void;
  onCopy: (targetDate: string) => Promise<void>;
};

const toIsoDate = (date: Date): string => formatISO(date, { representation: 'date' });

export const CopyCompletedSessionModal = ({
  visible,
  sourceName,
  sourceDate,
  initialDate,
  onCancel,
  onCopy,
}: CopyCompletedSessionModalProps) => {
  const { t } = useTranslation();
  const { colors: themeColors, isDark } = useTrainingStyles();
  const [selectedDate, setSelectedDate] = useState(initialDate);
  const [showNativePicker, setShowNativePicker] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const targetDate = toIsoDate(selectedDate);
  const targetCount = useCopyTargetSessionCount(visible ? targetDate : null);
  const validation = validateCopyTargetDate({ sourceDate, targetDate });
  const selectedDateLabel = useMemo(
    () => formatLocalizedDate(selectedDate, { en: 'EEEE, MMM d', es: "EEEE, d 'de' MMMM" }),
    [selectedDate],
  );

  useEffect(() => {
    if (!visible) {
      setShowNativePicker(false);
      return;
    }
    setSelectedDate(initialDate);
    setErrorMessage(null);
  }, [initialDate, visible]);

  const openWebPicker = useCallback(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;

    const input = document.createElement('input');
    input.type = 'date';
    input.value = targetDate;
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
        if (input.value === sourceDate) setErrorMessage(t('training.copyCompletedSessionSameDate'));
        else {
          setSelectedDate(nextDate);
          setErrorMessage(null);
        }
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
  }, [sourceDate, t, targetDate]);

  const handleCopy = async () => {
    if (isSubmitting) return;
    if (!validation.ok) {
      setErrorMessage(
        validation.reason === 'same_date'
          ? t('training.copyCompletedSessionSameDate')
          : t('training.copyCompletedSessionInvalidDate'),
      );
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      await onCopy(targetDate);
    } catch {
      setErrorMessage(t('training.copyCompletedSessionError'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onCancel}>
      <View style={styles.overlay}>
        <View style={[styles.content, { backgroundColor: themeColors.surfaceSolid }]}>
          <View style={styles.header}>
            <View style={styles.headerCopy}>
              <Text style={[styles.title, { color: themeColors.textPrimary }]}>
                {t('training.copyCompletedSessionTitle')}
              </Text>
              <Text style={[styles.sourceName, { color: themeColors.textSecondary }]} numberOfLines={2}>
                {sourceName}
              </Text>
            </View>
            <TouchableOpacity
              onPress={onCancel}
              accessibilityRole="button"
              accessibilityLabel={t('training.copyCompletedSessionCancel')}
              style={styles.closeButton}
            >
              <Text style={[styles.closeText, { color: themeColors.textSecondary }]}>×</Text>
            </TouchableOpacity>
          </View>

          <Text style={[styles.stepLabel, { color: themeColors.primary }]}>
            {t('training.copyCompletedSessionDate')}
          </Text>
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
                {t('training.copyCompletedSessionSourceDate', { date: sourceDate })}
              </Text>
            </View>
            <ChevronRight size={20} color={themeColors.textSecondary} />
          </TouchableOpacity>

          {showNativePicker && Platform.OS !== 'web' ? (
            <DateTimePicker
              value={selectedDate}
              mode="date"
              display="default"
              themeVariant={isDark ? 'dark' : 'light'}
              onChange={(_event, date) => {
                if (date) {
                  if (toIsoDate(date) === sourceDate) setErrorMessage(t('training.copyCompletedSessionSameDate'));
                  else {
                    setSelectedDate(date);
                    setErrorMessage(null);
                  }
                } else setShowNativePicker(false);
              }}
            />
          ) : null}

          {targetCount.isLoading ? (
            <ActivityIndicator style={styles.conflictLoading} size="small" color={themeColors.primary} />
          ) : targetCount.data && targetCount.data > 0 ? (
            <Text style={[styles.warning, { color: themeColors.warning }]}>
              {t('training.copyCompletedSessionConflict', { count: targetCount.data })}
            </Text>
          ) : null}

          {errorMessage ? <Text style={[styles.error, { color: themeColors.danger }]}>{errorMessage}</Text> : null}

          <View style={styles.actions}>
            <TouchableOpacity onPress={onCancel} disabled={isSubmitting} style={styles.secondaryButton}>
              <Text style={[styles.secondaryButtonText, { color: themeColors.textSecondary }]}>
                {t('training.copyCompletedSessionCancel')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleCopy}
              disabled={isSubmitting}
              style={[styles.primaryButton, { backgroundColor: themeColors.primary }, isSubmitting && styles.disabled]}
            >
              {isSubmitting ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <Text style={styles.primaryButtonText}>{t('training.copyCompletedSessionAction')}</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.42)' },
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
  header: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 20 },
  headerCopy: { flex: 1 },
  title: { fontSize: 22, fontWeight: '800' },
  sourceName: { fontSize: 14, marginTop: 5 },
  closeButton: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  closeText: { fontSize: 30, lineHeight: 32, fontWeight: '300' },
  stepLabel: { fontSize: 18, fontWeight: '800', marginBottom: 14 },
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
  conflictLoading: { marginTop: 12, alignSelf: 'flex-start' },
  warning: { fontSize: 13, lineHeight: 18, marginTop: 12 },
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
