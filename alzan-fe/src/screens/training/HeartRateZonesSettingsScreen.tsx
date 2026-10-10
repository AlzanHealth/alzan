import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';
import { useFocusEffect } from '@react-navigation/native';
import { AlertTriangle, ChevronDown, RefreshCw } from 'lucide-react-native';
import { useCallback } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTrainingStyles } from '../../hooks/useTrainingStyles';
import { useHeartRateZones } from '../../modules/training/hooks/useHeartRateZones';
import {
  HEART_RATE_ZONE_COLORS,
  getHeartRateZoneDescriptionKey,
  getHeartRateZonePercentKey,
  getHeartRateReserveZonePercentKey,
  parseHeartRateInput,
  validateHeartRateZones,
  type HeartRateZone,
} from '../../modules/training/helpers/heartRateZones.helper';
import { spacing, typography, borderRadius } from '../../theme';

const EMPTY_ZONES: HeartRateZone[] = [1, 2, 3, 4, 5].map(zone => ({
  zone: zone as HeartRateZone['zone'],
  min: zone === 1 ? 0 : 0,
  max: 0,
}));

export const HeartRateZonesSettingsScreen = () => {
  const { t } = useTranslation();
  const { styles: dynamicStyles, colors: themeColors } = useTrainingStyles();
  const insets = useSafeAreaInsets();
  const {
    zoneProfile,
    restingHeartRate,
    latestRestingHeartRate,
    restingHeartRateSamples,
    peakHeartRate,
    trainingEvidence,
    loading,
    saving,
    error,
    age,
    reload,
    recalculate,
    recalculateFromReserve,
    saveManual,
    saveManualMaximum,
  } = useHeartRateZones();
  const [manualZones, setManualZones] = useState<HeartRateZone[]>(EMPTY_ZONES);
  const [manualMax, setManualMax] = useState('');
  const [feedback, setFeedback] = useState<string | null>(null);
  const [isEditorExpanded, setIsEditorExpanded] = useState(false);
  const [manualMeasured, setManualMeasured] = useState(false);

  useFocusEffect(useCallback(() => void reload(), [reload]));

  useEffect(() => {
    setManualZones(zoneProfile?.zones.map(zone => ({ ...zone })) ?? EMPTY_ZONES);
    setManualMax(zoneProfile ? String(zoneProfile.maxHeartRate) : '');
    setManualMeasured(zoneProfile?.method === 'measured');
  }, [zoneProfile]);

  const validation = useMemo(() => validateHeartRateZones(manualZones), [manualZones]);
  const validationMessage =
    validation === 'incomplete'
      ? t('training.heartRateValidationIncomplete')
      : validation === 'invalid'
        ? t('training.heartRateValidationInvalid')
        : validation === 'overlap'
          ? t('training.heartRateValidationOverlap')
          : validation === 'gap'
            ? t('training.heartRateValidationGap')
            : null;

  const updateZone = (index: number, field: 'min' | 'max', value: string) => {
    const parsed = parseHeartRateInput(value);
    setManualZones(current =>
      current.map((zone, zoneIndex) => (zoneIndex === index ? { ...zone, [field]: parsed ?? Number.NaN } : zone)),
    );
  };

  const handleRecalculate = async () => {
    try {
      const updated = await recalculate();
      setFeedback(updated ? null : t(age === null ? 'training.heartRateNoAge' : 'training.heartRateAdultOnly'));
    } catch {
      setFeedback(t('training.heartRateSaveError'));
    }
  };

  const handleSaveManual = async () => {
    const maxHeartRate = parseHeartRateInput(manualMax);
    if (validation || maxHeartRate === null || maxHeartRate !== manualZones[4].max || maxHeartRate > 250) {
      setFeedback(validationMessage ?? t('training.heartRateValidationInvalid'));
      return;
    }
    try {
      await saveManual(maxHeartRate, manualZones, manualMeasured);
      setFeedback(null);
    } catch {
      setFeedback(t('training.heartRateSaveError'));
    }
  };

  const handleSaveManualMaximum = async () => {
    const maxHeartRate = parseHeartRateInput(manualMax);
    if (maxHeartRate === null || maxHeartRate < 60 || maxHeartRate > 250) {
      setFeedback(t('training.heartRateValidationInvalid'));
      return;
    }
    try {
      await saveManualMaximum(maxHeartRate);
      setFeedback(null);
    } catch {
      setFeedback(t('training.heartRateSaveError'));
    }
  };

  const handleRecalculateFromReserve = async () => {
    try {
      const updated = await recalculateFromReserve();
      setFeedback(updated ? null : t('training.heartRateReserveUnavailable'));
    } catch {
      setFeedback(t('training.heartRateSaveError'));
    }
  };

  const handleUseRepeatedPeak = async () => {
    if (trainingEvidence.repeatablePeak === null) return;
    try {
      await saveManualMaximum(trainingEvidence.repeatablePeak);
      setFeedback(null);
    } catch {
      setFeedback(t('training.heartRateSaveError'));
    }
  };

  return (
    <LinearGradient colors={dynamicStyles.gradientColors} style={styles.flex}>
      <SafeAreaView style={[styles.flex, dynamicStyles.container]} edges={['bottom']}>
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 190 }]}
          showsVerticalScrollIndicator
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          nestedScrollEnabled
        >
          <Text style={[styles.title, dynamicStyles.title]}>{t('training.heartRateZonesTitle')}</Text>
          <Text style={[styles.description, dynamicStyles.sublabel]}>{t('training.heartRateZonesDescription')}</Text>
          <View style={[styles.infoCard, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
            <Text style={[styles.body, dynamicStyles.sublabel]}>{t('training.heartRateZonesInfo')}</Text>
          </View>

          {loading ? (
            <ActivityIndicator color={themeColors.primary} style={styles.loader} />
          ) : (
            <>
              {zoneProfile ? (
                <View style={styles.zonesLayout}>
                  <View
                    style={styles.zoneRail}
                    accessibilityElementsHidden
                    importantForAccessibility="no-hide-descendants"
                  >
                    {zoneProfile.zones
                      .slice()
                      .reverse()
                      .map(zone => (
                        <View
                          key={zone.zone}
                          style={[styles.railSegment, { backgroundColor: HEART_RATE_ZONE_COLORS[zone.zone - 1] }]}
                        />
                      ))}
                  </View>
                  <View style={styles.zoneContent}>
                    <View style={[styles.maximumCard, dynamicStyles.card, { borderColor: themeColors.border }]}>
                      <Text style={[styles.maximumLabel, dynamicStyles.sublabel]}>{t('training.heartRateMax')}</Text>
                      <View style={styles.maximumValueRow}>
                        <Text style={[styles.maximumValue, dynamicStyles.title]}>{zoneProfile.maxHeartRate}</Text>
                        <Text style={[styles.maximumUnit, dynamicStyles.sublabel]}>
                          {t('training.heartRateMaxUnit')}
                        </Text>
                        <Text style={[styles.maximumPercent, dynamicStyles.sublabel]}>100%</Text>
                      </View>
                    </View>
                    {zoneProfile.zones
                      .slice()
                      .reverse()
                      .map(zone => {
                        const percentage =
                          zoneProfile.method === 'karvonen' && zoneProfile.restingHeartRate
                            ? `${Math.round(((zone.max - zoneProfile.restingHeartRate) / (zoneProfile.maxHeartRate - zoneProfile.restingHeartRate)) * 100)}%`
                            : `${Math.round((zone.max / zoneProfile.maxHeartRate) * 100)}%`;
                        return (
                          <View key={zone.zone} style={styles.zoneBlock}>
                            <View style={styles.zoneHeading}>
                              <View
                                style={[styles.zoneDot, { backgroundColor: HEART_RATE_ZONE_COLORS[zone.zone - 1] }]}
                              />
                              <View style={styles.zoneHeadingText}>
                                <Text style={[styles.zoneName, dynamicStyles.label]}>
                                  {t('training.heartRateZoneLabel', { zone: zone.zone })}
                                </Text>
                                <Text style={[styles.zoneDescription, dynamicStyles.sublabel]}>
                                  {t(getHeartRateZoneDescriptionKey(zone.zone))}
                                </Text>
                              </View>
                            </View>
                            <View style={[styles.rangeCard, dynamicStyles.card, { borderColor: themeColors.border }]}>
                              <Text style={[styles.rangeTitle, dynamicStyles.sublabel]}>
                                {zone.zone === 5
                                  ? t('training.heartRateZoneMaximum')
                                  : t('training.heartRateIntensity')}
                                {' · '}
                                {t(
                                  zoneProfile.method === 'karvonen'
                                    ? getHeartRateReserveZonePercentKey(zone.zone)
                                    : getHeartRateZonePercentKey(zone.zone),
                                )}
                              </Text>
                              <View style={styles.rangeValueRow}>
                                <Text style={[styles.rangeValue, dynamicStyles.title]}>
                                  {zone.min}–{zone.max}
                                </Text>
                                <Text style={[styles.rangeUnit, dynamicStyles.sublabel]}>
                                  {t('training.heartRateMaxUnit')}
                                </Text>
                                <Text style={[styles.rangePercent, dynamicStyles.sublabel]}>{percentage}</Text>
                              </View>
                            </View>
                          </View>
                        );
                      })}
                  </View>
                </View>
              ) : (
                <View style={[styles.card, dynamicStyles.card]}>
                  <Text style={[styles.body, dynamicStyles.sublabel]}>
                    {t(age === null ? 'training.heartRateNoAge' : 'training.heartRateAdultOnly')}
                  </Text>
                </View>
              )}

              <View style={[styles.card, dynamicStyles.card]}>
                <View style={styles.rowBetween}>
                  <Text style={[styles.sectionTitle, dynamicStyles.label]}>{t('training.heartRateResting')}</Text>
                  <Text style={[styles.source, dynamicStyles.sublabel]}>
                    {latestRestingHeartRate == null
                      ? t('training.heartRateRestingUnavailable')
                      : `${latestRestingHeartRate} ${t('training.heartRateMaxUnit')}`}
                  </Text>
                </View>
                <View style={styles.rowBetween}>
                  <Text style={[styles.source, dynamicStyles.sublabel]}>
                    {t('training.heartRateRestingBaseline', { count: restingHeartRateSamples })}
                  </Text>
                  <Text style={[styles.source, dynamicStyles.sublabel]}>
                    {restingHeartRate == null ? '—' : `${restingHeartRate} ${t('training.heartRateMaxUnit')}`}
                  </Text>
                </View>
              </View>

              {trainingEvidence.sessionCount > 0 && (
                <View style={[styles.card, dynamicStyles.card]}>
                  <Text style={[styles.sectionTitle, dynamicStyles.label]}>{t('training.heartRateHistoryTitle')}</Text>
                  <Text style={[styles.source, dynamicStyles.sublabel]}>
                    {t('training.heartRateHistorySummary', {
                      count: trainingEvidence.sessionCount,
                      peak: trainingEvidence.observedPeak ?? '—',
                    })}
                  </Text>
                  {trainingEvidence.repeatablePeak !== null && (
                    <Text style={[styles.source, dynamicStyles.sublabel]}>
                      {t('training.heartRateHistoryRepeat', { peak: trainingEvidence.repeatablePeak })}
                    </Text>
                  )}
                  <Text style={[styles.source, dynamicStyles.sublabel]}>{t('training.heartRateHistoryHint')}</Text>
                </View>
              )}

              {restingHeartRate !== null && (
                <TouchableOpacity
                  accessibilityRole="button"
                  style={[styles.secondaryButton, { borderColor: themeColors.primary }]}
                  onPress={() => void handleRecalculateFromReserve()}
                  disabled={saving}
                >
                  <Text style={[styles.secondaryButtonText, { color: themeColors.primary }]}>
                    {t('training.heartRateRecalculateReserve')}
                  </Text>
                </TouchableOpacity>
              )}

              {zoneProfile && (
                <View style={[styles.methodCard, { borderColor: themeColors.border }]}>
                  <Text style={[styles.source, dynamicStyles.sublabel]}>
                    {t('training.heartRateMethodLabel')}:{' '}
                    {t(
                      `training.heartRateSource${zoneProfile.method === 'tanaka' ? 'Age' : zoneProfile.method === 'karvonen' ? 'Karvonen' : zoneProfile.method === 'measured' ? 'Measured' : 'Manual'}`,
                    )}
                  </Text>
                  {zoneProfile.method === 'karvonen' && zoneProfile.restingHeartRate !== undefined && (
                    <Text style={[styles.source, dynamicStyles.sublabel]}>
                      {t('training.heartRateReserveUsed', {
                        value: zoneProfile.restingHeartRate,
                        count: zoneProfile.restingHeartRateSampleCount ?? 1,
                      })}
                    </Text>
                  )}
                </View>
              )}

              <TouchableOpacity
                accessibilityRole="button"
                style={[styles.primaryButton, { backgroundColor: themeColors.primary }]}
                onPress={() => void handleRecalculate()}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator color={themeColors.background} />
                ) : (
                  <>
                    <RefreshCw size={18} color={themeColors.background} />
                    <Text style={[styles.primaryButtonText, { color: themeColors.background }]}>
                      {t('training.heartRateRecalculate')}
                    </Text>
                  </>
                )}
              </TouchableOpacity>

              <View style={[styles.editorCard, dynamicStyles.card, { borderColor: themeColors.border }]}>
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityState={{ expanded: isEditorExpanded }}
                  style={styles.editorHeader}
                  onPress={() => setIsEditorExpanded(value => !value)}
                >
                  <View style={styles.editorHeaderText}>
                    <Text style={[styles.sectionTitle, dynamicStyles.label]}>{t('training.heartRateEditToggle')}</Text>
                    <Text style={[styles.source, dynamicStyles.sublabel]}>{t('training.heartRateManualTitle')}</Text>
                  </View>
                  <ChevronDown
                    size={20}
                    color={themeColors.textSecondary}
                    style={isEditorExpanded ? styles.chevronOpen : undefined}
                  />
                </TouchableOpacity>
                {isEditorExpanded && (
                  <View style={styles.editorBody}>
                    <Text style={[styles.body, dynamicStyles.sublabel]}>{t('training.heartRateManualHint')}</Text>
                    <Text style={[styles.fieldLabel, dynamicStyles.label]}>{t('training.heartRateMax')}</Text>
                    <TextInput
                      value={manualMax}
                      onChangeText={setManualMax}
                      keyboardType="number-pad"
                      placeholder="190"
                      placeholderTextColor={themeColors.textSecondary}
                      accessibilityLabel={t('training.heartRateMax')}
                      style={[styles.input, dynamicStyles.input]}
                    />
                    <TouchableOpacity
                      accessibilityRole="button"
                      style={[styles.secondaryButton, { borderColor: themeColors.primary }]}
                      onPress={() => void handleSaveManualMaximum()}
                      disabled={saving}
                    >
                      <Text style={[styles.secondaryButtonText, { color: themeColors.primary }]}>
                        {t('training.heartRateManualMaxSave')}
                      </Text>
                    </TouchableOpacity>
                    <View style={styles.measuredRow}>
                      <Text style={[styles.body, dynamicStyles.sublabel, styles.measuredLabel]}>
                        {t('training.heartRateMeasuredToggle')}
                      </Text>
                      <Switch
                        value={manualMeasured}
                        onValueChange={setManualMeasured}
                        accessibilityLabel={t('training.heartRateMeasuredToggle')}
                      />
                    </View>
                    {manualZones.map((zone, index) => (
                      <View key={zone.zone} style={styles.manualZone}>
                        <Text style={[styles.zoneLabel, dynamicStyles.label]}>
                          {t('training.heartRateZoneLabel', { zone: zone.zone })}
                        </Text>
                        <View style={styles.rangeInputs}>
                          <TextInput
                            value={
                              Number.isNaN(zone.min)
                                ? ''
                                : zone.min === 0 && index === 0
                                  ? '0'
                                  : zone.min === 0
                                    ? ''
                                    : String(zone.min)
                            }
                            onChangeText={value => updateZone(index, 'min', value)}
                            keyboardType="number-pad"
                            placeholder={t('training.heartRateMaxUnit')}
                            accessibilityLabel={`${t('training.heartRateZoneLabel', { zone: zone.zone })} min`}
                            style={[styles.input, styles.smallInput, dynamicStyles.input]}
                          />
                          <Text style={[styles.rangeSeparator, dynamicStyles.sublabel]}>–</Text>
                          <TextInput
                            value={Number.isNaN(zone.max) || zone.max === 0 ? '' : String(zone.max)}
                            onChangeText={value => updateZone(index, 'max', value)}
                            keyboardType="number-pad"
                            placeholder={t('training.heartRateMaxUnit')}
                            accessibilityLabel={`${t('training.heartRateZoneLabel', { zone: zone.zone })} max`}
                            style={[styles.input, styles.smallInput, dynamicStyles.input]}
                          />
                        </View>
                      </View>
                    ))}
                    {validationMessage && (
                      <Text style={[styles.errorText, { color: themeColors.danger }]}>{validationMessage}</Text>
                    )}
                    <TouchableOpacity
                      accessibilityRole="button"
                      style={[styles.secondaryButton, { borderColor: themeColors.primary }]}
                      onPress={() => void handleSaveManual()}
                      disabled={saving}
                    >
                      <Text style={[styles.secondaryButtonText, { color: themeColors.primary }]}>
                        {t('training.heartRateManualSave')}
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>

              {!!error && (
                <Text style={[styles.errorText, { color: themeColors.danger }]}>
                  {t('training.heartRateSaveError')}
                </Text>
              )}
              {!!feedback && <Text style={[styles.errorText, { color: themeColors.danger }]}>{feedback}</Text>}
              {zoneProfile && trainingEvidence.qualifiesForReview && peakHeartRate !== null && (
                <View style={[styles.warningCard, { borderColor: themeColors.border }]}>
                  <View style={styles.warningMessage}>
                    <AlertTriangle size={18} color={themeColors.primary} />
                    <Text style={[styles.body, dynamicStyles.sublabel, styles.warningText]}>
                      {t('training.heartRateReviewPeak', {
                        peak: peakHeartRate,
                        repeatedPeak: trainingEvidence.repeatablePeak,
                        count: trainingEvidence.sessionCount,
                      })}
                    </Text>
                  </View>
                  <TouchableOpacity
                    accessibilityRole="button"
                    style={[styles.secondaryButton, { borderColor: themeColors.primary }]}
                    onPress={() => void handleUseRepeatedPeak()}
                    disabled={saving}
                  >
                    <Text style={[styles.secondaryButtonText, { color: themeColors.primary }]}>
                      {t('training.heartRateUseRepeatedPeak', { peak: trainingEvidence.repeatablePeak })}
                    </Text>
                  </TouchableOpacity>
                </View>
              )}
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: spacing.m, paddingBottom: spacing.xl, gap: spacing.m },
  scrollView: { flex: 1 },
  title: { ...typography.h2, marginBottom: spacing.xs },
  description: { ...typography.body },
  infoCard: { borderWidth: 1, borderRadius: borderRadius.m, padding: spacing.m },
  card: { borderRadius: borderRadius.m, padding: spacing.m, gap: spacing.s },
  body: { ...typography.body },
  loader: { marginTop: spacing.xl },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.s },
  sectionTitle: { ...typography.h4 },
  maxValue: { ...typography.h3 },
  zonesLayout: { flexDirection: 'row', gap: spacing.m, alignItems: 'stretch' },
  zoneRail: {
    width: 6,
    marginLeft: 2,
    marginTop: 104,
    marginBottom: spacing.m,
    borderRadius: borderRadius.full,
    overflow: 'hidden',
  },
  railSegment: { flex: 1, minHeight: 72 },
  zoneContent: { flex: 1, gap: spacing.s },
  maximumCard: {
    borderWidth: 1,
    borderRadius: borderRadius.m,
    padding: spacing.m,
    gap: spacing.xs,
    marginBottom: spacing.s,
  },
  maximumLabel: { ...typography.body },
  maximumValueRow: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.xs },
  maximumValue: { ...typography.h2, fontWeight: '700' },
  maximumUnit: { ...typography.body },
  maximumPercent: { ...typography.body, marginLeft: 'auto' },
  zoneBlock: { gap: spacing.xs, marginBottom: spacing.s },
  zoneHeading: { flexDirection: 'row', alignItems: 'center', gap: spacing.s, minHeight: 54 },
  zoneDot: { width: 10, height: 10, borderRadius: borderRadius.full },
  zoneHeadingText: { gap: 2 },
  zoneName: { ...typography.h4 },
  zoneDescription: { ...typography.body },
  rangeCard: {
    borderWidth: 1,
    borderRadius: borderRadius.m,
    paddingHorizontal: spacing.m,
    paddingVertical: spacing.s,
    gap: spacing.xs,
  },
  rangeTitle: { ...typography.body },
  rangeValueRow: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.xs },
  rangeValue: { ...typography.h3, fontWeight: '700' },
  rangeUnit: { ...typography.body },
  rangePercent: { ...typography.body, marginLeft: 'auto' },
  source: { ...typography.caption },
  zoneRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.s,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  zoneLabel: { ...typography.body, fontWeight: '600' },
  zoneRange: { ...typography.body },
  primaryButton: {
    minHeight: 48,
    borderRadius: borderRadius.m,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: spacing.s,
  },
  primaryButtonText: { ...typography.button },
  fieldLabel: { ...typography.body },
  input: {
    minHeight: 44,
    borderWidth: 1,
    borderRadius: borderRadius.s,
    paddingHorizontal: spacing.s,
    color: '#111827',
  },
  manualZone: { gap: spacing.xs },
  rangeInputs: { flexDirection: 'row', alignItems: 'center', gap: spacing.s },
  smallInput: { flex: 1 },
  rangeSeparator: { ...typography.body },
  errorText: { ...typography.caption },
  secondaryButton: {
    minHeight: 46,
    borderWidth: 1,
    borderRadius: borderRadius.m,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: { ...typography.button },
  warningCard: {
    borderWidth: 1,
    borderRadius: borderRadius.m,
    padding: spacing.m,
    gap: spacing.s,
  },
  warningMessage: { flexDirection: 'row', gap: spacing.s, alignItems: 'center' },
  warningText: { flex: 1 },
  switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.s },
  methodCard: { borderWidth: 1, borderRadius: borderRadius.m, padding: spacing.s, gap: spacing.xs },
  measuredRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.s },
  measuredLabel: { flex: 1 },
  editorCard: { borderWidth: 1, borderRadius: borderRadius.m, overflow: 'hidden' },
  editorHeader: {
    minHeight: 64,
    paddingHorizontal: spacing.m,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  editorHeaderText: { gap: spacing.xs },
  editorBody: { padding: spacing.m, paddingTop: 0, gap: spacing.s },
  chevronOpen: { transform: [{ rotate: '180deg' }] },
});
