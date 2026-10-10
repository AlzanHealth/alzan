import React from 'react';
import { Activity, Heart, Moon, Footprints, Zap, RefreshCw, ChevronRight, X } from 'lucide-react-native';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleProp,
  StyleSheet,
  Text,
  View,
  ViewStyle,
  useWindowDimensions,
} from 'react-native';
import { supabase } from '../../../lib/supabaseClient';
import { useAuth } from '../../../context/AuthContext';
import { GlassCard } from '../../../components/GlassCard';
import { SimpleChart, ChartDataPoint } from '../../../components/stats/SimpleChart';
import { useHealthStyles } from '../../../hooks/useHealthStyles';
import { healthQueryKeys } from '../hooks/healthQueryKeys';
import { aggregateDailyActivity, countStressStates } from '../helpers/suuntoHealthPresentation';

type Period = 'D' | 'W' | 'M' | '2M';
type Metric = 'heart_rate' | 'hrv_rmssd';
type SummaryMetric = 'recovery' | 'stress' | 'steps' | 'energy';
const periodDays: Record<Period, number> = { D: 1, W: 7, M: 30, '2M': 56 };
const zoneColors = ['#48B8F2', '#35C978', '#F4C542', '#FF875D', '#F04C55'];
const summaryDescriptions = {
  recovery: 'health.suuntoBalanceDescription',
  stress: 'health.suuntoStressDescription',
  steps: 'health.suuntoStepsDescription',
  energy: 'health.suuntoEnergyDescription',
} as const;

