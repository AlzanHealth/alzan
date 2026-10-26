import React, { useState, useEffect, useMemo, useRef } from 'react';
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
  Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { TrainingScreenNavigationProp, TrainingStackParamList } from '../../types/navigation.types';
import { LinearGradient } from 'expo-linear-gradient';
import { GlassCard } from '../../components/GlassCard';
import { spacing, borderRadius } from '../../theme';
import { useTrainingStyles } from '../../hooks/useTrainingStyles';
import { useTrainingSettings } from '../../hooks/useTrainingSettings';
import { RoutineDataExercise, useGymRoutineEditor } from '../../hooks/useGymRoutineEditor';
import { useUserPreferences } from '../../hooks/useUserPreferences';
import {
  Plus,
  Trash2,
  ChevronUp,
  ChevronDown,
  Infinity as InfinityIcon,
  HelpCircle,
  Check,
  Dumbbell,
  Zap,
  ChevronRight,
  Clock,
} from 'lucide-react-native';
import { WeekDaySelector } from '../../components/training/WeekDaySelector';
import { OneOffDateSelector } from '../../components/training/OneOffDateSelector';
import { useExercisesPRs } from '../../hooks/useExercisesPRs';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../context/AuthContext';
import { format } from 'date-fns';
import { getDateFnsLocale } from '../../i18n/dateLocale';
import { Alert } from '../../components/common/Alert';
import { useTranslation } from 'react-i18next';
import { isTimeBasedExerciseType, getLocalizedExerciseName } from '../../services/localization';
import { ExerciseWithDetails } from '../../types/training';
import { useSportCatalog } from '../../hooks/useSportCatalog';
import { useUnsavedChangesGuard } from '../../hooks/useUnsavedChangesGuard';
import { calculateRoutineTotalSets, normalizeTargetSetsInput } from './helpers/gymRoutineEditorTotals.helper';
import { getDefaultGymExerciseTargets } from '../../modules/training/helpers/gymExerciseDefaults.helper';
import { AlzanSwitch } from '../../components/common/AlzanSwitch';
import { buildGymTemplateFamilySignature } from '../../modules/training/helpers/templateFamilySignature';
import {
  cloneEditableState,
  hasUnsavedChanges as compareUnsavedChanges,
  serializeEditableState,
} from '../../modules/training/helpers/unsavedChanges.helper';
import {
  getCurrentWeekDateForWeekday,
  getCurrentWeekdayForDate,
  hasValidRecurringDay,
  isScheduledWeekday,
  isValidOptionalOneOffDate,
  isValidIsoDate,
  resolveOneOffDate,
  shouldShowScheduleDays,
} from '../../modules/training/helpers/templateScheduling.helper';
import {
  calculateWeeklyEndDate,
  getFirstWeeklyOccurrenceOnOrAfter,
  getNextWeeklyOccurrence,
  isValidDateOnly,
  parsePositiveWholeWeeks,
} from '../../modules/training/helpers/weeklyRecurrence.helper';
import { INTEGER_INPUT_PROPS } from '../../utils/numericInput';
import { calculateProgressionWeeks } from '../../modules/training/helpers/enduranceProgression.helper';

