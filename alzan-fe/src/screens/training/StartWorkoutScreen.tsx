import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { TrainingScreenNavigationProp, TrainingStackParamList } from '../../types/navigation.types';
import { GlassCard } from '../../components/GlassCard';
import { LiquidGlassFooter } from '../../components/common/LiquidGlassFooter';
import { spacing, typography } from '../../theme';
import { useTrainingStyles } from '../../hooks/useTrainingStyles';
import { ActiveGymSessionAlreadyStartedError, useActiveWorkout } from '../../hooks/useActiveWorkout';
import { Play, Calendar, Infinity as InfinityIcon } from 'lucide-react-native';
import { supabase } from '../../lib/supabaseClient';
import DateTimePicker from '@react-native-community/datetimepicker';
import { LinearGradient } from 'expo-linear-gradient';
import { Alert } from '../../components/common/Alert';
import { useTranslation } from 'react-i18next';
import { getLocaleTag } from '../../i18n/dateLocale';
import {
  getCurrentAppLocale,
  getLocalizedExerciseDescription,
  getLocalizedExerciseName,
} from '../../services/localization';
import { Exercise, WorkoutTemplate, WorkoutTemplateExercise } from '../../types/requests.types';

interface TemplateExerciseRow extends WorkoutTemplateExercise {
  exercise:
    | (Exercise & {
        base_name_es?: string | null;
        base_name_en?: string | null;
        description_es?: string | null;
        description_en?: string | null;
      })
    | null;
}

interface WorkoutTemplateWithExercises extends WorkoutTemplate {
  exercises: Array<
    TemplateExerciseRow & {
      exercise:
        | (Exercise & {
            base_name_es?: string | null;
            base_name_en?: string | null;
            description_es?: string | null;
            description_en?: string | null;
          })
        | null;
    }
  >;
}

