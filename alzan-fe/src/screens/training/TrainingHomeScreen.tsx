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
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { GlassCard } from '../../components/GlassCard';
import { LinearGradient } from 'expo-linear-gradient';
import { spacing } from '../../theme';
import { useTheme } from '../../context/ThemeContext';
import { Dumbbell, Calendar, Play, List, Plus, Settings, Trash2 } from 'lucide-react-native';
import { SportIcon } from '../../components/icons/SportIcon';
import { SPORT_COLORS } from '../../theme/sportColors';
import { SPORTS_CONFIG } from '../../constants/sports';
import { ActiveSessionBanner } from './components/ActiveSessionBanner';
import { ImportReviewSurface } from './components/ImportReviewSurface';

import { format, addDays, isSameDay, subDays, startOfDay } from 'date-fns';
import { useQuery, keepPreviousData, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../context/AuthContext';
import { propagateTrainingPlans } from '../../modules/training/services/trainingCopyService';
import { useUnitConversion } from '../../hooks/useUnitConversion';
import { DaySwitcher } from '../../components/common/DaySwitcher';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { TrainingScreenNavigationProp, TabParamList } from '../../types/navigation.types';
import { DaySwitcherRef } from '../../components/common/DaySwitcher';
import { useTranslation } from 'react-i18next';
import { formatLocalizedDate, getDateFnsLocale } from '../../i18n/dateLocale';
import { Alert } from '../../components/common/Alert';

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
    base_name: string;
    description: string;
    sport_type: string;
    suggested_day_of_week?: number | null;
  } | null;
  endurance_workout_templates?: {
    id: string;
    base_name: string;
    description: string;
    sport_type: string;
    scheduled_day?: number | null;
    workout_goal?: string;
  } | null;
  sport_type?: string;
}

interface CompletedSession {
  id: string;
  sport_type: string;
  workout_template_id: string | null;
  start_time: string;
  name: string;
  source: string;
  distance_m: number | null;
  duration_s: number | null;
}

