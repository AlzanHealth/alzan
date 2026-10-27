import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Modal,
  KeyboardAvoidingView,
  Platform,
  Animated,
  Easing,
  LayoutAnimation,
  UIManager,
  ScrollView,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute, useFocusEffect, RouteProp } from '@react-navigation/native';
import { TrainingScreenNavigationProp, TrainingStackParamList } from '../../types/navigation.types';
import { GlassCard } from '../../components/GlassCard';
import { getSetTableLayout, TRAINING_CONTROL_SIZE } from './helpers/trainingFormLayout';
import { spacing, borderRadius, shadows, darkShadows } from '../../theme';
import { ExerciseWithType, useActiveWorkout } from '../../hooks/useActiveWorkout';
import { useAuth } from '../../context/AuthContext';
import { useActiveWorkoutDraft } from '../../hooks/useActiveWorkoutDraft';
import { ActiveWorkoutDraft, emptyActiveWorkoutDraft } from './helpers/activeWorkoutDraft';
import { WorkoutOrganizer } from './components/WorkoutOrganizer';
import { workoutSetProgress } from './helpers/workoutSetProgress';
import {
  getWorkoutSetMetricValue,
  getWorkoutSetMetrics,
  prepareWorkoutSetIds,
  saveWorkoutSequentially,
} from './helpers/workoutFinalization';
import {
  effectiveWorkoutExercises,
  addWorkoutExercise,
  nextWorkoutAutoSet,
  substitutionBlockReason,
  substituteWorkoutExercise,
} from './helpers/workoutOrganization';
import { useUserPreferences } from '../../hooks/useUserPreferences';
import { RestTimer } from '../../components/RestTimer';
import { ExecutionTimer } from '../../components/ExecutionTimer';
import {
  ChevronDown,
  ChevronUp,
  Plus,
  MoreVertical,
  X,
  Check,
  HelpCircle,
  Info,
  Trash2,
  Infinity as InfinityIcon,
} from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTrainingSettings } from '../../hooks/useTrainingSettings';
import { useTrainingStyles } from '../../hooks/useTrainingStyles';
import { LinearGradient } from 'expo-linear-gradient';
import { WorkoutDurationTimer } from '../../components/WorkoutDurationTimer';
import { ExerciseWithDetails } from '../../types/training';
import { ActivitySessionSupersetLink, WorkoutTemplateExercise } from '../../types/requests.types';
import { Alert } from '../../components/common/Alert';
import { useTranslation } from 'react-i18next';
import { isTimeBasedExerciseType, getLocalizedExerciseName } from '../../services/localization';
import { getDefaultGymExerciseTargets } from '../../modules/training/helpers/gymExerciseDefaults.helper';
import {
  buildGymSetModeDefaults,
  getGymSetModeLabel,
  getNextGymSetMode,
  getWorkoutSetTypeForGymSetMode,
} from './helpers/gymSetMode.helper';
import { DECIMAL_INPUT_PROPS, INTEGER_INPUT_PROPS } from '../../utils/numericInput';

export type WorkoutTemplateExerciseWithDetails = Omit<WorkoutTemplateExercise, 'target_rir_by_set'> & {
  target_rir_by_set?: Array<number | null> | null;
  exercise: ExerciseWithType | null;
};
type AutoPlayQueue = {
  exerciseId: string;
  nextSetNumber: number;
};

const ACTIVE_SESSION_DURATION_PERSIST_INTERVAL_SECONDS = 15;

const ActiveWorkoutDuration = React.memo(
  ({
    sessionId,
    textColor,
    onDurationChange,
  }: {
    sessionId?: string;
    textColor: string;
    onDurationChange: (seconds: number) => void;
  }) => {
    const [duration, setDuration] = useState(0);
    const durationRef = useRef(0);

    useEffect(() => {
      let mounted = true;

      const loadDuration = async () => {
        try {
          const stored = sessionId ? await AsyncStorage.getItem(`active_session_duration_${sessionId}`) : null;
          const nextDuration = stored ? parseInt(stored, 10) : 0;
          if (!mounted) return;
          const safeDuration = Number.isFinite(nextDuration) ? nextDuration : 0;
          durationRef.current = safeDuration;
          setDuration(safeDuration);
          onDurationChange(safeDuration);
        } catch (error) {
          console.log(error);
          if (!mounted) return;
          durationRef.current = 0;
          setDuration(0);
          onDurationChange(0);
        }
      };

      void loadDuration();

      return () => {
        mounted = false;
      };
    }, [onDurationChange, sessionId]);

    useFocusEffect(
      React.useCallback(() => {
        if (!sessionId) return undefined;

        const interval = setInterval(() => {
          setDuration(prev => {
            const nextDuration = prev + 1;
            durationRef.current = nextDuration;
            onDurationChange(nextDuration);

            if (nextDuration % ACTIVE_SESSION_DURATION_PERSIST_INTERVAL_SECONDS === 0) {
              void AsyncStorage.setItem(`active_session_duration_${sessionId}`, String(nextDuration));
            }

            return nextDuration;
          });
        }, 1000);

        return () => {
          clearInterval(interval);
          void AsyncStorage.setItem(`active_session_duration_${sessionId}`, String(durationRef.current));
        };
      }, [onDurationChange, sessionId]),
    );

    return <WorkoutDurationTimer seconds={duration} style={{ color: textColor }} />;
  },
);

// ... (Rest of imports or utility functions if any)
const buildSupersetLinksFromOrderedExercises = (orderedExercises: WorkoutTemplateExerciseWithDetails[]) => {
  const links = new Set<string>();
  orderedExercises.forEach((exercise, index) => {
    const nextExerciseId = exercise.superset_next_exercise_id;
    if (!nextExerciseId) return;

    const nextExercise = orderedExercises[index + 1];
    if (nextExercise?.id === nextExerciseId) {
      links.add(`${exercise.exercise_id}|${nextExercise.exercise_id}`);
    }
  });

  return links;
};

const buildSupersetLinksFromSessionLinks = (
  orderedExercises: WorkoutTemplateExerciseWithDetails[],
  sessionLinks: ActivitySessionSupersetLink[],
) => {
  const links = new Set<string>();
  sessionLinks.forEach(link => {
    links.add(`${link.from_exercise_id}|${link.to_exercise_id}`);
  });

  return links;
};