export const StartWorkoutScreen = () => {
  const { t } = useTranslation();
  const languageCode = getCurrentAppLocale();
  const { styles: dynamicStyles, colors: themeColors, isDark } = useTrainingStyles();
  const navigation = useNavigation<TrainingScreenNavigationProp>();
  const route = useRoute<RouteProp<TrainingStackParamList, 'StartWorkout'>>();
  const { templateId, date, planId } = route.params;

  const { startSession } = useActiveWorkout();
  const [isLoading, setIsLoading] = useState(true);
  const [template, setTemplate] = useState<WorkoutTemplateWithExercises | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date>(date ? new Date(date) : new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);

  // Custom Floating Tab Bar Dimensions (from TabNavigator.tsx)
  const FLOATING_TAB_BAR_HEIGHT = 75;
  const FLOATING_TAB_BAR_OFFSET = 30;

  // Total occupied height by tab bar + Spacing
  const footerHeight = 90; // The modal/footer height itself
  const totalTabBarHeight = FLOATING_TAB_BAR_HEIGHT + FLOATING_TAB_BAR_OFFSET;
  const contentBottomPadding = totalTabBarHeight + footerHeight + spacing.m;

  useEffect(() => {
    fetchTemplate();
  }, [templateId, languageCode]);

  const fetchTemplate = async (): Promise<WorkoutTemplateWithExercises | null> => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('workout_templates')
        .select(
          `
            *,
            exercises:workout_template_exercises(
              *,
              exercise:exercises(
                *
              )
            )
          `,
        )
        .eq('id', templateId)
        .single()
        .returns<WorkoutTemplateWithExercises>();
      if (error) throw error;
      const localizedTemplate = data
        ? {
            ...data,
            exercises: (data.exercises || []).map(item => ({
              ...item,
              exercise: item.exercise
                ? {
                    ...item.exercise,
                    base_name: getLocalizedExerciseName(item.exercise, languageCode),
                    description: getLocalizedExerciseDescription(item.exercise, languageCode),
                  }
                : null,
            })),
          }
        : null;
      if (localizedTemplate) setTemplate(localizedTemplate);
      return localizedTemplate;
    } catch (error) {
      console.error('Error fetching template:', error);
      Alert.alert(t('common.error'), t('training.loadRoutineError'));
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  const handleStart = async () => {
    if (!template) return;
    setIsLoading(true);
    try {
      let customStartTime = undefined;
      // Use selectedDate instead of route param
      const now = new Date();
      selectedDate.setHours(now.getHours(), now.getMinutes(), now.getSeconds());
      customStartTime = selectedDate.toISOString();

      const session = await startSession.mutateAsync({
        templateId: template.id,
        customStartTime,
        planId, // ✅ Pass planId to link with workout_plan
      });
      navigation.replace('ActiveWorkout', { sessionId: session.id });
    } catch (e) {
      if (e instanceof ActiveGymSessionAlreadyStartedError) {
        Alert.alert(t('training.activeGymSessionTitle'), t('training.activeGymSessionMessage'), [
          {
            text: t('training.resume'),
            onPress: () => navigation.replace('ActiveWorkout', { sessionId: e.sessionId }),
          },
        ]);
        setIsLoading(false);
        return;
      }

      console.error(e);
      Alert.alert(t('common.error'), t('training.startSessionError'));
      setIsLoading(false);
    }
  };

  const updateWorkoutPlanDate = async (newDate: Date) => {
    if (!planId) return;

    try {
      const formattedDate = newDate.toISOString().split('T')[0]; // YYYY-MM-DD
      const { error } = await supabase.from('workout_plans').update({ planned_date: formattedDate }).eq('id', planId);

      if (error) throw error;
    } catch (error) {
      console.error('Error updating workout plan date:', error);
      Alert.alert(t('common.error'), t('training.updateDateError'));
    }
  };

  const [tempDate, setTempDate] = useState<Date>(selectedDate);

  const handleDateChange = (_event: unknown, newDate?: Date) => {
    if (newDate) {
      setTempDate(newDate);
    }
  };

  const handleConfirmDate = () => {
    setShowDatePicker(false);
    setSelectedDate(tempDate);
    updateWorkoutPlanDate(tempDate);
  };

  const handleCancelDate = () => {
    setShowDatePicker(false);
    setTempDate(selectedDate); // Reset to current selected
  };

  const getExerciseDisplayName = (exercise: unknown) => {
    if (!exercise || typeof exercise !== 'object') return '';
    if ('base_name' in exercise && typeof exercise.base_name === 'string') {
      return exercise.base_name;
    }
    return '';
  };

  // Sync tempDate when opening
  useEffect(() => {
    if (showDatePicker) {
      setTempDate(selectedDate);
    }
  }, [showDatePicker]);

  const orderedExercises = useMemo(() => {
    const routineExercises = template?.exercises || [];
    return [...routineExercises].sort((a, b) => a.order_index - b.order_index);
  }, [template?.exercises]);

  const isConnectorActive = (connectorIndex: number) => {
    const currentExercise = orderedExercises[connectorIndex];
    const nextExercise = orderedExercises[connectorIndex + 1];
    if (!currentExercise || !nextExercise) return false;
    return currentExercise.superset_next_exercise_id === nextExercise.id;
  };

  const isExerciseInSuperset = (exerciseIndex: number) =>
    isConnectorActive(exerciseIndex - 1) || isConnectorActive(exerciseIndex);

  if (isLoading) {
    return (
      <SafeAreaView style={[styles.container, styles.center, { backgroundColor: themeColors.background }]}>
        <ActivityIndicator color={themeColors.primary} size="large" />
      </SafeAreaView>
    );
  }

  // Format workout title and subtitle based on context
  const workoutTitle = template?.base_name || t('training.newWorkout');
  const workoutSubtitle = template?.description || t('training.routines');
  const setsLabel = t('training.sets').replace('•', '').trim();
  const repsLabel = t('training.repsColon').replace(':', '').trim();

  const formattedDate = selectedDate.toLocaleDateString(getLocaleTag(), {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
  });

  return (
    <LinearGradient colors={dynamicStyles.gradientColors} style={styles.container}>
      {/* Header - iOS Style */}
      <SafeAreaView edges={['top']}>
        <View style={[styles.header, { borderBottomColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)' }]}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={[styles.cancelButton, dynamicStyles.secondaryButton]}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Text style={[styles.cancelText, { color: themeColors.primary }]}>{t('common.cancel')}</Text>
          </TouchableOpacity>

          <Text style={[styles.headerTitle, dynamicStyles.title]}>{t('training.preview')}</Text>

          {/* Spacer for balance */}
          <View style={styles.headerSpacer} />
        </View>
      </SafeAreaView>

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: contentBottomPadding }]}>
        {/* Hero Section */}
        <View style={styles.heroSection}>
          <Text style={[styles.title, dynamicStyles.title]}>{workoutTitle}</Text>
          <Text style={[styles.subtitle, { color: themeColors.textSecondary }]}>{workoutSubtitle}</Text>

          <TouchableOpacity
            style={[styles.dateContainer, { marginTop: spacing.s }]}
            onPress={() => setShowDatePicker(true)}
            activeOpacity={0.7}
          >
            <Calendar size={16} color={themeColors.primary} style={{ marginRight: 6 }} />
            <Text style={{ color: themeColors.primary, fontWeight: '600', fontSize: 16, textTransform: 'capitalize' }}>
              {formattedDate}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, dynamicStyles.sectionTitle]}>{t('training.exercises')}</Text>
          {orderedExercises.map((item, index: number) => {
            const inSuperset = isExerciseInSuperset(index);
            const connectorActive = isConnectorActive(index);
            const isWarmupExercise = !!item.is_warmup;

            return (
              <React.Fragment key={item.id || index}>
                <GlassCard
                  style={[
                    styles.exerciseCard,
                    dynamicStyles.glassCard,
                    inSuperset && {
                      borderColor: themeColors.primary + '80',
                      backgroundColor: themeColors.primary + '10',
                    },
                    isWarmupExercise && {
                      borderColor: themeColors.warning + '80',
                      backgroundColor: themeColors.warning + '10',
                    },
                  ]}
                >
                  <View style={styles.exerciseHeader}>
                    <Text style={[styles.exerciseName, dynamicStyles.title]}>
                      {index + 1}. {getExerciseDisplayName(item.exercise)}
                    </Text>
                  </View>
                  <Text style={[styles.exerciseDetails, { color: themeColors.textSecondary }]}>
                    {(item?.target_sets || 3) +
                      ` ${setsLabel} · ${item?.target_reps_min ?? item?.target_reps_max ?? 8} ${repsLabel}`}
                  </Text>
                  {isWarmupExercise && (
                    <View
                      style={[
                        styles.warmupBadge,
                        styles.warmupBadgeCentered,
                        {
                          borderColor: themeColors.warning + '55',
                          backgroundColor: themeColors.warning + '1A',
                        },
                      ]}
                    >
                      <Text style={[styles.warmupBadgeText, { color: themeColors.warning }]}>
                        {t('training.warmup')}
                      </Text>
                    </View>
                  )}
                </GlassCard>

                {index < orderedExercises.length - 1 && (
                  <View style={styles.supersetConnectorRow}>
                    <View
                      style={[
                        styles.supersetConnectorLine,
                        {
                          backgroundColor: connectorActive
                            ? themeColors.primary + 'A6'
                            : isDark
                              ? 'rgba(255,255,255,0.16)'
                              : 'rgba(0,0,0,0.12)',
                        },
                      ]}
                    />
                    {connectorActive && (
                      <View style={[styles.supersetConnectorBadge, { backgroundColor: themeColors.background }]}>
                        <InfinityIcon size={9} color={themeColors.primary + 'CC'} />
                      </View>
                    )}
                  </View>
                )}
              </React.Fragment>
            );
          })}
        </View>
      </ScrollView>

      <View style={[styles.footer, { bottom: 125 }]}>
        <LiquidGlassFooter style={styles.glassFooter} borderRadius={30}>
          <TouchableOpacity style={styles.startButton} onPress={handleStart} disabled={startSession.isPending}>
            <Text style={[styles.startButtonText, { color: themeColors.textPrimary }]}>
              {startSession.isPending ? t('training.starting') : t('training.start')}
            </Text>
            <Play size={20} color={themeColors.textPrimary} fill={themeColors.textPrimary} />
          </TouchableOpacity>
        </LiquidGlassFooter>
      </View>

      {/* Date Picker Modal for iOS/Android */}
      {showDatePicker && (
        <Modal transparent animationType="fade" visible={showDatePicker} onRequestClose={handleCancelDate}>
          <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={handleCancelDate}>
            <View style={[styles.pickerContainer, { backgroundColor: isDark ? '#1C1C1E' : '#FFFFFF' }]}>
              <View style={styles.pickerHeader}>
                <TouchableOpacity onPress={handleCancelDate}>
                  <Text style={[styles.pickerButton, { color: themeColors.textSecondary }]}>{t('common.cancel')}</Text>
                </TouchableOpacity>
                <Text style={[styles.pickerTitle, { color: themeColors.textPrimary }]}>{t('training.selectDate')}</Text>
                <TouchableOpacity onPress={handleConfirmDate}>
                  <Text style={[styles.pickerButton, { color: themeColors.primary, fontWeight: '700' }]}>
                    {t('common.done')}
                  </Text>
                </TouchableOpacity>
              </View>
              <DateTimePicker
                value={tempDate}
                mode="date"
                display="spinner"
                onChange={handleDateChange}
                maximumDate={new Date()}
                locale={getLocaleTag()}
                textColor={themeColors.textPrimary}
              />
            </View>
          </TouchableOpacity>
        </Modal>
      )}
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { justifyContent: 'center', alignItems: 'center' },

  // Header Styles
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.m,
    paddingVertical: spacing.m,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(0,0,0,0.1)',
  },
  cancelButton: {
    paddingHorizontal: spacing.m,
    paddingVertical: spacing.s,
    backgroundColor: 'rgba(0, 122, 255, 0.1)',
    borderRadius: 20,
  },
  cancelText: {
    ...typography.body,
    fontSize: 16,
    fontWeight: '600',
  },
  headerTitle: {
    ...typography.h4,
    fontWeight: '600',
  },
  headerSpacer: {
    width: 90, // Same width as cancel button for balance
  },

  // Content Styles
  content: { padding: spacing.m },
  heroSection: {
    marginBottom: spacing.l,
  },
  dateContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  title: { ...typography.h2, marginBottom: spacing.xs, textTransform: 'capitalize' },
  subtitle: { ...typography.body },
  section: { marginBottom: spacing.l },
  sectionTitle: { ...typography.h3, marginBottom: spacing.m },
  exerciseCard: { padding: spacing.m, marginBottom: spacing.s, position: 'relative' },
  exerciseHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.s,
  },
  exercisesCard: { padding: spacing.m, marginBottom: spacing.m },
  row: { marginBottom: spacing.s },
  exerciseName: { ...typography.h4, marginBottom: 2, flex: 1, paddingRight: 110 },
  exerciseDetails: { ...typography.caption },
  warmupBadge: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: spacing.s,
    paddingVertical: 4,
  },
  warmupBadgeCentered: {
    position: 'absolute',
    right: spacing.m,
    top: '50%',
    transform: [{ translateY: -13 }],
  },
  warmupBadgeText: {
    ...typography.caption,
    fontWeight: '700',
    fontSize: 11,
  },
  supersetConnectorRow: {
    alignItems: 'center',
    marginTop: 0,
    marginBottom: spacing.s,
    justifyContent: 'center',
  },
  supersetConnectorLine: {
    width: '88%',
    height: 2,
    borderRadius: 999,
  },
  supersetConnectorBadge: {
    position: 'absolute',
    width: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footer: {
    position: 'absolute',
    left: spacing.l,
    right: spacing.l,
    zIndex: 100,
  },
  glassFooter: {
    borderRadius: 30,
  },
  startButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.l,
    gap: 10,
  },
  startButtonText: { ...typography.h3, fontWeight: '700' },

  // Date Picker Modal Styles
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
  },
  pickerContainer: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: spacing.l, // Safety padding for bottom area
  },
  pickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.m,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(0,0,0,0.1)',
  },
  pickerTitle: {
    ...typography.h4,
    fontWeight: '600',
  },
  pickerButton: {
    fontSize: 16,
    padding: spacing.s,
  },
});
