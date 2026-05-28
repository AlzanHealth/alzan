import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActionSheetIOS,
  Platform,
  ActivityIndicator,
  Modal,
  Pressable,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { TrainingScreenNavigationProp, TrainingStackParamList } from '../../types/navigation.types';
import { GlassCard } from '../../components/GlassCard';
import { colors, spacing, typography, borderRadius } from '../../theme';
import {
  Plus,
  Clock,
  Ruler,
  Zap,
  Repeat,
  Activity,
  Trash2,
  MoreVertical,
  ArrowLeft,
  ChevronRight,
} from 'lucide-react-native';
import { EnduranceStepEditorModal } from './components/EnduranceStepEditorModal';
import { EnduranceTemplateSummaryPanel } from './components/EnduranceTemplateSummaryPanel';
import { WeekDaySelector } from '../../components/training/WeekDaySelector';
import { RepetitionsSelectorModal } from './components/RepetitionsSelectorModal';
import { useEnduranceWorkoutBuilder, BuilderStep } from '../../hooks/useEnduranceWorkoutBuilder';
import { useTrainingStyles } from '../../hooks/useTrainingStyles';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../context/AuthContext';
import { addDays, format } from 'date-fns';
import { LiquidGlassFooter } from '../../components/common/LiquidGlassFooter';
import { LinearGradient } from 'expo-linear-gradient';
import { SportIcon } from '../../components/icons/SportIcon';
import { SPORT_COLORS } from '../../theme/sportColors';
import { useUnitConversion } from '../../hooks/useUnitConversion';
import { useSportCatalog } from '../../hooks/useSportCatalog';
import { DurationType, PhaseType, SportType, TargetType } from '../../types/requests.types';
import { Nullable } from '../../types/common.types';
import { Alert } from '../../components/common/Alert';
import { useTranslation } from 'react-i18next';
import { getPhaseLabel } from './helpers/phase.helper';
import { getDateFnsLocale } from '../../i18n/dateLocale';

interface Step {
  id: string; // temp id
  phase_type: PhaseType;
  duration_type: DurationType;
  duration_s?: number;
  distance_m?: number;
  target_type: TargetType;
  target_min?: number;
  target_max?: number;
  repetitions: number;
  parent_step_id?: string | null;
  is_group: boolean;
  children?: Step[]; // For UI state
}

