import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { GlassCard } from '../../components/GlassCard';
import { colors, spacing, typography, borderRadius } from '../../theme';
import { useTrainingStyles } from '../../hooks/useTrainingStyles';
import { useUserPreferences } from '../../hooks/useUserPreferences';
import { ArrowLeft, Dumbbell, Activity, Info, Zap, Trophy } from 'lucide-react-native';
import { RouteProp } from '@react-navigation/native';
import { TrainingScreenNavigationProp, TrainingStackParamList } from '../../types/navigation.types';
import { useTranslation } from 'react-i18next';
import {
  getStrengthExerciseProgressMetric,
  isTimeBasedExerciseType,
  normalizeExerciseDifficulty,
  normalizeExerciseLoadType,
  getLocalizedExerciseName,
} from '../../services/localization';
import { useExerciseById } from '../../hooks/useExercises';
import { type ExerciseProgressMetric, useExerciseProgress } from '../../hooks/useExerciseProgress';
import { ChartAxisTick, ChartDataPointSelect, SimpleChart } from '../../components/stats/SimpleChart';
import {
  differenceInCalendarMonths,
  differenceInCalendarYears,
  eachDayOfInterval,
  eachMonthOfInterval,
  eachYearOfInterval,
  endOfDay,
  endOfMonth,
  endOfYear,
  format,
  startOfDay,
  startOfMonth,
  startOfYear,
  subDays,
  subMonths,
} from 'date-fns';
import { getDateFnsLocale } from '../../i18n/dateLocale';
import { formatDuration } from '../../constants/sports';

type ExerciseProgressRange = '30d' | '6m' | '1y' | 'all';
const DAY_IN_MS = 24 * 60 * 60 * 1000;

