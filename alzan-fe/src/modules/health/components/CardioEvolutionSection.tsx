import React from 'react';
import { Activity, Check, CircleHelp, HeartPulse, Minus, TrendingDown, TrendingUp } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { GlassCard } from '../../../components/GlassCard';
import { SportIcon } from '../../../components/icons/SportIcon';
import { useHealthStyles } from '../../../hooks/useHealthStyles';
import { HEART_RATE_ZONE_COLORS } from '../../training/helpers/heartRateZones.helper';
import type { TranslationKey } from '../../../i18n/locales/en';
import { normalizeSportType } from '../../../utils/sportTypeNormalization';
import { CardioDimensionSummary } from './CardioDimensionSummary';
import {
  analyzeSportEvolution,
  type CardioConfidence,
  type CardioPeriod,
  type CardioSportEvolution,
} from '../algorithms/cardioEvolution';
import { evaluateCardioSport, type CardioSportEvaluation } from '../algorithms/cardioSportEvaluation';
import {
  buildCardioMeaningTranslationOptions,
  getCardioOnePeriodHeartRateMeaningKey,
} from '../algorithms/cardioSportPresentation';
import { shouldShowCardioIntervalRecovery } from '../algorithms/cardioEvolutionPresentation';
import { getPracticedCardioSports, type CardioSportOption } from '../algorithms/cardioSportNormalization';
import { useCardioEvolution, useCardioEvolutionDetails } from '../hooks/useCardioEvolution';

const SPORT_TRANSLATIONS: Record<string, TranslationKey> = {
  running: 'constants.running',
  cycling: 'constants.cycling',
  swimming: 'constants.swimming',
  strength: 'constants.strength',
  gym: 'constants.gym',
  trail: 'constants.trail',
  hiking: 'constants.hiking',
  hyrox: 'constants.hyrox',
  football: 'constants.football',
  basketball: 'constants.basketball',
  tennis: 'constants.tennis',
  padel: 'constants.padel',
  martial_arts: 'constants.martialArts',
  volleyball: 'constants.volleyball',
  climbing: 'constants.climbing',
  skiing: 'constants.skiing',
  snowboard: 'constants.snowboard',
  surf: 'constants.surfTitle',
  golf: 'constants.golf',
  other: 'constants.other',
};

const CONFIDENCE_TRANSLATIONS: Record<CardioConfidence, TranslationKey> = {
  high: 'health.cardioConfidencehigh',
  medium: 'health.cardioConfidencemedium',
  low: 'health.cardioConfidencelow',
  none: 'health.cardioConfidencenone',
};

const CONTEXT_TRANSLATIONS: Record<CardioSportEvolution['contextWarnings'][number], TranslationKey> = {
  temperature: 'health.cardioContexttemperature',
  elevation: 'health.cardioContextelevation',
  derived_speed: 'health.cardioContextderived_speed',
  swimming_sensor: 'health.cardioContextswimming_sensor',
  device: 'health.cardioContextdevice',
  heart_rate_quality: 'health.cardioContextheart_rate_quality',
  activity_quality: 'health.cardioContextactivity_quality',
  subtype: 'health.cardioContextsubtype',
};

const PERIOD_TRANSLATIONS: Record<CardioPeriod, TranslationKey> = {
  day: 'health.cardioPeriodDay',
  week: 'health.cardioPeriodWeek',
  month: 'health.cardioPeriodMonth',
  three_months: 'health.cardioPeriodThreeMonths',
  six_months: 'health.cardioPeriodSixMonths',
  all: 'health.cardioPeriodAll',
};

const LIMITATION_TRANSLATIONS: Record<string, TranslationKey> = {
  unrecognized_sport_type_generic_analysis: 'health.cardioLimitationUnrecognizedSport',
  sport_specific_performance_not_recorded: 'health.cardioLimitationNoSportPerformance',
  heart_rate_missing_in_one_period: 'health.cardioLimitationHeartRateMissing',
  few_comparable_performance_sessions: 'health.cardioLimitationFewComparableSessions',
  heart_rate_not_similar_or_not_recorded_for_some_pairs: 'health.cardioLimitationHeartRateNotComparable',
  some_comparison_context_missing: 'health.cardioLimitationContextMissing',
  comparable_sessions_do_not_span_two_weeks: 'health.cardioLimitationShortTimeSpan',
  no_recent_sessions_in_selected_period: 'health.cardioLimitationNoRecentSessions',
  wrist_heart_rate_and_swim_distance_can_be_less_reliable: 'health.cardioLimitationSwimmingSensor',
  load_comparison_does_not_verify_technique_or_range_of_motion: 'health.cardioLimitationStrengthTechnique',
};