export const EnduranceWorkoutBuilderScreen = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const navigation = useNavigation<TrainingScreenNavigationProp>();
  const route = useRoute<RouteProp<TrainingStackParamList, 'EnduranceWorkoutBuilder'>>();
  const { saveWorkout } = useEnduranceWorkoutBuilder();
  const { convertDistanceToUi, convertSpeedToUi } = useUnitConversion();
  const { options: sportCatalogOptions, getOptions, getGroupLabel, getOptionLabel } = useSportCatalog();
  const { styles: dynamicStyles, colors: themeColors, isDark } = useTrainingStyles();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isWideLayout = width >= 960;

  const tabBarClearance = 112 + insets.bottom;
  const footerBottomPosition = Math.max(112, tabBarClearance);
  const mainContentBottomPadding = tabBarClearance + spacing.xl;
  const builderContentBottomPadding = isWideLayout ? tabBarClearance + spacing.xl : footerBottomPosition + 112;

  const getWeekdayName = (dayIndex: number) => {
    const baseSunday = new Date(2024, 0, 7); // Sunday
    return format(addDays(baseSunday, dayIndex), 'EEEE', { locale: getDateFnsLocale() });
  };

  const templateId = route.params?.templateId;
  const isEditMode = !!templateId;

  // View state: 'main' (Form) | 'builder' (Steps List editor)
  const [currentView, setCurrentView] = useState<'main' | 'builder'>('main');

  // Data State
  const [steps, setSteps] = useState<Step[]>([]);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [trainingGoal, setTrainingGoal] = useState<string | undefined>(undefined);
  const [customGoalText, setCustomGoalText] = useState('');
  const [sportType, setSportType] = useState<Nullable<SportType>>(route.params?.sportType || null);
  const [scheduledDays, setScheduledDays] = useState<number[]>([]);
  const [originalScheduledDay, setOriginalScheduledDay] = useState<number | null>(null);
  const [isRecurring, setIsRecurring] = useState(false);
  const [manualDuration, setManualDuration] = useState<string>('');
  const [environmentType, setEnvironmentType] = useState<string | null>(null);
  const [surface, setSurface] = useState<string | null>(null);
  const [poolType, setPoolType] = useState<string | null>(null);
  const [stroke, setStroke] = useState<string | null>(null);

  // Modals visibility
  const [goalModalVisible, setGoalModalVisible] = useState(false);
  const [surfaceModalVisible, setSurfaceModalVisible] = useState(false);
  const [typeModalVisible, setTypeModalVisible] = useState(false);
  const [poolTypeModalVisible, setPoolTypeModalVisible] = useState(false);
  const [strokeModalVisible, setStrokeModalVisible] = useState(false);

  // Step Modals
  const [modalVisible, setModalVisible] = useState(false);
  const [editingStep, setEditingStep] = useState<Step | null>(null);
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const [repsModalVisible, setRepsModalVisible] = useState(false);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);

  const formatTime = (seconds: number) => {
    if (seconds >= 3600) {
      const hours = Math.floor(seconds / 3600);
      const rem = seconds % 3600;
      const mins = Math.floor(rem / 60);
      const secs = rem % 60;
      return `${hours}:${mins < 10 ? '0' : ''}${mins}:${secs < 10 ? '0' : ''}${secs}`;
    }
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  const formatTarget = (step: Step) => {
    if (step.target_type === 'pace') {
      const paceSeconds = step.target_min || 0;
      const speedMps = paceSeconds ? 1000 / paceSeconds : 0;
      if (!speedMps) return '';

      const { label } = convertSpeedToUi(speedMps, sportType ?? undefined);
      return label;
    }
    if (step.target_type === 'heart_rate') {
      return `Zona ${step.target_min || step.target_max || '?'}`;
    }
    if (step.target_type === 'speed') {
      const val = step.target_min || 0;
      const mps = val / 3.6;
      const { label } = convertSpeedToUi(mps, sportType!);
      return label;
    }
    if (step.target_type === 'none') return '';

    return `${step.target_min || 0} - ${step.target_max || 0} ${step.target_type}`;
  };

  // Load existing template for edit mode
  const { data: existingTemplate, isLoading: isExistingTemplateLoading } = useQuery({
    queryKey: ['enduranceTemplate', templateId],
    queryFn: async () => {
      if (!templateId) return null;
      const { data, error } = await supabase
        .from('endurance_workout_templates')
        .select(`*, endurance_workout_steps(*)`)
        .eq('id', templateId)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!templateId,
  });

  const isHydratingEditTemplate = isEditMode && isExistingTemplateLoading && !sportType;

  // Populate fields when template loads
  useEffect(() => {
    if (existingTemplate) {
      setName(existingTemplate.base_name || '');
      setDescription(existingTemplate.description || '');

      const goalValue = existingTemplate.workout_goal || undefined;
      setTrainingGoal(goalValue);
      if (goalValue && isCustomGoal(goalValue)) {
        setCustomGoalText(goalValue);
      }

      setSportType((existingTemplate.sport_type as SportType) || 'running');
      setEnvironmentType(existingTemplate.environment_type || null);
      setSurface(existingTemplate.surface || null);
      setPoolType(existingTemplate.pool_type || null);
      setStroke(existingTemplate.stroke || null);

      if (existingTemplate.scheduled_day !== null && existingTemplate.scheduled_day !== undefined) {
        setScheduledDays([existingTemplate.scheduled_day]);
        setOriginalScheduledDay(existingTemplate.scheduled_day);
      } else {
        setScheduledDays([]);
        setOriginalScheduledDay(null);
      }
      setIsRecurring(!!existingTemplate.scheduled_day);

      // Convert DB steps to UI format
      if (existingTemplate.endurance_workout_steps) {
        const dbSteps = existingTemplate.endurance_workout_steps;
        const uiSteps: Step[] = dbSteps
          .filter(s => !s.parent_step_id)
          .sort((a, b) => a.order_index - b.order_index)
          .map(s => ({
            id: s.id,
            phase_type: s.phase_type,
            duration_type: s.duration_type,
            duration_s: s.duration_s,
            distance_m: s.distance_m,
            target_type: s.target_type,
            target_min: s.target_min,
            target_max: s.target_max,
            repetitions: s.repetitions || 1,
            is_group: s.is_group || false,
            children: dbSteps
              .filter(c => c.parent_step_id === s.id)
              .sort((a, b) => a.order_index - b.order_index)
              .map(c => ({
                id: c.id,
                phase_type: c.phase_type,
                duration_type: c.duration_type,
                duration_s: c.duration_s,
                distance_m: c.distance_m,
                target_type: c.target_type,
                target_min: c.target_min,
                target_max: c.target_max,
                repetitions: c.repetitions || 1,
                is_group: false,
                parent_step_id: s.id,
              })),
          })) as Step[];
        setSteps(uiSteps);
      }
    }
  }, [existingTemplate]);

  const goalOptions = sportType ? getOptions(sportType, 'goal') : [];
  const modalityOptions = sportType ? getOptions(sportType, 'modality') : [];
  const terrainOptions = sportType ? getOptions(sportType, 'terrain') : [];
  const hasModalityOptions = modalityOptions.length > 0;
  const hasTerrainOptions = terrainOptions.length > 0;

  useEffect(() => {
    if (!sportType || sportCatalogOptions.length === 0) return;

    const nextEnvironmentType =
      environmentType && modalityOptions.some(option => option.option_key === environmentType) ? environmentType : null;
    const nextSurface = surface && terrainOptions.some(option => option.option_key === surface) ? surface : null;

    if (environmentType !== nextEnvironmentType) setEnvironmentType(nextEnvironmentType);
    if (surface !== nextSurface) setSurface(nextSurface);
  }, [environmentType, modalityOptions, sportCatalogOptions.length, sportType, surface, terrainOptions]);

  // Goal options mapping helper
  const isCustomGoal = (goal?: string) => {
    if (!goal) return false;
    return !goalOptions.some(option => option.option_key === goal);
  };

  const getStructuredGoals = () => {
    return [
      ...goalOptions.map(option => ({
        key: option.option_key,
        title: getOptionLabel(sportType, option.option_key, 'goal'),
        desc: '',
      })),
      { key: 'custom', title: t('training.goalCustomTitle'), desc: t('training.goalCustomDesc') },
    ];
  };

  const getGoalDisplayLabel = (goal?: string) => {
    if (!goal) return '';
    const match = getStructuredGoals().find(g => g.key === goal);
    if (match && match.key !== 'custom') {
      return match.title;
    }
    return goal;
  };

  const getSurfaceDisplayLabel = (surf?: string | null) => {
    return getOptionLabel(sportType, surf, 'terrain');
  };

  const getEnvironmentDisplayLabel = (environment?: string | null) => {
    return getOptionLabel(sportType, environment, 'modality');
  };

  // Helper to estimate missing values
  const getStepEstimates = (step: Step): { duration: number; distance: number } => {
    let duration = 0;
    let distance = 0;

    if (step.duration_type === 'time') duration = step.duration_s || 0;
    if (step.duration_type === 'distance') distance = step.distance_m || 0;

    if (step.target_type === 'pace' && step.target_min && step.target_min > 0) {
      const isSwim = sportType === 'swimming';
      const unitMeters = isSwim ? 100 : 1000;
      const secsPerUnit = step.target_min;

      if (step.duration_type === 'distance' && distance > 0) {
        duration = (distance / unitMeters) * secsPerUnit;
      } else if (step.duration_type === 'time' && duration > 0) {
        distance = (duration / secsPerUnit) * unitMeters;
      }
    } else if (step.target_type === 'speed' && step.target_min && step.target_min > 0) {
      const kmh = step.target_min;
      const mps = (kmh * 1000) / 3600;

      if (step.duration_type === 'distance' && distance > 0) {
        duration = distance / mps;
      } else if (step.duration_type === 'time' && duration > 0) {
        distance = duration * mps;
      }
    }

    return { duration, distance };
  };

  // Summary calculation
  const calculateSummary = () => {
    let totalDuration = 0;
    let totalDistance = 0;

    const processStep = (step: Step) => {
      const reps = step.repetitions || 1;
      if (step.is_group && step.children) {
        step.children.forEach(child => {
          const estimates = getStepEstimates(child);
          totalDuration += estimates.duration * reps;
          totalDistance += estimates.distance * reps;
        });
      } else {
        const estimates = getStepEstimates(step);
        totalDuration += estimates.duration * reps;
        totalDistance += estimates.distance * reps;
      }
    };

    steps.forEach(processStep);
    return { totalDuration, totalDistance };
  };

  const { totalDuration, totalDistance } = calculateSummary();

  const getSummaryBlocks = () => {
    let warmupStr = '--';
    let workStr = '--';
    let cooldownStr = '--';

    const warmupStep = steps.find(s => s.phase_type === 'warmup');
    if (warmupStep) {
      warmupStr =
        warmupStep.duration_type === 'distance'
          ? `${convertDistanceToUi(warmupStep.distance_m || 0, 0).value} ${convertDistanceToUi(warmupStep.distance_m || 0, 0).unit}`
          : warmupStep.duration_type === 'time'
            ? `${Math.round((warmupStep.duration_s || 0) / 60)} min`
            : t('training.lapButton');
    }

    const groupStep = steps.find(s => s.is_group);
    if (groupStep) {
      const rep = groupStep.repetitions || 1;
      const firstChild = groupStep.children?.[0];
      let val = '';
      if (firstChild) {
        val =
          firstChild.duration_type === 'distance'
            ? `${firstChild.distance_m || 0}m`
            : firstChild.duration_type === 'time'
              ? formatTime(firstChild.duration_s || 0)
              : 'Lap';
      }
      workStr = `${rep}x${val}`;
    } else {
      const intervalStep = steps.find(s => s.phase_type === 'interval');
      if (intervalStep) {
        workStr =
          intervalStep.duration_type === 'distance'
            ? `${convertDistanceToUi(intervalStep.distance_m || 0, 1).value} ${convertDistanceToUi(intervalStep.distance_m || 0, 1).unit}`
            : intervalStep.duration_type === 'time'
              ? formatTime(intervalStep.duration_s || 0)
              : 'Lap';
      }
    }

    const cooldownStep = steps.find(s => s.phase_type === 'cooldown' || s.phase_type === 'recovery');
    if (cooldownStep) {
      cooldownStr =
        cooldownStep.duration_type === 'distance'
          ? `${convertDistanceToUi(cooldownStep.distance_m || 0, 0).value} ${convertDistanceToUi(cooldownStep.distance_m || 0, 0).unit}`
          : cooldownStep.duration_type === 'time'
            ? `${Math.round((cooldownStep.duration_s || 0) / 60)} min`
            : 'Lap';
    }

    return { warmupStr, workStr, cooldownStr };
  };

  const renderEstimatedValue = (step: Step) => {
    const { duration, distance } = getStepEstimates(step);

    if (step.duration_type === 'distance' && duration > 0) {
      return ` (~${formatTime(Math.round(duration))})`;
    }
    if (step.duration_type === 'time' && distance > 0) {
      const dist = convertDistanceToUi(distance, 2);
      return ` (~${dist.value} ${dist.unit})`;
    }
    return '';
  };

  const executeSave = async () => {
    try {
      const isOneOff = !isRecurring && scheduledDays.length > 0;
      const templateScheduledDay = isRecurring && scheduledDays.length > 0 ? scheduledDays[0] : null;

      const finalGoal = trainingGoal === 'custom' ? customGoalText : trainingGoal;

      const result = await saveWorkout.mutateAsync({
        data: {
          base_name: name,
          description,
          sport_type: sportType || 'running',
          workout_goal: finalGoal,
          total_duration_s: ['running', 'cycling', 'swimming'].includes(sportType || '')
            ? Math.round(totalDuration)
            : (parseInt(manualDuration) || 0) * 60,
          total_distance_m: Math.round(totalDistance),
          scheduled_day: templateScheduledDay,
          environment_type: environmentType,
          surface: surface,
          pool_type: poolType,
          stroke: stroke,
        },
        steps: steps as BuilderStep[],
        templateId: templateId,
      });

      if (isOneOff && user) {
        for (const day of scheduledDays) {
          let targetDate = new Date();
          for (let i = 0; i < 7; i++) {
            if (targetDate.getDay() === day) break;
            targetDate = addDays(targetDate, 1);
          }
          const formattedDate = format(targetDate, 'yyyy-MM-dd');

          const { error: planError } = await supabase.from('workout_plans').insert({
            user_id: user.id,
            planned_date: formattedDate,
            endurance_template_id: result.id,
          });

          if (planError) {
            console.error(`Error creating one-off plan for day ${day}:`, planError);
          }
        }
      }

      const scheduledDayNames = scheduledDays.map(d => getWeekdayName(d)).join(', ');

      Alert.alert(
        isEditMode ? t('training.updatedTitle') : t('training.savedTitle'),
        isOneOff
          ? t('training.workoutSavedAndScheduledFor', { days: scheduledDayNames })
          : isEditMode
            ? t('training.workoutUpdatedSuccessfully')
            : t('training.workoutSavedSuccessfully'),
        [{ text: t('common.ok'), onPress: () => navigation.navigate('TrainingHome') }],
      );
    } catch (e) {
      console.error(e);
      Alert.alert(t('common.error'), t('training.workoutSaveError'));
    }
  };

  const handleSave = async () => {
    const missingFields: string[] = [];
    if (!name.trim()) {
      missingFields.push('name');
    }
    if ((sportType === 'running' || sportType === 'cycling' || sportType === 'swimming') && !environmentType) {
      missingFields.push('type');
    }
    if (!trainingGoal) {
      missingFields.push('goal');
    }

    if (missingFields.length > 0) {
      const fieldLabels = missingFields.map(f => {
        if (f === 'name') return t('training.fieldName');
        if (f === 'type') return t('training.fieldType');
        return t('training.fieldGoal');
      });

      let fieldsText = '';
      if (fieldLabels.length === 1) {
        fieldsText = fieldLabels[0];
      } else if (fieldLabels.length === 2) {
        fieldsText = `${fieldLabels[0]} ${t('common.and')} ${fieldLabels[1]}`;
      } else {
        const last = fieldLabels.pop();
        fieldsText = `${fieldLabels.join(', ')} ${t('common.and')} ${last}`;
      }

      Alert.alert(t('training.validationErrorTitle'), t('training.validationErrorMessage', { fields: fieldsText }));
      return;
    }

    if (isRecurring && scheduledDays.length === 0) {
      Alert.alert(t('common.error'), t('training.repeatNeedsOneDay'));
      return;
    }

    const effectiveNewDay = isRecurring && scheduledDays.length > 0 ? scheduledDays[0] : null;
    const dayChanged =
      isEditMode && originalScheduledDay !== null && isRecurring && effectiveNewDay !== originalScheduledDay;
    const recurrenceRemoved = isEditMode && originalScheduledDay !== null && !isRecurring;

    if (recurrenceRemoved) {
      Alert.alert(t('training.recurrenceRemovedTitle'), t('training.recurrenceRemovedMessage'), [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('training.confirm'),
          style: 'destructive',
          onPress: async () => {
            if (user && templateId) {
              const today = format(new Date(), 'yyyy-MM-dd');
              const { data: matchingPlans, error: selectError } = await supabase
                .from('workout_plans')
                .select('id, planned_date, completed_at')
                .eq('endurance_template_id', templateId)
                .eq('user_id', user.id)
                .gte('planned_date', today)
                .is('completed_at', null);

              if (!selectError && matchingPlans && matchingPlans.length > 0) {
                const idsToDelete = matchingPlans.map(p => p.id);
                await supabase.from('workout_plans').delete().in('id', idsToDelete);
              }
            }
            await executeSave();
          },
        },
      ]);
    } else if (dayChanged) {
      const oldDayName = getWeekdayName(originalScheduledDay);
      const newDayName = effectiveNewDay !== null ? getWeekdayName(effectiveNewDay) : t('training.none');

      Alert.alert(
        t('training.dayChangeTitle'),
        t('training.dayChangeMessage', { oldDay: oldDayName, newDay: newDayName }),
        [
          { text: t('common.cancel'), style: 'cancel' },
          {
            text: t('training.confirm'),
            style: 'destructive',
            onPress: async () => {
              if (user && templateId && originalScheduledDay !== null) {
                const today = format(new Date(), 'yyyy-MM-dd');
                const { data: matchingPlans, error: selectError } = await supabase
                  .from('workout_plans')
                  .select('id, planned_date, completed_at')
                  .eq('endurance_template_id', templateId)
                  .eq('user_id', user.id)
                  .gte('planned_date', today)
                  .is('completed_at', null);

                if (!selectError && matchingPlans && matchingPlans.length > 0) {
                  const plansToDelete = matchingPlans.filter(plan => {
                    const planDate = new Date(plan.planned_date + 'T00:00:00');
                    const planDayOfWeek = planDate.getDay();
                    return planDayOfWeek === originalScheduledDay;
                  });

                  if (plansToDelete.length > 0) {
                    const idsToDelete = plansToDelete.map(p => p.id);
                    await supabase.from('workout_plans').delete().in('id', idsToDelete);
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

  const handleAddStepPress = (groupId: string | null = null) => {
    setActiveGroupId(groupId);
    setEditingStep(null);
    setModalVisible(true);
  };

  const handleEditStep = (step: Step) => {
    setEditingStep(step);
    setModalVisible(true);
  };

  const handleSaveStep = (newStep: Step) => {
    if (editingStep) {
      if (activeGroupId) {
        setSteps(prev =>
          prev.map(s => {
            if (s.id === activeGroupId) {
              return { ...s, children: s.children?.map(c => (c.id === newStep.id ? newStep : c)) };
            }
            return s;
          }),
        );
      } else {
        setSteps(prev => updateStepInTree(prev, newStep));
      }
    } else {
      if (activeGroupId) {
        setSteps(prev =>
          prev.map(s => {
            if (s.id === activeGroupId) {
              return { ...s, children: [...(s.children || []), { ...newStep, parent_step_id: s.id }] };
            }
            return s;
          }),
        );
      } else {
        setSteps(prev => [...prev, newStep]);
      }
    }
    setModalVisible(false);
    setActiveGroupId(null);
  };

  const updateStepInTree = (list: Step[], updated: Step): Step[] => {
    return list.map(s => {
      if (s.id === updated.id) return updated;
      if (s.children) return { ...s, children: updateStepInTree(s.children, updated) };
      return s;
    });
  };

  const handleAddGroup = () => {
    const newGroup: Step = {
      id: Math.random().toString(),
      phase_type: 'interval',
      duration_type: 'time',
      repetitions: 3,
      is_group: true,
      target_type: 'none',
      children: [],
    };
    setSteps(prev => [...prev, newGroup]);
  };

  const handleDeleteStep = (stepId: string, isChild: boolean = false, parentId?: string) => {
    Alert.alert(t('training.deleteStepTitle'), t('training.deleteStepMessage'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: () => {
          if (isChild && parentId) {
            setSteps(prev =>
              prev.map(s => {
                if (s.id === parentId) {
                  return { ...s, children: s.children?.filter(c => c.id !== stepId) };
                }
                return s;
              }),
            );
          } else {
            setSteps(prev => prev.filter(s => s.id !== stepId));
          }
        },
      },
    ]);
  };

  const handleMoveUp = (index: number) => {
    if (index === 0) return;
    const newSteps = [...steps];
    [newSteps[index - 1], newSteps[index]] = [newSteps[index], newSteps[index - 1]];
    setSteps(newSteps);
  };

  const handleMoveDown = (index: number) => {
    if (index === steps.length - 1) return;
    const newSteps = [...steps];
    [newSteps[index], newSteps[index + 1]] = [newSteps[index + 1], newSteps[index]];
    setSteps(newSteps);
  };

  const handleStepMenu = (item: Step, index: number) => {
    const isFirst = index === 0;
    const isLast = index === steps.length - 1;

    const options = [
      ...(!isFirst ? [t('training.moveUp')] : []),
      ...(!isLast ? [t('training.moveDown')] : []),
      t('common.delete'),
      t('common.cancel'),
    ];

    const destructiveIndex = options.indexOf(t('common.delete'));
    const cancelIndex = options.indexOf(t('common.cancel'));

    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options,
          destructiveButtonIndex: destructiveIndex,
          cancelButtonIndex: cancelIndex,
        },
        buttonIndex => {
          const action = options[buttonIndex];
          if (action === t('training.moveUp')) handleMoveUp(index);
          else if (action === t('training.moveDown')) handleMoveDown(index);
          else if (action === t('common.delete')) handleDeleteStep(item.id);
        },
      );
    } else {
      Alert.alert(t('training.optionsTitle'), '', [
        ...(!isFirst ? [{ text: t('training.moveUp'), onPress: () => handleMoveUp(index) }] : []),
        ...(!isLast ? [{ text: t('training.moveDown'), onPress: () => handleMoveDown(index) }] : []),
        { text: t('common.delete'), style: 'destructive', onPress: () => handleDeleteStep(item.id) },
        { text: t('common.cancel'), style: 'cancel' },
      ]);
    }
  };

  const renderStepItem = (item: Step, index: number) => {
    return (
      <GlassCard key={item.id} style={[styles.stepCard, dynamicStyles.card]}>
        <View style={styles.stepHeader}>
          <View style={styles.stepInfoProps}>
            <View
              style={[
                styles.phaseIndicator,
                {
                  borderRadius: 6,
                  backgroundColor: item.is_group ? themeColors.primary : getPhaseColor(item.phase_type),
                },
              ]}
            />
            <Text style={[styles.stepTitle, dynamicStyles.label]}>
              {item.is_group ? t('training.repCaps') : t(getPhaseLabel(item.phase_type))}
            </Text>
          </View>
          <View style={styles.stepActions}>
            {!item.is_group && (
              <TouchableOpacity
                onPress={() => handleEditStep(item)}
                style={styles.stepActionBtn}
                accessibilityRole="button"
                accessibilityLabel={t('common.edit')}
              >
                <Text style={styles.editLabel}>{t('common.edit')}</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              onPress={() => handleStepMenu(item, index)}
              style={styles.stepActionBtn}
              accessibilityRole="button"
              accessibilityLabel={t('training.optionsTitle')}
            >
              <MoreVertical size={18} color={themeColors.textSecondary} />
            </TouchableOpacity>
          </View>
        </View>

        {item.is_group ? (
          <View style={styles.groupContainer}>
            <TouchableOpacity
              style={[styles.repetitionsSelector, { backgroundColor: themeColors.primary + '18' }]}
              onPress={() => {
                setEditingGroupId(item.id);
                setRepsModalVisible(true);
              }}
              accessibilityRole="button"
              accessibilityLabel={t('training.repetitions')}
            >
              <Repeat size={14} color={themeColors.primary} />
              <Text style={[styles.groupLabel, { color: themeColors.primary }]}>
                {item.repetitions}
                {t('training.xRepetitions')}
              </Text>
            </TouchableOpacity>
            <View style={[styles.groupChildren, { borderLeftColor: themeColors.border }]}>
              {item.children?.map(child => (
                <View key={child.id} style={styles.childStepCard}>
                  <GlassCard style={[styles.stepCard, styles.childStepInnerCard, dynamicStyles.glassCard]}>
                    <View style={styles.stepHeader}>
                      <View style={styles.stepInfoProps}>
                        <View
                          style={[
                            styles.phaseIndicator,
                            { borderRadius: 6, backgroundColor: getPhaseColor(child.phase_type) },
                          ]}
                        />
                        <Text style={[styles.stepTitle, dynamicStyles.label]}>
                          {t(getPhaseLabel(child.phase_type))}
                        </Text>
                      </View>
                      <View style={styles.stepActions}>
                        <TouchableOpacity
                          onPress={() => {
                            setActiveGroupId(item.id);
                            handleEditStep(child);
                          }}
                          style={styles.stepActionBtn}
                          accessibilityRole="button"
                          accessibilityLabel={t('common.edit')}
                        >
                          <Text style={styles.editLabel}>{t('common.edit')}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => handleDeleteStep(child.id, true, item.id)}
                          style={styles.stepActionBtn}
                          accessibilityRole="button"
                          accessibilityLabel={t('common.delete')}
                        >
                          <Trash2 size={16} color={colors.danger} />
                        </TouchableOpacity>
                      </View>
                    </View>
                    <View style={styles.stepDetails}>
                      <View style={styles.detailRow}>
                        <Ruler size={16} color={themeColors.textSecondary} />
                        <Text
                          style={[
                            styles.detailText,
                            { color: isDark ? themeColors.textPrimary : themeColors.textSecondary },
                          ]}
                        >
                          {child.duration_type === 'distance'
                            ? `${convertDistanceToUi(child.distance_m || 0, 2).value} ${convertDistanceToUi(child.distance_m || 0, 2).unit}`
                            : child.duration_type === 'time'
                              ? `${formatTime(child.duration_s || 0)}`
                              : t('training.lapButton')}
                          <Text style={{ color: themeColors.textSecondary, fontSize: 13 }}>
                            {renderEstimatedValue(child)}
                          </Text>
                        </Text>
                      </View>
                    </View>
                  </GlassCard>
                </View>
              ))}
              <TouchableOpacity
                style={styles.addToGroupBtn}
                onPress={() => handleAddStepPress(item.id)}
                accessibilityRole="button"
                accessibilityLabel={t('training.addToBlock')}
              >
                <Plus size={14} color={themeColors.primary} />
                <Text style={[styles.addToGroupText, { color: themeColors.primary }]}>{t('training.addToBlock')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <View style={styles.stepDetails}>
            <View style={styles.detailRow}>
              <Ruler size={16} color={themeColors.textSecondary} />
              <Text
                style={[styles.detailText, { color: isDark ? themeColors.textPrimary : themeColors.textSecondary }]}
              >
                {item.duration_type === 'distance'
                  ? `${convertDistanceToUi(item.distance_m || 0, 2).value} ${convertDistanceToUi(item.distance_m || 0, 2).unit}`
                  : item.duration_type === 'time'
                    ? `${formatTime(item.duration_s || 0)}`
                    : t('training.lapButton')}
                <Text style={{ color: colors.textSecondary, fontSize: 13 }}>{renderEstimatedValue(item)}</Text>
              </Text>
            </View>
            {item.target_type !== 'none' && (
              <View style={styles.detailRow}>
                <Zap size={16} color={colors.textSecondary} />
                <Text style={styles.detailText}>{formatTarget(item)}</Text>
              </View>
            )}
          </View>
        )}
      </GlassCard>
    );
  };

  const getSportTitle = () => {
    if (!sportType) return '';
    return t(`constants.${sportType}`);
  };

  const summaryBlocks = getSummaryBlocks();
  const structuredSport = sportType ? ['running', 'cycling', 'swimming'].includes(sportType) : false;

  const renderTemplateSummary = (selectedSport: SportType, showEditorAction = true, compact = false) => {
    const formattedDistance = convertDistanceToUi(totalDistance, 2);
    const scheduledDayNames = scheduledDays.map(day => getWeekdayName(day)).join(', ');

    return (
      <EnduranceTemplateSummaryPanel
        sportType={selectedSport}
        sportLabel={getSportTitle()}
        sportColor={SPORT_COLORS[selectedSport] || themeColors.primary}
        goalLabel={trainingGoal ? getGoalDisplayLabel(trainingGoal) : undefined}
        environmentLabel={
          getOptions(selectedSport, 'modality').length > 0 ? getEnvironmentDisplayLabel(environmentType) : undefined
        }
        surfaceLabel={getOptions(selectedSport, 'terrain').length > 0 ? getSurfaceDisplayLabel(surface) : undefined}
        scheduleLabel={scheduledDayNames ? t('training.plannedForDays', { days: scheduledDayNames }) : undefined}
        durationLabel={
          structuredSport ? formatTime(Math.round(totalDuration)) : `${parseInt(manualDuration, 10) || 0} min`
        }
        distanceLabel={structuredSport ? `${formattedDistance.value} ${formattedDistance.unit}` : undefined}
        phaseSummary={
          structuredSport
            ? {
                warmup: summaryBlocks.warmupStr,
                work: summaryBlocks.workStr,
                recovery: summaryBlocks.cooldownStr,
              }
            : undefined
        }
        hasSteps={steps.length > 0}
        canDesignWorkout={structuredSport && showEditorAction}
        compact={compact}
        onDesignWorkout={structuredSport && showEditorAction ? () => setCurrentView('builder') : undefined}
      />
    );
  };

  return (
    <LinearGradient
      colors={[themeColors.gradientStart || themeColors.background, themeColors.gradientEnd || themeColors.background]}
      style={styles.container}
    >
      <SafeAreaView style={styles.safeArea}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => {
              if (currentView === 'builder') {
                setCurrentView('main');
              } else if (!sportType) {
                navigation.goBack();
              } else if (!['running', 'cycling', 'swimming'].includes(sportType)) {
                setSportType(null);
              } else if (sportType && !isEditMode) {
                setSportType(null);
              } else {
                navigation.goBack();
              }
            }}
            style={styles.headerButton}
            accessibilityRole="button"
            accessibilityLabel={t('common.back')}
          >
            <ArrowLeft size={24} color={themeColors.textPrimary} />
          </TouchableOpacity>

          <View style={styles.headerCenter}>
            <Text style={[styles.headerTitle, dynamicStyles.headerTitle]}>
              {isHydratingEditTemplate
                ? t('training.editTemplate')
                : !sportType
                  ? t('training.chooseSport')
                  : currentView === 'builder'
                    ? t('training.designSession')
                    : `${t('training.templates')} ${getSportTitle()}`}
            </Text>
          </View>

          {sportType && (
            <TouchableOpacity
              onPress={() => {
                if (currentView === 'builder') {
                  setCurrentView('main');
                } else {
                  handleSave();
                }
              }}
              style={styles.headerButton}
              accessibilityRole="button"
              accessibilityLabel={currentView === 'builder' ? t('training.confirm') : t('common.save')}
            >
              <Text style={styles.saveText}>
                {currentView === 'builder' ? t('training.confirm') : t('common.save')}
              </Text>
            </TouchableOpacity>
          )}
          {!sportType && <View style={styles.headerPlaceholder} />}
        </View>

        {isHydratingEditTemplate ? (
          <View style={styles.loadingState}>
            <ActivityIndicator size="large" color={themeColors.primary} />
          </View>
        ) : !sportType ? (
          /* Sport Selection Grid */
          <ScrollView
            contentContainerStyle={[
              styles.sportSelectionContainer,
              isWideLayout && styles.sportSelectionContainerWide,
              { paddingBottom: mainContentBottomPadding },
            ]}
          >
            <Text style={[styles.sportSelectionTitle, dynamicStyles.title]}>{t('training.planWorkoutQuery')}</Text>

            <View style={[styles.sportGrid, isWideLayout && styles.sportGridWide]}>
              {[
                { id: 'running', label: t('constants.running') },
                { id: 'cycling', label: t('constants.cycling') },
                { id: 'swimming', label: t('constants.swimming') },
                { id: 'football', label: t('constants.football') },
                { id: 'basketball', label: t('constants.basketball') },
                { id: 'tennis', label: t('constants.tennis') },
                { id: 'padel', label: t('constants.padel') },
                { id: 'hiking', label: t('constants.hiking') },
              ].map(sport => (
                <TouchableOpacity
                  key={sport.id}
                  style={[styles.sportCard, isWideLayout && styles.sportCardWide, dynamicStyles.card]}
                  onPress={() => {
                    setSportType(sport.id as SportType);
                    // Running, cycling and swimming start on main form. Others don't have workout builder.
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={sport.label}
                >
                  <View
                    style={[
                      styles.sportIcon,
                      {
                        backgroundColor: SPORT_COLORS[sport.id] || themeColors.primary,
                        shadowColor: SPORT_COLORS[sport.id] || themeColors.primary,
                        shadowOpacity: 0.14,
                        shadowRadius: 5,
                        shadowOffset: { width: 0, height: 2 },
                      },
                    ]}
                  >
                    <SportIcon sport={sport.id} size={32} color="#FFF" />
                  </View>
                  <Text style={[styles.sportName, dynamicStyles.label]}>{sport.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
        ) : currentView === 'main' ? (
          /* Main Redesigned Form View */
          <View style={[styles.responsiveLayout, isWideLayout && styles.responsiveLayoutWide]}>
            <ScrollView
              style={[styles.mainColumn, isWideLayout && styles.mainColumnWide]}
              contentContainerStyle={[
                styles.mainFormContainer,
                isWideLayout && styles.mainFormContainerWide,
                { paddingBottom: mainContentBottomPadding },
              ]}
              showsVerticalScrollIndicator={false}
            >
              {/* Header Avatar and Info */}
              <View style={styles.profileHeader}>
                <View
                  style={[
                    styles.profileAvatar,
                    {
                      backgroundColor: SPORT_COLORS[sportType] + '15',
                      width: 80,
                      height: 80,
                      borderRadius: 40,
                      shadowColor: SPORT_COLORS[sportType],
                      shadowOpacity: 0.1,
                      shadowRadius: 7,
                      shadowOffset: { width: 0, height: 2 },
                    },
                  ]}
                >
                  <SportIcon sport={sportType} size={42} color={SPORT_COLORS[sportType] || themeColors.primary} />
                </View>
                <View style={styles.profileTextContainer}>
                  <Text
                    style={[styles.profileTitle, { color: themeColors.textPrimary, fontSize: 24, fontWeight: '800' }]}
                  >
                    {getSportTitle()}
                  </Text>
                  <Text
                    style={[styles.profileSubtitle, { color: themeColors.textSecondary, fontSize: 14, opacity: 0.8 }]}
                  >
                    {t('training.configureGeneralDetails')}
                  </Text>
                </View>
              </View>

              {/* Block 1: Información General */}
              <GlassCard style={[styles.formBlock, dynamicStyles.card]}>
                <Text style={[styles.blockTitle, { color: themeColors.textSecondary }]}>
                  {t('training.general').toUpperCase()}
                </Text>

                {/* Template Name input */}
                <View style={styles.formRow}>
                  <Text style={[styles.rowLabel, { color: themeColors.textPrimary }]}>
                    {t('training.templateName')}
                  </Text>
                  <TextInput
                    style={[styles.rowInput, { color: themeColors.textPrimary }]}
                    value={name}
                    onChangeText={setName}
                    placeholder={t('training.intervalsExample')}
                    placeholderTextColor={themeColors.textSecondary}
                    textAlign="right"
                  />
                </View>

                {/* Goal Selector */}
                <TouchableOpacity
                  style={styles.formRow}
                  onPress={() => setGoalModalVisible(true)}
                  accessibilityRole="button"
                  accessibilityLabel={t('training.mainGoal')}
                >
                  <Text style={[styles.rowLabel, { color: themeColors.textPrimary }]}>{t('training.mainGoal')}</Text>
                  <View style={styles.rowRightValue}>
                    <Text
                      style={[
                        styles.rowValueText,
                        { color: trainingGoal ? themeColors.textPrimary : themeColors.textSecondary },
                      ]}
                      numberOfLines={1}
                    >
                      {trainingGoal ? getGoalDisplayLabel(trainingGoal) : t('common.select')}
                    </Text>
                    <ChevronRight size={16} color={themeColors.textSecondary} style={{ marginLeft: 4 }} />
                  </View>
                </TouchableOpacity>

                {/* Description Input */}
                <View
                  style={[styles.formRow, { flexDirection: 'column', alignItems: 'stretch', borderBottomWidth: 0 }]}
                >
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                    <Text style={[styles.rowLabel, { color: themeColors.textPrimary }]}>
                      {t('settings.description')}
                    </Text>
                    <Text style={{ color: themeColors.textSecondary, fontSize: 11 }}>{description.length}/150</Text>
                  </View>
                  <TextInput
                    style={[styles.rowTextArea, { color: themeColors.textPrimary, borderColor: themeColors.border }]}
                    value={description}
                    onChangeText={setDescription}
                    placeholder={t('training.descriptionPlaceholder')}
                    placeholderTextColor={themeColors.textSecondary}
                    multiline
                    maxLength={150}
                  />
                </View>

                {/* Environment Type selector */}
                {hasModalityOptions && (
                  <TouchableOpacity
                    style={styles.formRow}
                    onPress={() => setTypeModalVisible(true)}
                    accessibilityRole="button"
                    accessibilityLabel={getGroupLabel(sportType, 'modality')}
                  >
                    <Text style={[styles.rowLabel, { color: themeColors.textPrimary }]}>
                      {getGroupLabel(sportType, 'modality')}
                    </Text>
                    <View style={styles.rowRightValue}>
                      <Text
                        style={[
                          styles.rowValueText,
                          { color: environmentType ? themeColors.textPrimary : themeColors.textSecondary },
                        ]}
                        numberOfLines={1}
                      >
                        {environmentType ? getEnvironmentDisplayLabel(environmentType) : t('common.select')}
                      </Text>
                      <ChevronRight size={16} color={themeColors.textSecondary} style={{ marginLeft: 4 }} />
                    </View>
                  </TouchableOpacity>
                )}
              </GlassCard>

              {structuredSport && !isWideLayout && (
                <View style={styles.compactSummary}>{renderTemplateSummary(sportType)}</View>
              )}

              {/* Manual Duration (for simple sports) */}
              {!['running', 'cycling', 'swimming'].includes(sportType) && (
                <GlassCard style={[styles.formBlock, dynamicStyles.card]}>
                  <Text style={[styles.blockTitle, { color: themeColors.textSecondary }]}>
                    {t('training.duration').toUpperCase()}
                  </Text>
                  <View style={styles.formRow}>
                    <Text style={[styles.rowLabel, { color: themeColors.textPrimary }]}>
                      {t('training.estimatedDurationMin')}
                    </Text>
                    <TextInput
                      style={[styles.rowInput, { color: themeColors.textPrimary }]}
                      keyboardType="numeric"
                      placeholder="60"
                      value={manualDuration}
                      placeholderTextColor={themeColors.textSecondary}
                      onChangeText={setManualDuration}
                      textAlign="right"
                    />
                  </View>
                  <Text style={[styles.helperDescription, { color: themeColors.textSecondary, marginTop: 8 }]}>
                    {t('training.planningInfoOnly')}
                  </Text>
                </GlassCard>
              )}

              {!structuredSport && !isWideLayout && (
                <View style={styles.compactSummary}>{renderTemplateSummary(sportType)}</View>
              )}

              {/* Block 3: Configuración */}
              {(hasTerrainOptions || sportType === 'swimming') && (
                <GlassCard style={[styles.formBlock, dynamicStyles.card]}>
                  <Text style={[styles.blockTitle, { color: themeColors.textSecondary }]}>
                    {t('navigation.workoutSettings').toUpperCase()}
                  </Text>

                  {/* Surface Selector (for running/cycling) */}
                  {hasTerrainOptions && (
                    <TouchableOpacity
                      style={styles.formRow}
                      onPress={() => setSurfaceModalVisible(true)}
                      accessibilityRole="button"
                      accessibilityLabel={getGroupLabel(sportType, 'terrain')}
                    >
                      <Text style={[styles.rowLabel, { color: themeColors.textPrimary }]}>
                        {getGroupLabel(sportType, 'terrain')}
                      </Text>
                      <View style={styles.rowRightValue}>
                        <Text
                          style={[
                            styles.rowValueText,
                            { color: surface ? themeColors.textPrimary : themeColors.textSecondary },
                          ]}
                        >
                          {surface ? getSurfaceDisplayLabel(surface) : t('common.select')}
                        </Text>
                        <ChevronRight size={16} color={themeColors.textSecondary} style={{ marginLeft: 4 }} />
                      </View>
                    </TouchableOpacity>
                  )}

                  {/* Swimming-specific options */}
                  {sportType === 'swimming' && (
                    <>
                      {/* Stroke Selector */}
                      <TouchableOpacity
                        style={styles.formRow}
                        onPress={() => setStrokeModalVisible(true)}
                        accessibilityRole="button"
                        accessibilityLabel={t('training.strokeLabel')}
                      >
                        <Text style={[styles.rowLabel, { color: themeColors.textPrimary }]}>
                          {t('training.strokeLabel')}
                        </Text>
                        <View style={styles.rowRightValue}>
                          <Text
                            style={[
                              styles.rowValueText,
                              { color: stroke ? themeColors.textPrimary : themeColors.textSecondary },
                            ]}
                          >
                            {stroke ? getOptionLabel(sportType, stroke, 'stroke') : t('common.select')}
                          </Text>
                          <ChevronRight size={16} color={themeColors.textSecondary} style={{ marginLeft: 4 }} />
                        </View>
                      </TouchableOpacity>

                      {/* Material (Equipment) - Coming soon */}
                      <View style={[styles.formRow, { opacity: 0.5 }]}>
                        <Text style={[styles.rowLabel, { color: themeColors.textPrimary }]}>
                          {t('training.materialLabel')}
                        </Text>
                        <View style={styles.rowRightValue}>
                          <Text style={[styles.rowValueText, { color: themeColors.textSecondary }]}>
                            {t('training.comingSoon')}
                          </Text>
                          <ChevronRight size={16} color={themeColors.textSecondary} style={{ marginLeft: 4 }} />
                        </View>
                      </View>

                      {/* Pool Type (only active if modality is 'pool') */}
                      <TouchableOpacity
                        style={[
                          styles.formRow,
                          { borderBottomWidth: 0 },
                          environmentType !== 'pool' && { opacity: 0.5 },
                        ]}
                        onPress={() => {
                          if (environmentType === 'pool') {
                            setPoolTypeModalVisible(true);
                          }
                        }}
                        disabled={environmentType !== 'pool'}
                        accessibilityRole="button"
                        accessibilityLabel={t('training.poolTypeLabel')}
                      >
                        <Text style={[styles.rowLabel, { color: themeColors.textPrimary }]}>
                          {t('training.poolTypeLabel')}
                        </Text>
                        <View style={styles.rowRightValue}>
                          <Text
                            style={[
                              styles.rowValueText,
                              {
                                color:
                                  poolType && environmentType === 'pool'
                                    ? themeColors.textPrimary
                                    : themeColors.textSecondary,
                              },
                            ]}
                          >
                            {environmentType === 'pool'
                              ? poolType
                                ? getOptionLabel(sportType, poolType, 'pool_type')
                                : t('common.select')
                              : t('training.onlyActiveForPool')}
                          </Text>
                          {environmentType === 'pool' && (
                            <ChevronRight size={16} color={themeColors.textSecondary} style={{ marginLeft: 4 }} />
                          )}
                        </View>
                      </TouchableOpacity>
                    </>
                  )}

                  {/* Shoes / Bike details */}
                  {['running', 'cycling'].includes(sportType) && (
                    <View style={[styles.formRow, { borderBottomWidth: 0, opacity: 0.5 }]}>
                      <Text style={[styles.rowLabel, { color: themeColors.textPrimary }]}>
                        {sportType === 'cycling' ? t('training.bikeLabel') : t('training.shoesLabel')}
                      </Text>
                      <View style={styles.rowRightValue}>
                        <Text style={[styles.rowValueText, { color: themeColors.textSecondary }]}>
                          {t('training.comingSoon')}
                        </Text>
                        <ChevronRight size={16} color={themeColors.textSecondary} style={{ marginLeft: 4 }} />
                      </View>
                    </View>
                  )}
                </GlassCard>
              )}

              {/* Block 4: Programación */}
              <GlassCard style={[styles.formBlock, dynamicStyles.card]}>
                <Text style={[styles.blockTitle, { color: themeColors.textSecondary }]}>
                  {t('training.scheduleForWeekday').toUpperCase()}
                </Text>
                <View style={{ marginTop: 8 }}>
                  <WeekDaySelector
                    selectedDays={scheduledDays}
                    onDaysChange={setScheduledDays}
                    isRecurring={isRecurring}
                    onToggleRecurring={() => setIsRecurring(!isRecurring)}
                    singleSelect={true}
                  />
                </View>
              </GlassCard>
            </ScrollView>

            {isWideLayout && (
              <View style={styles.summarySideColumn}>
                <ScrollView
                  style={styles.summarySidePanel}
                  contentContainerStyle={[styles.summarySidePanelContent, { paddingBottom: mainContentBottomPadding }]}
                  showsVerticalScrollIndicator={false}
                >
                  {renderTemplateSummary(sportType, true, true)}
                </ScrollView>
              </View>
            )}
          </View>
        ) : (
          /* Steps Builder View */
          <View style={[styles.content, isWideLayout && styles.builderLayoutWide]}>
            <ScrollView
              style={[styles.scrollContainer, isWideLayout && styles.builderColumnWide]}
              contentContainerStyle={[
                styles.listContent,
                isWideLayout && styles.listContentWide,
                { paddingBottom: builderContentBottomPadding },
              ]}
              showsVerticalScrollIndicator={true}
            >
              {steps.length === 0 ? (
                <View style={[styles.emptyState, dynamicStyles.emptyState]}>
                  <Activity size={48} color={themeColors.textSecondary} style={{ opacity: 0.5, marginBottom: 16 }} />
                  <Text style={[styles.emptyTitle, dynamicStyles.title]}>{t('training.startRoutine')}</Text>
                  <Text style={[styles.emptyText, { color: themeColors.textSecondary }]}>
                    {t('training.addIntervalsHint')}{' '}
                    {sportType === 'swimming'
                      ? t('training.swimming')
                      : sportType === 'cycling'
                        ? t('training.cycling')
                        : t('constants.running')}
                    .
                  </Text>
                </View>
              ) : (
                <>{steps.map((item, index) => renderStepItem(item, index))}</>
              )}

              <View style={styles.actions}>
                <TouchableOpacity
                  style={[
                    styles.addStepButton,
                    {
                      backgroundColor: themeColors.primary,
                    },
                  ]}
                  onPress={() => handleAddStepPress(null)}
                  accessibilityRole="button"
                  accessibilityLabel={t('training.addStep')}
                >
                  <Plus size={20} color="#FFF" />
                  <Text style={styles.addStepButtonText}>{t('training.addStep')}</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.addRepButton, dynamicStyles.secondaryButton]}
                  onPress={handleAddGroup}
                  accessibilityRole="button"
                  accessibilityLabel={t('training.repetitions')}
                >
                  <Repeat size={20} color={themeColors.primary} />
                </TouchableOpacity>
              </View>
            </ScrollView>

            {isWideLayout ? (
              <View style={styles.summarySideColumn}>
                <ScrollView
                  style={styles.summarySidePanel}
                  contentContainerStyle={[
                    styles.summarySidePanelContent,
                    { paddingBottom: builderContentBottomPadding },
                  ]}
                  showsVerticalScrollIndicator={false}
                >
                  {renderTemplateSummary(sportType, false, true)}
                </ScrollView>
              </View>
            ) : (
              <View style={[styles.summaryFooterContainer, { bottom: footerBottomPosition }]}>
                <LiquidGlassFooter style={styles.summaryGlass} borderRadius={30}>
                  <View style={styles.summaryContent}>
                    <View style={styles.summaryItem}>
                      <Text style={styles.summaryLabel}>{t('training.totalTime')}</Text>
                      <View style={styles.summaryValueContainer}>
                        <Clock size={16} color={themeColors.textPrimary} style={{ marginRight: 6 }} />
                        <Text style={[styles.summaryValue, { color: themeColors.textPrimary }]}>
                          {formatTime(Math.round(totalDuration))}
                        </Text>
                      </View>
                    </View>

                    <View style={[styles.summaryDivider, { backgroundColor: themeColors.border }]} />

                    <View style={styles.summaryItem}>
                      <Text style={styles.summaryLabel}>{t('training.distanceParenAllCaps')}</Text>
                      <View style={styles.summaryValueContainer}>
                        <Activity size={16} color={themeColors.textPrimary} style={{ marginRight: 6 }} />
                        <Text style={[styles.summaryValue, { color: themeColors.textPrimary }]}>
                          {convertDistanceToUi(totalDistance, 2).value} {convertDistanceToUi(totalDistance, 2).unit}
                        </Text>
                      </View>
                    </View>
                  </View>
                </LiquidGlassFooter>
              </View>
            )}
          </View>
        )}

        {/* Goal Selector Modal */}
        <Modal
          animationType={isWideLayout ? 'fade' : 'slide'}
          transparent={true}
          visible={goalModalVisible}
          onRequestClose={() => setGoalModalVisible(false)}
        >
          <Pressable
            style={[styles.modalOverlay, isWideLayout && styles.modalOverlayWide]}
            onPress={() => setGoalModalVisible(false)}
          >
            <Pressable
              style={[
                styles.modalCard,
                isWideLayout && styles.modalCardWide,
                { backgroundColor: isDark ? '#1C1C1E' : '#FFF' },
              ]}
              onPress={e => e.stopPropagation()}
            >
              <View style={styles.modalHandle} />
              <Text style={[styles.modalTitle, { color: themeColors.textPrimary }]}>{t('training.mainGoal')}</Text>

              <ScrollView style={styles.goalsScroll} showsVerticalScrollIndicator={false}>
                {getStructuredGoals().map(goal => {
                  const isSelected =
                    trainingGoal === goal.key ||
                    (goal.key === 'custom' && trainingGoal !== undefined && isCustomGoal(trainingGoal));

                  return (
                    <View key={goal.key}>
                      <TouchableOpacity
                        style={[
                          styles.goalOptionRow,
                          isSelected && {
                            backgroundColor: themeColors.primary + '15',
                            borderColor: themeColors.primary,
                          },
                        ]}
                        onPress={() => {
                          if (goal.key === 'custom') {
                            setTrainingGoal('custom');
                          } else {
                            setTrainingGoal(goal.key);
                            setGoalModalVisible(false);
                          }
                        }}
                      >
                        <Text
                          style={[
                            styles.goalOptionTitle,
                            { color: themeColors.textPrimary },
                            isSelected && { color: themeColors.primary },
                          ]}
                        >
                          {goal.title}
                        </Text>
                        {goal.desc ? (
                          <Text style={[styles.goalOptionDesc, { color: themeColors.textSecondary }]}>{goal.desc}</Text>
                        ) : null}
                      </TouchableOpacity>

                      {goal.key === 'custom' && trainingGoal === 'custom' && (
                        <View style={styles.customGoalInputContainer}>
                          <TextInput
                            style={[
                              styles.customGoalInput,
                              { color: themeColors.textPrimary, borderColor: themeColors.border },
                            ]}
                            value={customGoalText}
                            onChangeText={setCustomGoalText}
                            placeholder={t('training.goalCustomDesc')}
                            placeholderTextColor={themeColors.textSecondary}
                          />
                        </View>
                      )}
                    </View>
                  );
                })}
              </ScrollView>

              <View style={styles.modalActionRow}>
                <TouchableOpacity
                  style={[styles.modalActionBtn, styles.cancelActionBtn, { borderColor: themeColors.border }]}
                  onPress={() => setGoalModalVisible(false)}
                >
                  <Text style={[styles.cancelActionBtnText, { color: themeColors.textPrimary }]}>
                    {t('common.cancel')}
                  </Text>
                </TouchableOpacity>

                {trainingGoal === 'custom' && (
                  <TouchableOpacity
                    style={[styles.modalActionBtn, styles.confirmActionBtn, { backgroundColor: themeColors.primary }]}
                    onPress={() => {
                      if (!customGoalText.trim()) {
                        Alert.alert(t('common.error'), t('training.workoutNameRequired'));
                        return;
                      }
                      setTrainingGoal(customGoalText.trim());
                      setGoalModalVisible(false);
                    }}
                  >
                    <Text style={styles.confirmActionBtnText}>{t('training.confirm')}</Text>
                  </TouchableOpacity>
                )}
              </View>
            </Pressable>
          </Pressable>
        </Modal>

        {/* Type Selector Modal */}
        <Modal
          animationType={isWideLayout ? 'fade' : 'slide'}
          transparent={true}
          visible={typeModalVisible}
          onRequestClose={() => setTypeModalVisible(false)}
        >
          <Pressable
            style={[styles.modalOverlay, isWideLayout && styles.modalOverlayWide]}
            onPress={() => setTypeModalVisible(false)}
          >
            <Pressable
              style={[
                styles.modalCard,
                isWideLayout && styles.modalCardWide,
                { backgroundColor: isDark ? '#1C1C1E' : '#FFF' },
              ]}
              onPress={e => e.stopPropagation()}
            >
              <View style={styles.modalHandle} />
              <Text style={[styles.modalTitle, { color: themeColors.textPrimary }]}>
                {getGroupLabel(sportType, 'modality')}
              </Text>

              <ScrollView style={styles.goalsScroll} showsVerticalScrollIndicator={false}>
                {modalityOptions.map(typeOption => {
                  const isSelected = environmentType === typeOption.option_key;
                  return (
                    <TouchableOpacity
                      key={typeOption.option_key}
                      style={[
                        styles.surfaceOptionRow,
                        isSelected && { backgroundColor: themeColors.primary + '15', borderColor: themeColors.primary },
                      ]}
                      onPress={() => {
                        setEnvironmentType(typeOption.option_key);
                        if (sportType === 'swimming' && typeOption.option_key !== 'pool') {
                          setPoolType(null);
                        }
                        setTypeModalVisible(false);
                      }}
                    >
                      <Text
                        style={[
                          styles.surfaceOptionText,
                          { color: themeColors.textPrimary },
                          isSelected && { color: themeColors.primary },
                        ]}
                      >
                        {getOptionLabel(sportType, typeOption.option_key, 'modality')}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              <View style={styles.modalActionRow}>
                <TouchableOpacity
                  style={[styles.modalActionBtn, styles.cancelActionBtn, { borderColor: themeColors.border, flex: 1 }]}
                  onPress={() => setTypeModalVisible(false)}
                >
                  <Text style={[styles.cancelActionBtnText, { color: themeColors.textPrimary }]}>
                    {t('common.cancel')}
                  </Text>
                </TouchableOpacity>
              </View>
            </Pressable>
          </Pressable>
        </Modal>

        {/* Surface Selector Modal */}
        <Modal
          animationType={isWideLayout ? 'fade' : 'slide'}
          transparent={true}
          visible={surfaceModalVisible}
          onRequestClose={() => setSurfaceModalVisible(false)}
        >
          <Pressable
            style={[styles.modalOverlay, isWideLayout && styles.modalOverlayWide]}
            onPress={() => setSurfaceModalVisible(false)}
          >
            <Pressable
              style={[
                styles.modalCard,
                isWideLayout && styles.modalCardWide,
                { backgroundColor: isDark ? '#1C1C1E' : '#FFF' },
              ]}
              onPress={e => e.stopPropagation()}
            >
              <View style={styles.modalHandle} />
              <Text style={[styles.modalTitle, { color: themeColors.textPrimary }]}>
                {getGroupLabel(sportType, 'terrain')}
              </Text>

              <ScrollView style={styles.goalsScroll} showsVerticalScrollIndicator={false}>
                {terrainOptions.map(surf => {
                  const isSelected = surface === surf.option_key;
                  return (
                    <TouchableOpacity
                      key={surf.option_key}
                      style={[
                        styles.surfaceOptionRow,
                        isSelected && { backgroundColor: themeColors.primary + '15', borderColor: themeColors.primary },
                      ]}
                      onPress={() => {
                        setSurface(surf.option_key);
                        setSurfaceModalVisible(false);
                      }}
                    >
                      <Text
                        style={[
                          styles.surfaceOptionText,
                          { color: themeColors.textPrimary },
                          isSelected && { color: themeColors.primary },
                        ]}
                      >
                        {getOptionLabel(sportType, surf.option_key, 'terrain')}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              <View style={styles.modalActionRow}>
                <TouchableOpacity
                  style={[styles.modalActionBtn, styles.cancelActionBtn, { borderColor: themeColors.border, flex: 1 }]}
                  onPress={() => setSurfaceModalVisible(false)}
                >
                  <Text style={[styles.cancelActionBtnText, { color: themeColors.textPrimary }]}>
                    {t('common.cancel')}
                  </Text>
                </TouchableOpacity>
              </View>
            </Pressable>
          </Pressable>
        </Modal>

        {/* Pool Type Selector Modal */}
        <Modal
          animationType={isWideLayout ? 'fade' : 'slide'}
          transparent={true}
          visible={poolTypeModalVisible}
          onRequestClose={() => setPoolTypeModalVisible(false)}
        >
          <Pressable
            style={[styles.modalOverlay, isWideLayout && styles.modalOverlayWide]}
            onPress={() => setPoolTypeModalVisible(false)}
          >
            <Pressable
              style={[
                styles.modalCard,
                isWideLayout && styles.modalCardWide,
                { backgroundColor: isDark ? '#1C1C1E' : '#FFF' },
              ]}
              onPress={e => e.stopPropagation()}
            >
              <View style={styles.modalHandle} />
              <Text style={[styles.modalTitle, { color: themeColors.textPrimary }]}>{t('training.poolTypeLabel')}</Text>

              <ScrollView style={styles.goalsScroll} showsVerticalScrollIndicator={false}>
                {getOptions(sportType, 'pool_type').map(opt => {
                  const isSelected = poolType === opt.option_key;
                  return (
                    <TouchableOpacity
                      key={opt.option_key}
                      style={[
                        styles.surfaceOptionRow,
                        isSelected && { backgroundColor: themeColors.primary + '15', borderColor: themeColors.primary },
                      ]}
                      onPress={() => {
                        setPoolType(opt.option_key);
                        setPoolTypeModalVisible(false);
                      }}
                    >
                      <Text
                        style={[
                          styles.surfaceOptionText,
                          { color: themeColors.textPrimary },
                          isSelected && { color: themeColors.primary },
                        ]}
                      >
                        {getOptionLabel(sportType, opt.option_key, 'pool_type')}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              <View style={styles.modalActionRow}>
                <TouchableOpacity
                  style={[styles.modalActionBtn, styles.cancelActionBtn, { borderColor: themeColors.border, flex: 1 }]}
                  onPress={() => setPoolTypeModalVisible(false)}
                >
                  <Text style={[styles.cancelActionBtnText, { color: themeColors.textPrimary }]}>
                    {t('common.cancel')}
                  </Text>
                </TouchableOpacity>
              </View>
            </Pressable>
          </Pressable>
        </Modal>

        {/* Stroke Selector Modal */}
        <Modal
          animationType={isWideLayout ? 'fade' : 'slide'}
          transparent={true}
          visible={strokeModalVisible}
          onRequestClose={() => setStrokeModalVisible(false)}
        >
          <Pressable
            style={[styles.modalOverlay, isWideLayout && styles.modalOverlayWide]}
            onPress={() => setStrokeModalVisible(false)}
          >
            <Pressable
              style={[
                styles.modalCard,
                isWideLayout && styles.modalCardWide,
                { backgroundColor: isDark ? '#1C1C1E' : '#FFF' },
              ]}
              onPress={e => e.stopPropagation()}
            >
              <View style={styles.modalHandle} />
              <Text style={[styles.modalTitle, { color: themeColors.textPrimary }]}>{t('training.strokeLabel')}</Text>

              <ScrollView style={styles.goalsScroll} showsVerticalScrollIndicator={false}>
                {getOptions(sportType, 'stroke').map(opt => {
                  const isSelected = stroke === opt.option_key;
                  return (
                    <TouchableOpacity
                      key={opt.option_key}
                      style={[
                        styles.surfaceOptionRow,
                        isSelected && { backgroundColor: themeColors.primary + '15', borderColor: themeColors.primary },
                      ]}
                      onPress={() => {
                        setStroke(opt.option_key);
                        setStrokeModalVisible(false);
                      }}
                    >
                      <Text
                        style={[
                          styles.surfaceOptionText,
                          { color: themeColors.textPrimary },
                          isSelected && { color: themeColors.primary },
                        ]}
                      >
                        {getOptionLabel(sportType, opt.option_key, 'stroke')}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              <View style={styles.modalActionRow}>
                <TouchableOpacity
                  style={[styles.modalActionBtn, styles.cancelActionBtn, { borderColor: themeColors.border, flex: 1 }]}
                  onPress={() => setStrokeModalVisible(false)}
                >
                  <Text style={[styles.cancelActionBtnText, { color: themeColors.textPrimary }]}>
                    {t('common.cancel')}
                  </Text>
                </TouchableOpacity>
              </View>
            </Pressable>
          </Pressable>
        </Modal>

        {/* Builder Step Modals */}
        <EnduranceStepEditorModal
          visible={modalVisible}
          initialStep={editingStep}
          onSave={handleSaveStep}
          onCancel={() => {
            setModalVisible(false);
            setActiveGroupId(null);
          }}
          sportType={sportType || 'running'}
        />

        <RepetitionsSelectorModal
          visible={repsModalVisible}
          currentValue={steps.find(s => s.id === editingGroupId)?.repetitions || 3}
          onSelect={value => {
            setSteps(prev => prev.map(s => (s.id === editingGroupId ? { ...s, repetitions: value } : s)));
          }}
          onClose={() => {
            setRepsModalVisible(false);
            setEditingGroupId(null);
          }}
        />
      </SafeAreaView>
    </LinearGradient>
  );
};

const getPhaseColor = (phase: PhaseType) => {
  switch (phase) {
    case 'warmup':
      return colors.success;
    case 'interval':
      return colors.danger;
    case 'recovery':
      return colors.textSecondary;
    case 'cooldown':
      return colors.accent;
    default:
      return colors.primary;
  }
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
    minHeight: 0,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.m,
  },
  headerTitle: { ...typography.h4, fontWeight: 'bold', color: colors.textPrimary },
  saveText: { ...typography.body, color: colors.primary, fontWeight: 'bold' },
  headerButton: {
    minWidth: 52,
    minHeight: 44,
    padding: spacing.s,
    justifyContent: 'center',
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  headerPlaceholder: {
    width: 52,
    height: 44,
  },
  content: { flex: 1, minHeight: 0 },
  scrollContainer: { flex: 1, minHeight: 0 },
  listContent: { padding: spacing.m },
  listContentWide: {
    paddingHorizontal: 0,
    paddingTop: spacing.s,
  },
  builderLayoutWide: {
    flexDirection: 'row',
    minHeight: 0,
    overflow: 'hidden',
    alignSelf: 'center',
    width: '100%',
    maxWidth: 1110,
    gap: spacing.xl,
    paddingHorizontal: spacing.l,
  },
  builderColumnWide: {
    flex: 1,
    minHeight: 0,
    maxWidth: 700,
  },
  loadingState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  stepCard: {
    marginBottom: spacing.m,
    padding: spacing.m,
  },
  childStepCard: {
    marginLeft: spacing.l,
    marginTop: spacing.s,
    backgroundColor: 'transparent',
    borderRadius: borderRadius.l,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  childStepInnerCard: {
    backgroundColor: 'transparent',
    marginBottom: 0,
  },
  stepHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.s,
  },
  stepActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s,
  },
  stepActionBtn: {
    minHeight: 44,
    minWidth: 44,
    paddingHorizontal: spacing.s,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepInfoProps: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  phaseIndicator: { width: 12, height: 12, borderRadius: 2, marginRight: 8 },
  stepTitle: { ...typography.body, fontWeight: 'bold' },
  editLabel: { ...typography.caption, color: colors.primary },
  stepDetails: { gap: 4 },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  detailText: { ...typography.body, color: colors.textSecondary },
  groupContainer: { marginTop: 8 },
  repetitionsSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.s,
    backgroundColor: 'rgba(0,122,255,0.1)',
    borderRadius: borderRadius.m,
    alignSelf: 'flex-start',
    marginBottom: 8,
  },
  groupLabel: { ...typography.caption, fontWeight: 'bold' },
  groupChildren: { borderLeftWidth: 2, paddingLeft: 0 },
  addToGroupBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.m,
    marginLeft: spacing.l,
  },
  addToGroupText: { ...typography.caption, color: colors.primary, marginLeft: 6 },
  actions: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.m,
  },
  emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: spacing.xl },
  emptyTitle: { ...typography.h3, color: colors.textPrimary, marginBottom: spacing.s },
  emptyText: { ...typography.body, color: colors.textSecondary, textAlign: 'center' },
  addStepButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    borderRadius: borderRadius.full,
    paddingVertical: spacing.m,
    gap: spacing.s,
  },
  addStepButtonText: { ...typography.button, color: '#FFFFFF' },
  addRepButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.surfaceHighlight,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: spacing.m,
  },
  summaryFooterContainer: {
    position: 'absolute',
    bottom: 90,
    left: spacing.m,
    right: spacing.m,
    zIndex: 100,
  },
  summaryGlass: {
    borderRadius: 30,
  },
  summaryContent: {
    flexDirection: 'row',
    paddingVertical: spacing.m,
    paddingHorizontal: spacing.l,
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  summaryItem: {
    alignItems: 'center',
    flex: 1,
  },
  summaryLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: 4,
    letterSpacing: 1,
  },
  summaryValueContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  summaryValue: {
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  summaryDivider: {
    width: 1,
    height: 30,
    marginHorizontal: spacing.s,
  },
  sportSelectionContainer: {
    padding: spacing.m,
    alignItems: 'center',
  },
  sportSelectionContainerWide: {
    alignSelf: 'center',
    width: '100%',
    maxWidth: 960,
    paddingTop: spacing.xl,
  },
  sportSelectionTitle: {
    ...typography.h3,
    fontWeight: 'bold',
    marginBottom: spacing.xl,
    marginTop: spacing.l,
    textAlign: 'center',
  },
  sportGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: spacing.l,
  },
  sportGridWide: {
    maxWidth: 760,
  },
  sportCard: {
    width: '40%',
    marginVertical: spacing.s,
    alignItems: 'center',
    padding: spacing.m,
    borderRadius: borderRadius.l,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
  },
  sportCardWide: {
    width: 168,
    minHeight: 132,
    justifyContent: 'center',
  },
  sportIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.s,
  },
  sportName: {
    ...typography.body,
    fontWeight: 'bold',
    color: colors.textPrimary,
  },
  mainFormContainer: {
    padding: spacing.m,
  },
  mainFormContainerWide: {
    paddingHorizontal: 0,
    paddingTop: spacing.s,
  },
  responsiveLayout: {
    flex: 1,
    minHeight: 0,
  },
  responsiveLayoutWide: {
    flexDirection: 'row',
    overflow: 'hidden',
    alignSelf: 'center',
    width: '100%',
    maxWidth: 1110,
    gap: spacing.xl,
    paddingHorizontal: spacing.l,
  },
  mainColumn: {
    flex: 1,
    minHeight: 0,
  },
  mainColumnWide: {
    maxWidth: 700,
  },
  summarySidePanel: {
    width: '100%',
    minHeight: 0,
  },
  summarySideColumn: {
    width: 320,
    maxWidth: 320,
    minHeight: 0,
    flexGrow: 0,
    flexShrink: 0,
  },
  summarySidePanelContent: {
    paddingTop: spacing.s,
  },
  compactSummary: {
    marginBottom: spacing.l,
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
  segmentedRow: {
    paddingTop: spacing.m,
  },
  chipsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.s,
  },
  chipButton: {
    minHeight: 44,
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderWidth: 1,
    borderRadius: borderRadius.full,
    alignItems: 'center',
  },
  chipText: {
    fontSize: 14,
    fontWeight: '600',
  },
  helperDescription: {
    fontSize: 12,
    lineHeight: 16,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  modalOverlayWide: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.l,
  },
  modalCard: {
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
  modalCardWide: {
    width: '100%',
    maxWidth: 560,
    borderRadius: 24,
    maxHeight: '84%',
  },
  modalTitle: {
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
  customGoalInputContainer: {
    paddingHorizontal: spacing.s,
    marginBottom: spacing.m,
  },
  customGoalInput: {
    borderWidth: 1,
    borderRadius: borderRadius.m,
    padding: spacing.m,
    fontSize: 15,
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
  confirmActionBtn: {
    // Background dynamic
  },
  confirmActionBtnText: {
    color: '#FFF',
    fontWeight: '600',
    letterSpacing: 0.5,
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
});
