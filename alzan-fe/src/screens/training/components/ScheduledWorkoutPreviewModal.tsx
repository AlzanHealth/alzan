import React from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { CalendarDays, Clock, Dumbbell, Link2, Play, Target, X } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { GlassCard } from '../../../components/GlassCard';
import { SportIcon } from '../../../components/icons/SportIcon';
import { SPORTS_CONFIG, getSportDefaultTitleKey } from '../../../constants/sports';
import { useSportCatalog } from '../../../hooks/useSportCatalog';
import { useTrainingStyles } from '../../../hooks/useTrainingStyles';
import { useUnitConversion } from '../../../hooks/useUnitConversion';
import { borderRadius, spacing, typography } from '../../../theme';
import { SPORT_COLORS } from '../../../theme/sportColors';
import { EnduranceWorkoutStep, SportType } from '../../../types/requests.types';
import {
  formatEnduranceStepDuration,
  formatEnduranceStepTarget,
  formatGymExercisePrescription,
  PreviewLabels,
} from '../../../modules/training/helpers/scheduledWorkoutPreviewFormat.helper';
import { sortByOrderIndex } from '../../../modules/training/helpers/advancedEnduranceSession.helper';
import {
  EndurancePreviewTemplate,
  fetchEndurancePreviewTemplate,
  fetchGymPreviewTemplate,
  GymPreviewTemplate,
} from '../../../modules/training/services/scheduledWorkoutPreviewService';
import { getPhaseLabel } from '../helpers/phase.helper';
import {
  getScheduledWorkoutPreviewActionLayout,
  getScheduledWorkoutPreviewModalHeight,
  getScheduledWorkoutPreviewLayout,
  isCompactPreviewLayout,
} from './scheduledWorkoutPreviewLayout.helper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../../context/AuthContext';

export type ScheduledWorkoutPreviewPlan = {
  id: string;
  type: 'gym' | 'endurance';
  templateId: string;
  plannedDate: string;
  title: string;
  subtitle: string;
  sportType?: SportType | null;
  isCompleted?: boolean;
};

type ScheduledWorkoutPreviewModalProps = {
  visible: boolean;
  plan: ScheduledWorkoutPreviewPlan | null;
  primaryActionLabel?: string;
  primaryActionDisabled?: boolean;
  onClose: () => void;
  onAssociateCompletedAction?: () => void;
  onMoveAction?: () => void;
  onPrimaryAction?: () => void;
};

type PreviewData = GymPreviewTemplate | EndurancePreviewTemplate | null;

const getExerciseName = (
  exercise: { base_name_es: string | null; base_name_en: string | null } | null,
  language: string | undefined,
) => {
  if (!exercise) return '';
  return language?.startsWith('en')
    ? exercise.base_name_en || exercise.base_name_es || ''
    : exercise.base_name_es || exercise.base_name_en || '';
};

const getStepChildren = (steps: EnduranceWorkoutStep[], parentId: string) =>
  sortByOrderIndex(steps.filter(step => step.parent_step_id === parentId));

const isGymTemplate = (plan: ScheduledWorkoutPreviewPlan, data: PreviewData): data is GymPreviewTemplate =>
  plan.type === 'gym' && !!data;

const isEnduranceTemplate = (plan: ScheduledWorkoutPreviewPlan, data: PreviewData): data is EndurancePreviewTemplate =>
  plan.type === 'endurance' && !!data;

