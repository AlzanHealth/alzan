import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Animated,
  Modal,
  TouchableWithoutFeedback,
} from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { useNavigation, useFocusEffect, useIsFocused } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { GlassCard } from '../../components/GlassCard';
import { LinearGradient } from 'expo-linear-gradient';
import { spacing } from '../../theme';
import { useTheme } from '../../context/ThemeContext';
import {
  ChevronLeft,
  ChevronRight,
  Dumbbell,
  Calendar,
  Play,
  List,
  Plus,
  Settings,
  Trash2,
  Upload,
} from 'lucide-react-native';
import { SportIcon } from '../../components/icons/SportIcon';
import { SPORT_COLORS } from '../../theme/sportColors';
import { SPORTS_CONFIG, getSportDefaultTitleKey } from '../../constants/sports';
import { ActiveSessionBanner } from './components/ActiveSessionBanner';
import { ImportReviewSurface } from './components/ImportReviewSurface';
import { ScheduledWorkoutPreviewModal, ScheduledWorkoutPreviewPlan } from './components/ScheduledWorkoutPreviewModal';

import { format, addDays, addWeeks, startOfWeek, subDays, startOfDay, subWeeks } from 'date-fns';
import { useMutation, useQuery, keepPreviousData, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../context/AuthContext';
import { usePreferencesContext } from '../../context/PreferencesContext';
import { propagateTrainingPlans } from '../../modules/training/services/trainingCopyService';
import { useUnitConversion } from '../../hooks/useUnitConversion';
import { DaySwitcher } from '../../components/common/DaySwitcher';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { TrainingScreenNavigationProp, TabParamList } from '../../types/navigation.types';
import { SportType } from '../../types/requests.types';
import { DaySwitcherRef } from '../../components/common/DaySwitcher';
import { useTranslation } from 'react-i18next';
import { formatLocalizedDate, getDateFnsLocale } from '../../i18n/dateLocale';
import { Alert } from '../../components/common/Alert';
import { moveWorkoutPlan } from '../../modules/training/services/trainingRescheduleService';
import { ActivityImportReview } from '../../openapi/generated/alzan-be/sdk.gen';
import { matchPlansToCompletedSessions } from './helpers/dailyPlanSessionMerge.helper';
import { getDailyPlanAction } from './helpers/dailyPlanAction.helper';
import { invalidateTrainingCalendar } from '../../lib/trainingQueryKeys';
import { buildTemplateAssociationPayload } from '../../modules/training/helpers/templateAssociation.helper';
import { healthQueryKeys } from '../../modules/health/hooks/healthQueryKeys';
import { pollingIntervalAfterError } from '../../lib/querySafety';

interface DailyEntry {
  id: string;
  status?: 'planned' | 'completed' | 'skipped' | 'rescheduled';
  isExtraSession?: boolean;
  activity_session_id?: string | null;
  gym_template_id?: string | null;
  endurance_template_id?: string | null;
  planned_date?: string;
  isGym?: boolean;
  isScheduledTemplate?: boolean;
  workout_templates?: {
    id: string;
    base_name: string | null;
    description: string;
    sport_type: string;
    suggested_day_of_week?: number | null;
  } | null;
  endurance_workout_templates?: {
    id: string;
    base_name: string | null;
    description: string;
    sport_type: string;
    scheduled_day?: number | null;
    workout_goal?: string;
  } | null;
  sport_type?: string;
  completedSession?: CompletedSession | null;
}

interface CompletedSession {
  id: string;
  sport_type: string;
  sport_subtype?: string | null;
  workout_template_id: string | null;
  endurance_template_id: string | null;
  start_time: string;
  name: string | null;
  source: string | null;
  distance_m: number | null;
  duration_s: number | null;
}

type TrainingCalendarMarkRow = {
  date: string;
  planned_count: number;
  completed_count: number;
  has_planned: boolean;
  has_completed: boolean;
};

type TrainingCalendarMarksRpc = {
  rpc: (
    fn: 'get_training_calendar_marks',
    args: {
      p_user_id: string;
      p_start_date: string;
      p_end_date: string;
      p_timezone: string;
    },
  ) => Promise<{ data: TrainingCalendarMarkRow[] | null; error: { message: string } | null }>;
};

const getDeviceTimezone = (): string => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
};