export const ExerciseDetailScreen = () => {
  const { t } = useTranslation();
  const navigation = useNavigation<TrainingScreenNavigationProp>();
  const route = useRoute<RouteProp<TrainingStackParamList, 'ExerciseDetail'>>();

  const { styles: dynamicStyles, colors: themeColors, isDark } = useTrainingStyles();
  const { preferences, toDisplayWeight } = useUserPreferences();
  const passedExercise = route.params?.exercise;
  const exerciseId = passedExercise?.id ?? route.params?.exerciseId;

  const { exercise: fetchedExercise, isLoading: exerciseLoading } = useExerciseById(
    passedExercise ? undefined : exerciseId,
  );
  const exercise = passedExercise ?? fetchedExercise;
  const isTimeBasedExercise = isTimeBasedExerciseType(exercise?.exercise_type_code);
  const normalizedLoadType = normalizeExerciseLoadType(exercise?.load_type);
  const progressMetric: ExerciseProgressMetric = isTimeBasedExercise
    ? 'time'
    : getStrengthExerciseProgressMetric(normalizedLoadType);
  const normalizedDifficulty = normalizeExerciseDifficulty(exercise?.difficulty);
  const [progressRange, setProgressRange] = useState<ExerciseProgressRange>('30d');
  const [visibleRange, setVisibleRange] = useState<{ start: Date; end: Date }>();
  const [selectedProgressPoint, setSelectedProgressPoint] = useState<ChartDataPointSelect>();

  const { data: progressData, isLoading: progressLoading } = useExerciseProgress(
    exerciseId,
    progressMetric,
    normalizedLoadType,
  );
  const progressPoints = progressData?.points ?? [];
  const hasAnyProgress = progressPoints.length > 0;
  const locale = getDateFnsLocale();

  const getPointMetricValue = (point: (typeof progressPoints)[number]) =>
    progressMetric === 'time'
      ? point.maxDurationSeconds
      : progressMetric === 'reps'
        ? point.maxReps
        : point.maxWeightKg;

  const allTimeBestPoint = useMemo(() => {
    if (progressPoints.length === 0) return null;
    return progressPoints.reduce((best, current) => {
      const currentValue = getPointMetricValue(current);
      const bestValue = getPointMetricValue(best);

      if (currentValue > bestValue) return current;
      if (progressMetric === 'weight' && currentValue === bestValue && current.repsAtMaxWeight > best.repsAtMaxWeight)
        return current;
      return best;
    });
  }, [getPointMetricValue, progressMetric, progressPoints]);

  const {
    visiblePoints,
    visibleBestPoint,
    visibleLatestPoint,
    chartData,
    chartRange,
    xAxisTicks,
    domainStart,
    domainEnd,
    visibleDurationMs,
  } = useMemo(() => {
    const now = new Date();
    const earliestDate = progressPoints.length > 0 ? startOfDay(new Date(progressPoints[0].date)) : startOfDay(now);

    let startDate = startOfDay(now);
    switch (progressRange) {
      case '30d':
        startDate = startOfDay(subDays(now, 29));
        break;
      case '6m':
        startDate = startOfMonth(subMonths(now, 5));
        break;
      case '1y':
        startDate = startOfMonth(subMonths(now, 11));
        break;
      case 'all':
        startDate = earliestDate;
        break;
    }

    const rangePoints =
      progressRange === 'all'
        ? progressPoints
        : progressPoints.filter(point => {
            const pointTime = new Date(point.date).getTime();
            return pointTime >= startDate.getTime();
          });

    const effectiveStart = progressRange === 'all' ? earliestDate : startDate;
    const latestPointDate =
      rangePoints.length > 0
        ? endOfDay(new Date(rangePoints[rangePoints.length - 1].date))
        : endOfDay(new Date(effectiveStart));
    const effectiveEnd = new Date(Math.max(endOfDay(now).getTime(), latestPointDate.getTime()));
    const totalDurationMs = Math.max(effectiveEnd.getTime() - effectiveStart.getTime(), DAY_IN_MS);

    let ticks: ChartAxisTick[] = [];
    if (progressRange === '30d') {
      const days = eachDayOfInterval({ start: effectiveStart, end: effectiveEnd });
      const tickStep = Math.max(1, Math.floor((days.length - 1) / 4));
      ticks = days
        .filter((_, index) => index % tickStep === 0 || index === days.length - 1)
        .map(day => ({
          date: day,
          label: format(day, 'd MMM', { locale }),
        }));
    } else if (progressRange === '6m') {
      const months = eachMonthOfInterval({ start: startOfMonth(effectiveStart), end: endOfMonth(effectiveEnd) });
      ticks = months.map(month => ({
        date: month,
        label: format(month, 'MMM', { locale }).replace('.', ''),
      }));
    } else if (progressRange === '1y') {
      const months = eachMonthOfInterval({ start: startOfMonth(effectiveStart), end: endOfMonth(effectiveEnd) });
      const tickStep = Math.max(2, Math.floor(months.length / 6));
      ticks = months
        .filter((_, index) => index % tickStep === 0 || index === months.length - 1)
        .map(month => ({
          date: month,
          label: format(month, 'MMM', { locale }).replace('.', ''),
        }));
    } else {
      const monthsSpan = Math.max(1, differenceInCalendarMonths(effectiveEnd, effectiveStart) + 1);
      const yearsSpan = Math.max(0, differenceInCalendarYears(effectiveEnd, effectiveStart));
      if (yearsSpan >= 3) {
        const years = eachYearOfInterval({ start: startOfYear(effectiveStart), end: endOfYear(effectiveEnd) });
        const yearStep = Math.max(1, Math.floor(years.length / 6));
        ticks = years
          .map(year => ({
            date: year,
            label: format(year, 'yyyy', { locale }),
          }))
          .filter((_, index, array) => index % yearStep === 0 || index === array.length - 1);
      } else {
        const months = eachMonthOfInterval({ start: startOfMonth(effectiveStart), end: endOfMonth(effectiveEnd) });
        const tickStep = monthsSpan > 18 ? 3 : 2;
        ticks = months
          .filter((_, index) => index % tickStep === 0 || index === months.length - 1)
          .map(month => ({
            date: month,
            label: format(month, 'MMM yy', { locale }).replace('.', ''),
          }));
      }
    }

    const visibleBest =
      rangePoints.length > 0
        ? rangePoints.reduce((best, current) => {
            const currentValue = getPointMetricValue(current);
            const bestValue = getPointMetricValue(best);

            if (currentValue > bestValue) return current;
            if (
              progressMetric === 'weight' &&
              currentValue === bestValue &&
              current.repsAtMaxWeight > best.repsAtMaxWeight
            )
              return current;
            return best;
          })
        : null;

    const visibleLatest = rangePoints.length > 0 ? rangePoints[rangePoints.length - 1] : null;

    return {
      visiblePoints: rangePoints,
      visibleBestPoint: visibleBest,
      visibleLatestPoint: visibleLatest,
      chartData: rangePoints.map(point => ({
        label: format(new Date(point.date), 'd/M', { locale }),
        value:
          progressMetric === 'time'
            ? Number((point.maxDurationSeconds / 60).toFixed(2))
            : progressMetric === 'reps'
              ? point.maxReps
              : Number(toDisplayWeight(point.maxWeightKg).toFixed(2)),
        rawValues: [getPointMetricValue(point)],
        date: new Date(point.date),
      })),
      chartRange: (progressRange === '30d' ? 'M' : progressRange === '6m' ? '6M' : 'A') as 'M' | '6M' | 'A',
      xAxisTicks: ticks,
      domainStart: effectiveStart,
      domainEnd: effectiveEnd,
      visibleDurationMs:
        progressRange === 'all' ? Math.min(totalDurationMs, 365 * DAY_IN_MS) : Math.max(totalDurationMs, DAY_IN_MS),
    };
  }, [getPointMetricValue, locale, progressMetric, progressPoints, progressRange, toDisplayWeight]);

  const effectiveVisibleRange = useMemo(() => {
    if (!domainStart || !domainEnd) {
      return undefined;
    }

    if (visibleRange) {
      return visibleRange;
    }

    if (!visibleDurationMs) {
      return { start: domainStart, end: domainEnd };
    }

    const startMs = Math.max(domainEnd.getTime() - visibleDurationMs, domainStart.getTime());
    return {
      start: new Date(startMs),
      end: domainEnd,
    };
  }, [domainEnd, domainStart, visibleDurationMs, visibleRange]);

  const visibleRangeLabel = useMemo(() => {
    if (effectiveVisibleRange) {
      return `${format(effectiveVisibleRange.start, 'd MMM yyyy', { locale })} - ${format(
        effectiveVisibleRange.end,
        'd MMM yyyy',
        {
          locale,
        },
      )}`;
    }

    if (!domainStart || !domainEnd) {
      return '';
    }

    return `${format(domainStart, 'd MMM yyyy', { locale })} - ${format(domainEnd, 'd MMM yyyy', { locale })}`;
  }, [domainEnd, domainStart, effectiveVisibleRange, locale]);

  const improvementWindow: '30d' | '6m' | '1y' = progressRange === 'all' ? '1y' : progressRange;

  const improvementRangePoints = useMemo(() => {
    if (progressPoints.length === 0) {
      return [];
    }

    if (improvementWindow === '30d') {
      const startDate = startOfDay(subDays(new Date(), 29));
      return progressPoints.filter(point => new Date(point.date).getTime() >= startDate.getTime());
    }

    if (improvementWindow === '6m') {
      const startDate = startOfMonth(subMonths(new Date(), 5));
      return progressPoints.filter(point => new Date(point.date).getTime() >= startDate.getTime());
    }

    const startDate = startOfMonth(subMonths(new Date(), 11));
    return progressPoints.filter(point => new Date(point.date).getTime() >= startDate.getTime());
  }, [improvementWindow, progressPoints]);

  const improvementInWindow = useMemo(() => {
    if (improvementRangePoints.length < 2) {
      return null;
    }

    const firstValue = getPointMetricValue(improvementRangePoints[0]);
    if (firstValue <= 0) {
      return null;
    }

    const latestValue = getPointMetricValue(improvementRangePoints[improvementRangePoints.length - 1]);
    return ((latestValue - firstValue) / firstValue) * 100;
  }, [getPointMetricValue, improvementRangePoints]);

  const progressVsStart = useMemo(() => {
    if (progressPoints.length < 2) {
      return null;
    }

    const firstValue = getPointMetricValue(progressPoints[0]);
    if (firstValue <= 0) {
      return null;
    }

    const latestValue = getPointMetricValue(progressPoints[progressPoints.length - 1]);
    return ((latestValue - firstValue) / firstValue) * 100;
  }, [getPointMetricValue, progressPoints]);

  const formatWeightValue = (kg: number) =>
    toDisplayWeight(kg).toLocaleString(undefined, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    });

  const formatProgressMetricValue = (value: number) => {
    if (progressMetric === 'time') {
      return formatDuration(Math.round(value));
    }

    if (progressMetric === 'reps') {
      return `${Math.round(value)} ${t('training.repsColon')}`;
    }

    return `${formatWeightValue(value)} ${preferences.weight_unit}`;
  };

  if (exerciseLoading && !exercise) {
    return (
      <LinearGradient colors={dynamicStyles.gradientColors} style={{ flex: 1 }}>
        <SafeAreaView style={[styles.container, dynamicStyles.container]} edges={['top', 'bottom']}>
          <View style={styles.centerLoading}>
            <ActivityIndicator size="large" color={themeColors.primary} />
            <Text style={[styles.loadingText, dynamicStyles.sublabel]}>{t('common.loading')}</Text>
          </View>
        </SafeAreaView>
      </LinearGradient>
    );
  }

  if (!exercise) return null;

  // Difficulty Color Mapping
  const getDifficultyColor = (diff: string | null | undefined) => {
    switch (normalizeExerciseDifficulty(diff)) {
      case 'beginner':
        return themeColors.success;
      case 'intermediate':
        return '#FF9500'; // Warning color fallback
      case 'advanced':
        return themeColors.danger;
      default:
        return themeColors.textSecondary;
    }
  };

  return (
    <LinearGradient colors={dynamicStyles.gradientColors} style={{ flex: 1 }}>
      <SafeAreaView style={[styles.container, dynamicStyles.container]} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <ArrowLeft size={24} color={themeColors.textPrimary} />
          </TouchableOpacity>
          <Text style={[styles.title, dynamicStyles.title]} numberOfLines={1}>
            {exercise.name || getLocalizedExerciseName(exercise)}
          </Text>
          <View style={{ width: 24 }} />
        </View>

        <ScrollView contentContainerStyle={styles.content}>
          {/* Hero Section / Placeholder Image if we had one */}
          <GlassCard style={[styles.heroCard, dynamicStyles.glassCard]}>
            <View
              style={[
                styles.heroIconContainer,
                { backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : colors.surfaceHighlight },
              ]}
            >
              <Dumbbell size={48} color={themeColors.primary} />
            </View>
            <Text style={[styles.exerciseName, dynamicStyles.title]}>{exercise.name || getLocalizedExerciseName(exercise)}</Text>
          </GlassCard>
          {/* Quick Stats Grid */}
          <View style={styles.statsRow}>
            <View style={{ flex: 1 }}>
              <GlassCard style={[styles.statCard, dynamicStyles.glassCard]}>
                <Activity size={20} color={themeColors.secondary} />
                <Text style={[styles.statLabel, dynamicStyles.sublabel]}>{t('training.difficulty')}</Text>
                <Text
                  style={[styles.statValue, { color: getDifficultyColor(exercise?.difficulty), fontSize: 12 }]}
                  numberOfLines={1}
                >
                  {normalizedDifficulty
                    ? t(
                        normalizedDifficulty === 'beginner'
                          ? 'training.difficultyBeginner'
                          : normalizedDifficulty === 'intermediate'
                            ? 'training.difficultyIntermediate'
                            : 'training.difficultyAdvanced',
                      )
                    : exercise.difficulty || t('training.notAvailable')}
                </Text>
              </GlassCard>
            </View>

            <View style={{ flex: 1 }}>
              <GlassCard style={[styles.statCard, dynamicStyles.glassCard]}>
                <Zap size={20} color={themeColors.primary} />
                <Text style={[styles.statLabel, dynamicStyles.sublabel]}>{t('health.muscle')}</Text>
                <Text style={[styles.statValue, { color: themeColors.textPrimary, fontSize: 12 }]} numberOfLines={1}>
                  {exercise.primary_muscle?.name || t('training.general')}
                </Text>
              </GlassCard>
            </View>

            <View style={{ flex: 1 }}>
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => {
                  if (!exerciseId) return;
                  navigation.navigate('ExercisePrValues', {
                    exerciseId,
                    metric: progressMetric,
                    loadType: normalizedLoadType,
                    exerciseName: exercise.name || getLocalizedExerciseName(exercise) || undefined,
                  });
                }}
                disabled={!exerciseId}
              >
                <GlassCard style={[styles.statCard, dynamicStyles.glassCard]}>
                  <Trophy size={20} color={themeColors.warning || '#FF9500'} />
                  <Text style={[styles.statLabel, dynamicStyles.sublabel]}>{t('training.prColonAllCaps')}</Text>
                  {progressLoading ? (
                    <ActivityIndicator size="small" color={themeColors.textSecondary} />
                  ) : (
                    <Text
                      style={[styles.statValue, { color: themeColors.textPrimary, fontSize: 12 }]}
                      numberOfLines={1}
                    >
                      {allTimeBestPoint ? formatProgressMetricValue(getPointMetricValue(allTimeBestPoint)) : '-'}
                    </Text>
                  )}
                  <Text style={[styles.prManageHint, { color: themeColors.textSecondary }]}>
                    {t('training.tapToManagePrValues')}
                  </Text>
                </GlassCard>
              </TouchableOpacity>
            </View>
          </View>

          <GlassCard style={[styles.sectionCard, dynamicStyles.glassCard]}>
            <View
              style={[
                styles.sectionHeader,
                { borderBottomColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)' },
              ]}
            >
              <Trophy size={20} color={themeColors.warning || '#FF9500'} />
              <Text style={[styles.sectionTitle, dynamicStyles.title]}>{t('training.exerciseProgress')}</Text>
            </View>

            {progressLoading ? (
              <View style={styles.progressLoadingContainer}>
                <ActivityIndicator size="small" color={themeColors.primary} />
              </View>
            ) : hasAnyProgress ? (
              <>
                <View
                  style={[
                    styles.progressRangeContainer,
                    { backgroundColor: isDark ? 'rgba(120,120,128,0.24)' : 'rgba(120,120,128,0.12)' },
                  ]}
                >
                  {(
                    [
                      { value: '30d', label: t('training.last30DaysTab') },
                      { value: '6m', label: t('training.sixMonthsTab') },
                      { value: '1y', label: t('training.yearTab') },
                      { value: 'all', label: t('training.totalTab') },
                    ] as Array<{ value: ExerciseProgressRange; label: string }>
                  ).map(option => {
                    const isActive = progressRange === option.value;
                    return (
                      <TouchableOpacity
                        key={option.value}
                        style={[
                          styles.progressRangeBtn,
                          isActive && {
                            backgroundColor: isDark ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.9)',
                          },
                        ]}
                        onPress={() => {
                          setVisibleRange(undefined);
                          setSelectedProgressPoint(undefined);
                          setProgressRange(option.value);
                        }}
                        activeOpacity={0.7}
                      >
                        <Text
                          style={[
                            styles.progressRangeBtnText,
                            { color: themeColors.textPrimary },
                            isActive && { color: isDark ? '#FFFFFF' : '#000000', fontWeight: '700' },
                          ]}
                        >
                          {option.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                <Text style={[styles.progressSubtitle, { color: themeColors.textSecondary }]}>
                  {t('training.progressSessionsCount', { count: visiblePoints.length })}
                </Text>
                <Text style={[styles.progressDateRange, { color: themeColors.textSecondary }]} numberOfLines={1}>
                  {visibleRangeLabel}
                </Text>
                {visiblePoints.length > 0 ? (
                  <>
                    <SimpleChart
                      data={chartData}
                      type="line"
                      height={260}
                      color={themeColors.primary}
                      range={chartRange}
                      xAxisTicks={xAxisTicks}
                      domainStart={domainStart}
                      domainEnd={domainEnd}
                      visibleDurationMs={visibleDurationMs}
                      yAxisBaseStep={progressMetric === 'weight' ? 2.5 : undefined}
                      onVisibleRangeChange={setVisibleRange}
                      onPointSelect={setSelectedProgressPoint}
                      selectedPoint={selectedProgressPoint}
                      onClearSelection={() => setSelectedProgressPoint(undefined)}
                      showSelectedPointTooltip
                      getSelectedPointTooltipContent={point => ({
                        primaryText: (() => {
                          if (point.value === null) {
                            return progressMetric === 'time'
                              ? t('training.emptyTimeValue')
                              : progressMetric === 'reps'
                                ? t('training.emptyRepsValue')
                                : t('training.emptyWeightValue');
                          }

                          const rawMetric = point.rawValues?.[0] ?? point.value;
                          return formatProgressMetricValue(rawMetric);
                        })(),
                        secondaryText: point.date
                          ? format(point.date, 'd MMM yyyy', { locale })
                          : t('training.notAvailable'),
                      })}
                    />

                    <View style={styles.progressStatsRow}>
                      <View style={styles.progressStatItem}>
                        <Text style={[styles.progressStatValue, { color: themeColors.textPrimary }]}>
                          {visibleBestPoint ? formatProgressMetricValue(getPointMetricValue(visibleBestPoint)) : '-'}
                        </Text>
                        <Text style={[styles.progressStatLabel, { color: themeColors.textSecondary }]}>
                          {t(
                            progressMetric === 'time'
                              ? 'training.bestDuration'
                              : progressMetric === 'reps'
                                ? 'training.bestReps'
                                : 'training.bestLift',
                          )}
                        </Text>
                      </View>
                      <View style={styles.progressStatItem}>
                        <Text style={[styles.progressStatValue, { color: themeColors.textPrimary }]}>
                          {improvementInWindow != null
                            ? `${improvementInWindow >= 0 ? '+' : ''}${improvementInWindow.toFixed(1)}%`
                            : '-'}
                        </Text>
                        <Text style={[styles.progressStatLabel, { color: themeColors.textSecondary }]}>
                          {t(
                            improvementWindow === '30d'
                              ? 'training.progressLast30Days'
                              : improvementWindow === '6m'
                                ? 'training.progressLast6Months'
                                : 'training.progressLast1Year',
                          )}
                        </Text>
                      </View>
                      <View style={styles.progressStatItem}>
                        <Text style={[styles.progressStatValue, { color: themeColors.textPrimary }]}>
                          {progressVsStart != null
                            ? `${progressVsStart >= 0 ? '+' : ''}${progressVsStart.toFixed(1)}%`
                            : '-'}
                        </Text>
                        <Text style={[styles.progressStatLabel, { color: themeColors.textSecondary }]}>
                          {t('training.progressVsStart')}
                        </Text>
                      </View>
                    </View>

                    {visibleLatestPoint && (
                      <Text style={[styles.progressFooterText, { color: themeColors.textSecondary }]}>
                        {t('training.latestSessionOn', {
                          date: format(new Date(visibleLatestPoint.date), 'd MMM yyyy', { locale }),
                        })}
                      </Text>
                    )}
                  </>
                ) : (
                  <Text style={[styles.progressEmptyText, { color: themeColors.textSecondary }]}>
                    {t('training.noExerciseProgressInRange')}
                  </Text>
                )}
              </>
            ) : (
              <Text style={[styles.progressEmptyText, { color: themeColors.textSecondary }]}>
                {t('training.noExerciseProgress')}
              </Text>
            )}
          </GlassCard>

          {/* Equipment Section */}
          {exercise.equipment && (
            <GlassCard style={[styles.sectionCard, dynamicStyles.glassCard]}>
              <View
                style={[
                  styles.sectionHeader,
                  { borderBottomColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)' },
                ]}
              >
                <Dumbbell size={20} color={themeColors.textPrimary} />
                <Text style={[styles.sectionTitle, dynamicStyles.title]}>{t('training.equipment')}</Text>
              </View>
              <View style={styles.tagContainer}>
                <View
                  style={[styles.tag, { backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : colors.surfaceHighlight }]}
                >
                  <Text style={[styles.tagText, { color: themeColors.primary }]}>
                    {exercise.equipment.name || t('training.bodyweight')}
                  </Text>
                </View>
              </View>
            </GlassCard>
          )}

          {/* Muscles Involved */}
          <GlassCard style={[styles.sectionCard, dynamicStyles.glassCard]}>
            <View
              style={[
                styles.sectionHeader,
                { borderBottomColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)' },
              ]}
            >
              <Activity size={20} color={themeColors.textPrimary} />
              <Text style={[styles.sectionTitle, dynamicStyles.title]}>{t('training.musclesInvolved')}</Text>
            </View>
            <View style={styles.muscleList}>
              <Text style={[styles.muscleItem, { color: themeColors.textPrimary }]}>
                <Text style={{ fontWeight: 'bold' }}>{t('training.primary')}</Text>
                {exercise.primary_muscle?.name || t('training.notAvailable')}
              </Text>
              {exercise.secondary_muscle && exercise.secondary_muscle.name && (
                <Text style={[styles.muscleItem, { color: themeColors.textPrimary }]}>
                  <Text style={{ fontWeight: 'bold' }}>{t('training.secondary')}</Text>
                  {exercise.secondary_muscle.name}
                </Text>
              )}
            </View>
          </GlassCard>

          {/* Exercise Type Section */}
          <GlassCard style={[styles.sectionCard, dynamicStyles.glassCard]}>
            <View
              style={[
                styles.sectionHeader,
                { borderBottomColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)' },
              ]}
            >
              <Info size={20} color={themeColors.textPrimary} />
              <Text style={[styles.sectionTitle, dynamicStyles.title]}>{t('training.exerciseType')}</Text>
            </View>
            <Text style={[styles.exerciseTypeDescription, { color: themeColors.textSecondary }]}>
              {isTimeBasedExerciseType(exercise.exercise_type_code)
                ? t('training.timeBasedExecutionDesc')
                : t('training.repsExecutionDesc')}
            </Text>
          </GlassCard>

          {/* Description/Instructions */}
          {exercise.description && (
            <GlassCard style={[styles.sectionCard, dynamicStyles.glassCard]}>
              <View
                style={[
                  styles.sectionHeader,
                  { borderBottomColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)' },
                ]}
              >
                <Info size={20} color={themeColors.textPrimary} />
                <Text style={[styles.sectionTitle, dynamicStyles.title]}>{t('training.instructions')}</Text>
              </View>
              <Text style={[styles.descriptionText, { color: themeColors.textSecondary }]}>{exercise.description}</Text>
            </GlassCard>
          )}
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  centerLoading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.s,
  },
  loadingText: {
    ...typography.body,
    color: colors.textSecondary,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.m,
  },
  backBtn: {
    padding: spacing.xs,
  },
  title: {
    ...typography.h3,
    color: colors.textPrimary,
    flex: 1,
    textAlign: 'center',
  },
  content: {
    padding: spacing.m,
    paddingBottom: 100,
  },
  heroCard: {
    alignItems: 'center',
    padding: spacing.xl,
    marginBottom: spacing.m,
    gap: spacing.s,
  },
  heroIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.surfaceHighlight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.s,
  },
  exerciseName: {
    ...typography.h2,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  exerciseType: {
    ...typography.body,
    color: colors.textSecondary,
  },
  statsRow: {
    flexDirection: 'row',
    gap: spacing.m,
    marginBottom: spacing.m,
  },
  statCard: {
    padding: spacing.m,
    minHeight: 112,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  statLabel: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  statValue: {
    ...typography.h4,
    fontWeight: 'bold',
    color: colors.textPrimary,
    textAlign: 'center',
  },
  prManageHint: {
    ...typography.caption,
    fontSize: 10,
    textAlign: 'center',
    marginTop: 2,
  },
  progressSubtitle: {
    ...typography.caption,
    marginBottom: spacing.xs,
    marginTop: -spacing.xs,
  },
  progressDateRange: {
    ...typography.caption,
    fontWeight: '600',
    marginBottom: spacing.s,
  },
  progressLoadingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.l,
  },
  progressStatsRow: {
    flexDirection: 'row',
    gap: spacing.s,
    marginTop: spacing.s,
  },
  progressStatItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.s,
    borderRadius: borderRadius.m,
    backgroundColor: 'rgba(127,127,127,0.08)',
  },
  progressRangeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: borderRadius.m,
    padding: 3,
    marginBottom: spacing.s,
  },
  progressRangeBtn: {
    flex: 1,
    paddingVertical: spacing.xs + 2,
    borderRadius: borderRadius.s,
    alignItems: 'center',
  },
  progressRangeBtnText: {
    ...typography.caption,
    fontWeight: '600',
  },
  progressStatValue: {
    ...typography.h4,
    fontWeight: '700',
    textAlign: 'center',
  },
  progressStatLabel: {
    ...typography.caption,
    marginTop: 2,
    textAlign: 'center',
  },
  progressFooterText: {
    ...typography.caption,
    marginTop: spacing.s,
    textAlign: 'right',
  },
  progressEmptyText: {
    ...typography.body,
    textAlign: 'center',
    paddingVertical: spacing.l,
  },
  sectionCard: {
    padding: spacing.m,
    marginBottom: spacing.m,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s,
    marginBottom: spacing.m,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.05)',
    paddingBottom: spacing.s,
  },
  sectionTitle: {
    ...typography.h4,
    color: colors.textPrimary,
  },
  tagContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.s,
  },
  tag: {
    backgroundColor: colors.surfaceHighlight,
    paddingHorizontal: spacing.m,
    paddingVertical: spacing.s,
    borderRadius: borderRadius.full,
  },
  tagText: {
    ...typography.caption,
    color: colors.primary,
    fontWeight: '600',
  },
  muscleList: {
    gap: spacing.s,
  },
  muscleItem: {
    ...typography.body,
    color: colors.textPrimary,
  },
  descriptionText: {
    ...typography.body,
    color: colors.textSecondary,
    lineHeight: 24,
  },
  exerciseTypeDescription: {
    ...typography.body,
    color: colors.textSecondary,
    lineHeight: 22,
  },
});
