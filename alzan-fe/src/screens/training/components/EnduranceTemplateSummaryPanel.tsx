import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Clock, Ruler, Zap } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { GlassCard } from '../../../components/GlassCard';
import { SportIcon } from '../../../components/icons/SportIcon';
import { useTheme } from '../../../context/ThemeContext';
import { borderRadius, spacing, typography } from '../../../theme';
import { SportType } from '../../../types/requests.types';

interface PhaseSummary {
  warmup: string;
  work: string;
  recovery: string;
}

interface EnduranceTemplateSummaryPanelProps {
  sportType: SportType;
  sportLabel: string;
  sportColor: string;
  goalLabel?: string;
  environmentLabel?: string;
  surfaceLabel?: string;
  scheduleLabel?: string;
  durationLabel: string;
  distanceLabel?: string;
  phaseSummary?: PhaseSummary;
  hasSteps: boolean;
  canDesignWorkout: boolean;
  compact?: boolean;
  onDesignWorkout?: () => void;
}

interface PhaseRowProps {
  color: string;
  label: string;
  value: string;
  textColor: string;
  secondaryColor: string;
}

const PhaseRow = ({ color, label, value, textColor, secondaryColor }: PhaseRowProps) => (
  <View style={styles.phaseRow}>
    <View style={[styles.phaseMarker, { backgroundColor: color }]} />
    <Text style={[styles.phaseLabel, { color: secondaryColor }]}>{label}</Text>
    <Text style={[styles.phaseValue, { color: textColor }]}>{value}</Text>
  </View>
);

export const EnduranceTemplateSummaryPanel = React.memo(
  ({
    sportType,
    sportLabel,
    sportColor,
    goalLabel,
    environmentLabel,
    surfaceLabel,
    scheduleLabel,
    durationLabel,
    distanceLabel,
    phaseSummary,
    hasSteps,
    canDesignWorkout,
    compact = false,
    onDesignWorkout,
  }: EnduranceTemplateSummaryPanelProps) => {
    const { t } = useTranslation();
    const { colors } = useTheme();
    const metadata = [goalLabel, environmentLabel, surfaceLabel].filter((value): value is string => !!value);

    return (
      <GlassCard style={[styles.card, compact && styles.cardCompact, { borderColor: colors.border }]}>
        <View style={[styles.header, compact && styles.headerCompact]}>
          <View style={[styles.sportIcon, compact && styles.sportIconCompact, { backgroundColor: `${sportColor}18` }]}>
            <SportIcon sport={sportType} size={compact ? 22 : 27} color={sportColor} />
          </View>
          <View style={styles.heading}>
            <Text style={[styles.overline, { color: colors.textSecondary }]}>{t('training.sessionSummary')}</Text>
            <Text style={[styles.sportTitle, { color: colors.textPrimary }]}>{sportLabel}</Text>
            {metadata.length > 0 && (
              <Text numberOfLines={2} style={[styles.metadata, { color: colors.textSecondary }]}>
                {metadata.join(' · ')}
              </Text>
            )}
          </View>
        </View>

        <View style={[styles.metrics, compact && styles.metricsCompact]}>
          <View style={[styles.metric, compact && styles.metricCompact, { backgroundColor: `${colors.primary}0D` }]}>
            <Clock size={compact ? 16 : 18} color={colors.primary} />
            <Text style={[styles.metricValue, compact && styles.metricValueCompact, { color: colors.textPrimary }]}>
              {durationLabel}
            </Text>
            <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>{t('training.totalTime')}</Text>
          </View>
          {distanceLabel && (
            <View style={[styles.metric, compact && styles.metricCompact, { backgroundColor: `${sportColor}12` }]}>
              <Ruler size={compact ? 16 : 18} color={sportColor} />
              <Text style={[styles.metricValue, compact && styles.metricValueCompact, { color: colors.textPrimary }]}>
                {distanceLabel}
              </Text>
              <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>
                {t('training.distanceParenAllCaps')}
              </Text>
            </View>
          )}
        </View>

        {phaseSummary && hasSteps && (
          <View style={[styles.phases, compact && styles.phasesCompact, { borderTopColor: colors.border }]}>
            <PhaseRow
              color={colors.success}
              label={t('training.warmup')}
              value={phaseSummary.warmup}
              textColor={colors.textPrimary}
              secondaryColor={colors.textSecondary}
            />
            <PhaseRow
              color={sportColor}
              label={t('training.block')}
              value={phaseSummary.work}
              textColor={colors.textPrimary}
              secondaryColor={colors.textSecondary}
            />
            <PhaseRow
              color={colors.accent}
              label={t('training.recovery')}
              value={phaseSummary.recovery}
              textColor={colors.textPrimary}
              secondaryColor={colors.textSecondary}
            />
          </View>
        )}

        {scheduleLabel && (
          <Text style={[styles.schedule, { color: colors.textSecondary, borderTopColor: colors.border }]}>
            {scheduleLabel}
          </Text>
        )}

        {canDesignWorkout && onDesignWorkout && (
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={hasSteps ? t('training.editWorkout') : t('training.designWorkout')}
            activeOpacity={0.86}
            style={[styles.designButton, compact && styles.designButtonCompact, { backgroundColor: colors.primary }]}
            onPress={onDesignWorkout}
          >
            <Zap size={17} color="#FFFFFF" />
            <Text style={styles.designButtonText}>
              {hasSteps ? t('training.editWorkout') : t('training.designWorkout')}
            </Text>
          </TouchableOpacity>
        )}
      </GlassCard>
    );
  },
);

