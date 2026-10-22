/**
 * @fileoverview Body Composition Detail Screen
 * @module health/screens/BodyCompositionDetail
 * @version 2.0.0
 *
 * @description
 * Main screen for displaying detailed body composition metrics.
 * Shows BMI, Body Fat %, Muscle Mass, and mass distribution.
 * Includes interactive info modals with calculation explanations.
 *
 * ## Features:
 * - MetricCards for each body composition metric
 * - RangeBar visualizations with color-coded segments
 * - Bottom Sheet info modals (slide-up) with:
 *   - Metric explanation
 *   - Calculation method details
 *   - Dynamic tips based on data availability
 * - "Improve Precision" CTA when using basic estimation
 * - Mass distribution summary (muscle/fat/lean kg)
 *
 * ## Dependencies:
 * - useHealthInsights hook for data
 * - RangeBar component for visualizations
 * - GlassCard component for styling
 * - BlurView for modal effects
 *
 * @see ../hooks/useHealthInsights.ts
 * @see ../components/RangeBar.tsx
 * @see ../algorithms/bodyComposition.ts
 *
 * @author Alzan Health Development Team
 * @since 1.0.0
 */

import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { HealthScreenNavigationProp } from '../../../types/navigation.types';
import {
  ChevronLeft,
  Info,
  TrendingUp,
  Percent,
  Activity,
  X,
  Lightbulb,
  Target,
  Dumbbell,
  RotateCw,
  LucideIcon,
} from 'lucide-react-native';
import { colors, spacing, borderRadius } from '../../../theme';

import { useHealthInsights } from '../hooks/useHealthInsights';
import { useBodyCompositionLogs } from '../hooks/useBodyCompositionLogs';
import { useProfile } from '../../../hooks/settings/useProfile';
import { RangeBar } from '../components/RangeBar';
import { GlassCard } from '../../../components/GlassCard';
import { BlurView } from 'expo-blur';
import { useHealthStyles } from '../../../hooks/useHealthStyles';
import { useUnitConversion } from '../../../hooks/useUnitConversion';
import { LinearGradient } from 'expo-linear-gradient';
import type { CompositionInputKey } from '../algorithms/bodyComposition';
import { getWaistToHeightRangeConfig, getWaistToHipRangeConfig } from '../algorithms/abdominalHealth';
import { hasBodyCompositionChanged, hasCalculatedCompositionValues } from '../helpers/bodyCompositionRefresh';
import {
  BMI_RANGES,
  BMI_BAR_CONFIG,
  BODY_FAT_BAR_CONFIG,
  MUSCLE_BAR_CONFIG,
  getBodyFatRanges,
  getMuscleRanges,
  findCategory,
  toBarSegments,
} from '../constants/bodyCompositionRanges';
import { useTranslation } from 'react-i18next';
import { formatLocalizedDate, getLocaleTag } from '../../../i18n/dateLocale';
import { TAB_BAR_CLEARANCE, useTabBarLayout } from '../../../navigation/tabBarLayout';
import type { BodyChangeKey } from '../algorithms/bodyChanges';
import {
  getBodyFatPrecisionTip,
  getLocalizedCompositionFormula,
  getMusclePrecisionTip,
  getRemainderInfoCopy,
} from '../algorithms/bodyCompositionInfoCopy';

// ============================================================================
// TYPES
// ============================================================================

/** Type for info modal state - which metric is being explained */
type InfoType = 'bmi' | 'bodyFat' | 'muscle' | 'remainder' | 'waistToHeight' | 'waistToHip' | 'recomposition' | null;
type RecalculateNotice = 'current' | 'insufficient' | 'success' | 'error' | null;

// ============================================================================
// MAIN COMPONENT
// ============================================================================

/**
 * BodyCompositionDetail - Main screen for body composition metrics
 *
 * Displays:
 * - BMI with WHO category
 * - Body Fat % with sex-specific ranges
 * - Muscle Mass % with visual range bar
 * - Mass distribution breakdown (kg)
 *
 * @returns JSX.Element
 */
