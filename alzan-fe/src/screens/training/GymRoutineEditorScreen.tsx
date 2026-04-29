import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  ScrollView,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
  InputAccessoryView,
  Button,
  DeviceEventEmitter,
  Animated,
  Easing,
  Modal,
  LayoutAnimation,
  UIManager,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { TrainingScreenNavigationProp, TrainingStackParamList } from '../../types/navigation.types';
import { LinearGradient } from 'expo-linear-gradient';
import { GlassCard } from '../../components/GlassCard';
import { spacing, borderRadius } from '../../theme';
import { useTrainingStyles } from '../../hooks/useTrainingStyles';
import { RoutineDataExercise, useGymRoutineEditor } from '../../hooks/useGymRoutineEditor';
import { useUserPreferences } from '../../hooks/useUserPreferences';
import { Plus, Trash2, ChevronUp, ChevronDown, Infinity as InfinityIcon, HelpCircle, Check } from 'lucide-react-native';
import { WeekDaySelector } from '../../components/training/WeekDaySelector';
import { useExercisesPRs } from '../../hooks/useExercisesPRs';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../context/AuthContext';
import { format } from 'date-fns';
import { getDateFnsLocale } from '../../i18n/dateLocale';
import { Alert } from '../../components/common/Alert';
import { useTranslation } from 'react-i18next';
import { isTimeBasedExerciseType, getLocalizedExerciseName } from '../../services/localization';
import { ExerciseWithDetails } from '../../types/training';

