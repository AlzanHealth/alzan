import { ChevronRight, Heart, Moon, Plus } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { GlassCard } from '../../../components/GlassCard';
import { useHealthStyles } from '../../../hooks/useHealthStyles';
import type { SleepSession } from '../services/sleepApi';

type Props = {
  session: SleepSession | undefined;
  averageSleepMinutes: number;
  formattedDate: string;
  onOpen: () => void;
  onAdd: () => void;
};

const stageColors = ['#35C978', '#F4C542', '#FF875D'];

const formatDuration = (minutes: number) => `${Math.floor(minutes / 60)}h ${Math.round(minutes % 60)}m`;

export const UnifiedSleepCard = ({ session, averageSleepMinutes, formattedDate, onOpen, onAdd }: Props) => {
  const { t } = useTranslation();
  const { styles: healthStyles, colors } = useHealthStyles();
  const stages = [
    { label: t('health.sleepDeepStage'), minutes: session?.deep_sleep_min ?? 0 },
    { label: t('health.sleepLightStage'), minutes: session?.light_sleep_min ?? 0 },
    { label: t('health.sleepRemStage'), minutes: session?.rem_sleep_min ?? 0 },
  ];
  const stageTotal = stages.reduce((sum, stage) => sum + stage.minutes, 0);
  const metrics = session
    ? [
        { label: t('health.sleepHeartRate'), value: session.avg_heart_rate_bpm, unit: 'bpm' },
        { label: t('health.sleepMinHeartRate'), value: session.min_heart_rate_bpm, unit: 'bpm' },
        { label: t('health.sleepHrv'), value: session.avg_hrv_ms, unit: 'ms' },
        { label: t('health.sleepSpo2Max'), value: session.max_spo2_pct, unit: '%' },
        { label: t('health.sleepScore'), value: session.sleep_score, unit: '' },
        { label: t('health.sleepAwake'), value: session.awake_min, unit: 'min' },
      ].filter(metric => metric.value != null)
    : [];

  return (
    <GlassCard style={[styles.card, healthStyles.glassCard]}>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <Moon size={19} color={colors.primary} />
          <Text style={[styles.title, healthStyles.title]}>{t('health.latestSleepRecord')}</Text>
        </View>
        <Pressable
          onPress={onAdd}
          style={[styles.addButton, { backgroundColor: `${colors.primary}14` }]}
          accessibilityRole="button"
          accessibilityLabel={t('health.registerSleep')}
          hitSlop={6}
        >
          <Plus size={19} color={colors.primary} />
        </Pressable>
      </View>

      <Pressable
        onPress={onOpen}
        accessibilityRole="button"
        accessibilityLabel={`${t('health.sleepOpenDetails')}. ${session?.total_sleep_min ? formatDuration(session.total_sleep_min) : t('health.noSleepRecords')}`}
      >
        {session ? (
          <>
            <Text style={[styles.date, healthStyles.subtitle]}>{formattedDate}</Text>
            <View style={styles.durationRow}>
              <Text style={[styles.duration, healthStyles.title]}>
                {session.total_sleep_min ? formatDuration(session.total_sleep_min) : '—'}
              </Text>
              {session.sleep_score != null ? (
                <View style={[styles.scoreBadge, { backgroundColor: `${colors.primary}18` }]}>
                  <Text style={[styles.score, { color: colors.primary }]}>{session.sleep_score}</Text>
                  <Text style={[styles.scoreLabel, healthStyles.subtitle]}>{t('health.sleepScore')}</Text>
                </View>
              ) : null}
            </View>
            <Text style={[styles.description, healthStyles.subtitle]}>{t('health.sleepCardDescription')}</Text>

            {stageTotal > 0 ? (
              <View style={styles.stageSection}>
                <View style={styles.stageBar}>
                  {stages.map((stage, index) =>
                    stage.minutes > 0 ? (
                      <View
                        key={stage.label}
                        style={{ flex: stage.minutes / stageTotal, backgroundColor: stageColors[index] }}
                      />
                    ) : null,
                  )}
                </View>
                <View style={styles.stageLegend}>
                  {stages.map((stage, index) =>
                    stage.minutes > 0 ? (
                      <View key={stage.label} style={styles.stageLegendItem}>
                        <View style={[styles.stageDot, { backgroundColor: stageColors[index] }]} />
                        <Text style={[styles.stageLabel, healthStyles.subtitle]}>
                          {stage.label} · {formatDuration(stage.minutes)}
                        </Text>
                      </View>
                    ) : null,
                  )}
                </View>
              </View>
            ) : null}

            {metrics.length > 0 ? (
              <View style={styles.metricsGrid}>
                {metrics.map(metric => (
                  <View key={metric.label} style={styles.metric}>
                    <View style={styles.metricValueRow}>
                      {metric.label === t('health.sleepHeartRate') ? <Heart size={13} color={colors.danger} /> : null}
                      <Text style={[styles.metricValue, healthStyles.title]}>
                        {metric.value}
                        {metric.unit ? ` ${metric.unit}` : ''}
                      </Text>
                    </View>
                    <Text style={[styles.metricLabel, healthStyles.subtitle]}>{metric.label}</Text>
                  </View>
                ))}
              </View>
            ) : null}

            {averageSleepMinutes > 0 ? (
              <Text style={[styles.average, healthStyles.subtitle]}>
                {t('health.avgLast30Days')} · {formatDuration(averageSleepMinutes)}
              </Text>
            ) : null}
          </>
        ) : (
          <View style={styles.emptyState}>
            <Text style={[styles.emptyTitle, healthStyles.title]}>{t('health.noSleepRecords')}</Text>
            <Text style={[styles.emptyText, healthStyles.subtitle]}>{t('health.addFirstSleepRecord')}</Text>
          </View>
        )}
        <View style={styles.openDetails}>
          <Text style={[styles.openDetailsText, { color: colors.primary }]}>{t('health.sleepOpenDetails')}</Text>
          <ChevronRight size={17} color={colors.primary} />
        </View>
      </Pressable>
    </GlassCard>
  );
};

const styles = StyleSheet.create({
  card: { padding: 18, marginBottom: 12, borderRadius: 22 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  title: { fontSize: 16, fontWeight: '700' },
  addButton: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  date: { fontSize: 13, marginBottom: 2 },
  durationRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  duration: { fontSize: 38, lineHeight: 46, fontWeight: '800', letterSpacing: -1 },
  description: { fontSize: 13, lineHeight: 19, marginTop: 3 },
  scoreBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 16,
  },
  score: { fontSize: 15, fontWeight: '800' },
  scoreLabel: { fontSize: 12 },
  stageSection: { marginTop: 12, gap: 8 },
  stageBar: { flexDirection: 'row', height: 8, borderRadius: 5, overflow: 'hidden', gap: 2 },
  stageLegend: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 12, rowGap: 6 },
  stageLegendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  stageDot: { width: 7, height: 7, borderRadius: 4 },
  stageLabel: { fontSize: 11 },
  metricsGrid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 15, rowGap: 14 },
  metric: { width: '50%', gap: 3 },
  metricValueRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metricValue: { fontSize: 15, fontWeight: '700' },
  metricLabel: { fontSize: 11 },
  average: { fontSize: 12, fontStyle: 'italic', marginTop: 16 },
  emptyState: { paddingVertical: 12, gap: 4 },
  emptyTitle: { fontSize: 15, fontWeight: '600' },
  emptyText: { fontSize: 13 },
  openDetails: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', marginTop: 14, gap: 2 },
  openDetailsText: { fontSize: 12, fontWeight: '600' },
});
