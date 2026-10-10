import React from 'react';
import {
  Activity,
  Heart,
  Moon,
  Footprints,
  Zap,
  RefreshCw,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  X,
  HeartPulse,
} from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Modal, Pressable, ScrollView, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { supabase } from '../../../lib/supabaseClient';
import { useAuth } from '../../../context/AuthContext';
import { GlassCard } from '../../../components/GlassCard';
import { SimpleChart, ChartDataPoint } from '../../../components/stats/SimpleChart';
import { useHealthStyles } from '../../../hooks/useHealthStyles';
import { healthQueryKeys } from '../hooks/healthQueryKeys';
import {
  aggregateDailyActivity,
  countStressStates,
  getHealthSummaryCardWidth,
  summarizeHealthValues,
} from '../helpers/suuntoHealthPresentation';
import { getSuuntoHealthEducation, suuntoEducationTopicTitles } from '../helpers/suuntoHealthEducation';
import {
  getSuuntoChartRange,
  getSuuntoPeriodStart,
  loadAllSuuntoPages,
  SUUNTO_DETAIL_PERIODS,
  type SuuntoDetailPeriod,
} from '../helpers/suuntoHealthPeriods';

type Period = 'D' | 'W' | 'M' | '2M';
type Metric = 'heart_rate' | 'hrv_rmssd';
type SummaryMetric = 'heart_rate' | 'hrv_rmssd' | 'recovery' | 'sleep' | 'stress' | 'steps' | 'energy';
const zoneColors = ['#48B8F2', '#35C978', '#F4C542', '#FF875D', '#F04C55'];
const summaryDescriptions = {
  heart_rate: 'health.suuntoHeartRateDescription',
  hrv_rmssd: 'health.suuntoHrvDescription',
  recovery: 'health.suuntoBalanceDescription',
  sleep: 'health.suuntoSleepDescription',
  stress: 'health.suuntoStressDescription',
  steps: 'health.suuntoStepsDescription',
  energy: 'health.suuntoEnergyDescription',
} as const;

type Props = { sleepDetailsRequest: number };