export const SuuntoHealthSection = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { styles: healthStyles, colors } = useHealthStyles();
  const { width: windowWidth } = useWindowDimensions();
  const [activeDetail, setActiveDetail] = React.useState<SummaryMetric | null>(null);
  const [period, setPeriod] = React.useState<Period>('W');
  const [metric, setMetric] = React.useState<Metric>('heart_rate');
  const from = new Date(Date.now() - periodDays[period] * 86_400_000).toISOString();

  const query = useQuery({
    queryKey: [...healthQueryKeys.all(user?.id), 'suunto-24-7', period],
    enabled: !!user,
    queryFn: async () => {
      if (!user) return { samples: [], sleeps: [], steps: [], syncState: null };
      const loadSamples = async () => {
        const all = [];
        for (let offset = 0; offset < 50_000; offset += 1000) {
          const { data, error } = await supabase
            .from('health_metric_samples')
            .select('id, metric_type, value, unit, recorded_at, local_date')
            .eq('user_id', user.id)
            .eq('provider', 'suunto')
            .eq('source_channel', 'cloud')
            .gte('recorded_at', from)
            .in('metric_type', ['heart_rate', 'hrv_rmssd', 'recovery_balance', 'stress_state', 'spo2'])
            .order('recorded_at', { ascending: true })
            .range(offset, offset + 999);
          if (error) throw error;
          all.push(...(data ?? []));
          if (!data || data.length < 1000) break;
        }
        return all;
      };
      const [samples, sleeps, steps, syncState] = await Promise.all([
        loadSamples(),
        supabase
          .from('sleep_sessions')
          .select(
            'id, date, total_sleep_min, awake_min, deep_sleep_min, light_sleep_min, rem_sleep_min, avg_heart_rate_bpm, min_heart_rate_bpm, avg_hrv_ms, avg_spo2_pct, sleep_score, source',
          )
          .eq('user_id', user.id)
          .eq('source', 'suunto')
          .gte('date', from.slice(0, 10))
          .order('date', { ascending: false })
          .limit(60),
        supabase
          .from('daily_steps')
          .select('id, date, total_steps, calories_kcal')
          .eq('user_id', user.id)
          .eq('source', 'suunto')
          .gte('date', from.slice(0, 10))
          .order('date', { ascending: false })
          .limit(180),
        supabase
          .from('integration_sync_state')
          .select('last_success_at, status, last_error')
          .eq('user_id', user.id)
          .eq('provider', 'suunto')
          .eq('source_channel', 'cloud')
          .eq('sync_domain', 'health_metrics')
          .maybeSingle(),
      ]);
      if (sleeps.error) throw sleeps.error;
      if (steps.error) throw steps.error;
      if (syncState.error) throw syncState.error;
      return {
        samples,
        sleeps: sleeps.data ?? [],
        steps: steps.data ?? [],
        syncState: syncState.data,
      };
    },
    staleTime: 60_000,
  });
  const values = query.data?.samples.filter(sample => sample.metric_type === metric) ?? [];
  const bucketSize = period === 'D' ? 30 * 60_000 : period === 'W' ? 2 * 60 * 60_000 : 24 * 60 * 60_000;
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
  const average = values.length
    ? Math.round(values.reduce((sum, row) => sum + Number(row.value), 0) / values.length)
    : null;
  const latestSleep = query.data?.sleeps[0];
  const sleepRows = query.data?.sleeps ?? [];
  const sleepPoints: ChartDataPoint[] = [...sleepRows]
    .reverse()
    .filter(row => row.total_sleep_min != null)
    .map(row => ({ value: Number(row.total_sleep_min), date: new Date(`${row.date}T12:00:00`), label: row.date }));
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
  const avgSleep = sleepRows.length
    ? Math.round(sleepRows.reduce((sum, row) => sum + (row.total_sleep_min ?? 0), 0) / sleepRows.length)
    : null;
  const avgRecovery = recoveryRows.length
    ? Math.round((recoveryRows.reduce((sum, row) => sum + Number(row.value), 0) / recoveryRows.length) * 100)
    : null;
  const totalSteps = query.data?.steps.reduce((sum, row) => sum + (row.total_steps ?? 0), 0) ?? 0;
  const totalEnergy = query.data?.steps.reduce((sum, row) => sum + (row.calories_kcal ?? 0), 0) ?? 0;
  const stepPoints = aggregateDailyActivity(query.data?.steps ?? [], 'steps');
  const energyPoints = aggregateDailyActivity(query.data?.steps ?? [], 'energy');
  const stressRows = query.data?.samples.filter(row => row.metric_type === 'stress_state') ?? [];
  const stressCounts = countStressStates(stressRows.map(row => Number(row.value)));
  const stressReadingCount = Object.values(stressCounts).reduce((sum, value) => sum + value, 0);
  const cardWidth = windowWidth >= 1100 ? 232 : '48%';
  const detailPoints =
    activeDetail === 'recovery'
      ? recoveryPoints
      : activeDetail === 'steps'
        ? stepPoints
        : activeDetail === 'energy'
          ? energyPoints
          : [];
  const activeDetailTitle =
    activeDetail === 'recovery'
      ? t('health.suuntoBalance')
      : activeDetail === 'stress'
        ? t('health.suuntoStress')
        : activeDetail === 'steps'
          ? t('health.suuntoSteps')
          : activeDetail === 'energy'
            ? t('health.suuntoEnergy')
            : '';
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
          <GlassCard style={[styles.chartCard, healthStyles.glassCard]}>
            <View style={styles.metricSwitch}>
              {(['heart_rate', 'hrv_rmssd'] as const).map(item => (
                <Pressable
                  key={item}
                  onPress={() => setMetric(item)}
                  style={[styles.metricButton, metric === item && styles.metricButtonActive]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: metric === item }}
                >
                  {item === 'heart_rate' ? (
                    <Heart size={15} color={metric === item ? '#FFF' : colors.textSecondary} />
                  ) : (
                    <Activity size={15} color={metric === item ? '#FFF' : colors.textSecondary} />
                  )}
                  <Text style={[styles.metricText, { color: metric === item ? '#FFF' : colors.textSecondary }]}>
                    {item === 'heart_rate' ? t('health.suuntoHeartRate') : t('health.suuntoHrv')}
                  </Text>
                </Pressable>
              ))}
            </View>
            <View style={styles.chartSummary}>
              <Text style={[styles.value, healthStyles.title]}>
                {average ?? '—'}
                <Text style={styles.unit}> {metric === 'heart_rate' ? 'bpm' : 'ms'}</Text>
              </Text>
              <Text style={[styles.caption, { color: colors.textSecondary }]}>{t('health.suuntoPeriodAverage')}</Text>
            </View>
            {points.length ? (
              <SimpleChart
                data={points}
                type="line"
                height={190}
                color={metric === 'heart_rate' ? '#F05252' : '#8B68E8'}
                range={period === 'D' ? 'D' : period === 'W' ? 'S' : period === 'M' ? 'M' : '6M'}
                unit={metric === 'heart_rate' ? 'bpm' : 'ms'}
                showYAxis
              />
            ) : (
              <Text style={[styles.empty, { color: colors.textSecondary }]}>{t('health.suuntoNoMetricData')}</Text>
            )}
          </GlassCard>

          <View style={styles.trendGrid}>
            <GlassCard style={[styles.trendCard, healthStyles.glassCard]}>
              <Text style={[styles.dataTitle, healthStyles.title]}>{t('health.suuntoSleepTrend')}</Text>
              <Text style={[styles.trendValue, healthStyles.title]}>
                {avgSleep == null ? '—' : `${Math.floor(avgSleep / 60)}h ${avgSleep % 60}m`}
              </Text>
              {sleepPoints.length ? (
                <SimpleChart
                  data={sleepPoints}
                  type="bar"
                  height={130}
                  color="#8B68E8"
                  range={period === 'D' ? 'D' : period === 'W' ? 'S' : period === 'M' ? 'M' : '6M'}
                  unit="min"
                />
              ) : (
                <Text style={styles.metricLabel}>{t('health.suuntoNoSleep')}</Text>
              )}
            </GlassCard>
            <GlassCard style={[styles.trendCard, healthStyles.glassCard]}>
              <Text style={[styles.dataTitle, healthStyles.title]}>{t('health.suuntoRecoveryTrend')}</Text>
              <Text style={[styles.trendValue, healthStyles.title]}>
                {avgRecovery == null ? '—' : `${avgRecovery}%`}
              </Text>
              {recoveryPoints.length ? (
                <SimpleChart
                  data={recoveryPoints}
                  type="line"
                  height={130}
                  color="#29B877"
                  range={period === 'D' ? 'D' : period === 'W' ? 'S' : period === 'M' ? 'M' : '6M'}
                  unit="%"
                />
              ) : (
                <Text style={styles.metricLabel}>{t('health.suuntoNoMetricData')}</Text>
              )}
            </GlassCard>
          </View>

          <Text style={[styles.subheading, healthStyles.sectionTitle]}>{t('health.suuntoSleep')}</Text>
          {latestSleep ? (
            <GlassCard style={[styles.dataCard, healthStyles.glassCard]}>
              <View style={styles.dataHeader}>
                <Moon size={18} color="#8B5CF6" />
                <Text style={[styles.dataTitle, healthStyles.title]}>
                  {new Date(`${latestSleep.date}T12:00:00`).toLocaleDateString()}
                </Text>
              </View>
              <Text style={[styles.value, healthStyles.title]}>
                {latestSleep.total_sleep_min == null
                  ? '—'
                  : `${Math.floor(latestSleep.total_sleep_min / 60)}h ${Math.round(latestSleep.total_sleep_min % 60)}m`}
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
              <View style={styles.stageLegend}>
                {[t('health.suuntoDeep'), t('health.suuntoLight'), t('health.suuntoRem')].map((label, index) => (
                  <View key={label} style={styles.legendItem}>
                    <View style={[styles.legendDot, { backgroundColor: zoneColors[index + 1] }]} />
                    <Text style={styles.metricLabel}>{label}</Text>
                  </View>
                ))}
              </View>
              <View style={styles.metricsGrid}>
                <Metric label={t('health.suuntoSleepHeartRate')} value={latestSleep.avg_heart_rate_bpm} unit="bpm" />
                <Metric label={t('health.suuntoSleepMinHeartRate')} value={latestSleep.min_heart_rate_bpm} unit="bpm" />
                <Metric label={t('health.suuntoSleepHrv')} value={latestSleep.avg_hrv_ms} unit="ms" />
                <Metric label={t('health.suuntoSleepSpo2')} value={latestSleep.avg_spo2_pct} unit="%" />
                <Metric label={t('health.suuntoSleepScore')} value={latestSleep.sleep_score} unit="" />
                <Metric label={t('health.suuntoAwake')} value={latestSleep.awake_min} unit="min" />
              </View>
            </GlassCard>
          ) : (
            <Text style={[styles.empty, { color: colors.textSecondary }]}>{t('health.suuntoNoSleep')}</Text>
          )}

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
              onPress={() => setActiveDetail('recovery')}
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
              onPress={() => setActiveDetail('stress')}
            />
            <SummaryCard
              width={cardWidth}
              cardStyle={healthStyles.glassCard}
              textColor={colors.textPrimary}
              secondaryTextColor={colors.textSecondary}
              icon={<Footprints size={18} color="#35B779" />}
              label={t('health.suuntoSteps')}
              value={totalSteps.toLocaleString()}
              hint={t('health.suuntoOpenDetails')}
              onPress={() => setActiveDetail('steps')}
            />
            <SummaryCard
              width={cardWidth}
              cardStyle={healthStyles.glassCard}
              textColor={colors.textPrimary}
              secondaryTextColor={colors.textSecondary}
              icon={<Zap size={18} color="#F59E0B" />}
              label={t('health.suuntoEnergy')}
              value={`${Math.round(totalEnergy)} kcal`}
              hint={t('health.suuntoOpenDetails')}
              onPress={() => setActiveDetail('energy')}
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
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setActiveDetail(null)}
      >
        <View style={styles.modalRoot}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setActiveDetail(null)}
            accessibilityRole="button"
            accessibilityLabel={t('common.close')}
          />
          {activeDetail && (
            <View
              style={[
                styles.detailCard,
                activeDetail === 'stress' && styles.stressDetailCard,
                healthStyles.modalContent,
                { borderColor: colors.border },
              ]}
            >
              <ScrollView
                style={styles.detailScroll}
                contentContainerStyle={styles.detailContent}
                showsVerticalScrollIndicator={false}
              >
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
                <Text style={[styles.detailValue, healthStyles.title]}>
                  {getSummaryValue(activeDetail, {
                    recovery:
                      latest('recovery_balance') == null
                        ? '—'
                        : `${Math.round(Number(latest('recovery_balance')) * 100)}%`,
                    stress: stressLabel,
                    steps: totalSteps.toLocaleString(),
                    energy: `${Math.round(totalEnergy)} kcal`,
                  })}
                </Text>
                <Text style={[styles.detailPeriod, { color: colors.textSecondary }]}>
                  {t(`health.suuntoPeriod${period}`)}
                </Text>
                <Text style={[styles.detailDescription, { color: colors.textSecondary }]}>
                  {t(summaryDescriptions[activeDetail])}
                </Text>
                {activeDetail === 'stress' ? (
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
                    type={activeDetail === 'recovery' ? 'line' : 'bar'}
                    height={190}
                    color={activeDetail === 'recovery' ? '#29B877' : activeDetail === 'steps' ? '#35B779' : '#F59E0B'}
                    range={period === 'D' ? 'D' : period === 'W' ? 'S' : period === 'M' ? 'M' : '6M'}
                    unit={activeDetail === 'recovery' ? '%' : activeDetail === 'steps' ? 'steps' : 'kcal'}
                    showYAxis
                  />
                ) : (
                  <Text style={[styles.empty, { color: colors.textSecondary }]}>{t('health.suuntoNoMetricData')}</Text>
                )}
              </ScrollView>
            </View>
          )}
        </View>
      </Modal>
    </View>
  );
};

