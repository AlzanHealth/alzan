import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
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
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute, useFocusEffect, RouteProp } from '@react-navigation/native';
import { TrainingScreenNavigationProp, TrainingStackParamList } from '../../types/navigation.types';
import { GlassCard } from '../../components/GlassCard';
import { spacing, borderRadius, shadows, darkShadows } from '../../theme';
import { ExerciseWithType, useActiveWorkout } from '../../hooks/useActiveWorkout';
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

export type WorkoutTemplateExerciseWithDetails = WorkoutTemplateExercise & { exercise: ExerciseWithType | null };

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

const buildWarmupSetDefaults = (orderedExercises: WorkoutTemplateExerciseWithDetails[]) => {
  const defaults: Record<string, boolean> = {};

  orderedExercises.forEach(exercise => {
    if (!exercise?.is_warmup) return;
    const totalSets = Math.max(0, exercise.target_sets || 3);
    for (let setNumber = 1; setNumber <= totalSets; setNumber += 1) {
      defaults[`${exercise.exercise_id}-${setNumber}`] = true;
    }
  });

  return defaults;
};

const parseWarmupSetRecord = (value: unknown): Record<string, boolean> | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;

  const parsed: Record<string, boolean> = {};
  Object.entries(value).forEach(([key, itemValue]) => {
    parsed[key] = !!itemValue;
  });
  return parsed;
};