EnduranceTemplateSummaryPanel.displayName = 'EnduranceTemplateSummaryPanel';

const styles = StyleSheet.create({
  card: {
    padding: spacing.m,
    borderWidth: 1,
    borderRadius: borderRadius.l,
  },
  cardCompact: {
    padding: spacing.s,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.m,
  },
  headerCompact: {
    marginBottom: spacing.s,
  },
  sportIcon: {
    width: 54,
    height: 54,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.m,
  },
  sportIconCompact: {
    width: 44,
    height: 44,
    borderRadius: 14,
    marginRight: spacing.s,
  },
  heading: {
    flex: 1,
  },
  overline: {
    ...typography.caption,
    fontSize: 10,
    letterSpacing: 0.9,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  sportTitle: {
    ...typography.h4,
    marginTop: 2,
    fontWeight: '700',
  },
  metadata: {
    ...typography.caption,
    marginTop: 3,
    lineHeight: 17,
  },
  metrics: {
    flexDirection: 'row',
    gap: spacing.s,
  },
  metricsCompact: {
    gap: 6,
  },
  metric: {
    flex: 1,
    minHeight: 92,
    borderRadius: borderRadius.m,
    padding: spacing.s,
    justifyContent: 'space-between',
  },
  metricCompact: {
    minHeight: 75,
    padding: 7,
  },
  metricValue: {
    fontSize: 20,
    lineHeight: 24,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    marginTop: spacing.s,
  },
  metricValueCompact: {
    fontSize: 17,
    lineHeight: 20,
    marginTop: 5,
  },
  metricLabel: {
    fontSize: 10,
    letterSpacing: 0.8,
    fontWeight: '600',
  },
  phases: {
    borderTopWidth: 1,
    marginTop: spacing.m,
    paddingTop: spacing.s,
    gap: 2,
  },
  phasesCompact: {
    marginTop: spacing.s,
    paddingTop: 4,
  },
  phaseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 31,
  },
  phaseMarker: {
    height: 8,
    width: 8,
    borderRadius: 4,
    marginRight: spacing.s,
  },
  phaseLabel: {
    ...typography.caption,
    flex: 1,
  },
  phaseValue: {
    ...typography.caption,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  schedule: {
    ...typography.caption,
    borderTopWidth: 1,
    marginTop: spacing.s,
    paddingTop: spacing.m,
  },
  designButton: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.s,
    borderRadius: borderRadius.full,
    marginTop: spacing.m,
  },
  designButtonCompact: {
    minHeight: 44,
    marginTop: spacing.s,
  },
  designButtonText: {
    ...typography.button,
    color: '#FFFFFF',
    fontWeight: '700',
  },
});
