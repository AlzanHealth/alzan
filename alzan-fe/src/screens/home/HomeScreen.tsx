import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { HomeScreenNavigationProp, TabParamList } from '../../types/navigation.types';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Play,
  Utensils,
  Scale,
  ChevronRight,
  CheckCircle,
  Flame,
  Dumbbell,
  Moon,
  Footprints,
  Settings,
  LucideIcon,
} from 'lucide-react-native';
import { useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';

import { spacing, borderRadius, typography } from '../../theme';
import { useTheme } from '../../context/ThemeContext';
import { GlassCard } from '../../components/GlassCard';
import { useDayNutrition } from '../../modules/nutrition/hooks/useDayNutritionLogic';
import { MEAL_TYPES, MEAL_TYPE_LABELS } from '../../modules/nutrition/constants';
import { WeightLogModal } from '../../components/WeightLogModal';
import { SportIcon } from '../../components/icons/SportIcon';
import { SPORT_COLORS } from '../../theme/sportColors';
import { useUnitConversion } from '../../hooks/useUnitConversion';
import { useSettingsNotifications } from '../../hooks/settings/useSettingsNotifications';
import { useHomeSettings } from '../../hooks/settings/useHomeSettings';
import { HomeSummaryActiveWorkout, HomeSummaryScheduledWorkout, useHomeSummary } from '../../hooks/useHomeSummary';
import { usePreferencesContext } from '../../context/PreferencesContext';
import { getMealTypeForTime } from '../../modules/nutrition/services/nextMealPlanner';

import { useHealthInsights } from '../../modules/health/hooks/useHealthInsights';
import { useTodaySteps } from '../../modules/health/hooks/useSteps';
import { useHomeCards } from '../../hooks/settings/useHomeCards';
import { HomeCardKey } from '../../constants/homeCards';
import { getLocaleTag } from '../../i18n/dateLocale';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { useTranslation } from 'react-i18next';
import { formatLocalizedDate } from '../../i18n/dateLocale';

export const HomeScreen = () => {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const navigation = useNavigation<HomeScreenNavigationProp>();
  const queryClient = useQueryClient();

  const { convertWeightToUi, convertEnergyToUi } = useUnitConversion();
  const { settings: notifSettings, refetch: refetchSettings } = useSettingsNotifications(); // Get settings
  const { preferences } = usePreferencesContext();
  const { homeMode, homePrimaryAction } = useHomeSettings();
  const { data: homeSummary } = useHomeSummary();

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
  const completedWorkoutsCount = homeSummary?.completedWorkoutsCount ?? 0;
  const health = homeSummary?.health ?? null;
  const scheduledWorkouts = homeSummary?.scheduledWorkouts ?? [];
  const activeTodayWorkout = homeSummary?.activeTodayWorkout ?? null;
  const weeklySummary = homeSummary?.weeklySummary;
  const { latestSleep } = useHealthInsights();
  const { data: todaySteps } = useTodaySteps();
  const { homeCards } = useHomeCards();
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
    if (notifSettings?.meals) {
      const resolveMealType = () =>
        getMealTypeForTime(notifSettings.meals, preferences?.nutrition_prefs?.enabled_meals, new Date(), {
          cutoffHours: preferences?.nutrition_prefs?.next_meal_cutoff_hours,
        });

      setNextMealType(resolveMealType());

      const interval = setInterval(() => {
        setNextMealType(resolveMealType());
      }, 60000);
      return () => clearInterval(interval);
    }
  }, [notifSettings, preferences?.nutrition_prefs?.enabled_meals]);

  // Get Next Meal Status
  const nextMealItems = meals ? meals.filter(m => m.mealType === nextMealType) : [];
  const isNextMealLogged = nextMealItems.some(m => m.status === 'done_as_planned' || m.status === 'done_with_changes');
  const nextMealLabel = MEAL_TYPE_LABELS[nextMealType] || 'settings.lunch';

  const remainingKcal = (targets.kcal || 2000) - (totals.kcal || 0);
  const todayDateString = format(new Date(), 'yyyy-MM-dd');

  // Summary card definitions, keyed so Home can render the user-selected set.
  const summaryCardConfig: Record<
    HomeCardKey,
    { icon: LucideIcon; label: string; value: string; unit: string; onPress: () => void }
  > = {
    weight: {
      icon: Scale,
      label: t('settings.weight'),
      value: latestWeight ? convertWeightToUi(latestWeight).value.toFixed(1) : '--',
      unit: latestWeight ? convertWeightToUi(latestWeight).unit : '',
      onPress: () => setShowWeightModal(true),
    },
    sleep: {
      icon: Moon,
      label: t('settings.sleep'),
      value: latestSleep?.total_sleep_min
        ? `${Math.floor(latestSleep.total_sleep_min / 60)}h ${latestSleep.total_sleep_min % 60}m`
        : '--',
      unit: '',
      onPress: () => navigation.navigate('Health', { screen: 'HealthHome' }),
    },
    kcal: {
      icon: Flame,
      label: convertEnergyToUi(0).unit,
      value: `${convertEnergyToUi(totals.kcal || 0).value}`,
      unit: `/ ${convertEnergyToUi(targets.kcal || 2000).value} ${convertEnergyToUi(0).unit}`,
      onPress: () => navigation.navigate('Nutrition', { screen: 'NutritionHome' }),
    },
    steps: {
      icon: Footprints,
      label: t('home.steps'),
      value: todaySteps != null ? todaySteps.toLocaleString(getLocaleTag()) : '--',
      unit: t('steps.unit'),
      onPress: () => navigation.navigate('Health', { screen: 'StepsStatistics', params: { fromHome: true } }),
    },
    workouts: {
      icon: CheckCircle,
      label: t('home.workouts'),
      value: `${completedWorkoutsCount}`,
      unit: t('home.completed'),
      onPress: () => navigation.navigate('Training', { screen: 'TrainingHome' }),
    },
  };

  const visibleCards = homeCards.map(key => ({ key, ...summaryCardConfig[key] }));

  const handleResumeWorkout = () => {
    if (!activeTodayWorkout) return;

    navigation.navigate('Training', {
      screen: 'ActiveWorkout',
      params: { sessionId: activeTodayWorkout.id },
    });
  };

  const handleStartPendingWorkout = () => {
    if (!pendingWorkout) return;
    const plannedDate = pendingWorkout.planned_date || new Date().toISOString();

    if (pendingWorkout.gym_template_id) {
      navigation.navigate('Training', {
        screen: 'StartWorkout',
        params: {
          templateId: pendingWorkout.gym_template_id,
          planId: pendingWorkout.id,
          date: plannedDate,
        },
      });
    } else if (pendingWorkout.endurance_template_id) {
      navigation.navigate('Training', {
        screen: 'EnduranceSessionForm',
        params: {
          templateId: pendingWorkout.endurance_template_id,
          date: plannedDate,
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

  const handleAddMeal = () => {
    navigation.navigate('Nutrition', {
      screen: 'MealLogForm',
      params: {
        date: todayDateString,
        isExtra: true,
        mealItem: { mealType: nextMealType },
      },
    });
  };

  const handlePrimaryAction = () => {
    switch (homePrimaryAction) {
      case 'add_meal':
        handleAddMeal();
        return;
      case 'log_weight':
        setShowWeightModal(true);
        return;
      case 'open_nutrition':
        navigation.navigate('Nutrition', { screen: 'NutritionHome' });
        return;
      case 'smart_workout':
        if (activeTodayWorkout || pendingWorkout) {
          handleAgendaWorkout();
          return;
        }
        navigation.navigate('Training', { screen: 'TrainingHome' });
    }
  };

  const primaryActionConfig: { icon: LucideIcon; title: string; subtitle: string } = (() => {
    switch (homePrimaryAction) {
      case 'add_meal':
        return {
          icon: Utensils,
          title: t('home.primaryActionAddMeal'),
          subtitle: `${t('home.logMeal')} ${t(nextMealLabel)}`,
        };
      case 'log_weight':
        return {
          icon: Scale,
          title: t('home.primaryActionLogWeight'),
          subtitle: t('home.primaryActionLogWeightSubtitle'),
        };
      case 'open_nutrition':
        return {
          icon: Utensils,
          title: t('home.primaryActionOpenNutrition'),
          subtitle: t('home.primaryActionOpenNutritionSubtitle'),
        };
      case 'smart_workout':
        if (activeTodayWorkout) {
          return {
            icon: Play,
            title: t('home.primaryActionResumeWorkout'),
            subtitle: t('home.inProgressTodayAction'),
          };
        }
        if (pendingWorkout) {
          return {
            icon: Play,
            title: t('home.primaryActionStartWorkout'),
            subtitle: t('home.scheduledTodayAction'),
          };
        }
        return {
          icon: Dumbbell,
          title: t('home.primaryActionOpenTraining'),
          subtitle: t('home.primaryActionOpenTrainingSubtitle'),
        };
    }
  })();

  const PrimaryActionIcon = primaryActionConfig.icon;
  const weeklyStats = [
    {
      label: t('home.weeklyTraining'),
      value: `${weeklySummary?.workoutsCount ?? 0}`,
      unit: t('home.weeklyWorkoutsUnit'),
    },
    {
      label: t('home.weeklyNutrition'),
      value: `${weeklySummary?.nutritionDays ?? 0}`,
      unit: t('home.weeklyDaysUnit'),
    },
    {
      label: t('home.weeklyHealth'),
      value: `${weeklySummary?.healthDays ?? 0}`,
      unit: t('home.weeklyDaysUnit'),
    },
  ];

  // Helper for Icon and Color
  const getWorkoutVisuals = (workout: HomeSummaryScheduledWorkout) => {
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

  const getActiveWorkoutVisuals = (session: NonNullable<HomeSummaryActiveWorkout>) => {
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

          {homeMode !== 'compact' && (
            <TouchableOpacity onPress={handlePrimaryAction} activeOpacity={0.78}>
              <GlassCard style={styles.primaryActionCard}>
                <View style={styles.cardContentRow}>
                  <View style={[styles.primaryActionIcon, { backgroundColor: colors.primary }]}>
                    <PrimaryActionIcon color={colors.white} size={22} />
                  </View>
                  <View style={styles.agendaContent}>
                    <Text style={[styles.primaryActionTitle, { color: colors.textPrimary }]}>
                      {primaryActionConfig.title}
                    </Text>
                    <Text style={[styles.agendaSubtitle, { color: colors.textSecondary }]}>
                      {primaryActionConfig.subtitle}
                    </Text>
                  </View>
                  <ChevronRight color={colors.textSecondary} size={20} />
                </View>
              </GlassCard>
            </TouchableOpacity>
          )}

          {/* Daily Snapshot */}
          <Text style={[styles.sectionTitle, { marginTop: spacing.s, color: colors.textPrimary }]}>
            {t('home.todaysSummary')}
          </Text>
          <View style={styles.statsGrid}>
            {[0, 2].map(rowStart => (
              <View style={styles.statsRow} key={`stats-row-${rowStart}`}>
                {visibleCards.slice(rowStart, rowStart + 2).map(card => {
                  const Icon = card.icon;
                  return (
                    <TouchableOpacity key={card.key} style={styles.halfWidth} onPress={card.onPress}>
                      <GlassCard style={styles.statsCard}>
                        <View style={styles.cardContentColumn}>
                          <View style={styles.statsHeader}>
                            <Icon color={colors.primary} size={20} />
                            <Text style={[styles.statsLabel, { color: colors.textPrimary }]}>{card.label}</Text>
                          </View>
                          <View style={styles.statsValueContainer}>
                            <Text style={[styles.statsValue, { color: colors.textPrimary }]}>{card.value}</Text>
                            {!!card.unit && (
                              <Text style={[styles.statsUnit, { color: colors.textSecondary }]}>{card.unit}</Text>
                            )}
                          </View>
                        </View>
                      </GlassCard>
                    </TouchableOpacity>
                  );
                })}
              </View>
            ))}
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
                      {t('home.logMeal')} {t(nextMealLabel)}
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

          {/* Weekly Balance */}
          <GlassCard style={[styles.weeklyCard, { marginTop: spacing.l }]}>
            <View style={styles.weeklyHeader}>
              <Text style={[styles.weeklyTitle, { color: colors.textPrimary }]}>{t('home.weeklyBalance')}</Text>
              <Text style={[styles.weeklySubtitle, { color: colors.textSecondary }]}>
                {t('home.weeklyBalanceSubtitle')}
              </Text>
            </View>
            <View style={styles.weeklyStatsRow}>
              {weeklyStats.map(item => (
                <View key={item.label} style={styles.weeklyStat}>
                  <Text style={[styles.weeklyValue, { color: colors.textPrimary }]}>{item.value}</Text>
                  <Text style={[styles.weeklyUnit, { color: colors.textSecondary }]}>{item.unit}</Text>
                  <Text style={[styles.weeklyLabel, { color: colors.textSecondary }]}>{item.label}</Text>
                </View>
              ))}
            </View>
          </GlassCard>
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
  primaryActionCard: {
    padding: spacing.m,
    borderRadius: borderRadius.l,
    marginBottom: spacing.m,
    minHeight: 76,
  },
  primaryActionCardCompact: {
    minHeight: 64,
    paddingVertical: spacing.s,
  },
  primaryActionIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryActionTitle: {
    ...typography.h4,
    marginBottom: 2,
  },
  weeklyCard: {
    padding: spacing.m,
    borderRadius: borderRadius.l,
    marginBottom: spacing.l,
  },
  weeklyCardCompact: {
    paddingVertical: spacing.s,
    marginBottom: spacing.m,
  },
  weeklyHeader: {
    marginBottom: spacing.m,
  },
  weeklyTitle: {
    ...typography.h4,
    fontWeight: '700',
  },
  weeklySubtitle: {
    ...typography.caption,
    marginTop: 2,
  },
  weeklyStatsRow: {
    flexDirection: 'row',
    gap: spacing.s,
  },
  weeklyStat: {
    flex: 1,
  },
  weeklyValue: {
    ...typography.h2,
    fontWeight: '800',
  },
  weeklyUnit: {
    ...typography.caption,
    marginTop: -2,
  },
  weeklyLabel: {
    ...typography.caption,
    fontWeight: '700',
    marginTop: 4,
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
  statsCardCompact: {
    height: 86,
    padding: spacing.s,
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
  statsValueCompact: {
    fontSize: 23,
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
  agendaItemCompact: {
    paddingVertical: spacing.s,
    minHeight: 68,
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