export const TrainingHomeScreen = () => {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const navigation = useNavigation<TrainingScreenNavigationProp>();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { convertDistanceToUi } = useUnitConversion();
  const [selectedDate, setSelectedDate] = useState(new Date());

  // Calculate range for dots (e.g. +/- 45 days to cover typical scrolling)
  // We can optimize this to only fetch current view, but a fixed range is simpler for now
  const DOTS_RANGE_DAYS = 45;
  const dotsStartDate = React.useMemo(() => subDays(startOfDay(new Date()), DOTS_RANGE_DAYS), []);
  const dotsEndDate = React.useMemo(() => addDays(startOfDay(new Date()), DOTS_RANGE_DAYS), []);
  const [showAddModal, setShowAddModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const swipeableRefs = useRef<Map<string, Swipeable>>(new Map());
  const daySwitcherRef = useRef<DaySwitcherRef>(null);

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
      const { data } = await supabase
        .from('activity_sessions')
        .select('*')
        .eq('user_id', user.id)
        .is('end_time', null)
        .order('start_time', { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
    enabled: !!user,
    refetchInterval: 3000,
  });

  // Fetch dates with plans or sessions for the DaySwitcher dots
  const { data: markedDates } = useQuery({
    queryKey: ['weekDots', user?.id], // Broad key, refetch on mount/focus
    queryFn: async () => {
      if (!user) return new Set<string>();

      const startStr = format(dotsStartDate, 'yyyy-MM-dd');
      const endStr = format(dotsEndDate, 'yyyy-MM-dd');

      // 1. Get Scheduled Plans
      const { data: plans } = await supabase
        .from('workout_plans')
        .select('planned_date, status')
        .eq('user_id', user.id)
        .gte('planned_date', startStr)
        .lte('planned_date', endStr)
        .neq('status', 'skipped');

      // 2. Get Completed Sessions
      const { data: sessions } = await supabase
        .from('activity_sessions')
        .select('start_time')
        .eq('user_id', user.id)
        .gte('start_time', `${startStr}T00:00:00`)
        .lte('start_time', `${endStr}T23:59:59`)
        .not('end_time', 'is', null);

      const dots = new Set<string>();

      plans?.forEach(p => {
        if (p.planned_date) {
          // Handle both date-only string and ISO string
          const d = typeof p.planned_date === 'string' ? p.planned_date.split('T')[0] : '';
          if (d) dots.add(d);
        }
      });

      sessions?.forEach(s => {
        if (s.start_time) {
          const d = typeof s.start_time === 'string' ? s.start_time.split('T')[0] : '';
          if (d) dots.add(d);
        }
      });

      return dots;
    },
    enabled: !!user,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  // Refetch data when screen gains focus
  useFocusEffect(
    React.useCallback(() => {
      refetchActiveSession();
      queryClient.invalidateQueries({ queryKey: ['dailyPlans'] });
      queryClient.invalidateQueries({ queryKey: ['completedSessions'] });
      queryClient.invalidateQueries({ queryKey: ['weekDots'] });
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
    queryKey: ['completedSessions', format(selectedDate, 'yyyy-MM-dd'), user?.id],
    queryFn: async () => {
      if (!user) return [];
      const dateStr = format(selectedDate, 'yyyy-MM-dd');
      const startOfDayStr = `${dateStr}T00:00:00`;
      const endOfDayStr = `${dateStr}T23:59:59`;

      const { data, error } = await supabase
        .from('activity_sessions')
        .select('id, sport_type, workout_template_id, start_time, name, source, distance_m, duration_s')
        .eq('user_id', user.id)
        .eq('needs_strength_review', false)
        .or(
          'duplicate_resolution.is.null,duplicate_resolution.neq.pending,duplicate_score.lt.80,duplicate_score.is.null',
        )
        .not('end_time', 'is', null) // Only completed sessions
        .gte('start_time', startOfDayStr)
        .lte('start_time', endOfDayStr);

      if (error) throw error;
      return (data as unknown as CompletedSession[]) || [];
    },
    enabled: !!user,
    placeholderData: keepPreviousData,
  });

  // Merge Manual Plans with Unmatched Completed Sessions
  const dailyPlans = React.useMemo(() => {
    const plans = manualPlans ? [...manualPlans] : [];
    const sessions = completedSessions || [];

    // Track matched sessions to avoid duplication
    const matchedSessionIds = new Set<string>();

    // 1. Iterate plans to find matches (logic mirrors rendering matching)
    plans.forEach(plan => {
      const template = plan.workout_templates || plan.endurance_workout_templates;
      const isGym = !!plan.gym_template_id;

      const match = sessions.find((s: CompletedSession) => {
        if (isGym) {
          // Match by template ID or Name+Type for Gym
          return (
            s.workout_template_id === template?.id || (s.name === template?.base_name && s.sport_type === 'strength')
          );
        } else {
          // Match by Name+Type for Endurance
          return s.sport_type === template?.sport_type && s.name === template?.base_name;
        }
      });

      if (match) matchedSessionIds.add(match.id);
    });

    // 2. Create "Plan-like" objects for unmatched sessions
    const extraSessions = sessions.filter(s => !matchedSessionIds.has(s.id));

    const sessionsAsPlans: DailyEntry[] = extraSessions.map(s => {
      const isGym = s.sport_type === 'strength' || s.source === 'gym_session';
      return {
        id: `session-${s.id}`, // Unique ID
        isExtraSession: true, // Marker for deletion logic (cannot delete from calendar)

        // Fields for render logic
        gym_template_id: isGym ? s.workout_template_id || 'dummy' : null,
        endurance_template_id: !isGym ? 'dummy' : null,
        isGym,

        // Mapped Template Data
        workout_templates: isGym
          ? {
              id: 'dummy',
              base_name: s.name,
              description: t('training.sessionCompleted'),
              sport_type: 'gym',
            }
          : null,

        endurance_workout_templates: !isGym
          ? {
              id: 'dummy',
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
      };
    });

    return [...plans, ...sessionsAsPlans];
  }, [manualPlans, completedSessions, convertDistanceToUi, t]);

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
              // Check if this specific template is currently active (ONLY FOR GYM)
              // Robust Active Session Check:
              // 1. Explicit Link: Plan knows about Session (stored in workout_plans.activity_session_id)
              // 2. Fallback: Same Template + Same Date (ignoring time) to prevent future/past false positives

              // Direct Id Match (Most reliable)
              const hasExplicitLink = plan.activity_session_id && plan.activity_session_id === activeSession?.id;

              // Fallback for sessions started without explicit plan link (e.g. from "Quick Start")
              // Only matches if:
              // a) Plan has no linked session yet
              // b) Template IDs match
              // c) Dates match (ignoring time)
              const isLegacyMatch =
                !plan.activity_session_id &&
                activeSession?.workout_template_id === (plan.gym_template_id || template?.id) &&
                activeSession?.start_time &&
                isSameDay(new Date(activeSession.start_time), new Date(plan.planned_date || ''));

              const isThisSessionActive = isGym && !activeSession?.end_time && (hasExplicitLink || isLegacyMatch);

              // Check if workout is already completed for this date
              const isGymCompleted =
                isGym &&
                completedSessions?.some(
                  (s: CompletedSession) => s.workout_template_id === (plan.gym_template_id || template?.id),
                );
              // Enhanced matching for Endurance: Check Sport AND Name (since we can't link IDs yet)
              const isEnduranceCompleted =
                !isGym &&
                completedSessions?.some(
                  (s: CompletedSession) => s.sport_type === template?.sport_type && s.name === template?.base_name,
                );
              // If this is an extra session (from Registrar Actividad), it's already completed
              const isCompleted = plan.isExtraSession || isGymCompleted || isEnduranceCompleted;

              const isRecurring = !!(isGym
                ? plan.workout_templates && plan.workout_templates.suggested_day_of_week != null
                : plan.endurance_workout_templates && plan.endurance_workout_templates.scheduled_day != null);

              const cardContent = (
                <GlassCard style={styles.planCard}>
                  <View style={styles.planHeader}>
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

                    <View style={{ flex: 1, paddingHorizontal: 12 }}>
                      <Text style={[styles.planTitle, { color: colors.textPrimary }]} numberOfLines={1}>
                        {template?.base_name || t('settings.workout')}
                      </Text>
                      <Text style={[styles.planSubtitle, { color: colors.textSecondary }]} numberOfLines={1}>
                        {isGym
                          ? t('constants.gym')
                          : template?.sport_type
                            ? t(SPORTS_CONFIG[template.sport_type].label)
                            : t('settings.workout')}
                      </Text>
                    </View>

                    <TouchableOpacity
                      style={[
                        styles.startPlanBtn,
                        { backgroundColor: colors.primary },
                        isThisSessionActive && { backgroundColor: colors.success },
                        isCompleted && { backgroundColor: colors.danger },
                      ]}
                      disabled={isCompleted}
                      onPress={() => {
                        if (isCompleted) return;
                        if (isThisSessionActive) {
                          navigation.navigate('ActiveWorkout', {
                            sessionId: activeSession?.id || '',
                          });
                        } else {
                          if (isGym)
                            navigation.navigate('StartWorkout', {
                              templateId: plan.gym_template_id || template?.id || '',
                              date: format(selectedDate, 'yyyy-MM-dd'),
                              planId: plan.id,
                            });
                          else
                            navigation.navigate('EnduranceSessionForm', {
                              templateId: plan.endurance_template_id || template?.id || '',
                              date: format(selectedDate, 'yyyy-MM-dd'),
                            });
                        }
                      }}
                    >
                      {!isCompleted && <Play size={12} color="#FFF" style={{ marginRight: 4 }} />}
                      <Text style={styles.startPlanText}>
                        {isCompleted ? 'TERMINADO' : isThisSessionActive ? 'REANUDAR' : isGym ? 'INICIAR' : 'REGISTRAR'}
                      </Text>
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
          <View style={{ width: 24 }} />
          <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>{t('home.training')}</Text>
          <TouchableOpacity onPress={() => navigation.navigate('Settings')} style={{ padding: 4 }}>
            <Settings size={24} color={colors.textPrimary} />
          </TouchableOpacity>
        </View>

        <DaySwitcher
          ref={daySwitcherRef}
          selectedDate={selectedDate}
          onSelectDate={setSelectedDate}
          markedDates={markedDates}
        />

        <ScrollView contentContainerStyle={styles.content}>
          <ImportReviewSurface
            onOpenSession={session => navigation.navigate('EnduranceSessionDetail', { sessionId: session.id })}
          />

          {renderDailyPlan()}

          {activeSession && <ActiveSessionBanner session={activeSession} />}

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
  planTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  planSubtitle: {
    fontSize: 13,
    marginTop: 2,
  },
  startPlanBtn: {
    minWidth: 116,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  startPlanText: {
    color: '#FFF',
    fontSize: 11,
    fontWeight: '700',
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