export const GymRoutineEditorScreen = () => {
  const { t } = useTranslation();
  const { styles: dynamicStyles, colors: themeColors } = useTrainingStyles();
  const { user } = useAuth();
  const navigation = useNavigation<TrainingScreenNavigationProp>();
  const route = useRoute<RouteProp<TrainingStackParamList, 'GymRoutineEditor'>>();
  const { routineId } = route.params || {};
  const inputAccessoryViewID = 'uniqueID'; // Defined for iOS Keyboard button
  const { preferences, toDisplayWeight } = useUserPreferences();
  const { settings: trainingSettings } = useTrainingSettings();

  const { routineData, oneOffPlanDate, isLoading, isOneOffPlanDateLoading, saveRoutine } =
    useGymRoutineEditor(routineId);
  const { getOptions, getGroupLabel, getOptionLabel } = useSportCatalog();
  const isImportedDateDrivenTemplate =
    routineData?.source === 'imported' &&
    routineData.suggested_day_of_week === null &&
    !!routineData.recurrence_start_date &&
    !!routineData.recurrence_end_date;

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [workoutGoal, setWorkoutGoal] = useState<string | null>(null);
  const [modality, setModality] = useState<string | null>('gym');
  const [currentView, setCurrentView] = useState<'main' | 'builder'>('main');
  const [goalModalVisible, setGoalModalVisible] = useState(false);
  const [modalityModalVisible, setModalityModalVisible] = useState(false);
  const [selectedDays, setSelectedDays] = useState<number[]>([]);
  const [originalSuggestedDay, setOriginalSuggestedDay] = useState<number | null>(null); // Track original day for edit mode
  const [isRecurring, setIsRecurring] = useState(false);
  const [oneOffDate, setOneOffDate] = useState<string | null>(null);
  const [recurrenceStartDate, setRecurrenceStartDate] = useState<string | null>(null);
  const [recurrenceEndDate, setRecurrenceEndDate] = useState('');
  const [recurrenceWeeks, setRecurrenceWeeks] = useState('');
  const [autoDeleteAfterEnd, setAutoDeleteAfterEnd] = useState(true);
  const [isFormHydrated, setIsFormHydrated] = useState(!routineId);
  const initialEditableStateSnapshotRef = useRef<string | null>(null);
  const builderInitialStateRef = useRef<{
    exercises: RoutineDataExercise[];
    supersetLinks: number[];
    snapshot: string;
  } | null>(null);
  const oneOffWeekday = !isRecurring ? getCurrentWeekdayForDate(oneOffDate) : null;

  const handleScheduleDaysChange = (days: number[]) => {
    if (!isRecurring) {
      const selectedDay = days[0];
      setSelectedDays([]);
      setOneOffDate(selectedDay === undefined ? null : getCurrentWeekDateForWeekday(selectedDay));
      return;
    }
    setSelectedDays(days);
    const selectedDay = days[0];
    if (selectedDay === undefined) {
      setRecurrenceStartDate(null);
      setRecurrenceEndDate('');
      return;
    }

    const baseDate = isValidDateOnly(recurrenceStartDate)
      ? recurrenceStartDate
      : getNextWeeklyOccurrence(new Date(), selectedDay);
    setRecurrenceStartDate(getFirstWeeklyOccurrenceOnOrAfter(baseDate, selectedDay));
  };

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
  const warmupFillAnimations = useRef<Animated.Value[]>([]);
  const connectorFlowAnimations = useRef<Animated.Value[]>([]);
  const supersetTransitionAnimation = useRef<Animated.CompositeAnimation | null>(null);

  const LINE_FLOW_DURATION_MS = 1000;
  const EXERCISE_FILL_DURATION_MS = 900;
  const totalSets = calculateRoutineTotalSets(exercises);

  const getRecurrenceStartDateForSave = (scheduledDay: number | null): string | null => {
    if (!isRecurring) {
      return isImportedDateDrivenTemplate ? recurrenceStartDate || null : null;
    }
    return getFirstWeeklyOccurrenceOnOrAfter(recurrenceStartDate, scheduledDay);
  };

  const getRecurrenceEndDateForSave = (scheduledDay: number | null): string | null => {
    if (isRecurring) {
      const startDate = getRecurrenceStartDateForSave(scheduledDay);
      const weeks = parsePositiveWholeWeeks(recurrenceWeeks);
      return weeks ? calculateWeeklyEndDate(startDate, scheduledDay, weeks) : null;
    }
    return recurrenceEndDate.trim() ? recurrenceEndDate.trim() : null;
  };

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
    initialEditableStateSnapshotRef.current = null;
    setIsFormHydrated(!routineId);
  }, [routineId]);

  useEffect(() => {
    if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
      UIManager.setLayoutAnimationEnabledExperimental(true);
    }
  }, []);

  useEffect(() => {
    if (!routineId) setAutoDeleteAfterEnd(trainingSettings.autoDeleteExpiredTemplates);
  }, [routineId, trainingSettings.autoDeleteExpiredTemplates]);

  useEffect(() => {
    if (routineData) {
      const lifecycleData = routineData as unknown as {
        recurrence_start_date?: string | null;
        recurrence_end_date?: string | null;
        auto_delete_after_end?: boolean | null;
      };
      setName(routineData.base_name);
      setDescription(routineData.description || '');

      if (isScheduledWeekday(routineData.suggested_day_of_week)) {
        setSelectedDays([routineData.suggested_day_of_week]);
        setOriginalSuggestedDay(routineData.suggested_day_of_week); // Store original for comparison
      } else {
        setSelectedDays([]);
        setOriginalSuggestedDay(null);
      }
      const existingScheduledDay = isScheduledWeekday(routineData.suggested_day_of_week)
        ? routineData.suggested_day_of_week
        : null;
      const existingWeeks = calculateProgressionWeeks(
        lifecycleData.recurrence_start_date,
        lifecycleData.recurrence_end_date,
      );
      const normalizedExistingStart =
        existingScheduledDay !== null
          ? getFirstWeeklyOccurrenceOnOrAfter(lifecycleData.recurrence_start_date, existingScheduledDay)
          : lifecycleData.recurrence_start_date || null;
      setIsRecurring(existingScheduledDay !== null);
      setOneOffDate(null);
      setRecurrenceStartDate(normalizedExistingStart);
      setExercises(routineData.exercises || []);
      setSupersetLinks(buildSupersetLinksFromExercises(routineData.exercises || []));
      setWorkoutGoal(routineData.workout_goal || null);
      setModality(routineData.modality || 'gym');
      setRecurrenceEndDate(
        existingScheduledDay !== null && existingWeeks > 0
          ? calculateWeeklyEndDate(normalizedExistingStart, existingScheduledDay, existingWeeks) || ''
          : lifecycleData.recurrence_end_date || '',
      );
      setRecurrenceWeeks(existingWeeks > 0 ? String(existingWeeks) : '');
      setAutoDeleteAfterEnd(lifecycleData.auto_delete_after_end ?? trainingSettings.autoDeleteExpiredTemplates);
      setIsFormHydrated(true);
    }
  }, [routineData, trainingSettings.autoDeleteExpiredTemplates]);

  useEffect(() => {
    if (routineId) setOneOffDate(oneOffPlanDate);
  }, [oneOffPlanDate, routineId]);

  const editableStateSnapshot = useMemo(
    () =>
      serializeEditableState({
        name,
        description,
        workoutGoal,
        modality,
        selectedDays,
        isRecurring,
        oneOffDate,
        recurrenceStartDate,
        recurrenceEndDate,
        recurrenceWeeks,
        autoDeleteAfterEnd,
        exercises,
        supersetLinks: Array.from(supersetLinks).sort((a, b) => a - b),
      }),
    [
      name,
      description,
      workoutGoal,
      modality,
      selectedDays,
      isRecurring,
      oneOffDate,
      recurrenceStartDate,
      recurrenceEndDate,
      recurrenceWeeks,
      autoDeleteAfterEnd,
      exercises,
      supersetLinks,
    ],
  );

  useEffect(() => {
    const editDataReady =
      !routineId ||
      (!!routineData && !isLoading && (!isOneOffPlanDateLoading || routineData.suggested_day_of_week !== null));

    if (!isFormHydrated || !editDataReady || initialEditableStateSnapshotRef.current !== null) return;

    // Wait one tick for automatic hydration/reconciliation effects before
    // defining the untouched baseline used by the exit guard.
    const settleTimer = setTimeout(() => {
      initialEditableStateSnapshotRef.current = editableStateSnapshot;
    }, 0);

    return () => clearTimeout(settleTimer);
  }, [editableStateSnapshot, isFormHydrated, isLoading, isOneOffPlanDateLoading, routineData, routineId]);

  const hasEditableChanges = compareUnsavedChanges(initialEditableStateSnapshotRef.current, editableStateSnapshot);

  const builderEditableStateSnapshot = useMemo(
    () => serializeEditableState({ exercises, supersetLinks: Array.from(supersetLinks).sort((a, b) => a - b) }),
    [exercises, supersetLinks],
  );
  const hasBuilderChanges =
    currentView === 'builder' &&
    builderInitialStateRef.current !== null &&
    compareUnsavedChanges(builderInitialStateRef.current.snapshot, builderEditableStateSnapshot);

  useEffect(() => {
    if (!isRecurring) return;

    const selectedDay = selectedDays[0] ?? null;
    const effectiveStart = getFirstWeeklyOccurrenceOnOrAfter(recurrenceStartDate, selectedDay);
    const weeks = parsePositiveWholeWeeks(recurrenceWeeks);
    if (!effectiveStart) {
      setRecurrenceEndDate('');
      return;
    }

    if (recurrenceStartDate !== effectiveStart) setRecurrenceStartDate(effectiveStart);
    const calculatedEnd = weeks ? calculateWeeklyEndDate(effectiveStart, selectedDay, weeks) : null;
    setRecurrenceEndDate(calculatedEnd || '');
  }, [isRecurring, recurrenceStartDate, recurrenceWeeks, selectedDays]);

  useEffect(() => {
    exercisesRef.current = exercises;
  }, [exercises]);

  // Listen for selected exercise from Search Screen
  // Listen for selected exercise via Event Emitter to avoid navigation stack issues
  useEffect(() => {
    const subscription = DeviceEventEmitter.addListener('exerciseSelected', (selectedExercise: ExerciseWithDetails) => {
      setExercises(prev => {
        const defaultTargets = getDefaultGymExerciseTargets(selectedExercise.exercise_type_code);
        const nextExercise: RoutineDataExercise = {
          id: `tmp-${selectedExercise.id}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          workout_template_id: routineId || '',
          exercise_id: selectedExercise.id,
          order_index: prev.length,
          is_warmup: false,
          drop_set_mode: 'none',
          target_sets: 3,
          target_reps_min: defaultTargets.target_reps_min,
          target_reps_max: defaultTargets.target_reps_max,
          target_weight_kg: null,
          target_rpe: null,
          target_rir_by_set: null,
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
      selectionMode: 'multi',
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
        drop_set_mode: !target.is_warmup ? 'none' : target.drop_set_mode,
      };
      return next;
    });
  };

  const toggleExerciseDropSet = (exerciseIndex: number) => {
    setExercises(prev => {
      const next = [...prev];
      const target = next[exerciseIndex];
      if (!target) return prev;
      const currentMode = target.drop_set_mode || 'none';
      const nextMode = currentMode === 'none' ? 'last' : currentMode === 'last' ? 'all' : 'none';
      next[exerciseIndex] = {
        ...target,
        is_warmup: false,
        drop_set_mode: nextMode,
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
    warmupFillAnimations.current = warmupFillAnimations.current.slice(0, exercises.length);
  }, [exercises.length]);

  useEffect(() => {
    exercises.forEach((ex, index) => {
      if (!warmupFillAnimations.current[index]) {
        warmupFillAnimations.current[index] = new Animated.Value(ex.is_warmup ? 1 : 0);
      } else {
        Animated.timing(warmupFillAnimations.current[index], {
          toValue: ex.is_warmup ? 1 : 0,
          duration: 700,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: false,
        }).start();
      }
    });
  }, [exercises]);

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

  const executeSave = async (detachFromImport = false, onSaved?: () => void) => {
    try {
      const supersetIndexes = Array.from(supersetLinks).sort((a, b) => a - b);
      const suggestedDayForSave = isRecurring && selectedDays.length > 0 ? selectedDays[0] : null;
      const savedOneOffDate = isImportedDateDrivenTemplate ? null : resolveOneOffDate(isRecurring, oneOffDate);
      const recurrenceStartDateForSave = getRecurrenceStartDateForSave(suggestedDayForSave);
      const recurrenceEndDateForSave = getRecurrenceEndDateForSave(suggestedDayForSave);
      const importedLifecycleChanged =
        routineData?.source === 'imported' &&
        (suggestedDayForSave !== routineData.suggested_day_of_week ||
          recurrenceStartDateForSave !== routineData.recurrence_start_date ||
          recurrenceEndDateForSave !== routineData.recurrence_end_date);
      const templateFamilyKey = buildGymTemplateFamilySignature({
        workoutGoal,
        modality,
        exercises: exercises.map((exercise, index) => ({
          exerciseId: exercise.exercise_id,
          exerciseName: exercise.exercise?.base_name,
          orderIndex: index,
          isWarmup: exercise.is_warmup,
          supersetNextExerciseId: supersetLinks.has(index)
            ? exercises[index + 1]?.exercise_id || exercises[index + 1]?.exercise?.base_name || null
            : null,
        })),
      });
      await saveRoutine.mutateAsync({
        id: routineId,
        base_name: name,
        description,
        workout_goal: workoutGoal || null,
        modality: modality || null,
        suggested_day_of_week: suggestedDayForSave,
        one_off_date: savedOneOffDate,
        remove_one_off_plan:
          isRecurring &&
          !!routineId &&
          !isImportedDateDrivenTemplate &&
          routineData?.suggested_day_of_week === null &&
          !!oneOffPlanDate,
        recurrence_start_date: recurrenceStartDateForSave,
        recurrence_end_date: recurrenceEndDateForSave,
        auto_delete_after_end: autoDeleteAfterEnd,
        template_family_key: templateFamilyKey,
        original_template_family_key: routineData?.template_family_key,
        source: detachFromImport || importedLifecycleChanged ? 'user' : routineData?.source,
        exercises,
        supersetLinks: supersetIndexes,
      });
      // Navigate to TrainingHome to exit the editor flow completely
      onSaved?.();
      if (!onSaved) navigation.navigate('TrainingHome');
    } catch (e) {
      console.error(e);
      Alert.alert(t('common.error'), t('training.saveRoutineError'));
    }
  };

  const handleSave = async (onSaved?: () => void) => {
    if (!name.trim()) {
      Alert.alert(t('common.error'), t('training.routineNameRequired'));
      return;
    }

    if (isRecurring && !hasValidRecurringDay(isRecurring, selectedDays)) {
      Alert.alert(t('common.error'), t('training.repeatNeedsOneDay'));
      return;
    }

    if (isRecurring && !isValidIsoDate(getRecurrenceStartDateForSave(selectedDays[0] ?? null))) {
      Alert.alert(t('common.error'), t('training.recurrenceStartDateRequired'));
      return;
    }

    if (isRecurring && recurrenceWeeks.trim() && !parsePositiveWholeWeeks(recurrenceWeeks)) {
      Alert.alert(t('common.error'), t('training.recurrenceWeeksInvalid'));
      return;
    }

    if (!isValidOptionalOneOffDate(isRecurring, isImportedDateDrivenTemplate, oneOffDate)) {
      Alert.alert(t('common.error'), t('training.oneOffDateRequired'));
      return;
    }

    if (recurrenceEndDate.trim() && !isValidIsoDate(recurrenceEndDate.trim())) {
      Alert.alert(t('common.error'), t('training.invalidTemplateEndDate'));
      return;
    }

    // Check if day changed in edit mode
    const newDay = isRecurring && selectedDays.length > 0 ? selectedDays[0] : null;
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
              await executeSave(true, onSaved);
            },
          },
        ],
      );
    } else {
      await executeSave(false, onSaved);
    }
  };

  const requestExit = useUnsavedChangesGuard({
    hasUnsavedChanges: hasEditableChanges,
    title: t('training.unsavedChangesTitle'),
    message: t('training.unsavedChangesMessage'),
    stayLabel: t('training.keepEditing'),
    discardLabel: t('training.discardChanges'),
    saveLabel: t('training.saveAndExit'),
    onSaveAndExit: onSaved => handleSave(onSaved),
  });

  const openWorkoutBuilder = () => {
    const builderState = {
      exercises: cloneEditableState(exercises),
      supersetLinks: Array.from(supersetLinks).sort((a, b) => a - b),
    };
    builderInitialStateRef.current = {
      ...builderState,
      snapshot: serializeEditableState(builderState),
    };
    setCurrentView('builder');
  };

  const leaveWorkoutBuilder = () => {
    builderInitialStateRef.current = null;
    setCurrentView('main');
  };

  const discardWorkoutBuilderChanges = () => {
    const initialBuilderState = builderInitialStateRef.current;
    if (initialBuilderState) {
      setExercises(cloneEditableState(initialBuilderState.exercises));
      setSupersetLinks(new Set(initialBuilderState.supersetLinks));
    }
    leaveWorkoutBuilder();
  };

  const requestBuilderExit = useUnsavedChangesGuard({
    hasUnsavedChanges: hasBuilderChanges,
    title: t('training.unsavedChangesTitle'),
    message: t('training.unsavedChangesMessage'),
    stayLabel: t('training.keepEditing'),
    discardLabel: t('training.discardChanges'),
    saveLabel: t('training.saveAndExit'),
    onDiscard: discardWorkoutBuilderChanges,
    onSaveAndExit: onSaved =>
      handleSave(() => {
        initialEditableStateSnapshotRef.current = editableStateSnapshot;
        builderInitialStateRef.current = null;
        onSaved();
      }),
  });

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
      } else if (field === 'target_sets') {
        newEx[index] = {
          ...newEx[index],
          target_sets: normalizeTargetSetsInput(value),
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
          <TouchableOpacity
            onPress={() => {
              if (currentView === 'builder') {
                requestBuilderExit(leaveWorkoutBuilder);
              } else {
                requestExit(() => navigation.navigate('GymRoutinesList'));
              }
            }}
          >
            <Text style={[styles.cancelText, { color: themeColors.danger }]}>
              {currentView === 'builder' ? t('common.back') : t('common.cancel')}
            </Text>
          </TouchableOpacity>
          <Text style={[styles.title, dynamicStyles.title]}>
            {currentView === 'builder'
              ? t('training.designWorkout')
              : routineId
                ? t('training.editRoutine')
                : t('training.newRoutine')}
          </Text>
          <TouchableOpacity
            onPress={() => {
              if (currentView === 'builder') {
                requestBuilderExit(leaveWorkoutBuilder);
              } else {
                handleSave();
              }
            }}
            disabled={saveRoutine.isPending}
          >
            <Text style={[styles.saveText, { color: themeColors.primary }]}>
              {currentView === 'builder'
                ? t('common.done')
                : saveRoutine.isPending
                  ? t('training.saving')
                  : t('common.save')}
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
            showsVerticalScrollIndicator={false}
          >
            {currentView === 'main' ? (
              <>
                <GlassCard style={[styles.formBlock, dynamicStyles.glassCard]}>
                  <Text style={[styles.blockTitle, { color: themeColors.textSecondary }]}>
                    {t('training.configureGeneralDetails').toUpperCase()}
                  </Text>

                  {/* Template Name Row */}
                  <View style={styles.formRow}>
                    <Text style={[styles.rowLabel, { color: themeColors.textPrimary }]}>
                      {t('training.templateName')}
                    </Text>
                    <TextInput
                      style={[styles.rowInput, { color: themeColors.textPrimary }]}
                      placeholder="Ex: Push A"
                      placeholderTextColor={themeColors.textSecondary + '70'}
                      value={name}
                      onChangeText={setName}
                      inputAccessoryViewID={inputAccessoryViewID}
                    />
                  </View>

                  {/* Main Goal Row */}
                  <TouchableOpacity style={styles.formRow} onPress={() => setGoalModalVisible(true)}>
                    <Text style={[styles.rowLabel, { color: themeColors.textPrimary }]}>{t('training.mainGoal')}</Text>
                    <View style={styles.rowRightValue}>
                      <Text
                        style={[
                          styles.rowValueText,
                          { color: workoutGoal ? themeColors.textPrimary : themeColors.textSecondary },
                        ]}
                      >
                        {workoutGoal ? getOptionLabel('strength', workoutGoal, 'goal') : t('common.select')}
                      </Text>
                      <ChevronRight size={18} color={themeColors.textSecondary} />
                    </View>
                  </TouchableOpacity>

                  {/* Description Row (Text Area) */}
                  <View style={{ marginTop: spacing.m }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Text style={[styles.rowLabel, { color: themeColors.textPrimary }]}>
                        {t('settings.description')}
                      </Text>
                      <Text style={{ fontSize: 10, color: themeColors.textSecondary }}>
                        {`${description.length}/150`}
                      </Text>
                    </View>
                    <TextInput
                      style={[styles.rowTextArea, { borderColor: themeColors.border, color: themeColors.textPrimary }]}
                      placeholder="Ex: Focused on torso hypertrophy, active mobility warm-up..."
                      placeholderTextColor={themeColors.textSecondary + '70'}
                      multiline
                      maxLength={150}
                      value={description}
                      onChangeText={setDescription}
                      inputAccessoryViewID={inputAccessoryViewID}
                    />
                  </View>

                  {/* Modality Row (BELOW DESCRIPTION) */}
                  <TouchableOpacity
                    style={[styles.formRow, { borderBottomWidth: 0, marginTop: spacing.s }]}
                    onPress={() => setModalityModalVisible(true)}
                  >
                    <Text style={[styles.rowLabel, { color: themeColors.textPrimary }]}>
                      {t('training.modalityLabel')}
                    </Text>
                    <View style={styles.rowRightValue}>
                      <Text
                        style={[
                          styles.rowValueText,
                          { color: modality ? themeColors.textPrimary : themeColors.textSecondary },
                        ]}
                      >
                        {modality ? getOptionLabel('strength', modality, 'modality') : t('common.select')}
                      </Text>
                      <ChevronRight size={18} color={themeColors.textSecondary} />
                    </View>
                  </TouchableOpacity>
                </GlassCard>

                {/* Routine Summary Card */}
                <GlassCard style={[styles.summaryCard, { borderColor: themeColors.border }]}>
                  <View style={styles.summaryHeader}>
                    <View style={[styles.summaryIconContainer, { backgroundColor: `${themeColors.primary}18` }]}>
                      <Dumbbell size={27} color={themeColors.primary} />
                    </View>
                    <View style={styles.summaryTitleContainer}>
                      <Text style={[styles.summaryOverline, { color: themeColors.textSecondary }]}>
                        {t('training.sessionSummary').toUpperCase()}
                      </Text>
                      <Text style={[styles.summaryTitle, { color: themeColors.textPrimary }]}>
                        {name || t('training.newRoutine')}
                      </Text>
                      {(workoutGoal || modality) && (
                        <Text numberOfLines={2} style={[styles.summaryMetadata, { color: themeColors.textSecondary }]}>
                          {[
                            workoutGoal ? getOptionLabel('strength', workoutGoal, 'goal') : null,
                            modality ? getOptionLabel('strength', modality, 'modality') : null,
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </Text>
                      )}
                    </View>
                  </View>

                  <View style={styles.summaryMetricsRow}>
                    <View style={[styles.summaryMetricCard, { backgroundColor: `${themeColors.primary}0D` }]}>
                      <Dumbbell size={18} color={themeColors.primary} />
                      <Text style={[styles.summaryMetricValue, { color: themeColors.textPrimary }]}>
                        {exercises.length}
                      </Text>
                      <Text style={[styles.summaryMetricLabel, { color: themeColors.textSecondary }]}>
                        {t('training.totalExercises')}
                      </Text>
                    </View>

                    <View style={[styles.summaryMetricCard, { backgroundColor: `${themeColors.primary}12` }]}>
                      <InfinityIcon size={18} color={themeColors.primary} />
                      <Text style={[styles.summaryMetricValue, { color: themeColors.textPrimary }]}>{totalSets}</Text>
                      <Text style={[styles.summaryMetricLabel, { color: themeColors.textSecondary }]}>
                        {t('training.totalSets')}
                      </Text>
                    </View>
                  </View>

                  <TouchableOpacity
                    accessibilityRole="button"
                    accessibilityLabel={exercises.length > 0 ? t('training.editWorkout') : t('training.designWorkout')}
                    activeOpacity={0.86}
                    style={[styles.designButton, { backgroundColor: themeColors.primary }]}
                    onPress={openWorkoutBuilder}
                  >
                    <Zap size={17} color="#FFFFFF" />
                    <Text style={styles.designButtonText}>
                      {exercises.length > 0 ? t('training.editWorkout') : t('training.designWorkout')}
                    </Text>
                  </TouchableOpacity>
                </GlassCard>

                {/* Schedule Day Selector */}
                <View style={styles.formGroup}>
                  <Text style={[styles.label, dynamicStyles.sublabel]}>{t('training.scheduleDay')}</Text>
                  <WeekDaySelector
                    selectedDays={isRecurring ? selectedDays : oneOffWeekday === null ? [] : [oneOffWeekday]}
                    onDaysChange={handleScheduleDaysChange}
                    isRecurring={isRecurring}
                    showDays={shouldShowScheduleDays({
                      isRecurring,
                      isImportedDateDriven: isImportedDateDrivenTemplate,
                    })}
                    onToggleRecurring={() => {
                      const nextRecurring = !isRecurring;
                      setIsRecurring(nextRecurring);
                      if (!nextRecurring) setSelectedDays([]);
                    }}
                    singleSelect={true}
                  />
                  {!isRecurring && !isImportedDateDrivenTemplate && (
                    <OneOffDateSelector
                      value={oneOffDate}
                      onChange={date => {
                        setSelectedDays([]);
                        setOneOffDate(date);
                      }}
                      label={t('training.oneOffDateLabel')}
                      placeholder={t('training.oneOffDatePlaceholder')}
                    />
                  )}
                  {isRecurring ? (
                    <View style={styles.templateLifecycleCard}>
                      <OneOffDateSelector
                        value={recurrenceStartDate}
                        onChange={date => {
                          const normalizedDate = getFirstWeeklyOccurrenceOnOrAfter(date, selectedDays[0] ?? null);
                          setRecurrenceStartDate(normalizedDate || date);
                        }}
                        label={t('training.startDate')}
                        placeholder={t('common.select')}
                      />
                      <View style={styles.formRow}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                          <Clock size={16} color={themeColors.textSecondary} />
                          <Text style={[styles.rowLabel, { color: themeColors.textPrimary }]}>
                            {t('training.recurrenceWeeks')}
                          </Text>
                        </View>
                        <TextInput
                          style={[styles.rowInput, { color: themeColors.textPrimary, textAlign: 'right' }]}
                          value={recurrenceWeeks}
                          onChangeText={value => setRecurrenceWeeks(value.replace(/[^0-9]/g, ''))}
                          placeholder={t('training.indefinite')}
                          placeholderTextColor={themeColors.textSecondary}
                          {...INTEGER_INPUT_PROPS}
                        />
                      </View>
                      {isValidDateOnly(recurrenceEndDate) && (
                        <Text style={{ color: themeColors.textSecondary, fontSize: 13, fontStyle: 'italic' }}>
                          {t('training.recurrenceEndDateCalculated', {
                            date: format(new Date(`${recurrenceEndDate}T00:00:00`), 'EEEE, dd/MM/yyyy', {
                              locale: getDateFnsLocale(),
                            }),
                          })}
                        </Text>
                      )}
                      <View style={styles.lifecycleToggleRow}>
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.lifecycleToggleLabel, dynamicStyles.label]}>
                            {t('training.autoDeleteExpiredTemplates')}
                          </Text>
                          <Text style={[styles.lifecycleToggleDescription, dynamicStyles.sublabel]}>
                            {t('training.autoDeleteExpiredTemplatesDesc')}
                          </Text>
                        </View>
                        <AlzanSwitch value={autoDeleteAfterEnd} onValueChange={setAutoDeleteAfterEnd} />
                      </View>
                    </View>
                  ) : (
                    <View style={styles.templateLifecycleCard}>
                      <Text style={[styles.label, dynamicStyles.sublabel]}>{t('training.templateEndDate')}</Text>
                      <TextInput
                        style={[styles.lifecycleInput, dynamicStyles.input]}
                        value={recurrenceEndDate}
                        onChangeText={setRecurrenceEndDate}
                        placeholder="YYYY-MM-DD"
                        placeholderTextColor={themeColors.textSecondary}
                        autoCapitalize="none"
                        autoCorrect={false}
                      />
                      {isValidDateOnly(recurrenceEndDate) && (
                        <Text style={{ color: themeColors.textSecondary, fontSize: 13, fontStyle: 'italic' }}>
                          {t('training.recurrenceEndDateCalculated', {
                            date: format(new Date(`${recurrenceEndDate}T00:00:00`), 'EEEE, dd/MM/yyyy', {
                              locale: getDateFnsLocale(),
                            }),
                          })}
                        </Text>
                      )}
                      <View style={styles.lifecycleToggleRow}>
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.lifecycleToggleLabel, dynamicStyles.label]}>
                            {t('training.autoDeleteExpiredTemplates')}
                          </Text>
                          <Text style={[styles.lifecycleToggleDescription, dynamicStyles.sublabel]}>
                            {t('training.autoDeleteExpiredTemplatesDesc')}
                          </Text>
                        </View>
                        <AlzanSwitch value={autoDeleteAfterEnd} onValueChange={setAutoDeleteAfterEnd} />
                      </View>
                    </View>
                  )}
                </View>
              </>
            ) : (
              <>
                <View style={styles.builderSummaryStrip}>
                  <View style={styles.builderMetricsRow}>
                    <View style={[styles.builderMetricCard, { backgroundColor: `${themeColors.primary}0A` }]}>
                      <View style={styles.builderMetricTopRow}>
                        <Dumbbell size={14} color={themeColors.primary} />
                        <Text style={[styles.builderMetricValue, { color: themeColors.textPrimary }]}>
                          {exercises.length}
                        </Text>
                      </View>
                      <Text style={[styles.builderMetricLabel, { color: themeColors.textSecondary }]}>
                        {t('training.totalExercises').toUpperCase()}
                      </Text>
                    </View>
                    <View style={[styles.builderMetricCard, { backgroundColor: `${themeColors.primary}12` }]}>
                      <View style={styles.builderMetricTopRow}>
                        <InfinityIcon size={14} color={themeColors.primary} />
                        <Text style={[styles.builderMetricValue, { color: themeColors.textPrimary }]}>{totalSets}</Text>
                      </View>
                      <Text style={[styles.builderMetricLabel, { color: themeColors.textSecondary }]}>
                        {t('training.totalSets').toUpperCase()}
                      </Text>
                    </View>
                  </View>
                  <TouchableOpacity
                    onPress={handleAddExercise}
                    style={[styles.builderAddChip, { backgroundColor: themeColors.primary }]}
                  >
                    <Plus size={16} color="#FFFFFF" />
                    <Text style={[styles.builderChipText, { color: '#FFFFFF' }]}>{t('nutrition.add')}</Text>
                  </TouchableOpacity>
                </View>

                {exercises.map((item, index) => {
                  const isInSuperset = isExerciseInSuperset(index);
                  const connectorActive = isConnectorActive(index);
                  const exerciseKey = getExerciseRenderKey(item, index);
                  const isWarmupExercise = !!item.is_warmup;
                  const dropSetMode = item.drop_set_mode || 'none';
                  const isDropSetExercise = !isWarmupExercise && dropSetMode !== 'none';
                  const exerciseCardKey = `${exerciseKey}-${isWarmupExercise ? 'warmup' : dropSetMode}`;
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
                                  borderColor: '#FF950066',
                                },
                              ],
                              isInSuperset &&
                                !isWarmupExercise && [
                                  styles.exerciseCardSuperset,
                                  {
                                    borderColor: themeColors.primary + '66',
                                  },
                                ],
                              isDropSetExercise && [
                                styles.exerciseCardDropSet,
                                {
                                  borderColor: '#5856D666',
                                },
                              ],
                            ]}
                          >
                            {/* Superset animated background fill */}
                            <Animated.View
                              pointerEvents="none"
                              style={[
                                styles.supersetFillOverlay,
                                {
                                  width: fillAnimation.interpolate({
                                    inputRange: [0, 1],
                                    outputRange: ['0%', '100%'],
                                  }),
                                  backgroundColor: themeColors.primary + '1A',
                                },
                              ]}
                            />
                            {/* Warmup animated background fill */}
                            <Animated.View
                              pointerEvents="none"
                              style={[
                                styles.supersetFillOverlay,
                                {
                                  width: (
                                    warmupFillAnimations.current[index] || new Animated.Value(isWarmupExercise ? 1 : 0)
                                  ).interpolate({
                                    inputRange: [0, 1],
                                    outputRange: ['0%', '100%'],
                                  }),
                                  backgroundColor: '#FF95001A',
                                },
                              ]}
                            />
                            {isDropSetExercise && (
                              <View
                                pointerEvents="none"
                                style={[styles.dropSetFillOverlay, { backgroundColor: '#5856D61A' }]}
                              />
                            )}
                            <View style={styles.exerciseCardContent}>
                              {/* Exercise name row with index badge */}
                              <View style={styles.exerciseNameRow}>
                                <View
                                  style={[
                                    styles.exerciseIndexBadge,
                                    {
                                      backgroundColor: isWarmupExercise
                                        ? '#FF950020'
                                        : isDropSetExercise
                                          ? '#5856D620'
                                          : `${themeColors.primary}18`,
                                    },
                                  ]}
                                >
                                  <Text
                                    style={[
                                      styles.exerciseIndexText,
                                      {
                                        color: isWarmupExercise
                                          ? '#FF9500'
                                          : isDropSetExercise
                                            ? '#5856D6'
                                            : themeColors.primary,
                                      },
                                    ]}
                                  >
                                    {isWarmupExercise ? 'W' : isDropSetExercise ? 'D' : index + 1}
                                  </Text>
                                </View>
                                <Text style={[styles.exerciseName, dynamicStyles.title]} numberOfLines={2}>
                                  {getExerciseDisplayName(item.exercise)}
                                </Text>
                              </View>

                              {/* Action buttons row */}
                              <View style={styles.exerciseActionsBar}>
                                <View style={styles.moveButtons}>
                                  {index > 0 && (
                                    <TouchableOpacity
                                      onPress={() => handleMoveExercise(index, 'up')}
                                      style={[styles.actionBtn, { backgroundColor: `${themeColors.textSecondary}0D` }]}
                                    >
                                      <ChevronUp size={16} color={themeColors.textSecondary} />
                                    </TouchableOpacity>
                                  )}
                                  {index < exercises.length - 1 && (
                                    <TouchableOpacity
                                      onPress={() => handleMoveExercise(index, 'down')}
                                      style={[styles.actionBtn, { backgroundColor: `${themeColors.textSecondary}0D` }]}
                                    >
                                      <ChevronDown size={16} color={themeColors.textSecondary} />
                                    </TouchableOpacity>
                                  )}
                                </View>
                                <View style={styles.exerciseActionsRight}>
                                  <TouchableOpacity
                                    onPress={() => toggleExerciseWarmup(index)}
                                    style={[
                                      styles.warmupExerciseToggle,
                                      isWarmupExercise && styles.warmupExerciseToggleActive,
                                    ]}
                                    activeOpacity={0.7}
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
                                  <TouchableOpacity
                                    onPress={() => toggleExerciseDropSet(index)}
                                    style={[
                                      styles.dropSetExerciseToggle,
                                      isDropSetExercise && styles.dropSetExerciseToggleActive,
                                    ]}
                                    activeOpacity={0.7}
                                  >
                                    <Text
                                      style={[
                                        styles.warmupExerciseToggleText,
                                        { color: isDropSetExercise ? '#5856D6' : themeColors.textSecondary },
                                      ]}
                                    >
                                      {isDropSetExercise
                                        ? `${t('training.dropSet')} · ${
                                            dropSetMode === 'all' ? t('training.dropSetAll') : t('training.dropSetLast')
                                          }`
                                        : t('training.dropSet')}
                                    </Text>
                                  </TouchableOpacity>
                                  <TouchableOpacity onPress={() => setHelpModalVisible(true)} style={styles.actionBtn}>
                                    <HelpCircle size={16} color={themeColors.textSecondary} />
                                  </TouchableOpacity>
                                  <TouchableOpacity
                                    onPress={() => handleRemoveExercise(index)}
                                    style={[styles.actionBtn, { backgroundColor: `${themeColors.danger}0D` }]}
                                  >
                                    <Trash2 size={16} color={themeColors.danger} />
                                  </TouchableOpacity>
                                </View>
                              </View>

                              {/* Targets grid */}
                              <View
                                style={[
                                  styles.targetsRow,
                                  {
                                    backgroundColor: `${themeColors.textSecondary}06`,
                                    borderRadius: borderRadius.m,
                                    padding: spacing.s,
                                  },
                                ]}
                              >
                                <View style={styles.targetField}>
                                  <Text style={[styles.targetLabel, dynamicStyles.sublabel]}>
                                    {t('training.setsLabel')}
                                  </Text>
                                  <TextInput
                                    style={[styles.targetInput, dynamicStyles.input]}
                                    {...INTEGER_INPUT_PROPS}
                                    value={String(item.target_sets || '')}
                                    onChangeText={v => updateExerciseTarget(index, 'target_sets', v)}
                                    inputAccessoryViewID={inputAccessoryViewID}
                                  />
                                </View>
                                {isTimeBasedExercise(item.exercise) ? (
                                  <View style={styles.targetField}>
                                    <Text style={[styles.targetLabel, dynamicStyles.sublabel]}>
                                      {t('training.timeSeconds')}
                                    </Text>
                                    <TextInput
                                      style={[styles.targetInput, dynamicStyles.input]}
                                      {...INTEGER_INPUT_PROPS}
                                      placeholder="30"
                                      placeholderTextColor={themeColors.textSecondary + '50'}
                                      value={String(item.target_reps_min || '')}
                                      onChangeText={v => updateExerciseTarget(index, 'target_reps_min', v)}
                                      inputAccessoryViewID={inputAccessoryViewID}
                                    />
                                  </View>
                                ) : (
                                  <View style={styles.targetField}>
                                    <Text style={[styles.targetLabel, dynamicStyles.sublabel]}>
                                      {t('training.repsColon')}
                                    </Text>
                                    <TextInput
                                      style={[styles.targetInput, dynamicStyles.input]}
                                      {...INTEGER_INPUT_PROPS}
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
                                    {...INTEGER_INPUT_PROPS}
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
                  style={[
                    styles.addLargeBtn,
                    { borderColor: themeColors.primary + '30', backgroundColor: `${themeColors.primary}08` },
                  ]}
                  onPress={handleAddExercise}
                  activeOpacity={0.7}
                >
                  <View style={[styles.addLargeIconCircle, { backgroundColor: `${themeColors.primary}18` }]}>
                    <Plus size={20} color={themeColors.primary} />
                  </View>
                  <Text style={[styles.addLargeBtnText, { color: themeColors.primary }]}>
                    {t('training.addExercise')}
                  </Text>
                </TouchableOpacity>
              </>
            )}
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
                <Text style={[styles.helpLabel, { color: '#5856D6' }]}>D</Text>
                <Text style={[styles.helpText, { color: themeColors.textPrimary }]}>
                  {t('training.dropSetInstruction')}
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

        {/* Goal Selector Modal */}
        <Modal
          animationType="slide"
          transparent={true}
          visible={goalModalVisible}
          onRequestClose={() => setGoalModalVisible(false)}
        >
          <Pressable style={styles.bottomModalOverlay} onPress={() => setGoalModalVisible(false)}>
            <Pressable
              style={[styles.bottomModalCard, { backgroundColor: themeColors.background }]}
              onPress={e => e.stopPropagation()}
            >
              <View style={styles.modalHandle} />
              <Text style={[styles.bottomModalTitle, { color: themeColors.textPrimary }]}>
                {t('training.mainGoal')}
              </Text>

              <ScrollView style={styles.goalsScroll} showsVerticalScrollIndicator={false}>
                {getOptions('strength', 'goal').map(goal => {
                  const isSelected = workoutGoal === goal.option_key;

                  return (
                    <View key={goal.option_key}>
                      <TouchableOpacity
                        style={[
                          styles.goalOptionRow,
                          isSelected && {
                            backgroundColor: themeColors.primary + '15',
                            borderColor: themeColors.primary,
                          },
                        ]}
                        onPress={() => {
                          setWorkoutGoal(goal.option_key);
                          setGoalModalVisible(false);
                        }}
                      >
                        <Text
                          style={[
                            styles.goalOptionTitle,
                            { color: themeColors.textPrimary },
                            isSelected && { color: themeColors.primary },
                          ]}
                        >
                          {getOptionLabel('strength', goal.option_key, 'goal')}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  );
                })}
              </ScrollView>

              <View style={styles.modalActionRow}>
                <TouchableOpacity
                  style={[styles.modalActionBtn, styles.cancelActionBtn, { borderColor: themeColors.border, flex: 1 }]}
                  onPress={() => setGoalModalVisible(false)}
                >
                  <Text style={[styles.cancelActionBtnText, { color: themeColors.textPrimary }]}>
                    {t('common.cancel')}
                  </Text>
                </TouchableOpacity>
              </View>
            </Pressable>
          </Pressable>
        </Modal>

        {/* Modality Selector Modal */}
        <Modal
          animationType="slide"
          transparent={true}
          visible={modalityModalVisible}
          onRequestClose={() => setModalityModalVisible(false)}
        >
          <Pressable style={styles.bottomModalOverlay} onPress={() => setModalityModalVisible(false)}>
            <Pressable
              style={[styles.bottomModalCard, { backgroundColor: themeColors.background }]}
              onPress={e => e.stopPropagation()}
            >
              <View style={styles.modalHandle} />
              <Text style={[styles.bottomModalTitle, { color: themeColors.textPrimary }]}>
                {getGroupLabel('strength', 'modality')}
              </Text>

              <ScrollView style={styles.goalsScroll} showsVerticalScrollIndicator={false}>
                {getOptions('strength', 'modality').map(typeOption => {
                  const isSelected = modality === typeOption.option_key;
                  return (
                    <TouchableOpacity
                      key={typeOption.option_key}
                      style={[
                        styles.surfaceOptionRow,
                        isSelected && { backgroundColor: themeColors.primary + '15', borderColor: themeColors.primary },
                      ]}
                      onPress={() => {
                        setModality(typeOption.option_key);
                        setModalityModalVisible(false);
                      }}
                    >
                      <Text
                        style={[
                          styles.surfaceOptionText,
                          { color: themeColors.textPrimary },
                          isSelected && { color: themeColors.primary },
                        ]}
                      >
                        {getOptionLabel('strength', typeOption.option_key, 'modality')}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              <View style={styles.modalActionRow}>
                <TouchableOpacity
                  style={[styles.modalActionBtn, styles.cancelActionBtn, { borderColor: themeColors.border, flex: 1 }]}
                  onPress={() => setModalityModalVisible(false)}
                >
                  <Text style={[styles.cancelActionBtnText, { color: themeColors.textPrimary }]}>
                    {t('common.cancel')}
                  </Text>
                </TouchableOpacity>
              </View>
            </Pressable>
          </Pressable>
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
  templateLifecycleCard: {
    marginTop: spacing.m,
    padding: spacing.m,
    borderRadius: borderRadius.m,
    backgroundColor: 'rgba(127, 127, 127, 0.08)',
  },
  lifecycleInput: {
    height: 44,
    borderWidth: 1,
    borderRadius: borderRadius.s,
    paddingHorizontal: spacing.m,
    marginTop: spacing.xs,
  },
  lifecycleToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.m,
    gap: spacing.m,
  },
  lifecycleToggleLabel: {
    fontSize: 15,
    fontWeight: '600',
  },
  lifecycleToggleDescription: {
    fontSize: 12,
    marginTop: 3,
    lineHeight: 17,
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
  builderSummaryStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.m,
    gap: 12,
  },
  builderMetricsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  builderMetricCard: {
    flex: 1,
    borderRadius: 12,
    padding: 10,
    justifyContent: 'center',
  },
  builderMetricTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  builderMetricValue: {
    fontSize: 16,
    fontWeight: '700',
  },
  builderMetricLabel: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginTop: 4,
  },
  builderAddChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 100,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  builderChipText: {
    fontSize: 14,
    fontWeight: '700',
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
    marginBottom: spacing.s,
    padding: spacing.m,
    overflow: 'hidden',
  },
  exerciseCardWarmup: {
    borderWidth: 1.5,
  },
  exerciseCardDropSet: {
    borderWidth: 1.5,
  },
  exerciseCardSuperset: {
    borderWidth: 1.5,
  },
  exerciseNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  exerciseIndexBadge: {
    width: 30,
    height: 30,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  exerciseIndexText: {
    fontSize: 13,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  exerciseActionsBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 8,
    marginBottom: 10,
  },
  exerciseActionsRight: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    flexWrap: 'wrap',
    flex: 1,
    gap: 6,
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
    flex: 1,
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
  dropSetFillOverlay: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: '100%',
    borderRadius: borderRadius.m,
  },
  actionButtonsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.m,
  },
  actionBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  moveButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
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
    flex: 1,
  },
  warmupExerciseToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(153,153,153,0.35)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    minWidth: 64,
    justifyContent: 'center',
  },
  warmupExerciseToggleActive: {
    borderColor: 'rgba(255,149,0,0.6)',
    backgroundColor: 'rgba(255,149,0,0.14)',
    shadowColor: '#FF9500',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 3,
  },
  dropSetExerciseToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(153,153,153,0.35)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    minWidth: 64,
    justifyContent: 'center',
  },
  dropSetExerciseToggleActive: {
    borderColor: 'rgba(88,86,214,0.6)',
    backgroundColor: 'rgba(88,86,214,0.14)',
    shadowColor: '#5856D6',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.22,
    shadowRadius: 6,
    elevation: 3,
  },
  warmupExerciseToggleText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  targetsRow: {
    flexDirection: 'row',
    gap: spacing.s,
  },
  targetField: {
    flex: 1,
  },
  targetLabel: {
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.3,
    marginBottom: 3,
    textAlign: 'center',
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
    paddingVertical: spacing.m,
    paddingHorizontal: spacing.l,
    borderWidth: 1.5,
    borderRadius: borderRadius.l,
    borderStyle: 'dashed',
    marginTop: spacing.m,
    gap: 10,
  },
  addLargeIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addLargeBtnText: {
    fontSize: 15,
    fontWeight: '600',
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
  profileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.l,
    marginTop: spacing.s,
  },
  profileAvatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.m,
  },
  profileTextContainer: {
    flex: 1,
  },
  profileTitle: {
    fontSize: 22,
    fontWeight: '700',
  },
  profileSubtitle: {
    fontSize: 13,
    marginTop: 2,
  },
  formBlock: {
    padding: spacing.m,
    marginBottom: spacing.l,
    borderRadius: borderRadius.l,
  },
  blockTitle: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 1,
    marginBottom: 6,
  },
  formRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.m,
    borderBottomWidth: 1,
    borderColor: 'rgba(150,150,150,0.1)',
  },
  rowLabel: {
    fontSize: 15,
    fontWeight: '500',
  },
  rowInput: {
    flex: 1,
    fontSize: 15,
    textAlign: 'right',
    padding: 0,
    marginLeft: spacing.m,
  },
  rowRightValue: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  rowValueText: {
    fontSize: 15,
  },
  rowTextArea: {
    height: 80,
    borderWidth: 1,
    borderRadius: borderRadius.m,
    padding: spacing.s,
    fontSize: 14,
    textAlignVertical: 'top',
    marginTop: 4,
  },
  bottomModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  bottomModalCard: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: spacing.l,
    maxHeight: '80%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 10,
  },
  bottomModalTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: spacing.m,
  },
  goalsScroll: {
    marginBottom: spacing.l,
  },
  goalOptionRow: {
    padding: spacing.m,
    borderRadius: borderRadius.m,
    borderWidth: 1,
    borderColor: 'transparent',
    marginBottom: spacing.s,
  },
  goalOptionTitle: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 2,
  },
  goalOptionDesc: {
    fontSize: 12,
    lineHeight: 16,
  },
  surfaceOptionRow: {
    paddingVertical: spacing.m,
    paddingHorizontal: spacing.l,
    borderRadius: borderRadius.m,
    borderWidth: 1,
    borderColor: 'transparent',
    marginBottom: spacing.s,
  },
  surfaceOptionText: {
    fontSize: 15,
    fontWeight: '600',
  },
  modalHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(150,150,150,0.3)',
    alignSelf: 'center',
    marginBottom: 16,
  },
  modalActionRow: {
    flexDirection: 'row',
    gap: spacing.m,
  },
  modalActionBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  cancelActionBtn: {
    backgroundColor: 'transparent',
  },
  cancelActionBtnText: {
    fontWeight: '600',
  },
  summaryCard: {
    padding: spacing.m,
    borderWidth: 1,
    borderRadius: borderRadius.l,
    marginBottom: spacing.l,
  },
  summaryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.m,
  },
  summaryIconContainer: {
    width: 54,
    height: 54,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.m,
  },
  summaryTitleContainer: {
    flex: 1,
  },
  summaryOverline: {
    fontSize: 10,
    letterSpacing: 0.9,
    fontWeight: '700',
  },
  summaryTitle: {
    fontSize: 20,
    marginTop: 2,
    fontWeight: '700',
  },
  summaryMetadata: {
    fontSize: 12,
    marginTop: 3,
    lineHeight: 17,
  },
  summaryMetricsRow: {
    flexDirection: 'row',
    gap: spacing.s,
  },
  summaryMetricCard: {
    flex: 1,
    minHeight: 76,
    borderRadius: borderRadius.m,
    padding: 12,
    justifyContent: 'space-between',
  },
  summaryMetricValue: {
    fontSize: 18,
    lineHeight: 22,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    marginTop: 8,
  },
  summaryMetricLabel: {
    fontSize: 9,
    letterSpacing: 0.5,
    fontWeight: '700',
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
  designButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 15,
  },
});
