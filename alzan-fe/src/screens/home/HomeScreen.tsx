import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { HomeScreenNavigationProp, TabParamList } from '../../types/navigation.types';
import { LinearGradient } from 'expo-linear-gradient';
import { Play, Utensils, Scale, ChevronRight, CheckCircle, Flame, Dumbbell, Moon, Settings } from 'lucide-react-native';
import { useQueryClient } from '@tanstack/react-query';

import { spacing, borderRadius, typography } from '../../theme';
import { useTheme } from '../../context/ThemeContext';
import { GlassCard } from '../../components/GlassCard';
import { useDashboardData, UseDashboardDataScheduledWorkout } from '../../hooks/useDashboardData';
import { useDayNutrition } from '../../modules/nutrition/hooks/useDayNutritionLogic';
import { MEAL_TYPES, MEAL_TYPE_LABELS } from '../../modules/nutrition/constants';
import { WeightLogModal } from '../../components/WeightLogModal';
import { SportIcon } from '../../components/icons/SportIcon';
import { SPORT_COLORS } from '../../theme/sportColors';
import { useUnitConversion } from '../../hooks/useUnitConversion';
import { NotificationSettings, useSettingsNotifications } from '../../hooks/settings/useSettingsNotifications';
import { useMediaPermissions } from '../../hooks/useMediaPermissions';

import { useHealthInsights } from '../../modules/health/hooks/useHealthInsights';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { useTranslation } from 'react-i18next';
import { formatLocalizedDate } from '../../i18n/dateLocale';
import { ActivitySession } from '../../types/requests.types';

const getNextMealType = (settings: NotificationSettings) => {
  if (!settings?.meals) return MEAL_TYPES.BREAKFAST;

  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  const getMinutes = (timeStr: string) => {
    const [h, m] = timeStr.split(':').map(Number);
    return h * 60 + m;
  };

  const breakfastTime = getMinutes(settings.meals.breakfast?.time || '08:00');
  const almuerzoTime = getMinutes(settings.meals.almuerzo?.time || '11:00');
  const lunchTime = getMinutes(settings.meals.lunch?.time || '14:00');
  const meriendaTime = getMinutes(settings.meals.merienda?.time || '17:30');
  const dinnerTime = getMinutes(settings.meals.dinner?.time || '21:00');

  if (currentMinutes < breakfastTime) return MEAL_TYPES.BREAKFAST;
  if (currentMinutes < almuerzoTime) return MEAL_TYPES.ALMUERZO;
  if (currentMinutes < lunchTime) return MEAL_TYPES.LUNCH;
  if (currentMinutes < meriendaTime) return MEAL_TYPES.MERIENDA;
  if (currentMinutes < dinnerTime) return MEAL_TYPES.DINNER;
  return MEAL_TYPES.BREAKFAST;
};