export const ActiveWorkoutScreen = () => {
  const { t } = useTranslation();
  const { styles: dynamicStyles, colors: themeColors, isDark } = useTrainingStyles();
  const navigation = useNavigation<TrainingScreenNavigationProp>();
  const route = useRoute<RouteProp<TrainingStackParamList, 'ActiveWorkout'>>();
  const { sessionId } = route.params || {};
  const insets = useSafeAreaInsets();

  const {
    activeSessionData,
    isLoading,
    logSet,
    finishSession,
    cancelSession,
    deleteSpecificSet,
    saveSessionSupersetLinks,
  } = useActiveWorkout(sessionId);

  const { preferences, toDisplayWeight, toDbWeight } = useUserPreferences();
  const { settings } = useTrainingSettings();

  // Map key: `${exerciseIndex}-${setIndex}` -> { weight: string, reps: string }
  const [inputs, setInputs] = useState<Record<string, { weight: string; reps: string }>>({});
  // Track warmup sets: key -> boolean
  const [warmupSets, setWarmupSets] = useState<Record<string, boolean>>({});
  const warmupSetsLoaded = useRef(false);
  const [isCompletingAll, setIsCompletingAll] = useState(false);
  const inputsLoaded = useRef(false);

  // ... (Keep existing useEffects for loading/saving inputs)
  // Load persisted inputs on mount and apply defaults
  useEffect(() => {
    const loadInputs = async () => {
      try {
        const stored = await AsyncStorage.getItem(`active_session_inputs_${sessionId}`);
        let currentInputs: Record<string, { weight: string; reps: string }> = stored
          ? (JSON.parse(stored) as Record<string, { weight: string; reps: string }>)
          : {};

        // Apply defaults for Reps (from Template) if not present
        if (activeSessionData?.exercises) {
          const newInputs: Record<string, { weight: string; reps: string }> = { ...currentInputs };
          let hasChanges = false;
          const exercises = activeSessionData.exercises;

          exercises.forEach(item => {
            const exerciseId = item.exercise_id;
            const targetSets = item.target_sets || 3;
            const defaultReps = item.target_reps_min || 0;

            for (let i = 1; i <= targetSets; i++) {
              const key = `${exerciseId}-${i}`;
              const existingInput = newInputs[key];

              if (!existingInput) {
                newInputs[key] = {
                  weight: '', // Weights start empty
                  reps: defaultReps > 0 ? defaultReps.toString() : '',
                };
                hasChanges = true;
              } else if (existingInput.reps === undefined || existingInput.reps === '') {
                if (defaultReps > 0 && !stored) {
                  newInputs[key] = { ...existingInput, reps: defaultReps.toString() };
                  hasChanges = true;
                }
              }
            }
          });

          if (hasChanges) {
            currentInputs = newInputs;
          }
        }

        setInputs(currentInputs);
      } catch (e) {
        console.log('Error loading inputs:', e);
      } finally {
        inputsLoaded.current = true;
      }
    };

    if (activeSessionData) {
      loadInputs();
    }
  }, [sessionId, activeSessionData?.exercises]);

  useEffect(() => {
    if (!inputsLoaded.current) return;
    const saveInputs = async () => {
      try {
        await AsyncStorage.setItem(`active_session_inputs_${sessionId}`, JSON.stringify(inputs));
      } catch (_error) {
        console.log('Error saving inputs:', _error);
      }
    };
    saveInputs();
  }, [inputs, sessionId]);

  // Timer State (Rest)
  const [timerVisible, setTimerVisible] = useState(false);
  const [timerSeconds, setTimerSeconds] = useState(60);
  const [helpModalVisible, setHelpModalVisible] = useState(false);

  // Execution Timer State (for time-based exercises)
  const [executionTimerVisible, setExecutionTimerVisible] = useState(false);
  const [executionTimerSeconds, setExecutionTimerSeconds] = useState(30);
  const [pendingRestSeconds, setPendingRestSeconds] = useState<number | null>(null);

  // Local Completed Sets State (Batch Save Model)
  const [localCompletedSets, setLocalCompletedSets] = useState<Set<string>>(new Set());
  const completedSetsLoaded = useRef(false);

  // ... (Keep existing useEffects for completed sets persistence)
  useEffect(() => {
    const loadCompletedSets = async () => {
      try {
        const stored = await AsyncStorage.getItem(`active_session_completed_sets_${sessionId}`);
        if (stored) {
          const parsed = JSON.parse(stored);
          setLocalCompletedSets(new Set(parsed));
        } else {
          const dbSetKeys = activeSessionData?.completedSets?.map(s => `${s.exercise_id}-${s.set_number}`) || [];
          if (dbSetKeys.length > 0) {
            setLocalCompletedSets(new Set(dbSetKeys));
          }
        }
      } catch (e) {
        console.log('Error loading completed sets:', e);
      } finally {
        completedSetsLoaded.current = true;
      }
    };
    loadCompletedSets();
  }, [sessionId, activeSessionData?.completedSets]);

  useEffect(() => {
    if (!completedSetsLoaded.current) return;
    const saveCompletedSets = async () => {
      try {
        await AsyncStorage.setItem(
          `active_session_completed_sets_${sessionId}`,
          JSON.stringify(Array.from(localCompletedSets)),
        );
      } catch (e) {
        console.log('Error saving completed sets:', e);
      }
    };
    saveCompletedSets();
  }, [localCompletedSets, sessionId]);

  const [extraSets, setExtraSets] = useState<Record<string, number>>({});
  const [localAdhocExercises, setLocalAdhocExercises] = useState<WorkoutTemplateExerciseWithDetails[]>([]);
  const [hiddenExercises, setHiddenExercises] = useState<Set<string>>(new Set());
  const [exerciseOrder, setExerciseOrder] = useState<string[]>([]); // Custom order by exercise_id
  const [supersetLinks, setSupersetLinks] = useState<Set<string>>(new Set());
  const supersetLinksLoaded = useRef(false);

  // Exercise Options Menu State
  const [menuVisibleForExercise, setMenuVisibleForExercise] = useState<string | null>(null);

  const dbExercises = activeSessionData?.exercises || [];
  const exercises = [
    ...dbExercises,
    ...localAdhocExercises.filter(local => !dbExercises.find(db => db.exercise_id === local.exercise_id)),
  ];
  const templateExercises = useMemo(
    () => [...dbExercises].sort((a, b) => a.order_index - b.order_index),
    [dbExercises],
  );

  // Load localized session state (extra sets, order, etc)
  useEffect(() => {
    const loadLocalState = async () => {
      try {
        const [storedExtraSets, storedWarmupSets, storedAdhoc, storedHidden, storedOrder, storedSupersetLinks] =
          await Promise.all([
            AsyncStorage.getItem(`active_session_extra_sets_${sessionId}`),
            AsyncStorage.getItem(`active_session_warmup_sets_${sessionId}`),
            AsyncStorage.getItem(`active_session_adhoc_${sessionId}`),
            AsyncStorage.getItem(`active_session_hidden_${sessionId}`),
            AsyncStorage.getItem(`active_session_order_${sessionId}`),
            AsyncStorage.getItem(`active_session_superset_links_${sessionId}`),
          ]);

        if (storedExtraSets) setExtraSets(JSON.parse(storedExtraSets));
        const defaultWarmupSets = buildWarmupSetDefaults(templateExercises);
        if (storedWarmupSets) {
          const parsedWarmupSets = parseWarmupSetRecord(JSON.parse(storedWarmupSets));
          if (
            parsedWarmupSets &&
            (Object.keys(parsedWarmupSets).length > 0 || Object.keys(defaultWarmupSets).length === 0)
          ) {
            setWarmupSets(parsedWarmupSets);
          } else {
            setWarmupSets(defaultWarmupSets);
          }
        } else {
          setWarmupSets(defaultWarmupSets);
        }
        if (storedAdhoc) setLocalAdhocExercises(JSON.parse(storedAdhoc));
        if (storedHidden) setHiddenExercises(new Set(JSON.parse(storedHidden)));
        if (storedOrder) setExerciseOrder(JSON.parse(storedOrder));
        if (storedSupersetLinks) {
          const parsed = JSON.parse(storedSupersetLinks);
          if (Array.isArray(parsed)) {
            const validLinks = new Set<string>();
            parsed.forEach(val => {
              if (typeof val === 'number') {
                const ex1 = templateExercises[val];
                const ex2 = templateExercises[val + 1];
                if (ex1 && ex2) validLinks.add(`${ex1.exercise_id}|${ex2.exercise_id}`);
              } else if (typeof val === 'string') {
                validLinks.add(val);
              }
            });
            setSupersetLinks(validLinks);
          }
        } else if (activeSessionData?.sessionSupersetLinks && activeSessionData.sessionSupersetLinks.length > 0) {
          setSupersetLinks(
            buildSupersetLinksFromSessionLinks(templateExercises, activeSessionData.sessionSupersetLinks),
          );
        } else {
          setSupersetLinks(buildSupersetLinksFromOrderedExercises(templateExercises));
        }
      } catch (e) {
        console.log('Error loading local session state:', e);
      } finally {
        warmupSetsLoaded.current = true;
        supersetLinksLoaded.current = true;
      }
    };

    if (activeSessionData) {
      loadLocalState();
    }
  }, [sessionId, activeSessionData?.exercises, activeSessionData?.sessionSupersetLinks, templateExercises]);

  // Persist extraSets
  useEffect(() => {
    const save = async () => {
      try {
        await AsyncStorage.setItem(`active_session_extra_sets_${sessionId}`, JSON.stringify(extraSets));
      } catch (e) {
        console.log('Error saving extraSets:', e);
      }
    };
    save();
  }, [extraSets, sessionId]);

  // Persist warmupSets
  useEffect(() => {
    if (!warmupSetsLoaded.current) return;
    const save = async () => {
      try {
        await AsyncStorage.setItem(`active_session_warmup_sets_${sessionId}`, JSON.stringify(warmupSets));
      } catch (e) {
        console.log('Error saving warmupSets:', e);
      }
    };
    save();
  }, [warmupSets, sessionId]);

  // Persist localAdhocExercises
  useEffect(() => {
    const save = async () => {
      try {
        // Create a safe version to stringify if needed, or just stringify directly if circular deps aren't present
        await AsyncStorage.setItem(`active_session_adhoc_${sessionId}`, JSON.stringify(localAdhocExercises));
      } catch (e) {
        console.log('Error saving adhoc:', e);
      }
    };
    save();
  }, [localAdhocExercises, sessionId]);

  // Persist hiddenExercises
  useEffect(() => {
    const save = async () => {
      try {
        await AsyncStorage.setItem(`active_session_hidden_${sessionId}`, JSON.stringify(Array.from(hiddenExercises)));
      } catch (e) {
        console.log('Error saving hidden:', e);
      }
    };
    save();
  }, [hiddenExercises, sessionId]);

  // Persist exerciseOrder
  useEffect(() => {
    if (exerciseOrder.length > 0) {
      AsyncStorage.setItem(`active_session_order_${sessionId}`, JSON.stringify(exerciseOrder)).catch(e =>
        console.log(e),
      );
    }
  }, [exerciseOrder, sessionId]);

  // Persist supersetLinks
  useEffect(() => {
    if (!supersetLinksLoaded.current) return;

    const save = async () => {
      try {
        await AsyncStorage.setItem(
          `active_session_superset_links_${sessionId}`,
          JSON.stringify(Array.from(supersetLinks).sort((a, b) => a.localeCompare(b))),
        );
      } catch (e) {
        console.log('Error saving supersetLinks:', e);
      }
    };
    save();
  }, [supersetLinks, sessionId]);

  useEffect(() => {
    if (exercises.length > 0) {
      setExerciseOrder(prev => {
        if (prev.length === 0) {
          return exercises.map(e => e.exercise_id);
        }
        // Append new ones if any
        const existingIds = new Set(prev);
        const newIds = exercises.filter(e => !existingIds.has(e.exercise_id)).map(e => e.exercise_id);
        if (newIds.length > 0) {
          return [...prev, ...newIds];
        }
        return prev;
      });
    }
  }, [exercises.length]); // Depend on length to avoid deep loops

  const orderedExerciseIds = exerciseOrder.length > 0 ? exerciseOrder : exercises.map(exercise => exercise.exercise_id);

  // Build ordered visible exercises
  const visibleExercises = orderedExerciseIds
    .map(id => exercises.find(e => e.exercise_id === id))
    .filter(e => e && !hiddenExercises.has(e.exercise_id))
    .filter(e => e !== undefined);

  useEffect(() => {
    setSupersetLinks(prev => {
      const activeIds = new Set(orderedExerciseIds);
      const cleaned = new Set<string>();
      prev.forEach(linkKey => {
        const [id1, id2] = linkKey.split('|');
        if (activeIds.has(id1) && activeIds.has(id2)) {
          cleaned.add(linkKey);
        }
      });
      return cleaned.size === prev.size ? prev : cleaned;
    });
  }, [orderedExerciseIds]);

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
        [key]: { ...prev[key], [field]: normalized },
      }));
      return;
    }

    const normalizedReps = value.replace(/[^0-9]/g, '');
    setInputs(prev => ({
      ...prev,
      [key]: { ...prev[key], [field]: normalizedReps },
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
    } else {
      nextCompletedSets.add(key);
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
      } else {
        // Reps-based exercise: show rest timer directly
        if (restVal > 0) {
          setTimerSeconds(restVal);
          setTimerVisible(true);
        }
      }
    }
  };

  // Handle execution timer completion - show rest timer
  const handleExecutionComplete = () => {
    setExecutionTimerVisible(false);
    if (pendingRestSeconds && pendingRestSeconds > 0) {
      setTimerSeconds(pendingRestSeconds);
      setTimerVisible(true);
    }
    setPendingRestSeconds(null);
  };

  const handleExecutionDismiss = () => {
    setExecutionTimerVisible(false);
    setPendingRestSeconds(null);
  };

  // Exercise Menu Actions
  const handleViewExerciseInfo = (exercise: ExerciseWithDetails) => {
    setMenuVisibleForExercise(null);
    navigation.navigate('ExerciseDetail', { exercise: exercise });
  };

  const handleDeleteLastSet = (exerciseId: string, exerciseName: string) => {
    setMenuVisibleForExercise(null);

    // Find the highest set number for this exercise
    const exerciseSets = activeSessionData?.completedSets?.filter(s => s.exercise_id === exerciseId) || [];
    if (exerciseSets.length === 0) {
      Alert.alert(t('training.noSetsTitle'), t('training.noCompletedSetsDeleteMessage'));
      return;
    }

    // Get the last set (highest set_number)
    const lastSet = exerciseSets.reduce((max, current) => (current.set_number > max.set_number ? current : max));

    Alert.alert(
      t('training.deleteLastSetTitle'),
      t('training.deleteLastSetQuestion', { setNumber: lastSet.set_number, exerciseName }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: () => {
            deleteSpecificSet.mutate({ sessionId, exerciseId, setNumber: lastSet.set_number });
          },
        },
      ],
    );
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

  // Timer Duration Logic
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    const loadDuration = async () => {
      try {
        const stored = await AsyncStorage.getItem(`active_session_duration_${sessionId}`);
        if (stored) {
          setDuration(parseInt(stored, 10));
        } else {
          setDuration(0);
        }
      } catch (e) {
        console.log(e);
        setDuration(0);
      }
    };
    loadDuration();
  }, [sessionId]);

  useFocusEffect(
    React.useCallback(() => {
      // Timer only runs while screen is focused
      const interval = setInterval(() => {
        setDuration(prev => {
          const newVal = prev + 1;
          AsyncStorage.setItem(`active_session_duration_${sessionId}`, String(newVal));
          return newVal;
        });
      }, 1000);

      return () => clearInterval(interval);
    }, [sessionId]),
  );

  const inputsRef = useRef(inputs);
  useEffect(() => {
    inputsRef.current = inputs;
  }, [inputs]);

  const [isFinishing, setIsFinishing] = useState(false);

  const handleFinish = async () => {
    Alert.alert(t('training.finishWorkoutConfirmTitle'), t('training.finishWorkoutConfirmMessage'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('training.finishNow'),
        onPress: async () => {
          try {
            setIsFinishing(true);
            await new Promise(r => setTimeout(r, 50));

            const inputsCurrent = inputsRef.current;
            const pendingSaves: Promise<unknown>[] = [];

            let savedCount = 0;
            let savedVolume = 0;

            for (const item of visibleExercises) {
              const exerciseId = item?.exercise_id;
              const totalSets = Math.max(0, (item?.target_sets || 3) + (extraSets[exerciseId!] || 0));

              for (let i = 0; i < totalSets; i++) {
                const setNum = i + 1;
                if (!isSetCompleted(exerciseId!, setNum)) continue;

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
                const isWarmup = !!warmupSets[key];

                savedCount++;
                savedVolume += weightKg * reps;

                pendingSaves.push(
                  logSet
                    .mutateAsync({
                      session_id: sessionId,
                      exercise_id: exerciseId!,
                      set_number: setNum,
                      weight_kg: weightKg,
                      reps: reps,
                      rest_s: item?.rest_seconds,
                      is_warmup: isWarmup,
                      is_pr: false,
                    })
                    .catch(e => console.error(`Error saving set ${key}:`, e)),
                );
              }
            }

            if (pendingSaves.length > 0) {
              await Promise.all(pendingSaves);
              await new Promise(r => setTimeout(r, 500));
            }

            const supersetPayload = [];
            for (let i = 0; i < visibleExercises.length - 1; i++) {
              const curr = visibleExercises[i];
              const next = visibleExercises[i + 1];
              if (curr && next && supersetLinks.has(`${curr.exercise_id}|${next.exercise_id}`)) {
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

            await finishSession.mutateAsync({
              id: sessionId,
              duration_s: duration,
              rpe: 0,
              notes: '',
            });

            await AsyncStorage.removeItem(`active_session_duration_${sessionId}`);
            await AsyncStorage.removeItem(`active_session_inputs_${sessionId}`);
            await AsyncStorage.removeItem(`active_session_completed_sets_${sessionId}`);
            await AsyncStorage.removeItem(`active_session_extra_sets_${sessionId}`);
            await AsyncStorage.removeItem(`active_session_warmup_sets_${sessionId}`);
            await AsyncStorage.removeItem(`active_session_adhoc_${sessionId}`);
            await AsyncStorage.removeItem(`active_session_hidden_${sessionId}`);
            await AsyncStorage.removeItem(`active_session_order_${sessionId}`);
            await AsyncStorage.removeItem(`active_session_superset_links_${sessionId}`);

            navigation.replace('EnduranceSessionForm', {
              gymSessionData: {
                sessionId,
                name: activeSessionData?.session?.name || t('training.strengthWorkout'),
                exercisesCount: visibleExercises.length,
                setsCount: savedCount,
                volumeLoad: Math.round(savedVolume),
                startTime: activeSessionData?.session?.start_time || new Date().toISOString(),
                endTime: new Date().toISOString(),
                durationSeconds: duration,
              },
            });
          } catch (e) {
            console.error('[handleFinish] Error fatal:', e);
            setIsFinishing(false);
            Alert.alert(t('common.error'), t('training.finishSessionError'));
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
          try {
            await cancelSession.mutateAsync(sessionId);
            await AsyncStorage.removeItem(`active_session_duration_${sessionId}`);
            await AsyncStorage.removeItem(`active_session_inputs_${sessionId}`);
            await AsyncStorage.removeItem(`active_session_completed_sets_${sessionId}`);
            await AsyncStorage.removeItem(`active_session_extra_sets_${sessionId}`);
            await AsyncStorage.removeItem(`active_session_warmup_sets_${sessionId}`);
            await AsyncStorage.removeItem(`active_session_adhoc_${sessionId}`);
            await AsyncStorage.removeItem(`active_session_hidden_${sessionId}`);
            await AsyncStorage.removeItem(`active_session_order_${sessionId}`);
            await AsyncStorage.removeItem(`active_session_superset_links_${sessionId}`);

            navigation.goBack();
          } catch (_error) {
            Alert.alert(t('common.error'), t('training.cancelSessionError'));
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
      setWarmupSets(prev => ({
        ...prev,
        [newKey]: true,
      }));
    }
  };

  const handleAddAdhocExercise = (exercise: ExerciseWithDetails) => {
    const newAdhoc = {
      id: `local-${exercise.id}-${Date.now()}`,
      exercise_id: exercise.id,
      exercise: exercise,
      is_warmup: false,
      target_sets: 3,
      target_reps_min: 0,
      target_reps_max: 0,
      target_weight_kg: 0,
      rest_seconds: 60,
      start_order: 9999,
    };
    setLocalAdhocExercises(prev => [...prev, newAdhoc] as WorkoutTemplateExerciseWithDetails[]);
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

  const handleCompleteAll = async (exerciseId: string, item: WorkoutTemplateExerciseWithDetails) => {
    const targetSets = Math.max(0, (item.target_sets || 3) + (extraSets[exerciseId] || 0));

    setLocalCompletedSets(prev => {
      const next = new Set(prev);
      for (let setNum = 1; setNum <= targetSets; setNum++) {
        next.add(`${exerciseId}-${setNum}`);
      }
      return next;
    });

    setSuccessModal({
      visible: true,
      title: t('training.workoutCompleted'),
      message: t('training.allSetsMarked'),
      onDismiss: () => {},
    });
  };

  const handleCompleteAllExercises = async () => {
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
            <WorkoutDurationTimer seconds={duration} style={{ color: themeColors.textPrimary }} />
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
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1 }}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
        >
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" style={{ flex: 1 }}>
            {/* Loading Skeleton */}
            {isLoading && visibleExercises.length === 0 && (
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
            )}
            {visibleExercises.map((item, i: number) => {
              const exerciseId = item.exercise_id;
              const totalSets = Math.max(0, (item.target_sets || 3) + (extraSets[exerciseId] || 0));
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
                          <TouchableOpacity onPress={() => setMenuVisibleForExercise(exerciseId)}>
                            <MoreVertical size={20} color={themeColors.textSecondary} />
                          </TouchableOpacity>
                        </View>

                        <View
                          style={[
                            styles.setsHeader,
                            {
                              borderBottomColor: isInSuperset
                                ? themeColors.primary + '7A'
                                : isDark
                                  ? 'rgba(255,255,255,0.1)'
                                  : 'rgba(0,0,0,0.05)',
                            },
                          ]}
                        >
                          <Text style={[styles.colHeader, dynamicStyles.sublabel, { width: 30 }]}>
                            {t('training.setColon')}
                          </Text>
                          {!isTimeBased && (
                            <>
                              <Text style={[styles.colHeader, dynamicStyles.sublabel, { width: 60 }]}>
                                {t('training.prColonAllCaps')}
                              </Text>
                              <Text style={[styles.colHeader, dynamicStyles.sublabel, { flex: 1 }]}>
                                {preferences.weight_unit}
                              </Text>
                            </>
                          )}
                          <Text style={[styles.colHeader, dynamicStyles.sublabel, { flex: isTimeBased ? 2 : 1 }]}>
                            {isTimeBased ? t('training.time') : t('training.repsColon')}
                          </Text>
                          <TouchableOpacity
                            onPress={() => setHelpModalVisible(true)}
                            style={{ width: 30, alignItems: 'center', justifyContent: 'center' }}
                          >
                            <HelpCircle size={16} color={themeColors.textSecondary} />
                          </TouchableOpacity>
                        </View>

                        {Array.from({ length: totalSets }).map((_, setIdx) => {
                          const setNum = setIdx + 1;
                          const isDone = isSetCompleted(exerciseId, setNum);
                          const doneSet = getCompletedSet(exerciseId, setNum);
                          const key = `${exerciseId}-${setNum}`;

                          const prData = activeSessionData?.prs?.[exerciseId];
                          const prevText = prData
                            ? `${toDisplayWeight(prData.weight_kg)} ${preferences.weight_unit}`
                            : '-';

                          return (
                            <View
                              key={setNum}
                              style={[
                                styles.setRow,
                                isDone && {
                                  backgroundColor: isDark ? 'rgba(52, 199, 89, 0.15)' : 'rgba(52, 199, 89, 0.1)',
                                },
                                warmupSets[key] && {
                                  backgroundColor: isDark ? 'rgba(255, 149, 0, 0.15)' : 'rgba(255, 149, 0, 0.1)',
                                },
                              ]}
                            >
                              <TouchableOpacity
                                style={[styles.warmupBtn, warmupSets[key] && styles.warmupBtnActive]}
                                onPress={() => setWarmupSets(prev => ({ ...prev, [key]: !prev[key] }))}
                                disabled={isDone}
                              >
                                <Text
                                  style={[
                                    styles.warmupText,
                                    { color: themeColors.textSecondary },
                                    warmupSets[key] && styles.warmupTextActive,
                                  ]}
                                >
                                  {warmupSets[key] ? 'W' : setNum}
                                </Text>
                              </TouchableOpacity>

                              {!isTimeBased && (
                                <>
                                  <TouchableOpacity
                                    style={styles.prevSetButton}
                                    onPress={() => handleApplyPrToSetWeight(key, prData?.weight_kg)}
                                    disabled={!prData}
                                    activeOpacity={0.75}
                                  >
                                    <Text
                                      style={[
                                        styles.prevSet,
                                        {
                                          fontSize: 11,
                                          color: prData ? themeColors.primary : themeColors.textSecondary,
                                        },
                                      ]}
                                      numberOfLines={2}
                                    >
                                      {prevText}
                                    </Text>
                                  </TouchableOpacity>

                                  <TextInput
                                    style={[styles.input, dynamicStyles.input]}
                                    keyboardType={Platform.OS === 'web' ? 'default' : 'decimal-pad'}
                                    inputMode="decimal"
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
                                style={[styles.input, dynamicStyles.input, isTimeBased && { flex: 2 }]}
                                keyboardType="numeric"
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
                                    : isDone && doneSet?.reps
                                      ? doneSet.reps.toString()
                                      : isTimeBased
                                        ? (item.target_reps_min || 0).toString()
                                        : ''
                                }
                              />

                              <TouchableOpacity
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
            })}

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
              <Text style={[styles.addExerciseText, { color: themeColors.primary }]}>{t('training.addExercise')}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.completeAllExercisesBtn, { backgroundColor: themeColors.success }]}
              onPress={handleCompleteAllExercises}
              disabled={isCompletingAll}
            >
              <Check size={20} color="#FFF" />
              <Text style={styles.completeAllExercisesText}>{t('training.completeAll')}</Text>
            </TouchableOpacity>
          </ScrollView>

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
              onComplete={() => setTimerVisible(false)}
              onDismiss={() => setTimerVisible(false)}
              soundEnabled={settings.soundEnabled}
              vibrationEnabled={settings.hapticsEnabled}
              bottomOffset={timerBottomOffset}
            />
          )}

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
                  style={[
                    styles.menuOption,
                    { borderBottomColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)' },
                  ]}
                  onPress={() => {
                    const exercise = visibleExercises.find(e => e.exercise_id === menuVisibleForExercise);
                    if (exercise)
                      handleDeleteLastSet(
                        exercise.exercise_id,
                        (exercise.exercise ? getLocalizedExerciseName(exercise.exercise) : undefined) ||
                          t('training.exercise'),
                      );
                  }}
                >
                  <Trash2 size={20} color={themeColors.warning || '#FF9500'} />
                  <Text style={[styles.menuOptionText, { color: themeColors.textPrimary }]}>
                    {t('training.deleteSet')}
                  </Text>
                </TouchableOpacity>

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
    width: 24,
    height: 24,
    flexShrink: 0,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  warmupBtnActive: {
    backgroundColor: '#FF9500', // Orange for Warmup (static usually, or use theme warning)
  },
  warmupText: {
    fontSize: 12,
    fontWeight: '600',
  },
  warmupTextActive: {
    color: '#FFF',
  },
  prevSet: {
    width: 60,
    flexShrink: 0,
    textAlign: 'center',
  },
  prevSetButton: {
    width: 60,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
  },
  input: {
    flex: 1,
    minWidth: 0,
    height: 40,
    borderRadius: 8,
    textAlign: 'center',
    fontSize: 16,
    borderWidth: 1,
  },
  checkBtn: {
    width: 32,
    height: 32,
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
