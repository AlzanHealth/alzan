import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TextInput, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { OnboardingScreenNavigationProp } from '../../types/navigation.types';
import { useOnboardingStyles } from '../../hooks/useOnboardingStyles';
import { useOnboarding } from '../../hooks/useOnboarding';
import { OnboardingProgress } from '../../components/OnboardingProgress';
import { OnboardingBackButton } from '../../components/OnboardingBackButton';
import { PrimaryButton } from '../../components/PrimaryButton';
import { OnboardingStep } from '../../types/onboarding.types';
import { useTranslation } from 'react-i18next';
import { usePreferencesContext } from '../../context/PreferencesContext';
import { DistanceUnit, WeightUnit } from '../../types/requests.types';
import {
  convertLengthToUi,
  convertWeightToUi,
  parseLengthToCm,
  parseWeightToKg,
} from '../../utils/unitConversionUtils';
import { DECIMAL_INPUT_PROPS } from '../../utils/numericInput';

const sanitizeNumericInput = (value: string): string => {
  const normalized = value.replace(',', '.').replace(/[^0-9.]/g, '');
  const [integerPart, ...decimalParts] = normalized.split('.');
  if (decimalParts.length === 0) {
    return integerPart;
  }

  return `${integerPart}.${decimalParts.join('')}`;
};

const parseInputNumber = (value: string): number | null => {
  const parsed = parseFloat(value.replace(',', '.'));
  return Number.isNaN(parsed) ? null : parsed;
};

const formatInputNumber = (value: number): string => {
  if (!Number.isFinite(value)) {
    return '';
  }

  return Number.isInteger(value) ? `${value}` : value.toString();
};

const getHeightPrecision = (distanceUnit: DistanceUnit) => (distanceUnit === 'km' ? 0 : 1);

const formatHeightFromCm = (heightCm: number | null, distanceUnit: DistanceUnit): string => {
  if (heightCm === null) {
    return '';
  }

  const converted = convertLengthToUi(heightCm, distanceUnit, getHeightPrecision(distanceUnit));
  return formatInputNumber(converted.value);
};

const formatWeightFromKg = (weightKg: number | null, weightUnit: WeightUnit): string => {
  if (weightKg === null) {
    return '';
  }

  const converted = convertWeightToUi(weightKg, weightUnit, 1);
  return formatInputNumber(converted.value);
};

