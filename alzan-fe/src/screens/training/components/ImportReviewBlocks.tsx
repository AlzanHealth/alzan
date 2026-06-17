import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Modal, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { format } from 'date-fns';
import { AlertTriangle, Link2, Sparkles, Watch } from 'lucide-react-native';
import { GlassCard } from '../../../components/GlassCard';
import { Alert } from '../../../components/common/Alert';
import { PrimaryButton } from '../../../components/PrimaryButton';
import { borderRadius, spacing, typography } from '../../../theme';
import { useTrainingStyles } from '../../../hooks/useTrainingStyles';
import { useAuth } from '../../../context/AuthContext';
import { supabase } from '../../../lib/supabaseClient';
import { useImportReview } from '../../../hooks/useImportReview';
import { useUnitConversion } from '../../../hooks/useUnitConversion';
import { ActivitySession } from '../../../types/requests.types';
import { formatDuration, getSportDefaultTitleKey } from '../../../constants/sports';
import { getImportReviewDetailState } from '../helpers/importReviewPipeline.helper';

interface TemplateOption {
  id: string;
  name: string;
  description: string | null;
}

interface ImportReviewBlocksProps {
  session: ActivitySession;
  /** Whether the session already has logged workout sets (strength). */
  hasSets: boolean;
  /** Open the no-timer flow to complete exercises for this session. */
  onCompleteExercises: () => void;
  /** Called when an action replaced/deleted this session (merge, assignment). */
  onSessionReplaced: (newSessionId: string) => void;
}

/**
 * Post-import review blocks shown below the real watch data, per spec:
 * duplicate prompts, multiple-strength chooser, watch-metric conflicts,
 * template suggestion and template association management.
 */