const Metric = ({ label, value, unit }: { label: string; value: number | null; unit: string }) => (
  <View style={styles.metric}>
    <Text style={styles.metricValue}>{value == null ? '—' : `${Math.round(Number(value))} ${unit}`}</Text>
    <Text style={styles.metricLabel}>{label}</Text>
  </View>
);
const SummaryCard = ({
  width,
  cardStyle,
  textColor,
  secondaryTextColor,
  icon,
  label,
  value,
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
  hint: string;
  onPress: () => void;
}) => (
  <View style={[styles.summaryCardSlot, { width }]}>
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${label}: ${value}. ${hint}`}>
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
        <Text style={[styles.summaryHint, { color: secondaryTextColor }]}>{hint}</Text>
      </GlassCard>
    </Pressable>
  </View>
);

const getSummaryIcon = (metric: SummaryMetric) => {
  if (metric === 'recovery') return <Activity size={20} color="#8B68E8" />;
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
  period: { flex: 1, minHeight: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 21 },
  selectedPeriod: { backgroundColor: '#19B5D8' },
  periodText: { fontSize: 13, fontWeight: '600', color: '#747982' },
  selectedPeriodText: { color: '#FFF' },
  chartCard: { padding: 16, borderRadius: 20 },
  trendGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  trendCard: { padding: 14, borderRadius: 18 },
  trendValue: { fontSize: 22, fontWeight: '800', marginTop: 8 },
  stateCard: { padding: 20, borderRadius: 20 },
  stateText: { fontSize: 14 },
  metricSwitch: { flexDirection: 'row', gap: 8 },
  metricButton: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
    minHeight: 36,
    borderRadius: 18,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(128,128,128,.09)',
  },
  metricButtonActive: { backgroundColor: '#19B5D8' },
  metricText: { fontSize: 12, fontWeight: '600' },
  chartSummary: { marginTop: 14, marginBottom: 2 },
  value: { fontSize: 29, fontWeight: '800' },
  unit: { fontSize: 14, fontWeight: '600', color: '#82858A' },
  empty: { paddingVertical: 18, fontSize: 14, textAlign: 'center' },
  dataCard: { padding: 16, borderRadius: 20 },
  dataHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  dataTitle: { fontSize: 14, fontWeight: '600' },
  stageBar: { height: 8, flexDirection: 'row', overflow: 'hidden', borderRadius: 6, gap: 2, marginVertical: 14 },
  stageLegend: { flexDirection: 'row', justifyContent: 'space-between', marginTop: -7, marginBottom: 8 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 7, height: 7, borderRadius: 4 },
  metricsGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  metric: { width: '50%', paddingVertical: 8 },
  metricValue: { fontSize: 16, fontWeight: '700', color: '#26282C' },
  metricLabel: { fontSize: 12, color: '#777B82' },
  summaryGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-start', gap: 10 },
  summaryCardSlot: { flexShrink: 0 },
  summaryCard: { width: '100%', minHeight: 122, padding: 14, borderRadius: 18 },
  summaryHeader: { minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  summaryLabelGroup: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 8 },
  summaryValue: { fontSize: 20, fontWeight: '800', color: '#26282C', marginTop: 6 },
  summaryHint: { fontSize: 11, color: '#777B82', marginTop: 3 },
  modalRoot: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    backgroundColor: 'rgba(15, 20, 28, 0.48)',
  },
  detailCard: {
    width: '100%',
    maxWidth: 560,
    height: '72%',
    maxHeight: '86%',
    borderRadius: 24,
    borderWidth: 1,
    padding: 0,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 24,
    elevation: 10,
  },
  stressDetailCard: { height: '56%' },
  detailScroll: { flex: 1 },
  detailContent: { flexGrow: 1, padding: 22, gap: 10 },
  detailHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44 },
  detailTitleGroup: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  detailTitle: { fontSize: 19, fontWeight: '700' },
  closeButton: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  detailValue: { fontSize: 34, fontWeight: '800', marginTop: 6 },
  detailPeriod: { fontSize: 13, marginTop: -8 },
  detailDescription: { fontSize: 14, lineHeight: 20, marginVertical: 8 },
  stressBreakdown: { gap: 16, marginTop: 8 },
  stressRow: { gap: 7 },
  stressLabelRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  stressTrack: { height: 8, borderRadius: 5, overflow: 'hidden', backgroundColor: 'rgba(128,128,128,.16)' },
  stressFill: { height: '100%', borderRadius: 5 },
  source: { fontSize: 11, textAlign: 'center', marginTop: 4, marginBottom: 12 },
  accessNote: { fontSize: 11, lineHeight: 16, textAlign: 'center', marginBottom: 8 },
  syncWarning: { color: '#B45309', fontSize: 13, lineHeight: 18 },
});