export const OnboardingPhysical = () => {
  const { t } = useTranslation();
  const navigation = useNavigation<OnboardingScreenNavigationProp>();
  const { styles, colors } = useOnboardingStyles();
  const { data, updateData, saveAndNext, saving } = useOnboarding();
  const { preferences } = usePreferencesContext();

  const distanceUnit: DistanceUnit = preferences?.distance_unit ?? data.distanceUnit ?? 'km';
  const weightUnit: WeightUnit = preferences?.weight_unit ?? data.weightUnit ?? 'kg';
  const heightUnit = distanceUnit === 'km' ? 'cm' : 'in';

  const [height, setHeight] = useState(() => formatHeightFromCm(data.heightCm, distanceUnit));
  const [weight, setWeight] = useState(() => formatWeightFromKg(data.weightKg, weightUnit));
  const [heightError, setHeightError] = useState('');
  const [weightError, setWeightError] = useState('');

  const previousDistanceUnitRef = useRef<DistanceUnit>(distanceUnit);
  const previousWeightUnitRef = useRef<WeightUnit>(weightUnit);

  useEffect(() => {
    if (!height && data.heightCm !== null) {
      setHeight(formatHeightFromCm(data.heightCm, distanceUnit));
    }
  }, [data.heightCm, distanceUnit, height]);

  useEffect(() => {
    if (!weight && data.weightKg !== null) {
      setWeight(formatWeightFromKg(data.weightKg, weightUnit));
    }
  }, [data.weightKg, weight, weightUnit]);

  useEffect(() => {
    const previousUnit = previousDistanceUnitRef.current;
    if (previousUnit === distanceUnit) {
      return;
    }

    const heightNumber = parseInputNumber(height);
    if (heightNumber !== null) {
      const heightCm = parseLengthToCm(heightNumber, previousUnit);
      setHeight(formatHeightFromCm(heightCm, distanceUnit));
    }

    previousDistanceUnitRef.current = distanceUnit;
  }, [distanceUnit, height]);

  useEffect(() => {
    const previousUnit = previousWeightUnitRef.current;
    if (previousUnit === weightUnit) {
      return;
    }

    const weightNumber = parseInputNumber(weight);
    if (weightNumber !== null) {
      const weightKg = parseWeightToKg(weightNumber, previousUnit);
      setWeight(formatWeightFromKg(weightKg, weightUnit));
    }

    previousWeightUnitRef.current = weightUnit;
  }, [weight, weightUnit]);

  const heightRange = useMemo(() => {
    const precision = getHeightPrecision(distanceUnit);
    return {
      min: convertLengthToUi(100, distanceUnit, precision).value,
      max: convertLengthToUi(250, distanceUnit, precision).value,
    };
  }, [distanceUnit]);

  const weightRange = useMemo(
    () => ({
      min: convertWeightToUi(30, weightUnit, 0).value,
      max: convertWeightToUi(300, weightUnit, 0).value,
    }),
    [weightUnit],
  );

  const heightPlaceholderValue = useMemo(
    () => formatInputNumber(convertLengthToUi(175, distanceUnit, getHeightPrecision(distanceUnit)).value),
    [distanceUnit],
  );

  const weightPlaceholderValue = useMemo(
    () => formatInputNumber(convertWeightToUi(70, weightUnit, 0).value),
    [weightUnit],
  );

  const validateHeight = useCallback(
    (value: string) => {
      const num = parseInputNumber(value);
      if (num === null) return false;
      if (num < heightRange.min || num > heightRange.max) {
        setHeightError(
          t('onboarding.validHeightRangeWithUnit', {
            min: heightRange.min,
            max: heightRange.max,
            unit: heightUnit,
          }),
        );
        return false;
      }
      setHeightError('');
      return true;
    },
    [heightRange.max, heightRange.min, heightUnit, t],
  );

  const validateWeight = useCallback(
    (value: string) => {
      const num = parseInputNumber(value);
      if (num === null) return false;
      if (num < weightRange.min || num > weightRange.max) {
        setWeightError(
          t('health.invalidWeightRange', {
            min: weightRange.min,
            max: weightRange.max,
            unit: weightUnit,
          }),
        );
        return false;
      }
      setWeightError('');
      return true;
    },
    [t, weightRange.max, weightRange.min, weightUnit],
  );

  const isValid = Boolean(height && weight && !heightError && !weightError);

  const handleContinue = useCallback(async () => {
    const heightValid = validateHeight(height);
    const weightValid = validateWeight(weight);

    if (!heightValid || !weightValid) return;

    const parsedHeight = parseInputNumber(height);
    const parsedWeight = parseInputNumber(weight);
    if (parsedHeight === null || parsedWeight === null) {
      return;
    }

    const newData = {
      heightCm: parseLengthToCm(parsedHeight, distanceUnit),
      weightKg: parseWeightToKg(parsedWeight, weightUnit),
    };
    updateData(newData);
    const success = await saveAndNext(newData);
    if (success) {
      navigation.navigate('OnboardingActivity');
    }
  }, [distanceUnit, height, navigation, saveAndNext, updateData, validateHeight, validateWeight, weight, weightUnit]);

  const onHeightChange = useCallback(
    (rawValue: string) => {
      const sanitized = sanitizeNumericInput(rawValue);
      setHeight(sanitized);
      if (!sanitized) {
        setHeightError('');
        return;
      }
      if (heightError) {
        validateHeight(sanitized);
      }
    },
    [heightError, validateHeight],
  );

  const onWeightChange = useCallback(
    (rawValue: string) => {
      const sanitized = sanitizeNumericInput(rawValue);
      setWeight(sanitized);
      if (!sanitized) {
        setWeightError('');
        return;
      }
      if (weightError) {
        validateWeight(sanitized);
      }
    },
    [validateWeight, weightError],
  );

  const onHeightBlur = useCallback(() => {
    if (height) {
      validateHeight(height);
    }
  }, [height, validateHeight]);

  const onWeightBlur = useCallback(() => {
    if (weight) {
      validateWeight(weight);
    }
  }, [validateWeight, weight]);

  const heightLabel = t('onboarding.heightWithUnit', { unit: heightUnit });
  const weightLabel = t('onboarding.currentWeightWithUnit', { unit: weightUnit });
  const heightPlaceholder = t('onboarding.exampleValue', { value: heightPlaceholderValue });
  const weightPlaceholder = t('onboarding.exampleValue', { value: weightPlaceholderValue });

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <View style={styles.headerContainer}>
          <OnboardingProgress currentStep={OnboardingStep.PHYSICAL} />
          <Text style={styles.title}>{t('onboarding.bodyData')}</Text>
          <Text style={styles.subtitle}>{t('onboarding.bodyDataReason')}</Text>
        </View>

        <View style={styles.inputContainer}>
          <Text style={styles.label}>{heightLabel}</Text>
          <TextInput
            style={[styles.input, heightError && styles.inputError]}
            value={height}
            onChangeText={onHeightChange}
            onBlur={onHeightBlur}
            placeholder={heightPlaceholder}
            placeholderTextColor={colors.textSecondary}
            {...DECIMAL_INPUT_PROPS}
          />
          {heightError && <Text style={styles.errorText}>{heightError}</Text>}
        </View>

        <View style={styles.inputContainer}>
          <Text style={styles.label}>{weightLabel}</Text>
          <TextInput
            style={[styles.input, weightError && styles.inputError]}
            value={weight}
            onChangeText={onWeightChange}
            onBlur={onWeightBlur}
            placeholder={weightPlaceholder}
            placeholderTextColor={colors.textSecondary}
            {...DECIMAL_INPUT_PROPS}
          />
          {weightError && <Text style={styles.errorText}>{weightError}</Text>}
        </View>

        <Text style={styles.helperText}>{t('onboarding.updateProfileLaterNote')}</Text>
      </ScrollView>

      <View style={styles.bottomContainer}>
        <OnboardingBackButton />
        <PrimaryButton title={t('onboarding.continue')} onPress={handleContinue} loading={saving} disabled={!isValid} />
      </View>
    </KeyboardAvoidingView>
  );
};