const SPORT_CARDIO_MEANING_TRANSLATIONS: Record<string, TranslationKey> = {
  running: 'health.cardioAssessmentMeaningCRunning',
  trail: 'health.cardioAssessmentMeaningCTrail',
  hiking: 'health.cardioAssessmentMeaningCHiking',
  cycling: 'health.cardioAssessmentMeaningCCycling',
  swimming: 'health.cardioAssessmentMeaningCSwimming',
  strength: 'health.cardioAssessmentMeaningCStrength',
  gym: 'health.cardioAssessmentMeaningCStrength',
  football: 'health.cardioAssessmentMeaningCIntermittent',
  basketball: 'health.cardioAssessmentMeaningCIntermittent',
  tennis: 'health.cardioAssessmentMeaningCRacket',
  padel: 'health.cardioAssessmentMeaningCRacket',
  martial_arts: 'health.cardioAssessmentMeaningCMartialArts',
  volleyball: 'health.cardioAssessmentMeaningCIntermittent',
  hyrox: 'health.cardioAssessmentMeaningCHyrox',
  climbing: 'health.cardioAssessmentMeaningCClimbing',
  surf: 'health.cardioAssessmentMeaningCSurf',
  skiing: 'health.cardioAssessmentMeaningCSnow',
  snowboard: 'health.cardioAssessmentMeaningCSnow',
  golf: 'health.cardioAssessmentMeaningCGolf',
};

const SPORT_CARDIO_RECOMMENDATION_TRANSLATIONS: Record<string, TranslationKey> = {
  running: 'health.cardioAssessmentRecommendationRunning',
  trail: 'health.cardioAssessmentRecommendationTrail',
  hiking: 'health.cardioAssessmentRecommendationHiking',
  cycling: 'health.cardioAssessmentRecommendationCycling',
  swimming: 'health.cardioAssessmentRecommendationSwimming',
  strength: 'health.cardioAssessmentRecommendationStrength',
  gym: 'health.cardioAssessmentRecommendationStrength',
  football: 'health.cardioAssessmentRecommendationIntermittent',
  basketball: 'health.cardioAssessmentRecommendationIntermittent',
  tennis: 'health.cardioAssessmentRecommendationRacket',
  padel: 'health.cardioAssessmentRecommendationRacket',
  martial_arts: 'health.cardioAssessmentRecommendationMartialArts',
  volleyball: 'health.cardioAssessmentRecommendationIntermittent',
  hyrox: 'health.cardioAssessmentRecommendationHyrox',
  climbing: 'health.cardioAssessmentRecommendationClimbing',
  surf: 'health.cardioAssessmentRecommendationSurf',
  skiing: 'health.cardioAssessmentRecommendationSnow',
  snowboard: 'health.cardioAssessmentRecommendationSnow',
  golf: 'health.cardioAssessmentRecommendationGolf',
};

const CARDIO_PERIODS: CardioPeriod[] = ['day', 'week', 'month', 'three_months', 'six_months', 'all'];
const ASSESSMENT_LEVEL_TRANSLATIONS: Record<CardioSportEvaluation['level'], TranslationKey> = {
  A: 'health.cardioAssessmentLevelA',
  B: 'health.cardioAssessmentLevelB',
  C: 'health.cardioAssessmentLevelC',
  D: 'health.cardioAssessmentLevelD',
  E: 'health.cardioAssessmentLevelE',
  F: 'health.cardioAssessmentLevelF',
};
const getStatusIcon = (status: string) => {
  if (status === 'improving') return TrendingUp;
  if (status === 'declining') return TrendingDown;
  if (status === 'stable') return Minus;
  if (status === 'descriptive') return Activity;
  return CircleHelp;
};