export const HomeScreen = () => {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const navigation = useNavigation<HomeScreenNavigationProp>();
  const queryClient = useQueryClient();

  const { convertWeightToUi, convertEnergyToUi } = useUnitConversion();
  const { settings: notifSettings, refetch: refetchSettings } = useSettingsNotifications(); // Get settings
  useMediaPermissions(); // Request camera/mic permissions on mount

  // Auto-refresh when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      // Invalidate queries to ensure fresh data
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['mealLogs'] });
      refetchSettings();
    }, [queryClient, refetchSettings]),
  );

  // Data
  const { completedWorkoutsCount, health, scheduledWorkouts, activeTodayWorkout } = useDashboardData();
  const { latestSleep } = useHealthInsights();
  const pendingWorkout = !activeTodayWorkout && scheduledWorkouts.length > 0 ? scheduledWorkouts[0] : null;
  const { totals, targets, meals } = useDayNutrition(new Date());
  const latestWeight = health?.weight?.weight_kg;

  // UI State
  const [showWeightModal, setShowWeightModal] = useState(false);

  // Derived state for Next Meal (Dynamic)
  const [nextMealType, setNextMealType] = useState(MEAL_TYPES.BREAKFAST);

  const scrollViewRef = useRef<ScrollView>(null);

  useEffect(() => {
    const parent = navigation.getParent<BottomTabNavigationProp<TabParamList>>();
    if (parent) {
      const unsubscribe = parent.addListener('tabPress', () => {
        // Scroll to top when tab is pressed
        // Use requestAnimationFrame to ensure smooth UI handling
        requestAnimationFrame(() => {
          scrollViewRef.current?.scrollTo({ y: 0, animated: true });
        });
      });
      return unsubscribe;
    }
  }, [navigation]);

  useEffect(() => {
    if (notifSettings) {
      setNextMealType(getNextMealType(notifSettings));

      const interval = setInterval(() => {
        setNextMealType(getNextMealType(notifSettings));
      }, 60000);
      return () => clearInterval(interval);
    }
  }, [notifSettings]);

  // Get Next Meal Status
  const nextMealItems = meals ? meals.filter(m => m.mealType === nextMealType) : [];
  const isNextMealLogged = nextMealItems.some(m => m.status === 'done_as_planned' || m.status === 'done_with_changes');
  const nextMealLabel = MEAL_TYPE_LABELS[nextMealType] || 'settings.lunch';

  const remainingKcal = (targets.kcal || 2000) - (totals.kcal || 0);

  const handleResumeWorkout = () => {
    if (!activeTodayWorkout) return;

    navigation.navigate('Training', {
      screen: 'ActiveWorkout',
      params: { sessionId: activeTodayWorkout.id },
    });
  };

  const handleStartPendingWorkout = () => {
    if (!pendingWorkout) return;

    if (pendingWorkout.gym_template_id) {
      navigation.navigate('Training', {
        screen: 'StartWorkout',
        params: {
          templateId: pendingWorkout.gym_template_id,
          planId: pendingWorkout.id,
          date: new Date().toISOString(),
        },
      });
    } else if (pendingWorkout.endurance_template_id) {
      navigation.navigate('Training', {
        screen: 'EnduranceSessionForm',
        params: {
          templateId: pendingWorkout.endurance_template_id,
          date: new Date().toISOString(),
        },
      });
    }
  };

  const handleAgendaWorkout = () => {
    if (activeTodayWorkout) {
      handleResumeWorkout();
      return;
    }

    handleStartPendingWorkout();
  };

  // Helper for Icon and Color
  const getWorkoutVisuals = (workout: UseDashboardDataScheduledWorkout) => {
    if (workout.gym_template_id) {
      return {
        icon: <Dumbbell color={colors.textPrimary} size={24} />,
        color: SPORT_COLORS.gym || colors.primary,
      };
    }

    const sport = workout.endurance_workout_templates?.sport_type?.toLowerCase();
    // Fallback color if sport color not found
    const color = sport && SPORT_COLORS[sport] ? SPORT_COLORS[sport] : colors.accent;

    return {
      icon: <SportIcon sport={sport!} size={24} color={colors.textPrimary} />,
      color: color,
    };
  };

  const getActiveWorkoutVisuals = (session: ActivitySession) => {
    if (session.sport_type === 'strength') {
      return {
        icon: <Dumbbell color={colors.textPrimary} size={24} />,
        color: SPORT_COLORS.gym || colors.primary,
      };
    }

    const sport = session.sport_type?.toLowerCase();
    const color = sport && SPORT_COLORS[sport] ? SPORT_COLORS[sport] : colors.accent;
    return {
      icon: <SportIcon sport={sport || 'other'} size={24} color={colors.textPrimary} />,
      color,
    };
  };

  return (
    <LinearGradient colors={[colors.gradientStart, colors.gradientEnd]} style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ScrollView
          ref={scrollViewRef}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Centered Header with Settings Icon */}
          <View style={styles.header}>
            <View style={{ width: 24 }} />
            <View style={{ alignItems: 'center' }}>
              <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>{t('auth.appName')}</Text>
              <Text style={[styles.headerDate, { color: colors.textSecondary }]}>
                {formatLocalizedDate(new Date(), {
                  en: 'EEEE, MMMM d',
                  es: "EEEE, d 'de' MMMM",
                })}
              </Text>
            </View>
            <TouchableOpacity onPress={() => navigation.navigate('Settings')}>
              <Settings size={24} color={colors.textPrimary} />
            </TouchableOpacity>
          </View>

          {/* Daily Snapshot */}
          <Text style={[styles.sectionTitle, { marginTop: spacing.s, color: colors.textPrimary }]}>
            {t('home.todaysSummary')}
          </Text>
          <View style={styles.statsGrid}>
            {/* Row 1: Weight & Sleep */}
            <View style={styles.statsRow}>
              <TouchableOpacity style={styles.halfWidth} onPress={() => setShowWeightModal(true)}>
                <GlassCard style={styles.statsCard}>
                  <View style={styles.cardContentColumn}>
                    <View style={styles.statsHeader}>
                      <Scale color={colors.primary} size={20} />
                      <Text style={[styles.statsLabel, { color: colors.textPrimary }]}>{t('settings.weight')}</Text>
                    </View>
                    <View style={styles.statsValueContainer}>
                      <Text style={[styles.statsValue, { color: colors.textPrimary }]}>
                        {latestWeight ? convertWeightToUi(latestWeight).value.toFixed(1) : '--'}
                      </Text>
                      <Text style={[styles.statsUnit, { color: colors.textSecondary }]}>
                        {latestWeight ? convertWeightToUi(latestWeight).unit : ''}
                      </Text>
                    </View>
                  </View>
                </GlassCard>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.halfWidth}
                onPress={() => navigation.navigate('Health', { screen: 'HealthHome' })}
              >
                <GlassCard style={styles.statsCard}>
                  <View style={styles.cardContentColumn}>
                    <View style={styles.statsHeader}>
                      <Moon color={colors.primary} size={20} />
                      <Text style={[styles.statsLabel, { color: colors.textPrimary }]}>{t('settings.sleep')}</Text>
                    </View>
                    <View style={styles.statsValueContainer}>
                      <Text style={[styles.statsValue, { color: colors.textPrimary }]}>
                        {latestSleep?.duration_min
                          ? `${Math.floor(latestSleep.duration_min / 60)}h ${latestSleep.duration_min % 60}m`
                          : '--'}
                      </Text>
                      <Text style={[styles.statsUnit, { color: colors.textSecondary }]}></Text>
                    </View>
                  </View>
                </GlassCard>
              </TouchableOpacity>
            </View>

            {/* Row 2: Kcal & Workouts */}
            <View style={styles.statsRow}>
              <TouchableOpacity
                style={styles.halfWidth}
                onPress={() => navigation.navigate('Nutrition', { screen: 'NutritionHome' })}
              >
                <GlassCard style={styles.statsCard}>
                  <View style={styles.cardContentColumn}>
                    <View style={styles.statsHeader}>
                      <Flame color={colors.primary} size={20} />
                      <Text style={[styles.statsLabel, { color: colors.textPrimary }]}>
                        {convertEnergyToUi(0).unit}
                      </Text>
                    </View>
                    <View style={styles.statsValueContainer}>
                      <Text style={[styles.statsValue, { color: colors.textPrimary }]}>
                        {convertEnergyToUi(totals.kcal || 0).value}
                      </Text>
                      <Text style={[styles.statsUnit, { color: colors.textSecondary }]}>
                        / {convertEnergyToUi(targets.kcal || 2000).value} {convertEnergyToUi(0).unit}
                      </Text>
                    </View>
                  </View>
                </GlassCard>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.halfWidth}
                onPress={() => navigation.navigate('Training', { screen: 'TrainingHome' })}
              >
                <GlassCard style={styles.statsCard}>
                  <View style={styles.cardContentColumn}>
                    <View style={styles.statsHeader}>
                      <CheckCircle color={colors.primary} size={20} />
                      <Text style={[styles.statsLabel, { color: colors.textPrimary }]}>{t('home.workouts')}</Text>
                    </View>
                    <View style={styles.statsValueContainer}>
                      <Text style={[styles.statsValue, { color: colors.textPrimary }]}>{completedWorkoutsCount}</Text>
                      <Text style={[styles.statsUnit, { color: colors.textSecondary }]}>{t('home.completed')}</Text>
                    </View>
                  </View>
                </GlassCard>
              </TouchableOpacity>
            </View>
          </View>

          {/* Agenda de Hoy */}
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>{t('home.todaysAgenda')}</Text>
          <View style={styles.agendaContainer}>
            {/* Next Meal Item */}
            <TouchableOpacity onPress={() => navigation.navigate('Nutrition', { screen: 'NutritionHome' })}>
              <GlassCard style={styles.agendaItem}>
                <View style={styles.cardContentRow}>
                  <View style={styles.agendaIconContainer}>
                    <View
                      style={[
                        styles.timeIndicator,
                        {
                          backgroundColor: isNextMealLogged ? colors.success : colors.warning,
                          borderColor: colors.surface, // Kept surface as it's likely intended to blend/cutout
                        },
                      ]}
                    />
                    <Utensils color={colors.textPrimary} size={24} />
                  </View>
                  <View style={styles.agendaContent}>
                    <Text style={[styles.agendaTitle, { color: colors.textPrimary }]}>
                      {t('home.nextMeal')}
                      {t(nextMealLabel)}
                    </Text>
                    <Text style={[styles.agendaSubtitle, { color: colors.textSecondary }]}>
                      {isNextMealLogged
                        ? t('home.logged')
                        : `${t('home.notLogged')} ${convertEnergyToUi(remainingKcal > 0 ? remainingKcal : 0).value} ${convertEnergyToUi(0).unit} ${t('home.remaining')}`}
                    </Text>
                  </View>
                  <ChevronRight color={colors.textSecondary} size={20} />
                </View>
              </GlassCard>
            </TouchableOpacity>

            {/* Workout Agenda Item */}
            {activeTodayWorkout || pendingWorkout ? (
              <TouchableOpacity onPress={handleAgendaWorkout}>
                <GlassCard style={styles.agendaItem}>
                  <View style={styles.cardContentRow}>
                    <View style={styles.agendaIconContainer}>
                      {activeTodayWorkout ? (
                        getActiveWorkoutVisuals(activeTodayWorkout).icon
                      ) : pendingWorkout ? (
                        getWorkoutVisuals(pendingWorkout).icon
                      ) : (
                        <Dumbbell color={colors.textPrimary} size={24} />
                      )}
                    </View>
                    <View style={styles.agendaContent}>
                      <Text style={[styles.agendaTitle, { color: colors.textPrimary }]}>
                        {activeTodayWorkout
                          ? activeTodayWorkout.name || t('home.scheduledWorkout')
                          : pendingWorkout?.workout_templates?.base_name ||
                            pendingWorkout?.endurance_workout_templates?.base_name ||
                            t('home.scheduledWorkout')}
                      </Text>
                      <Text style={[styles.agendaSubtitle, { color: colors.textSecondary }]}>
                        {activeTodayWorkout ? t('home.inProgressTodayAction') : t('home.scheduledTodayAction')}
                      </Text>
                    </View>
                    <View style={[styles.startButton, { backgroundColor: colors.primary }]}>
                      <Play fill={colors.white} size={14} color={colors.white} />
                    </View>
                  </View>
                </GlassCard>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity onPress={() => navigation.navigate('Training', { screen: 'TrainingHome' })}>
                <GlassCard style={styles.agendaItem}>
                  <View style={styles.cardContentRow}>
                    <View style={[styles.agendaIconContainer, { backgroundColor: 'rgba(0,0,0,0.03)' }]}>
                      <Dumbbell color={colors.textPrimary} size={24} />
                    </View>
                    <View style={styles.agendaContent}>
                      <Text style={[styles.agendaTitle, { color: colors.textPrimary }]}>{t('home.training')}</Text>
                      <Text style={[styles.agendaSubtitle, { color: colors.textSecondary }]}>
                        {completedWorkoutsCount > 0 ? t('home.goodJob') : t('home.nothingPending')}
                      </Text>
                    </View>
                    <ChevronRight color={colors.textSecondary} size={20} />
                  </View>
                </GlassCard>
              </TouchableOpacity>
            )}
          </View>
        </ScrollView>

        {/* Direct Weight Log Modal */}
        <WeightLogModal visible={showWeightModal} onClose={() => setShowWeightModal(false)} />
      </SafeAreaView>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: spacing.m,
    paddingBottom: 100, // Ensure space for TabBar
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.l,
    marginTop: spacing.s,
  },
  headerTitle: {
    ...typography.h2,
    marginBottom: 2,
  },
  headerDate: {
    ...typography.body,
    textTransform: 'capitalize',
  },
  sectionTitle: {
    ...typography.h3,
    marginBottom: spacing.m,
  },
  statsGrid: {
    gap: spacing.m,
    marginBottom: spacing.l,
  },
  statsRow: {
    flexDirection: 'row',
    gap: spacing.m,
  },
  halfWidth: {
    flex: 1,
  },
  statsCard: {
    padding: spacing.m,
    borderRadius: borderRadius.l,
    height: 100, // Fixed height for consistency
  },
  cardContentColumn: {
    flex: 1,
    justifyContent: 'space-between',
  },
  statsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s,
  },
  statsLabel: {
    ...typography.h4,
    fontWeight: '600',
  },
  statsValueContainer: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
  },
  statsValue: {
    ...typography.h1,
    fontSize: 28, // Slightly smaller than massive header
  },
  statsUnit: {
    ...typography.caption,
    marginBottom: 4, // Align baseline
  },

  // Agenda
  agendaContainer: {
    gap: spacing.m,
  },
  agendaItem: {
    padding: spacing.m,
    minHeight: 80,
  },
  cardContentRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.m,
  },
  agendaIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24, // Circle
    backgroundColor: 'rgba(0,0,0,0.03)', // subtle bg
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  timeIndicator: {
    position: 'absolute',
    top: 2,
    right: 2,
    width: 8,
    height: 8,
    borderRadius: 4,
    borderWidth: 1,
  },
  agendaContent: {
    flex: 1,
    justifyContent: 'center',
  },
  agendaTitle: {
    ...typography.h4,
    marginBottom: 2,
  },
  agendaSubtitle: {
    ...typography.caption,
  },
  startButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