export const TrainingHomeScreen = () => {
  const isFocused = useIsFocused();
  const { t } = useTranslation();
  const { colors } = useTheme();
  const navigation = useNavigation<TrainingScreenNavigationProp>();
  const { user } = useAuth();
  const { preferences } = usePreferencesContext();
  const queryClient = useQueryClient();
  const { convertDistanceToUi } = useUnitConversion();
  const timezone = preferences?.timezone || getDeviceTimezone();
  const [selectedDate, setSelectedDate] = useState(new Date());

  // Calculate range for dots (e.g. +/- 52 days to cover the fifth future week)
  // We can optimize this to only fetch current view, but a fixed range is simpler for now
  const DOTS_RANGE_DAYS = 52;
  const dotsStartDate = React.useMemo(() => subDays(startOfDay(new Date()), DOTS_RANGE_DAYS), []);
  const dotsEndDate = React.useMemo(() => addDays(startOfDay(new Date()), DOTS_RANGE_DAYS), []);
  const [showAddModal, setShowAddModal] = useState(false);
  const [previewPlan, setPreviewPlan] = useState<(ScheduledWorkoutPreviewPlan & { isActive?: boolean }) | null>(null);
  const [movePlan, setMovePlan] = useState<ScheduledWorkoutPreviewPlan | null>(null);
  const [moveWeekStart, setMoveWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [moveSelectedDate, setMoveSelectedDate] = useState<Date | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const swipeableRefs = useRef<Map<string, Swipeable>>(new Map());
  const daySwitcherRef = useRef<DaySwitcherRef>(null);

  const movePlanMutation = useMutation({
    mutationFn: ({ plan, toDate }: { plan: ScheduledWorkoutPreviewPlan; toDate: string }) =>
      moveWorkoutPlan({
        planId: plan.id,
        fromDate: plan.plannedDate,
        toDate,
        isCompleted: plan.isCompleted,
      }),
    onSuccess: (_data, variables) => {
      const targetDate = new Date(`${variables.toDate}T00:00:00`);
      setMovePlan(null);
      setMoveSelectedDate(null);
      setSelectedDate(targetDate);
      queryClient.setQueriesData<DailyEntry[]>({ queryKey: ['dailyPlans'] }, currentPlans =>
        currentPlans ? currentPlans.filter(plan => plan.id !== variables.plan.id) : currentPlans,
      );
      queryClient.invalidateQueries({ queryKey: ['dailyPlans'] });
      queryClient.invalidateQueries({ queryKey: ['weekDots'] });
      queryClient.invalidateQueries({ queryKey: ['weeklyPlans'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['scheduledWorkoutPreview'] });
    },
    onError: error => {
      console.error('Error moving planned workout:', error);
      Alert.alert(t('common.error'), t('training.moveWorkoutError'));
    },
  });

  const associateCompletedSessionMutation = useMutation({
    mutationFn: async ({
      sessionId,
      enduranceTemplateId,
      workoutPlanId,
    }: {
      sessionId: string;
      enduranceTemplateId: string;
      workoutPlanId: string;
    }): Promise<string> => {
      const associationPayload = buildTemplateAssociationPayload({
        sport: 'running',
        templateId: enduranceTemplateId,
        workoutPlanId,
      });
      if (!associationPayload) {
        console.warn('Skipping calendar association with a non-UUID endurance template id');
        throw new Error('IMPORT_REVIEW_TEMPLATE_ID_INVALID');
      }
      const { data } = await ActivityImportReview.associateTemplate({
        path: { id: sessionId },
        body: {
          ...associationPayload,
        },
      });
      if (!data?.session_id) throw new Error('IMPORT_REVIEW_ACTION_FAILED');
      return data.session_id;
    },
    onSuccess: nextSessionId => {
      setPreviewPlan(null);
      invalidateTrainingCalendar(queryClient);
      queryClient.invalidateQueries({ queryKey: ['importReviewAssociatedTemplate'] });
      queryClient.invalidateQueries({ queryKey: ['sessionDetail'] });
      queryClient.invalidateQueries({ queryKey: ['activitySession', nextSessionId] });
    },
    onError: error => {
      console.error('Error associating completed workout:', error);
      Alert.alert(t('common.error'), t('training.associateCompletedWorkoutError'));
    },
  });

  // Focus effect to reset date to current week when screen is focused
  useFocusEffect(
    React.useCallback(() => {
      // Optional: reset to today or just ensure it's in view
      // daySwitcherRef.current?.scrollToCurrentWeek();
    }, []),
  );

  // Direct delete (for swipe action)
  const deletePlan = async (planId: string) => {
    setIsDeleting(true);
    try {
      // Check if this is a completed session (ID starts with "session-")
      if (planId.startsWith('session-')) {
        // Extract the actual session ID
        const sessionId = planId.replace('session-', '');
        const { error } = await supabase.from('activity_sessions').delete().eq('id', sessionId);
        if (error) throw error;
        // Invalidate both queries to refresh the calendar
        queryClient.invalidateQueries({ queryKey: healthQueryKeys.all(user?.id) });
        queryClient.invalidateQueries({ queryKey: ['completedSessions'] });
      } else {
        // It's a workout plan
        const { error } = await supabase.from('workout_plans').delete().eq('id', planId);
        if (error) throw error;
      }

      queryClient.invalidateQueries({ queryKey: ['dailyPlans'] });
      queryClient.invalidateQueries({ queryKey: ['weekDots'] });
    } catch (err) {
      console.error('Error deleting plan:', err);
      Alert.alert(t('common.error'), t('training.deleteWorkoutError'));
    } finally {
      setIsDeleting(false);
    }
  };

  // Mark a single recurring occurrence as skipped so propagation doesn't recreate it.
  const skipSinglePlannedOccurrence = async (planId: string) => {
    setIsDeleting(true);
    try {
      const { error } = await supabase.from('workout_plans').update({ status: 'skipped' }).eq('id', planId);
      if (error) throw error;

      queryClient.invalidateQueries({ queryKey: ['dailyPlans'] });
      queryClient.invalidateQueries({ queryKey: ['weekDots'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    } catch (err) {
      console.error('Error skipping single planned occurrence:', err);
      Alert.alert(t('common.error'), t('training.deleteWorkoutError'));
    } finally {
      setIsDeleting(false);
    }
  };

  // Delete with future occurrences
  const deleteWithFuture = async (planId: string, templateId: string, isGym: boolean, dayOfWeek: number) => {
    if (!user) return;
    setIsDeleting(true);
    try {
      const today = format(new Date(), 'yyyy-MM-dd');

      // Fetch all future plans for this template
      const templateColumn = isGym ? 'gym_template_id' : 'endurance_template_id';
      const { data: futurePlans, error: fetchError } = await supabase
        .from('workout_plans')
        .select('id, planned_date, completed_at, status')
        .eq(templateColumn, templateId)
        .eq('user_id', user?.id)
        .gte('planned_date', today)
        .is('completed_at', null);

      if (fetchError) throw fetchError;

      // Filter to only those matching the same day of week
      const plansToDelete =
        futurePlans?.filter(plan => {
          if (plan.status === 'skipped') return false;
          const planDate = new Date(plan.planned_date + 'T00:00:00');
          return planDate.getDay() === dayOfWeek;
        }) || [];

      if (plansToDelete.length > 0) {
        const idsToDelete = plansToDelete.map(p => p.id);
        const { error: deleteError } = await supabase.from('workout_plans').delete().in('id', idsToDelete);
        if (deleteError) throw deleteError;
      }

      queryClient.invalidateQueries({ queryKey: ['dailyPlans'] });
      queryClient.invalidateQueries({ queryKey: ['weekDots'] });
    } catch (err) {
      console.error('Error deleting future plans:', err);
      Alert.alert(t('common.error'), t('training.deleteFutureWorkoutsError'));
    } finally {
      setIsDeleting(false);
    }
  };

  // Show delete confirmation modal
  const showDeleteOptions = async (planId: string, plan: DailyEntry, isRecurring: boolean) => {
    if (!user) return;
    setIsDeleting(true);

    const isGym = !!plan.gym_template_id;
    const templateId = (isGym ? plan.gym_template_id : plan.endurance_template_id) || '';
    const planDateStr = plan.planned_date || format(new Date(), 'yyyy-MM-dd');
    const planDayOfWeek = new Date(planDateStr + 'T00:00:00').getDay();

    // Check for future occurrences
    const templateColumn = isGym ? 'gym_template_id' : 'endurance_template_id';
    const { data: futurePlans } = await supabase
      .from('workout_plans')
      .select('id, planned_date, completed_at, status')
      .eq(templateColumn, templateId)
      .eq('user_id', user?.id)
      .gt('planned_date', planDateStr) // After THIS plan's date
      .is('completed_at', null);

    setIsDeleting(false);

    // Filter to same day of week
    const futureOnSameDay =
      futurePlans?.filter(fp => {
        if (fp.status === 'skipped') return false;
        const fpDate = new Date((fp.planned_date || '') + 'T00:00:00');
        return fpDate.getDay() === planDayOfWeek;
      }) || [];

    const dayName = format(new Date(planDateStr + 'T00:00:00'), 'EEEE', { locale: getDateFnsLocale() });

    if (futureOnSameDay.length > 0) {
      // Has future occurrences on same day - show options
      Alert.alert(
        t('training.deleteWorkoutTitle'),
        t('training.futureWorkoutsScheduledMessage', { count: futureOnSameDay.length, day: dayName }),
        [
          { text: t('common.cancel'), style: 'cancel' },
          {
            text: t('training.deleteWorkoutOnlyThis'),
            style: 'destructive',
            onPress: () => skipSinglePlannedOccurrence(planId),
          },
          {
            text: t('training.deleteWorkoutAllFuture'),
            style: 'destructive',
            onPress: () => deleteWithFuture(planId, templateId, isGym, planDayOfWeek),
          },
        ],
      );
    } else if (isRecurring) {
      // Recurring but no future plans yet
      Alert.alert(t('training.recurringTemplateTitle'), t('training.recurringTemplateWarning'), [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('common.delete'), style: 'destructive', onPress: () => skipSinglePlannedOccurrence(planId) },
      ]);
    } else {
      // Simple one-off plan
      deletePlan(planId);
    }
  };

  // Render swipe delete action (Circular Button Design with Animation)
  const renderRightActions = (
    progress: Animated.AnimatedInterpolation<number>,
    dragX: Animated.AnimatedInterpolation<number>,
    planId: string,
    plan: DailyEntry,
    isRecurring: boolean,
  ) => {
    // Animate the button to slide in from the right
    const translateX = dragX.interpolate({
      inputRange: [-80, 0],
      outputRange: [0, 80],
      extrapolate: 'clamp',
    });

    // Fade opacity to prevent seeing it through transparent card when closed
    const opacity = dragX.interpolate({
      inputRange: [-60, -10, 0],
      outputRange: [1, 0, 0],
      extrapolate: 'clamp',
    });

    return (
      <Animated.View style={[styles.swipeActionContainer, { opacity, transform: [{ translateX }] }]}>
        <TouchableOpacity
          style={styles.swipeDeleteBtn}
          onPress={() => {
            swipeableRefs.current.get(planId)?.close();
            // If it's a completed session (from Registrar Actividad), delete directly
            // Otherwise show options for recurring plans
            if (plan.isExtraSession) {
              deletePlan(planId);
            } else {
              showDeleteOptions(planId, plan, isRecurring);
            }
          }}
        >
          <Trash2 size={24} color="#FFF" />
        </TouchableOpacity>
      </Animated.View>
    );
  };

  // Check for Active Session
  const { data: activeSession, refetch: refetchActiveSession } = useQuery({
    queryKey: ['activeSessionBanner', user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data, error } = await supabase
        .from('activity_sessions')
        .select('*')
        .eq('user_id', user.id)
        .is('end_time', null)
        .order('start_time', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!user,
    refetchInterval: query => pollingIntervalAfterError(query.state.error, isFocused ? 3000 : false),
  });
  const activeGymSessionId =
    activeSession &&
    (activeSession.sport_type === 'strength' ||
      activeSession.sport_type === 'gym' ||
      activeSession.source === 'gym_session')
      ? activeSession.id
      : null;

  // Fetch dates with plans or sessions for the DaySwitcher dots
  const { data: markedDates } = useQuery({
    queryKey: ['weekDots', user?.id, timezone], // Broad key, refetch on mount/focus
    queryFn: async () => {
      if (!user) return new Set<string>();

      const startStr = format(dotsStartDate, 'yyyy-MM-dd');
      const endStr = format(dotsEndDate, 'yyyy-MM-dd');

      const { data, error } = await (supabase as unknown as TrainingCalendarMarksRpc).rpc(
        'get_training_calendar_marks',
        {
          p_user_id: user.id,
          p_start_date: startStr,
          p_end_date: endStr,
          p_timezone: timezone,
        },
      );

      if (error) {
        console.error('[TrainingHomeScreen] get_training_calendar_marks error:', error);
        const [{ data: plans }, { data: sessions }] = await Promise.all([
          supabase
            .from('workout_plans')
            .select('planned_date, status')
            .eq('user_id', user.id)
            .gte('planned_date', startStr)
            .lte('planned_date', endStr)
            .neq('status', 'skipped'),
          supabase
            .from('activity_sessions')
            .select('start_time')
            .eq('user_id', user.id)
            .gte('start_time', `${startStr}T00:00:00`)
            .lte('start_time', `${endStr}T23:59:59`)
            .not('end_time', 'is', null),
        ]);

        const dots = new Set<string>();
        plans?.forEach(plan => {
          const date = typeof plan.planned_date === 'string' ? plan.planned_date.split('T')[0] : '';
          if (date) dots.add(date);
        });
        sessions?.forEach(session => {
          const date = typeof session.start_time === 'string' ? session.start_time.split('T')[0] : '';
          if (date) dots.add(date);
        });
        return dots;
      }

      return new Set(
        (data ?? []).filter(mark => mark.has_planned || mark.has_completed).map(mark => mark.date.split('T')[0]),
      );
    },
    enabled: !!user,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  // Refetch data when screen gains focus
  useFocusEffect(
    React.useCallback(() => {
      refetchActiveSession();
      // Refresh every calendar-dependent query, including the preview steps.
      // Invalidation is intentionally non-blocking so the existing screen
      // remains visible while React Query fetches the latest data.
      invalidateTrainingCalendar(queryClient);
    }, [refetchActiveSession, queryClient]),
  );

  // Listen for tabPress event to reset to today
  React.useEffect(() => {
    const unsubscribe = (navigation as unknown as BottomTabNavigationProp<TabParamList>).addListener('tabPress', () => {
      // Reset to today when user taps Training tab in footer
      setSelectedDate(new Date());
    });
    return unsubscribe;
  }, [navigation]);

  // Fetch Plans for Selected Date (multiple allowed)
  const { data: manualPlans, isLoading: loadingManual } = useQuery({
    queryKey: ['dailyPlans', selectedDate, user?.id],
    queryFn: async () => {
      if (!user) return [];
      const formattedDate = format(selectedDate, 'yyyy-MM-dd');

      const { data, error } = await supabase
        .from('workout_plans')
        .select(
          `
                    *,
                    workout_templates (base_name, description),
                    endurance_workout_templates (base_name, description, workout_goal, sport_type)
                `,
        )
        .eq('user_id', user.id)
        .eq('planned_date', formattedDate)
        .neq('status', 'skipped');

      if (error) throw error;
      return (data as DailyEntry[]) || [];
    },
    enabled: !!user,
    placeholderData: keepPreviousData,
  });

  // Fetch completed sessions for the selected date
  const { data: completedSessions } = useQuery({
    queryKey: ['completedSessions', format(selectedDate, 'yyyy-MM-dd'), user?.id, timezone],
    queryFn: async () => {
      if (!user) return [];
      const dateStr = format(selectedDate, 'yyyy-MM-dd');
      const { data, error } = await supabase
        .rpc('get_activity_sessions_for_local_date', {
          p_user_id: user.id,
          p_local_date: dateStr,
          p_timezone: timezone,
        })
        .select(
          'id, sport_type, sport_subtype, workout_template_id, endurance_template_id, start_time, name, source, distance_m, duration_s',
        )
        .eq('needs_strength_review', false)
        .or(
          'duplicate_resolution.is.null,duplicate_resolution.neq.pending,duplicate_score.lt.80,duplicate_score.is.null',
        )
        .not('end_time', 'is', null); // Only completed sessions

      if (error) throw error;
      return (data as unknown as CompletedSession[]) || [];
    },
    enabled: !!user,
    placeholderData: keepPreviousData,
  });

  // Merge Manual Plans with Unmatched Completed Sessions
  const dailyPlans = React.useMemo(() => {
    const sourcePlans = manualPlans ? [...manualPlans] : [];
    const sessions = completedSessions || [];
    const { plans, matchedSessionIds } = matchPlansToCompletedSessions(sourcePlans, sessions);
    const linkedSessionIds = new Set(
      plans.map(plan => plan.activity_session_id).filter((value): value is string => Boolean(value)),
    );

    // 2. Create "Plan-like" objects for unmatched sessions
    const extraSessions = sessions.filter(s => !matchedSessionIds.has(s.id) && !linkedSessionIds.has(s.id));

    const sessionsAsPlans: DailyEntry[] = extraSessions.map(s => {
      const isGym = s.sport_type === 'strength' || s.source === 'gym_session';
      return {
        id: `session-${s.id}`, // Unique ID
        isExtraSession: true, // Marker for deletion logic (cannot delete from calendar)

        // Fields for render logic
        gym_template_id: isGym ? s.workout_template_id : null,
        endurance_template_id: !isGym ? s.endurance_template_id : null,
        isGym,

        // Mapped Template Data
        workout_templates: isGym
          ? {
              id: s.workout_template_id ?? '',
              base_name: s.name,
              description: t('training.sessionCompleted'),
              sport_type: 'gym',
            }
          : null,

        endurance_workout_templates: !isGym
          ? {
              id: s.endurance_template_id ?? '',
              base_name: s.name,
              description: `${
                s.distance_m
                  ? (() => {
                      const { value, unit } = convertDistanceToUi(s.distance_m);
                      return `${value}${unit} • `;
                    })()
                  : ''
              }${s.duration_s ? (s.duration_s / 60).toFixed(0) + 'min' : ''}`,
              sport_type: s.sport_type,
            }
          : null,

        // Helper for icon extraction
        sport_type: s.sport_type,
        completedSession: s,
      };
    });

    return [...plans, ...sessionsAsPlans];
  }, [manualPlans, completedSessions, convertDistanceToUi, t]);

  const planLinkedCompletedSessionIds = React.useMemo(() => {
    const ids = new Set<string>();
    dailyPlans.forEach(plan => {
      if (plan.isExtraSession) return;
      if (plan.activity_session_id) ids.add(plan.activity_session_id);
      if (plan.completedSession?.id) ids.add(plan.completedSession.id);
    });
    return ids;
  }, [dailyPlans]);

  const previewAssociateCandidates = React.useMemo(() => {
    if (!previewPlan || previewPlan.type !== 'endurance' || previewPlan.isCompleted || !previewPlan.sportType)
      return [];
    return (completedSessions || []).filter(
      session => session.sport_type === previewPlan.sportType && !planLinkedCompletedSessionIds.has(session.id),
    );
  }, [completedSessions, planLinkedCompletedSessionIds, previewPlan]);

  const formatCompletedSessionCandidateLabel = React.useCallback(
    (session: CompletedSession): string => {
      const metric = session.distance_m
        ? (() => {
            const { value, unit } = convertDistanceToUi(session.distance_m);
            return `${value}${unit}`;
          })()
        : session.duration_s
          ? `${Math.round(session.duration_s / 60)}min`
          : null;
      return metric ? `${session.name || t('training.sport')} · ${metric}` : session.name || t('training.sport');
    },
    [convertDistanceToUi, t],
  );

  const handleAssociateCompletedFromPreview = React.useCallback(() => {
    if (!previewPlan || previewPlan.type !== 'endurance' || previewAssociateCandidates.length === 0) return;
    const associate = (session: CompletedSession) =>
      associateCompletedSessionMutation.mutate({
        sessionId: session.id,
        enduranceTemplateId: previewPlan.templateId,
        workoutPlanId: previewPlan.id,
      });

    if (previewAssociateCandidates.length === 1) {
      associate(previewAssociateCandidates[0]);
      return;
    }

    Alert.alert(t('training.associateCompletedWorkout'), t('training.associateCompletedWorkoutHint'), [
      ...previewAssociateCandidates.slice(0, 5).map(session => ({
        text: formatCompletedSessionCandidateLabel(session),
        onPress: () => associate(session),
      })),
      { text: t('common.cancel'), style: 'cancel' as const },
    ]);
  }, [
    associateCompletedSessionMutation,
    formatCompletedSessionCandidateLabel,
    previewAssociateCandidates,
    previewPlan,
    t,
  ]);

  const isLoading = loadingManual;

  // Reset to today and scroll to current week when screen gains focus
  useFocusEffect(
    React.useCallback(() => {
      setSelectedDate(new Date());

      // Scroll to current week
      if (daySwitcherRef.current) {
        daySwitcherRef.current.scrollToCurrentWeek();
      }
    }, []),
  );

  // Run propagation check on mount
  React.useEffect(() => {
    if (user) {
      propagateTrainingPlans(user.id).catch(err => {
        console.error('Error propagating training plans:', err);
      });
    }
  }, [user]);

  const moveWeekDays = React.useMemo(
    () => Array.from({ length: 7 }).map((_, index) => addDays(moveWeekStart, index)),
    [moveWeekStart],
  );

  const openMoveModal = (plan: ScheduledWorkoutPreviewPlan) => {
    const originDate = new Date(`${plan.plannedDate}T00:00:00`);
    setPreviewPlan(null);
    setMovePlan(plan);
    setMoveSelectedDate(originDate);
    setMoveWeekStart(startOfWeek(originDate, { weekStartsOn: 1 }));
  };

  const closeMoveModal = () => {
    if (movePlanMutation.isPending) return;
    setMovePlan(null);
    setMoveSelectedDate(null);
  };

  const saveMovedWorkout = () => {
    if (!movePlan || !moveSelectedDate) return;
    const toDate = format(moveSelectedDate, 'yyyy-MM-dd');
    if (toDate === movePlan.plannedDate) return;
    movePlanMutation.mutate({ plan: movePlan, toDate });
  };

  const renderMoveWorkoutModal = () => {
    const selectedDateKey = moveSelectedDate ? format(moveSelectedDate, 'yyyy-MM-dd') : null;
    const saveDisabled = !movePlan || !selectedDateKey || selectedDateKey === movePlan.plannedDate;

    return (
      <Modal animationType="fade" transparent={true} visible={!!movePlan} onRequestClose={closeMoveModal}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={closeMoveModal}>
          <TouchableWithoutFeedback>
            <View style={[styles.modalContent, styles.moveModalContent, { backgroundColor: colors.cardBackground }]}>
              <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>{t('training.moveWorkout')}</Text>
              <Text style={[styles.modalSubtitle, styles.moveModalSubtitle, { color: colors.textSecondary }]}>
                {t('training.moveWorkoutSubtitle')}
              </Text>

              {movePlan ? (
                <View style={[styles.movePlanSummary, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <Text style={[styles.movePlanTitle, { color: colors.textPrimary }]} numberOfLines={1}>
                    {movePlan.title}
                  </Text>
                  <Text style={[styles.movePlanDate, { color: colors.textSecondary }]}>
                    {t('training.moveWorkoutFrom', {
                      date: formatLocalizedDate(new Date(`${movePlan.plannedDate}T00:00:00`), {
                        en: 'EEEE, MMMM d',
                        es: "EEEE, d 'de' MMMM",
                      }),
                    })}
                  </Text>
                </View>
              ) : null}

              <View style={styles.moveWeekHeader}>
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel={t('training.previousWeek')}
                  style={[styles.moveWeekNavButton, { backgroundColor: colors.surface }]}
                  onPress={() => setMoveWeekStart(prev => subWeeks(prev, 1))}
                >
                  <ChevronLeft size={20} color={colors.textPrimary} />
                </TouchableOpacity>
                <Text style={[styles.moveWeekLabel, { color: colors.textPrimary }]}>
                  {formatLocalizedDate(moveWeekStart, { en: 'MMM d', es: 'd MMM' })} -{' '}
                  {formatLocalizedDate(addDays(moveWeekStart, 6), { en: 'MMM d', es: 'd MMM' })}
                </Text>
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel={t('training.nextWeek')}
                  style={[styles.moveWeekNavButton, { backgroundColor: colors.surface }]}
                  onPress={() => setMoveWeekStart(prev => addWeeks(prev, 1))}
                >
                  <ChevronRight size={20} color={colors.textPrimary} />
                </TouchableOpacity>
              </View>

              <View style={styles.moveWeekGrid}>
                {moveWeekDays.map(day => {
                  const dateKey = format(day, 'yyyy-MM-dd');
                  const isOrigin = movePlan?.plannedDate === dateKey;
                  const isSelected = selectedDateKey === dateKey;
                  const hasPlannedWorkouts = markedDates?.has(dateKey);

                  return (
                    <TouchableOpacity
                      key={dateKey}
                      accessibilityRole="button"
                      accessibilityState={{ selected: isSelected }}
                      activeOpacity={0.78}
                      style={[
                        styles.moveDayCell,
                        { borderColor: colors.border, backgroundColor: colors.surface },
                        isSelected && { borderColor: colors.primary, backgroundColor: `${colors.primary}18` },
                        isOrigin && !isSelected && { borderColor: colors.textSecondary },
                      ]}
                      onPress={() => setMoveSelectedDate(day)}
                    >
                      <Text style={[styles.moveDayName, { color: isSelected ? colors.primary : colors.textSecondary }]}>
                        {format(day, 'EEE', { locale: getDateFnsLocale() }).toUpperCase()}
                      </Text>
                      <Text style={[styles.moveDayNumber, { color: isSelected ? colors.primary : colors.textPrimary }]}>
                        {format(day, 'd')}
                      </Text>
                      <View style={styles.moveDayFooter}>
                        {isOrigin ? (
                          <View style={[styles.moveOriginBadge, { backgroundColor: colors.textSecondary }]}>
                            <Text style={styles.moveOriginBadgeText}>{t('training.moveWorkoutOrigin')}</Text>
                          </View>
                        ) : hasPlannedWorkouts ? (
                          <View style={[styles.moveDot, { backgroundColor: colors.primary }]} />
                        ) : null}
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <TouchableOpacity
                accessibilityRole="button"
                disabled={saveDisabled || movePlanMutation.isPending}
                style={[
                  styles.moveSaveButton,
                  { backgroundColor: saveDisabled ? colors.textSecondary : colors.primary },
                  movePlanMutation.isPending && { opacity: 0.7 },
                ]}
                onPress={saveMovedWorkout}
              >
                {movePlanMutation.isPending ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.moveSaveButtonText}>{t('training.saveMove')}</Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity style={styles.modalCancel} onPress={closeMoveModal}>
                <Text style={[styles.modalCancelText, { color: colors.textPrimary }]}>{t('common.cancel')}</Text>
              </TouchableOpacity>
            </View>
          </TouchableWithoutFeedback>
        </TouchableOpacity>
      </Modal>
    );
  };

  const renderDailyPlan = () => {
    if (isLoading)
      return <ActivityIndicator size={24} color={colors.primary} style={{ alignSelf: 'center', margin: 20 }} />;

    const hasPlans = dailyPlans && dailyPlans.length > 0;

    return (
      <View style={styles.dailyPlanContainer}>
        <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>{t('home.training')}</Text>

        {hasPlans ? (
          <>
            {dailyPlans.map((plan: DailyEntry) => {
              const isGym = !!plan.gym_template_id || plan.isGym;
              const template = isGym ? plan.workout_templates : plan.endurance_workout_templates;
              const action = getDailyPlanAction(plan, activeSession);
              const { isThisSessionActive, isCompleted } = action;
              const isAnyGymSessionActive = isGym && !!activeGymSessionId;

              const isRecurring = !!(isGym
                ? plan.workout_templates && plan.workout_templates.suggested_day_of_week != null
                : plan.endurance_workout_templates && plan.endurance_workout_templates.scheduled_day != null);
              const templateId = isGym
                ? plan.gym_template_id || template?.id || ''
                : plan.endurance_template_id || template?.id || '';
              const planDate = format(selectedDate, 'yyyy-MM-dd');
              const startPlan = () => {
                if (isCompleted) return;
                if (isAnyGymSessionActive) {
                  if (!isThisSessionActive) {
                    Alert.alert(t('training.activeGymSessionTitle'), t('training.activeGymSessionMessage'));
                  }
                  navigation.navigate('ActiveWorkout', {
                    sessionId: activeGymSessionId,
                  });
                } else if (isGym) {
                  navigation.navigate('StartWorkout', {
                    templateId,
                    date: planDate,
                    planId: plan.id,
                  });
                } else {
                  navigation.navigate('EnduranceSessionForm', {
                    templateId,
                    date: planDate,
                  });
                }
              };

              const openPreview = () => {
                if (!templateId || isCompleted || plan.isExtraSession) return;
                setPreviewPlan({
                  id: plan.id,
                  type: isGym ? 'gym' : 'endurance',
                  templateId,
                  plannedDate: plan.planned_date || planDate,
                  title: template?.base_name || t('settings.workout'),
                  subtitle: isGym
                    ? t('constants.gym')
                    : template?.sport_type
                      ? t(SPORTS_CONFIG[template.sport_type].label)
                      : t('settings.workout'),
                  sportType: isGym
                    ? 'strength'
                    : ((template?.sport_type || plan.sport_type || null) as SportType | null),
                  isCompleted,
                  isActive: Boolean(isThisSessionActive || isAnyGymSessionActive),
                });
              };

              const cardContent = (
                <GlassCard style={styles.planCard}>
                  <View style={styles.planHeader}>
                    <TouchableOpacity
                      accessibilityRole="button"
                      disabled={isCompleted ? !plan.completedSession?.id : plan.isExtraSession || !templateId}
                      onPress={() => {
                        if (isCompleted) {
                          if (plan.completedSession?.id) {
                            navigation.navigate('EnduranceSessionDetail', { sessionId: plan.completedSession.id });
                          }
                        } else if (isThisSessionActive) {
                          startPlan();
                        } else {
                          openPreview();
                        }
                      }}
                      activeOpacity={0.82}
                      style={styles.planInfoButton}
                    >
                      <View
                        style={[
                          styles.planIcon,
                          {
                            backgroundColor: isGym
                              ? SPORT_COLORS.gym
                              : template?.sport_type
                                ? SPORT_COLORS[template.sport_type.toLowerCase() as keyof typeof SPORT_COLORS] ||
                                  colors.secondary
                                : colors.secondary,
                          },
                        ]}
                      >
                        {isGym ? (
                          <Dumbbell size={20} color="#FFF" />
                        ) : (
                          <SportIcon sport={template?.sport_type || t('constants.other')} size={20} color="#FFF" />
                        )}
                      </View>

                      <View style={styles.planTextBlock}>
                        <Text style={[styles.planTitle, { color: colors.textPrimary }]}>
                          {plan.completedSession
                            ? plan.completedSession.name ||
                              (isGym
                                ? t('training.strengthWorkout')
                                : t(
                                    getSportDefaultTitleKey(
                                      plan.completedSession.sport_type,
                                      plan.completedSession.sport_subtype,
                                    ),
                                  ))
                            : template?.base_name || t('settings.workout')}
                        </Text>
                        <Text style={[styles.planSubtitle, { color: colors.textSecondary }]}>
                          {isGym
                            ? t('constants.gym')
                            : template?.sport_type
                              ? t(SPORTS_CONFIG[template.sport_type].label)
                              : t('settings.workout')}
                          {isCompleted && (
                            <>
                              {' · '}
                              <Text style={[styles.completedStatusText, { color: colors.successText }]}>
                                {`✓ ${t('training.completedStatus')}`}
                              </Text>
                            </>
                          )}
                        </Text>
                      </View>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[
                        styles.startPlanBtn,
                        { backgroundColor: isCompleted ? 'transparent' : colors.primary },
                        action.disabled && { opacity: 0.45 },
                      ]}
                      disabled={action.disabled}
                      accessibilityState={{ disabled: action.disabled }}
                      accessibilityRole="button"
                      accessibilityLabel={t(action.label)}
                      onPress={
                        isCompleted
                          ? () => {
                              if (plan.completedSession?.id) {
                                navigation.navigate('EnduranceSessionDetail', { sessionId: plan.completedSession.id });
                              }
                            }
                          : startPlan
                      }
                    >
                      <Text style={[styles.startPlanText, isCompleted && { color: colors.primary }]}>
                        {t(action.label)}
                      </Text>
                      {isCompleted && <ChevronRight size={16} color={colors.primary} />}
                    </TouchableOpacity>
                  </View>
                </GlassCard>
              );

              // Can swipe to delete if it's an actual plan (not a scheduled template preview) and not completed
              const canDelete = !plan.isScheduledTemplate && plan.id && !plan.id.startsWith('scheduled-');

              if (canDelete) {
                return (
                  <Swipeable
                    key={plan.id}
                    ref={ref => {
                      if (ref) swipeableRefs.current.set(plan.id, ref);
                    }}
                    renderRightActions={(progress, dragX) =>
                      renderRightActions(progress, dragX, plan.id, plan, !!isRecurring)
                    }
                    overshootRight={false}
                    friction={2}
                    rightThreshold={40}
                  >
                    {cardContent}
                  </Swipeable>
                );
              }

              return <View key={plan.id}>{cardContent}</View>;
            })}
          </>
        ) : (
          <GlassCard style={styles.emptyStateCard}>
            <Text style={[styles.emptyStateText, { color: colors.textSecondary }]}>
              {t('training.nothingPlannedForDate')}
            </Text>
          </GlassCard>
        )}

        {/* Always show option to add more */}
        <TouchableOpacity onPress={() => setShowAddModal(true)} style={styles.addMoreBtn}>
          <Plus size={16} color={colors.primary} />
          <Text style={[styles.linkText, { color: colors.primary }]}>
            {hasPlans ? t('training.addMore') : t('training.assignRoutine')}
          </Text>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <LinearGradient colors={[colors.gradientStart, colors.gradientEnd]} style={styles.container}>
      <SafeAreaView style={{ flex: 1, paddingBottom: 0 }}>
        {/* Top Bar */}
        <View style={styles.topBar}>
          <View style={styles.topBarActionsPlaceholder} />
          <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>{t('home.training')}</Text>
          <View style={styles.topBarActions}>
            <TouchableOpacity
              onPress={() => navigation.navigate('TrainingPlanImport')}
              style={styles.topBarAction}
              accessibilityRole="button"
              accessibilityLabel={t('training.importTrainingPlan')}
            >
              <Upload size={23} color={colors.textPrimary} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => navigation.navigate('Settings')}
              style={styles.topBarAction}
              accessibilityRole="button"
              accessibilityLabel={t('navigation.workoutSettings')}
            >
              <Settings size={24} color={colors.textPrimary} />
            </TouchableOpacity>
          </View>
        </View>

        <DaySwitcher
          ref={daySwitcherRef}
          variant="training"
          selectedDate={selectedDate}
          onSelectDate={setSelectedDate}
          markedDates={markedDates}
        />

        <ScrollView contentContainerStyle={styles.content}>
          <ImportReviewSurface
            onOpenSession={session => navigation.navigate('EnduranceSessionDetail', { sessionId: session.id })}
          />

          {activeSession && <ActiveSessionBanner session={activeSession} />}

          {renderDailyPlan()}

          <View style={styles.sectionHeaderRow}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>{t('training.tools')}</Text>
          </View>

          <View style={styles.toolsGrid}>
            <TouchableOpacity style={styles.toolCard} onPress={() => navigation.navigate('SportTemplatesList')}>
              <GlassCard style={styles.toolGlass}>
                <View style={styles.toolContent}>
                  <Calendar size={24} color={colors.primary} />
                  <Text style={[styles.toolTitle, { color: colors.textPrimary }]}>{t('training.sportsTemplate')}</Text>
                </View>
              </GlassCard>
            </TouchableOpacity>

            <TouchableOpacity style={styles.toolCard} onPress={() => navigation.navigate('GymRoutinesList')}>
              <GlassCard style={styles.toolGlass}>
                <View style={styles.toolContent}>
                  <Dumbbell size={24} color={colors.primary} />
                  <Text style={[styles.toolTitle, { color: colors.textPrimary }]}>{t('training.gymRoutines')}</Text>
                </View>
              </GlassCard>
            </TouchableOpacity>

            <TouchableOpacity style={styles.toolCard} onPress={() => navigation.navigate('ActivityTypeSelector')}>
              <GlassCard style={styles.toolGlass}>
                <View style={styles.toolContent}>
                  <Play size={24} color={colors.success} />
                  <Text style={[styles.toolTitle, { color: colors.textPrimary }]}>
                    {t('training.registerActivity')}
                  </Text>
                </View>
              </GlassCard>
            </TouchableOpacity>

            <TouchableOpacity style={styles.toolCard} onPress={() => navigation.navigate('EnduranceSessionsList')}>
              <GlassCard style={styles.toolGlass}>
                <View style={styles.toolContent}>
                  <List size={24} color={colors.primary} />
                  <Text style={[styles.toolTitle, { color: colors.textPrimary }]}>
                    {t('training.activityHistoryTitle')}
                  </Text>
                </View>
              </GlassCard>
            </TouchableOpacity>
          </View>
        </ScrollView>

        {/* Add More Modal */}
        <Modal
          animationType="fade"
          transparent={true}
          visible={showAddModal}
          onRequestClose={() => setShowAddModal(false)}
        >
          <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowAddModal(false)}>
            <TouchableWithoutFeedback>
              <View style={[styles.modalContent, { backgroundColor: colors.cardBackground }]}>
                <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>{t('training.addToCalendar')}</Text>
                <Text style={[styles.modalSubtitle, { color: colors.textSecondary }]}>
                  {t('training.whatToScheduleForDate')}
                  {formatLocalizedDate(selectedDate, {
                    en: 'MMMM d',
                    es: "d 'de' MMMM",
                  })}
                  ?
                </Text>

                <View style={styles.modalGrid}>
                  <TouchableOpacity
                    style={[
                      styles.modalOption,
                      styles.secondaryButton,
                      { backgroundColor: colors.surface, borderColor: colors.textSecondary },
                    ]}
                    onPress={() => {
                      setShowAddModal(false);
                      navigation.navigate('GymRoutinesList', {
                        assignToDate: format(selectedDate, 'yyyy-MM-dd'),
                      });
                    }}
                  >
                    <View style={[styles.modalIcon, { backgroundColor: SPORT_COLORS.gym }]}>
                      <Dumbbell size={24} color="#FFF" />
                    </View>
                    <Text style={[styles.modalOptionText, styles.title, { color: colors.textPrimary }]}>
                      {t('constants.gym')}
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.modalOption,
                      styles.secondaryButton,
                      { backgroundColor: colors.surface, borderColor: colors.textSecondary },
                    ]}
                    onPress={() => {
                      setShowAddModal(false);
                      navigation.navigate('SportTemplatesList', {
                        assignToDate: format(selectedDate, 'yyyy-MM-dd'),
                      });
                    }}
                  >
                    <View style={[styles.modalIcon, { backgroundColor: colors.accent }]}>
                      <SportIcon sport={'running'} size={24} color="#FFF" />
                    </View>
                    <Text style={[styles.modalOptionText, styles.title, { color: colors.textPrimary }]}>
                      {t('training.sport')}
                    </Text>
                  </TouchableOpacity>
                </View>

                <TouchableOpacity style={styles.modalCancel} onPress={() => setShowAddModal(false)}>
                  <Text style={[styles.modalCancelText, { color: colors.textPrimary }]}>{t('common.cancel')}</Text>
                </TouchableOpacity>
              </View>
            </TouchableWithoutFeedback>
          </TouchableOpacity>
        </Modal>

        <ScheduledWorkoutPreviewModal
          visible={!!previewPlan}
          plan={previewPlan}
          primaryActionLabel={
            previewPlan?.isActive
              ? t('training.resume')
              : previewPlan?.type === 'gym'
                ? t('training.start')
                : t('training.register')
          }
          primaryActionDisabled={previewPlan?.isCompleted}
          onClose={() => setPreviewPlan(null)}
          onAssociateCompletedAction={
            previewAssociateCandidates.length > 0 && !associateCompletedSessionMutation.isPending
              ? handleAssociateCompletedFromPreview
              : undefined
          }
          onMoveAction={previewPlan && !previewPlan.isCompleted ? () => openMoveModal(previewPlan) : undefined}
          onPrimaryAction={() => {
            if (!previewPlan) return;
            const currentPreviewPlan = previewPlan;
            setPreviewPlan(null);
            if (currentPreviewPlan.isActive && currentPreviewPlan.type === 'gym' && activeGymSessionId) {
              navigation.navigate('ActiveWorkout', {
                sessionId: activeGymSessionId,
              });
            } else if (currentPreviewPlan.isActive) {
              navigation.navigate('ActiveWorkout', {
                sessionId: activeSession?.id || '',
              });
            } else if (currentPreviewPlan.type === 'gym') {
              navigation.navigate('StartWorkout', {
                templateId: currentPreviewPlan.templateId,
                date: currentPreviewPlan.plannedDate,
                planId: currentPreviewPlan.id,
              });
            } else {
              navigation.navigate('EnduranceSessionForm', {
                templateId: currentPreviewPlan.templateId,
                date: currentPreviewPlan.plannedDate,
              });
            }
          }}
        />

        {renderMoveWorkoutModal()}

        {/* Loading Overlay */}
        {isDeleting && (
          <View style={styles.loadingOverlay}>
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={[styles.loadingText, { color: colors.textPrimary }]}>Cargando...</Text>
            </View>
          </View>
        )}
      </SafeAreaView>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    position: 'relative',
  },
  topBarActionsPlaceholder: {
    width: 72,
  },
  topBarActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  topBarAction: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
  },

  dailyPlanContainer: { marginBottom: spacing.m },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 12,
    paddingHorizontal: 16,
  },
  content: {
    paddingBottom: 120,
  },
  planCard: {
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 0,
    overflow: 'hidden',
  },
  planHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
  },
  planIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  planInfoButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  planTextBlock: {
    flex: 1,
    paddingHorizontal: 12,
  },
  planTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  planSubtitle: {
    fontSize: 13,
    marginTop: 2,
  },
  completedStatusText: {
    fontWeight: '600',
  },
  startPlanBtn: {
    minWidth: 88,
    maxWidth: '45%',
    minHeight: 44,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 22,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  startPlanText: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
    flexShrink: 1,
  },
  swipeActionContainer: {
    width: 80,
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  swipeDeleteBtn: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#FF3B30',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
  },
  emptyStateCard: {
    marginHorizontal: 16,
    padding: 20,
    alignItems: 'center',
  },
  emptyStateText: {
    fontSize: 14,
  },
  addMoreBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
    gap: 6,
  },
  linkText: {
    fontWeight: '600',
    fontSize: 14,
  },
  sectionHeaderRow: {
    marginTop: 12,
    marginBottom: 8,
  },
  toolsGrid: {
    paddingHorizontal: 16,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  toolCard: {
    width: '48%',
    marginBottom: 4,
  },
  toolGlass: {
    padding: 16,
    height: 80,
    justifyContent: 'center',
    alignItems: 'center',
  },
  toolContent: {
    flexDirection: 'column',
    alignItems: 'center',
    gap: 8,
    width: '100%',
    justifyContent: 'center',
  },
  toolTitle: {
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 40,
  },
  moveModalContent: {
    paddingBottom: 28,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 8,
    textAlign: 'center',
  },
  modalSubtitle: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 24,
  },
  moveModalSubtitle: {
    marginBottom: 16,
  },
  movePlanSummary: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    marginBottom: 16,
  },
  movePlanTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  movePlanDate: {
    fontSize: 13,
    marginTop: 4,
  },
  moveWeekHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  moveWeekNavButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  moveWeekLabel: {
    fontSize: 15,
    fontWeight: '700',
  },
  moveWeekGrid: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  moveDayCell: {
    flex: 1,
    minHeight: 92,
    borderWidth: 1,
    borderRadius: 16,
    paddingVertical: 10,
    alignItems: 'center',
  },
  moveDayName: {
    fontSize: 10,
    fontWeight: '800',
  },
  moveDayNumber: {
    fontSize: 20,
    fontWeight: '800',
    marginTop: 4,
  },
  moveDayFooter: {
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 6,
  },
  moveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  moveOriginBadge: {
    borderRadius: 999,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  moveOriginBadgeText: {
    color: '#FFFFFF',
    fontSize: 8,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  moveSaveButton: {
    minHeight: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  moveSaveButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  modalGrid: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 24,
  },
  modalOption: {
    flex: 1,
    padding: 16,
    borderRadius: 16,
    alignItems: 'center',
    borderWidth: 1,
  },
  modalIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  modalOptionText: {
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  modalCancel: {
    alignItems: 'center',
    padding: 12,
  },
  modalCancelText: {
    fontSize: 16,
    fontWeight: '600',
  },
  // Missing static styles
  secondaryButton: {
    borderWidth: 1,
  },
  title: {},
  subtitle: {},
  // Loading Overlay
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    // Background removed as requested
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
    pointerEvents: 'none', // Allow clicks through? No, usually we want to block interactions while loading.
    // Actually, if we want to block interactions but have no color:
    // leaving backgroundColor undefined or transparent is fine.
    // If the user wants to signify "loading" usually we block input.
  },
  loadingContainer: {
    backgroundColor: '#FFF',
    padding: 24,
    borderRadius: 16,
    alignItems: 'center',
    gap: 12,
    // Add shadow to make it stand out without the overlay background
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 5,
  },
  loadingText: {
    fontSize: 14,
    fontWeight: '500',
  },
});