export const GymRoutineEditorScreen = () => {
  const { t } = useTranslation();
  const { styles: dynamicStyles, colors: themeColors } = useTrainingStyles();
  const { user } = useAuth();
  const navigation = useNavigation<TrainingScreenNavigationProp>();
  const route = useRoute<RouteProp<TrainingStackParamList, 'GymRoutineEditor'>>();
  const { routineId } = route.params || {};
  const inputAccessoryViewID = 'uniqueID'; // Defined for iOS Keyboard button
  const { preferences, toDisplayWeight } = useUserPreferences();

  const { routineData, saveRoutine } = useGymRoutineEditor(routineId);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedDays, setSelectedDays] = useState<number[]>([]);
  const [originalSuggestedDay, setOriginalSuggestedDay] = useState<number | null>(null); // Track original day for edit mode
  const [isRecurring, setIsRecurring] = useState(false);
  const [exercises, setExercises] = useState<RoutineDataExercise[]>([]);
  const [supersetLinks, setSupersetLinks] = useState<Set<number>>(new Set());
  const [helpModalVisible, setHelpModalVisible] = useState(false);
  const [movedExerciseId, setMovedExerciseId] = useState<string | null>(null);
  const [movedExerciseDirection, setMovedExerciseDirection] = useState<'up' | 'down' | null>(null);
  const [deletingExerciseKeys, setDeletingExerciseKeys] = useState<Set<string>>(new Set());
  const moveHighlightAnim = useRef(new Animated.Value(0)).current;
  const deleteExerciseAnimations = useRef<Record<string, Animated.Value>>({});
  const exercisesRef = useRef<RoutineDataExercise[]>([]);
  const exerciseFillAnimations = useRef<Animated.Value[]>([]);
  const connectorFlowAnimations = useRef<Animated.Value[]>([]);
  const supersetTransitionAnimation = useRef<Animated.CompositeAnimation | null>(null);

  const LINE_FLOW_DURATION_MS = 1000;
  const EXERCISE_FILL_DURATION_MS = 900;

  const getExerciseDisplayName = (exercise: unknown) => {
    if (!exercise || typeof exercise !== 'object') return t('training.exercise');
    if ('base_name' in exercise && typeof exercise.base_name === 'string' && exercise.base_name.trim()) {
      return exercise.base_name;
    }
    return t('training.exercise');
  };

  const isTimeBasedExercise = (exercise: unknown) => {
    if (!exercise || typeof exercise !== 'object') return null;
    if ('exercise_type_code' in exercise && typeof exercise.exercise_type_code === 'string') {
      return isTimeBasedExerciseType(exercise.exercise_type_code);
    }
    return null;
  };
  const getExerciseRenderKey = (exercise: RoutineDataExercise, index: number) =>
    exercise.id || `${exercise.exercise_id || 'exercise'}-${index}`;

  const getDeleteExerciseAnimation = (exerciseKey: string) => {
    if (!deleteExerciseAnimations.current[exerciseKey]) {
      deleteExerciseAnimations.current[exerciseKey] = new Animated.Value(0);
    }

    return deleteExerciseAnimations.current[exerciseKey];
  };

  const buildSupersetLinksFromExercises = (routineExercises: RoutineDataExercise[]) => {
    const exerciseIndexById = new Map<string, number>();
    const exerciseIndexesByExerciseId = new Map<string, number[]>();

    routineExercises.forEach((exercise, index) => {
      if (exercise.id) {
        exerciseIndexById.set(exercise.id, index);
      }
      if (exercise.exercise_id) {
        const currentIndexes = exerciseIndexesByExerciseId.get(exercise.exercise_id) || [];
        currentIndexes.push(index);
        exerciseIndexesByExerciseId.set(exercise.exercise_id, currentIndexes);
      }
    });

    const links = new Set<number>();
    routineExercises.forEach((exercise, index) => {
      const nextExerciseId = exercise.superset_next_exercise_id;
      if (!nextExerciseId) return;

      let nextIndex = exerciseIndexById.get(nextExerciseId);

      // Backward compatibility: some legacy rows can reference `exercise_id`
      // instead of workout_template_exercises.id.
      if (nextIndex === undefined) {
        const immediateNext = routineExercises[index + 1];
        if (immediateNext?.exercise_id === nextExerciseId) {
          nextIndex = index + 1;
        } else {
          const candidates = exerciseIndexesByExerciseId.get(nextExerciseId);
          if (candidates && candidates.length === 1) {
            nextIndex = candidates[0];
          }
        }
      }

      if (nextIndex === index + 1) {
        links.add(index);
      }
    });

    return links;
  };

  // Calculate exercise IDs for PR fetching
  const exerciseIds = exercises.map(e => e?.exercise_id).filter(Boolean);
  const { data: prs } = useExercisesPRs(exerciseIds);

  // Populate state when data loads
  useEffect(() => {
    if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
      UIManager.setLayoutAnimationEnabledExperimental(true);
    }
  }, []);

  useEffect(() => {
    if (routineData) {
      setName(routineData.base_name);
      setDescription(routineData.description || '');

      if (routineData.suggested_day_of_week !== null && routineData.suggested_day_of_week !== undefined) {
        setSelectedDays([routineData.suggested_day_of_week]);
        setOriginalSuggestedDay(routineData.suggested_day_of_week); // Store original for comparison
      } else {
        setOriginalSuggestedDay(null);
      }
      setIsRecurring(!!routineData.suggested_day_of_week);
      setExercises(routineData.exercises || []);
      setSupersetLinks(buildSupersetLinksFromExercises(routineData.exercises || []));
    }
  }, [routineData]);

  useEffect(() => {
    exercisesRef.current = exercises;
  }, [exercises]);

  // Listen for selected exercise from Search Screen
  // Listen for selected exercise via Event Emitter to avoid navigation stack issues
  useEffect(() => {
    const subscription = DeviceEventEmitter.addListener('exerciseSelected', (selectedExercise: ExerciseWithDetails) => {
      setExercises(prev => {
        const nextExercise: RoutineDataExercise = {
          id: `tmp-${selectedExercise.id}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          workout_template_id: routineId || '',
          exercise_id: selectedExercise.id,
          order_index: prev.length,
          is_warmup: false,
          target_sets: 3,
          target_reps_min: 8,
          target_reps_max: 8,
          target_weight_kg: null,
          target_rpe: null,
          notes: null,
          rest_seconds: 60,
          user_id: user?.id || null,
          superset_next_exercise_id: null,
          exercise: {
            ...selectedExercise,
            description: selectedExercise.description ?? null,
            exercise_type_code: selectedExercise.exercise_type_code ?? null,
            exercise_type: null,
            base_name: getLocalizedExerciseName(selectedExercise),
          },
        };

        return [...prev, nextExercise];
      });
    });

    return () => {
      subscription.remove();
    };
  }, [routineId, user?.id]);

  const handleAddExercise = () => {
    navigation.navigate('ExerciseSearch', {
      onSelect: (_exerciseId: string) => {}, // Required but not used (using event emitter instead)
      fromScreen: 'GymRoutineEditor',
      routineId,
    });
  };

  const handleRemoveExercise = (index: number) => {
    const targetExercise = exercises[index];
    if (!targetExercise) return;

    const exerciseKey = getExerciseRenderKey(targetExercise, index);
    if (deletingExerciseKeys.has(exerciseKey)) return;

    const deleteAnimation = getDeleteExerciseAnimation(exerciseKey);
    setDeletingExerciseKeys(prev => new Set(prev).add(exerciseKey));

    Animated.timing(deleteAnimation, {
      toValue: 1,
      duration: 220,
      easing: Easing.inOut(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (!finished) return;

      const currentExercises = exercisesRef.current;
      const removalIndex = currentExercises.findIndex((exercise, currentIndex) => {
        return getExerciseRenderKey(exercise, currentIndex) === exerciseKey;
      });
      if (removalIndex === -1) return;

      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setExercises(prev => prev.filter((_, currentIndex) => currentIndex !== removalIndex));
      setSupersetLinks(prev => {
        const next = new Set<number>();
        prev.forEach(linkIndex => {
          if (linkIndex === removalIndex || linkIndex === removalIndex - 1) return;
          next.add(linkIndex > removalIndex ? linkIndex - 1 : linkIndex);
        });
        return next;
      });

      setDeletingExerciseKeys(prev => {
        const next = new Set(prev);
        next.delete(exerciseKey);
        return next;
      });
      deleteExerciseAnimations.current[exerciseKey] = new Animated.Value(0);
    });
  };

  const toggleExerciseWarmup = (exerciseIndex: number) => {
    setExercises(prev => {
      const next = [...prev];
      const target = next[exerciseIndex];
      if (!target) return prev;
      next[exerciseIndex] = {
        ...target,
        is_warmup: !target.is_warmup,
      };
      return next;
    });
  };

  const handleMoveExercise = (index: number, direction: 'up' | 'down') => {
    if (exercises.length < 2) return;

    const getSupersetGroupSorted = (startIndex: number) =>
      getSupersetExerciseIndexes(startIndex, exercises.length).sort((a, b) => a - b);

    const baseOrder = Array.from({ length: exercises.length }, (_, orderIndex) => orderIndex);
    const currentGroup = getSupersetGroupSorted(index);
    if (currentGroup.length === 0) return;

    const firstCurrent = currentGroup[0];
    const lastCurrent = currentGroup[currentGroup.length - 1];

    let reorderedIndexes: number[] | null = null;

    if (direction === 'up') {
      if (firstCurrent <= 0) return;
      const upperGroup = getSupersetGroupSorted(firstCurrent - 1);
      if (upperGroup.length === 0) return;

      const currentSet = new Set(currentGroup);
      const upperSet = new Set(upperGroup);
      const filtered = baseOrder.filter(orderIndex => !currentSet.has(orderIndex) && !upperSet.has(orderIndex));
      const insertIndex = baseOrder.findIndex(orderIndex => upperSet.has(orderIndex));
      if (insertIndex === -1) return;

      reorderedIndexes = [...filtered];
      reorderedIndexes.splice(insertIndex, 0, ...currentGroup, ...upperGroup);
    } else {
      if (lastCurrent >= exercises.length - 1) return;
      const lowerGroup = getSupersetGroupSorted(lastCurrent + 1);
      if (lowerGroup.length === 0) return;

      const currentSet = new Set(currentGroup);
      const lowerSet = new Set(lowerGroup);
      const filtered = baseOrder.filter(orderIndex => !currentSet.has(orderIndex) && !lowerSet.has(orderIndex));
      const insertIndex = baseOrder.findIndex(orderIndex => currentSet.has(orderIndex));
      if (insertIndex === -1) return;

      reorderedIndexes = [...filtered];
      reorderedIndexes.splice(insertIndex, 0, ...lowerGroup, ...currentGroup);
    }

    if (!reorderedIndexes || reorderedIndexes.length !== exercises.length) return;

    const linkedPairs = new Set<string>();
    supersetLinks.forEach(linkIndex => {
      linkedPairs.add(`${linkIndex}|${linkIndex + 1}`);
    });

    const remappedLinks = new Set<number>();
    for (let newIndex = 0; newIndex < reorderedIndexes.length - 1; newIndex += 1) {
      const oldA = reorderedIndexes[newIndex];
      const oldB = reorderedIndexes[newIndex + 1];
      const pairKey = oldA < oldB ? `${oldA}|${oldB}` : `${oldB}|${oldA}`;
      if (linkedPairs.has(pairKey)) {
        remappedLinks.add(newIndex);
      }
    }

    const movedId = exercises[index]?.exercise_id;
    const reorderedExercises = reorderedIndexes.map(orderIndex => exercises[orderIndex]);

    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExercises(reorderedExercises);
    setSupersetLinks(remappedLinks);

    if (movedId) {
      setMovedExerciseId(movedId);
      setMovedExerciseDirection(direction);
      moveHighlightAnim.setValue(0);
      Animated.sequence([
        Animated.timing(moveHighlightAnim, {
          toValue: 1,
          duration: 220,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(moveHighlightAnim, {
          toValue: 0,
          duration: 260,
          easing: Easing.inOut(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start(() => {
        setMovedExerciseId(null);
        setMovedExerciseDirection(null);
      });
    }
  };

  const handleSupersetPress = (connectorIndex: number) => {
    setSupersetLinks(prev => {
      const next = new Set(prev);
      if (next.has(connectorIndex)) {
        next.delete(connectorIndex);
      } else {
        next.add(connectorIndex);
      }
      return next;
    });
  };

  const isConnectorActive = (connectorIndex: number) => supersetLinks.has(connectorIndex);
  const isExerciseInSuperset = (exerciseIndex: number) =>
    isConnectorActive(exerciseIndex - 1) || isConnectorActive(exerciseIndex);

  const getSupersetExerciseIndexes = (startIndex: number, totalExercises: number) => {
    const visited = new Set<number>();
    const pending: number[] = [startIndex];

    while (pending.length > 0) {
      const current = pending.pop();
      if (current === undefined || visited.has(current)) continue;

      visited.add(current);

      const previousExerciseIndex = current - 1;
      const nextExerciseIndex = current + 1;
      const previousConnectorIndex = current - 1;
      const nextConnectorIndex = current;

      if (
        previousExerciseIndex >= 0 &&
        previousConnectorIndex >= 0 &&
        supersetLinks.has(previousConnectorIndex) &&
        !visited.has(previousExerciseIndex)
      ) {
        pending.push(previousExerciseIndex);
      }

      if (
        nextExerciseIndex < totalExercises &&
        nextConnectorIndex < totalExercises - 1 &&
        supersetLinks.has(nextConnectorIndex) &&
        !visited.has(nextExerciseIndex)
      ) {
        pending.push(nextExerciseIndex);
      }
    }

    return Array.from(visited);
  };

  useEffect(() => {
    setSupersetLinks(prev => {
      const maxConnectorIndex = exercises.length - 2;
      const cleaned = new Set<number>();
      prev.forEach(linkIndex => {
        if (linkIndex >= 0 && linkIndex <= maxConnectorIndex) {
          cleaned.add(linkIndex);
        }
      });
      return cleaned.size === prev.size ? prev : cleaned;
    });
  }, [exercises.length]);

  useEffect(() => {
    exerciseFillAnimations.current = exerciseFillAnimations.current.slice(0, exercises.length);
  }, [exercises.length]);

  useEffect(() => {
    const connectorCount = Math.max(0, exercises.length - 1);
    connectorFlowAnimations.current = connectorFlowAnimations.current.slice(0, connectorCount);
  }, [exercises.length]);

  useEffect(() => {
    const connectorCount = Math.max(0, exercises.length - 1);
    const connectorAnimations: Animated.CompositeAnimation[] = [];
    const exerciseAnimations: Animated.CompositeAnimation[] = [];

    for (let index = 0; index < connectorCount; index += 1) {
      if (!connectorFlowAnimations.current[index]) {
        connectorFlowAnimations.current[index] = new Animated.Value(0);
      }

      connectorAnimations.push(
        Animated.timing(connectorFlowAnimations.current[index], {
          toValue: isConnectorActive(index) ? 1 : 0,
          duration: LINE_FLOW_DURATION_MS,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: false,
        }),
      );
    }

    for (let index = 0; index < exercises.length; index += 1) {
      if (!exerciseFillAnimations.current[index]) {
        exerciseFillAnimations.current[index] = new Animated.Value(0);
      }

      exerciseAnimations.push(
        Animated.timing(exerciseFillAnimations.current[index], {
          toValue: isExerciseInSuperset(index) ? 1 : 0,
          duration: EXERCISE_FILL_DURATION_MS,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: false,
        }),
      );
    }

    supersetTransitionAnimation.current?.stop();

    const animations = [...connectorAnimations, ...exerciseAnimations];

    if (animations.length > 0) {
      const parallel = Animated.parallel(animations);
      supersetTransitionAnimation.current = parallel;
      parallel.start(() => {
        if (supersetTransitionAnimation.current === parallel) {
          supersetTransitionAnimation.current = null;
        }
      });
    }
  }, [exercises.length, supersetLinks]);

  const executeSave = async () => {
    try {
      const supersetIndexes = Array.from(supersetLinks).sort((a, b) => a - b);
      await saveRoutine.mutateAsync({
        id: routineId,
        base_name: name,
        description,
        suggested_day_of_week: isRecurring && selectedDays.length > 0 ? selectedDays[0] : null,
        exercises,
        supersetLinks: supersetIndexes,
      });
      // Navigate to TrainingHome to exit the editor flow completely
      navigation.navigate('TrainingHome');
    } catch (e) {
      console.error(e);
      Alert.alert(t('common.error'), t('training.saveRoutineError'));
    }
  };

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert(t('common.error'), t('training.routineNameRequired'));
      return;
    }

    // Check if day changed in edit mode
    const newDay = selectedDays.length > 0 ? selectedDays[0] : null;
    const dayChanged = routineId && originalSuggestedDay !== null && newDay !== originalSuggestedDay;

    if (dayChanged) {
      const oldDayName = format(new Date(2024, 0, 7 + originalSuggestedDay), 'EEEE', {
        locale: getDateFnsLocale(),
      });
      const newDayName =
        newDay !== null
          ? format(new Date(2024, 0, 7 + newDay), 'EEEE', { locale: getDateFnsLocale() })
          : t('training.noneDay');

      Alert.alert(
        t('training.dayChangeTitle'),
        t('training.dayChangeMessage', { oldDay: oldDayName, newDay: newDayName }),
        [
          { text: t('common.cancel'), style: 'cancel' },
          {
            text: t('common.ok'),
            style: 'destructive',
            onPress: async () => {
              // Delete future workout_plans for the old day ONLY
              // Only delete plans that:
              // 1. Are for this template
              // 2. Are in the future
              // 3. Fall on the OLD day of the week (originalSuggestedDay)
              // 4. Are NOT completed
              if (user && routineId && originalSuggestedDay !== null) {
                const today = format(new Date(), 'yyyy-MM-dd');

                const { data: matchingPlans, error: selectError } = await supabase
                  .from('workout_plans')
                  .select('id, planned_date, completed_at')
                  .eq('gym_template_id', routineId)
                  .eq('user_id', user.id)
                  .gte('planned_date', today)
                  .is('completed_at', null); // Only non-completed

                if (!selectError && matchingPlans && matchingPlans.length > 0) {
                  // Filter to only those that match the old day of week
                  const plansToDelete = matchingPlans.filter(plan => {
                    const planDate = new Date(plan.planned_date + 'T00:00:00'); // Avoid timezone issues
                    const planDayOfWeek = planDate.getDay(); // 0 = Sunday
                    return planDayOfWeek === originalSuggestedDay;
                  });

                  if (plansToDelete.length > 0) {
                    const idsToDelete = plansToDelete.map(p => p.id);
                    const { error: deleteError } = await supabase.from('workout_plans').delete().in('id', idsToDelete);

                    if (deleteError) {
                      console.error('Error deleting future plans:', deleteError);
                    }
                  }
                }
              }
              await executeSave();
            },
          },
        ],
      );
    } else {
      await executeSave();
    }
  };

  const updateExerciseTarget = (index: number, field: string, value: string) => {
    setExercises(prev => {
      const newEx = [...prev];

      if (field === 'rest_seconds') {
        const parsedRestSeconds = value.trim() === '' ? null : Number.parseInt(value, 10);
        const normalizedRestSeconds = Number.isNaN(parsedRestSeconds) ? null : parsedRestSeconds;
        const linkedIndexes = getSupersetExerciseIndexes(index, prev.length);
        linkedIndexes.forEach(linkedIndex => {
          newEx[linkedIndex] = {
            ...newEx[linkedIndex],
            rest_seconds: normalizedRestSeconds,
          };
        });
      } else if (field === 'target_reps_min' || field === 'target_reps_max') {
        const parsedReps = value.trim() === '' ? 0 : Number.parseInt(value, 10);
        const normalizedReps = Number.isNaN(parsedReps) ? 0 : parsedReps;
        newEx[index] = {
          ...newEx[index],
          target_reps_min: normalizedReps,
          target_reps_max: normalizedReps,
        };
      } else {
        newEx[index] = { ...newEx[index], [field]: value };
      }

      return newEx;
    });
  };

  return (
    <LinearGradient
      colors={[themeColors.gradientStart || themeColors.background, themeColors.gradientEnd || themeColors.background]}
      style={{ flex: 1 }}
    >
      <SafeAreaView style={{ flex: 1 }}>
        <View style={[styles.header, { borderBottomColor: dynamicStyles.border.borderColor }]}>
          <TouchableOpacity onPress={() => navigation.navigate('GymRoutinesList')}>
            <Text style={[styles.cancelText, { color: themeColors.danger }]}>{t('common.cancel')}</Text>
          </TouchableOpacity>
          <Text style={[styles.title, dynamicStyles.title]}>
            {routineId ? t('training.editRoutine') : t('training.newRoutine')}
          </Text>
          <TouchableOpacity onPress={handleSave} disabled={saveRoutine.isPending}>
            <Text style={[styles.saveText, { color: themeColors.primary }]}>
              {saveRoutine.isPending ? t('training.saving') : t('common.save')}
            </Text>
          </TouchableOpacity>
        </View>

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.keyboardAvoiding}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 10 : 0}
        >
          <ScrollView
            contentContainerStyle={styles.content}
            keyboardDismissMode="interactive"
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.formGroup}>
              <Text style={[styles.label, dynamicStyles.sublabel]}>{t('training.name')}</Text>
              <TextInput
                style={[styles.input, dynamicStyles.input]}
                placeholder={t('training.routinePlaceholder')}
                placeholderTextColor={themeColors.textSecondary}
                value={name}
                onChangeText={setName}
                inputAccessoryViewID={inputAccessoryViewID}
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={[styles.label, dynamicStyles.sublabel]}>{t('settings.description')}</Text>
              <TextInput
                style={[styles.input, dynamicStyles.input]}
                placeholder={t('training.optional')}
                placeholderTextColor={themeColors.textSecondary}
                value={description}
                onChangeText={setDescription}
                inputAccessoryViewID={inputAccessoryViewID}
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={[styles.label, dynamicStyles.sublabel]}>{t('training.scheduleDay')}</Text>
              <WeekDaySelector
                selectedDays={selectedDays}
                onDaysChange={setSelectedDays}
                isRecurring={isRecurring}
                onToggleRecurring={() => setIsRecurring(!isRecurring)}
                singleSelect={true}
              />
            </View>

            <View style={styles.exercisesHeader}>
              <Text style={[styles.sectionTitle, dynamicStyles.sectionTitle]}>
                {t('training.exercises')} ({exercises.length})
              </Text>
              <TouchableOpacity onPress={handleAddExercise} style={styles.addBtn}>
                <Plus size={20} color={themeColors.primary} />
                <Text style={[styles.addBtnText, { color: themeColors.primary }]}>{t('nutrition.add')}</Text>
              </TouchableOpacity>
            </View>

            {exercises.map((item, index) => {
              const isInSuperset = isExerciseInSuperset(index);
              const connectorActive = isConnectorActive(index);
              const exerciseKey = getExerciseRenderKey(item, index);
              const isWarmupExercise = !!item.is_warmup;
              const exerciseCardKey = `${exerciseKey}-${isWarmupExercise ? 'warmup' : 'regular'}`;
              const deleteAnimation = getDeleteExerciseAnimation(exerciseKey);
              const isDeleting = deletingExerciseKeys.has(exerciseKey);
              if (!exerciseFillAnimations.current[index]) {
                exerciseFillAnimations.current[index] = new Animated.Value(isInSuperset ? 1 : 0);
              }
              const fillAnimation = exerciseFillAnimations.current[index];
              if (!connectorFlowAnimations.current[index]) {
                connectorFlowAnimations.current[index] = new Animated.Value(connectorActive ? 1 : 0);
              }
              const connectorFlow = connectorFlowAnimations.current[index];

              return (
                <React.Fragment key={exerciseCardKey}>
                  <Animated.View
                    pointerEvents={isDeleting ? 'none' : 'auto'}
                    style={
                      isDeleting
                        ? {
                            opacity: deleteAnimation.interpolate({
                              inputRange: [0, 1],
                              outputRange: [1, 0],
                            }),
                            transform: [
                              {
                                translateY: deleteAnimation.interpolate({
                                  inputRange: [0, 1],
                                  outputRange: [0, -10],
                                }),
                              },
                              {
                                scale: deleteAnimation.interpolate({
                                  inputRange: [0, 1],
                                  outputRange: [1, 0.98],
                                }),
                              },
                            ],
                          }
                        : undefined
                    }
                  >
                    <Animated.View
                      style={[
                        movedExerciseId === item.exercise_id &&
                          movedExerciseDirection && {
                            transform: [
                              {
                                translateY: moveHighlightAnim.interpolate({
                                  inputRange: [0, 1],
                                  outputRange: [0, movedExerciseDirection === 'up' ? -6 : 6],
                                }),
                              },
                              {
                                scale: moveHighlightAnim.interpolate({
                                  inputRange: [0, 1],
                                  outputRange: [1, 1.02],
                                }),
                              },
                            ],
                            opacity: moveHighlightAnim.interpolate({
                              inputRange: [0, 0.5, 1],
                              outputRange: [1, 0.9, 1],
                            }),
                          },
                      ]}
                    >
                      <GlassCard
                        style={[
                          styles.exerciseCard,
                          dynamicStyles.glassCard,
                          isWarmupExercise && [
                            styles.exerciseCardWarmup,
                            {
                              borderColor: '#FF9500B3',
                            },
                          ],
                          isInSuperset && [
                            styles.exerciseCardSuperset,
                            {
                              borderColor: themeColors.primary + 'B3',
                            },
                          ],
                        ]}
                      >
                        <Animated.View
                          pointerEvents="none"
                          style={[
                            styles.supersetFillOverlay,
                            {
                              opacity: fillAnimation,
                              backgroundColor: themeColors.primary + '16',
                            },
                          ]}
                        />
                        <View style={styles.exerciseCardContent}>
                          <View style={styles.exerciseHeader}>
                            <View style={styles.exerciseInfo}>
                              <Text style={[styles.exerciseName, dynamicStyles.title]}>
                                {getExerciseDisplayName(item.exercise)}
                              </Text>
                            </View>
                            <View style={styles.actionButtonsRow}>
                              <View style={styles.moveButtons}>
                                {index > 0 && (
                                  <TouchableOpacity
                                    onPress={() => handleMoveExercise(index, 'up')}
                                    style={styles.moveBtn}
                                  >
                                    <ChevronUp size={20} color={themeColors.textSecondary} />
                                  </TouchableOpacity>
                                )}
                                {index < exercises.length - 1 && (
                                  <TouchableOpacity
                                    onPress={() => handleMoveExercise(index, 'down')}
                                    style={styles.moveBtn}
                                  >
                                    <ChevronDown size={20} color={themeColors.textSecondary} />
                                  </TouchableOpacity>
                                )}
                              </View>
                              <TouchableOpacity
                                onPress={() => toggleExerciseWarmup(index)}
                                style={[
                                  styles.warmupExerciseToggle,
                                  isWarmupExercise && styles.warmupExerciseToggleActive,
                                ]}
                              >
                                <Text
                                  style={[
                                    styles.warmupExerciseToggleText,
                                    { color: isWarmupExercise ? '#FF9500' : themeColors.textSecondary },
                                  ]}
                                >
                                  {t('training.warmup')}
                                </Text>
                              </TouchableOpacity>
                              <TouchableOpacity onPress={() => setHelpModalVisible(true)} style={styles.deleteBtn}>
                                <HelpCircle size={18} color={themeColors.textSecondary} />
                              </TouchableOpacity>
                              <TouchableOpacity onPress={() => handleRemoveExercise(index)} style={styles.deleteBtn}>
                                <Trash2 size={18} color={themeColors.danger} />
                              </TouchableOpacity>
                            </View>
                          </View>

                          <View style={styles.targetsRow}>
                            <View style={styles.targetField}>
                              <Text style={[styles.targetLabel, dynamicStyles.sublabel]}>
                                {t('training.setsLabel')}
                              </Text>
                              <TextInput
                                style={[styles.targetInput, dynamicStyles.input]}
                                keyboardType="numeric"
                                value={String(item.target_sets || '')}
                                onChangeText={v => updateExerciseTarget(index, 'target_sets', v)}
                                inputAccessoryViewID={inputAccessoryViewID}
                              />
                            </View>
                            {isTimeBasedExercise(item.exercise) ? (
                              // Time-based exercise: show single Tiempo field
                              <View style={styles.targetField}>
                                <Text style={[styles.targetLabel, dynamicStyles.sublabel]}>
                                  {t('training.timeSeconds')}
                                </Text>
                                <TextInput
                                  style={[styles.targetInput, dynamicStyles.input]}
                                  keyboardType="numeric"
                                  placeholder="30"
                                  placeholderTextColor={themeColors.textSecondary + '50'}
                                  value={String(item.target_reps_min || '')}
                                  onChangeText={v => updateExerciseTarget(index, 'target_reps_min', v)}
                                  inputAccessoryViewID={inputAccessoryViewID}
                                />
                              </View>
                            ) : (
                              // Reps-based exercise: single repetitions target
                              <View style={styles.targetField}>
                                <Text style={[styles.targetLabel, dynamicStyles.sublabel]}>
                                  {t('training.repsColon')}
                                </Text>
                                <TextInput
                                  style={[styles.targetInput, dynamicStyles.input]}
                                  keyboardType="numeric"
                                  value={String(item.target_reps_min || '')}
                                  onChangeText={v => updateExerciseTarget(index, 'target_reps_min', v)}
                                  inputAccessoryViewID={inputAccessoryViewID}
                                />
                              </View>
                            )}
                            {!isTimeBasedExercise(item.exercise) && (
                              <View style={styles.targetField}>
                                <Text style={[styles.targetLabel, dynamicStyles.sublabel]}>
                                  {t('training.prColon')}
                                  {preferences.weight_unit})
                                </Text>
                                <View
                                  style={[
                                    styles.targetInput,
                                    dynamicStyles.input,
                                    { justifyContent: 'center', alignItems: 'center' },
                                  ]}
                                >
                                  <Text style={{ color: themeColors.textSecondary, fontSize: 14 }}>
                                    {prs?.[item.exercise_id]
                                      ? `${toDisplayWeight(prs[item.exercise_id].weight_kg)}`
                                      : '-'}
                                  </Text>
                                </View>
                              </View>
                            )}
                            <View style={styles.targetField}>
                              <Text style={[styles.targetLabel, dynamicStyles.sublabel]}>
                                {t('training.restSeconds')}
                              </Text>
                              <TextInput
                                style={[styles.targetInput, dynamicStyles.input]}
                                keyboardType="numeric"
                                placeholder="60"
                                placeholderTextColor={themeColors.textSecondary + '50'}
                                value={String(item.rest_seconds || '')}
                                onChangeText={v => updateExerciseTarget(index, 'rest_seconds', v)}
                                inputAccessoryViewID={inputAccessoryViewID}
                              />
                            </View>
                          </View>
                        </View>
                      </GlassCard>
                    </Animated.View>
                  </Animated.View>

                  {index < exercises.length - 1 && (
                    <View style={styles.supersetConnectorContainer}>
                      <View style={styles.supersetLineTrack}>
                        <View
                          style={[
                            styles.supersetLine,
                            connectorActive && styles.supersetLineActive,
                            { backgroundColor: themeColors.border },
                          ]}
                        />
                        <Animated.View
                          style={[
                            styles.supersetLine,
                            connectorActive && styles.supersetLineActive,
                            styles.supersetLineFill,
                            styles.supersetLineFillLeft,
                            {
                              width: connectorFlow.interpolate({
                                inputRange: [0, 1],
                                outputRange: ['0%', '100%'],
                              }),
                              backgroundColor: themeColors.primary + 'D9',
                            },
                          ]}
                        />
                      </View>
                      <TouchableOpacity
                        onPress={() => handleSupersetPress(index)}
                        style={[
                          styles.supersetConnectorButton,
                          connectorActive && styles.supersetConnectorButtonActive,
                          {
                            borderColor: connectorActive ? themeColors.primary : themeColors.primary + '55',
                            backgroundColor: connectorActive ? themeColors.primary + '22' : themeColors.background,
                          },
                        ]}
                      >
                        <InfinityIcon size={18} color={themeColors.primary} />
                      </TouchableOpacity>
                      <View style={styles.supersetLineTrack}>
                        <View
                          style={[
                            styles.supersetLine,
                            connectorActive && styles.supersetLineActive,
                            { backgroundColor: themeColors.border },
                          ]}
                        />
                        <Animated.View
                          style={[
                            styles.supersetLine,
                            connectorActive && styles.supersetLineActive,
                            styles.supersetLineFill,
                            styles.supersetLineFillRight,
                            {
                              width: connectorFlow.interpolate({
                                inputRange: [0, 1],
                                outputRange: ['0%', '100%'],
                              }),
                              backgroundColor: themeColors.primary + 'D9',
                            },
                          ]}
                        />
                      </View>
                    </View>
                  )}
                </React.Fragment>
              );
            })}

            <TouchableOpacity
              style={[styles.addLargeBtn, { borderColor: themeColors.border }]}
              onPress={handleAddExercise}
            >
              <Plus size={24} color={themeColors.textSecondary} />
              <Text style={[styles.addLargeBtnText, { color: themeColors.textSecondary }]}>
                {t('training.addExercise')}
              </Text>
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>

        {Platform.OS === 'ios' && (
          <InputAccessoryView nativeID={inputAccessoryViewID}>
            <View style={styles.accessoryView}>
              <Button onPress={() => Keyboard.dismiss()} title={t('common.done')} />
            </View>
          </InputAccessoryView>
        )}

        <Modal
          visible={helpModalVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setHelpModalVisible(false)}
        >
          <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setHelpModalVisible(false)}>
            <View style={[styles.helpModalContent, dynamicStyles.modalContent]}>
              <Text style={[styles.helpTitle, dynamicStyles.title]}>{t('training.tableHelp')}</Text>

              <View style={styles.helpRow}>
                <Text style={[styles.helpLabel, { color: themeColors.primary }]}>
                  {t('training.setsLabel').replace(':', '')}
                </Text>
                <Text style={[styles.helpText, { color: themeColors.textPrimary }]}>
                  {t('training.setNumberIndicator')}
                </Text>
              </View>

              <View style={styles.helpRow}>
                <Text style={[styles.helpLabel, { color: themeColors.primary }]}>
                  {t('training.prColonAllCaps').replace(':', '').replace(' (', '')}
                </Text>
                <Text style={[styles.helpText, { color: themeColors.textPrimary }]}>
                  {t('training.prIndicatorDesc')}
                </Text>
              </View>

              <View style={styles.helpRow}>
                <Text style={[styles.helpLabel, { color: themeColors.primary }]}>{preferences.weight_unit}</Text>
                <Text style={[styles.helpText, { color: themeColors.textPrimary }]}>
                  {t('training.weightLiftedLabel')}
                </Text>
              </View>

              <View style={styles.helpRow}>
                <Text style={[styles.helpLabel, { color: themeColors.primary }]}>
                  {t('training.repsColon').replace(':', '')}
                </Text>
                <Text style={[styles.helpText, { color: themeColors.textPrimary }]}>
                  {t('training.repsOrTimeGoal')}
                </Text>
              </View>

              <View style={styles.helpRow}>
                <Text style={[styles.helpLabel, { color: themeColors.primary }]}>W</Text>
                <Text style={[styles.helpText, { color: themeColors.textPrimary }]}>
                  {t('training.warmupSetInstruction')}
                </Text>
              </View>

              <View style={styles.helpRow}>
                <View style={{ width: 60, alignItems: 'flex-start', paddingLeft: 2 }}>
                  <InfinityIcon size={18} color={themeColors.primary} />
                </View>
                <Text style={[styles.helpText, { color: themeColors.textPrimary }]}>
                  {t('training.supersetInstruction')}
                </Text>
              </View>

              <View style={styles.helpRow}>
                <View style={{ width: 60, alignItems: 'flex-start' }}>
                  <View style={[styles.checkBtn, styles.checkBtnDone, { width: 20, height: 20 }]}>
                    <Check size={12} color="#FFF" />
                  </View>
                </View>
                <Text style={[styles.helpText, { color: themeColors.textPrimary }]}>
                  {t('training.completeSetInstruction')}
                </Text>
              </View>
              <TouchableOpacity style={styles.closeHelpBtn} onPress={() => setHelpModalVisible(false)}>
                <Text style={styles.closeHelpText}>{t('common.gotIt')}</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </Modal>
      </SafeAreaView>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  keyboardAvoiding: {
    flex: 1,
  },
  accessoryView: {
    backgroundColor: '#f0f0f0',
    alignItems: 'flex-end',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.m,
    borderBottomWidth: 1,
  },
  cancelText: {
    fontSize: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
  },
  saveText: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  content: {
    padding: spacing.m,
    paddingBottom: 100,
  },
  formGroup: {
    marginBottom: spacing.m,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 4,
    marginLeft: 4,
  },
  input: {
    borderRadius: borderRadius.m,
    padding: spacing.m,
    fontSize: 16,
    borderWidth: 1, // Added border for better visibility if dynamicStyle provides border color
  },
  exercisesHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.m,
    marginBottom: spacing.s,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '600',
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  addBtnText: {
    marginLeft: 4,
    fontSize: 16,
  },
  exerciseCard: {
    marginBottom: spacing.m,
    padding: spacing.m,
    overflow: 'hidden',
  },
  exerciseCardWarmup: {
    borderWidth: 2,
  },
  exerciseCardSuperset: {
    borderWidth: 2,
    borderLeftWidth: 3,
  },
  exerciseHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.m,
  },
  exerciseInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s,
    flex: 1, // Allow text to take available space
    marginRight: spacing.s,
  },
  exerciseCardContent: {
    zIndex: 1,
  },
  supersetFillOverlay: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    borderRadius: borderRadius.m,
  },
  actionButtonsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.m,
  },
  moveButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  moveBtn: {
    padding: 4,
  },
  deleteBtn: {
    padding: 4,
  },
  exerciseName: {
    fontSize: 16,
    fontWeight: '600',
  },
  warmupExerciseToggle: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(153,153,153,0.4)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    minWidth: 76,
    alignItems: 'center',
    justifyContent: 'center',
  },
  warmupExerciseToggleActive: {
    borderColor: 'rgba(255,149,0,0.55)',
    backgroundColor: 'rgba(255,149,0,0.12)',
  },
  warmupExerciseToggleText: {
    fontSize: 11,
    fontWeight: '700',
  },
  targetsRow: {
    flexDirection: 'row',
    gap: spacing.m,
  },
  targetField: {
    flex: 1,
  },
  targetLabel: {
    fontSize: 11,
    marginBottom: 2,
  },
  targetInput: {
    borderRadius: borderRadius.s,
    padding: 8,
    fontSize: 14,
    textAlign: 'center',
    borderWidth: 1,
  },
  addLargeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.l,
    borderWidth: 1,
    borderRadius: borderRadius.m,
    borderStyle: 'dashed',
    marginTop: spacing.s,
  },
  addLargeBtnText: {
    marginLeft: spacing.s,
    fontSize: 16,
  },
  supersetConnectorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -spacing.xs,
    marginBottom: spacing.s,
  },
  supersetLineTrack: {
    flex: 1,
    height: 3,
    overflow: 'hidden',
    justifyContent: 'center',
  },
  supersetLine: {
    height: 2,
    width: '100%',
    borderRadius: 999,
  },
  supersetLineActive: {
    height: 3,
  },
  supersetLineFill: {
    position: 'absolute',
    top: 0,
    bottom: 0,
  },
  supersetLineFillLeft: {
    right: 0,
  },
  supersetLineFillRight: {
    left: 0,
  },
  supersetConnectorButton: {
    padding: 6,
    borderRadius: 16,
    borderWidth: 1.5,
    marginHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  supersetConnectorButtonActive: {
    transform: [{ scale: 1.05 }],
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  helpModalContent: {
    borderRadius: 24,
    padding: 24,
    width: '100%',
    maxWidth: 400,
  },
  helpTitle: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 20,
    textAlign: 'center',
  },
  helpRow: {
    flexDirection: 'row',
    marginBottom: 12,
    alignItems: 'flex-start',
  },
  helpLabel: {
    fontWeight: '700',
    width: 60,
    fontSize: 14,
  },
  helpText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
  },
  closeHelpBtn: {
    marginTop: 20,
    backgroundColor: '#007AFF',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  closeHelpText: {
    color: '#FFF',
    fontWeight: '600',
    fontSize: 16,
  },
  checkBtn: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkBtnDone: {
    backgroundColor: '#34C759',
    borderColor: '#34C759',
  },
});