export const SuuntoHealthSection = ({ sleepDetailsRequest }: Props) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { styles: healthStyles, colors } = useHealthStyles();
  const [activeDetail, setActiveDetail] = React.useState<SummaryMetric | null>(null);
  const [period, setPeriod] = React.useState<Period>('W');
  const [detailPeriod, setDetailPeriod] = React.useState<SuuntoDetailPeriod>('W');
  const [metric, setMetric] = React.useState<Metric>('heart_rate');
  const selectedPeriod = activeDetail ? detailPeriod : period;
  const from = getSuuntoPeriodStart(selectedPeriod);
  React.useEffect(() => {
    if (sleepDetailsRequest > 0) {
      setDetailPeriod('M');
      setActiveDetail('sleep');
    }
  }, [sleepDetailsRequest]);
  const showDetail = (detail: SummaryMetric) => {
    setDetailPeriod(detail === 'sleep' ? 'M' : period === '2M' ? 'W' : period);
    setActiveDetail(detail);
  };

  const query = useQuery({
    queryKey: [...healthQueryKeys.all(user?.id), 'suunto-24-7', selectedPeriod],
    enabled: !!user,
    queryFn: async () => {
      if (!user) return { samples: [], sleeps: [], steps: [], syncState: null };
      const loadSamples = async () => {
        return loadAllSuuntoPages((offset, pageSize) => {
          let request = supabase
            .from('health_metric_samples')
            .select('id, metric_type, value, unit, recorded_at, local_date')
            .eq('user_id', user.id)
            .eq('provider', 'suunto')
            .eq('source_channel', 'cloud')
            .in('metric_type', ['heart_rate', 'hrv_rmssd', 'recovery_balance', 'stress_state', 'spo2'])
            .order('recorded_at', { ascending: true })
            .range(offset, offset + pageSize - 1);
          if (from) request = request.gte('recorded_at', from);
          return request;
        });
      };
      const loadSleeps = () =>
        loadAllSuuntoPages((offset, pageSize) => {
          let request = supabase
            .from('sleep_sessions')
            .select(
              'id, date, total_sleep_min, awake_min, deep_sleep_min, light_sleep_min, rem_sleep_min, avg_heart_rate_bpm, min_heart_rate_bpm, avg_hrv_ms, max_spo2_pct, sleep_score, source',
            )
            .eq('user_id', user.id)
            .eq('source', 'suunto')
            .order('date', { ascending: false })
            .range(offset, offset + pageSize - 1);
          if (from) request = request.gte('date', from.slice(0, 10));
          return request;
        });
      const loadSteps = () =>
        loadAllSuuntoPages((offset, pageSize) => {
          let request = supabase
            .from('daily_steps')
            .select('id, date, total_steps, calories_kcal')
            .eq('user_id', user.id)
            .eq('source', 'suunto')
            .order('date', { ascending: false })
            .range(offset, offset + pageSize - 1);
          if (from) request = request.gte('date', from.slice(0, 10));
          return request;
        });
      const [samples, sleeps, steps, syncState] = await Promise.all([
        loadSamples(),
        loadSleeps(),
        loadSteps(),
        supabase
          .from('integration_sync_state')
          .select('last_success_at, status, last_error')
          .eq('user_id', user.id)
          .eq('provider', 'suunto')
          .eq('source_channel', 'cloud')
          .eq('sync_domain', 'health_metrics')
          .maybeSingle(),
      ]);
      if (syncState.error) throw syncState.error;
      return {
        samples,
        sleeps,
        steps,
        syncState: syncState.data,
      };
    },
    staleTime: 60_000,
  });
  const values = query.data?.samples.filter(sample => sample.metric_type === metric) ?? [];
  const heartSummary = summarizeHealthValues(
    (query.data?.samples ?? [])
      .filter(sample => sample.metric_type === 'heart_rate')
      .map(sample => Number(sample.value)),
  );
  const hrvSummary = summarizeHealthValues(
    (query.data?.samples ?? [])
      .filter(sample => sample.metric_type === 'hrv_rmssd')
      .map(sample => Number(sample.value)),
  );
  const bucketSize = selectedPeriod === 'D' ? 30 * 60_000 : selectedPeriod === 'W' ? 2 * 60 * 60_000 : 24 * 60 * 60_000;
  const buckets = new Map<number, number[]>();
  for (const sample of values) {
    const time = new Date(sample.recorded_at).getTime();
    const bucket = Math.floor(time / bucketSize) * bucketSize;
    const bucketValues = buckets.get(bucket) ?? [];
    bucketValues.push(Number(sample.value));
    buckets.set(bucket, bucketValues);
  }
  const points: ChartDataPoint[] = [...buckets.entries()].map(([time, bucketValues]) => ({
    value: Math.round(bucketValues.reduce((sum, value) => sum + value, 0) / bucketValues.length),
    date: new Date(time),
    label: new Date(time).toLocaleString(),
  }));
  const latest = (type: string) =>
    [...(query.data?.samples ?? [])].reverse().find(row => row.metric_type === type)?.value;
  const latestSleep = query.data?.sleeps[0];
  const sleepRows = query.data?.sleeps ?? [];
  const recoveryRows = query.data?.samples.filter(row => row.metric_type === 'recovery_balance') ?? [];
  const recoveryBuckets = new Map<number, number[]>();
  for (const row of recoveryRows) {
    const day = new Date(row.recorded_at);
    day.setHours(0, 0, 0, 0);
    const readings = recoveryBuckets.get(day.getTime()) ?? [];
    readings.push(Number(row.value) * 100);
    recoveryBuckets.set(day.getTime(), readings);
  }
  const recoveryPoints: ChartDataPoint[] = [...recoveryBuckets.entries()].map(([time, readings]) => ({
    value: readings.reduce((sum, value) => sum + value, 0) / readings.length,
    date: new Date(time),
    label: new Date(time).toLocaleDateString(),
  }));
  const sleepDurations = sleepRows.map(row => row.total_sleep_min).filter((value): value is number => value != null);
  const avgSleep = sleepDurations.length
    ? Math.round(sleepDurations.reduce((sum, value) => sum + value, 0) / sleepDurations.length)
    : null;
  const sleepPoints: ChartDataPoint[] = sleepRows
    .filter((row): row is typeof row & { total_sleep_min: number } => row.total_sleep_min != null)
    .map(row => ({
      value: Math.round((row.total_sleep_min / 60) * 10) / 10,
      date: new Date(`${row.date}T12:00:00`),
      label: row.date,
    }))
    .sort((left, right) => (left.date?.getTime() ?? 0) - (right.date?.getTime() ?? 0));
  const averageSleepLabel = avgSleep == null ? '—' : `${Math.floor(avgSleep / 60)}h ${Math.round(avgSleep % 60)}m`;
  const rowsWithSteps = (query.data?.steps ?? []).filter(
    (row): row is typeof row & { total_steps: number } => row.total_steps != null,
  );
  const rowsWithEnergy = (query.data?.steps ?? []).filter(
    (row): row is typeof row & { calories_kcal: number } => row.calories_kcal != null,
  );
  const totalSteps = rowsWithSteps.length ? rowsWithSteps.reduce((sum, row) => sum + row.total_steps, 0) : null;
  const totalEnergy = rowsWithEnergy.length ? rowsWithEnergy.reduce((sum, row) => sum + row.calories_kcal, 0) : null;
  const stepPoints = aggregateDailyActivity(query.data?.steps ?? [], 'steps');
  const energyPoints = aggregateDailyActivity(query.data?.steps ?? [], 'energy');
  const stressRows = query.data?.samples.filter(row => row.metric_type === 'stress_state') ?? [];
  const stressCounts = countStressStates(stressRows.map(row => Number(row.value)));
  const stressReadingCount = Object.values(stressCounts).reduce((sum, value) => sum + value, 0);
  const cardWidth = getHealthSummaryCardWidth();
  const detailPoints =
    activeDetail === 'heart_rate' || activeDetail === 'hrv_rmssd'
      ? points
      : activeDetail === 'recovery'
        ? recoveryPoints
        : activeDetail === 'steps'
          ? stepPoints
          : activeDetail === 'energy'
            ? energyPoints
            : [];
  const activeDetailTitle =
    activeDetail === 'heart_rate'
      ? t('health.suuntoHeartRate')
      : activeDetail === 'hrv_rmssd'
        ? t('health.suuntoHrv')
        : activeDetail === 'recovery'
          ? t('health.suuntoBalance')
          : activeDetail === 'sleep'
            ? t('health.suuntoSleepTrend')
            : activeDetail === 'stress'
              ? t('health.suuntoStress')
              : activeDetail === 'steps'
                ? t('health.suuntoSteps')
                : activeDetail === 'energy'
                  ? t('health.suuntoEnergy')
                  : '';
  const activePeriodSummaryLabel =
    activeDetail === 'heart_rate' || activeDetail === 'hrv_rmssd'
      ? t('health.suuntoPeriodAverage')
      : activeDetail === 'sleep'
        ? t('health.suuntoSleepPeriodAverage')
        : activeDetail === 'recovery' || activeDetail === 'stress'
          ? t('health.suuntoLatestInPeriod')
          : t('health.suuntoTotalInPeriod');
  const stressValue = latest('stress_state');
  const stressLabel =
    stressValue == null
      ? '—'
      : Number(stressValue) === 0
        ? t('health.suuntoStressInvalid')
        : Number(stressValue) === 1
          ? t('health.suuntoStressRelaxing')
          : Number(stressValue) === 2
            ? t('health.suuntoStressActive')
            : Number(stressValue) === 3
              ? t('health.suuntoStressPassive')
              : Number(stressValue) === 4
                ? t('health.suuntoStressful')
                : t('health.suuntoStressUnknown');

  return (
    <View style={styles.section}>
      <View style={styles.sectionHeading}>
        <View>
          <Text style={[styles.heading, healthStyles.sectionTitle]}>{t('health.suuntoTitle')}</Text>
          <Text style={[styles.caption, { color: colors.textSecondary }]}>{t('health.suuntoSubtitle')}</Text>
        </View>
        <Activity size={22} color="#16B8D9" />
      </View>
      <View style={styles.periods} accessibilityRole="tablist" accessibilityLabel={t('health.suuntoPeriod')}>
        {(['D', 'W', 'M', '2M'] as const).map(item => (
          <Pressable
            key={item}
            onPress={() => setPeriod(item)}
            accessibilityRole="tab"
            accessibilityState={{ selected: period === item }}
            style={[styles.period, period === item && styles.selectedPeriod]}
          >
            <Text style={[styles.periodText, period === item && styles.selectedPeriodText]}>
              {t(`health.suuntoPeriod${item}`)}
            </Text>
          </Pressable>
        ))}
      </View>
      {query.data?.syncState?.status === 'error' && (
        <Text style={styles.syncWarning}>{t('health.suuntoSyncWarning')}</Text>
      )}

      {query.isLoading ? (
        <GlassCard style={[styles.stateCard, healthStyles.glassCard]}>
          <Text style={[styles.stateText, { color: colors.textSecondary }]}>{t('health.suuntoLoading')}</Text>
        </GlassCard>
      ) : query.isError ? (
        <GlassCard style={[styles.stateCard, healthStyles.glassCard]}>
          <Text style={[styles.stateText, { color: colors.textSecondary }]}>{t('health.suuntoError')}</Text>
        </GlassCard>
      ) : (
        <>
          <View style={styles.summaryGrid}>
            <SummaryCard
              width={cardWidth}
              cardStyle={healthStyles.glassCard}
              textColor={colors.textPrimary}
              secondaryTextColor={colors.textSecondary}
              icon={<Heart size={18} color="#F05252" />}
              label={t('health.suuntoHeartRate')}
              value={heartSummary ? `${heartSummary.average} bpm` : '—'}
              description={t('health.suuntoHeartRateCardDescription')}
              hint={t('health.suuntoOpenDetails')}
              onPress={() => {
                setMetric('heart_rate');
                showDetail('heart_rate');
              }}
            />
            <SummaryCard
              width={cardWidth}
              cardStyle={healthStyles.glassCard}
              textColor={colors.textPrimary}
              secondaryTextColor={colors.textSecondary}
              icon={<HeartPulse size={18} color="#8B68E8" />}
              label={t('health.suuntoHrv')}
              value={hrvSummary ? `${hrvSummary.average} ms` : '—'}
              description={t('health.suuntoHrvCardDescription')}
              hint={t('health.suuntoOpenDetails')}
              onPress={() => {
                setMetric('hrv_rmssd');
                showDetail('hrv_rmssd');
              }}
            />
          </View>

          <Text style={[styles.subheading, healthStyles.sectionTitle]}>{t('health.suuntoRecovery')}</Text>
          <View style={styles.summaryGrid}>
            <SummaryCard
              width={cardWidth}
              cardStyle={healthStyles.glassCard}
              textColor={colors.textPrimary}
              secondaryTextColor={colors.textSecondary}
              icon={<Activity size={18} color="#8B68E8" />}
              label={t('health.suuntoBalance')}
              value={
                latest('recovery_balance') == null ? '—' : `${Math.round(Number(latest('recovery_balance')) * 100)}%`
              }
              hint={t('health.suuntoOpenDetails')}
              onPress={() => showDetail('recovery')}
            />
            <SummaryCard
              width={cardWidth}
              cardStyle={healthStyles.glassCard}
              textColor={colors.textPrimary}
              secondaryTextColor={colors.textSecondary}
              icon={<RefreshCw size={18} color="#F59E0B" />}
              label={t('health.suuntoStress')}
              value={stressLabel}
              hint={t('health.suuntoOpenDetails')}
              onPress={() => showDetail('stress')}
            />
            <SummaryCard
              width={cardWidth}
              cardStyle={healthStyles.glassCard}
              textColor={colors.textPrimary}
              secondaryTextColor={colors.textSecondary}
              icon={<Footprints size={18} color="#35B779" />}
              label={t('health.suuntoSteps')}
              value={totalSteps === null ? '—' : totalSteps.toLocaleString()}
              hint={t('health.suuntoOpenDetails')}
              onPress={() => showDetail('steps')}
            />
            <SummaryCard
              width={cardWidth}
              cardStyle={healthStyles.glassCard}
              textColor={colors.textPrimary}
              secondaryTextColor={colors.textSecondary}
              icon={<Zap size={18} color="#F59E0B" />}
              label={t('health.suuntoEnergy')}
              value={totalEnergy === null ? '—' : `${Math.round(totalEnergy)} kcal`}
              hint={t('health.suuntoOpenDetails')}
              onPress={() => showDetail('energy')}
            />
          </View>
          {!query.data?.samples.length && !query.data?.sleeps.length && !query.data?.steps.length && (
            <Text style={[styles.empty, { color: colors.textSecondary }]}>{t('health.suuntoNoData')}</Text>
          )}
        </>
      )}
      <Text style={[styles.source, { color: colors.textSecondary }]}>
        {t('health.suuntoSource', {
          date: query.data?.syncState?.last_success_at
            ? new Date(query.data.syncState.last_success_at).toLocaleString()
            : t('health.suuntoNeverSynced'),
        })}
      </Text>
      <Text style={[styles.accessNote, { color: colors.textSecondary }]}>{t('health.suuntoAccessNote')}</Text>
      <Modal
        visible={activeDetail !== null}
        transparent={false}
        animationType="slide"
        presentationStyle="fullScreen"
        statusBarTranslucent
        onRequestClose={() => setActiveDetail(null)}
      >
        <SafeAreaView style={[styles.modalRoot, healthStyles.modalContent]} edges={['top', 'bottom']}>
          {activeDetail && (
            <>
              <View style={styles.fullscreenHeader}>
                <View style={styles.detailHeader}>
                  <View style={styles.detailTitleGroup}>
                    {getSummaryIcon(activeDetail)}
                    <Text style={[styles.detailTitle, healthStyles.title]}>{activeDetailTitle}</Text>
                  </View>
                  <Pressable
                    onPress={() => setActiveDetail(null)}
                    style={styles.closeButton}
                    accessibilityRole="button"
                    accessibilityLabel={t('common.close')}
                  >
                    <X size={20} color={colors.textSecondary} />
                  </Pressable>
                </View>
              </View>
              <ScrollView
                style={styles.detailScroll}
                contentContainerStyle={styles.detailContent}
                showsVerticalScrollIndicator={false}
              >
                <View
                  style={[styles.periods, styles.detailPeriodControl]}
                  accessibilityRole="tablist"
                  accessibilityLabel={t('health.suuntoPeriod')}
                >
                  <ScrollView
                    horizontal
                    style={styles.detailPeriodScroll}
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.detailPeriodList}
                  >
                    {SUUNTO_DETAIL_PERIODS.map(item => (
                      <Pressable
                        key={item}
                        onPress={() => setDetailPeriod(item)}
                        accessibilityRole="tab"
                        accessibilityState={{ selected: detailPeriod === item }}
                        style={[styles.detailPeriodTab, detailPeriod === item && styles.selectedPeriod]}
                      >
                        <Text style={[styles.periodText, detailPeriod === item && styles.selectedPeriodText]}>
                          {t(`health.suuntoPeriod${item}`)}
                        </Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                </View>
                {query.isFetching ? (
                  <Text style={[styles.detailPeriod, { color: colors.textSecondary }]}>
                    {t('health.suuntoLoading')}
                  </Text>
                ) : query.isError ? (
                  <Text style={[styles.empty, { color: colors.textSecondary }]}>{t('health.suuntoError')}</Text>
                ) : null}
                <Text style={[styles.detailValue, healthStyles.title]}>
                  {getSummaryValue(activeDetail, {
                    heart_rate: heartSummary ? `${heartSummary.average} bpm` : '—',
                    hrv_rmssd: hrvSummary ? `${hrvSummary.average} ms` : '—',
                    recovery:
                      latest('recovery_balance') == null
                        ? '—'
                        : `${Math.round(Number(latest('recovery_balance')) * 100)}%`,
                    sleep: averageSleepLabel,
                    stress: stressLabel,
                    steps: totalSteps === null ? '—' : totalSteps.toLocaleString(),
                    energy: totalEnergy === null ? '—' : `${Math.round(totalEnergy)} kcal`,
                  })}
                </Text>
                <Text style={[styles.detailPeriod, { color: colors.textSecondary }]}>
                  {activePeriodSummaryLabel} · {t(`health.suuntoPeriod${detailPeriod}`)}
                </Text>
                <Text style={[styles.detailDescription, { color: colors.textSecondary }]}>
                  {t(summaryDescriptions[activeDetail])}
                </Text>
                {activeDetail === 'sleep' && sleepPoints.length > 0 ? (
                  <>
                    <Text style={[styles.detailSectionTitle, healthStyles.title]}>
                      {t('health.suuntoSleepTrendChart')}
                    </Text>
                    <SimpleChart
                      data={sleepPoints}
                      type="bar"
                      height={190}
                      color="#8B68E8"
                      range={getSuuntoChartRange(detailPeriod)}
                      unit="h"
                      showYAxis
                    />
                    {latestSleep ? (
                      <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>
                        {t('health.suuntoLatestSleepSession', { date: latestSleep.date })}
                      </Text>
                    ) : null}
                  </>
                ) : null}
                {activeDetail === 'sleep' ? (
                  latestSleep ? (
                    <>
                      <Text style={[styles.detailSectionTitle, healthStyles.title]}>
                        {t('health.suuntoSleepStages')}
                      </Text>
                      <Text style={[styles.detailDescription, { color: colors.textSecondary }]}>
                        {t('health.suuntoSleepStagesDescription')}
                      </Text>
                      <View style={styles.stageBar}>
                        {[latestSleep.deep_sleep_min, latestSleep.light_sleep_min, latestSleep.rem_sleep_min].map(
                          (stage, index) => (
                            <View
                              key={index}
                              style={{ flex: Math.max(stage ?? 0, 1), backgroundColor: zoneColors[index + 1] }}
                            />
                          ),
                        )}
                      </View>
                      <View style={styles.sleepStageList}>
                        {[
                          {
                            label: t('health.suuntoDeep'),
                            minutes: latestSleep.deep_sleep_min,
                            description: t('health.suuntoDeepDescription'),
                          },
                          {
                            label: t('health.suuntoLight'),
                            minutes: latestSleep.light_sleep_min,
                            description: t('health.suuntoLightDescription'),
                          },
                          {
                            label: t('health.suuntoRem'),
                            minutes: latestSleep.rem_sleep_min,
                            description: t('health.suuntoRemDescription'),
                          },
                        ].map(({ label, minutes, description }, index) => (
                          <View key={label} style={styles.sleepStageRow}>
                            <View style={styles.sleepStageTopRow}>
                              <View style={styles.legendItem}>
                                <View style={[styles.legendDot, { backgroundColor: zoneColors[index + 1] }]} />
                                <Text style={[styles.metricLabel, { color: colors.textPrimary }]}>{label}</Text>
                              </View>
                              <Text style={[styles.metricLabel, { color: colors.textPrimary }]}>
                                {formatMinutes(minutes)}
                              </Text>
                            </View>
                            <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>{description}</Text>
                          </View>
                        ))}
                      </View>
                      <Text style={[styles.detailSectionTitle, healthStyles.title]}>
                        {t('health.suuntoSleepMetrics')}
                      </Text>
                      <View style={styles.metricsGrid}>
                        <Metric
                          label={t('health.sleepHeartRate')}
                          value={latestSleep.avg_heart_rate_bpm}
                          unit="bpm"
                          description={t('health.sleepHeartRateDescription')}
                        />
                        <Metric
                          label={t('health.sleepMinHeartRate')}
                          value={latestSleep.min_heart_rate_bpm}
                          unit="bpm"
                          description={t('health.sleepMinHeartRateDescription')}
                        />
                        <Metric
                          label={t('health.sleepHrv')}
                          value={latestSleep.avg_hrv_ms}
                          unit="ms"
                          description={t('health.sleepHrvDescription')}
                        />
                        <Metric
                          label={t('health.sleepSpo2Max')}
                          value={latestSleep.max_spo2_pct}
                          unit="%"
                          description={t('health.sleepSpo2MaxDescription')}
                        />
                        <Metric
                          label={t('health.suuntoSleepScore')}
                          value={latestSleep.sleep_score}
                          unit=""
                          description={t('health.sleepScoreDescription')}
                        />
                        <Metric
                          label={t('health.sleepAwake')}
                          value={latestSleep.awake_min}
                          unit="min"
                          description={t('health.sleepAwakeDescription')}
                        />
                      </View>
                    </>
                  ) : (
                    <Text style={[styles.empty, { color: colors.textSecondary }]}>{t('health.suuntoNoSleep')}</Text>
                  )
                ) : activeDetail === 'stress' ? (
                  stressReadingCount > 0 ? (
                    <View style={styles.stressBreakdown}>
                      {(
                        [
                          ['relaxing', t('health.suuntoStressRelaxing'), stressCounts.relaxing, '#35B779'],
                          ['active', t('health.suuntoStressActive'), stressCounts.active, '#F4C542'],
                          ['passive', t('health.suuntoStressPassive'), stressCounts.passive, '#8B68E8'],
                          ['stressful', t('health.suuntoStressful'), stressCounts.stressful, '#F05252'],
                        ] as const
                      ).map(([key, label, count, color]) => {
                        const share = (count / stressReadingCount) * 100;
                        return (
                          <View key={key} style={styles.stressRow}>
                            <View style={styles.stressLabelRow}>
                              <Text style={[styles.metricLabel, { color: colors.textPrimary }]}>{label}</Text>
                              <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>
                                {t('health.suuntoStressSamples', { count })}
                              </Text>
                            </View>
                            <View style={styles.stressTrack}>
                              <View style={[styles.stressFill, { width: `${share}%`, backgroundColor: color }]} />
                            </View>
                          </View>
                        );
                      })}
                    </View>
                  ) : (
                    <Text style={[styles.empty, { color: colors.textSecondary }]}>
                      {t('health.suuntoNoMetricData')}
                    </Text>
                  )
                ) : detailPoints.length > 0 ? (
                  <SimpleChart
                    data={detailPoints}
                    type={activeDetail === 'steps' || activeDetail === 'energy' ? 'bar' : 'line'}
                    height={190}
                    color={
                      activeDetail === 'heart_rate'
                        ? '#F05252'
                        : activeDetail === 'hrv_rmssd'
                          ? '#8B68E8'
                          : activeDetail === 'recovery' || activeDetail === 'steps'
                            ? '#35B779'
                            : '#F59E0B'
                    }
                    range={getSuuntoChartRange(detailPeriod)}
                    unit={
                      activeDetail === 'heart_rate'
                        ? 'bpm'
                        : activeDetail === 'hrv_rmssd'
                          ? 'ms'
                          : activeDetail === 'recovery'
                            ? '%'
                            : activeDetail === 'steps'
                              ? 'steps'
                              : 'kcal'
                    }
                    showYAxis
                  />
                ) : (
                  <Text style={[styles.empty, { color: colors.textSecondary }]}>{t('health.suuntoNoMetricData')}</Text>
                )}
                <Text style={[styles.detailSectionTitle, healthStyles.title]}>
                  {t(getSuuntoHealthEducation(activeDetail).titleTranslationKey)}
                </Text>
                {getSuuntoHealthEducation(activeDetail).sections.map(section => (
                  <EducationCard
                    key={section.topic}
                    title={t(suuntoEducationTopicTitles[section.topic])}
                    body={t(section.translationKey)}
                    textColor={colors.textPrimary}
                    secondaryTextColor={colors.textSecondary}
                  />
                ))}
              </ScrollView>
            </>
          )}
        </SafeAreaView>
      </Modal>
    </View>
  );
};

const EducationCard = ({
  title,
  body,
  textColor,
  secondaryTextColor,
}: {
  title: string;
  body: string;
  textColor: string;
  secondaryTextColor: string;
}) => {
  const [expanded, setExpanded] = React.useState(true);
  const DisclosureIcon = expanded ? ChevronUp : ChevronDown;

  return (
    <View style={styles.educationCard}>
      <Pressable
        onPress={() => setExpanded(current => !current)}
        style={styles.educationHeader}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
      >
        <Text style={[styles.educationTitle, { color: textColor }]}>{title}</Text>
        <DisclosureIcon size={18} color={secondaryTextColor} />
      </Pressable>
      {expanded ? <Text style={[styles.educationBody, { color: textColor }]}>{body}</Text> : null}
    </View>
  );
};

const Metric = ({
  label,
  value,
  unit,
  description,
}: {
  label: string;
  value: number | null;
  unit: string;
  description?: string;
}) => (
  <View style={styles.metric}>
    <Text style={styles.metricValue}>{value == null ? '—' : `${Math.round(Number(value))} ${unit}`}</Text>
    <Text style={styles.metricLabel}>{label}</Text>
    {description ? <Text style={styles.metricDescription}>{description}</Text> : null}
  </View>
);

const formatMinutes = (minutes: number | null) => {
  if (minutes == null) return '—';
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = Math.round(minutes % 60);
  return hours ? `${hours}h ${remainingMinutes}m` : `${remainingMinutes} min`;
};
const SummaryCard = ({
  width,
  cardStyle,
  textColor,
  secondaryTextColor,
  icon,
  label,
  value,
  description,
  hint,
  onPress,
}: {
  width: number | `${number}%`;
  cardStyle: StyleProp<ViewStyle>;
  textColor: string;
  secondaryTextColor: string;
  icon: React.ReactNode;
  label: string;
  value: string;
  description?: string;
  hint: string;
  onPress: () => void;
}) => (
  <View style={[styles.summaryCardSlot, { width }]}>
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${value}.${description ? ` ${description}` : ''} ${hint}`}
    >
      <GlassCard style={[styles.summaryCard, cardStyle]}>
        <View style={styles.summaryHeader}>
          <View style={styles.summaryLabelGroup}>
            {icon}
            <Text style={[styles.metricLabel, { color: secondaryTextColor }]} numberOfLines={2}>
              {label}
            </Text>
          </View>
          <ChevronRight size={18} color="#858A93" />
        </View>
        <Text style={[styles.summaryValue, { color: textColor }]} numberOfLines={1} adjustsFontSizeToFit>
          {value}
        </Text>
        {description ? (
          <Text style={[styles.summaryDescription, { color: secondaryTextColor }]} numberOfLines={3}>
            {description}
          </Text>
        ) : null}
        <Text style={[styles.summaryHint, { color: secondaryTextColor }]}>{hint}</Text>
      </GlassCard>
    </Pressable>
  </View>
);

const getSummaryIcon = (metric: SummaryMetric) => {
  if (metric === 'heart_rate') return <Heart size={20} color="#F05252" />;
  if (metric === 'hrv_rmssd') return <HeartPulse size={20} color="#8B68E8" />;
  if (metric === 'recovery') return <Activity size={20} color="#8B68E8" />;
  if (metric === 'sleep') return <Moon size={20} color="#8B68E8" />;
  if (metric === 'stress') return <RefreshCw size={20} color="#F59E0B" />;
  if (metric === 'steps') return <Footprints size={20} color="#35B779" />;
  return <Zap size={20} color="#F59E0B" />;
};

const getSummaryValue = (metric: SummaryMetric, values: Record<SummaryMetric, string>) => values[metric];

const styles = StyleSheet.create({
  section: { marginTop: 28, gap: 12 },
  sectionHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  heading: { fontSize: 22, fontWeight: '800', marginBottom: 3 },
  subheading: { fontSize: 18, fontWeight: '700', marginTop: 12, marginBottom: 2 },
  caption: { fontSize: 13 },
  periods: { flexDirection: 'row', borderRadius: 24, borderWidth: 1, borderColor: 'rgba(127,127,127,.2)', padding: 3 },
  detailPeriodControl: { width: '100%', overflow: 'hidden' },
  detailPeriodScroll: { flex: 1 },
  detailPeriodList: { flexDirection: 'row', gap: 4 },
  detailPeriodTab: { width: 72, minHeight: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 21 },
  period: { flex: 1, minHeight: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 21 },
  selectedPeriod: { backgroundColor: '#19B5D8' },
  periodText: { fontSize: 13, fontWeight: '600', color: '#747982' },
  selectedPeriodText: { color: '#FFF' },
  stateCard: { padding: 20, borderRadius: 20 },
  stateText: { fontSize: 14 },
  value: { fontSize: 29, fontWeight: '800' },
  unit: { fontSize: 14, fontWeight: '600', color: '#82858A' },
  empty: { paddingVertical: 18, fontSize: 14, textAlign: 'center' },
  stageBar: { height: 8, flexDirection: 'row', overflow: 'hidden', borderRadius: 6, gap: 2, marginVertical: 14 },
  stageLegend: { flexDirection: 'row', justifyContent: 'space-between', marginTop: -7, marginBottom: 8 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 7, height: 7, borderRadius: 4 },
  metricsGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  metric: { width: '50%', paddingVertical: 8 },
  metricValue: { fontSize: 16, fontWeight: '700', color: '#26282C' },
  metricLabel: { fontSize: 12, color: '#777B82' },
  metricDescription: { fontSize: 12, lineHeight: 17, color: '#777B82', marginTop: 3 },
  summaryGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-start', gap: 10 },
  summaryCardSlot: { flexShrink: 0 },
  summaryCard: { width: '100%', minHeight: 164, padding: 14, borderRadius: 18 },
  summaryHeader: { minHeight: 36, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  summaryLabelGroup: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 8 },
  summaryValue: { fontSize: 20, fontWeight: '800', color: '#26282C', marginTop: 5 },
  summaryDescription: { fontSize: 12, lineHeight: 16, marginTop: 5 },
  summaryHint: { fontSize: 11, color: '#777B82', marginTop: 3 },
  modalRoot: { flex: 1 },
  fullscreenHeader: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 8 },
  detailScroll: { flex: 1 },
  detailContent: { flexGrow: 1, width: '100%', maxWidth: 960, alignSelf: 'center', padding: 22, gap: 12 },
  detailHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44 },
  detailTitleGroup: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  detailTitle: { fontSize: 19, fontWeight: '700' },
  closeButton: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  detailValue: { fontSize: 42, fontWeight: '800', marginTop: 8 },
  detailPeriod: { fontSize: 13, marginTop: -8 },
  detailDescription: { fontSize: 14, lineHeight: 20, marginVertical: 8 },
  detailSectionTitle: { fontSize: 19, fontWeight: '700', marginTop: 12 },
  educationCard: {
    borderWidth: 1,
    borderColor: 'rgba(128, 128, 128, 0.22)',
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  educationHeader: {
    minHeight: 32,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  educationTitle: { flex: 1, fontSize: 16, fontWeight: '700' },
  educationBody: { fontSize: 14, lineHeight: 21, marginTop: 10 },
  sleepStageList: { gap: 14, marginTop: 6 },
  sleepStageRow: { gap: 5 },
  sleepStageTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  stressBreakdown: { gap: 16, marginTop: 8, width: '100%' },
  stressRow: { gap: 7 },
  stressLabelRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  stressTrack: { height: 8, borderRadius: 5, overflow: 'hidden', backgroundColor: 'rgba(128,128,128,.16)' },
  stressFill: { height: '100%', borderRadius: 5 },
  source: { fontSize: 11, textAlign: 'center', marginTop: 4, marginBottom: 12 },
  accessNote: { fontSize: 11, lineHeight: 16, textAlign: 'center', marginBottom: 8 },
  syncWarning: { color: '#B45309', fontSize: 13, lineHeight: 18 },
});