export const ScheduledWorkoutPreviewModal = ({
  visible,
  plan,
  primaryActionLabel,
  primaryActionDisabled,
  onClose,
  onAssociateCompletedAction,
  onMoveAction,
  onPrimaryAction,
}: ScheduledWorkoutPreviewModalProps) => {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const { colors, isDark } = useTrainingStyles();
  const { units } = useUnitConversion();
  const { getOptionLabel } = useSportCatalog();
  const { width: viewportWidth, height: viewportHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const isCompactLayout = isCompactPreviewLayout(viewportWidth);
  const actionLayout = getScheduledWorkoutPreviewActionLayout(isCompactLayout);
  const [headerHeight, setHeaderHeight] = React.useState(0);
  const [descriptionHeight, setDescriptionHeight] = React.useState(0);
  const [bodyContentHeight, setBodyContentHeight] = React.useState(0);
  const [actionHeight, setActionHeight] = React.useState(0);
  const previewLayout = getScheduledWorkoutPreviewLayout({
    viewportHeight,
    topInset: insets.top,
    bottomInset: insets.bottom,
  });
  const measuredContentHeight =
    headerHeight > 0 && bodyContentHeight > 0 && actionHeight > 0
      ? spacing.m * 2 +
        headerHeight +
        spacing.m +
        (descriptionHeight > 0 ? descriptionHeight + spacing.s : 0) +
        bodyContentHeight +
        spacing.s +
        actionHeight
      : 0;
  const modalHeight = getScheduledWorkoutPreviewModalHeight({
    maxHeight: previewLayout.modalHeight,
    isCompactLayout,
    contentHeight: measuredContentHeight,
  });
  const distanceUnit = units.distance === 'mi' ? 'miles' : 'km';

  const labels = React.useMemo<PreviewLabels>(
    () => ({
      reps: t('training.repCaps'),
      sets: t('training.setsLabel'),
      time: t('training.time'),
      rest: t('common.rest'),
      hrZone: t('training.hrZone'),
      heartRate: t('health.heartRate'),
      pace: t('training.pace'),
      speed: t('training.speed'),
      power: t('training.power'),
      distance: t('training.distanceParenAllCaps'),
      duration: t('training.duration'),
      load: t('training.load'),
    }),
    [t],
  );

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['scheduledWorkoutPreview', user?.id, plan?.type, plan?.templateId, plan?.plannedDate],
    queryFn: async (): Promise<PreviewData> => {
      if (!plan?.templateId) return null;
      if (plan.type === 'gym') return fetchGymPreviewTemplate(plan.templateId, plan.plannedDate, user?.id);
      return fetchEndurancePreviewTemplate(plan.templateId, plan.plannedDate);
    },
    enabled: visible && !!plan?.templateId,
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
  });

  // The modal remains mounted with `enabled: false` while it is closed. When
  // it opens again, explicitly refetch so a template edited in another screen
  // can never leave an old step tree in the calendar preview.
  React.useEffect(() => {
    if (!visible || !plan?.templateId) return;
    void refetch({ cancelRefetch: false });
  }, [plan?.plannedDate, plan?.templateId, plan?.type, refetch, visible]);

  React.useEffect(() => {
    setHeaderHeight(0);
    setDescriptionHeight(0);
    setBodyContentHeight(0);
    setActionHeight(0);
  }, [plan?.id, visible]);

  const sportType =
    plan?.type === 'gym' ? 'strength' : plan?.sportType || (data as EndurancePreviewTemplate | null)?.sport_type;
  const sportColor =
    plan?.type === 'gym'
      ? SPORT_COLORS.gym
      : sportType
        ? SPORT_COLORS[sportType.toLowerCase() as keyof typeof SPORT_COLORS] || colors.primary
        : colors.primary;
  const modalTitle = data?.base_name || plan?.title || t('training.scheduledWorkout');
  const subtitle =
    plan?.type === 'gym'
      ? t('constants.gym')
      : sportType
        ? t(SPORTS_CONFIG[sportType]?.label || getSportDefaultTitleKey(sportType))
        : plan?.subtitle;
  const previewData = data ?? null;
  const description = previewData?.description || '';

  const renderStep = React.useCallback(
    (step: EnduranceWorkoutStep, steps: EnduranceWorkoutStep[], isChild = false): React.ReactNode => {
      const children = getStepChildren(steps, step.id);
      const duration = formatEnduranceStepDuration(step, labels, distanceUnit);
      const target = formatEnduranceStepTarget(step, (sportType || 'other') as SportType, labels, distanceUnit);
      const phaseLabel =
        sportType === 'hyrox' && step.hyrox_step_type === 'station'
          ? getOptionLabel('hyrox', step.hyrox_station_key, 'hyrox_station_focus') || t(getPhaseLabel(step.phase_type))
          : sportType === 'hyrox' && step.hyrox_step_type === 'run'
            ? t('training.hyroxRunBlock')
            : t(getPhaseLabel(step.phase_type));

      return (
        <View key={step.id} style={[styles.stepRow, isChild && styles.childStepRow]}>
          <View style={[styles.stepMarker, { backgroundColor: sportColor }, isChild && styles.childStepMarker]} />
          <View style={styles.stepContent}>
            <View style={styles.stepHeader}>
              <Text style={[styles.stepTitle, { color: colors.textPrimary }]}>{phaseLabel}</Text>
              {step.repetitions && step.repetitions > 1 ? (
                <View style={[styles.repBadge, { backgroundColor: `${sportColor}1A` }]}>
                  <Text style={[styles.repBadgeText, { color: sportColor }]}>{step.repetitions}x</Text>
                </View>
              ) : null}
            </View>
            <View style={styles.stepMetaRow}>
              {duration ? (
                <View style={styles.stepMetaItem}>
                  <Clock size={13} color={colors.textSecondary} />
                  <Text style={[styles.stepMetaText, { color: colors.textSecondary }]}>{duration}</Text>
                </View>
              ) : null}
              {target ? (
                <View style={styles.stepMetaItem}>
                  <Target size={13} color={colors.textSecondary} />
                  <Text style={[styles.stepMetaText, { color: colors.textSecondary }]}>{target}</Text>
                </View>
              ) : null}
            </View>
            {children.length > 0 ? (
              <View style={styles.childrenContainer}>{children.map(child => renderStep(child, steps, true))}</View>
            ) : null}
          </View>
        </View>
      );
    },
    [colors.textPrimary, colors.textSecondary, distanceUnit, getOptionLabel, labels, sportColor, sportType, t],
  );

  if (!plan) return null;

  const renderBody = () => {
    if (isLoading) {
      return (
        <View style={styles.stateBlock}>
          <ActivityIndicator size="small" color={colors.primary} />
          <Text style={[styles.stateText, { color: colors.textSecondary }]}>{t('training.previewLoading')}</Text>
        </View>
      );
    }

    if (isError) {
      return (
        <View style={styles.stateBlock}>
          <Text style={[styles.stateText, { color: colors.textSecondary }]}>{t('training.previewLoadError')}</Text>
          <TouchableOpacity
            style={[styles.retryButton, { borderColor: colors.primary }]}
            onPress={() => void refetch()}
          >
            <Text style={[styles.retryText, { color: colors.primary }]}>{t('training.importRetry')}</Text>
          </TouchableOpacity>
        </View>
      );
    }

    if (isGymTemplate(plan, previewData)) {
      return (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>{t('training.exercises')}</Text>
          {previewData.exercises.map((exercise, index) => (
            <View
              key={exercise.id}
              style={[styles.exerciseRow, { borderBottomColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)' }]}
            >
              <View style={[styles.indexPill, { backgroundColor: `${colors.primary}14` }]}>
                <Text style={[styles.indexText, { color: colors.primary }]}>{index + 1}</Text>
              </View>
              <View style={styles.exerciseContent}>
                <Text style={[styles.itemTitle, { color: colors.textPrimary }]}>
                  {getExerciseName(exercise.exercise, i18n.language) || t('training.exercise')}
                </Text>
                <Text style={[styles.itemMeta, { color: colors.textSecondary }]}>
                  {formatGymExercisePrescription(exercise, labels)}
                </Text>
              </View>
            </View>
          ))}
        </View>
      );
    }

    if (isEnduranceTemplate(plan, previewData)) {
      const topLevelSteps = sortByOrderIndex((previewData.steps || []).filter(step => !step.parent_step_id));

      return (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>{t('training.phases')}</Text>
          {topLevelSteps.length > 0 ? (
            topLevelSteps.map(step => renderStep(step, previewData.steps))
          ) : (
            <Text style={[styles.stateText, { color: colors.textSecondary }]}>{t('training.previewNoDetails')}</Text>
          )}
        </View>
      );
    }

    return <Text style={[styles.stateText, { color: colors.textSecondary }]}>{t('training.previewNoDetails')}</Text>;
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        style={[
          styles.overlay,
          {
            paddingTop: previewLayout.overlayPaddingTop,
            paddingBottom: previewLayout.overlayPaddingBottom,
          },
        ]}
        onPress={onClose}
      >
        <Pressable
          style={[styles.modalCard, { backgroundColor: colors.cardBackground, height: modalHeight }]}
          onPress={event => event.stopPropagation()}
        >
          <View style={styles.header} onLayout={event => setHeaderHeight(event.nativeEvent.layout.height)}>
            <View style={[styles.heroIcon, { backgroundColor: `${sportColor}1A` }]}>
              {plan.type === 'gym' ? (
                <Dumbbell size={24} color={sportColor} />
              ) : (
                <SportIcon sport={sportType || 'other'} size={24} color={sportColor} />
              )}
            </View>
            <View style={styles.headerText}>
              <Text style={[styles.eyebrow, { color: colors.textSecondary }]}>{t('training.dayPlan')}</Text>
              <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={2}>
                {modalTitle}
              </Text>
              <Text style={[styles.subtitle, { color: colors.textSecondary }]} numberOfLines={2}>
                {subtitle}
              </Text>
            </View>
            <TouchableOpacity accessibilityRole="button" style={styles.closeButton} onPress={onClose}>
              <X size={22} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {description ? (
            <GlassCard
              style={[styles.descriptionCard, { borderColor: colors.border }]}
              onLayout={event => setDescriptionHeight(event.nativeEvent.layout.height)}
            >
              <Text style={[styles.descriptionText, { color: colors.textSecondary }]}>{description}</Text>
            </GlassCard>
          ) : null}

          <ScrollView
            style={styles.body}
            contentContainerStyle={styles.bodyContent}
            showsVerticalScrollIndicator
            nestedScrollEnabled
            onContentSizeChange={(_, height) => setBodyContentHeight(height)}
          >
            {renderBody()}
          </ScrollView>

          {!plan.isCompleted ? (
            <View
              style={[
                styles.actionRow,
                isCompactLayout && styles.compactActionRow,
                { flexDirection: actionLayout.actionRowDirection },
              ]}
              onLayout={event => setActionHeight(event.nativeEvent.layout.height)}
            >
              {onAssociateCompletedAction || onMoveAction ? (
                <View
                  style={[
                    styles.secondaryActions,
                    isCompactLayout && styles.compactSecondaryActions,
                    { flexDirection: actionLayout.secondaryActionsDirection },
                  ]}
                >
                  {onAssociateCompletedAction ? (
                    <TouchableOpacity
                      accessibilityRole="button"
                      style={[styles.secondaryButton, { borderColor: colors.primary }]}
                      onPress={onAssociateCompletedAction}
                    >
                      <Link2 size={15} color={colors.primary} />
                      <Text style={[styles.secondaryButtonText, { color: colors.primary }]}>
                        {t('training.associateCompletedWorkout')}
                      </Text>
                    </TouchableOpacity>
                  ) : null}
                  {onMoveAction ? (
                    <TouchableOpacity
                      accessibilityRole="button"
                      style={[styles.secondaryButton, { borderColor: colors.primary }]}
                      onPress={onMoveAction}
                    >
                      <CalendarDays size={15} color={colors.primary} />
                      <Text style={[styles.secondaryButtonText, { color: colors.primary }]}>
                        {t('training.moveWorkout')}
                      </Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              ) : null}
              {onPrimaryAction ? (
                <TouchableOpacity
                  accessibilityRole="button"
                  disabled={primaryActionDisabled}
                  style={[
                    styles.primaryButton,
                    actionLayout.primaryButtonFullWidth && styles.compactPrimaryButton,
                    { backgroundColor: primaryActionDisabled ? colors.textSecondary : colors.primary },
                  ]}
                  onPress={onPrimaryAction}
                >
                  <Play size={14} color="#FFFFFF" />
                  <Text style={styles.primaryButtonText}>{primaryActionLabel || t('training.start')}</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          ) : null}
        </Pressable>
      </Pressable>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.42)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.m,
  },
  modalCard: {
    width: '100%',
    maxWidth: 520,
    borderRadius: 26,
    padding: spacing.m,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.m,
  },
  heroIcon: {
    width: 52,
    height: 52,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.s,
  },
  headerText: {
    flex: 1,
  },
  eyebrow: {
    ...typography.caption,
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  title: {
    ...typography.h4,
    fontWeight: '700',
    marginTop: 2,
  },
  subtitle: {
    ...typography.caption,
    marginTop: 2,
  },
  closeButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  descriptionCard: {
    padding: spacing.s,
    borderWidth: 1,
    borderRadius: borderRadius.m,
    marginBottom: spacing.s,
  },
  descriptionText: {
    ...typography.caption,
    lineHeight: 18,
  },
  body: {
    flex: 1,
    minHeight: 0,
  },
  bodyContent: {
    paddingBottom: spacing.m,
  },
  section: {
    gap: spacing.xs,
  },
  sectionTitle: {
    ...typography.body,
    fontWeight: '700',
    marginBottom: spacing.xs,
  },
  exerciseRow: {
    flexDirection: 'row',
    paddingVertical: spacing.s,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  indexPill: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.s,
  },
  indexText: {
    fontSize: 12,
    fontWeight: '700',
  },
  exerciseContent: {
    flex: 1,
  },
  itemTitle: {
    ...typography.body,
    fontWeight: '700',
  },
  itemMeta: {
    ...typography.caption,
    marginTop: 3,
  },
  stepRow: {
    flexDirection: 'row',
    paddingVertical: spacing.s,
  },
  childStepRow: {
    paddingVertical: 7,
  },
  stepMarker: {
    width: 3,
    borderRadius: 2,
    marginRight: spacing.s,
  },
  childStepMarker: {
    opacity: 0.55,
  },
  stepContent: {
    flex: 1,
  },
  stepHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  stepTitle: {
    ...typography.body,
    fontWeight: '700',
  },
  repBadge: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  repBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  stepMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 5,
  },
  stepMetaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  stepMetaText: {
    ...typography.caption,
  },
  childrenContainer: {
    marginTop: spacing.xs,
    paddingLeft: spacing.s,
  },
  stateBlock: {
    minHeight: 120,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.s,
  },
  stateText: {
    ...typography.body,
    textAlign: 'center',
  },
  retryButton: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: spacing.m,
    paddingVertical: spacing.xs,
  },
  retryText: {
    fontWeight: '700',
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: spacing.s,
    marginTop: spacing.s,
  },
  compactActionRow: {
    flexDirection: 'column',
  },
  secondaryActions: {
    flex: 2,
    minWidth: 0,
    flexDirection: 'row',
    gap: spacing.s,
  },
  compactSecondaryActions: {
    flex: 0,
    width: '100%',
    minHeight: 48,
  },
  secondaryButton: {
    flex: 1,
    minWidth: 0,
    minHeight: 48,
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: spacing.m,
  },
  secondaryButtonText: {
    flexShrink: 1,
    fontWeight: '800',
    fontSize: 13,
    lineHeight: 16,
    textAlign: 'center',
    textTransform: 'uppercase',
  },
  primaryButton: {
    flex: 1,
    minWidth: 0,
    minHeight: 48,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: spacing.s,
    paddingVertical: spacing.xs,
  },
  compactPrimaryButton: {
    flex: 0,
    width: '100%',
    minHeight: 52,
  },
  primaryButtonText: {
    flexShrink: 1,
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 13,
    lineHeight: 16,
    textAlign: 'center',
    textTransform: 'uppercase',
  },
});