export const ActiveWorkoutScreen = () => {
  const { width: viewportWidth } = useWindowDimensions();
  const setTableLayout = getSetTableLayout(viewportWidth);
  const { t } = useTranslation();
  const { styles: dynamicStyles, colors: themeColors, isDark } = useTrainingStyles();
  const navigation = useNavigation<TrainingScreenNavigationProp>();
  const route = useRoute<RouteProp<TrainingStackParamList, 'ActiveWorkout'>>();
  const { sessionId } = route.params || {};
  const insets = useSafeAreaInsets();

  const [supplementalExerciseIds, setSupplementalExerciseIds] = useState<string[]>([]);
  const {
    activeSessionData,
    isLoading,
    isError,
    refetch,
    logSet,
    finishSession,
    cancelSession,
    saveSessionSupersetLinks,
  } = useActiveWorkout(sessionId, supplementalExerciseIds);

  const { preferences, toDisplayWeight, toDbWeight } = useUserPreferences();
  const { settings } = useTrainingSettings();

  const { user } = useAuth();
  const seed = useMemo<ActiveWorkoutDraft | undefined>(() => {
    if (!activeSessionData || activeSessionData.session.user_id !== user?.id) return undefined;
    const items = [...activeSessionData.exercises].sort((a, b) => a.order_index - b.order_index);
    const initial = emptyActiveWorkoutDraft();
    initial.exerciseOrder = items.map(item => item.exercise_id);
    initial.setModes = buildGymSetModeDefaults(items);
    initial.supersetLinks = Array.from(
      activeSessionData.sessionSupersetLinks.length
        ? buildSupersetLinksFromSessionLinks(items, activeSessionData.sessionSupersetLinks)
        : buildSupersetLinksFromOrderedExercises(items),
    );
    items.forEach(item => {
      for (let number = 1; number <= (item.target_sets ?? 3); number++) {
        initial.inputs[`${item.exercise_id}-${number}`] = { weight: '', reps: String(item.target_reps_min ?? '') };
      }
    });
    activeSessionData.completedSets.forEach(set => {
      const key = `${set.exercise_id}-${set.set_number}`;
      initial.completedSets.push(key);
      initial.inputs[key] = {
        weight: String(toDisplayWeight(set.weight_kg ?? 0)),
        reps: String(
          getWorkoutSetMetricValue(
            set,
            items.find(item => item.exercise_id === set.exercise_id)?.exercise?.exercise_type_code,
          ) ?? '',
        ),
      };
      initial.setModes[key] = set.is_warmup ? 'warmup' : set.set_type === 'drop_set' ? 'drop_set' : 'normal';
    });
    return initial;
  }, [user?.id, activeSessionData?.session.id, activeSessionData?.exercises, activeSessionData?.completedSets]);
  const persistence = useActiveWorkoutDraft(user?.id, sessionId, seed);
  const { draft, update: updateDraft } = persistence;
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const inputs = draft.inputs;
  const setModes = draft.setModes;
  const extraSets = draft.extraSets;
  const hiddenExercises = new Set(draft.hiddenExercises);
  const localCompletedSets = new Set(draft.completedSets);
  const supersetLinks = new Set(draft.supersetLinks);
  const fieldSetter =
    <K extends keyof ActiveWorkoutDraft>(key: K) =>
    (value: React.SetStateAction<ActiveWorkoutDraft[K]>) =>
      updateDraft(prev => ({
        ...prev,
        [key]:
          typeof value === 'function'
            ? (value as (current: ActiveWorkoutDraft[K]) => ActiveWorkoutDraft[K])(prev[key])
            : value,
      }));
  const setInputs = fieldSetter('inputs');
  const setSetModes = fieldSetter('setModes');
  const setExtraSets = fieldSetter('extraSets');
  const setExerciseOrder = fieldSetter('exerciseOrder');
  const setCollection = (
    key: 'hiddenExercises' | 'completedSets' | 'supersetLinks',
    value: React.SetStateAction<Set<string>>,
  ) =>
    updateDraft(prev => {
      const next = typeof value === 'function' ? value(new Set(prev[key])) : value;
      return { ...prev, [key]: Array.from(next) };
    });
  const setHiddenExercises = (value: React.SetStateAction<Set<string>>) => setCollection('hiddenExercises', value);
  const setLocalCompletedSets = (value: React.SetStateAction<Set<string>>) => setCollection('completedSets', value);
  const setSupersetLinks = (value: React.SetStateAction<Set<string>>) => setCollection('supersetLinks', value);
  const [isCompletingAll, setIsCompletingAll] = useState(false);
  const [timerVisible, setTimerVisible] = useState(false);
  const [timerSeconds, setTimerSeconds] = useState(60);
  const [helpModalVisible, setHelpModalVisible] = useState(false);
  const [executionTimerVisible, setExecutionTimerVisible] = useState(false);
  const [executionTimerExerciseId, setExecutionTimerExerciseId] = useState<string | null>(null);
  const [executionTimerSeconds, setExecutionTimerSeconds] = useState(30);
  const [pendingRestSeconds, setPendingRestSeconds] = useState<number | null>(null);
  const [pendingAutoPlayQueue, setPendingAutoPlayQueue] = useState<AutoPlayQueue | null>(null);
  const [menuVisibleForExercise, setMenuVisibleForExercise] = useState<string | null>(null);
  const [collapsedExerciseIds, setCollapsedExerciseIds] = useState<Set<string>>(() => new Set());
  useEffect(() => setCollapsedExerciseIds(new Set()), [sessionId]);
  const dbExercises = activeSessionData?.exercises ?? [];
  const exercises = effectiveWorkoutExercises(draft, dbExercises);
  const orderedExerciseIds = draft.exerciseOrder;
  const visibleExercises = orderedExerciseIds
    .map(id => exercises.find(item => item.exercise_id === id))
    .filter((item): item is WorkoutTemplateExerciseWithDetails => !!item && !hiddenExercises.has(item.exercise_id));
  useEffect(() => {
    setSupplementalExerciseIds(draft.adhocExercises.map(item => item.exercise_id));
  }, [draft.adhocExercises]);

  // Folding is presentation-only. Never fold automatically when a set is completed,
  // and reveal the table again if new pending sets or an execution timer appear.
  useEffect(() => {
    setCollapsedExerciseIds(previous => {
      const completed = new Set(draft.completedSets);
      const currentExercises = effectiveWorkoutExercises(draft, activeSessionData?.exercises ?? []);
      const next = [...previous].filter(id => {
        const exercise = currentExercises.find(item => item.exercise_id === id);
        return (
          exercise &&
          !draft.hiddenExercises.includes(id) &&
          !(executionTimerVisible && executionTimerExerciseId === id) &&
          workoutSetProgress(id, exercise.target_sets, draft.extraSets[id] ?? 0, completed).canCollapse
        );
      });
      return next.length === previous.size ? previous : new Set(next);
    });
  }, [draft, activeSessionData?.exercises, executionTimerVisible, executionTimerExerciseId]);

  const [organizationDraft, setOrganizationDraft] = useState<ActiveWorkoutDraft | null>(null);
  const organizationBase = useRef<ActiveWorkoutDraft | null>(null);
  const [searchingReplacement, setSearchingReplacement] = useState(false);
  const [replacementPreview, setReplacementPreview] = useState<{
    id: string;
    replacement: ExerciseWithDetails;
    organizing: boolean;
  } | null>(null);
  const savedExerciseIds = activeSessionData?.completedSets.map(set => set.exercise_id) ?? [];
  const currentContext = useRef({
    savedExerciseIds,
    executingId: executionTimerVisible ? executionTimerExerciseId : null,
    dbExercises,
  });
  currentContext.current = {
    savedExerciseIds,
    executingId: executionTimerVisible ? executionTimerExerciseId : null,
    dbExercises,
  };
  useFocusEffect(
    React.useCallback(() => {
      setSearchingReplacement(false);
    }, []),
  );
  const openOrganizer = () => {
    organizationBase.current = draftRef.current;
    setOrganizationDraft(draftRef.current);
    setMenuVisibleForExercise(null);
  };
  const applyOrganization = () => {
    if (!organizationDraft) return;
    if (draftRef.current !== organizationBase.current) {
      Alert.alert(t('common.error'), t('training.organizationChanged'));
      return;
    }
    // Persisted completions can arrive during the organizer/search flow.
    const removedIds = organizationBase.current.exerciseOrder.filter(
      id => !organizationDraft.exerciseOrder.includes(id),
    );
    if (
      removedIds.some(id =>
        substitutionBlockReason(
          draftRef.current,
          id,
          currentContext.current.savedExerciseIds,
          currentContext.current.executingId,
        ),
      )
    ) {
      Alert.alert(t('common.error'), t('training.replacementCompletedBlocked'));
      return;
    }
    updateDraft(() => organizationDraft);
    setOrganizationDraft(null);
  };
  const startReplacement = (id: string, organizing = false) => {
    const sourceDraft = organizing ? organizationDraft : draftRef.current;
    if (!sourceDraft) return;
    const reason = substitutionBlockReason(
      sourceDraft,
      id,
      currentContext.current.savedExerciseIds,
      currentContext.current.executingId,
    );
    if (reason) {
      Alert.alert(t('training.replaceExercise'), t(`training.${reason}`));
      return;
    }
    const items = effectiveWorkoutExercises(sourceDraft, currentContext.current.dbExercises);
    const source = items.find(item => item.exercise_id === id);
    if (!source?.exercise) return;
    setMenuVisibleForExercise(null);
    setSearchingReplacement(true);
    navigation.navigate('ExerciseSearch', {
      onSelect: () => {},
      replacementExerciseName: getLocalizedExerciseName(source.exercise),
      replacementExercise: { ...source.exercise, name: getLocalizedExerciseName(source.exercise) },
      excludedExerciseIds: sourceDraft.exerciseOrder.filter(id => !sourceDraft.hiddenExercises.includes(id)),
      onExerciseSelected: replacement => setReplacementPreview({ id, replacement, organizing }),
    });
  };
  const confirmReplacement = () => {
    if (!replacementPreview) return;
    const { id, replacement, organizing } = replacementPreview;
    const sourceDraft = organizing ? organizationDraft : draftRef.current;
    if (!sourceDraft) return;
    try {
      const next = substituteWorkoutExercise(
        sourceDraft,
        effectiveWorkoutExercises(sourceDraft, currentContext.current.dbExercises),
        id,
        replacement,
        currentContext.current.savedExerciseIds,
        currentContext.current.executingId,
      );
      if (organizing) setOrganizationDraft(next);
      else updateDraft(() => next);
      setReplacementPreview(null);
    } catch {
      Alert.alert(t('common.error'), t('training.replacementUnavailable'));
    }
  };

  const isExerciseInSuperset = (exerciseId: string) => {
    for (const link of supersetLinks) {
      const [id1, id2] = link.split('|');
      if (id1 === exerciseId || id2 === exerciseId) return true;
    }
    return false;
  };

  const getSupersetGroupIds = (startId: string) => {
    const visited = new Set<string>();
    const pending: string[] = [startId];

    while (pending.length > 0) {
      const currentId = pending.pop();
      if (!currentId || visited.has(currentId)) continue;

      visited.add(currentId);

      supersetLinks.forEach(linkKey => {
        const [id1, id2] = linkKey.split('|');
        if (id1 === currentId && !visited.has(id2)) pending.push(id2);
        if (id2 === currentId && !visited.has(id1)) pending.push(id1);
      });
    }

    return Array.from(visited).sort((a, b) => {
      return orderedExerciseIds.indexOf(a) - orderedExerciseIds.indexOf(b);
    });
  };

  const shouldStartRestAfterSetCompletion = (
    exercise: WorkoutTemplateExerciseWithDetails,
    setNumber: number,
    completedSetsState: Set<string>,
  ) => {
    if (!isExerciseInSuperset(exercise.exercise_id)) return true;

    const groupIds = getSupersetGroupIds(exercise.exercise_id);
    const lastExerciseId = groupIds[groupIds.length - 1];

    // In supersets, only the last exercise in the block can trigger timers.
    if (exercise.exercise_id !== lastExerciseId) return false;

    return groupIds.every(id => {
      return completedSetsState.has(`${id}-${setNumber}`);
    });
  };

  const handleSupersetPress = (linkKey: string) => {
    setSupersetLinks(prev => {
      const next = new Set(prev);
      if (next.has(linkKey)) {
        next.delete(linkKey);
      } else {
        next.add(linkKey);
      }
      return next;
    });
  };

  const isSetCompleted = (exerciseId: string, setNumber: number) => {
    return localCompletedSets.has(`${exerciseId}-${setNumber}`);
  };

  const getCompletedSet = (exerciseId: string, setNumber: number) => {
    return activeSessionData?.completedSets?.find(s => s.exercise_id === exerciseId && s.set_number === setNumber);
  };

  const getExecutionSecondsForSet = (
    exercise: WorkoutTemplateExerciseWithDetails | undefined,
    setNumber: number,
    fallbackSeconds: number,
  ) => {
    if (!exercise) return fallbackSeconds;
    const key = `${exercise.exercise_id}-${setNumber}`;
    const typedValue = parseInt(inputs[key]?.reps || '', 10);
    if (Number.isFinite(typedValue) && typedValue > 0) return typedValue;
    return fallbackSeconds;
  };

  const handleInput = (key: string, field: 'weight' | 'reps', value: string) => {
    if (field === 'weight') {
      const cleaned = value.replace(/[^0-9.,]/g, '');
      let separatorFound = false;
      const normalized = cleaned
        .split('')
        .filter(char => {
          if (char === '.' || char === ',') {
            if (separatorFound) return false;
            separatorFound = true;
          }
          return true;
        })
        .join('');

      setInputs(prev => ({
        ...prev,
        [key]: { weight: normalized, reps: prev[key]?.reps ?? '' },
      }));
      return;
    }

    const normalizedReps = value.replace(/[^0-9]/g, '');
    setInputs(prev => ({
      ...prev,
      [key]: { weight: prev[key]?.weight ?? '', reps: normalizedReps },
    }));
  };

  const handleApplyPrToSetWeight = (key: string, prWeightKg: number | null | undefined) => {
    if (!Number.isFinite(prWeightKg) || (prWeightKg ?? 0) <= 0) {
      return;
    }

    const prWeightDisplay = toDisplayWeight(prWeightKg ?? 0);
    handleInput(key, 'weight', prWeightDisplay.toString());
  };

  const handleCompleteSet = async (
    exercise: WorkoutTemplateExerciseWithDetails,
    setNumber: number,
    targetRepsMin: number | null,
    restSeconds: number | null,
    isTimeBased: boolean = false,
  ) => {
    const exerciseId = exercise.exercise_id;
    const key = `${exerciseId}-${setNumber}`;
    const isDone = isSetCompleted(exerciseId, setNumber);
    const nextCompletedSets = new Set(localCompletedSets);
    if (nextCompletedSets.has(key)) {
      nextCompletedSets.delete(key);
      setPendingAutoPlayQueue(null);
    } else {
      nextCompletedSets.add(key);

      // If user completes a later exercise in a superset block,
      // auto-complete all previous exercises for the same set number.
      if (isExerciseInSuperset(exerciseId)) {
        const groupIds = getSupersetGroupIds(exerciseId);
        const currentIndex = groupIds.indexOf(exerciseId);
        if (currentIndex > 0) {
          const previousIds = groupIds.slice(0, currentIndex);
          previousIds.forEach(prevId => {
            nextCompletedSets.add(`${prevId}-${setNumber}`);
          });
        }
      }
    }
    setLocalCompletedSets(nextCompletedSets);

    if (!isDone && settings.autoTimer) {
      const shouldStartRest = shouldStartRestAfterSetCompletion(exercise, setNumber, nextCompletedSets);
      if (!shouldStartRest) return;

      const restVal = restSeconds !== null && restSeconds !== undefined ? restSeconds : 60;

      if (isTimeBased && targetRepsMin && targetRepsMin > 0) {
        // Time-based exercise: show execution timer first, then rest timer
        setExecutionTimerSeconds(targetRepsMin);
        setPendingRestSeconds(restVal);
        setExecutionTimerVisible(true);
        setExecutionTimerExerciseId(exerciseId);

        if (settings.autoPlayEnabled) {
          setPendingAutoPlayQueue({ exerciseId, nextSetNumber: setNumber + 1 });
        } else {
          setPendingAutoPlayQueue(null);
        }
      } else {
        // Reps-based exercise: show rest timer directly
        if (restVal > 0) {
          setTimerSeconds(restVal);
          setTimerVisible(true);
        }
        setPendingAutoPlayQueue(null);
      }
    } else {
      setPendingAutoPlayQueue(null);
    }
  };

  // Handle execution timer completion - show rest timer
  const handleExecutionComplete = () => {
    setExecutionTimerVisible(false);
    setExecutionTimerExerciseId(null);
    if (pendingRestSeconds && pendingRestSeconds > 0) {
      setTimerSeconds(pendingRestSeconds);
      setTimerVisible(true);
    }
    setPendingRestSeconds(null);
  };

  const handleExecutionDismiss = () => {
    setExecutionTimerVisible(false);
    setExecutionTimerExerciseId(null);
    setPendingRestSeconds(null);
    setPendingAutoPlayQueue(null);
  };

  const handleRestComplete = () => {
    setTimerVisible(false);

    if (finishingRef.current || !settings.autoPlayEnabled || !pendingAutoPlayQueue) return;
    const target = nextWorkoutAutoSet(
      draftRef.current,
      effectiveWorkoutExercises(draftRef.current, currentContext.current.dbExercises),
      pendingAutoPlayQueue.exerciseId,
      pendingAutoPlayQueue.nextSetNumber,
    );
    if (!target) {
      setPendingAutoPlayQueue(null);
      return;
    }
    const { exercise, setNumber: nextSetNumber } = target;
    const exerciseId = exercise.exercise_id;
    const executionSeconds = getExecutionSecondsForSet(exercise, nextSetNumber, exercise?.target_reps_min || 30);
    const restSeconds = exercise?.rest_seconds ?? 60;
    const setKey = `${exerciseId}-${nextSetNumber}`;

    setLocalCompletedSets(prev => {
      const next = new Set(prev);
      next.add(setKey);
      return next;
    });

    setPendingAutoPlayQueue({ exerciseId, nextSetNumber: nextSetNumber + 1 });

    setExecutionTimerSeconds(executionSeconds);
    setPendingRestSeconds(restSeconds);
    setExecutionTimerVisible(true);
    setExecutionTimerExerciseId(exerciseId);
  };

  // Exercise Menu Actions
  const handleViewExerciseInfo = (exercise: ExerciseWithDetails) => {
    setMenuVisibleForExercise(null);
    navigation.navigate('ExerciseDetail', { exercise: exercise });
  };

  const handleDeleteExercise = (exerciseId: string, exerciseName: string) => {
    setMenuVisibleForExercise(null);
    Alert.alert(t('training.deleteExercise'), t('training.deleteExerciseQuestion', { exerciseName }), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: () => {
          if (deletingExerciseIds.has(exerciseId)) return;

          const deleteAnimation = getDeleteExerciseAnimation(exerciseId);
          setDeletingExerciseIds(prev => new Set(prev).add(exerciseId));

          Animated.timing(deleteAnimation, {
            toValue: 1,
            duration: 220,
            easing: Easing.inOut(Easing.cubic),
            useNativeDriver: true,
          }).start(({ finished }) => {
            if (!finished) return;

            LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
            setHiddenExercises(prev => new Set(prev).add(exerciseId));
            setDeletingExerciseIds(prev => {
              const next = new Set(prev);
              next.delete(exerciseId);
              return next;
            });
            deleteExerciseAnimations.current[exerciseId] = new Animated.Value(0);
          });
        },
      },
    ]);
  };

  const [movedExerciseId, setMovedExerciseId] = useState<string | null>(null);
  const [movedExerciseDirection, setMovedExerciseDirection] = useState<'up' | 'down' | null>(null);
  const [deletingExerciseIds, setDeletingExerciseIds] = useState<Set<string>>(new Set());
  const moveHighlightAnim = useRef(new Animated.Value(0)).current;
  const deleteExerciseAnimations = useRef<Record<string, Animated.Value>>({});

  const getDeleteExerciseAnimation = (exerciseId: string) => {
    if (!deleteExerciseAnimations.current[exerciseId]) {
      deleteExerciseAnimations.current[exerciseId] = new Animated.Value(0);
    }

    return deleteExerciseAnimations.current[exerciseId];
  };

  useEffect(() => {
    if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
      UIManager.setLayoutAnimationEnabledExperimental(true);
    }
  }, []);

  const triggerMoveHighlight = (exerciseId: string, direction: 'up' | 'down') => {
    setMovedExerciseId(exerciseId);
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
  };

  const handleMoveExerciseUp = (exerciseId: string) => {
    setMenuVisibleForExercise(null);
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);

    setExerciseOrder(prev => {
      const currentBlockIds = getSupersetGroupIds(exerciseId);
      const firstGroupIndex = prev.findIndex(id => currentBlockIds.includes(id));
      if (firstGroupIndex <= 0) return prev; // Cannot move first item up

      const itemToSwapDown = prev[firstGroupIndex - 1];
      const aboveGroupIds = getSupersetGroupIds(itemToSwapDown);

      const filteredOrder = prev.filter(id => !currentBlockIds.includes(id) && !aboveGroupIds.includes(id));
      const insertIndex = prev.findIndex(id => aboveGroupIds.includes(id));

      if (insertIndex !== -1) {
        const newOrder = [...filteredOrder];
        newOrder.splice(insertIndex, 0, ...currentBlockIds, ...aboveGroupIds);
        return newOrder;
      }

      return prev;
    });

    triggerMoveHighlight(exerciseId, 'up');
  };

  const handleMoveExerciseDown = (exerciseId: string) => {
    setMenuVisibleForExercise(null);
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);

    setExerciseOrder(prev => {
      const currentBlockIds = getSupersetGroupIds(exerciseId);
      let lastGroupIndex = -1;
      prev.forEach((id, i) => {
        if (currentBlockIds.includes(id)) {
          lastGroupIndex = i;
        }
      });
      if (lastGroupIndex === -1 || lastGroupIndex >= prev.length - 1) return prev;

      const itemToSwapUp = prev[lastGroupIndex + 1];
      const belowGroupIds = getSupersetGroupIds(itemToSwapUp);

      const filteredOrder = prev.filter(id => !currentBlockIds.includes(id) && !belowGroupIds.includes(id));
      const insertIndex = prev.findIndex(id => currentBlockIds.includes(id));

      if (insertIndex !== -1) {
        const newOrder = [...filteredOrder];
        newOrder.splice(insertIndex, 0, ...belowGroupIds, ...currentBlockIds);
        return newOrder;
      }

      return prev;
    });

    triggerMoveHighlight(exerciseId, 'down');
  };

  const durationRef = useRef(0);
  const handleDurationChange = React.useCallback((nextDuration: number) => {
    durationRef.current = nextDuration;
  }, []);

  const [isFinishing, setIsFinishing] = useState(false);
  const finishingRef = useRef(false);
  const clearFinishedDraft = async () => {
    try {
      await persistence.clear();
      await AsyncStorage.removeItem(`active_session_duration_${sessionId}`);
    } catch {
      Alert.alert(t('common.error'), t('training.finishedDraftCleanupError'));
    }
  };

  const handleFinish = async () => {
    Alert.alert(t('training.finishWorkoutConfirmTitle'), t('training.finishWorkoutConfirmMessage'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('training.finishNow'),
        onPress: async () => {
          if (finishingRef.current || !persistence.ready) return;
          finishingRef.current = true;
          try {
            setIsFinishing(true);
            const snapshot = prepareWorkoutSetIds(draftRef.current, activeSessionData?.completedSets ?? []);
            updateDraft(() => snapshot);
            await persistence.flush();
            const inputsCurrent = snapshot.inputs;
            const finishingItems = effectiveWorkoutExercises(snapshot, currentContext.current.dbExercises);
            const finishingExercises = snapshot.exerciseOrder
              .map(id => finishingItems.find(item => item.exercise_id === id))
              .filter(
                (item): item is WorkoutTemplateExerciseWithDetails =>
                  !!item && !snapshot.hiddenExercises.includes(item.exercise_id),
              );
            const pendingSaves: (() => Promise<unknown>)[] = [];

            let savedCount = 0;
            let savedVolume = 0;

            for (const item of finishingExercises) {
              const exerciseId = item?.exercise_id;
              const totalSets = Math.max(0, (item?.target_sets || 3) + (snapshot.extraSets[exerciseId!] || 0));

              for (let i = 0; i < totalSets; i++) {
                const setNum = i + 1;
                if (!snapshot.completedSets.includes(`${exerciseId}-${setNum}`)) continue;

                const key = `${exerciseId}-${setNum}`;
                const inputData = inputsCurrent[key];
                const rawWeight = inputData?.weight;
                const rawReps = inputData?.reps;

                let weight: number = 0;
                let reps: number = 0;

                if (rawWeight !== undefined && rawWeight !== '') weight = parseFloat(rawWeight.replace(/,/g, '.'));
                else if (item?.target_weight_kg) weight = toDisplayWeight(item.target_weight_kg);

                if (rawReps !== undefined && rawReps !== '') reps = parseInt(rawReps);
                else if (item?.target_reps_min) reps = item.target_reps_min;

                const weightKg = toDbWeight(weight);
                const existingSet = activeSessionData?.completedSets.find(
                  set => set.exercise_id === exerciseId && set.set_number === setNum,
                );
                const metrics = getWorkoutSetMetrics(reps, item.exercise?.exercise_type_code, existingSet);
                const setMode = snapshot.setModes[key] || 'normal';
                const isWarmup = setMode === 'warmup';

                savedCount++;
                savedVolume += weightKg * (metrics.reps ?? 0);

                pendingSaves.push(() =>
                  logSet.mutateAsync({
                    id: snapshot.setIds?.[key],
                    session_id: sessionId,
                    exercise_id: exerciseId!,
                    set_number: setNum,
                    weight_kg: weightKg,
                    ...metrics,
                    rest_s: item?.rest_seconds,
                    is_warmup: isWarmup,
                    set_type: getWorkoutSetTypeForGymSetMode(setMode),
                    is_pr: false,
                  }),
                );
              }
            }

            if (pendingSaves.length > 0) {
              await saveWorkoutSequentially(pendingSaves, save => save());
            }

            const supersetPayload = [];
            for (let i = 0; i < finishingExercises.length - 1; i++) {
              const curr = finishingExercises[i];
              const next = finishingExercises[i + 1];
              if (curr && next && snapshot.supersetLinks.includes(`${curr.exercise_id}|${next.exercise_id}`)) {
                supersetPayload.push({
                  fromExerciseId: curr.exercise_id,
                  fromOrderIndex: i,
                  toExerciseId: next.exercise_id,
                  toOrderIndex: i + 1,
                });
              }
            }

            await saveSessionSupersetLinks.mutateAsync({
              sessionId,
              links: supersetPayload,
            });

            const finalDuration = durationRef.current;

            await finishSession.mutateAsync({
              id: sessionId,
              duration_s: finalDuration,
              rpe: 0,
              notes: '',
            });

            await clearFinishedDraft();

            navigation.replace('EnduranceSessionForm', {
              gymSessionData: {
                sessionId,
                name: activeSessionData?.session?.name || t('training.strengthWorkout'),
                exercisesCount: finishingExercises.length,
                setsCount: savedCount,
                volumeLoad: Math.round(savedVolume),
                startTime: activeSessionData?.session?.start_time || new Date().toISOString(),
                endTime: new Date().toISOString(),
                durationSeconds: finalDuration,
              },
            });
          } catch (e) {
            console.error('[handleFinish] Error fatal:', e);
            setIsFinishing(false);
            Alert.alert(t('common.error'), t('training.finishSessionError'));
          } finally {
            finishingRef.current = false;
          }
        },
      },
    ]);
  };

  const handleCancel = () => {
    Alert.alert(t('training.cancelWorkoutConfirmTitle'), t('training.cancelWorkoutConfirmMessage'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('training.yesCancel'),
        style: 'destructive',
        onPress: async () => {
          if (finishingRef.current) return;
          finishingRef.current = true;
          setIsFinishing(true);
          try {
            await cancelSession.mutateAsync(sessionId);
            await clearFinishedDraft();

            navigation.goBack();
          } catch (_error) {
            Alert.alert(t('common.error'), t('training.cancelSessionError'));
          } finally {
            finishingRef.current = false;
            setIsFinishing(false);
          }
        },
      },
    ]);
  };

  const handleMinimize = () => {
    navigation.navigate('TrainingHome');
  };

  const handleAddSet = (exerciseId: string) => {
    // 1. Update extraSets count
    setExtraSets(prev => ({
      ...prev,
      [exerciseId]: (prev[exerciseId] || 0) + 1,
    }));

    // 2. Pre-fill inputs from previous set
    const exercise = visibleExercises.find(e => e.exercise_id === exerciseId);
    if (!exercise) return;

    const baseSets = exercise.target_sets || 3;
    const currentExtra = extraSets[exerciseId] || 0;
    const prevSetNum = baseSets + currentExtra;
    const newSetNum = prevSetNum + 1;

    const prevKey = `${exerciseId}-${prevSetNum}`;
    const newKey = `${exerciseId}-${newSetNum}`;

    const prevInput = inputs[prevKey];
    if (prevInput) {
      setInputs(prev => ({
        ...prev,
        [newKey]: { ...prevInput }, // Copy weight and reps
      }));
    }

    if (exercise.is_warmup) {
      setSetModes(prev => ({
        ...prev,
        [newKey]: 'warmup',
      }));
    } else if (exercise.drop_set_mode === 'all') {
      setSetModes(prev => ({
        ...prev,
        [newKey]: 'drop_set',
      }));
    }
  };

  const handleAddAdhocExercise = (exercise: ExerciseWithDetails) => {
    if (
      effectiveWorkoutExercises(draftRef.current, currentContext.current.dbExercises).some(
        item => item.exercise_id === exercise.id,
      )
    )
      return;
    const defaultTargets = getDefaultGymExerciseTargets(exercise.exercise_type_code);
    const newAdhoc: WorkoutTemplateExerciseWithDetails = {
      id: `local-${exercise.id}-${Date.now()}`,
      exercise_id: exercise.id,
      exercise: exercise,
      is_warmup: false,
      drop_set_mode: 'none',
      target_sets: 3,
      target_reps_min: defaultTargets.target_reps_min,
      target_reps_max: defaultTargets.target_reps_max,
      target_weight_kg: 0,
      rest_seconds: 60,
      order_index: draftRef.current.exerciseOrder.length,
      workout_template_id: activeSessionData?.session.workout_template_id ?? '',
      user_id: user?.id ?? null,
      notes: null,
      target_rpe: null,
      target_rir_by_set: null,
      superset_next_exercise_id: null,
    };
    updateDraft(prev => addWorkoutExercise(prev, newAdhoc));
  };

  const [completingExerciseIds] = useState<Set<string>>(new Set());
  const [successModal, setSuccessModal] = useState<{
    visible: boolean;
    title: string;
    message: string;
    onDismiss: () => void;
  }>({
    visible: false,
    title: '',
    message: '',
    onDismiss: () => {},
  });

  const handleCompleteAll = (exerciseId: string, _item: WorkoutTemplateExerciseWithDetails) => {
    Alert.alert(t('training.completeAllSetsConfirmTitle'), t('training.completeAllSetsConfirmMessage'), [
      {
        text: t('common.cancel'),
        style: 'cancel',
      },
      {
        text: t('training.completeAllSetsConfirmAction'),
        style: 'default',
        onPress: () => {
          setPendingAutoPlayQueue(null);
          setLocalCompletedSets(prev => {
            const next = new Set(prev);

            const groupIds = isExerciseInSuperset(exerciseId) ? getSupersetGroupIds(exerciseId) : [exerciseId];
            const currentIndex = groupIds.indexOf(exerciseId);
            const idsToComplete =
              currentIndex > 0
                ? groupIds.slice(0, currentIndex + 1) // Completing second also completes previous ones.
                : [exerciseId];

            idsToComplete.forEach(id => {
              const linkedExercise = visibleExercises.find(ex => ex.exercise_id === id);
              const totalSets = Math.max(
                0,
                (linkedExercise?.target_sets || 3) + (extraSets[linkedExercise?.exercise_id || id] || 0),
              );

              for (let setNum = 1; setNum <= totalSets; setNum++) {
                next.add(`${id}-${setNum}`);
              }
            });

            return next;
          });

          setSuccessModal({
            visible: true,
            title: t('training.workoutCompleted'),
            message: t('training.allSetsMarked'),
            onDismiss: () => {},
          });
        },
      },
    ]);
  };

  const handleCompleteAllExercises = () => {
    Alert.alert(t('training.completeAllConfirmTitle'), t('training.completeAllConfirmMessage'), [
      {
        text: t('common.cancel'),
        style: 'cancel',
        onPress: () => setIsCompletingAll(false),
      },
      {
        text: t('training.completeAllConfirmAction'),
        style: 'default',
        onPress: () => {
          setIsCompletingAll(true);
          setPendingAutoPlayQueue(null);

          setLocalCompletedSets(prev => {
            const next = new Set(prev);
            for (const item of visibleExercises) {
              const exerciseId = item?.exercise_id;
              const totalSets = Math.max(0, (item?.target_sets || 3) + (extraSets[exerciseId!] || 0));
              for (let i = 0; i < totalSets; i++) {
                next.add(`${exerciseId}-${i + 1}`);
              }
            }
            return next;
          });

          setSuccessModal({
            visible: true,
            title: t('common.done'),
            message: t('training.allExercisesSetsMarked'),
            onDismiss: () => setIsCompletingAll(false),
          });
        },
      },
    ]);
  };

  const floatingFooterHeight = 75;
  const floatingFooterBottom = 30;
  // Keep timers very close to the footer and compensate SafeArea bottom
  // so iOS/WebView does not add an artificial extra gap.
  const timerGapFromFooter = 2;
  const footerTopFromScreenBottom = floatingFooterHeight + floatingFooterBottom;
  const timerBottomOffset = Math.max(
    timerGapFromFooter,
    footerTopFromScreenBottom - insets.bottom + timerGapFromFooter,
  );

  // --- RENDER ---
  if (!persistence.ready) {
    const loadingFailed = !!persistence.error || isError || (!isLoading && !activeSessionData);
    return (
      <SafeAreaView
        style={[
          styles.container,
          { backgroundColor: themeColors.background, padding: spacing.l, justifyContent: 'center' },
        ]}
      >
        <Text style={{ color: themeColors.textPrimary }}>
          {t(loadingFailed ? 'training.draftLoadingError' : 'training.draftLoading')}
        </Text>
        {loadingFailed ? (
          <TouchableOpacity
            accessibilityRole="button"
            style={{ minHeight: 44, justifyContent: 'center' }}
            onPress={() => {
              persistence.retry();
              void refetch();
            }}
          >
            <Text style={{ color: themeColors.primary }}>{t('nutrition.retry')}</Text>
          </TouchableOpacity>
        ) : (
          <ActivityIndicator color={themeColors.primary} />
        )}
        <TouchableOpacity
          accessibilityRole="button"
          style={{ minHeight: 44, justifyContent: 'center' }}
          onPress={handleMinimize}
        >
          <Text style={{ color: themeColors.primary }}>{t('common.back')}</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }
  return (
    <LinearGradient colors={dynamicStyles.gradientColors} style={{ flex: 1 }}>
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        {/* Header */}
        <View style={[styles.header, { backgroundColor: isDark ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.5)' }]}>
          <TouchableOpacity onPress={handleMinimize} style={styles.iconButton}>
            <ChevronDown size={24} color={themeColors.textPrimary} />
          </TouchableOpacity>

          <View
            style={[
              styles.timerContainer,
              dynamicStyles.glassCard,
              {
                paddingVertical: spacing.xs,
                paddingHorizontal: spacing.m,
                borderRadius: borderRadius.full,
                // backgroundColor handled by glassCard or override if needed
                backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.8)',
              },
            ]}
          >
            <ActiveWorkoutDuration
              sessionId={sessionId}
              textColor={themeColors.textPrimary}
              onDurationChange={handleDurationChange}
            />
          </View>

          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
            <TouchableOpacity onPress={handleCancel} style={[styles.cancelButton, dynamicStyles.dangerButton]}>
              <X size={20} color={themeColors.danger} />
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handleFinish}
              style={[styles.finishBtn, dynamicStyles.primaryButton]}
              disabled={isFinishing}
            >
              {isFinishing ? (
                <ActivityIndicator size="small" color="#FFF" />
              ) : (
                <Text style={styles.finishBtnText}>{t('training.finish')}</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
        <View style={{ paddingHorizontal: spacing.m, paddingVertical: spacing.xs }}>
          <TouchableOpacity
            accessibilityRole="button"
            onPress={openOrganizer}
            style={{ minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start', paddingHorizontal: spacing.m }}
          >
            <Text style={{ color: themeColors.primary, fontWeight: '600' }}>{t('training.organizeWorkout')}</Text>
          </TouchableOpacity>
          {!!persistence.error && (
            <View accessibilityRole="alert">
              <Text style={{ color: themeColors.danger }}>{t('training.draftStorageError')}</Text>
              <TouchableOpacity
                accessibilityRole="button"
                onPress={persistence.retry}
                style={{ minHeight: 44, justifyContent: 'center' }}
              >
                <Text style={{ color: themeColors.primary }}>{t('nutrition.retry')}</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1 }}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
        >
          <FlatList
            contentContainerStyle={styles.content}
            data={visibleExercises}
            extraData={{
              collapsedExerciseIds,
              completedSets: activeSessionData?.completedSets,
              deletingExerciseIds,
              extraSets,
              inputs,
              movedExerciseId,
              setModes,
              supersetLinks,
            }}
            keyboardShouldPersistTaps="handled"
            keyExtractor={(item, index) => item.id || item.exercise_id || String(index)}
            style={{ flex: 1 }}
            ListHeaderComponent={
              isLoading && visibleExercises.length === 0 ? (
                <>
                  {[1, 2, 3].map(n => (
                    <GlassCard key={`skeleton-${n}`} style={[styles.exerciseCard, dynamicStyles.glassCard]}>
                      <View style={styles.exerciseHeader}>
                        <View
                          style={[
                            styles.skeletonText,
                            {
                              width: '60%',
                              backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)',
                            },
                          ]}
                        />
                        <View
                          style={[
                            styles.skeletonIcon,
                            {
                              backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)',
                            },
                          ]}
                        />
                      </View>
                      <View
                        style={[
                          styles.setsHeader,
                          {
                            borderBottomColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)',
                          },
                        ]}
                      >
                        {[1, 2, 3, 4].map(col => (
                          <View
                            key={col}
                            style={[
                              styles.skeletonCol,
                              {
                                backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)',
                              },
                            ]}
                          />
                        ))}
                      </View>
                      {[1, 2, 3].map(setNum => (
                        <View key={setNum} style={[styles.setRow, { height: 48 }]}>
                          {[1, 2, 3, 4].map(col => (
                            <View
                              key={col}
                              style={[
                                styles.skeletonInput,
                                {
                                  backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)',
                                },
                              ]}
                            />
                          ))}
                        </View>
                      ))}
                    </GlassCard>
                  ))}
                </>
              ) : null
            }
            renderItem={({ item, index: i }) => {
              const exerciseId = item.exercise_id;
              const {
                total: totalSets,
                completed,
                canCollapse,
              } = workoutSetProgress(exerciseId, item.target_sets, extraSets[exerciseId] ?? 0, localCompletedSets);
              const canFold = canCollapse && !(executionTimerVisible && executionTimerExerciseId === exerciseId);
              const isCollapsed = canFold && collapsedExerciseIds.has(exerciseId);
              const isTimeBased = isTimeBasedExerciseType(item.exercise?.exercise_type_code);
              const nextItem = visibleExercises[i + 1];
              const linkKey = nextItem ? `${item.exercise_id}|${nextItem.exercise_id}` : null;
              const connectorActive = linkKey ? supersetLinks.has(linkKey) : false;
              const isInSuperset = isExerciseInSuperset(item.exercise_id);
              const deleteAnimation = getDeleteExerciseAnimation(exerciseId);
              const isDeleting = deletingExerciseIds.has(exerciseId);

              return (
                <React.Fragment key={item.id || i}>
                  <Animated.View
                    pointerEvents={isDeleting ? 'none' : 'auto'}
                    style={{
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
                    }}
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
                          { paddingHorizontal: setTableLayout.cardPaddingHorizontal },
                          isInSuperset && {
                            borderColor: themeColors.primary + 'CC',
                            borderWidth: 1.5,
                            backgroundColor: themeColors.primary + '10',
                          },
                        ]}
                      >
                        <View style={styles.exerciseHeader}>
                          <View style={styles.exerciseInfo}>
                            <Text style={[styles.exerciseName, dynamicStyles.title]}>
                              {item.exercise ? getLocalizedExerciseName(item.exercise) : ''}
                            </Text>
                          </View>
                          <TouchableOpacity
                            style={styles.exerciseMenuButton}
                            onPress={() => setMenuVisibleForExercise(exerciseId)}
                          >
                            <MoreVertical size={20} color={themeColors.textSecondary} />
                          </TouchableOpacity>
                        </View>
                        <View style={styles.exerciseProgressRow}>
                          <Text
                            style={[
                              styles.exerciseProgress,
                              { color: canCollapse ? themeColors.successText : themeColors.textSecondary },
                            ]}
                          >
                            {t('training.setProgressCompact', { completed, total: totalSets })}
                          </Text>
                          {canFold && (
                            <TouchableOpacity
                              accessibilityRole="button"
                              accessibilityState={{ expanded: !isCollapsed }}
                              accessibilityLabel={`${t(isCollapsed ? 'training.expandSets' : 'training.collapseSets')}: ${item.exercise ? getLocalizedExerciseName(item.exercise) : t('training.exercise')}`}
                              style={styles.collapseSetsButton}
                              onPress={() =>
                                setCollapsedExerciseIds(previous => {
                                  const next = new Set(previous);
                                  if (next.has(exerciseId)) next.delete(exerciseId);
                                  else next.add(exerciseId);
                                  return next;
                                })
                              }
                            >
                              <Text style={{ color: themeColors.primary }}>
                                {t(isCollapsed ? 'training.expandSets' : 'training.collapseSets')}
                              </Text>
                              {isCollapsed ? (
                                <ChevronDown size={18} color={themeColors.primary} />
                              ) : (
                                <ChevronUp size={18} color={themeColors.primary} />
                              )}
                            </TouchableOpacity>
                          )}
                        </View>
                        {!isCollapsed && (
                          <>
                            <View style={styles.setTable}>
                              <View style={styles.setTableContent}>
                                <View
                                  style={[
                                    styles.setsHeader,
                                    {
                                      gap: setTableLayout.rowGap,
                                      paddingHorizontal: setTableLayout.rowPaddingHorizontal,
                                    },
                                    {
                                      borderBottomColor: isInSuperset
                                        ? themeColors.primary + '7A'
                                        : isDark
                                          ? 'rgba(255,255,255,0.1)'
                                          : 'rgba(0,0,0,0.05)',
                                    },
                                  ]}
                                >
                                  <Text
                                    style={[styles.colHeader, dynamicStyles.sublabel, { width: TRAINING_CONTROL_SIZE }]}
                                  >
                                    {t('training.setColon')}
                                  </Text>
                                  {!isTimeBased && (
                                    <>
                                      <Text
                                        style={[
                                          styles.colHeader,
                                          dynamicStyles.sublabel,
                                          { width: setTableLayout.recordColumnWidth },
                                        ]}
                                      >
                                        {t('training.prColonAllCaps')}
                                      </Text>
                                      <Text
                                        style={[styles.colHeader, dynamicStyles.sublabel, { flex: 1, minWidth: 0 }]}
                                      >
                                        {preferences.weight_unit}
                                      </Text>
                                    </>
                                  )}
                                  <Text
                                    style={[
                                      styles.colHeader,
                                      dynamicStyles.sublabel,
                                      { flex: isTimeBased ? 2 : 1, minWidth: 0 },
                                    ]}
                                  >
                                    {isTimeBased ? t('training.time') : t('training.repsColon')}
                                  </Text>
                                  <TouchableOpacity
                                    onPress={() => setHelpModalVisible(true)}
                                    style={styles.checkBtn}
                                    accessibilityRole="button"
                                    accessibilityLabel={t('training.seriesHelp')}
                                  >
                                    <HelpCircle size={16} color={themeColors.textSecondary} />
                                  </TouchableOpacity>
                                </View>

                                {Array.from({ length: totalSets }).map((_, setIdx) => {
                                  const setNum = setIdx + 1;
                                  const isDone = isSetCompleted(exerciseId, setNum);
                                  const doneSet = getCompletedSet(exerciseId, setNum);
                                  const key = `${exerciseId}-${setNum}`;
                                  const setMode = setModes[key] || 'normal';
                                  const targetRir = item.target_rir_by_set?.[setIdx] ?? null;

                                  const prData = activeSessionData?.prs?.[exerciseId];
                                  const prevText = prData
                                    ? `${toDisplayWeight(prData.weight_kg)} ${preferences.weight_unit}`
                                    : '-';

                                  return (
                                    <View
                                      key={setNum}
                                      style={[
                                        styles.setRow,
                                        {
                                          gap: setTableLayout.rowGap,
                                          paddingHorizontal: setTableLayout.rowPaddingHorizontal,
                                        },
                                        isDone && {
                                          backgroundColor: isDark
                                            ? 'rgba(52, 199, 89, 0.15)'
                                            : 'rgba(52, 199, 89, 0.1)',
                                        },
                                        setMode === 'warmup' && {
                                          backgroundColor: isDark
                                            ? 'rgba(255, 149, 0, 0.15)'
                                            : 'rgba(255, 149, 0, 0.1)',
                                        },
                                        setMode === 'drop_set' && {
                                          backgroundColor: isDark
                                            ? 'rgba(88, 86, 214, 0.16)'
                                            : 'rgba(88, 86, 214, 0.1)',
                                        },
                                      ]}
                                    >
                                      <TouchableOpacity
                                        style={[
                                          styles.warmupBtn,
                                          setMode === 'warmup' && styles.warmupBtnActive,
                                          setMode === 'drop_set' && styles.dropSetBtnActive,
                                        ]}
                                        onPress={() =>
                                          setSetModes(prev => {
                                            const nextMode = getNextGymSetMode(prev[key] || 'normal');
                                            const next = { ...prev };
                                            if (nextMode === 'normal') {
                                              delete next[key];
                                            } else {
                                              next[key] = nextMode;
                                            }
                                            return next;
                                          })
                                        }
                                        disabled={isDone}
                                        accessibilityRole="button"
                                        accessibilityLabel={t('training.setTypeControl', {
                                          number: setNum,
                                          type: getGymSetModeLabel(setMode, setNum),
                                        })}
                                        accessibilityHint={
                                          targetRir !== null && setMode !== 'warmup'
                                            ? t('training.rirTargetAccessibility', { value: targetRir })
                                            : undefined
                                        }
                                        accessibilityState={{ disabled: isDone }}
                                      >
                                        <Text
                                          style={[
                                            styles.warmupText,
                                            { color: themeColors.textSecondary },
                                            setMode !== 'normal' && styles.warmupTextActive,
                                          ]}
                                        >
                                          {getGymSetModeLabel(setMode, setNum)}
                                        </Text>
                                        {targetRir !== null && setMode !== 'warmup' && (
                                          <View
                                            style={[
                                              styles.rirTargetBadge,
                                              { backgroundColor: themeColors.primary + '18' },
                                            ]}
                                          >
                                            <Text style={[styles.rirTargetBadgeText, { color: themeColors.primary }]}>
                                              {t('training.rirTargetCompact', { value: targetRir })}
                                            </Text>
                                          </View>
                                        )}
                                      </TouchableOpacity>

                                      {!isTimeBased && (
                                        <>
                                          <TouchableOpacity
                                            style={[styles.prevSetButton, { width: setTableLayout.recordColumnWidth }]}
                                            onPress={() => handleApplyPrToSetWeight(key, prData?.weight_kg)}
                                            disabled={!prData}
                                            accessibilityRole="button"
                                            accessibilityLabel={t('training.applyRecordToSet', { number: setNum })}
                                            activeOpacity={0.75}
                                          >
                                            <Text
                                              style={[
                                                styles.prevSet,
                                                {
                                                  fontSize: setTableLayout.compact ? 10 : 11,
                                                  color: prData ? themeColors.primary : themeColors.textSecondary,
                                                },
                                              ]}
                                              numberOfLines={2}
                                            >
                                              {prevText}
                                            </Text>
                                          </TouchableOpacity>

                                          <TextInput
                                            style={[
                                              styles.input,
                                              dynamicStyles.input,
                                              setTableLayout.compact && styles.compactInput,
                                            ]}
                                            {...DECIMAL_INPUT_PROPS}
                                            accessibilityLabel={t('training.setWeightInput', {
                                              number: setNum,
                                              unit: preferences.weight_unit,
                                            })}
                                            placeholder={item.target_weight_kg?.toString() || '0'}
                                            placeholderTextColor={themeColors.textSecondary + '50'}
                                            onChangeText={v => handleInput(key, 'weight', v)}
                                            value={
                                              inputs[key]?.weight !== undefined
                                                ? inputs[key].weight
                                                : isDone && doneSet?.weight_kg
                                                  ? toDisplayWeight(doneSet?.weight_kg).toString()
                                                  : ''
                                            }
                                          />
                                        </>
                                      )}
                                      <TextInput
                                        style={[
                                          styles.input,
                                          dynamicStyles.input,
                                          setTableLayout.compact && styles.compactInput,
                                          isTimeBased && { flex: 2 },
                                        ]}
                                        {...INTEGER_INPUT_PROPS}
                                        accessibilityLabel={t('training.setRepsInput', {
                                          number: setNum,
                                          unit: isTimeBased ? t('training.time') : t('training.repsColon'),
                                        })}
                                        placeholder={
                                          isTimeBased
                                            ? (item.target_reps_min || 0).toString()
                                            : item.target_reps_min?.toString() || '0'
                                        }
                                        placeholderTextColor={themeColors.textSecondary + '50'}
                                        onChangeText={v => handleInput(key, 'reps', v)}
                                        value={
                                          inputs[key]?.reps !== undefined
                                            ? inputs[key].reps
                                            : isDone && doneSet
                                              ? String(
                                                  getWorkoutSetMetricValue(
                                                    doneSet,
                                                    item.exercise?.exercise_type_code,
                                                  ) ?? '',
                                                )
                                              : isTimeBased
                                                ? (item.target_reps_min || 0).toString()
                                                : ''
                                        }
                                      />

                                      <TouchableOpacity
                                        accessibilityRole="button"
                                        accessibilityLabel={t('training.completeSetControl', { number: setNum })}
                                        accessibilityState={{ selected: isDone }}
                                        style={[
                                          styles.checkBtn,
                                          isDone && styles.checkBtnDone,
                                          !isDone && {
                                            backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)',
                                          },
                                        ]}
                                        onPress={() => {
                                          const typedTimeSeconds = parseInt(inputs[key]?.reps || '', 10);
                                          const executionSeconds = Number.isFinite(typedTimeSeconds)
                                            ? typedTimeSeconds
                                            : item.target_reps_min;

                                          handleCompleteSet(
                                            item,
                                            setNum,
                                            isTimeBased ? executionSeconds : item.target_reps_min,
                                            item.rest_seconds,
                                            isTimeBased,
                                          );
                                        }}
                                      >
                                        <Check size={16} color={isDone ? '#FFF' : themeColors.textSecondary} />
                                      </TouchableOpacity>
                                    </View>
                                  );
                                })}
                              </View>
                            </View>
                            <TouchableOpacity style={styles.addSetBtn} onPress={() => handleAddSet(exerciseId)}>
                              <Plus size={16} color={themeColors.primary} />
                              <Text style={[styles.addSetText, { color: themeColors.primary }]}>
                                {t('training.addSet')}
                              </Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                              style={styles.completeAllBtn}
                              onPress={() => handleCompleteAll(exerciseId, item)}
                              disabled={completingExerciseIds.has(exerciseId)}
                            >
                              <Check size={16} color={themeColors.success} />
                              <Text style={[styles.completeAllText, { color: themeColors.success }]}>
                                {t('training.completeAllSets')}
                              </Text>
                            </TouchableOpacity>
                          </>
                        )}
                      </GlassCard>
                    </Animated.View>
                  </Animated.View>

                  {linkKey !== null && (
                    <View style={styles.supersetConnectorContainer}>
                      <View style={styles.supersetLineTrack}>
                        <View
                          style={[
                            styles.supersetLine,
                            connectorActive && styles.supersetLineActive,
                            { backgroundColor: themeColors.border },
                          ]}
                        />
                        <View
                          style={[
                            styles.supersetLine,
                            connectorActive && styles.supersetLineActive,
                            styles.supersetLineFill,
                            styles.supersetLineFillLeft,
                            {
                              width: connectorActive ? '100%' : '0%',
                              backgroundColor: themeColors.primary + 'D9',
                            },
                          ]}
                        />
                      </View>
                      <TouchableOpacity
                        onPress={() => handleSupersetPress(linkKey)}
                        style={[
                          styles.supersetConnectorButton,
                          connectorActive && {
                            borderColor: themeColors.primary,
                            backgroundColor: themeColors.primary + '22',
                          },
                          !connectorActive && {
                            borderColor: themeColors.primary + '55',
                            backgroundColor: themeColors.background,
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
                        <View
                          style={[
                            styles.supersetLine,
                            connectorActive && styles.supersetLineActive,
                            styles.supersetLineFill,
                            styles.supersetLineFillRight,
                            {
                              width: connectorActive ? '100%' : '0%',
                              backgroundColor: themeColors.primary + 'D9',
                            },
                          ]}
                        />
                      </View>
                    </View>
                  )}
                </React.Fragment>
              );
            }}
            ListFooterComponent={
              <>
                <TouchableOpacity
                  style={[
                    styles.addExerciseBtn,
                    {
                      borderColor: themeColors.primary,
                      backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.5)',
                    },
                  ]}
                  onPress={() =>
                    navigation.navigate('ExerciseSearch', {
                      onSelect: (_exerciseId: string) => {}, // Required but not used
                      onExerciseSelected: handleAddAdhocExercise,
                    })
                  }
                >
                  <Plus size={20} color={themeColors.primary} />
                  <Text style={[styles.addExerciseText, { color: themeColors.primary }]}>
                    {t('training.addExercise')}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.completeAllExercisesBtn, { backgroundColor: themeColors.success }]}
                  onPress={handleCompleteAllExercises}
                  disabled={isCompletingAll}
                >
                  <Check size={20} color="#FFF" />
                  <Text style={styles.completeAllExercisesText}>{t('training.completeAll')}</Text>
                </TouchableOpacity>
              </>
            }
          />

          {executionTimerVisible && (
            <ExecutionTimer
              isVisible={executionTimerVisible}
              initialSeconds={executionTimerSeconds}
              onComplete={handleExecutionComplete}
              onDismiss={handleExecutionDismiss}
              soundEnabled={settings.soundEnabled}
              vibrationEnabled={settings.hapticsEnabled}
              bottomOffset={timerBottomOffset}
            />
          )}

          {timerVisible && (
            <RestTimer
              isVisible={timerVisible}
              initialSeconds={timerSeconds}
              onComplete={handleRestComplete}
              onDismiss={() => {
                setTimerVisible(false);
                setPendingAutoPlayQueue(null);
              }}
              soundEnabled={settings.soundEnabled}
              vibrationEnabled={settings.hapticsEnabled}
              bottomOffset={timerBottomOffset}
            />
          )}

          {organizationDraft && (
            <WorkoutOrganizer
              visible={!searchingReplacement && !replacementPreview}
              draft={organizationDraft}
              exercises={dbExercises}
              savedExerciseIds={savedExerciseIds}
              executingId={executionTimerVisible ? executionTimerExerciseId : null}
              onChange={setOrganizationDraft}
              onCancel={() => setOrganizationDraft(null)}
              onApply={applyOrganization}
              onReplace={id => startReplacement(id, true)}
            />
          )}
          <Modal
            visible={!!replacementPreview && !searchingReplacement}
            transparent
            animationType="fade"
            onRequestClose={() => setReplacementPreview(null)}
          >
            <View style={styles.modalOverlay}>
              <ScrollView
                style={{ maxWidth: 600, maxHeight: '85%', width: '100%', flexGrow: 0 }}
                contentContainerStyle={[styles.menuModalContent, dynamicStyles.modalContent]}
              >
                <Text accessibilityRole="header" style={[styles.menuTitle, dynamicStyles.title]}>
                  {t('training.replacementConfirm', {
                    from: getLocalizedExerciseName(
                      effectiveWorkoutExercises(organizationDraft ?? draft, dbExercises).find(
                        item => item.exercise_id === replacementPreview?.id,
                      )?.exercise ?? {},
                    ),
                    to: replacementPreview ? getLocalizedExerciseName(replacementPreview.replacement) : '',
                  })}
                </Text>
                <Text style={{ color: themeColors.textPrimary, marginBottom: spacing.m }}>
                  {t(
                    isTimeBasedExerciseType(
                      effectiveWorkoutExercises(organizationDraft ?? draft, dbExercises).find(
                        item => item.exercise_id === replacementPreview?.id,
                      )?.exercise?.exercise_type_code,
                    ) === isTimeBasedExerciseType(replacementPreview?.replacement.exercise_type_code)
                      ? 'training.replacementKeeps'
                      : 'training.replacementResets',
                  )}
                </Text>
                <Text style={{ color: themeColors.textSecondary, marginBottom: spacing.m }}>
                  {t('training.replacementPending')}
                </Text>
                <TouchableOpacity
                  accessibilityRole="button"
                  style={[styles.menuOption, { minHeight: 44 }]}
                  onPress={confirmReplacement}
                >
                  <Text style={{ color: themeColors.primary }}>{t('training.replaceExercise')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  accessibilityRole="button"
                  style={[styles.menuOption, { minHeight: 44 }]}
                  onPress={() => setReplacementPreview(null)}
                >
                  <Text style={{ color: themeColors.textPrimary }}>{t('common.cancel')}</Text>
                </TouchableOpacity>
              </ScrollView>
            </View>
          </Modal>
          <Modal visible={isFinishing} transparent onRequestClose={() => {}}>
            <View style={styles.modalOverlay}>
              <ActivityIndicator size="large" color={themeColors.primary} />
            </View>
          </Modal>
          {/* Exercise Options Menu Modal */}
          <Modal
            visible={!!menuVisibleForExercise}
            transparent
            animationType="fade"
            onRequestClose={() => setMenuVisibleForExercise(null)}
          >
            <TouchableOpacity
              style={styles.modalOverlay}
              activeOpacity={1}
              onPress={() => setMenuVisibleForExercise(null)}
            >
              <View
                style={[styles.menuModalContent, dynamicStyles.modalContent, isDark ? darkShadows.soft : shadows.soft]}
                onStartShouldSetResponder={() => true}
              >
                <Text style={[styles.menuTitle, dynamicStyles.title]}>{t('training.exerciseOptions')}</Text>
                <TouchableOpacity
                  accessibilityRole="button"
                  style={[styles.menuOption, { minHeight: 44 }]}
                  onPress={openOrganizer}
                >
                  <Text style={[styles.menuOptionText, { color: themeColors.primary }]}>
                    {t('training.organizeWorkout')}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  accessibilityRole="button"
                  style={[styles.menuOption, { minHeight: 44 }]}
                  onPress={() => menuVisibleForExercise && startReplacement(menuVisibleForExercise)}
                >
                  <Text style={[styles.menuOptionText, { color: themeColors.primary }]}>
                    {t('training.replaceExercise')}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.menuOption,
                    { borderBottomColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)' },
                  ]}
                  onPress={() => {
                    const exercise = visibleExercises.find(e => e.exercise_id === menuVisibleForExercise)?.exercise;
                    if (exercise) handleViewExerciseInfo(exercise as unknown as ExerciseWithDetails);
                  }}
                >
                  <Info size={20} color={themeColors.primary} />
                  <Text style={[styles.menuOptionText, { color: themeColors.textPrimary }]}>
                    {t('training.viewInfo')}
                  </Text>
                </TouchableOpacity>

                {/* Move Up Option */}
                {(() => {
                  const exercise = visibleExercises.find(e => e.exercise_id === menuVisibleForExercise);
                  let isFirst = false;

                  // Check if the entire block is at the top
                  if (exercise) {
                    const groupExerciseIds = getSupersetGroupIds(exercise.exercise_id);
                    const firstGroupIndex = visibleExercises.findIndex(e => groupExerciseIds.includes(e.exercise_id));
                    isFirst = firstGroupIndex <= 0;
                  }

                  return (
                    <TouchableOpacity
                      style={[
                        styles.menuOption,
                        {
                          borderBottomColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)',
                        },
                        isFirst && styles.menuOptionDisabled,
                      ]}
                      onPress={() => !isFirst && handleMoveExerciseUp(menuVisibleForExercise!)}
                      disabled={isFirst}
                    >
                      <ChevronUp size={20} color={isFirst ? themeColors.textSecondary : themeColors.primary} />
                      <Text
                        style={[
                          styles.menuOptionText,
                          {
                            color: isFirst ? themeColors.textSecondary : themeColors.textPrimary,
                          },
                        ]}
                      >
                        {t('training.moveUp')}
                      </Text>
                    </TouchableOpacity>
                  );
                })()}

                {/* Move Down Option */}
                {(() => {
                  const exercise = visibleExercises.find(e => e.exercise_id === menuVisibleForExercise);
                  let isLast = false;

                  // Check if the entire block is at the bottom
                  if (exercise) {
                    const groupExerciseIds = getSupersetGroupIds(exercise.exercise_id);
                    let lastGroupIndex = -1;
                    visibleExercises.forEach((e, i) => {
                      if (groupExerciseIds.includes(e.exercise_id)) {
                        lastGroupIndex = i;
                      }
                    });
                    isLast = lastGroupIndex >= visibleExercises.length - 1;
                  }

                  return (
                    <TouchableOpacity
                      style={[
                        styles.menuOption,
                        {
                          borderBottomColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)',
                        },
                        isLast && styles.menuOptionDisabled,
                      ]}
                      onPress={() => !isLast && handleMoveExerciseDown(menuVisibleForExercise!)}
                      disabled={isLast}
                    >
                      <ChevronDown size={20} color={isLast ? themeColors.textSecondary : themeColors.primary} />
                      <Text
                        style={[
                          styles.menuOptionText,
                          { color: isLast ? themeColors.textSecondary : themeColors.textPrimary },
                        ]}
                      >
                        {t('training.moveDown')}
                      </Text>
                    </TouchableOpacity>
                  );
                })()}

                <TouchableOpacity
                  style={[styles.menuOption, { borderBottomWidth: 0 }]}
                  onPress={() => {
                    const exercise = visibleExercises.find(e => e.exercise_id === menuVisibleForExercise);
                    if (exercise)
                      handleDeleteExercise(
                        exercise.exercise_id,
                        (exercise.exercise ? getLocalizedExerciseName(exercise.exercise) : undefined) ||
                          t('training.exercise'),
                      );
                  }}
                >
                  <Trash2 size={20} color={themeColors.danger} />
                  <Text style={[styles.menuOptionText, { color: themeColors.danger }]}>
                    {t('training.deleteExercise')}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.menuCancelBtn, { backgroundColor: themeColors.surface }]}
                  onPress={() => setMenuVisibleForExercise(null)}
                >
                  <Text style={[styles.menuCancelText, { color: themeColors.textSecondary }]}>
                    {t('common.cancel')}
                  </Text>
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          </Modal>

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
                    {t('training.setColon').replace(':', '')}
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
                  <Text style={[styles.helpLabel, { color: themeColors.primary }]}>i</Text>
                  <Text style={[styles.helpText, { color: themeColors.textPrimary }]}>
                    {t('training.onlyCompletedSetsSavedInstruction')}
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

          <Modal
            visible={successModal.visible}
            transparent
            animationType="fade"
            onRequestClose={() => {
              setSuccessModal(prev => ({ ...prev, visible: false }));
              successModal.onDismiss();
            }}
          >
            <TouchableOpacity
              style={styles.modalOverlay}
              activeOpacity={1}
              onPress={() => {
                setSuccessModal(prev => ({ ...prev, visible: false }));
                successModal.onDismiss();
              }}
            >
              <View style={[styles.successModalContent, dynamicStyles.modalContent]}>
                <View style={[styles.successIconContainer, { backgroundColor: themeColors.success + '20' }]}>
                  <Check size={40} color={themeColors.success} strokeWidth={3} />
                </View>
                <Text style={[styles.successTitle, dynamicStyles.title]}>{successModal.title}</Text>
                <Text style={[styles.successMessage, dynamicStyles.subtitle]}>{successModal.message}</Text>
              </View>
            </TouchableOpacity>
          </Modal>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  timerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  finishBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  finishBtnText: {
    color: '#FFF',
    fontWeight: '700',
    fontSize: 14,
  },
  cancelButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconButton: {
    padding: 4,
  },
  content: {
    padding: 16,
    paddingBottom: 100,
  },
  exerciseCard: {
    marginBottom: 16,
    padding: 16,
  },
  exerciseMenuButton: { minWidth: 44, minHeight: 44, justifyContent: 'center', alignItems: 'center' },
  exerciseProgressRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 8,
  },
  exerciseProgress: { fontSize: 13, fontWeight: '600' },
  collapseSetsButton: {
    minHeight: 44,
    minWidth: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 8,
  },
  exerciseHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  exerciseInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginRight: 8,
  },
  exerciseName: {
    fontSize: 18,
    fontWeight: '700',
    flex: 1,
  },
  supersetBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  setsHeader: {
    gap: 8,
    paddingHorizontal: 8,
    flexDirection: 'row',
    paddingBottom: 8,
    marginBottom: 8,
    borderBottomWidth: 1,
    alignItems: 'center',
  },
  colHeader: {
    fontSize: 12,
    textAlign: 'center',
  },
  setTable: {
    width: '100%',
  },
  setTableContent: {
    width: '100%',
  },
  setRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    marginBottom: 8,
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 12,
    gap: 8,
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
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
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
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: spacing.s,
  },
  warmupBtn: {
    width: TRAINING_CONTROL_SIZE,
    minHeight: TRAINING_CONTROL_SIZE,
    flexShrink: 0,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  warmupBtnActive: {
    backgroundColor: '#FF9500', // Orange for Warmup (static usually, or use theme warning)
  },
  dropSetBtnActive: {
    backgroundColor: '#5856D6',
  },
  warmupText: {
    fontSize: 12,
    fontWeight: '600',
  },
  warmupTextActive: {
    color: '#FFF',
  },
  rirTargetBadge: {
    minWidth: 34,
    minHeight: 14,
    paddingHorizontal: 3,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rirTargetBadgeText: {
    fontSize: 8,
    lineHeight: 11,
    fontWeight: '700',
    textAlign: 'center',
  },
  prevSet: {
    width: '100%',
    textAlign: 'center',
  },
  prevSetButton: {
    minHeight: TRAINING_CONTROL_SIZE,
    width: 60,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
  },
  input: {
    flex: 1,
    minWidth: 0,
    minHeight: TRAINING_CONTROL_SIZE,
    borderRadius: 8,
    textAlign: 'center',
    fontSize: 16,
    borderWidth: 1,
  },
  compactInput: {
    paddingHorizontal: 0,
    fontSize: 15,
  },
  checkBtn: {
    width: TRAINING_CONTROL_SIZE,
    minHeight: TRAINING_CONTROL_SIZE,
    flexShrink: 0,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkBtnDone: {
    backgroundColor: '#34C759', // Success Green
  },
  addSetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    marginTop: 4,
    gap: 6,
  },
  addSetText: {
    fontWeight: '600',
    fontSize: 14,
  },
  completeAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    gap: 6,
    opacity: 0.8,
  },
  completeAllText: {
    fontSize: 13,
    fontWeight: '500',
  },
  addExerciseBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 16,
    marginBottom: 24,
    gap: 8,
    borderWidth: 1,
    borderStyle: 'dashed',
  },
  addExerciseText: {
    fontSize: 16,
    fontWeight: '600',
  },
  completeAllExercisesBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 16,
    gap: 8,
    marginBottom: 20,
  },
  completeAllExercisesText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '700',
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
  successModalContent: {
    borderRadius: 24,
    padding: 32,
    alignItems: 'center',
    width: '85%',
  },
  successIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  successTitle: {
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 8,
  },
  successMessage: {
    fontSize: 16,
    textAlign: 'center',
  },
  deleteModeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
    gap: 8,
  },
  deleteModeBannerText: {
    fontSize: 13,
    fontWeight: '500',
  },
  deleteModeExitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    gap: 4,
  },
  deleteModeExitText: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '600',
  },
  menuModalContent: {
    borderRadius: 20,
    padding: 20,
    width: '85%',
    maxWidth: 400,
  },
  menuTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 16,
    textAlign: 'center',
  },
  menuOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    borderBottomWidth: 1,
    gap: 12,
  },
  menuOptionText: {
    fontSize: 16,
    fontWeight: '500',
  },
  menuCancelBtn: {
    marginTop: 16,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  menuCancelText: {
    fontSize: 16,
    fontWeight: '600',
  },
  // Skeleton loading styles
  skeletonText: {
    height: 18,
    borderRadius: 6,
  },
  skeletonIcon: {
    width: 20,
    height: 20,
    borderRadius: 4,
  },
  skeletonCol: {
    width: 50,
    height: 12,
    borderRadius: 4,
    flex: 1,
    marginHorizontal: 4,
  },
  skeletonInput: {
    height: 36,
    borderRadius: 8,
    flex: 1,
    marginHorizontal: 4,
  },
  menuOptionDisabled: {
    opacity: 0.5,
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
});