export const BodyCompositionDetail = () => {
  const { t, i18n } = useTranslation();
  // =========================================================================
  // HOOKS & STATE
  // =========================================================================

  const navigation = useNavigation<HealthScreenNavigationProp>();
  const { bodyComposition, latestWeight, age } = useHealthInsights();
  const compositionQuery = useBodyCompositionLogs();
  const { topFromScreenBottom } = useTabBarLayout();
  const { profile } = useProfile();
  const { styles: dynamicStyles, colors: themeColors, isDark } = useHealthStyles();
  const { convertWeightToUi, units } = useUnitConversion();

  /** Currently open info modal (null = closed) */
  const [infoModal, setInfoModal] = useState<InfoType>(null);
  const [recalculateNotice, setRecalculateNotice] = useState<RecalculateNotice>(null);

  const isSpanish = i18n.resolvedLanguage?.startsWith('es') ?? false;

  const hasDemographicRanges = age !== null && age >= 20 && (profile?.sex === 'male' || profile?.sex === 'female');
  const isFemale = profile?.sex === 'female';
  const deltas = bodyComposition.deltas;
  const handleRecalculate = async () => {
    if (compositionQuery.isFetching) return;
    const previousSnapshots = compositionQuery.data;
    const result = await compositionQuery.refetch();
    if (result.isError) {
      setRecalculateNotice('error');
      return;
    }
    if (!hasCalculatedCompositionValues(result.data)) {
      setRecalculateNotice('insufficient');
      return;
    }
    if (!hasBodyCompositionChanged(previousSnapshots, result.data)) {
      setRecalculateNotice('current');
      return;
    }
    setRecalculateNotice('success');
  };

  // =========================================================================
  // DYNAMIC RANGES (Age & Sex Specific)
  // =========================================================================

  /** BMI bar segments from official WHO ranges */
  const bmiSegments = useMemo(() => toBarSegments(BMI_RANGES, isSpanish), [isSpanish]);

  /** Body fat bar segments based on user's age and sex */
  const bodyFatRanges = useMemo(
    () => (hasDemographicRanges && age !== null ? getBodyFatRanges(age, isFemale) : []),
    [age, hasDemographicRanges, isFemale],
  );
  const bodyFatSegments = useMemo(() => toBarSegments(bodyFatRanges, isSpanish), [bodyFatRanges, isSpanish]);

  /** Muscle mass bar segments based on user's age and sex */
  const muscleRanges = useMemo(
    () => (hasDemographicRanges && age !== null ? getMuscleRanges(age, isFemale) : []),
    [age, hasDemographicRanges, isFemale],
  );
  const muscleSegments = useMemo(() => toBarSegments(muscleRanges, isSpanish), [muscleRanges, isSpanish]);
  const abdominalSex = profile?.sex === 'male' || profile?.sex === 'female' ? profile.sex : null;
  const waistToHeightRange = useMemo(() => getWaistToHeightRangeConfig(), []);
  const waistToHipRange = useMemo(() => (abdominalSex ? getWaistToHipRangeConfig(abdominalSex) : null), [abdominalSex]);

  /** Current body fat category based on official ranges */
  const currentBodyFatCategory = useMemo(() => {
    if (!bodyComposition.bodyFat?.percentage) return null;
    return findCategory(bodyComposition.bodyFat.percentage, bodyFatRanges);
  }, [bodyComposition.bodyFat?.percentage, bodyFatRanges]);

  /** Current muscle category based on official ranges */
  const currentMuscleCategory = useMemo(() => {
    if (!bodyComposition.muscle?.percentage) return null;
    return findCategory(bodyComposition.muscle.percentage, muscleRanges);
  }, [bodyComposition.muscle?.percentage, muscleRanges]);

  /** Current BMI category based on official WHO ranges */
  const currentBmiCategory = useMemo(() => {
    if (!bodyComposition.bmi?.value || !bodyComposition.bmi.adultCategoriesApplicable) return null;
    const category = bodyComposition.bmi.category;
    return BMI_RANGES[category === 'underweight' ? 0 : category === 'normal' ? 1 : category === 'overweight' ? 2 : 3];
  }, [bodyComposition.bmi]);
  const abdominalHealth = bodyComposition.abdominalHealth;
  const bodyChanges = bodyComposition.bodyChanges;
  const formatDate = (date: string) => formatLocalizedDate(new Date(date), { en: 'MMM d, yyyy', es: 'd MMM yyyy' });
  const changeLabels: Record<BodyChangeKey, string> = {
    weight: t('health.compositionWeightLabel'),
    waist: t('health.waist'),
    abdomen: t('health.abdomen'),
    hips: t('health.hips'),
    chest: t('health.chest'),
    arm: t('health.armRelaxed'),
    armFlexed: t('health.armFlexed'),
    thigh: t('health.thigh'),
  };

  const getInputLabel = (input: CompositionInputKey): string => {
    switch (input) {
      case 'weight':
        return t('health.calcInputWeight');
      case 'height':
        return t('health.calcInputHeight');
      case 'age':
        return t('health.calcInputAge');
      case 'sex':
        return t('health.calcInputSex');
      case 'waist':
        return t('health.waist');
      case 'abdomen':
        return t('health.abdomen');
      case 'hips':
        return t('health.hips');
      case 'chest':
        return t('health.chest');
      case 'arm':
        return t('health.arm');
      case 'thigh':
        return t('health.thigh');
      case 'storedBodyFat':
        return t('health.calcInputStoredBodyFat');
      case 'storedMuscleMass':
        return t('health.calcInputStoredMuscleMass');
      default:
        return t('health.unknown');
    }
  };

  const formatInputsUsed = (inputs: CompositionInputKey[] | undefined): string =>
    inputs && inputs.length > 0 ? inputs.map(getInputLabel).join(', ') : t('health.noData');

  const translateInfoCopy = (key: string, values?: Record<string, string | number>): string => {
    const translate = t as unknown as (
      translationKey: string,
      interpolation?: Record<string, string | number>,
    ) => string;
    return translate(key, values);
  };
  const translateDynamicKey = (key: string): string => translateInfoCopy(key);
  const waistToHeightSegments = useMemo(
    () =>
      waistToHeightRange.segments.map(segment => ({
        to: segment.to,
        color: segment.color,
        label: translateDynamicKey(segment.labelKey),
      })),
    [translateDynamicKey, waistToHeightRange],
  );
  const waistToHipSegments = useMemo(
    () =>
      (waistToHipRange?.segments ?? []).map(segment => ({
        to: segment.to,
        color: segment.color,
        label: translateDynamicKey(segment.labelKey),
      })),
    [translateDynamicKey, waistToHipRange],
  );

  // --- INFO MODAL ---
  const InfoModal = () => {
    if (!infoModal) return null;

    let title = '';
    let description = '';
    let formulaTitle = '';
    let themeColor = colors.primary;
    let IconComponent = Info;

    let calculationDetails = null;
    const tips: React.ReactNode[] = [];

    // Body fat method info
    const muscleMethod = bodyComposition.muscle?.method || 'lee_et_al';
    const isAdvancedMuscle = muscleMethod === 'al_gindan';
    const formulaSex = profile?.sex === 'male' || profile?.sex === 'female' ? profile.sex : null;

    if (infoModal === 'bmi') {
      title = t('health.imc');
      themeColor = '#3B82F6'; // Blue
      IconComponent = Activity;
      description = t('health.bmiDescription');
      formulaTitle = t('health.methodOfCalculation');

      const heightM = profile?.height_cm ? profile.height_cm / 100 : null;
      const weightKg = latestWeight?.weight_kg ?? null;

      calculationDetails =
        heightM && weightKg ? (
          <View style={styles.calculationContainer}>
            <Text style={styles.calcExplanation}>
              <Text style={{ fontWeight: '700' }}>{t('health.formulaLabel')}</Text> {t('health.bmiFormula')}
            </Text>
            <View style={styles.calcDivider} />
            <View style={styles.calculationRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.calcLabel}>{t('health.yourWeight')}</Text>
                <Text style={[styles.calcValue, { color: themeColor }]}>
                  {convertWeightToUi(weightKg).value} {convertWeightToUi(weightKg).unit}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.calcLabel}>{t('health.yourHeight')}</Text>
                <Text style={[styles.calcValue, { color: themeColor }]}>{heightM.toFixed(2)} m</Text>
              </View>
            </View>
            <View style={styles.calcDivider} />
            <Text style={styles.calcExplanation}>
              {weightKg.toFixed(1)} ÷ ({heightM.toFixed(2)} × {heightM.toFixed(2)}) ={' '}
              <Text style={{ fontWeight: '700', color: themeColor }}>{bodyComposition.bmi?.value || '--'}</Text>
            </Text>
          </View>
        ) : null;

      tips.push(
        <View key="tip1" style={styles.tipBox}>
          <View style={[styles.tipIconBox, { backgroundColor: themeColor + '20' }]}>
            <TrendingUp size={16} color={themeColor} />
          </View>
          <Text style={[styles.tipText, { color: themeColors.textPrimary }]}>
            <Text style={{ fontWeight: '700' }}>{t('health.improvePrecision')}</Text>{' '}
            {t('health.unlockAdvancedMetricsPrompt')}
          </Text>
        </View>,
      );
      tips.push(
        <View key="tip2" style={styles.tipBox}>
          <View style={[styles.tipIconBox, { backgroundColor: themeColor + '20' }]}>
            <Lightbulb size={16} color={themeColor} />
          </View>
          <Text style={[styles.tipText, { color: themeColors.textPrimary }]}>
            {t('health.combineWithFatPercAdvice')}
          </Text>
        </View>,
      );
    } else if (infoModal === 'bodyFat') {
      title = t('health.bodyFat');
      themeColor = '#10B981'; // Green
      IconComponent = Percent;
      description = t('health.bodyFatDescription');
      formulaTitle = t('health.methodOfCalculation');

      const method = bodyComposition.bodyFat?.method || 'deurenberg';
      const formula = formulaSex
        ? getLocalizedCompositionFormula({
            metric: 'bodyFat',
            method,
            sex: formulaSex,
            t: translateInfoCopy,
          })
        : '';
      const inputsUsed = bodyComposition.bodyFat?.inputsUsed;
      const precisionTip = getBodyFatPrecisionTip(method, translateInfoCopy);
      const getBodyFatMethodLabel = () => {
        switch (method) {
          case 'stored':
            return t('health.stored');
          case 'measured':
            return t('health.measured');
          case 'deurenberg':
            return t('health.deurenberg');
          case 'cun_bae':
            return t('health.cun_bae');
          case 'rfm':
            return t('health.rfm');
          case 'bai':
            return t('health.bai');
          default:
            return t('health.estimation');
        }
      };
      const getBodyFatMethodNote = () => {
        switch (method) {
          case 'stored':
            return t('health.storedCalculationUnknown');
          case 'measured':
            return t('health.measuredCalculationNote');
          case 'rfm':
            return t('health.rfmPrecisionNote');
          case 'bai':
            return t('health.baiPrecisionNote');
          case 'cun_bae':
            return t('health.basicBodyFatPrecisionNote');
          default:
            return t('health.estimatedCalcNote');
        }
      };
      const shouldShowFormula = method !== 'stored' && method !== 'measured' && formula.length > 0;

      calculationDetails = (
        <View style={styles.calculationContainer}>
          <View style={styles.methodTag}>
            <Text style={[styles.methodTagText, { color: themeColor }]}>{getBodyFatMethodLabel()}</Text>
          </View>

          {shouldShowFormula && (
            <Text style={styles.calcExplanation}>
              <Text style={{ fontWeight: '700' }}>{t('health.formulaLabel')} </Text>
              {formula}
            </Text>
          )}
          <Text style={styles.calcExplanation}>
            <Text style={{ fontWeight: '700' }}>{t('health.dataUsedLabel')} </Text>
            {formatInputsUsed(inputsUsed)}
          </Text>
          <View style={styles.calcDivider} />
          <Text style={styles.calcExplanation}>{getBodyFatMethodNote()}</Text>

          <View style={styles.calcDivider} />
          <Text style={[styles.calcExplanation, { fontWeight: '700', color: themeColor, fontSize: 16 }]}>
            {t('health.resultLabel')} {bodyComposition.bodyFat?.percentage || '--'}
            {t('health.bodyFatPercentage')}
          </Text>
        </View>
      );

      tips.push(
        <View key="tip1" style={styles.tipBox}>
          <View style={[styles.tipIconBox, { backgroundColor: themeColor + '20' }]}>
            {method === 'rfm' ? <Target size={16} color={themeColor} /> : <TrendingUp size={16} color={themeColor} />}
          </View>
          <Text style={[styles.tipText, { color: themeColors.textPrimary }]}>
            <Text style={{ fontWeight: '700' }}>{precisionTip.title} </Text>
            {precisionTip.body}
          </Text>
        </View>,
      );

      if (method === 'rfm') {
        tips.push(
          <View key="tip-tracking" style={styles.tipBox}>
            <View style={[styles.tipIconBox, { backgroundColor: themeColor + '20' }]}>
              <Lightbulb size={16} color={themeColor} />
            </View>
            <Text style={[styles.tipText, { color: themeColors.textPrimary }]}>
              {t('health.trackingMeasurementsNote')}
            </Text>
          </View>,
        );
      }
      tips.push(
        <View key="tip2" style={styles.tipBox}>
          <View style={[styles.tipIconBox, { backgroundColor: themeColor + '20' }]}>
            <Lightbulb size={16} color={themeColor} />
          </View>
          <Text style={[styles.tipText, { color: themeColors.textPrimary }]}>
            {t('health.measurementBestPractices')}
          </Text>
        </View>,
      );
    } else if (infoModal === 'muscle') {
      title = t('health.muscleMass');
      themeColor = '#8B5CF6'; // Purple
      IconComponent = Dumbbell;
      description = t('health.muscleDescription');
      formulaTitle = t('health.methodOfCalculation');
      const muscleFormula = formulaSex
        ? getLocalizedCompositionFormula({
            metric: 'muscle',
            method: muscleMethod,
            sex: formulaSex,
            t: translateInfoCopy,
          })
        : '';
      const precisionTip = getMusclePrecisionTip(muscleMethod, translateInfoCopy);

      const getMuscleMethodLabel = () => {
        switch (muscleMethod) {
          case 'stored':
            return t('health.stored');
          case 'lee_et_al':
            return t('health.lee_et_al');
          case 'al_gindan':
            return t('health.al_gindan');
          case 'anthropometric':
            return t('health.anthropometric');
          default:
            return t('health.estimation');
        }
      };
      const getMuscleMethodNote = () => {
        switch (muscleMethod) {
          case 'stored':
            return t('health.storedCalculationUnknown');
          case 'al_gindan':
            return t('health.alGindanPrecisionNote');
          case 'lee_et_al':
            return t('health.basicMusclePrecisionNote');
          default:
            return t('health.estimatedCalcNote');
        }
      };
      const shouldShowMuscleFormula = muscleMethod !== 'stored' && muscleFormula.length > 0;

      calculationDetails = (
        <View style={styles.calculationContainer}>
          <View style={styles.methodTag}>
            <Text style={[styles.methodTagText, { color: themeColor }]}>{getMuscleMethodLabel()}</Text>
          </View>

          <Text style={styles.sectionSubtitle}>
            {isAdvancedMuscle ? t('health.advancedMethodAlGindan') : t('health.estimationMethodLee')}
          </Text>

          {shouldShowMuscleFormula && (
            <Text style={styles.calcExplanation}>
              <Text style={{ fontWeight: '700' }}>{t('health.formulaLabel')} </Text>
              {muscleFormula}
            </Text>
          )}
          <Text style={styles.calcExplanation}>
            <Text style={{ fontWeight: '700' }}>{t('health.dataUsedLabel')} </Text>
            {formatInputsUsed(bodyComposition.muscle?.inputsUsed)}
          </Text>
          <View style={styles.calcDivider} />
          <Text style={styles.calcExplanation}>{getMuscleMethodNote()}</Text>

          <View style={styles.calcDivider} />
          <View style={styles.calculationRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.calcLabel}>{t('health.muscleMass')}</Text>
              <Text style={[styles.calcValue, { color: themeColor }]}>
                {bodyComposition.muscle?.massKg ? convertWeightToUi(bodyComposition.muscle.massKg).value : '--'}{' '}
                {bodyComposition.muscle?.massKg ? convertWeightToUi(bodyComposition.muscle.massKg).unit : ''}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.calcLabel}>{t('health.percentage')}</Text>
              <Text style={[styles.calcValue, { color: themeColor }]}>
                {bodyComposition.muscle?.percentage || '--'}%
              </Text>
            </View>
          </View>
        </View>
      );

      tips.push(
        <View key="tip1" style={styles.tipBox}>
          <View style={[styles.tipIconBox, { backgroundColor: themeColor + '20' }]}>
            {isAdvancedMuscle ? <Target size={16} color={themeColor} /> : <TrendingUp size={16} color={themeColor} />}
          </View>
          <Text style={[styles.tipText, { color: themeColors.textPrimary }]}>
            <Text style={{ fontWeight: '700' }}>{precisionTip.title} </Text>
            {precisionTip.body}
          </Text>
        </View>,
      );
      tips.push(
        <View key="tip-tracking" style={styles.tipBox}>
          <View style={[styles.tipIconBox, { backgroundColor: themeColor + '20' }]}>
            <Lightbulb size={16} color={themeColor} />
          </View>
          <Text style={[styles.tipText, { color: themeColors.textPrimary }]}>
            {t('health.trackingMeasurementsNote')}
          </Text>
        </View>,
      );
      tips.push(
        <View key="tip2" style={styles.tipBox}>
          <View style={[styles.tipIconBox, { backgroundColor: themeColor + '20' }]}>
            <Dumbbell size={16} color={themeColor} />
          </View>
          <Text style={[styles.tipText, { color: themeColors.textPrimary }]}>{t('health.proteinAdvice')}</Text>
        </View>,
      );
    } else if (infoModal === 'remainder') {
      title = t('health.remainder');
      themeColor = themeColors.textPrimary;
      IconComponent = Info;
      const remainderCopy = getRemainderInfoCopy(translateInfoCopy);
      description = remainderCopy.description;
      formulaTitle = t('health.methodOfCalculation');

      calculationDetails = (
        <View style={styles.calculationContainer}>
          <Text style={styles.calcExplanation}>
            <Text style={{ fontWeight: '700' }}>{t('health.formulaLabel')} </Text>
            {remainderCopy.formula}
          </Text>
          <View style={styles.calcDivider} />
          <Text style={styles.calcExplanation}>{remainderCopy.components}</Text>
          <View style={styles.calcDivider} />
          <Text style={[styles.calcExplanation, { fontWeight: '700', color: themeColor, fontSize: 16 }]}>
            {t('health.resultLabel')} {bodyComposition.residualMassKg || '--'} {t('health.unitKg')}
          </Text>
        </View>
      );

      tips.push(
        <View key="tip1" style={styles.tipBox}>
          <View style={[styles.tipIconBox, { backgroundColor: themeColor + '20' }]}>
            <Lightbulb size={16} color={themeColor} />
          </View>
          <Text style={[styles.tipText, { color: themeColors.textPrimary }]}>{remainderCopy.note}</Text>
        </View>,
      );
    } else if (infoModal === 'waistToHeight') {
      title = t('health.waistToHeight');
      themeColor = '#0EA5E9';
      IconComponent = Target;
      description = t('health.waistToHeightDescription');
      formulaTitle = t('health.methodOfCalculation');
      const marker = abdominalHealth.waistToHeight;

      calculationDetails = (
        <View style={styles.calculationContainer}>
          <Text style={styles.calcExplanation}>
            <Text style={{ fontWeight: '700' }}>{t('health.formulaLabel')} </Text>
            {t('health.waistToHeightFormula')}
          </Text>
          <View style={styles.calcDivider} />
          <Text style={styles.calcExplanation}>{t('health.waistToHeightRule')}</Text>
          <View style={styles.calcDivider} />
          <Text style={[styles.calcExplanation, { fontWeight: '700', color: themeColor, fontSize: 16 }]}>
            {t('health.resultLabel')} {marker ? marker.value.toFixed(2) : '--'}
          </Text>
          {(abdominalHealth.bri || abdominalHealth.absi) && (
            <>
              <View style={styles.calcDivider} />
              <Text style={[styles.sectionSubtitle, { color: themeColors.textPrimary }]}>
                {t('health.advancedMarkers')}
              </Text>
              <Text style={styles.calcExplanation}>{t('health.abdominalAdvancedDescription')}</Text>
              <View style={styles.advancedMarkerRow}>
                <View style={styles.advancedMarkerCopy}>
                  <Text style={styles.calcLabel}>{t('health.bri')}</Text>
                  <Text style={styles.calcExplanation}>{t('health.briExplanation')}</Text>
                  <Text style={styles.calcExplanation}>{t('health.briDirection')}</Text>
                </View>
                <Text style={[styles.advancedMarkerValue, { color: themeColor }]}>
                  {abdominalHealth.bri?.value ?? '--'}
                </Text>
              </View>
              <View style={styles.advancedMarkerRow}>
                <View style={styles.advancedMarkerCopy}>
                  <Text style={styles.calcLabel}>{t('health.absi')}</Text>
                  <Text style={styles.calcExplanation}>{t('health.absiExplanation')}</Text>
                  <Text style={styles.calcExplanation}>{t('health.absiDirection')}</Text>
                </View>
                <Text style={[styles.advancedMarkerValue, { color: themeColor }]}>
                  {abdominalHealth.absi?.value ?? '--'}
                </Text>
              </View>
            </>
          )}
        </View>
      );

      tips.push(
        <View key="tip1" style={styles.tipBox}>
          <View style={[styles.tipIconBox, { backgroundColor: themeColor + '20' }]}>
            <Lightbulb size={16} color={themeColor} />
          </View>
          <Text style={[styles.tipText, { color: themeColors.textPrimary }]}>
            {marker ? t('health.waistToHeightRule') : t('health.missingAbdomenForAbdominal')}
          </Text>
        </View>,
      );
    } else if (infoModal === 'waistToHip') {
      title = t('health.waistToHip');
      themeColor = '#F59E0B';
      IconComponent = Target;
      description = t('health.waistToHipDescription');
      formulaTitle = t('health.methodOfCalculation');
      const marker = abdominalHealth.waistToHip;

      calculationDetails = (
        <View style={styles.calculationContainer}>
          <Text style={styles.calcExplanation}>
            <Text style={{ fontWeight: '700' }}>{t('health.formulaLabel')} </Text>
            {t('health.waistToHipFormula')}
          </Text>
          <View style={styles.calcDivider} />
          <Text style={styles.calcExplanation}>{t('health.waistToHipRule')}</Text>
          <View style={styles.calcDivider} />
          <Text style={[styles.calcExplanation, { fontWeight: '700', color: themeColor, fontSize: 16 }]}>
            {t('health.resultLabel')} {marker ? marker.value.toFixed(2) : '--'}
          </Text>
        </View>
      );

      tips.push(
        <View key="tip1" style={styles.tipBox}>
          <View style={[styles.tipIconBox, { backgroundColor: themeColor + '20' }]}>
            <Lightbulb size={16} color={themeColor} />
          </View>
          <Text style={[styles.tipText, { color: themeColors.textPrimary }]}>
            {marker ? t('health.waistToHipRule') : t('health.missingHipForWaistHip')}
          </Text>
        </View>,
      );
    } else if (infoModal === 'recomposition') {
      title = t('health.bodyChanges');
      themeColor = themeColors.primary;
      IconComponent = TrendingUp;
      description = t('health.bodyChangesExplanation');
      formulaTitle = t('health.dataCompared');
      calculationDetails = (
        <Text style={styles.calcExplanation}>
          {bodyChanges
            ? `${formatDate(bodyChanges.previousDate)} → ${formatDate(bodyChanges.currentDate)}`
            : t('health.bodyChangesMissing')}
        </Text>
      );
    }

    return (
      <Modal visible transparent animationType="slide" onRequestClose={() => setInfoModal(null)}>
        <View style={styles.modalOverlayBottom}>
          <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />

          {/* Backdrop to close */}
          <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={() => setInfoModal(null)} />

          <View style={[styles.sheetContent, dynamicStyles.sheetContent, { borderTopColor: themeColor }]}>
            {/* Header */}
            <View style={styles.sheetHeader}>
              <View style={[styles.sheetIconCircle, { backgroundColor: themeColor + '20' }]}>
                <IconComponent size={24} color={themeColor} />
              </View>
              <Text style={[styles.sheetTitle, { color: themeColors.textPrimary }]}>{title}</Text>
              <TouchableOpacity onPress={() => setInfoModal(null)} style={styles.sheetClose}>
                <X size={24} color={themeColors.textSecondary} />
              </TouchableOpacity>
            </View>

            {/* Scrollable Content */}
            <ScrollView
              showsVerticalScrollIndicator={true}
              style={styles.sheetScrollContent}
              contentContainerStyle={{ paddingBottom: 40 }}
              nestedScrollEnabled={true}
              bounces={true}
            >
              {/* Description */}
              <Text style={[styles.sheetDesc, { color: themeColors.textSecondary }]}>{description}</Text>

              {/* Calculation Card */}
              <View style={styles.sheetSection}>
                <Text style={[styles.sheetSectionTitle, { color: themeColors.textPrimary }]}>{formulaTitle}</Text>
                <View
                  style={[styles.sheetCard, { backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : colors.background }]}
                >
                  {calculationDetails}
                </View>
              </View>

              {/* Tips */}
              {tips.length > 0 && (
                <View style={styles.sheetSection}>
                  <Text style={[styles.sheetSectionTitle, { color: themeColors.textPrimary }]}>
                    {t('health.tipsAndRecs')}
                  </Text>
                  {tips.length > 0 && (
                    <View
                      style={[
                        styles.tipsContainer,
                        { backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : colors.background },
                      ]}
                    >
                      {tips}
                    </View>
                  )}
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    );
  };

  const RecalculateNoticeModal = () => {
    if (!recalculateNotice) return null;

    const notice = recalculateNotice;
    const noticeColor = notice === 'error' ? colors.danger : themeColors.primary;
    const title =
      notice === 'current'
        ? t('health.compositionAlreadyCurrentTitle')
        : notice === 'insufficient'
          ? t('health.cannotRecalculateTitle')
          : notice === 'success'
            ? t('health.recalculateSuccessTitle')
            : t('common.error');
    const message =
      notice === 'current'
        ? t('health.compositionAlreadyCurrentMessage')
        : notice === 'insufficient'
          ? t('health.recalculateInsufficientData')
          : notice === 'success'
            ? t('health.recalculateSuccessMessage')
            : t('health.recalculateUnexpectedError');
    const NoticeIcon = notice === 'success' ? TrendingUp : notice === 'error' ? X : Info;

    return (
      <Modal
        visible
        transparent
        animationType="fade"
        onRequestClose={() => setRecalculateNotice(null)}
        statusBarTranslucent
      >
        <View style={styles.noticeModalOverlay}>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={t('common.close')}
            style={StyleSheet.absoluteFill}
            activeOpacity={1}
            onPress={() => setRecalculateNotice(null)}
          />
          <View style={[styles.noticeModalCard, dynamicStyles.modalContent]}>
            <View style={[styles.noticeIcon, { backgroundColor: noticeColor + '20' }]}>
              <NoticeIcon size={25} color={noticeColor} />
            </View>
            <Text style={[styles.noticeTitle, { color: themeColors.textPrimary }]}>{title}</Text>
            <Text style={[styles.noticeMessage, { color: themeColors.textSecondary }]}>{message}</Text>
            <TouchableOpacity
              accessibilityRole="button"
              onPress={() => setRecalculateNotice(null)}
              style={[styles.noticeButton, { backgroundColor: themeColors.primary }]}
            >
              <Text style={[styles.noticeButtonText, { color: themeColors.white }]}>{t('common.gotIt')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    );
  };

  // --- METRIC CARD COMPONENT ---
  interface MetricCardProps {
    icon: LucideIcon;
    iconColor: string;
    title: string;
    value: string | number;
    unit?: string;
    badge?: string;
    badgeColor?: string;
    onInfoPress: () => void;
    delta?: number;
    deltaUnit?: string;
    comparisonNote?: string;
    children?: React.ReactNode;
  }

  const MetricCard = ({
    icon: Icon,
    iconColor,
    title,
    value,
    unit,
    badge,
    badgeColor,
    onInfoPress,
    delta,
    deltaUnit,
    comparisonNote,
    children,
  }: MetricCardProps) => (
    <View style={[styles.metricCard, dynamicStyles.glassCard]}>
      <View style={styles.metricHeader}>
        <View style={[styles.iconBadge, { backgroundColor: iconColor + '15' }]}>
          <Icon size={20} color={iconColor} />
        </View>
        <Text style={[styles.metricTitle, { color: themeColors.textPrimary }]}>{title}</Text>
        <TouchableOpacity style={styles.infoBtn} onPress={onInfoPress}>
          <Info size={18} color={themeColors.textSecondary} />
        </TouchableOpacity>
      </View>

      <View style={styles.metricBody}>
        <View style={styles.valueContainer}>
          <Text
            style={[
              styles.bigValue,
              typeof value === 'string' && value.length > 8 && styles.mediumValue,
              { color: themeColors.textPrimary },
            ]}
          >
            {value}
          </Text>
          {unit && <Text style={[styles.unitText, { color: themeColors.textSecondary }]}>{unit}</Text>}
          {delta !== undefined && delta !== 0 && (
            <View style={styles.deltaContainer}>
              <Text style={[styles.deltaText, { color: themeColors.textSecondary }]}>
                {delta > 0 ? '+' : ''}
                {delta.toFixed(1)}
                {deltaUnit || ''}
              </Text>
            </View>
          )}
        </View>
        {badge && (
          <View style={[styles.badge, { backgroundColor: badgeColor || themeColors.primary }]}>
            <Text style={styles.badgeText}>{badge}</Text>
          </View>
        )}
      </View>
      {comparisonNote ? (
        <Text style={[styles.comparisonText, { color: themeColors.textSecondary }]}>{comparisonNote}</Text>
      ) : null}
      {children}
    </View>
  );

  return (
    <LinearGradient colors={dynamicStyles.gradientColors} style={styles.safeArea}>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <InfoModal />
        <RecalculateNoticeModal />

        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <ChevronLeft size={28} color={themeColors.textPrimary} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, dynamicStyles.title]}>{t('health.composition')}</Text>
          <View style={{ width: 28 }} />
        </View>

        <ScrollView
          contentContainerStyle={[
            styles.content,
            { paddingBottom: topFromScreenBottom + TAB_BAR_CLEARANCE + spacing.l },
          ]}
          showsVerticalScrollIndicator={false}
        >
          <Text style={[styles.changesPeriod, { color: themeColors.textSecondary }]}>
            {t('health.compositionAutomatic')}
            {bodyComposition.sourceDate ? ` · ${formatDate(bodyComposition.sourceDate)}` : ''}
          </Text>
          {bodyComposition.historicalDate && (
            <Text style={[styles.changesPeriod, { color: themeColors.textSecondary }]}>
              {t('health.compositionHistorical', { date: formatDate(bodyComposition.historicalDate) })}
            </Text>
          )}
          {bodyComposition.measuredBodyFat != null && (
            <Text style={[styles.changesPeriod, { color: themeColors.textSecondary }]}>
              {t('health.compositionMeasuredFat', {
                value: bodyComposition.measuredBodyFat.toLocaleString(getLocaleTag(), { maximumFractionDigits: 1 }),
              })}
            </Text>
          )}
          {bodyComposition.measuredMuscleMass != null && (
            <Text style={[styles.changesPeriod, { color: themeColors.textSecondary }]}>
              {t('health.compositionMeasuredMuscle', {
                value: bodyComposition.measuredMuscleMass.toLocaleString(getLocaleTag(), { maximumFractionDigits: 1 }),
              })}
            </Text>
          )}
          {/* 1. IMC */}
          <MetricCard
            icon={Activity}
            iconColor="#3B82F6"
            title={t('health.imc')}
            value={bodyComposition.bmi?.value || '--'}
            badge={currentBmiCategory ? (isSpanish ? currentBmiCategory.labelEs : currentBmiCategory.label) : undefined}
            badgeColor={currentBmiCategory?.color}
            delta={deltas.bmi ?? undefined}
            onInfoPress={() => setInfoModal('bmi')}
          >
            {bodyComposition.bmi?.adultCategoriesApplicable && (
              <>
                <View style={styles.rangeWrapper}>
                  <RangeBar
                    hideLegend={true}
                    showCutoffs={true}
                    formatCutoff={cutoff => {
                      if (Math.abs(cutoff - Math.round(cutoff)) < 0.05) {
                        return Math.round(cutoff).toString();
                      }
                      return cutoff.toFixed(1);
                    }}
                    label=""
                    value={bodyComposition.bmi.value}
                    min={BMI_BAR_CONFIG.min}
                    max={BMI_BAR_CONFIG.max}
                    segments={bmiSegments}
                  />
                </View>
                {!bodyComposition.availableData.hasFullAnthropometry && (
                  <View
                    style={[
                      styles.inlineTipBox,
                      { backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : colors.background },
                    ]}
                  >
                    <View style={[styles.inlineTipIcon, { backgroundColor: '#3B82F620' }]}>
                      <Lightbulb size={14} color="#3B82F6" />
                    </View>
                    <Text style={[styles.inlineTipText, { color: themeColors.textSecondary }]}>
                      {t('health.addMeasurementsPrompt')}
                    </Text>
                  </View>
                )}
              </>
            )}
          </MetricCard>

          {/* 2. BODY FAT */}
          <MetricCard
            icon={Percent}
            iconColor="#10B981"
            title={t('health.bodyFat')}
            value={bodyComposition.bodyFat?.percentage || '--'}
            unit={bodyComposition.bodyFat ? '%' : undefined}
            badge={
              currentBodyFatCategory
                ? isSpanish
                  ? currentBodyFatCategory.labelEs
                  : currentBodyFatCategory.label
                : undefined
            }
            badgeColor={currentBodyFatCategory?.color}
            delta={deltas.bodyFat ?? undefined}
            comparisonNote={deltas.bodyFatMethodChanged ? t('health.methodUpdated') : undefined}
            onInfoPress={() => setInfoModal('bodyFat')}
          >
            {bodyComposition.bodyFat && (
              <Text style={[styles.changesPeriod, { color: themeColors.textSecondary }]}>
                {bodyComposition.bodyFat.method === 'rfm'
                  ? t('health.rfm')
                  : bodyComposition.bodyFat.method === 'cun_bae'
                    ? t('health.cun_bae')
                    : bodyComposition.bodyFat.method === 'bai'
                      ? t('health.bai')
                      : t('health.estimation')}
              </Text>
            )}
            {bodyComposition.bodyFat && hasDemographicRanges && (
              <>
                <View style={styles.rangeWrapper}>
                  <RangeBar
                    hideLegend={true}
                    showCutoffs={true}
                    label=""
                    value={bodyComposition.bodyFat.percentage}
                    min={BODY_FAT_BAR_CONFIG.min}
                    max={BODY_FAT_BAR_CONFIG.max}
                    segments={bodyFatSegments}
                  />
                </View>
                {!bodyComposition.availableData?.hasFullAnthropometry && (
                  <View
                    style={[
                      styles.inlineTipBox,
                      { backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : colors.background },
                    ]}
                  >
                    <View style={[styles.inlineTipIcon, { backgroundColor: '#10B98120' }]}>
                      <TrendingUp size={14} color="#10B981" />
                    </View>
                    <Text style={[styles.inlineTipText, { color: themeColors.textSecondary }]}>
                      {t('health.bodyFatImprovePrecisionBody')}
                    </Text>
                  </View>
                )}
              </>
            )}
          </MetricCard>

          {/* 3. MUSCLE */}
          <MetricCard
            icon={Dumbbell}
            iconColor="#047857"
            title={t('health.muscleMass')}
            value={bodyComposition.muscle?.percentage || '--'}
            unit={bodyComposition.muscle ? '%' : undefined}
            badge={
              currentMuscleCategory
                ? isSpanish
                  ? currentMuscleCategory.labelEs
                  : currentMuscleCategory.label
                : undefined
            }
            badgeColor={currentMuscleCategory?.color}
            delta={deltas.muscle ?? undefined}
            comparisonNote={deltas.muscleMethodChanged ? t('health.methodUpdated') : undefined}
            onInfoPress={() => setInfoModal('muscle')}
          >
            {bodyComposition.muscle && hasDemographicRanges && (
              <>
                <View style={styles.rangeWrapper}>
                  <RangeBar
                    hideLegend={true}
                    showCutoffs={true}
                    label=""
                    value={bodyComposition.muscle.percentage}
                    min={isFemale ? MUSCLE_BAR_CONFIG.femaleMin : MUSCLE_BAR_CONFIG.maleMin}
                    max={isFemale ? MUSCLE_BAR_CONFIG.femaleMax : MUSCLE_BAR_CONFIG.maleMax}
                    segments={muscleSegments}
                  />
                </View>
                {!(
                  bodyComposition.muscle?.method === 'al_gindan' || bodyComposition.muscle?.method === 'anthropometric'
                ) && (
                  <View
                    style={[
                      styles.inlineTipBox,
                      { backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : colors.background },
                    ]}
                  >
                    <View style={[styles.inlineTipIcon, { backgroundColor: '#04785720' }]}>
                      <TrendingUp size={14} color="#047857" />
                    </View>
                    <Text style={[styles.inlineTipText, { color: themeColors.textSecondary }]}>
                      {t('health.muscleImprovePrecisionBody')}
                    </Text>
                  </View>
                )}
              </>
            )}
          </MetricCard>

          {/* Global Recalculate Button */}
          {/* 4. ABDOMINAL HEALTH */}
          <Text style={[styles.sectionTitle, { color: themeColors.textPrimary }]}>{t('health.abdominalHealth')}</Text>
          <MetricCard
            icon={Target}
            iconColor="#0EA5E9"
            title={t('health.waistToHeight')}
            value={abdominalHealth.waistToHeight?.value.toFixed(2) || '--'}
            badge={
              abdominalHealth.waistToHeight ? translateDynamicKey(abdominalHealth.waistToHeight.labelKey) : undefined
            }
            badgeColor={abdominalHealth.waistToHeight?.color}
            onInfoPress={() => setInfoModal('waistToHeight')}
          >
            {abdominalHealth.waistToHeight && (
              <View style={styles.rangeWrapper}>
                <RangeBar
                  hideLegend={true}
                  showCutoffs={true}
                  formatCutoff={cutoff => cutoff.toFixed(2)}
                  label=""
                  value={abdominalHealth.waistToHeight.value}
                  min={waistToHeightRange.min}
                  max={waistToHeightRange.max}
                  segments={waistToHeightSegments}
                  equalWidths={false}
                />
              </View>
            )}
            <View
              style={[styles.inlineTipBox, { backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : colors.background }]}
            >
              <View style={[styles.inlineTipIcon, { backgroundColor: '#0EA5E920' }]}>
                <Lightbulb size={14} color="#0EA5E9" />
              </View>
              <Text style={[styles.inlineTipText, { color: themeColors.textSecondary }]}>
                {abdominalHealth.waistToHeight
                  ? t('health.waistToHeightSummary')
                  : t('health.missingAbdomenForAbdominal')}
              </Text>
            </View>
          </MetricCard>

          <MetricCard
            icon={Target}
            iconColor="#F59E0B"
            title={t('health.waistToHip')}
            value={abdominalHealth.waistToHip?.value.toFixed(2) || '--'}
            badge={abdominalHealth.waistToHip ? translateDynamicKey(abdominalHealth.waistToHip.labelKey) : undefined}
            badgeColor={abdominalHealth.waistToHip?.color}
            onInfoPress={() => setInfoModal('waistToHip')}
          >
            {abdominalHealth.waistToHip && waistToHipRange && (
              <View style={styles.rangeWrapper}>
                <RangeBar
                  hideLegend={true}
                  showCutoffs={true}
                  formatCutoff={cutoff => cutoff.toFixed(2)}
                  label=""
                  value={abdominalHealth.waistToHip.value}
                  min={waistToHipRange.min}
                  max={waistToHipRange.max}
                  segments={waistToHipSegments}
                  equalWidths={false}
                />
              </View>
            )}
            <View
              style={[styles.inlineTipBox, { backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : colors.background }]}
            >
              <View style={[styles.inlineTipIcon, { backgroundColor: '#F59E0B20' }]}>
                <Lightbulb size={14} color="#F59E0B" />
              </View>
              <Text style={[styles.inlineTipText, { color: themeColors.textSecondary }]}>
                {abdominalHealth.waistToHip ? t('health.waistToHipSummary') : t('health.missingHipForWaistHip')}
              </Text>
            </View>
          </MetricCard>

          <View style={[styles.metricCard, dynamicStyles.glassCard]}>
            <View style={styles.metricHeader}>
              <View style={[styles.iconBadge, { backgroundColor: `${themeColors.primary}15` }]}>
                <TrendingUp size={20} color={themeColors.primary} />
              </View>
              <Text style={[styles.metricTitle, { color: themeColors.textPrimary }]}>{t('health.bodyChanges')}</Text>
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel={t('health.bodyChanges')}
                style={styles.infoBtn}
                onPress={() => setInfoModal('recomposition')}
              >
                <Info size={20} color={themeColors.textSecondary} />
              </TouchableOpacity>
            </View>
            {bodyChanges ? (
              <>
                <Text style={[styles.changesPeriod, { color: themeColors.textSecondary }]}>
                  {formatDate(bodyChanges.previousDate)} → {formatDate(bodyChanges.currentDate)}
                </Text>
                {bodyChanges.changes.map(change => (
                  <View key={change.key} style={[styles.changeRow, { borderBottomColor: themeColors.border }]}>
                    <Text style={[styles.changeLabel, { color: themeColors.textPrimary }]}>
                      {changeLabels[change.key]}
                    </Text>
                    <Text style={[styles.changeValue, { color: themeColors.textPrimary }]}>
                      {change.difference > 0 ? '+' : ''}
                      {(change.unit === 'kg'
                        ? convertWeightToUi(change.difference).value
                        : change.difference
                      ).toLocaleString(getLocaleTag(), { maximumFractionDigits: 1 })}{' '}
                      {change.unit === 'kg' ? units.weight : t('health.cm')}
                    </Text>
                  </View>
                ))}
              </>
            ) : (
              <Text style={[styles.changesPeriod, { color: themeColors.textSecondary }]}>
                {t('health.bodyChangesMissing')}
              </Text>
            )}
            <Text style={[styles.changesNote, { color: themeColors.textSecondary }]}>
              {t('health.bodyChangesExplanation')}
            </Text>
            {(deltas.bodyFatMethodChanged || deltas.muscleMethodChanged) && (
              <Text style={[styles.changesNote, { color: themeColors.textSecondary }]}>
                {t('health.bodyChangesMethod')}
              </Text>
            )}
          </View>

          {/* 4. MASS BREAKDOWN (Combined Lean/Fat/Muscle kg) */}
          {latestWeight && bodyComposition.leanMassKg && (
            <GlassCard style={styles.massCard}>
              <Text style={[styles.sectionTitle, { color: themeColors.textPrimary }]}>
                {t('health.weightDistribution')}
              </Text>
              <View style={styles.massRow}>
                {/* Muscle */}
                <TouchableOpacity style={styles.massItem} onPress={() => setInfoModal('muscle')}>
                  <Text style={[styles.massLabel, { color: themeColors.textSecondary }]}>{t('health.muscle')}</Text>
                  <Text style={[styles.massValue, { color: '#8B5CF6' }]}>
                    {bodyComposition.muscleMassKg || '--'}{' '}
                    <Text style={[styles.massUnit, { color: themeColors.textSecondary }]}>{t('health.unitKg')}</Text>
                  </Text>
                </TouchableOpacity>

                <View style={styles.massDivider} />

                {/* Fat */}
                <TouchableOpacity style={styles.massItem} onPress={() => setInfoModal('bodyFat')}>
                  <Text style={[styles.massLabel, { color: themeColors.textSecondary }]}>{t('health.fat')}</Text>
                  <Text style={[styles.massValue, { color: '#10B981' }]}>
                    {bodyComposition.fatMassKg || '--'}{' '}
                    <Text style={[styles.massUnit, { color: themeColors.textSecondary }]}>{t('health.unitKg')}</Text>
                  </Text>
                </TouchableOpacity>

                <View style={styles.massDivider} />

                {/* Lean (Residual: Bone/Water/Organs) */}
                <TouchableOpacity style={styles.massItem} onPress={() => setInfoModal('remainder')}>
                  <Text style={[styles.massLabel, { color: themeColors.textSecondary }]}>{t('health.remainder')}</Text>
                  <Text style={[styles.massValue, { color: themeColors.textPrimary }]}>
                    {bodyComposition.residualMassKg || '--'}{' '}
                    <Text style={[styles.massUnit, { color: themeColors.textSecondary }]}>{t('health.unitKg')}</Text>
                  </Text>
                </TouchableOpacity>
              </View>
            </GlassCard>
          )}

          <Text style={[styles.disclaimer, { color: themeColors.textSecondary }]}>
            {t('health.compositionEstimatesDisclaimer')}
          </Text>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityState={{
              disabled: compositionQuery.isFetching,
              busy: compositionQuery.isFetching,
            }}
            disabled={compositionQuery.isFetching}
            onPress={() => void handleRecalculate()}
            style={[
              styles.recalculateButton,
              {
                borderColor: themeColors.primary,
                opacity: compositionQuery.isFetching ? 0.45 : 1,
              },
            ]}
          >
            <RotateCw size={19} color={themeColors.primary} />
            <Text style={[styles.recalculateText, { color: themeColors.primary }]}>
              {t('health.recalculateComposition')}
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.m,
    paddingVertical: spacing.m,
  },
  backButton: {
    padding: spacing.xs,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  content: {
    padding: spacing.m,
    paddingBottom: 120,
  },
  metricCard: {
    borderRadius: borderRadius.l,
    padding: spacing.l,
    marginBottom: spacing.l,
    // Shadow removed - handled by dynamicStyles.glassCard
  },
  metricHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.m,
  },
  iconBadge: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.s,
  },
  metricTitle: {
    flexShrink: 1,
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  infoBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  metricBody: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: spacing.m,
  },
  valueContainer: {
    flex: 1,
    flexWrap: 'wrap',
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  bigValue: {
    fontSize: 42,
    fontWeight: '800',
    color: colors.textPrimary,
    letterSpacing: -1,
  },
  mediumValue: {
    flexShrink: 1,
    fontSize: 26,
    lineHeight: 32,
    letterSpacing: 0,
  },
  unitText: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.textSecondary,
    marginLeft: 4,
  },
  changesPeriod: { fontSize: 13, lineHeight: 20, marginBottom: spacing.s },
  changeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.m,
    paddingVertical: spacing.s,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  changeLabel: { fontSize: 15, flex: 1 },
  changeValue: { fontSize: 16, fontWeight: '600', fontVariant: ['tabular-nums'] },
  changesNote: { fontSize: 13, lineHeight: 20, marginTop: spacing.m },
  deltaContainer: {
    marginLeft: 12,
  },
  deltaText: {
    fontSize: 18,
    fontWeight: '600',
  },
  comparisonText: {
    fontSize: 12,
    marginTop: -8,
    marginBottom: spacing.s,
  },
  badge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  badgeText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
  },
  rangeWrapper: {
    marginTop: 4,
  },
  methodText: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 8,
    fontStyle: 'italic',
  },
  // Mass Card
  massCard: {
    padding: spacing.l,
    marginBottom: spacing.l,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.l,
    textAlign: 'center',
  },
  massRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  massItem: {
    flex: 1,
    alignItems: 'center',
  },
  massDivider: {
    width: 1,
    height: 40,
    backgroundColor: colors.border,
  },
  massLabel: {
    fontSize: 13,
    color: colors.textSecondary,
    marginBottom: 4,
  },
  massValue: {
    fontSize: 20,
    fontWeight: '700',
  },
  massUnit: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.textSecondary,
  },
  disclaimer: {
    fontSize: 12,
    color: colors.textSecondary,
    textAlign: 'center',
    opacity: 0.7,
    paddingHorizontal: spacing.l,
  },
  recalculateButton: {
    alignSelf: 'center',
    minHeight: 48,
    marginTop: spacing.m,
    paddingHorizontal: spacing.l,
    borderWidth: 1,
    borderRadius: borderRadius.l,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.s,
  },
  recalculateText: {
    fontSize: 15,
    fontWeight: '600',
  },
  // Modal

  noticeModalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.l,
    backgroundColor: 'rgba(0,0,0,0.48)',
  },
  noticeModalCard: {
    width: '100%',
    maxWidth: 420,
    alignItems: 'center',
    padding: spacing.xl,
    borderRadius: borderRadius.l,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    elevation: 20,
  },
  noticeIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.m,
  },
  noticeTitle: {
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
  },
  noticeMessage: {
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    marginTop: spacing.s,
  },
  noticeButton: {
    width: '100%',
    minHeight: 46,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: borderRadius.m,
    marginTop: spacing.l,
  },
  noticeButtonText: {
    fontSize: 15,
    fontWeight: '700',
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  blurContainer: {
    width: '90%',
    maxHeight: '80%',
    borderRadius: 24,
    overflow: 'hidden',
  },
  modalContent: {
    backgroundColor: colors.surface,
    padding: 24,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  closeBtn: {
    padding: 4,
  },
  infoSection: {
    marginBottom: 24,
  },
  infoIconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 8,
  },
  infoSectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  infoText: {
    fontSize: 15,
    color: colors.textSecondary,
    lineHeight: 22,
  },
  formulaBox: {
    backgroundColor: colors.background,
    padding: 16,
    borderRadius: 16,
  },
  formulaText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 8,
  },
  formulaDetail: {
    fontSize: 13,
    color: colors.textSecondary,
    fontFamily: 'monospace', // Monospace for numbers looks techy
    marginBottom: 4,
  },
  formulaResult: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.primary,
    marginTop: 8,
  },
  tipsList: {
    gap: 8,
  },
  tipItem: {
    fontSize: 14,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  // CTA Styles
  ctaCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.l,
    padding: spacing.m,
    marginBottom: spacing.l,
    borderWidth: 1,
    borderColor: '#F59E0B30',
  },
  ctaContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  ctaTextContainer: {
    flex: 1,
    marginHorizontal: spacing.s,
  },
  ctaTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 2,
  },
  ctaDesc: {
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 16,
  },
  // Modales Bottom Sheet Styles
  modalOverlayBottom: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheetContent: {
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    paddingTop: 8,
    paddingHorizontal: 20,
    paddingBottom: 40,
    maxHeight: '85%',
    borderTopWidth: 4,
    // Background handled dynamically
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 20,
  },
  sheetScrollContent: {
    flexGrow: 1,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  sheetIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  sheetTitle: {
    flex: 1,
    fontSize: 22,
    fontWeight: 'bold',
    color: colors.textPrimary,
  },
  sheetClose: {
    padding: 4,
  },
  sheetDesc: {
    fontSize: 16,
    lineHeight: 24,
    marginBottom: 24,
  },
  sheetSection: {
    marginBottom: 24,
  },
  sheetSectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  sheetCard: {
    padding: 16,
    borderRadius: 16,
  },
  calculationContainer: {
    gap: 8,
  },
  calculationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  methodTag: {
    alignSelf: 'flex-start',
    backgroundColor: colors.surface,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  methodTagText: {
    fontSize: 11,
    fontWeight: '700',
  },
  calcLabel: {
    fontSize: 12,
    color: colors.textSecondary,
    marginBottom: 2,
  },
  calcValue: {
    fontSize: 24,
    fontWeight: '800',
  },
  calcDivider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: 12,
  },
  calcExplanation: {
    fontSize: 14,
    color: colors.textSecondary,
    lineHeight: 22,
    marginBottom: 4,
  },
  sectionSubtitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: 8,
    marginTop: 12,
  },
  advancedMarkerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 6,
  },
  advancedMarkerCopy: {
    flex: 1,
  },
  advancedMarkerValue: {
    fontSize: 16,
    fontWeight: '700',
  },
  tipsContainer: {
    gap: 12,
  },
  tipBox: {
    flexDirection: 'row',
    gap: 12,
    padding: 12,
    borderRadius: 12,
    alignItems: 'flex-start',
  },
  tipIconBox: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tipText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
  },
  // Inline tip styles (inside MetricCard)
  inlineTipBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
  },
  inlineTipIcon: {
    width: 24,
    height: 24,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inlineTipText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
  },
});