export const ImportReviewBlocks: React.FC<ImportReviewBlocksProps> = ({
  session,
  hasSets,
  onCompleteExercises,
  onSessionReplaced,
}) => {
  const { t } = useTranslation();
  const { colors: themeColors } = useTrainingStyles();
  const { user } = useAuth();
  const { convertDistanceToUi } = useUnitConversion();
  const review = useImportReview(session.id);
  const [templatePickerVisible, setTemplatePickerVisible] = useState(false);
  const [plannedRoutineDismissed, setPlannedRoutineDismissed] = useState(false);
  const [reviewActionCompleted, setReviewActionCompleted] = useState(false);

  const isStrength = session.sport_type === 'strength';
  const sportLabel = t(getSportDefaultTitleKey(session.sport_type, session.sport_subtype));
  const reviewActionPending =
    review.associateTemplate.isPending ||
    review.dismissSuggestion.isPending ||
    review.mergeDuplicate.isPending ||
    review.keepBothDuplicates.isPending ||
    review.revertWatchMetrics.isPending ||
    review.keepWatchMetrics.isPending ||
    review.assignStrengthSession.isPending;
  const duplicatePending =
    !reviewActionCompleted && session.duplicate_resolution === 'pending' && session.duplicate_of_session_id != null;
  const associatedTemplateId = isStrength ? session.workout_template_id : session.endurance_template_id;

  useEffect(() => {
    setReviewActionCompleted(false);
  }, [
    associatedTemplateId,
    session.duplicate_resolution,
    session.id,
    session.needs_strength_review,
    session.pending_watch_metrics,
    session.suggested_endurance_template_id,
  ]);

  const showError = (err: unknown) => {
    console.error('Import review action error:', err);
    Alert.alert(t('common.error'), t('training.importReviewActionError'));
  };
  const closeTemplatePicker = () => {
    if (Platform.OS === 'web') {
      const activeElement = globalThis.document?.activeElement as { blur?: () => void } | null | undefined;
      activeElement?.blur?.();
    }
    setTemplatePickerVisible(false);
  };

  const handleReviewActionSuccess = (survivorId: string) => {
    setReviewActionCompleted(true);
    if (survivorId !== session.id) onSessionReplaced(survivorId);
  };

  const { data: suggestedTemplate } = useQuery({
    queryKey: ['importReviewSuggestedTemplate', session.suggested_endurance_template_id],
    queryFn: async (): Promise<TemplateOption | null> => {
      if (!session.suggested_endurance_template_id) return null;
      const { data, error } = await supabase
        .from('endurance_workout_templates')
        .select('id, base_name, description')
        .eq('id', session.suggested_endurance_template_id)
        .maybeSingle();
      if (error) throw error;
      return data ? { id: data.id, name: data.base_name, description: data.description } : null;
    },
    enabled: !!session.suggested_endurance_template_id,
  });

  const { data: associatedTemplate } = useQuery({
    queryKey: ['importReviewAssociatedTemplate', isStrength, associatedTemplateId],
    queryFn: async (): Promise<TemplateOption | null> => {
      if (!associatedTemplateId) return null;
      const { data, error } = await supabase
        .from(isStrength ? 'workout_templates' : 'endurance_workout_templates')
        .select('id, base_name, description')
        .eq('id', associatedTemplateId)
        .maybeSingle();
      if (error) throw error;
      return data ? { id: data.id, name: data.base_name, description: data.description } : null;
    },
    enabled: !!associatedTemplateId,
  });

  const { data: duplicateTarget } = useQuery({
    queryKey: ['importReviewDuplicateTarget', session.duplicate_of_session_id],
    queryFn: async (): Promise<ActivitySession | null> => {
      if (!session.duplicate_of_session_id) return null;
      const { data, error } = await supabase
        .from('activity_sessions')
        .select('*')
        .eq('id', session.duplicate_of_session_id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: duplicatePending,
  });
  const reviewTargetSessionId = duplicateTarget?.id ?? session.duplicate_of_session_id ?? undefined;

  const { data: templateOptions = [] } = useQuery({
    queryKey: ['importReviewTemplateOptions', user?.id, session.sport_type],
    queryFn: async (): Promise<TemplateOption[]> => {
      if (!user) return [];
      const query = isStrength
        ? supabase.from('workout_templates').select('id, base_name, description').eq('user_id', user.id)
        : supabase
            .from('endurance_workout_templates')
            .select('id, base_name, description')
            .eq('user_id', user.id)
            .eq('sport_type', session.sport_type);
      const { data, error } = await query.order('base_name');
      if (error) throw error;
      return (data ?? []).map(row => ({ id: row.id, name: row.base_name, description: row.description }));
    },
    enabled: !!user && templatePickerVisible,
  });

  const sessionDayRange = useMemo(() => {
    const start = new Date(session.start_time);
    const dayStart = new Date(start.getFullYear(), start.getMonth(), start.getDate());
    const dayEnd = new Date(dayStart.getTime() + 24 * 3600 * 1000);
    return { from: dayStart.toISOString(), to: dayEnd.toISOString() };
  }, [session.start_time]);

  // Previous app metric values the watch overrode (for the optional revert UI).
  const watchPrevious = useMemo<Record<string, number> | null>(() => {
    const raw = session.pending_watch_metrics;
    if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const previous = (raw as Record<string, unknown>).previous;
    if (previous == null || typeof previous !== 'object' || Array.isArray(previous)) return null;
    const entries = Object.entries(previous as Record<string, unknown>).filter(
      (entry): entry is [string, number] => typeof entry[1] === 'number',
    );
    return entries.length > 0 ? Object.fromEntries(entries) : null;
  }, [session.pending_watch_metrics]);

  const formatMetricValue = (column: string, value: number | null | undefined): string | null => {
    if (value == null) return null;
    if (column === 'duration_s') return formatDuration(value);
    if (column === 'calories_kcal') return t('training.importSessionKcal', { kcal: Math.round(value) });
    return String(Math.round(value));
  };

  const watchComparison = useMemo(() => {
    if (!watchPrevious) return [] as Array<{ before: string; after: string }>;
    const current = session as unknown as Record<string, number | null>;
    return Object.keys(watchPrevious)
      .map(column => {
        const before = formatMetricValue(column, watchPrevious[column]);
        const after = formatMetricValue(column, current[column]);
        return before && after ? { before, after } : null;
      })
      .filter((row): row is { before: string; after: string } => row != null);
  }, [watchPrevious, session]);

  // Severity-tinted header used by every review block (chip + title + optional subtitle/badge).
  const renderHeader = (icon: React.ReactNode, tint: string, title: string, subtitle?: string, badge?: string) => (
    <View style={styles.blockHeader}>
      <View style={[styles.headerChip, { backgroundColor: tint + '22' }]}>{icon}</View>
      <View style={{ flex: 1 }}>
        <Text style={[typography.body, styles.blockTitle, { color: themeColors.textPrimary }]}>{title}</Text>
        {subtitle ? (
          <Text style={[typography.caption, { color: themeColors.textSecondary, marginTop: 2 }]}>{subtitle}</Text>
        ) : null}
      </View>
      {badge ? (
        <View style={[styles.badge, { backgroundColor: tint + '22' }]}>
          <Text style={[styles.badgeText, { color: tint }]}>{badge}</Text>
        </View>
      ) : null}
    </View>
  );

  const { data: todaysStrengthSessions = [] } = useQuery({
    queryKey: ['importReviewStrengthCandidates', user?.id, session.id, sessionDayRange.from],
    queryFn: async (): Promise<ActivitySession[]> => {
      if (!user) return [];
      const { data, error } = await supabase
        .from('activity_sessions')
        .select('*')
        .eq('user_id', user.id)
        .in('sport_type', ['strength', 'gym'])
        .neq('id', session.id)
        .neq('status', 'cancelled')
        .gte('start_time', sessionDayRange.from)
        .lt('start_time', sessionDayRange.to)
        .order('start_time');
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user && session.needs_strength_review,
  });

  // Strength BPMN: when a generic watch session lands on a day that has a
  // planned (not completed) gym routine, suggest associating it.
  const sessionLocalDate = format(new Date(session.start_time), 'yyyy-MM-dd');
  const { data: plannedRoutine } = useQuery({
    queryKey: ['importReviewPlannedRoutine', user?.id, sessionLocalDate],
    queryFn: async (): Promise<TemplateOption | null> => {
      if (!user) return null;
      const { data, error } = await supabase
        .from('workout_plans')
        .select('gym_template_id, workout_templates:gym_template_id(id, base_name, description)')
        .eq('user_id', user.id)
        .eq('planned_date', sessionLocalDate)
        .eq('status', 'planned')
        .not('gym_template_id', 'is', null)
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      const template = data?.workout_templates;
      return template ? { id: template.id, name: template.base_name, description: template.description } : null;
    },
    enabled: !!user && isStrength && !associatedTemplateId,
  });

  const handleAssociateTemplate = (templateId: string) => {
    closeTemplatePicker();
    review.associateTemplate.mutate(
      isStrength ? { workoutTemplateId: templateId } : { enduranceTemplateId: templateId },
      {
        onSuccess: survivorId => {
          handleReviewActionSuccess(survivorId);
          if (survivorId === session.id && isStrength && !hasSets) {
            Alert.alert(t('training.importCompleteExercises'), t('training.importNoExercisesPrompt'), [
              { text: t('training.importNotNow'), style: 'cancel' },
              { text: t('training.importCompleteExercises'), onPress: onCompleteExercises },
            ]);
          }
        },
        onError: showError,
      },
    );
  };

  const handleRemoveAssociation = () => {
    Alert.alert(t('training.importRemoveAssociation'), t('training.importRemoveAssociationConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('training.importRemoveAssociation'),
        style: 'destructive',
        onPress: () =>
          review.associateTemplate.mutate(
            { enduranceTemplateId: null, workoutTemplateId: null },
            { onError: showError, onSuccess: handleReviewActionSuccess },
          ),
      },
    ]);
  };

  const handleMerge = () => {
    review.mergeDuplicate.mutate(
      { targetSessionId: reviewTargetSessionId },
      {
        onSuccess: handleReviewActionSuccess,
        onError: showError,
      },
    );
  };

  const handleKeepBoth = () => {
    review.keepBothDuplicates.mutate(
      { targetSessionId: reviewTargetSessionId },
      {
        onSuccess: handleReviewActionSuccess,
        onError: showError,
      },
    );
  };

  const handleDismissSuggestion = () => {
    review.dismissSuggestion.mutate(
      {},
      {
        onSuccess: handleReviewActionSuccess,
        onError: showError,
      },
    );
  };

  const handleKeepWatchMetrics = () => {
    review.keepWatchMetrics.mutate(
      {},
      {
        onSuccess: handleReviewActionSuccess,
        onError: showError,
      },
    );
  };

  const handleRevertWatchMetrics = () => {
    review.revertWatchMetrics.mutate(
      {},
      {
        onSuccess: handleReviewActionSuccess,
        onError: showError,
      },
    );
  };

  const handleKeepPlannedRoutineGeneric = () => {
    if (reviewActionPending || reviewActionCompleted) return;
    setPlannedRoutineDismissed(true);
  };

  const handleOpenTemplatePicker = () => {
    if (reviewActionPending || reviewActionCompleted) return;
    setTemplatePickerVisible(true);
  };

  const handleCompleteExercises = () => {
    if (reviewActionPending || reviewActionCompleted) return;
    onCompleteExercises();
  };

  const handleAssign = (targetSessionId?: string) => {
    review.assignStrengthSession.mutate(
      { targetSessionId },
      {
        onSuccess: handleReviewActionSuccess,
        onError: showError,
      },
    );
  };

  const handleKeepAsNewStrength = () => {
    review.assignStrengthSession.mutate(
      {},
      {
        onSuccess: handleReviewActionSuccess,
        onError: showError,
      },
    );
  };

  const sessionDisplayName = (candidate: ActivitySession): string => {
    const base = candidate.name || t(getSportDefaultTitleKey(candidate.sport_type, candidate.sport_subtype));
    return `${base} · ${format(new Date(candidate.start_time), 'HH:mm')}`;
  };

  const sessionMetricSummary = (candidate: ActivitySession): string => {
    const parts = [format(new Date(candidate.start_time), 'HH:mm')];
    if (candidate.duration_s != null && candidate.duration_s > 0) {
      parts.push(formatDuration(candidate.duration_s));
    }
    if (candidate.distance_m != null && candidate.distance_m > 0) {
      const distance = convertDistanceToUi(candidate.distance_m, 2);
      parts.push(`${distance.value} ${distance.unit}`);
    }
    if (candidate.total_sets != null && candidate.total_sets > 0) {
      parts.push(t('training.importSessionSets', { count: candidate.total_sets }));
    }
    if (candidate.calories_kcal != null && candidate.calories_kcal > 0) {
      parts.push(t('training.importSessionKcal', { kcal: Math.round(candidate.calories_kcal) }));
    }
    return parts.join(' · ');
  };

  const renderTemplatePicker = () => (
    <Modal visible={templatePickerVisible} transparent animationType="fade" onRequestClose={closeTemplatePicker}>
      <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={closeTemplatePicker}>
        <View style={[styles.modalCard, { backgroundColor: themeColors.background }]}>
          <View style={styles.modalHeader}>
            <View style={{ flex: 1 }}>
              <Text style={[typography.h3, { color: themeColors.textPrimary }]}>
                {t(isStrength ? 'training.importChooseStrengthTemplate' : 'training.importChooseEnduranceTemplate')}
              </Text>
              <Text style={[typography.caption, { color: themeColors.textSecondary, marginTop: 2 }]}>
                {t('training.importChooseTemplateHint')}
              </Text>
            </View>
            <TouchableOpacity onPress={closeTemplatePicker} hitSlop={8}>
              <Text style={[typography.body, { color: themeColors.primary, fontWeight: '700' }]}>
                {t('common.cancel')}
              </Text>
            </TouchableOpacity>
          </View>
          {templateOptions.length === 0 ? (
            <Text style={[typography.body, { color: themeColors.textSecondary }]}>
              {t('training.importNoTemplatesAvailable')}
            </Text>
          ) : (
            <FlatList
              data={templateOptions}
              keyExtractor={item => item.id}
              style={styles.modalList}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.templateRow, { borderColor: themeColors.border }]}
                  disabled={reviewActionPending || reviewActionCompleted}
                  onPress={() => handleAssociateTemplate(item.id)}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={[typography.body, { color: themeColors.textPrimary, fontWeight: '600' }]}>
                      {item.name}
                    </Text>
                    {item.description ? (
                      <Text style={[typography.caption, { color: themeColors.textSecondary }]} numberOfLines={2}>
                        {item.description}
                      </Text>
                    ) : null}
                  </View>
                  <Text style={[typography.caption, styles.templateRowAction, { color: themeColors.primary }]}>
                    {t('training.importSelectTemplate')}
                  </Text>
                </TouchableOpacity>
              )}
            />
          )}
        </View>
      </TouchableOpacity>
    </Modal>
  );

  const reviewState = getImportReviewDetailState({
    session,
    reviewActionCompleted,
    hasSuggestedTemplate: suggestedTemplate != null,
    hasPlannedRoutine: isStrength && plannedRoutine != null && !plannedRoutineDismissed,
    associatedTemplateId,
  });
  const duplicateScore = reviewState.duplicateScore;
  const showStrongDuplicate = reviewState.mainStep === 'strong_duplicate';
  const showWeakDuplicateNotice = reviewState.hasWeakDuplicateNotice;
  const showNeedsReview = reviewState.mainStep === 'strength_assignment';
  const showConflict = reviewState.mainStep === 'watch_metrics';
  const showSuggestedTemplate = reviewState.mainStep === 'suggested_template';
  const showPlannedRoutine = reviewState.mainStep === 'planned_routine';
  const showTemplateBlock = reviewState.mainStep === 'template_management';

  return (
    <View style={styles.container}>
      {/* 1. Priority duplicate prompt (score >= 80, pending) */}
      {showStrongDuplicate && (
        <GlassCard style={styles.blockCard}>
          {renderHeader(
            <AlertTriangle size={18} color={themeColors.warning} />,
            themeColors.warning,
            isStrength
              ? t('training.importPossibleDuplicate')
              : t('training.importDuplicatePriorityTitle', { sport: sportLabel }),
            undefined,
            duplicateScore > 0 ? `${Math.round(duplicateScore)}%` : undefined,
          )}
          {duplicateTarget && (
            <View style={[styles.comparisonBox, { borderColor: themeColors.border }]}>
              <View style={styles.comparisonColumn}>
                <Text style={[typography.caption, { color: themeColors.textSecondary, fontWeight: '600' }]}>
                  {t('training.importWatchActivity').toUpperCase()}
                </Text>
                <Text
                  style={[typography.body, { color: themeColors.textPrimary, fontWeight: '700' }]}
                  numberOfLines={3}
                >
                  {session.name || t(getSportDefaultTitleKey(session.sport_type, session.sport_subtype))}
                </Text>
                <Text style={[typography.caption, { color: themeColors.textSecondary }]}>
                  {sessionMetricSummary(session)}
                </Text>
              </View>
              <View style={[styles.comparisonDivider, { backgroundColor: themeColors.border }]} />
              <View style={styles.comparisonColumn}>
                <Text style={[typography.caption, { color: themeColors.textSecondary, fontWeight: '600' }]}>
                  {t('training.importExistingWorkout').toUpperCase()}
                </Text>
                <Text
                  style={[typography.body, { color: themeColors.textPrimary, fontWeight: '700' }]}
                  numberOfLines={3}
                >
                  {duplicateTarget.name ||
                    t(getSportDefaultTitleKey(duplicateTarget.sport_type, duplicateTarget.sport_subtype))}
                </Text>
                <Text style={[typography.caption, { color: themeColors.textSecondary }]}>
                  {sessionMetricSummary(duplicateTarget)}
                </Text>
              </View>
            </View>
          )}

          <View style={styles.blockText}>
            <View style={styles.bulletItem}>
              <Text style={[styles.bulletDot, { color: themeColors.primary }]}>•</Text>
              <Text style={[styles.bulletText, { color: themeColors.textPrimary }]}>
                <Text style={{ fontWeight: '700' }}>{t('training.importMergeKeepExisting')}:</Text>{' '}
                {t(
                  isStrength ? 'training.importMergeKeepExistingStrengthHint' : 'training.importMergeKeepExistingHint',
                )}
              </Text>
            </View>
            <View style={styles.bulletItem}>
              <Text style={[styles.bulletDot, { color: themeColors.textSecondary }]}>•</Text>
              <Text style={[styles.bulletText, { color: themeColors.textPrimary }]}>
                <Text style={{ fontWeight: '700' }}>
                  {t(isStrength ? 'training.importNoKeepBoth' : 'training.importKeepBoth')}:
                </Text>{' '}
                {t('training.importKeepBothHint')}
              </Text>
            </View>
          </View>

          <View style={styles.buttonRow}>
            <PrimaryButton
              title={t('training.importMergeKeepExisting')}
              onPress={handleMerge}
              loading={review.mergeDuplicate.isPending}
              disabled={reviewActionPending || reviewActionCompleted}
              style={styles.rowButton}
            />
            <PrimaryButton
              title={t(isStrength ? 'training.importNoKeepBoth' : 'training.importKeepBoth')}
              onPress={handleKeepBoth}
              loading={review.keepBothDuplicates.isPending}
              disabled={reviewActionPending || reviewActionCompleted}
              variant="outline"
              style={styles.rowButton}
            />
          </View>
        </GlassCard>
      )}

      {/* 2. Subtle same-day notice (score < 80, pending) */}
      {showWeakDuplicateNotice && (
        <GlassCard style={styles.blockCard}>
          {renderHeader(
            <AlertTriangle size={18} color={themeColors.warning} />,
            themeColors.warning,
            t('training.importPossibleDuplicate'),
            undefined,
            duplicateScore > 0 ? `${Math.round(duplicateScore)}%` : undefined,
          )}
          <Text style={[typography.body, { color: themeColors.textPrimary, marginBottom: spacing.m }]}>
            {t('training.importDuplicateSubtle', { sport: sportLabel })}
          </Text>

          <View style={styles.blockText}>
            <View style={styles.bulletItem}>
              <Text style={[styles.bulletDot, { color: themeColors.primary }]}>•</Text>
              <Text style={[styles.bulletText, { color: themeColors.textPrimary }]}>
                <Text style={{ fontWeight: '700' }}>{t('training.importMergeKeepExisting')}:</Text>{' '}
                {t('training.importMergeWeakHint')}
              </Text>
            </View>
            <View style={styles.bulletItem}>
              <Text style={[styles.bulletDot, { color: themeColors.textSecondary }]}>•</Text>
              <Text style={[styles.bulletText, { color: themeColors.textPrimary }]}>
                <Text style={{ fontWeight: '700' }}>{t('training.importKeepBoth')}:</Text>{' '}
                {t('training.importKeepBothHint')}
              </Text>
            </View>
          </View>

          <View style={styles.buttonRow}>
            <PrimaryButton
              title={t('training.importMergeKeepExisting')}
              onPress={handleMerge}
              loading={review.mergeDuplicate.isPending}
              disabled={reviewActionPending || reviewActionCompleted}
              style={styles.rowButton}
            />
            <PrimaryButton
              title={t('training.importKeepBoth')}
              onPress={handleKeepBoth}
              loading={review.keepBothDuplicates.isPending}
              disabled={reviewActionPending || reviewActionCompleted}
              variant="outline"
              style={styles.rowButton}
            />
          </View>
        </GlassCard>
      )}

      {/* 3. Multiple strength sessions chooser */}
      {showNeedsReview && (
        <GlassCard style={styles.blockCard}>
          {renderHeader(
            <Link2 size={18} color={themeColors.primary} />,
            themeColors.primary,
            t('training.importMultipleStrengthPrompt'),
          )}

          <View style={{ marginBottom: spacing.m }}>
            {todaysStrengthSessions.map(candidate => (
              <TouchableOpacity
                key={candidate.id}
                activeOpacity={0.8}
                onPress={() => handleAssign(candidate.id)}
                disabled={reviewActionPending || reviewActionCompleted}
                style={[styles.candidateRow, { borderColor: themeColors.border, backgroundColor: themeColors.surface }]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={[typography.body, { color: themeColors.textPrimary, fontWeight: '700' }]}>
                    {sessionDisplayName(candidate)}
                  </Text>
                  <Text style={[typography.caption, { color: themeColors.textSecondary, marginTop: 2 }]}>
                    {sessionMetricSummary(candidate)}
                  </Text>
                </View>
                {review.assignStrengthSession.isPending ? (
                  <ActivityIndicator color={themeColors.primary} />
                ) : (
                  <Text style={[styles.actionArrow, { color: themeColors.primary }]}>›</Text>
                )}
              </TouchableOpacity>
            ))}
          </View>

          <PrimaryButton
            title={t('training.importKeepAsNew')}
            onPress={handleKeepAsNewStrength}
            loading={review.assignStrengthSession.isPending}
            disabled={reviewActionPending || reviewActionCompleted}
            variant="outline"
            style={{ borderRadius: borderRadius.m }}
          />
        </GlassCard>
      )}

      {/* 4. Watch metrics applied (watch wins by default; optional revert) */}
      {showConflict && (
        <GlassCard style={styles.blockCard}>
          {renderHeader(
            <Watch size={18} color={themeColors.primary} />,
            themeColors.primary,
            t('training.importWatchDataPrompt'),
          )}
          {watchComparison.length > 0 && (
            <View style={[styles.metricCompareRow, { marginBottom: spacing.m }]}>
              <View style={[styles.metricCompareCell, { backgroundColor: themeColors.border }]}>
                <Text style={[typography.caption, { color: themeColors.textSecondary, fontWeight: '700' }]}>
                  {t('training.importWatchYourValue').toUpperCase()}
                </Text>
                <Text
                  style={[typography.caption, { color: themeColors.textSecondary, textDecorationLine: 'line-through' }]}
                >
                  {watchComparison.map(row => row.before).join(' · ')}
                </Text>
              </View>
              <View style={[styles.metricCompareCell, { backgroundColor: themeColors.primary + '14' }]}>
                <Text style={[typography.caption, { color: themeColors.primary, fontWeight: '700' }]}>
                  {t('training.importWatchWatchValue').toUpperCase()}
                </Text>
                <Text style={[typography.caption, { color: themeColors.textPrimary, fontWeight: '700' }]}>
                  {watchComparison.map(row => row.after).join(' · ')}
                </Text>
              </View>
            </View>
          )}

          <View style={styles.blockText}>
            <View style={styles.bulletItem}>
              <Text style={[styles.bulletDot, { color: themeColors.primary }]}>•</Text>
              <Text style={[styles.bulletText, { color: themeColors.textPrimary }]}>
                <Text style={{ fontWeight: '700' }}>{t('training.importKeepWatchData')}:</Text>{' '}
                {t('training.importKeepWatchDataHint')}
              </Text>
            </View>
            <View style={styles.bulletItem}>
              <Text style={[styles.bulletDot, { color: themeColors.textSecondary }]}>•</Text>
              <Text style={[styles.bulletText, { color: themeColors.textPrimary }]}>
                <Text style={{ fontWeight: '700' }}>{t('training.importKeepMine')}:</Text>{' '}
                {t('training.importKeepMineHint')}
              </Text>
            </View>
          </View>

          <View style={styles.buttonRow}>
            <PrimaryButton
              title={t('training.importKeepWatchData')}
              onPress={handleKeepWatchMetrics}
              loading={review.keepWatchMetrics.isPending}
              disabled={reviewActionPending || reviewActionCompleted}
              style={styles.rowButton}
            />
            <PrimaryButton
              title={t('training.importKeepMine')}
              onPress={handleRevertWatchMetrics}
              loading={review.revertWatchMetrics.isPending}
              disabled={reviewActionPending || reviewActionCompleted}
              variant="outline"
              style={styles.rowButton}
            />
          </View>
        </GlassCard>
      )}

      {/* 4b. Planned gym routine suggestion (strength BPMN) */}
      {showPlannedRoutine && plannedRoutine && (
        <GlassCard style={styles.blockCard}>
          {renderHeader(
            <Sparkles size={18} color={themeColors.success} />,
            themeColors.success,
            t('training.importSuggestedTemplate', { templateName: plannedRoutine.name }),
          )}

          <View style={styles.blockText}>
            <View style={styles.bulletItem}>
              <Text style={[styles.bulletDot, { color: themeColors.primary }]}>•</Text>
              <Text style={[styles.bulletText, { color: themeColors.textPrimary }]}>
                <Text style={{ fontWeight: '700' }}>{t('training.importAssociateToTemplate')}:</Text>{' '}
                {t('training.importAssociatePlannedHint', { templateName: plannedRoutine.name })}
              </Text>
            </View>
            <View style={styles.bulletItem}>
              <Text style={[styles.bulletDot, { color: themeColors.textSecondary }]}>•</Text>
              <Text style={[styles.bulletText, { color: themeColors.textPrimary }]}>
                <Text style={{ fontWeight: '700' }}>{t('training.importKeepGeneric')}:</Text>{' '}
                {t('training.importKeepGenericHint')}
              </Text>
            </View>
          </View>

          <View style={styles.buttonRow}>
            <PrimaryButton
              title={t('training.importAssociateToTemplate')}
              onPress={() => handleAssociateTemplate(plannedRoutine.id)}
              loading={review.associateTemplate.isPending}
              disabled={reviewActionPending || reviewActionCompleted}
              style={styles.rowButton}
            />
            <PrimaryButton
              title={t('training.importKeepGeneric')}
              onPress={handleKeepPlannedRoutineGeneric}
              disabled={reviewActionPending || reviewActionCompleted}
              variant="outline"
              style={styles.rowButton}
            />
          </View>
        </GlassCard>
      )}

      {/* 5. Template suggestion (60-79%) */}
      {showSuggestedTemplate && suggestedTemplate && (
        <GlassCard style={styles.blockCard}>
          {renderHeader(
            <Sparkles size={18} color={themeColors.success} />,
            themeColors.success,
            t('training.importSuggestedTemplate', { templateName: suggestedTemplate.name }),
            undefined,
            session.template_match_score != null ? `${Math.round(session.template_match_score)}%` : undefined,
          )}

          <View style={styles.blockText}>
            <View style={styles.bulletItem}>
              <Text style={[styles.bulletDot, { color: themeColors.primary }]}>•</Text>
              <Text style={[styles.bulletText, { color: themeColors.textPrimary }]}>
                <Text style={{ fontWeight: '700' }}>{t('training.importAssociateToTemplate')}:</Text>{' '}
                {t('training.importAssociateSuggestedHint', { templateName: suggestedTemplate.name })}
              </Text>
            </View>
            <View style={styles.bulletItem}>
              <Text style={[styles.bulletDot, { color: themeColors.textSecondary }]}>•</Text>
              <Text style={[styles.bulletText, { color: themeColors.textPrimary }]}>
                <Text style={{ fontWeight: '700' }}>{t('training.importKeepGeneric')}:</Text>{' '}
                {t('training.importDismissSuggestionHint')}
              </Text>
            </View>
          </View>

          <View style={styles.buttonRow}>
            <PrimaryButton
              title={t('training.importAssociateToTemplate')}
              onPress={() => handleAssociateTemplate(suggestedTemplate.id)}
              loading={review.associateTemplate.isPending}
              disabled={reviewActionPending || reviewActionCompleted}
              style={styles.rowButton}
            />
            <PrimaryButton
              title={t('training.importKeepGeneric')}
              onPress={handleDismissSuggestion}
              loading={review.dismissSuggestion.isPending}
              disabled={reviewActionPending || reviewActionCompleted}
              variant="outline"
              style={styles.rowButton}
            />
          </View>
        </GlassCard>
      )}

      {/* 6. Template association management (only once decisions are resolved) */}
      {showTemplateBlock &&
        (associatedTemplateId && associatedTemplate ? (
          <GlassCard style={styles.blockCard}>
            <Text style={[typography.caption, { color: themeColors.textSecondary }]}>
              {t('training.importAssociatedTemplate')}
            </Text>
            <Text style={[typography.h3, { color: themeColors.textPrimary, marginTop: 2, fontWeight: '700' }]}>
              {associatedTemplate.name}
            </Text>
            {associatedTemplate.description ? (
              <View style={{ marginTop: spacing.s }}>
                <Text style={[typography.caption, { color: themeColors.textSecondary }]}>
                  {t('training.importTemplateGoal')}
                </Text>
                <Text style={[typography.body, { color: themeColors.textPrimary }]}>
                  {associatedTemplate.description}
                </Text>
              </View>
            ) : null}
            {session.template_match_score != null && (
              <Text style={[typography.caption, { color: themeColors.textSecondary, marginTop: spacing.s }]}>
                {t('training.importMatchScoreLabel', { score: Math.round(session.template_match_score) })}
              </Text>
            )}
            <View style={[styles.buttonRow, { marginTop: spacing.m }]}>
              <PrimaryButton
                title={t('training.importChangeTemplate')}
                onPress={handleOpenTemplatePicker}
                disabled={reviewActionPending || reviewActionCompleted}
                variant="outline"
                style={styles.rowButton}
              />
              <PrimaryButton
                title={t('training.importRemoveAssociation')}
                onPress={handleRemoveAssociation}
                loading={review.associateTemplate.isPending}
                disabled={reviewActionPending || reviewActionCompleted}
                variant="outline"
                style={styles.rowButton}
                textStyle={{ color: themeColors.danger }}
              />
            </View>
            {isStrength && !hasSets && (
              <View style={{ marginTop: spacing.s }}>
                <PrimaryButton
                  title={t('training.importCompleteExercises')}
                  onPress={handleCompleteExercises}
                  disabled={reviewActionPending || reviewActionCompleted}
                  style={{ borderRadius: borderRadius.m }}
                />
              </View>
            )}
          </GlassCard>
        ) : (
          <GlassCard style={styles.blockCard}>
            {isStrength ? (
              <>
                <Text
                  style={[
                    typography.body,
                    { color: themeColors.textPrimary, marginBottom: spacing.m, fontWeight: '500' },
                  ]}
                >
                  {t('training.importAssociateStrengthTemplate')}
                </Text>
                <View style={styles.actionStack}>
                  <PrimaryButton
                    title={t('training.importAssociateTemplate')}
                    onPress={handleOpenTemplatePicker}
                    disabled={reviewActionPending || reviewActionCompleted}
                    style={{ borderRadius: borderRadius.m }}
                  />
                  {!hasSets && (
                    <PrimaryButton
                      title={t('training.importCompleteExercises')}
                      onPress={handleCompleteExercises}
                      disabled={reviewActionPending || reviewActionCompleted}
                      variant="outline"
                      style={{ borderRadius: borderRadius.m }}
                    />
                  )}
                </View>
              </>
            ) : (
              <PrimaryButton
                title={t('training.importAssociateTemplate')}
                onPress={handleOpenTemplatePicker}
                disabled={reviewActionPending || reviewActionCompleted}
                variant="outline"
                style={{ borderRadius: borderRadius.m }}
              />
            )}
          </GlassCard>
        ))}

      {renderTemplatePicker()}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginTop: spacing.l,
  },
  blockCard: {
    marginBottom: spacing.m,
    padding: spacing.m,
  },
  blockHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s,
    marginBottom: spacing.m,
  },
  headerChip: {
    width: 34,
    height: 34,
    borderRadius: borderRadius.s,
    alignItems: 'center',
    justifyContent: 'center',
  },
  blockTitle: {
    fontWeight: '600',
  },
  badge: {
    paddingHorizontal: spacing.s,
    paddingVertical: 2,
    borderRadius: borderRadius.full,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  metricCompareRow: {
    flexDirection: 'row',
    gap: spacing.s,
  },
  metricCompareCell: {
    flex: 1,
    gap: 2,
    borderRadius: borderRadius.m,
    paddingVertical: spacing.s,
    paddingHorizontal: spacing.s,
  },
  actionStack: {
    gap: spacing.s,
  },
  actionTile: {
    minHeight: 62,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: borderRadius.m,
    paddingVertical: spacing.s,
    paddingHorizontal: spacing.m,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s,
  },
  actionText: {
    flex: 1,
    gap: 2,
  },
  actionTitle: {
    fontWeight: '700',
  },
  actionArrow: {
    fontSize: 28,
    lineHeight: 28,
    fontWeight: '300',
  },
  comparisonBox: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: borderRadius.m,
    flexDirection: 'row',
    gap: spacing.s,
    marginBottom: spacing.s,
    padding: spacing.s,
  },
  comparisonColumn: {
    flex: 1,
    gap: 2,
  },
  comparisonDivider: {
    width: StyleSheet.hairlineWidth,
  },
  linkText: {
    fontWeight: '600',
    marginTop: spacing.xs,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    padding: spacing.l,
  },
  modalCard: {
    borderRadius: borderRadius.l,
    padding: spacing.l,
    maxHeight: '70%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.m,
    marginBottom: spacing.m,
  },
  modalList: {
    flexGrow: 0,
  },
  templateRow: {
    paddingVertical: spacing.m,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.m,
  },
  templateRowAction: {
    fontWeight: '700',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: spacing.s,
    marginTop: spacing.s,
  },
  rowButton: {
    flex: 1,
  },
  blockText: {
    marginBottom: spacing.m,
  },
  bulletItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.xs,
    marginBottom: 6,
  },
  bulletDot: {
    fontSize: 14,
    lineHeight: 18,
  },
  bulletText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
  },
  candidateRow: {
    paddingVertical: spacing.s,
    paddingHorizontal: spacing.m,
    borderWidth: 1,
    borderRadius: borderRadius.m,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.m,
    marginBottom: spacing.s,
  },
});

export default ImportReviewBlocks;