export const CardioEvolutionSection = () => {
  const { t, i18n } = useTranslation();
  const translateCardio = t as unknown as (key: TranslationKey, options?: Record<string, unknown>) => string;
  const { styles: healthStyles, colors } = useHealthStyles();
  const cardioQuery = useCardioEvolution();
  const baseData = cardioQuery.data;
  const sportOptions = React.useMemo<CardioSportOption[]>(
    () => getPracticedCardioSports(baseData?.activities ?? []),
    [baseData?.activities],
  );
  const [selectedSportKey, setSelectedSportKey] = React.useState('');
  const [selectedPeriod, setSelectedPeriod] = React.useState<CardioPeriod>('month');
  React.useEffect(() => {
    if (sportOptions.length > 0 && !sportOptions.some(option => option.sportType === selectedSportKey)) {
      setSelectedSportKey(sportOptions[0].sportType);
    }
  }, [selectedSportKey, sportOptions]);
  const selectedOption = sportOptions.find(option => option.sportType === selectedSportKey) ?? sportOptions[0] ?? null;
  const selectedSport = selectedOption?.sportType ?? 'running';
  const selectedSportKeyForMetrics = selectedSport;
  const detailQuery = useCardioEvolutionDetails(
    baseData?.activities ?? [],
    selectedOption?.sportType ?? '',
    selectedPeriod,
    cardioQuery.dataUpdatedAt,
  );
  const data = React.useMemo(
    () => (baseData ? { ...baseData, ...(detailQuery.data ?? {}) } : undefined),
    [baseData, detailQuery.data],
  );
  const isLoading = cardioQuery.isLoading || (detailQuery.isLoading && !!selectedOption);
  const isError = cardioQuery.isError;
  const isFetching = cardioQuery.isFetching || detailQuery.isFetching;
  const refetch = () => {
    void Promise.all([cardioQuery.refetch(), detailQuery.refetch()]);
  };
  const analysis = React.useMemo(
    () =>
      data && selectedOption
        ? analyzeSportEvolution(data.activities, selectedOption.sportType, new Date(), selectedPeriod)
        : null,
    [data, selectedOption, selectedPeriod],
  );
  const assessment = React.useMemo(
    () =>
      data && selectedOption
        ? evaluateCardioSport(
            data.activities,
            selectedOption.sportType,
            new Date(),
            selectedPeriod,
            data.laps,
            data.workoutSets,
            data.exerciseNames,
            i18n.language,
          )
        : null,
    [data, i18n.language, selectedOption, selectedPeriod],
  );
  const week = data?.weeklySummary;
  const assessmentPerformanceStatus = assessment?.performance.status ?? 'insufficient';
  const displayStatus = assessmentPerformanceStatus;
  const StatusIcon = getStatusIcon(displayStatus);
  const statusColor =
    displayStatus === 'improving'
      ? colors.success
      : displayStatus === 'declining'
        ? colors.danger
        : displayStatus === 'stable'
          ? colors.textSecondary
          : colors.primary;
  const fallbackStatusKey: TranslationKey | null =
    displayStatus === 'improving'
      ? 'health.cardioAssessmentOutputImproving'
      : displayStatus === 'declining'
        ? 'health.cardioAssessmentOutputDeclining'
        : displayStatus === 'stable'
          ? 'health.cardioAssessmentOutputStable'
          : assessment
            ? ASSESSMENT_LEVEL_TRANSLATIONS[assessment.level]
            : null;
  const confidence = assessment?.confidence ?? 'none';
  const statusKey = fallbackStatusKey;
  const assessmentMeaningKey: TranslationKey | null = (() => {
    if (!assessment) return null;
    if (assessment.level === 'A') {
      if (assessment.performance.status === 'improving') return 'health.cardioAssessmentMeaningAImproving';
      if (assessment.performance.status === 'declining') return 'health.cardioAssessmentMeaningADeclining';
      return 'health.cardioAssessmentMeaningAStable';
    }
    if (assessment.level === 'B') {
      return assessment.performance.status !== 'descriptive' && assessment.performance.status !== 'insufficient'
        ? 'health.cardioAssessmentMeaningBTrend'
        : 'health.cardioAssessmentMeaningB';
    }
    if (assessment.level === 'C') {
      if (assessment.cardiovascular.recentMedianBpm === null || assessment.cardiovascular.previousMedianBpm === null)
        return getCardioOnePeriodHeartRateMeaningKey(assessment);
      return SPORT_CARDIO_MEANING_TRANSLATIONS[selectedSport] ?? 'health.cardioAssessmentMeaningC';
    }
    if (assessment.level === 'D') {
      return assessment.volume.recent.durationMinutes === null || assessment.volume.previous.durationMinutes === null
        ? 'health.cardioAssessmentMeaningDPartial'
        : 'health.cardioAssessmentMeaningD';
    }
    if (assessment.level === 'E') {
      return assessment.volume.recent.sessionCount > 0
        ? 'health.cardioAssessmentMeaningERecent'
        : 'health.cardioAssessmentMeaningEPrior';
    }
    return assessment.volume.previous.sessionCount > 0
      ? 'health.cardioAssessmentMeaningFPrevious'
      : 'health.cardioAssessmentMeaningF';
  })();
  const assessmentMeaningOptions = assessment ? buildCardioMeaningTranslationOptions(assessment) : {};
  const assessmentRecommendationKey: TranslationKey | null =
    assessment?.level === 'A' || assessment?.level === 'B'
      ? selectedSport === 'running' || selectedSport === 'trail'
        ? 'health.cardioAssessmentRecommendationRunning'
        : selectedSport === 'cycling'
          ? 'health.cardioAssessmentRecommendationCycling'
          : selectedSport === 'swimming'
            ? 'health.cardioAssessmentRecommendationSwimming'
            : selectedSport === 'gym'
              ? 'health.cardioAssessmentRecommendationStrength'
              : 'health.cardioAssessmentRecommendationGeneric'
      : assessment?.level === 'C'
        ? (SPORT_CARDIO_RECOMMENDATION_TRANSLATIONS[selectedSport] ?? 'health.cardioAssessmentRecommendationHeartRate')
        : assessment?.level === 'D'
          ? 'health.cardioAssessmentRecommendationVolume'
          : assessment?.level === 'E'
            ? assessment.volume.recent.sessionCount > 0
              ? 'health.cardioAssessmentRecommendationFirstSession'
              : 'health.cardioAssessmentRecommendationNoRecentSession'
            : assessment?.level === 'F'
              ? assessment.volume.previous.sessionCount > 0
                ? 'health.cardioAssessmentRecommendationNoRecentSession'
                : 'health.cardioAssessmentRecommendationNoData'
              : null;
  const selectedIsInterval = shouldShowCardioIntervalRecovery(selectedSport, data?.intervalRecoveryBySport ?? {});
  const formatDuration = (minutes: number) => {
    const hours = Math.floor(minutes / 60);
    const remaining = minutes % 60;
    return hours > 0 ? `${hours} h ${remaining} min` : `${remaining} min`;
  };
  const maxZoneTime = Math.max(...(week?.zoneTimeSeconds ?? [0]));
  const unknownSportNumbers = React.useMemo(() => {
    const entries = sportOptions
      .filter(option => !SPORT_TRANSLATIONS[option.sportType])
      .map((option, index) => [option.sportType, index + 1] as const);
    return new Map(entries);
  }, [sportOptions]);

  return (
    <View style={styles.section}>
      <View style={styles.sectionHeading}>
        <View style={[styles.headingIcon, { backgroundColor: `${colors.primary}18` }]}>
          <HeartPulse size={19} color={colors.primary} />
        </View>
        <View style={styles.headingCopy}>
          <Text style={[styles.sectionTitle, healthStyles.title]}>{t('health.cardioTitle')}</Text>
          <Text style={[styles.sectionSubtitle, healthStyles.subtitle]}>{t('health.cardioSubtitle')}</Text>
        </View>
      </View>

      <GlassCard style={[styles.analysisCard, healthStyles.glassCard]}>
        {isLoading ? (
          <View style={styles.stateRow}>
            <ActivityIndicator color={colors.primary} />
            <Text style={[styles.stateText, healthStyles.subtitle]}>{t('health.cardioLoading')}</Text>
          </View>
        ) : isError ? (
          <View style={styles.errorContent}>
            <Text style={[styles.stateText, healthStyles.subtitle]}>{t('health.cardioError')}</Text>
            <Pressable onPress={() => void refetch()} style={styles.retryButton} accessibilityRole="button">
              {isFetching ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Text style={{ color: colors.primary }}>{t('nutrition.retry')}</Text>
              )}
            </Pressable>
          </View>
        ) : sportOptions.length === 0 || analysis === null || selectedOption === null ? (
          <View style={styles.emptyContent}>
            <HeartPulse size={22} color={colors.textSecondary} />
            <Text style={[styles.emptyTitle, healthStyles.title]}>{t('health.cardioEmptyTitle')}</Text>
            <Text style={[styles.emptyText, healthStyles.subtitle]}>{t('health.cardioEmptyDescription')}</Text>
          </View>
        ) : (
          <>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.sportTabs}
              accessibilityRole="tablist"
              accessibilityLabel={t('health.cardioSportSelector')}
            >
              {sportOptions.map(option => {
                const selected = option.sportType === selectedSportKeyForMetrics;
                const translationKey = SPORT_TRANSLATIONS[option.sportType];
                const label = translationKey
                  ? t(translationKey)
                  : t('health.cardioUnknownSport', { number: unknownSportNumbers.get(option.sportType) ?? 1 });
                const iconSport = normalizeSportType(option.sportType) ?? 'other';
                return (
                  <Pressable
                    key={option.sportType}
                    onPress={() => setSelectedSportKey(option.sportType)}
                    style={[
                      styles.sportTab,
                      { borderColor: selected ? colors.textPrimary : colors.border },
                      selected && { backgroundColor: colors.textPrimary },
                    ]}
                    accessibilityRole="tab"
                    accessibilityState={{ selected }}
                    accessibilityLabel={label}
                  >
                    <SportIcon
                      sport={option.sportType === 'strength' ? 'gym' : iconSport}
                      size={16}
                      color={selected ? colors.background : colors.textSecondary}
                    />
                    <Text style={[styles.sportTabText, { color: selected ? colors.background : colors.textSecondary }]}>
                      {label}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            <Text style={[styles.periodHeading, healthStyles.subtitle]}>{t('health.cardioPeriodHeading')}</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.periodTabs}
              accessibilityRole="tablist"
              accessibilityLabel={t('health.cardioPeriodHeading')}
            >
              {CARDIO_PERIODS.map(period => {
                const selected = selectedPeriod === period;
                return (
                  <Pressable
                    key={period}
                    onPress={() => setSelectedPeriod(period)}
                    style={[
                      styles.periodTab,
                      { borderColor: selected ? colors.primary : colors.border },
                      selected && { backgroundColor: `${colors.primary}18` },
                    ]}
                    accessibilityRole="tab"
                    accessibilityState={{ selected }}
                  >
                    <Text style={[styles.periodTabText, { color: selected ? colors.primary : colors.textSecondary }]}>
                      {t(PERIOD_TRANSLATIONS[period])}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            <View style={styles.statusLine}>
              <View style={[styles.statusIcon, { backgroundColor: `${statusColor}18` }]}>
                <StatusIcon size={17} color={statusColor} />
              </View>
              <Text style={[styles.statusText, { color: statusColor }]}>{statusKey ? t(statusKey) : ''}</Text>
              <View style={styles.confidence}>
                <Text style={[styles.confidenceText, healthStyles.subtitle]}>
                  {t('health.cardioConfidenceLabel')}: {t(CONFIDENCE_TRANSLATIONS[confidence])}
                </Text>
              </View>
            </View>
            <Text style={[styles.confidenceHelp, healthStyles.subtitle]}>{t('health.cardioConfidenceHelp')}</Text>

            {assessment ? (
              <CardioDimensionSummary
                assessment={assessment}
                activities={data?.activities ?? []}
                sportType={selectedSport}
                period={selectedPeriod}
                chartColor={colors.primary}
                colors={healthStyles}
                t={translateCardio}
              />
            ) : null}
            <View style={[styles.divider, healthStyles.divider]} />
            <View style={styles.explanationBlock}>
              <Text style={[styles.explanationHeading, healthStyles.title]}>{t('health.cardioMeaningTitle')}</Text>
              <Text style={[styles.explanationText, healthStyles.subtitle]}>
                {assessmentMeaningKey
                  ? translateCardio(assessmentMeaningKey, assessmentMeaningOptions)
                  : t('health.cardioAssessmentMeaningF')}
              </Text>
              {assessment && assessment.limitations.length > 0 ? (
                <View style={styles.limitationsBlock}>
                  <Text style={[styles.limitationHeading, healthStyles.title]}>
                    {t('health.cardioLimitationsTitle')}
                  </Text>
                  {assessment.limitations.map(limitation => {
                    const translationKey = LIMITATION_TRANSLATIONS[limitation];
                    return translationKey ? (
                      <Text key={limitation} style={[styles.limitationText, healthStyles.subtitle]}>
                        {'• '}
                        {t(translationKey)}
                      </Text>
                    ) : null;
                  })}
                </View>
              ) : null}
              <Text style={[styles.explanationHeading, styles.recommendationHeading, healthStyles.title]}>
                {t('health.cardioRecommendationTitle')}
              </Text>
              <Text style={[styles.explanationText, healthStyles.subtitle]}>
                {assessmentRecommendationKey
                  ? translateCardio(assessmentRecommendationKey)
                  : t('health.cardioAssessmentRecommendationNoData')}
              </Text>
            </View>
            {analysis.measurementCaution ? (
              <Text style={[styles.cautionText, healthStyles.subtitle]}>{t('health.cardioSwimmingCaution')}</Text>
            ) : null}
            {analysis.contextWarnings.length > 0 ? (
              <Text style={[styles.cautionText, healthStyles.subtitle]}>
                {t('health.cardioContextWarning', {
                  contexts: analysis.contextWarnings.map(warning => t(CONTEXT_TRANSLATIONS[warning])).join(', '),
                })}
              </Text>
            ) : null}
            {data?.streamDataError ? (
              <Text style={[styles.cautionText, healthStyles.subtitle]}>{t('health.cardioStreamLoadError')}</Text>
            ) : null}
            {data?.lapDataError ? (
              <Text style={[styles.cautionText, healthStyles.subtitle]}>{t('health.cardioLapsLoadError')}</Text>
            ) : null}
            {data?.strengthDataError && selectedSport === 'gym' ? (
              <Text style={[styles.cautionText, healthStyles.subtitle]}>{t('health.cardioStrengthLoadError')}</Text>
            ) : null}
            {data?.driftBySport[selectedSportKeyForMetrics] ? (
              <View style={[styles.driftNote, { backgroundColor: `${colors.primary}12` }]}>
                <Text style={[styles.driftHeading, healthStyles.title]}>{t('health.cardioDriftTitle')}</Text>
                <Text style={[styles.explanationText, healthStyles.subtitle]}>
                  {t('health.cardioDriftBody', {
                    percent: Math.abs(data.driftBySport[selectedSportKeyForMetrics]?.decouplingPercent ?? 0).toFixed(1),
                  })}
                </Text>
              </View>
            ) : null}
            {selectedIsInterval ? (
              <View style={[styles.driftNote, { backgroundColor: `${colors.primary}12` }]}>
                <Text style={[styles.driftHeading, healthStyles.title]}>{t('health.cardioIntervalRecoveryTitle')}</Text>
                {data?.intervalRecoveryBySport[selectedSportKeyForMetrics] ? (
                  <>
                    <Text style={[styles.resultValue, healthStyles.title]}>
                      {Math.round(
                        data.intervalRecoveryBySport[selectedSportKeyForMetrics]?.averageHeartRateDropBpm ?? 0,
                      )}{' '}
                      {t('health.cardioBpm')}
                    </Text>
                    <Text style={[styles.resultMetric, healthStyles.subtitle]}>
                      {t('health.cardioIntervalRecoveryMetric')}
                    </Text>
                    <Text style={[styles.explanationText, healthStyles.subtitle]}>
                      {t('health.cardioIntervalRecoveryBody', {
                        count: data.intervalRecoveryBySport[selectedSportKeyForMetrics]?.detectedPeakCount ?? 0,
                        drop: Math.round(
                          data.intervalRecoveryBySport[selectedSportKeyForMetrics]?.averageHeartRateDropBpm ?? 0,
                        ),
                      })}
                    </Text>
                    <Text style={[styles.cautionText, healthStyles.subtitle]}>
                      {t('health.cardioConfidenceLabel')}:{' '}
                      {t(
                        CONFIDENCE_TRANSLATIONS[
                          data.intervalRecoveryBySport[selectedSportKeyForMetrics]?.confidence ?? 'none'
                        ],
                      )}
                    </Text>
                    <Text style={[styles.cautionText, healthStyles.subtitle]}>
                      {t('health.cardioIntervalRecoveryAdvice')}
                    </Text>
                  </>
                ) : data?.streamDataError ? null : (
                  <Text style={[styles.explanationText, healthStyles.subtitle]}>
                    {t('health.cardioIntervalRecoveryUnavailable')}
                  </Text>
                )}
              </View>
            ) : null}
          </>
        )}
        {!isLoading && !isError && sportOptions.length > 0 ? (
          <Text style={[styles.periodCaption, healthStyles.subtitle]}>
            {selectedPeriod === 'all'
              ? t('health.cardioComparisonAll')
              : t('health.cardioComparisonPeriod', { period: t(PERIOD_TRANSLATIONS[selectedPeriod]) })}
          </Text>
        ) : null}
      </GlassCard>

      {!isLoading && !isError && week ? (
        <View style={styles.weeklyBlock}>
          <Text style={[styles.weeklyTitle, healthStyles.title]}>{t('health.cardioWeeklyTitle')}</Text>
          <Text style={[styles.weeklySubtitle, healthStyles.subtitle]}>{t('health.cardioLastSevenDays')}</Text>
          <View style={styles.weeklyMetrics}>
            <WeeklyMetric
              label={t('health.cardioSessionsWithHr')}
              value={week.sessionCount.toString()}
              colors={healthStyles}
            />
            <WeeklyMetric
              label={t('health.cardioTrainingTime')}
              value={formatDuration(week.durationMinutes)}
              colors={healthStyles}
            />
            <WeeklyMetric
              label={t('health.cardioMedianHr')}
              value={
                week.medianHeartRate === null ? '—' : `${Math.round(week.medianHeartRate)} ${t('health.cardioBpm')}`
              }
              colors={healthStyles}
            />
          </View>
          {data?.zoneDataError ? (
            <Text style={[styles.zoneCaption, healthStyles.subtitle]}>{t('health.cardioZonesLoadError')}</Text>
          ) : week.zoneDataAvailable ? (
            <View style={styles.zoneBlock}>
              <View style={styles.zoneHeader}>
                <Text style={[styles.zoneTitle, healthStyles.title]}>{t('health.cardioTimeInZones')}</Text>
                <Text style={[styles.zoneCaption, healthStyles.subtitle]}>{t('health.cardioZoneDataSource')}</Text>
              </View>
              {week.zoneTimeSeconds.map((seconds, index) => {
                const width = maxZoneTime > 0 ? Math.max((seconds / maxZoneTime) * 100, seconds > 0 ? 2 : 0) : 0;
                return (
                  <View key={`zone-${index + 1}`} style={styles.zoneRow}>
                    <Text style={[styles.zoneLabel, healthStyles.subtitle]}>
                      {t('training.heartRateZoneLabel', { zone: index + 1 })}
                    </Text>
                    <View style={[styles.zoneTrack, { backgroundColor: healthStyles.divider.backgroundColor }]}>
                      <View
                        style={[
                          styles.zoneFill,
                          { width: `${width}%`, backgroundColor: HEART_RATE_ZONE_COLORS[index] },
                        ]}
                      />
                    </View>
                    <Text style={[styles.zoneDuration, healthStyles.subtitle]}>
                      {formatDuration(Math.round(seconds / 60))}
                    </Text>
                  </View>
                );
              })}
            </View>
          ) : (
            <Text style={[styles.zoneCaption, healthStyles.subtitle]}>{t('health.cardioNoZoneData')}</Text>
          )}
          <Text style={[styles.weeklyDisclaimer, healthStyles.subtitle]}>{t('health.cardioWeeklyDisclaimer')}</Text>
        </View>
      ) : null}
      <View style={styles.disclaimerRow}>
        <Check size={15} color={colors.textSecondary} />
        <Text style={[styles.disclaimerText, healthStyles.subtitle]}>{t('health.cardioSafetyNote')}</Text>
      </View>
    </View>
  );
};

const WeeklyMetric = ({
  label,
  value,
  colors,
}: {
  label: string;
  value: string;
  colors: ReturnType<typeof useHealthStyles>['styles'];
}) => (
  <View style={[styles.weeklyMetric, colors.emptyState]}>
    <Text style={[styles.weeklyMetricValue, colors.title]} numberOfLines={1} adjustsFontSizeToFit>
      {value}
    </Text>
    <Text style={[styles.weeklyMetricLabel, colors.subtitle]} numberOfLines={2}>
      {label}
    </Text>
  </View>
);

const styles = StyleSheet.create({
  section: { marginTop: 28, gap: 12 },
  sectionHeading: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  headingIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  headingCopy: { flex: 1 },
  sectionTitle: { fontSize: 20, fontWeight: '700' },
  sectionSubtitle: { fontSize: 13, marginTop: 2 },
  analysisCard: { padding: 16, borderRadius: 22 },
  stateRow: { minHeight: 100, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12 },
  stateText: { fontSize: 14, lineHeight: 20 },
  errorContent: { minHeight: 90, alignItems: 'center', justifyContent: 'center', gap: 8 },
  retryButton: { minHeight: 44, minWidth: 80, alignItems: 'center', justifyContent: 'center' },
  emptyContent: { minHeight: 150, alignItems: 'center', justifyContent: 'center', gap: 9, paddingHorizontal: 18 },
  emptyTitle: { fontSize: 16, fontWeight: '600', textAlign: 'center' },
  emptyText: { fontSize: 13, lineHeight: 19, textAlign: 'center' },
  sportTabs: { gap: 8, paddingBottom: 15 },
  sportTab: {
    minHeight: 44,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 22,
    paddingHorizontal: 13,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  sportTabText: { fontSize: 13, fontWeight: '600' },
  periodHeading: { fontSize: 12, fontWeight: '600', marginBottom: 7 },
  periodTabs: { gap: 7, paddingBottom: 15 },
  periodTab: {
    minHeight: 44,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 18,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  periodTabText: { fontSize: 12, fontWeight: '600' },
  statusLine: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 34 },
  statusIcon: { width: 28, height: 28, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  statusText: { fontSize: 15, fontWeight: '700' },
  confidence: { marginLeft: 'auto', maxWidth: '48%' },
  confidenceText: { fontSize: 11, textAlign: 'right' },
  confidenceHelp: { fontSize: 11, lineHeight: 15, marginTop: 1, marginBottom: 2 },
  resultValue: { fontSize: 31, fontWeight: '700', letterSpacing: -0.6 },
  resultMetric: { fontSize: 13, marginTop: 3 },
  divider: { height: StyleSheet.hairlineWidth, marginVertical: 15 },
  explanationBlock: { gap: 5 },
  explanationHeading: { fontSize: 14, fontWeight: '700', marginTop: 2 },
  recommendationHeading: { marginTop: 10 },
  explanationText: { fontSize: 13, lineHeight: 19 },
  limitationsBlock: { gap: 3, marginTop: 7 },
  limitationHeading: { fontSize: 12, fontWeight: '600' },
  limitationText: { fontSize: 11, lineHeight: 16 },
  cautionText: { fontSize: 12, lineHeight: 18, marginTop: 11 },
  driftNote: { borderRadius: 13, padding: 12, marginTop: 14, gap: 4 },
  driftHeading: { fontSize: 13, fontWeight: '700' },
  periodCaption: { fontSize: 11, textAlign: 'center', marginTop: 13 },
  weeklyBlock: { marginTop: 10, gap: 9 },
  weeklyTitle: { fontSize: 17, fontWeight: '700' },
  weeklySubtitle: { fontSize: 12, marginTop: -7 },
  weeklyMetrics: { flexDirection: 'row', gap: 8 },
  weeklyMetric: {
    flex: 1,
    minWidth: 0,
    minHeight: 78,
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 12,
    justifyContent: 'center',
  },
  weeklyMetricValue: { fontSize: 15, fontWeight: '700' },
  weeklyMetricLabel: { fontSize: 11, lineHeight: 14, marginTop: 3 },
  zoneBlock: { gap: 7, marginTop: 4 },
  zoneHeader: { gap: 2 },
  zoneTitle: { fontSize: 13, fontWeight: '600' },
  zoneCaption: { fontSize: 11, lineHeight: 16 },
  zoneRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  zoneLabel: { width: 43, fontSize: 10 },
  zoneTrack: { height: 6, borderRadius: 3, flex: 1, overflow: 'hidden' },
  zoneFill: { height: '100%', borderRadius: 3 },
  zoneDuration: { width: 48, fontSize: 10, textAlign: 'right' },
  weeklyDisclaimer: { fontSize: 11, lineHeight: 16, marginTop: 1 },
  disclaimerRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 7, paddingHorizontal: 3 },
  disclaimerText: { flex: 1, fontSize: 11, lineHeight: 16 },
});
