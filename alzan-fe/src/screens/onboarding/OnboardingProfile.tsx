import React, { useState, useCallback, useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Platform, Modal, TextInput } from 'react-native';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useNavigation } from '@react-navigation/native';
import { OnboardingScreenNavigationProp } from '../../types/navigation.types';
import { useOnboardingStyles } from '../../hooks/useOnboardingStyles';
import { useOnboarding } from '../../hooks/useOnboarding';
import { OnboardingProgress } from '../../components/OnboardingProgress';
import { OnboardingBackButton } from '../../components/OnboardingBackButton';
import { PrimaryButton } from '../../components/PrimaryButton';
import { OnboardingStep, SEX_OPTIONS } from '../../types/onboarding.types';
import { Sex } from '../../types/requests.types';
import { Nullable } from '../../types/common.types';
import { useTranslation } from 'react-i18next';
import { getLocaleTag } from '../../i18n/dateLocale';

export const OnboardingProfile = () => {
  const { t } = useTranslation();
  const navigation = useNavigation<OnboardingScreenNavigationProp>();
  const { styles, colors, isDark } = useOnboardingStyles();
  const { data, updateData, saveAndNext, saving } = useOnboarding();

  const formatDateForInput = useCallback((date: Date) => {
    const year = date.getFullYear();
    const month = `${date.getMonth() + 1}`.padStart(2, '0');
    const day = `${date.getDate()}`.padStart(2, '0');
    return `${day}-${month}-${year}`;
  }, []);

  const [dateOfBirth, setDateOfBirth] = useState<Date | null>(data.dateOfBirth);
  const [dateInput, setDateInput] = useState<string>(data.dateOfBirth ? formatDateForInput(data.dateOfBirth) : '');
  const [dateError, setDateError] = useState('');
  const [selectedSex, setSelectedSex] = useState<Nullable<Sex>>(data.sex);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const isIOS = Platform.OS === 'ios';
  const isAndroid = Platform.OS === 'android';
  const isWeb = Platform.OS === 'web';

  const minDate = useMemo(() => new Date(1920, 0, 1), []);
  const maxDate = useMemo(() => {
    const value = new Date();
    value.setFullYear(value.getFullYear() - 16);
    return value;
  }, []);
  const defaultDate = useMemo(() => {
    const value = new Date();
    value.setFullYear(value.getFullYear() - 25);
    return value;
  }, []);

  const isDateWithinRange = useCallback(
    (value: Date) => value.getTime() >= minDate.getTime() && value.getTime() <= maxDate.getTime(),
    [maxDate, minDate],
  );

  const applySelectedDate = useCallback(
    (value: Date) => {
      const normalized = new Date(value.getFullYear(), value.getMonth(), value.getDate());
      if (!isDateWithinRange(normalized)) {
        setDateOfBirth(null);
        setDateError(t('onboarding.birthDateRangeError'));
        return false;
      }

      setDateOfBirth(normalized);
      setDateInput(formatDateForInput(normalized));
      setDateError('');
      return true;
    },
    [formatDateForInput, isDateWithinRange, t],
  );

  const validateDateInput = useCallback(
    (value: string) => {
      const trimmed = value.trim();
      if (!trimmed) {
        setDateOfBirth(null);
        setDateError('');
        return false;
      }

      const match = /^(\d{2})-(\d{2})-(\d{4})$/.exec(trimmed);
      if (!match) {
        setDateOfBirth(null);
        setDateError(t('settings.invalidDateFormatDmy'));
        return false;
      }

      const day = Number(match[1]);
      const month = Number(match[2]);
      const year = Number(match[3]);
      const candidate = new Date(year, month - 1, day);

      const isRealDate =
        candidate.getFullYear() === year && candidate.getMonth() === month - 1 && candidate.getDate() === day;

      if (!isRealDate) {
        setDateOfBirth(null);
        setDateError(t('settings.invalidDateFormatDmy'));
        return false;
      }

      if (!isDateWithinRange(candidate)) {
        setDateOfBirth(null);
        setDateError(t('onboarding.birthDateRangeError'));
        return false;
      }

      setDateOfBirth(candidate);
      setDateError('');
      return true;
    },
    [isDateWithinRange, t],
  );

  const isValid = dateOfBirth !== null && selectedSex !== null && !dateError;

  const handleDateChange = (_event: DateTimePickerEvent, selectedDate?: Date) => {
    if (isAndroid) {
      setShowDatePicker(false);
    }
    if (selectedDate) {
      applySelectedDate(selectedDate);
    }
  };

  const handleContinue = useCallback(async () => {
    if (!dateOfBirth || !selectedSex) return;
    const newData = { dateOfBirth, sex: selectedSex };
    updateData(newData);
    const success = await saveAndNext(newData);
    if (success) {
      navigation.navigate('OnboardingHealth');
    }
  }, [dateOfBirth, selectedSex, updateData, saveAndNext, navigation]);

  const sexLabels: Record<Sex, string> = {
    male: 'Hombre',
    female: 'Mujer',
    other: 'Otro',
    prefer_not_to_say: 'Prefiero no decirlo',
  };

  const toHtmlDate = (date: Date) => {
    const year = date.getFullYear();
    const month = `${date.getMonth() + 1}`.padStart(2, '0');
    const day = `${date.getDate()}`.padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const handleOpenDatePicker = () => {
    if (isWeb) {
      if (typeof document === 'undefined') return;

      const input = document.createElement('input');
      input.type = 'date';
      input.min = toHtmlDate(minDate);
      input.max = toHtmlDate(maxDate);
      input.value = toHtmlDate(dateOfBirth || defaultDate);
      input.style.position = 'fixed';
      input.style.left = '-9999px';
      input.style.opacity = '0';

      const cleanup = () => {
        if (input.parentNode) {
          input.parentNode.removeChild(input);
        }
      };

      input.addEventListener('change', () => {
        if (input.value) {
          const [year, month, day] = input.value.split('-').map(Number);
          if (year && month && day) {
            applySelectedDate(new Date(year, month - 1, day));
          }
        }
        cleanup();
      });

      input.addEventListener('blur', cleanup);
      document.body.appendChild(input);
      input.click();
      return;
    }

    setShowDatePicker(true);
  };

  const handleDateInputChange = useCallback(
    (text: string) => {
      const digits = text.replace(/[^0-9]/g, '');
      let formatted = digits;

      if (digits.length > 2) {
        formatted = `${digits.slice(0, 2)}-${digits.slice(2)}`;
      }
      if (digits.length > 4) {
        formatted = `${formatted.slice(0, 5)}-${formatted.slice(5)}`;
      }
      if (formatted.length > 10) {
        formatted = formatted.slice(0, 10);
      }

      setDateInput(formatted);

      if (!formatted) {
        setDateOfBirth(null);
        setDateError('');
        return;
      }

      if (formatted.length === 10 || dateError) {
        validateDateInput(formatted);
      }
    },
    [dateError, validateDateInput],
  );

  const handleDateInputBlur = useCallback(() => {
    if (!dateInput) return;
    validateDateInput(dateInput);
  }, [dateInput, validateDateInput]);

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.headerContainer}>
          <OnboardingProgress currentStep={OnboardingStep.PROFILE} />
          <Text style={styles.title}>{t('onboarding.biologicalProfile')}</Text>
          <Text style={styles.subtitle}>{t('onboarding.bioProfileReason')}</Text>
        </View>

        <View style={styles.inputContainer}>
          <Text style={styles.label}>{t('onboarding.birthDate')}</Text>
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
            <TextInput
              style={[styles.input, { flex: 1 }, dateError ? styles.inputError : null]}
              value={dateInput}
              onChangeText={handleDateInputChange}
              onBlur={handleDateInputBlur}
              placeholder="DD-MM-YYYY"
              placeholderTextColor={colors.textSecondary}
              keyboardType={Platform.OS === 'ios' ? 'numbers-and-punctuation' : 'numeric'}
              maxLength={10}
            />
            <TouchableOpacity style={styles.datePickerButton} onPress={handleOpenDatePicker} activeOpacity={0.7}>
              <Text style={styles.datePickerText}>📅</Text>
            </TouchableOpacity>
          </View>
          {dateError ? (
            <Text style={styles.errorText}>{dateError}</Text>
          ) : (
            <Text style={styles.helperText}>{t('onboarding.birthDateInputHint')}</Text>
          )}
        </View>

        {isIOS && showDatePicker && (
          <Modal
            transparent
            animationType="slide"
            visible={showDatePicker}
            onRequestClose={() => setShowDatePicker(false)}
          >
            <View
              style={{
                flex: 1,
                justifyContent: 'flex-end',
                backgroundColor: 'rgba(0,0,0,0.5)',
              }}
            >
              <View
                style={{
                  backgroundColor: isDark ? '#1C1C1E' : '#FFFFFF',
                  padding: 20,
                  borderTopLeftRadius: 20,
                  borderTopRightRadius: 20,
                }}
              >
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 }}>
                  <TouchableOpacity onPress={() => setShowDatePicker(false)}>
                    <Text style={{ color: colors.danger, fontSize: 16 }}>{t('common.cancel')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setShowDatePicker(false)}>
                    <Text style={{ color: colors.primary, fontSize: 16, fontWeight: '600' }}>{t('common.done')}</Text>
                  </TouchableOpacity>
                </View>
                <DateTimePicker
                  value={dateOfBirth || defaultDate}
                  mode="date"
                  display={isIOS ? 'spinner' : 'default'}
                  onChange={handleDateChange}
                  maximumDate={maxDate}
                  minimumDate={minDate}
                  locale={getLocaleTag()}
                  themeVariant={isDark ? 'dark' : 'light'}
                  style={{ backgroundColor: isDark ? '#1C1C1E' : '#FFFFFF' }}
                />
              </View>
            </View>
          </Modal>
        )}

        {isAndroid && showDatePicker && (
          <DateTimePicker
            value={dateOfBirth || defaultDate}
            mode="date"
            display="default"
            onChange={handleDateChange}
            maximumDate={maxDate}
            minimumDate={minDate}
          />
        )}

        <View style={[styles.inputContainer, { marginTop: 24 }]}>
          <Text style={styles.label}>{t('onboarding.sex')}</Text>
          <View style={styles.optionsGrid}>
            {SEX_OPTIONS.map(option => {
              const isSelected = selectedSex === option.value;
              return (
                <TouchableOpacity
                  key={option.value}
                  style={[styles.optionCard, isSelected && styles.optionCardSelected]}
                  onPress={() => setSelectedSex(option.value)}
                  activeOpacity={0.7}
                >
                  <View style={styles.optionTextContainer}>
                    <Text style={styles.optionTitle}>{sexLabels[option.value]}</Text>
                  </View>
                  <View style={[styles.optionCheck, isSelected && styles.optionCheckSelected]}>
                    {isSelected && <Text style={{ color: '#FFFFFF', fontSize: 14 }}>✓</Text>}
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </ScrollView>

      <View style={styles.bottomContainer}>
        <OnboardingBackButton />
        <PrimaryButton title={t('onboarding.continue')} onPress={handleContinue} loading={saving} disabled={!isValid} />
      </View>
    </View>
  );
};
