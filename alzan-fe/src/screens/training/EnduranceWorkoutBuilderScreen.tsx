import React, { useEffect, useRef, useState } from 'react';
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
import DateTimePicker from '@react-native-community/datetimepicker';
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
  Calendar,
} from 'lucide-react-native';
import { EnduranceStepEditorModal } from './components/EnduranceStepEditorModal';
import { HyroxStepEditorModal } from './components/HyroxStepEditorModal';
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
import { SimpleWheelPicker } from '../../components/SimpleWheelPicker';
import { LinearGradient } from 'expo-linear-gradient';
import { SportIcon } from '../../components/icons/SportIcon';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { SPORT_COLORS } from '../../theme/sportColors';
import { useUnitConversion } from '../../hooks/useUnitConversion';
import { useUserPreferences } from '../../hooks/useUserPreferences';
import { useTrainingSettings } from '../../hooks/useTrainingSettings';
import { useSportCatalog } from '../../hooks/useSportCatalog';
import { DurationType, PhaseType, SportType, TargetType } from '../../types/requests.types';
import { Nullable } from '../../types/common.types';
import { Alert } from '../../components/common/Alert';
import { AlzanSwitch } from '../../components/common/AlzanSwitch';
import { useTranslation } from 'react-i18next';
import { getPhaseLabel } from './helpers/phase.helper';
import { getDateFnsLocale } from '../../i18n/dateLocale';
import { formatPaceTime } from '../../utils/unitConversionUtils';
import {
  calculateProgressionWeeks,
  calculateStartDateFromEndAndWeeks,
  EligibleProgressionStep,
  ensureStepProgressionKeys,
  filterStepProgressionsBySteps,
  getEligibleProgressionSteps,
  getNextScheduledDateString,
  normalizeStepProgressions,
  ProgressionBuilderStep,
  StepProgressionOverride,
} from '../../modules/training/helpers/enduranceProgression.helper';
import { fetchEnduranceStepProgressions } from '../../modules/training/services/enduranceProgressionService';
import { buildEnduranceTemplateFamilySignature } from '../../modules/training/helpers/templateFamilySignature';
import { isScheduledWeekday } from '../../modules/training/helpers/templateScheduling.helper';

interface Step {
  id: string; // temp id
  progression_key?: string | null;
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
  hyrox_step_type?: string | null;
  hyrox_station_key?: string | null;
  load_kg?: number | null;
  reps?: number | null;
}

const VOLLEYBALL_SPORT_TYPE = 'volleyball' as SportType;
const TRAIL_SPORT_TYPE = 'trail' as SportType;
const GOLF_SPORT_TYPE = 'golf' as SportType;
const HYROX_SPORT_TYPE = 'hyrox' as SportType;

const HYROX_FULL_FORMAT_STATIONS = [
  { key: 'skierg', distanceM: 1000 },
  { key: 'sled_push', distanceM: 50 },
  { key: 'sled_pull', distanceM: 50 },
  { key: 'burpee_broad_jump', distanceM: 80 },
  { key: 'rowing', distanceM: 1000 },
  { key: 'farmers_carry', distanceM: 200 },
  { key: 'sandbag_lunges', distanceM: 100 },
  { key: 'wall_balls', reps: 100 },
] satisfies Array<{ key: string; distanceM?: number; reps?: number }>;

type ProgressionPickerMode = 'duration' | 'target' | 'repetitions' | 'hyrox_station';

type ProgressionPickerDraft = {
  paceMin: string;
  paceSec: string;
  speed: string;
  zone: string;
  durationHour: string;
  durationMin: string;
  durationSec: string;
  distanceMajor: string;
  distanceMinor: string;
  repetitionCount: string;
  reps: string;
  loadKg: string;
};

type ProgressionPickerState = {
  step: EligibleProgressionStep;
  weekIndex: number;
  mode: ProgressionPickerMode;
  draft: ProgressionPickerDraft;
};

export const EnduranceWorkoutBuilderScreen = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const navigation = useNavigation<TrainingScreenNavigationProp>();
  const route = useRoute<RouteProp<TrainingStackParamList, 'EnduranceWorkoutBuilder'>>();
  const { saveWorkout } = useEnduranceWorkoutBuilder();
  const { convertDistanceToUi, convertSpeedToUi } = useUnitConversion();
  const { preferences } = useUserPreferences();
  const { settings: trainingSettings } = useTrainingSettings();
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
  const [sportType, setSportType] = useState<Nullable<SportType>>(route.params?.sportType || null);
  const showSummary =
    sportType !== 'football' &&
    sportType !== 'tennis' &&
    sportType !== 'padel' &&
    sportType !== 'hiking' &&
    sportType !== 'martial_arts' &&
    sportType !== 'climbing' &&
    sportType !== VOLLEYBALL_SPORT_TYPE &&
    sportType !== TRAIL_SPORT_TYPE &&
    sportType !== 'surf' &&
    sportType !== 'skiing' &&
    sportType !== 'snowboard' &&
    sportType !== GOLF_SPORT_TYPE;
  const [scheduledDays, setScheduledDays] = useState<number[]>([]);
  const [originalScheduledDay, setOriginalScheduledDay] = useState<number | null>(null);
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurrenceStartDate, setRecurrenceStartDate] = useState<string | null>(null);
  const [recurrenceEndDate, setRecurrenceEndDate] = useState<string>('');
  const [recurrenceWeeks, setRecurrenceWeeks] = useState<string>('');
  const [autoDeleteAfterEnd, setAutoDeleteAfterEnd] = useState(true);
  const [showRecurrenceStartPicker, setShowRecurrenceStartPicker] = useState(false);

  useEffect(() => {
    if (!isRecurring) {
      // Imported one-off plans can still have a lifecycle end date. Keep it
      // visible and persisted even though they do not repeat by weekday.
      return;
    }
    const weeks = parseInt(recurrenceWeeks, 10);
    if (isNaN(weeks) || weeks < 1) {
      setRecurrenceEndDate('');
      return;
    }
    const refStart = recurrenceStartDate || getNextScheduledDateString(new Date(), scheduledDays[0] ?? null);
    if (!refStart) {
      setRecurrenceEndDate('');
      return;
    }
    try {
      const parsedStart = new Date(`${refStart}T00:00:00`);
      if (!isNaN(parsedStart.getTime())) {
        const calculatedEnd = addDays(parsedStart, weeks * 7 - 1);
        setRecurrenceEndDate(format(calculatedEnd, 'yyyy-MM-dd'));
      } else {
        setRecurrenceEndDate('');
      }
    } catch (err) {
      console.error('[EnduranceWorkoutBuilderScreen] error calculating end date:', err);
      setRecurrenceEndDate('');
    }
  }, [isEditMode, isRecurring, recurrenceWeeks, recurrenceStartDate, scheduledDays]);

  useEffect(() => {
    if (!isEditMode) setAutoDeleteAfterEnd(trainingSettings.autoDeleteExpiredTemplates);
  }, [isEditMode, trainingSettings.autoDeleteExpiredTemplates]);
  const [stepProgressions, setStepProgressions] = useState<StepProgressionOverride[]>([]);
  const [progressionPicker, setProgressionPicker] = useState<ProgressionPickerState | null>(null);
  const hydratedTemplateIdRef = useRef<string | null>(null);
  const [manualDuration, setManualDuration] = useState<string>('');
  const [elevationGain, setElevationGain] = useState<string>('');
  const [environmentType, setEnvironmentType] = useState<string | null>(null);
  const [surface, setSurface] = useState<string | null>(null);
  const [poolType, setPoolType] = useState<string | null>(null);
  const [stroke, setStroke] = useState<string | null>(null);

  // Football-specific state
  const [footballSessionType, setFootballSessionType] = useState<string>('match');
  const [baseLoad, setBaseLoad] = useState<string | null>(null);
  const [contactLevel, setContactLevel] = useState<string | null>(null);
  const [bootsUsed, setBootsUsed] = useState<string | null>(null);
  const [rival, setRival] = useState<string>('');
  const [notes, setNotes] = useState<string>('');

  // Tennis-specific state
  const [racketUsed, setRacketUsed] = useState<string | null>(null);

  // Modals visibility
  const [goalModalVisible, setGoalModalVisible] = useState(false);
  const [surfaceModalVisible, setSurfaceModalVisible] = useState(false);
  const [typeModalVisible, setTypeModalVisible] = useState(false);
  const [poolTypeModalVisible, setPoolTypeModalVisible] = useState(false);
  const [strokeModalVisible, setStrokeModalVisible] = useState(false);
  const [baseLoadModalVisible, setBaseLoadModalVisible] = useState(false);

  // Climbing state
  const [climbingGrade, setClimbingGrade] = useState<string | null>(null);
  const [climbingGradeModalVisible, setClimbingGradeModalVisible] = useState(false);
  const [contactLevelModalVisible, setContactLevelModalVisible] = useState(false);

  // Surf state
  const [wetsuit, setWetsuit] = useState<string | null>(null);
  const [wetsuitModalVisible, setWetsuitModalVisible] = useState(false);
  const [board, setBoard] = useState<string | null>(null);
  const [boardModalVisible, setBoardModalVisible] = useState(false);

  // Skiing state
  const [skiType, setSkiType] = useState<string | null>(null);
  const [slopeType, setSlopeType] = useState<string | null>(null);

  const [skiTypeModalVisible, setSkiTypeModalVisible] = useState(false);
  const [slopeTypeModalVisible, setSlopeTypeModalVisible] = useState(false);

  // Snowboard state
  const [snowboardType, setSnowboardType] = useState<string | null>(null);
  const [snowboardTypeModalVisible, setSnowboardTypeModalVisible] = useState(false);

  // Golf state
  const [golfClubFocus, setGolfClubFocus] = useState<string | null>(null);
  const [golfClubFocusModalVisible, setGolfClubFocusModalVisible] = useState(false);

  // HYROX state
  const [hyroxStationFocus, setHyroxStationFocus] = useState<string | null>(null);
  const [hyroxStationFocusModalVisible, setHyroxStationFocusModalVisible] = useState(false);

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

  const { data: existingProgressions = [], isLoading: isExistingProgressionsLoading } = useQuery({
    queryKey: ['enduranceTemplateProgressions', templateId],
    queryFn: async () => {
      if (!templateId) return [];
      return fetchEnduranceStepProgressions(templateId);
    },
    enabled: !!templateId,
  });

  const isHydratingEditTemplate =
    isEditMode && (isExistingTemplateLoading || isExistingProgressionsLoading) && !sportType;

  useEffect(() => {
    hydratedTemplateIdRef.current = null;
  }, [templateId]);

  // Populate fields when template loads
  useEffect(() => {
    if (existingTemplate && !isExistingProgressionsLoading && hydratedTemplateIdRef.current !== existingTemplate.id) {
      hydratedTemplateIdRef.current = existingTemplate.id;
      setName(existingTemplate.base_name || '');
      setDescription(existingTemplate.description || '');

      const goalValue = existingTemplate.workout_goal || undefined;
      setTrainingGoal(goalValue);

      setSportType((existingTemplate.sport_type as SportType) || 'running');
      setEnvironmentType(
        existingTemplate.environment_type || (existingTemplate.sport_type === 'running' ? 'outdoor' : null),
      );
      setSurface(existingTemplate.surface || null);
      setElevationGain(existingTemplate.elev_gain_m?.toString() || '');
      setPoolType(existingTemplate.pool_type || null);
      setStroke(existingTemplate.stroke || null);

      // Climbing hydration
      setClimbingGrade(existingTemplate.climbing_grade || null);
      setWetsuit(existingTemplate.wetsuit || null);
      setBoard(existingTemplate.board || null);

      // Skiing hydration
      setSkiType(existingTemplate.ski_type || null);
      setSlopeType(existingTemplate.slope_type || null);

      // Snowboard hydration
      setSnowboardType(existingTemplate.snowboard_type || null);
      setSlopeType(existingTemplate.slope_type || null);

      // Golf hydration
      setGolfClubFocus(
        'golf_club_focus' in existingTemplate && typeof existingTemplate.golf_club_focus === 'string'
          ? existingTemplate.golf_club_focus
          : null,
      );
      setHyroxStationFocus(
        'hyrox_station_focus' in existingTemplate && typeof existingTemplate.hyrox_station_focus === 'string'
          ? existingTemplate.hyrox_station_focus
          : null,
      );

      // Football hydration
      setFootballSessionType(existingTemplate.football_session_type || 'match');
      setBaseLoad(existingTemplate.base_load || null);
      setContactLevel(existingTemplate.contact_level || null);
      setBootsUsed(existingTemplate.boots_used || null);
      setRival(existingTemplate.rival || '');
      setNotes(existingTemplate.notes || '');

      // Tennis hydration
      setRacketUsed(existingTemplate.racket_used || null);

      if (isScheduledWeekday(existingTemplate.scheduled_day)) {
        setScheduledDays([existingTemplate.scheduled_day]);
        setOriginalScheduledDay(existingTemplate.scheduled_day);
      } else {
        setScheduledDays([]);
        setOriginalScheduledDay(null);
      }
      setIsRecurring(isScheduledWeekday(existingTemplate.scheduled_day));
      setRecurrenceStartDate(existingTemplate.recurrence_start_date || null);
      setRecurrenceEndDate(existingTemplate.recurrence_end_date || '');
      const lifecycleData = existingTemplate as unknown as {
        auto_delete_after_end?: boolean | null;
      };
      setAutoDeleteAfterEnd(lifecycleData.auto_delete_after_end ?? trainingSettings.autoDeleteExpiredTemplates);
      const weeks = calculateProgressionWeeks(
        existingTemplate.recurrence_start_date,
        existingTemplate.recurrence_end_date,
      );
      setRecurrenceWeeks(weeks > 0 ? String(weeks) : '');
      setStepProgressions(
        normalizeStepProgressions(
          existingProgressions.map(progression => ({
            progression_key: progression.progression_key,
            week_index: progression.week_index,
            duration_s: progression.duration_s,
            distance_m: progression.distance_m,
            target_type: progression.target_type,
            target_min: progression.target_min,
            target_max: progression.target_max,
            repetitions: progression.repetitions,
            load_kg: progression.load_kg,
            reps: progression.reps,
          })),
        ),
      );

      // Convert DB steps to UI format
      if (existingTemplate.endurance_workout_steps) {
        const dbSteps = existingTemplate.endurance_workout_steps;
        const uiSteps: Step[] = dbSteps
          .filter(s => !s.parent_step_id)
          .sort((a, b) => a.order_index - b.order_index)
          .map(s => ({
            id: s.id,
            progression_key: s.progression_key,
            phase_type: s.phase_type,
            duration_type: s.duration_type,
            duration_s: s.duration_s,
            distance_m: s.distance_m,
            target_type: s.target_type,
            target_min: s.target_min,
            target_max: s.target_max,
            repetitions: s.repetitions || 1,
            is_group: s.is_group || false,
            hyrox_step_type: s.hyrox_step_type,
            hyrox_station_key: s.hyrox_station_key,
            load_kg: s.load_kg,
            reps: s.reps,
            children: dbSteps
              .filter(c => c.parent_step_id === s.id)
              .sort((a, b) => a.order_index - b.order_index)
              .map(c => ({
                id: c.id,
                progression_key: c.progression_key,
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
                hyrox_step_type: c.hyrox_step_type,
                hyrox_station_key: c.hyrox_station_key,
                load_kg: c.load_kg,
                reps: c.reps,
              })),
          })) as Step[];
        setSteps(ensureStepProgressionKeys(uiSteps));
      }
    }
  }, [
    existingProgressions,
    existingTemplate,
    isExistingProgressionsLoading,
    trainingSettings.autoDeleteExpiredTemplates,
  ]);

  // Progression rows are stored separately from the step tree. Reconcile them
  // whenever steps are edited so deleted steps cannot keep overriding the
  // values shown in the builder or the calendar preview.
  useEffect(() => {
    if (steps.length === 0) return;

    setStepProgressions(previous => {
      const current = filterStepProgressionsBySteps(steps, previous);
      return current.length === previous.length ? previous : current;
    });
  }, [steps]);

  const poolTypeOptions = sportType ? getOptions(sportType, 'pool_type') : [];
  const strokeOptions = sportType ? getOptions(sportType, 'stroke') : [];
  const climbingGradeOptions = sportType ? getOptions(sportType, 'climbing_grade') : [];
  const wetsuitOptions = sportType ? getOptions(sportType, 'wetsuit') : [];
  const boardOptions = sportType ? getOptions(sportType, 'board') : [];
  const goalOptions = sportType ? getOptions(sportType, 'goal') : [];
  const modalityOptions = sportType ? getOptions(sportType, 'modality') : [];
  const terrainOptions = sportType ? getOptions(sportType, 'terrain') : [];
  const skiTypeOptions = sportType ? getOptions(sportType, 'ski_type') : [];
  const snowboardTypeOptions = sportType ? getOptions(sportType, 'snowboard_type') : [];
  const golfClubFocusOptions = sportType ? getOptions(sportType, 'golf_club_focus') : [];
  const hyroxStationFocusOptions = sportType ? getOptions(sportType, 'hyrox_station_focus') : [];
  const slopeTypeOptions = sportType ? getOptions(sportType, 'slope_type') : [];
  const baseLoadOptions = [
    'football',
    'tennis',
    'padel',
    'hiking',
    'martial_arts',
    'climbing',
    'volleyball',
    'trail',
    'surf',
    'skiing',
    'snowboard',
    'golf',
    'hyrox',
  ].includes(sportType || '')
    ? getOptions(sportType, 'base_load')
    : [];
  const contactLevelOptions = sportType === 'martial_arts' ? getOptions(sportType, 'contact_level') : [];
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

  const getStructuredGoals = () => {
    return goalOptions.map(option => ({
      key: option.option_key,
      title: getOptionLabel(sportType, option.option_key, 'goal'),
    }));
  };

  const getGoalDisplayLabel = (goal?: string) => {
    if (!goal) return '';
    const match = getStructuredGoals().find(g => g.key === goal);
    if (match) {
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

    if (sportType === HYROX_SPORT_TYPE) {
      const runCount = steps.filter(step => step.hyrox_step_type === 'run').length;
      const stationCount = steps.filter(step => step.hyrox_step_type === 'station').length;
      const restCount = steps.filter(step => step.hyrox_step_type === 'rest').length;

      return {
        warmupStr: runCount ? `${runCount}x ${t('training.hyroxRunBlock')}` : '--',
        workStr: stationCount ? `${stationCount}x ${t('training.hyroxStationBlock')}` : '--',
        cooldownStr: restCount ? `${restCount}x ${t('training.hyroxRestBlock')}` : '--',
      };
    }

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

  const getRecurrenceStartDateForSave = (scheduledDay: number | null): string | null => {
    if (!isRecurring) {
      // Imported plans with several weekdays are date-driven rather than
      // weekly templates. Preserve their range; a manually created one-off
      // must never retain a stale recurrence start date.
      const isImportedDateDrivenTemplate =
        existingTemplate?.source === 'imported' &&
        existingTemplate.scheduled_day === null &&
        !!existingTemplate.recurrence_start_date &&
        !!existingTemplate.recurrence_end_date;

      return isImportedDateDrivenTemplate ? recurrenceStartDate || existingTemplate.recurrence_start_date : null;
    }
    if (scheduledDay === null) return null;
    if (recurrenceStartDate) {
      return recurrenceStartDate;
    }
    const weeks = parseInt(recurrenceWeeks, 10);
    if (recurrenceEndDate.trim() && !isNaN(weeks) && weeks >= 1) {
      const calculatedStart = calculateStartDateFromEndAndWeeks(recurrenceEndDate.trim(), weeks);
      if (calculatedStart) return calculatedStart;
    }
    return getNextScheduledDateString(new Date(), scheduledDay);
  };

  const getValidatedRecurrenceEndDate = (): string | null => {
    const trimmedEndDate = recurrenceEndDate.trim();
    return trimmedEndDate.length > 0 ? trimmedEndDate : null;
  };

  const executeSave = async (detachFromImport = false) => {
    try {
      const isOneOff = !isRecurring && scheduledDays.length > 0;
      const templateScheduledDay = isRecurring && scheduledDays.length > 0 ? scheduledDays[0] : null;
      const recurrenceStartDateForSave = getRecurrenceStartDateForSave(templateScheduledDay);
      const recurrenceEndDateForSave = getValidatedRecurrenceEndDate();
      const importedLifecycleChanged =
        existingTemplate?.source === 'imported' &&
        (templateScheduledDay !== existingTemplate.scheduled_day ||
          recurrenceStartDateForSave !== existingTemplate.recurrence_start_date ||
          recurrenceEndDateForSave !== existingTemplate.recurrence_end_date);
      const stepsWithProgressionKeys = ensureStepProgressionKeys(steps);

      const finalGoal = trainingGoal;

      const result = await saveWorkout.mutateAsync({
        data: {
          base_name: name,
          description,
          sport_type: sportType || 'running',
          workout_goal: finalGoal,
          total_duration_s:
            sportType === HYROX_SPORT_TYPE
              ? Math.round(totalDuration || (parseInt(manualDuration) || 0) * 60)
              : ['running', 'cycling', 'swimming'].includes(sportType || '')
                ? Math.round(totalDuration)
                : (parseInt(manualDuration) || 0) * 60,
          total_distance_m: Math.round(totalDistance),
          scheduled_day: templateScheduledDay,
          recurrence_start_date: recurrenceStartDateForSave,
          recurrence_end_date: recurrenceEndDateForSave,
          auto_delete_after_end: autoDeleteAfterEnd,
          template_family_key: buildEnduranceTemplateFamilySignature({
            sportType: sportType || 'running',
            workoutGoal: finalGoal,
            modality: environmentType,
            steps: stepsWithProgressionKeys.map(step => ({
              phaseType: step.phase_type,
              durationType: step.duration_type,
              isGroup: step.is_group,
              repetitions: step.repetitions,
              hyroxStepType: step.hyrox_step_type,
              children: step.children?.map(child => ({
                phaseType: child.phase_type,
                durationType: child.duration_type,
                isGroup: child.is_group,
                repetitions: child.repetitions,
                hyroxStepType: child.hyrox_step_type,
              })),
            })),
          }),
          original_template_family_key: existingTemplate?.template_family_key,
          source: detachFromImport || importedLifecycleChanged ? 'user' : existingTemplate?.source,
          environment_type: environmentType,
          surface: surface,
          pool_type: poolType,
          stroke: stroke,
          football_session_type: sportType === 'football' ? footballSessionType : null,
          base_load: [
            'football',
            'tennis',
            'padel',
            'hiking',
            'martial_arts',
            'climbing',
            'volleyball',
            'trail',
            'surf',
            'skiing',
            'snowboard',
            'golf',
            'hyrox',
          ].includes(sportType || '')
            ? baseLoad
            : null,
          elev_gain_m:
            sportType === TRAIL_SPORT_TYPE && elevationGain.trim()
              ? Math.max(0, Number.parseFloat(elevationGain.replace(',', '.')) || 0)
              : null,
          contact_level: sportType === 'martial_arts' ? contactLevel : null,
          boots_used: sportType === 'football' || sportType === 'hiking' ? bootsUsed : null,
          racket_used: ['tennis', 'padel'].includes(sportType || '') ? racketUsed : null,
          climbing_grade: sportType === 'climbing' ? climbingGrade : null,
          wetsuit: sportType === 'surf' ? wetsuit : null,
          board: sportType === 'surf' ? board : null,
          ski_type: sportType === 'skiing' ? skiType : null,
          snowboard_type: sportType === 'snowboard' ? snowboardType : null,
          golf_club_focus: sportType === GOLF_SPORT_TYPE ? golfClubFocus : null,
          hyrox_station_focus: sportType === HYROX_SPORT_TYPE ? hyroxStationFocus : null,
          slope_type: ['skiing', 'snowboard'].includes(sportType || '') ? slopeType : null,
          rival: sportType === 'football' ? rival : null,
          notes: sportType === 'football' ? notes : null,
        },
        steps: stepsWithProgressionKeys as BuilderStep[],
        progressions:
          recurrenceStartDateForSave && recurrenceEndDateForSave
            ? filterStepProgressionsBySteps(stepsWithProgressionKeys, stepProgressions)
            : [],
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
    if (
      (sportType === 'running' ||
        sportType === 'cycling' ||
        sportType === 'swimming' ||
        sportType === HYROX_SPORT_TYPE) &&
      !environmentType
    ) {
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

    if (recurrenceEndDate.trim() && !/^\d{4}-\d{2}-\d{2}$/.test(recurrenceEndDate.trim())) {
      Alert.alert(t('common.error'), t('training.recurrenceEndDateInvalid'));
      return;
    }

    if (isRecurring && recurrenceEndDate.trim()) {
      const recurrenceStart = getRecurrenceStartDateForSave(scheduledDays[0] ?? null);
      const recurrenceWeeks = calculateProgressionWeeks(recurrenceStart, recurrenceEndDate.trim());
      if (recurrenceWeeks < 1) {
        Alert.alert(t('common.error'), t('training.recurrenceEndDateInvalid'));
        return;
      }
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
              await executeSave(true);
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
    const nextStep = withProgressionKeys(newStep);
    if (editingStep) {
      if (activeGroupId) {
        setSteps(prev =>
          prev.map(s => {
            if (s.id === activeGroupId) {
              return { ...s, children: s.children?.map(c => (c.id === nextStep.id ? nextStep : c)) };
            }
            return s;
          }),
        );
      } else {
        setSteps(prev => updateStepInTree(prev, nextStep));
      }
    } else {
      if (activeGroupId) {
        setSteps(prev =>
          prev.map(s => {
            if (s.id === activeGroupId) {
              return { ...s, children: [...(s.children || []), { ...nextStep, parent_step_id: s.id }] };
            }
            return s;
          }),
        );
      } else {
        setSteps(prev => [...prev, nextStep]);
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

  const withProgressionKeys = (step: Step): Step => ensureStepProgressionKeys([step])[0];

  const handleAddGroup = () => {
    const newGroup: Step = withProgressionKeys({
      id: Math.random().toString(),
      phase_type: 'interval',
      duration_type: 'time',
      repetitions: 3,
      is_group: true,
      target_type: 'none',
      children: [],
    });
    setSteps(prev => [...prev, newGroup]);
  };

  const handleAddHyroxFullFormat = () => {
    const fullFormatSteps = ensureStepProgressionKeys(
      HYROX_FULL_FORMAT_STATIONS.flatMap((station, index): Step[] => [
        {
          id: `hyrox-run-${Date.now()}-${index}`,
          phase_type: 'interval',
          duration_type: 'distance',
          distance_m: 1000,
          target_type: 'none',
          repetitions: 1,
          is_group: false,
          hyrox_step_type: 'run',
          hyrox_station_key: null,
          load_kg: null,
          reps: null,
        },
        {
          id: `hyrox-station-${Date.now()}-${index}`,
          phase_type: 'interval',
          duration_type: station.distanceM ? 'distance' : 'time',
          distance_m: station.distanceM,
          duration_s: station.distanceM ? undefined : 0,
          target_type: 'none',
          repetitions: 1,
          is_group: false,
          hyrox_step_type: 'station',
          hyrox_station_key: station.key,
          load_kg: null,
          reps: station.reps ?? null,
        },
      ]),
    );

    setSteps(fullFormatSteps);
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

  const getHyroxStepTitle = (step: ProgressionBuilderStep) => {
    if (step.hyrox_step_type === 'run') return t('training.hyroxRunBlock');
    if (step.hyrox_step_type === 'station') {
      return step.hyrox_station_key
        ? getOptionLabel(HYROX_SPORT_TYPE, step.hyrox_station_key, 'hyrox_station_focus')
        : t('training.hyroxStationBlock');
    }
    if (step.hyrox_step_type === 'rest') return t('training.hyroxRestBlock');
    return t(getPhaseLabel(step.phase_type));
  };

  const renderHyroxExtraDetails = (step: Step) => {
    if (sportType !== HYROX_SPORT_TYPE || step.hyrox_step_type !== 'station') return null;

    const parts = [
      step.reps ? `${step.reps} ${t('training.hyroxReps').toLowerCase()}` : null,
      step.load_kg ? `${step.load_kg} ${t('training.unitKgShort')}` : null,
    ].filter(Boolean);

    if (parts.length === 0) return null;

    return (
      <View style={styles.detailRow}>
        <Zap size={16} color={themeColors.textSecondary} />
        <Text style={[styles.detailText, { color: isDark ? themeColors.textPrimary : themeColors.textSecondary }]}>
          {parts.join(' · ')}
        </Text>
      </View>
    );
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
              {item.is_group
                ? t('training.repCaps')
                : sportType === HYROX_SPORT_TYPE
                  ? getHyroxStepTitle(item)
                  : t(getPhaseLabel(item.phase_type))}
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
                          {sportType === HYROX_SPORT_TYPE
                            ? getHyroxStepTitle(child)
                            : t(getPhaseLabel(child.phase_type))}
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
                    {renderHyroxExtraDetails(child)}
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
            {renderHyroxExtraDetails(item)}
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
  const structuredSport = sportType ? ['running', 'cycling', 'swimming', 'hyrox'].includes(sportType) : false;
  const recurrenceScheduledDay = isRecurring && scheduledDays.length > 0 ? scheduledDays[0] : null;
  const effectiveRecurrenceStartDate = getRecurrenceStartDateForSave(recurrenceScheduledDay);
  const recurrenceWeekCount = calculateProgressionWeeks(effectiveRecurrenceStartDate, recurrenceEndDate.trim());
  const eligibleProgressionSteps = getEligibleProgressionSteps(steps, sportType);
  const isMetricDistance = preferences.distance_unit === 'km';
  const progressionPaceUnitLabel =
    sportType === 'swimming' ? (isMetricDistance ? '/100m' : '/100yd') : isMetricDistance ? '/km' : '/mi';
  const progressionSpeedUnitLabel = isMetricDistance ? 'km/h' : 'mph';

  const formatPaceInput = (seconds: number | null | undefined) => {
    if (!seconds || seconds <= 0) return '';
    return formatPaceTime(seconds);
  };

  const toUiPaceSeconds = (dbSeconds: number) => {
    if (sportType !== 'swimming' && !isMetricDistance) return dbSeconds * 1.60934;
    if (sportType === 'swimming' && !isMetricDistance) return dbSeconds / 1.09361;
    return dbSeconds;
  };

  const toDbPaceSeconds = (uiSeconds: number) => {
    if (sportType !== 'swimming' && !isMetricDistance) return uiSeconds / 1.60934;
    if (sportType === 'swimming' && !isMetricDistance) return uiSeconds * 1.09361;
    return uiSeconds;
  };

  const toUiSpeed = (dbKmh: number) => (isMetricDistance ? dbKmh : dbKmh * 0.621371);
  const toDbSpeed = (uiSpeed: number) => (isMetricDistance ? uiSpeed : uiSpeed * 1.60934);

  const getProgressionOverride = (progressionKey: string, weekIndex: number) =>
    stepProgressions.find(item => item.progression_key === progressionKey && item.week_index === weekIndex);

  const getProgressionNumber = (
    step: ProgressionBuilderStep,
    weekIndex: number,
    key: keyof Pick<
      StepProgressionOverride,
      'duration_s' | 'distance_m' | 'target_min' | 'target_max' | 'repetitions' | 'reps' | 'load_kg'
    >,
  ) => {
    const override = step.progression_key ? getProgressionOverride(step.progression_key, weekIndex) : undefined;
    const overrideValue = override?.[key];
    if (typeof overrideValue === 'number' && Number.isFinite(overrideValue)) return overrideValue;

    const stepValue = step[key as keyof ProgressionBuilderStep];
    return typeof stepValue === 'number' && Number.isFinite(stepValue) ? stepValue : 0;
  };

  const hasProgressionDuration = (step: ProgressionBuilderStep) =>
    step.duration_type === 'time' || step.duration_type === 'distance';

  const hasProgressionTarget = (step: ProgressionBuilderStep) => step.target_type !== 'none';

  const hasProgressionRepetitions = (step: ProgressionBuilderStep) => (step.repetitions ?? 1) > 1;

  const formatProgressionDurationValue = (step: ProgressionBuilderStep, weekIndex: number) => {
    if (step.duration_type === 'time') {
      const duration = Math.round(getProgressionNumber(step, weekIndex, 'duration_s'));
      return duration > 0 ? formatTime(duration) : '-';
    }

    if (step.duration_type === 'distance') {
      const distanceValue = getProgressionNumber(step, weekIndex, 'distance_m');
      const distanceLabel = convertDistanceToUi(distanceValue, 2);
      return distanceValue > 0 ? `${distanceLabel.value} ${distanceLabel.unit}` : '-';
    }

    return '-';
  };

  const formatProgressionTargetValue = (step: ProgressionBuilderStep, weekIndex: number) => {
    if (step.target_type === 'pace') {
      const uiSeconds = toUiPaceSeconds(getProgressionNumber(step, weekIndex, 'target_min'));
      const label = formatPaceInput(uiSeconds);
      return label ? `${label} ${progressionPaceUnitLabel}` : '-';
    }

    if (step.target_type === 'speed') {
      const uiSpeed = Math.round(toUiSpeed(getProgressionNumber(step, weekIndex, 'target_min')));
      return uiSpeed > 0 ? `${uiSpeed} ${progressionSpeedUnitLabel}` : '-';
    }

    if (step.target_type === 'heart_rate') {
      const zone = Math.round(getProgressionNumber(step, weekIndex, 'target_min'));
      return zone > 0 ? `${t('training.hrZone')} ${zone}` : '-';
    }

    return '-';
  };

  const formatProgressionRepetitionsValue = (step: ProgressionBuilderStep, weekIndex: number) => {
    const repetitions = Math.round(getProgressionNumber(step, weekIndex, 'repetitions'));
    return repetitions > 0 ? `${repetitions}${t('training.xRepetitions')}` : '-';
  };

  const updateProgressionOverride = (
    progressionKey: string,
    weekIndex: number,
    patch: Partial<StepProgressionOverride>,
  ) => {
    setStepProgressions(prev => {
      const existing = prev.find(item => item.progression_key === progressionKey && item.week_index === weekIndex);
      const nextItem: StepProgressionOverride = {
        ...(existing || { progression_key: progressionKey, week_index: weekIndex }),
        ...patch,
      };

      return normalizeStepProgressions([
        ...prev.filter(item => !(item.progression_key === progressionKey && item.week_index === weekIndex)),
        nextItem,
      ]);
    });
  };

  const getHyroxStationProgressionValue = (step: ProgressionBuilderStep, weekIndex: number) => {
    const repsValue = Math.round(getProgressionNumber(step, weekIndex, 'reps'));
    const loadValue = getProgressionNumber(step, weekIndex, 'load_kg');
    const parts = [
      repsValue > 0 ? `${repsValue} ${t('training.unitRepsShort')}` : null,
      loadValue > 0 ? `${loadValue} ${t('training.unitKgShort')}` : null,
    ].filter(Boolean);

    return parts.length > 0 ? parts.join(' · ') : '-';
  };

  const getStepProgressionLabel = (step: ProgressionBuilderStep) => {
    if (sportType === HYROX_SPORT_TYPE && step.hyrox_step_type === 'station') return t('training.hyroxStationBlock');
    if (sportType === HYROX_SPORT_TYPE && step.hyrox_step_type === 'run') return t('training.hyroxRunBlock');
    if (step.is_group) return t('training.repetitions');
    if (step.phase_type === 'interval') return t(getPhaseLabel(step.phase_type));
    if (hasProgressionDuration(step)) return t('training.progressionDuration');
    if (hasProgressionTarget(step)) return t('training.progressionTarget');
    return t('training.interval');
  };

  const createProgressionPickerDraft = (step: EligibleProgressionStep, weekIndex: number): ProgressionPickerDraft => {
    const uiPaceSeconds = Math.max(0, Math.round(toUiPaceSeconds(getProgressionNumber(step, weekIndex, 'target_min'))));
    const durationSeconds = Math.max(0, Math.round(getProgressionNumber(step, weekIndex, 'duration_s')));
    const distanceMeters = Math.max(0, Math.round(getProgressionNumber(step, weekIndex, 'distance_m')));
    const speedValue = Math.max(1, Math.round(toUiSpeed(getProgressionNumber(step, weekIndex, 'target_min')) || 1));
    const zoneValue = Math.max(1, Math.min(5, Math.round(getProgressionNumber(step, weekIndex, 'target_min') || 2)));
    const repetitionValue = Math.max(1, Math.round(getProgressionNumber(step, weekIndex, 'repetitions') || 1));

    let distanceMajor = '0';
    let distanceMinor = '0';
    if (isMetricDistance) {
      let km = Math.floor(distanceMeters / 1000);
      let meters = Math.round((distanceMeters % 1000) / 50) * 50;
      if (meters >= 1000) {
        km += 1;
        meters = 0;
      }
      distanceMajor = Math.min(50, km).toString();
      distanceMinor = meters.toString();
    } else {
      const miles = distanceMeters * 0.000621371;
      let wholeMiles = Math.floor(miles);
      let hundredths = Math.round((miles - wholeMiles) * 100);
      if (hundredths >= 100) {
        wholeMiles += 1;
        hundredths = 0;
      }
      distanceMajor = Math.min(50, wholeMiles).toString();
      distanceMinor = hundredths.toString().padStart(2, '0');
    }

    const cappedPaceSeconds = Math.min(30 * 60 + 59, uiPaceSeconds);
    const [paceMin, paceSec] = formatPaceTime(cappedPaceSeconds).split(':');

    return {
      paceMin,
      paceSec,
      speed: Math.min(90, speedValue).toString(),
      zone: zoneValue.toString(),
      durationHour: Math.min(23, Math.floor(durationSeconds / 3600)).toString(),
      durationMin: Math.floor((durationSeconds % 3600) / 60)
        .toString()
        .padStart(2, '0'),
      durationSec: (durationSeconds % 60).toString().padStart(2, '0'),
      distanceMajor,
      distanceMinor,
      repetitionCount: Math.min(100, repetitionValue).toString(),
      reps: Math.min(300, Math.round(getProgressionNumber(step, weekIndex, 'reps') || 0)).toString(),
      loadKg: Math.min(300, Math.round(getProgressionNumber(step, weekIndex, 'load_kg') || 0)).toString(),
    };
  };

  const openProgressionPicker = (step: EligibleProgressionStep, weekIndex: number, mode: ProgressionPickerMode) => {
    setProgressionPicker({
      step,
      weekIndex,
      mode,
      draft: createProgressionPickerDraft(step, weekIndex),
    });
  };

  const updateProgressionPickerDraft = (patch: Partial<ProgressionPickerDraft>) => {
    setProgressionPicker(prev => (prev ? { ...prev, draft: { ...prev.draft, ...patch } } : prev));
  };

  const confirmProgressionPicker = () => {
    if (!progressionPicker) return;

    const { step, weekIndex, mode, draft } = progressionPicker;

    if (mode === 'hyrox_station') {
      updateProgressionOverride(step.progression_key, weekIndex, {
        reps: Number.parseInt(draft.reps, 10) || null,
        load_kg: Number.parseInt(draft.loadKg, 10) || null,
      });
      setProgressionPicker(null);
      return;
    }

    if (mode === 'repetitions') {
      updateProgressionOverride(step.progression_key, weekIndex, {
        repetitions: Math.max(1, Number.parseInt(draft.repetitionCount, 10) || 1),
      });
      setProgressionPicker(null);
      return;
    }

    if (mode === 'target' && step.target_type === 'pace') {
      const totalUiSeconds = (Number.parseInt(draft.paceMin, 10) || 0) * 60 + (Number.parseInt(draft.paceSec, 10) || 0);
      const dbSeconds = Math.max(1, Math.round(toDbPaceSeconds(totalUiSeconds)));
      updateProgressionOverride(step.progression_key, weekIndex, {
        target_type: 'pace',
        target_min: dbSeconds,
        target_max: dbSeconds,
      });
    } else if (mode === 'target' && step.target_type === 'speed') {
      const dbSpeed = Math.max(1, Math.round(toDbSpeed(Number.parseInt(draft.speed, 10) || 0)));
      updateProgressionOverride(step.progression_key, weekIndex, {
        target_type: 'speed',
        target_min: dbSpeed,
        target_max: dbSpeed,
      });
    } else if (mode === 'target' && step.target_type === 'heart_rate') {
      const zone = Math.max(1, Math.min(5, Number.parseInt(draft.zone, 10) || 1));
      updateProgressionOverride(step.progression_key, weekIndex, {
        target_type: 'heart_rate',
        target_min: zone,
        target_max: zone,
      });
    } else if (mode === 'duration' && step.duration_type === 'time') {
      const seconds =
        (Number.parseInt(draft.durationHour, 10) || 0) * 3600 +
        (Number.parseInt(draft.durationMin, 10) || 0) * 60 +
        (Number.parseInt(draft.durationSec, 10) || 0);
      updateProgressionOverride(step.progression_key, weekIndex, { duration_s: seconds });
    } else if (mode === 'duration' && step.duration_type === 'distance') {
      const major = Number.parseInt(draft.distanceMajor, 10) || 0;
      const minor = Number.parseInt(draft.distanceMinor, 10) || 0;
      const distanceM = isMetricDistance ? major * 1000 + minor : Math.round((major + minor / 100) * 1609.34);
      updateProgressionOverride(step.progression_key, weekIndex, { distance_m: distanceM });
    }

    setProgressionPicker(null);
  };

  const renderProgressionValueButton = (
    step: EligibleProgressionStep,
    weekIndex: number,
    mode: ProgressionPickerMode,
    label: string,
    value: string,
  ) => (
    <TouchableOpacity
      style={[
        styles.progressionValueButton,
        { borderColor: themeColors.border, backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#FFF' },
      ]}
      onPress={() => openProgressionPicker(step, weekIndex, mode)}
      accessibilityRole="button"
      accessibilityLabel={`${t('training.weekNumber', { count: weekIndex })} ${label}`}
    >
      <View style={styles.progressionValueTextGroup}>
        <Text style={[styles.progressionValueLabel, { color: themeColors.textSecondary }]} numberOfLines={1}>
          {label}
        </Text>
        <Text style={[styles.progressionValueText, { color: themeColors.textPrimary }]} numberOfLines={1}>
          {value}
        </Text>
      </View>
      <ChevronRight size={16} color={themeColors.textSecondary} />
    </TouchableOpacity>
  );

  const renderProgressionStepControls = (step: EligibleProgressionStep, weekIndex: number) => {
    const isHyroxStation = sportType === HYROX_SPORT_TYPE && step.hyrox_step_type === 'station';
    const durationLabel =
      step.duration_type === 'distance' ? t('training.distance') : t('training.progressionDuration');

    return (
      <View key={step.progression_key} style={styles.progressionWeekStepBlock}>
        <View style={styles.progressionWeekStepHeader}>
          <Text style={[styles.progressionWeekStepTitle, { color: themeColors.textPrimary }]} numberOfLines={1}>
            {step.path}. {getStepProgressionLabel(step)}
          </Text>
          {!step.is_group && (
            <Text style={[styles.progressionWeekStepMeta, { color: themeColors.textSecondary }]} numberOfLines={1}>
              {sportType === HYROX_SPORT_TYPE ? getHyroxStepTitle(step) : t(getPhaseLabel(step.phase_type))}
            </Text>
          )}
        </View>
        <View style={styles.progressionWeekControls}>
          {isHyroxStation
            ? renderProgressionValueButton(
                step,
                weekIndex,
                'hyrox_station',
                t('training.hyroxStationBlock'),
                getHyroxStationProgressionValue(step, weekIndex),
              )
            : null}
          {!isHyroxStation && hasProgressionRepetitions(step)
            ? renderProgressionValueButton(
                step,
                weekIndex,
                'repetitions',
                t('training.progressionRepetitions'),
                formatProgressionRepetitionsValue(step, weekIndex),
              )
            : null}
          {!isHyroxStation && !step.is_group && hasProgressionDuration(step)
            ? renderProgressionValueButton(
                step,
                weekIndex,
                'duration',
                durationLabel,
                formatProgressionDurationValue(step, weekIndex),
              )
            : null}
          {!isHyroxStation && !step.is_group && hasProgressionTarget(step)
            ? renderProgressionValueButton(
                step,
                weekIndex,
                'target',
                t('training.progressionTarget'),
                formatProgressionTargetValue(step, weekIndex),
              )
            : null}
        </View>
      </View>
    );
  };

  const renderProgressionEditor = () => {
    if (!isRecurring || !recurrenceEndDate.trim() || recurrenceWeekCount < 1 || eligibleProgressionSteps.length === 0) {
      return null;
    }

    return (
      <GlassCard style={[styles.formBlock, dynamicStyles.card]}>
        <Text style={[styles.blockTitle, { color: themeColors.textSecondary }]}>
          {t('training.weeklyProgression').toUpperCase()}
        </Text>
        <Text style={[styles.helperDescription, { color: themeColors.textSecondary, marginBottom: spacing.m }]}>
          {t('training.weeklyProgressionSubtitle')}
        </Text>

        {Array.from({ length: recurrenceWeekCount }, (_, index) => index + 1).map(weekIndex => (
          <View
            key={`progression-week-${weekIndex}`}
            style={[
              styles.progressionWeekCard,
              {
                borderColor: themeColors.border,
                backgroundColor: isDark
                  ? weekIndex % 2 === 0
                    ? 'rgba(255,255,255,0.055)'
                    : 'rgba(255,255,255,0.025)'
                  : weekIndex % 2 === 0
                    ? '#FAFAFA'
                    : '#FFFFFF',
              },
            ]}
          >
            <View style={styles.progressionWeekHeader}>
              <Text style={[styles.progressionWeekLabel, { color: themeColors.textSecondary }]}>
                {t('training.weekNumber', { count: weekIndex })}
              </Text>
            </View>
            {eligibleProgressionSteps.map(step => renderProgressionStepControls(step, weekIndex))}
          </View>
        ))}
      </GlassCard>
    );
  };

  const renderProgressionPickerModal = () => {
    if (!progressionPicker) return null;

    const { step, weekIndex, mode, draft } = progressionPicker;
    const title =
      mode === 'duration'
        ? `${t('training.weekNumber', { count: weekIndex })} · ${t('training.progressionDuration')}`
        : mode === 'target'
          ? `${t('training.weekNumber', { count: weekIndex })} · ${t('training.progressionTarget')}`
          : mode === 'repetitions'
            ? `${t('training.weekNumber', { count: weekIndex })} · ${t('training.progressionRepetitions')}`
            : `${t('training.weekNumber', { count: weekIndex })} · ${getStepProgressionLabel(step)}`;
    const twoDigitItems = Array.from({ length: 60 }, (_, i) => i.toString().padStart(2, '0'));
    const paceMinuteItems = Array.from({ length: 31 }, (_, i) => i.toString());
    const speedItems = Array.from({ length: 90 }, (_, i) => (i + 1).toString());
    const zoneItems = Array.from({ length: 5 }, (_, i) => (i + 1).toString());
    const hourItems = Array.from({ length: 24 }, (_, i) => i.toString());
    const distanceMajorItems = Array.from({ length: 51 }, (_, i) => i.toString());
    const metricDistanceMinorItems = Array.from({ length: 20 }, (_, i) => (i * 50).toString());
    const imperialDistanceMinorItems = Array.from({ length: 100 }, (_, i) => i.toString().padStart(2, '0'));
    const repetitionItems = Array.from({ length: 100 }, (_, i) => (i + 1).toString());
    const repsItems = Array.from({ length: 301 }, (_, i) => i.toString());
    const loadItems = Array.from({ length: 301 }, (_, i) => i.toString());

    const renderWheelContent = () => {
      if (mode === 'hyrox_station') {
        return (
          <>
            <Text style={[styles.progressionPickerLabel, { color: themeColors.textSecondary }]}>
              {t('training.hyroxStationBlock')}
            </Text>
            <View style={styles.progressionPickerWheelRow}>
              <SimpleWheelPicker
                items={repsItems}
                selectedValue={draft.reps}
                onValueChange={reps => updateProgressionPickerDraft({ reps })}
                width={92}
              />
              <Text style={[styles.progressionPickerUnit, { color: themeColors.textSecondary }]}>
                {t('training.unitRepsShort')}
              </Text>
              <SimpleWheelPicker
                items={loadItems}
                selectedValue={draft.loadKg}
                onValueChange={loadKg => updateProgressionPickerDraft({ loadKg })}
                width={92}
              />
              <Text style={[styles.progressionPickerUnit, { color: themeColors.textSecondary }]}>
                {t('training.unitKgShort')}
              </Text>
            </View>
          </>
        );
      }

      if (mode === 'repetitions') {
        return (
          <>
            <Text style={[styles.progressionPickerLabel, { color: themeColors.textSecondary }]}>
              {t('training.progressionRepetitions')}
            </Text>
            <View style={styles.progressionPickerWheelRow}>
              <SimpleWheelPicker
                items={repetitionItems}
                selectedValue={draft.repetitionCount}
                onValueChange={repetitionCount => updateProgressionPickerDraft({ repetitionCount })}
                width={100}
              />
              <Text style={[styles.progressionPickerUnit, { color: themeColors.textSecondary }]}>
                {t('training.unitRepsShort')}
              </Text>
            </View>
          </>
        );
      }

      if (mode === 'target' && step.target_type === 'pace') {
        return (
          <>
            <Text style={[styles.progressionPickerLabel, { color: themeColors.textSecondary }]}>
              {t('training.pace')} {progressionPaceUnitLabel}
            </Text>
            <View style={styles.progressionPickerWheelRow}>
              <SimpleWheelPicker
                items={paceMinuteItems}
                selectedValue={draft.paceMin}
                onValueChange={paceMin => updateProgressionPickerDraft({ paceMin })}
                width={86}
              />
              <Text style={[styles.progressionPickerSeparator, { color: themeColors.textPrimary }]}>:</Text>
              <SimpleWheelPicker
                items={twoDigitItems}
                selectedValue={draft.paceSec}
                onValueChange={paceSec => updateProgressionPickerDraft({ paceSec })}
                width={86}
              />
              <Text style={[styles.progressionPickerUnit, { color: themeColors.textSecondary }]}>
                {progressionPaceUnitLabel}
              </Text>
            </View>
          </>
        );
      }

      if (mode === 'target' && step.target_type === 'speed') {
        return (
          <>
            <Text style={[styles.progressionPickerLabel, { color: themeColors.textSecondary }]}>
              {t('training.speed')} ({progressionSpeedUnitLabel})
            </Text>
            <View style={styles.progressionPickerWheelRow}>
              <SimpleWheelPicker
                items={speedItems}
                selectedValue={draft.speed}
                onValueChange={speed => updateProgressionPickerDraft({ speed })}
                width={100}
              />
              <Text style={[styles.progressionPickerUnit, { color: themeColors.textSecondary }]}>
                {progressionSpeedUnitLabel}
              </Text>
            </View>
          </>
        );
      }

      if (mode === 'target' && step.target_type === 'heart_rate') {
        return (
          <>
            <Text style={[styles.progressionPickerLabel, { color: themeColors.textSecondary }]}>
              {t('training.hrZone')}
            </Text>
            <View style={styles.progressionPickerWheelRow}>
              <SimpleWheelPicker
                items={zoneItems}
                selectedValue={draft.zone}
                onValueChange={zone => updateProgressionPickerDraft({ zone })}
                width={100}
              />
            </View>
          </>
        );
      }

      if (mode === 'duration' && step.duration_type === 'time') {
        return (
          <>
            <Text style={[styles.progressionPickerLabel, { color: themeColors.textSecondary }]}>
              {t('training.timeHmsFormat')}
            </Text>
            <View style={styles.progressionPickerWheelRow}>
              <SimpleWheelPicker
                items={hourItems}
                selectedValue={draft.durationHour}
                onValueChange={durationHour => updateProgressionPickerDraft({ durationHour })}
                width={78}
              />
              <Text style={[styles.progressionPickerSeparator, { color: themeColors.textPrimary }]}>:</Text>
              <SimpleWheelPicker
                items={twoDigitItems}
                selectedValue={draft.durationMin}
                onValueChange={durationMin => updateProgressionPickerDraft({ durationMin })}
                width={78}
              />
              <Text style={[styles.progressionPickerSeparator, { color: themeColors.textPrimary }]}>:</Text>
              <SimpleWheelPicker
                items={twoDigitItems}
                selectedValue={draft.durationSec}
                onValueChange={durationSec => updateProgressionPickerDraft({ durationSec })}
                width={78}
              />
            </View>
          </>
        );
      }

      return (
        <>
          <Text style={[styles.progressionPickerLabel, { color: themeColors.textSecondary }]}>
            {t('training.distance')} ({isMetricDistance ? 'km + m' : 'mi'})
          </Text>
          <View style={styles.progressionPickerWheelRow}>
            <SimpleWheelPicker
              items={distanceMajorItems}
              selectedValue={draft.distanceMajor}
              onValueChange={distanceMajor => updateProgressionPickerDraft({ distanceMajor })}
              width={92}
            />
            <Text style={[styles.progressionPickerUnit, { color: themeColors.textSecondary }]}>
              {isMetricDistance ? 'km' : 'mi'}
            </Text>
            <SimpleWheelPicker
              items={isMetricDistance ? metricDistanceMinorItems : imperialDistanceMinorItems}
              selectedValue={draft.distanceMinor}
              onValueChange={distanceMinor => updateProgressionPickerDraft({ distanceMinor })}
              width={92}
            />
            <Text style={[styles.progressionPickerUnit, { color: themeColors.textSecondary }]}>
              {isMetricDistance ? 'm' : '/100'}
            </Text>
          </View>
        </>
      );
    };

    return (
      <Modal
        animationType={isWideLayout ? 'fade' : 'slide'}
        transparent
        visible={!!progressionPicker}
        onRequestClose={() => setProgressionPicker(null)}
      >
        <Pressable
          style={[styles.modalOverlay, isWideLayout && styles.modalOverlayWide]}
          onPress={() => setProgressionPicker(null)}
        >
          <Pressable
            style={[
              styles.modalCard,
              isWideLayout && styles.modalCardWide,
              { backgroundColor: themeColors.cardBackground || themeColors.background },
            ]}
            onPress={event => event.stopPropagation()}
          >
            <View style={styles.modalHandle} />
            <Text style={[styles.modalTitle, { color: themeColors.textPrimary }]}>{title}</Text>
            {renderWheelContent()}
            <View style={[styles.modalActionRow, { marginTop: spacing.l }]}>
              <TouchableOpacity
                style={[styles.modalActionBtn, styles.cancelActionBtn, { borderColor: themeColors.border }]}
                onPress={() => setProgressionPicker(null)}
              >
                <Text style={[styles.cancelActionBtnText, { color: themeColors.textSecondary }]}>
                  {t('common.cancel')}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.modalActionBtn,
                  styles.confirmActionBtn,
                  { backgroundColor: themeColors.primary, borderColor: themeColors.primary },
                ]}
                onPress={confirmProgressionPicker}
              >
                <Text style={styles.confirmActionBtnText}>{t('common.done')}</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    );
  };

  const renderTemplateSummary = (selectedSport: SportType, showEditorAction = true, compact = false) => {
    const formattedDistance = convertDistanceToUi(totalDistance, 2);
    const scheduledDayNames = scheduledDays.map(day => getWeekdayName(day)).join(', ');
    const structuredDurationLabel =
      sportType === HYROX_SPORT_TYPE && totalDuration <= 0
        ? `${parseInt(manualDuration, 10) || 0} min`
        : formatTime(Math.round(totalDuration));

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
        durationLabel={structuredSport ? structuredDurationLabel : `${parseInt(manualDuration, 10) || 0} min`}
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
              } else if (!['running', 'cycling', 'swimming', 'hyrox'].includes(sportType)) {
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
                { id: 'trail', label: t('constants.trail') },
                { id: 'martial_arts', label: t('constants.martialArts') },
                { id: 'climbing', label: t('constants.climbing') },
                { id: 'volleyball', label: t('constants.volleyball') },
                { id: 'surf', label: t('constants.surfTitle') },
                { id: 'skiing', label: t('constants.skiingTitle') },
                { id: 'snowboard', label: t('constants.snowboardTitle') },
                { id: 'golf', label: t('constants.golfTitle') },
                { id: 'hyrox', label: t('constants.hyroxTitle') },
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
          <View style={[styles.responsiveLayout, isWideLayout && showSummary && styles.responsiveLayoutWide]}>
            <ScrollView
              style={[styles.mainColumn, isWideLayout && showSummary && styles.mainColumnWide]}
              contentContainerStyle={[
                styles.mainFormContainer,
                isWideLayout && showSummary && styles.mainFormContainerWide,
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
                    placeholder={sportType ? t(`training.exampleName_${sportType}`) : t('training.intervalsExample')}
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
                    style={[
                      styles.formRow,
                      ['running', 'cycling', 'swimming'].includes(sportType) && { borderBottomWidth: 0 },
                    ]}
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

                {/* Estimated Duration (for simple/manual sports, placed under Modality/Environment selector) */}
                {!['running', 'cycling', 'swimming'].includes(sportType) && (
                  <View style={[styles.formRow, { borderBottomWidth: 0 }]}>
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
                )}
              </GlassCard>

              {/* Block 2: Detalles de la plantilla (simple sport details) */}
              {(sportType === 'football' ||
                sportType === 'tennis' ||
                sportType === 'padel' ||
                sportType === 'hiking' ||
                sportType === 'martial_arts' ||
                sportType === 'climbing' ||
                sportType === VOLLEYBALL_SPORT_TYPE ||
                sportType === TRAIL_SPORT_TYPE ||
                sportType === 'surf' ||
                sportType === 'skiing' ||
                sportType === 'snowboard' ||
                sportType === GOLF_SPORT_TYPE ||
                sportType === HYROX_SPORT_TYPE) && (
                <GlassCard style={[styles.formBlock, dynamicStyles.card]}>
                  <Text style={[styles.blockTitle, { color: themeColors.textSecondary }]}>
                    {t('training.templateDetails').toUpperCase()}
                  </Text>
                  <View
                    style={{
                      flexDirection: 'row',
                      justifyContent: 'space-between',
                      gap: spacing.s,
                      marginTop: spacing.s,
                    }}
                  >
                    {/* Col 1: Superficie, contact level, or grade */}
                    {sportType === TRAIL_SPORT_TYPE ? (
                      <View
                        style={{
                          flex: 1,
                          padding: 12,
                          borderRadius: 12,
                          borderWidth: 1,
                          borderColor: themeColors.border,
                          alignItems: 'center',
                          justifyContent: 'center',
                          minHeight: 90,
                          backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.02)',
                        }}
                      >
                        <MaterialCommunityIcons
                          name="elevation-rise"
                          size={24}
                          color={SPORT_COLORS[sportType] || themeColors.primary}
                          style={{ marginBottom: 6 }}
                        />
                        <Text
                          style={{
                            fontSize: 10,
                            fontWeight: '600',
                            textTransform: 'uppercase',
                            marginBottom: 6,
                            textAlign: 'center',
                            color: themeColors.textSecondary,
                          }}
                        >
                          {t('training.elevationGoalLabel')}
                        </Text>
                        <TextInput
                          style={{
                            fontSize: 13,
                            fontWeight: '700',
                            textAlign: 'center',
                            color: elevationGain ? themeColors.textPrimary : themeColors.textSecondary,
                            minWidth: 64,
                          }}
                          keyboardType="numeric"
                          placeholder="0 m"
                          placeholderTextColor={themeColors.textSecondary}
                          value={elevationGain}
                          onChangeText={setElevationGain}
                        />
                      </View>
                    ) : sportType === 'surf' ? (
                      <TouchableOpacity
                        style={{
                          flex: 1,
                          padding: 12,
                          borderRadius: 12,
                          borderWidth: 1,
                          borderColor: themeColors.border,
                          alignItems: 'center',
                          justifyContent: 'center',
                          minHeight: 90,
                          backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.02)',
                        }}
                        onPress={() => setWetsuitModalVisible(true)}
                        accessibilityRole="button"
                        accessibilityLabel={t('training.wetsuitLabel')}
                      >
                        <MaterialCommunityIcons
                          name="diving-scuba"
                          size={24}
                          color={SPORT_COLORS[sportType] || themeColors.primary}
                          style={{ marginBottom: 6 }}
                        />
                        <Text
                          style={{
                            fontSize: 10,
                            fontWeight: '600',
                            textTransform: 'uppercase',
                            marginBottom: 6,
                            textAlign: 'center',
                            color: themeColors.textSecondary,
                          }}
                        >
                          {t('training.wetsuitLabel')}
                        </Text>
                        <Text
                          style={{
                            fontSize: 13,
                            fontWeight: '700',
                            textAlign: 'center',
                            color: wetsuit ? themeColors.textPrimary : themeColors.textSecondary,
                          }}
                          numberOfLines={1}
                        >
                          {wetsuit ? getOptionLabel(sportType, wetsuit, 'wetsuit') : t('common.select')}
                        </Text>
                      </TouchableOpacity>
                    ) : sportType === 'skiing' ? (
                      <TouchableOpacity
                        style={{
                          flex: 1,
                          padding: 12,
                          borderRadius: 12,
                          borderWidth: 1,
                          borderColor: themeColors.border,
                          alignItems: 'center',
                          justifyContent: 'center',
                          minHeight: 90,
                          backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.02)',
                        }}
                        onPress={() => setSkiTypeModalVisible(true)}
                        accessibilityRole="button"
                        accessibilityLabel={t('training.skiLabel')}
                      >
                        <MaterialCommunityIcons
                          name="ski"
                          size={24}
                          color={SPORT_COLORS[sportType] || themeColors.primary}
                          style={{ marginBottom: 6 }}
                        />
                        <Text
                          style={{
                            fontSize: 10,
                            fontWeight: '600',
                            textTransform: 'uppercase',
                            marginBottom: 6,
                            textAlign: 'center',
                            color: themeColors.textSecondary,
                          }}
                        >
                          {t('training.skiLabel')}
                        </Text>
                        <Text
                          style={{
                            fontSize: 13,
                            fontWeight: '700',
                            textAlign: 'center',
                            color: skiType ? themeColors.textPrimary : themeColors.textSecondary,
                          }}
                          numberOfLines={1}
                        >
                          {skiType ? getOptionLabel(sportType, skiType, 'ski_type') : t('common.select')}
                        </Text>
                      </TouchableOpacity>
                    ) : sportType === 'snowboard' ? (
                      <TouchableOpacity
                        style={{
                          flex: 1,
                          padding: 12,
                          borderRadius: 12,
                          borderWidth: 1,
                          borderColor: themeColors.border,
                          alignItems: 'center',
                          justifyContent: 'center',
                          minHeight: 90,
                          backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.02)',
                        }}
                        onPress={() => setSnowboardTypeModalVisible(true)}
                        accessibilityRole="button"
                        accessibilityLabel={t('training.snowboardLabel')}
                      >
                        <MaterialCommunityIcons
                          name="snowboard"
                          size={24}
                          color={SPORT_COLORS[sportType] || themeColors.primary}
                          style={{ marginBottom: 6 }}
                        />
                        <Text
                          style={{
                            fontSize: 10,
                            fontWeight: '600',
                            textTransform: 'uppercase',
                            marginBottom: 6,
                            textAlign: 'center',
                            color: themeColors.textSecondary,
                          }}
                        >
                          {t('training.snowboardLabel')}
                        </Text>
                        <Text
                          style={{
                            fontSize: 13,
                            fontWeight: '700',
                            textAlign: 'center',
                            color: snowboardType ? themeColors.textPrimary : themeColors.textSecondary,
                          }}
                          numberOfLines={1}
                        >
                          {snowboardType
                            ? getOptionLabel(sportType, snowboardType, 'snowboard_type')
                            : t('common.select')}
                        </Text>
                      </TouchableOpacity>
                    ) : sportType === GOLF_SPORT_TYPE ? (
                      <TouchableOpacity
                        style={{
                          flex: 1,
                          padding: 12,
                          borderRadius: 12,
                          borderWidth: 1,
                          borderColor: themeColors.border,
                          alignItems: 'center',
                          justifyContent: 'center',
                          minHeight: 90,
                          backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.02)',
                        }}
                        onPress={() => setGolfClubFocusModalVisible(true)}
                        accessibilityRole="button"
                        accessibilityLabel={t('training.golfClubFocusLabel')}
                      >
                        <MaterialCommunityIcons
                          name="golf-tee"
                          size={24}
                          color={SPORT_COLORS[sportType] || themeColors.primary}
                          style={{ marginBottom: 6 }}
                        />
                        <Text
                          style={{
                            fontSize: 10,
                            fontWeight: '600',
                            textTransform: 'uppercase',
                            marginBottom: 6,
                            textAlign: 'center',
                            color: themeColors.textSecondary,
                          }}
                        >
                          {t('training.golfClubFocusLabel')}
                        </Text>
                        <Text
                          style={{
                            fontSize: 13,
                            fontWeight: '700',
                            textAlign: 'center',
                            color: golfClubFocus ? themeColors.textPrimary : themeColors.textSecondary,
                          }}
                          numberOfLines={1}
                        >
                          {golfClubFocus
                            ? getOptionLabel(sportType, golfClubFocus, 'golf_club_focus')
                            : t('common.select')}
                        </Text>
                      </TouchableOpacity>
                    ) : sportType === HYROX_SPORT_TYPE ? (
                      <TouchableOpacity
                        style={{
                          flex: 1,
                          padding: 12,
                          borderRadius: 12,
                          borderWidth: 1,
                          borderColor: themeColors.border,
                          alignItems: 'center',
                          justifyContent: 'center',
                          minHeight: 90,
                          backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.02)',
                        }}
                        onPress={() => setHyroxStationFocusModalVisible(true)}
                        accessibilityRole="button"
                        accessibilityLabel={t('training.hyroxStationFocusLabel')}
                      >
                        <MaterialCommunityIcons
                          name="dumbbell"
                          size={24}
                          color={SPORT_COLORS[sportType] || themeColors.primary}
                          style={{ marginBottom: 6 }}
                        />
                        <Text
                          style={{
                            fontSize: 10,
                            fontWeight: '600',
                            textTransform: 'uppercase',
                            marginBottom: 6,
                            textAlign: 'center',
                            color: themeColors.textSecondary,
                          }}
                        >
                          {t('training.hyroxStationFocusLabel')}
                        </Text>
                        <Text
                          style={{
                            fontSize: 13,
                            fontWeight: '700',
                            textAlign: 'center',
                            color: hyroxStationFocus ? themeColors.textPrimary : themeColors.textSecondary,
                          }}
                          numberOfLines={1}
                        >
                          {hyroxStationFocus
                            ? getOptionLabel(sportType, hyroxStationFocus, 'hyrox_station_focus')
                            : t('common.select')}
                        </Text>
                      </TouchableOpacity>
                    ) : sportType === 'climbing' ? (
                      <TouchableOpacity
                        style={{
                          flex: 1,
                          padding: 12,
                          borderRadius: 12,
                          borderWidth: 1,
                          borderColor: themeColors.border,
                          alignItems: 'center',
                          justifyContent: 'center',
                          minHeight: 90,
                          backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.02)',
                        }}
                        onPress={() => setClimbingGradeModalVisible(true)}
                        accessibilityRole="button"
                        accessibilityLabel={t('training.gradeLabel')}
                      >
                        <MaterialCommunityIcons
                          name="terrain"
                          size={24}
                          color={SPORT_COLORS[sportType] || themeColors.primary}
                          style={{ marginBottom: 6 }}
                        />
                        <Text
                          style={{
                            fontSize: 10,
                            fontWeight: '600',
                            textTransform: 'uppercase',
                            marginBottom: 6,
                            textAlign: 'center',
                            color: themeColors.textSecondary,
                          }}
                        >
                          {t('training.gradeLabel')}
                        </Text>
                        <Text
                          style={{
                            fontSize: 13,
                            fontWeight: '700',
                            textAlign: 'center',
                            color: climbingGrade ? themeColors.textPrimary : themeColors.textSecondary,
                          }}
                          numberOfLines={1}
                        >
                          {climbingGrade
                            ? getOptionLabel(sportType, climbingGrade, 'climbing_grade')
                            : t('common.select')}
                        </Text>
                      </TouchableOpacity>
                    ) : sportType === VOLLEYBALL_SPORT_TYPE ? null : (
                      <TouchableOpacity
                        style={{
                          flex: 1,
                          padding: 12,
                          borderRadius: 12,
                          borderWidth: 1,
                          borderColor: themeColors.border,
                          alignItems: 'center',
                          justifyContent: 'center',
                          minHeight: 90,
                          backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.02)',
                        }}
                        onPress={() => {
                          if (sportType === 'martial_arts') {
                            setContactLevelModalVisible(true);
                          } else {
                            setSurfaceModalVisible(true);
                          }
                        }}
                        accessibilityRole="button"
                        accessibilityLabel={
                          sportType === 'martial_arts' ? t('training.contactLevelLabel') : t('training.surfaceLabel')
                        }
                      >
                        <MaterialCommunityIcons
                          name={
                            sportType === 'martial_arts'
                              ? 'boxing-glove'
                              : sportType === 'football'
                                ? 'grass'
                                : sportType === 'tennis'
                                  ? 'rhombus-split'
                                  : sportType === 'padel'
                                    ? 'tennis-ball'
                                    : 'image-filter-hdr'
                          }
                          size={24}
                          color={SPORT_COLORS[sportType] || themeColors.primary}
                          style={{ marginBottom: 6 }}
                        />
                        <Text
                          style={{
                            fontSize: 10,
                            fontWeight: '600',
                            textTransform: 'uppercase',
                            marginBottom: 6,
                            textAlign: 'center',
                            color: themeColors.textSecondary,
                          }}
                        >
                          {sportType === 'martial_arts' ? t('training.contactLevelLabel') : t('training.surfaceLabel')}
                        </Text>
                        <Text
                          style={{
                            fontSize: 13,
                            fontWeight: '700',
                            textAlign: 'center',
                            color:
                              sportType === 'martial_arts'
                                ? contactLevel
                                  ? themeColors.textPrimary
                                  : themeColors.textSecondary
                                : surface
                                  ? themeColors.textPrimary
                                  : themeColors.textSecondary,
                          }}
                          numberOfLines={1}
                        >
                          {sportType === 'martial_arts'
                            ? contactLevel
                              ? getOptionLabel(sportType, contactLevel, 'contact_level')
                              : t('common.select')
                            : surface
                              ? getSurfaceDisplayLabel(surface)
                              : t('common.select')}
                        </Text>
                      </TouchableOpacity>
                    )}

                    {/* Col 2: Carga base */}
                    <TouchableOpacity
                      style={{
                        flex: 1,
                        padding: 12,
                        borderRadius: 12,
                        borderWidth: 1,
                        borderColor: themeColors.border,
                        alignItems: 'center',
                        justifyContent: 'center',
                        minHeight: 90,
                        backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.02)',
                      }}
                      onPress={() => setBaseLoadModalVisible(true)}
                      accessibilityRole="button"
                      accessibilityLabel={t('training.loadLabel')}
                    >
                      <MaterialCommunityIcons
                        name="chart-bell-curve-cumulative"
                        size={24}
                        color={SPORT_COLORS[sportType] || themeColors.primary}
                        style={{ marginBottom: 6 }}
                      />
                      <Text
                        style={{
                          fontSize: 10,
                          fontWeight: '600',
                          textTransform: 'uppercase',
                          marginBottom: 6,
                          textAlign: 'center',
                          color: themeColors.textSecondary,
                        }}
                      >
                        {t('training.loadLabel')}
                      </Text>
                      <Text
                        style={{
                          fontSize: 13,
                          fontWeight: '700',
                          textAlign: 'center',
                          color: baseLoad ? themeColors.textPrimary : themeColors.textSecondary,
                        }}
                        numberOfLines={1}
                      >
                        {baseLoad ? getOptionLabel(sportType, baseLoad, 'base_load') : t('common.select')}
                      </Text>
                    </TouchableOpacity>

                    {/* Col 3: Racket/Boots/Board - Coming Soon (if not configured) */}
                    {sportType === TRAIL_SPORT_TYPE && hasTerrainOptions ? (
                      <TouchableOpacity
                        style={{
                          flex: 1,
                          padding: 12,
                          borderRadius: 12,
                          borderWidth: 1,
                          borderColor: themeColors.border,
                          alignItems: 'center',
                          justifyContent: 'center',
                          minHeight: 90,
                          backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.02)',
                        }}
                        onPress={() => setSurfaceModalVisible(true)}
                        accessibilityRole="button"
                        accessibilityLabel={getGroupLabel(sportType, 'terrain')}
                      >
                        <MaterialCommunityIcons
                          name="image-filter-hdr"
                          size={24}
                          color={SPORT_COLORS[sportType] || themeColors.primary}
                          style={{ marginBottom: 6 }}
                        />
                        <Text
                          style={{
                            fontSize: 10,
                            fontWeight: '600',
                            textTransform: 'uppercase',
                            marginBottom: 6,
                            textAlign: 'center',
                            color: themeColors.textSecondary,
                          }}
                        >
                          {getGroupLabel(sportType, 'terrain')}
                        </Text>
                        <Text
                          style={{
                            fontSize: 13,
                            fontWeight: '700',
                            textAlign: 'center',
                            color: surface ? themeColors.textPrimary : themeColors.textSecondary,
                          }}
                          numberOfLines={1}
                        >
                          {surface ? getSurfaceDisplayLabel(surface) : t('common.select')}
                        </Text>
                      </TouchableOpacity>
                    ) : sportType === 'skiing' || sportType === 'snowboard' ? (
                      <TouchableOpacity
                        style={{
                          flex: 1,
                          padding: 12,
                          borderRadius: 12,
                          borderWidth: 1,
                          borderColor: themeColors.border,
                          alignItems: 'center',
                          justifyContent: 'center',
                          minHeight: 90,
                          backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.02)',
                        }}
                        onPress={() => setSlopeTypeModalVisible(true)}
                        accessibilityRole="button"
                        accessibilityLabel={t('training.slopeLabel')}
                      >
                        <MaterialCommunityIcons
                          name="snowflake"
                          size={24}
                          color={SPORT_COLORS[sportType] || themeColors.primary}
                          style={{ marginBottom: 6 }}
                        />
                        <Text
                          style={{
                            fontSize: 10,
                            fontWeight: '600',
                            textTransform: 'uppercase',
                            marginBottom: 6,
                            textAlign: 'center',
                            color: themeColors.textSecondary,
                          }}
                        >
                          {t('training.slopeLabel')}
                        </Text>
                        <Text
                          style={{
                            fontSize: 13,
                            fontWeight: '700',
                            textAlign: 'center',
                            color: slopeType ? themeColors.textPrimary : themeColors.textSecondary,
                          }}
                          numberOfLines={1}
                        >
                          {slopeType ? getOptionLabel(sportType, slopeType, 'slope_type') : t('common.select')}
                        </Text>
                      </TouchableOpacity>
                    ) : sportType === VOLLEYBALL_SPORT_TYPE ||
                      sportType === GOLF_SPORT_TYPE ||
                      sportType === HYROX_SPORT_TYPE ? null : sportType === 'surf' ? (
                      <TouchableOpacity
                        style={{
                          flex: 1,
                          padding: 12,
                          borderRadius: 12,
                          borderWidth: 1,
                          borderColor: themeColors.border,
                          alignItems: 'center',
                          justifyContent: 'center',
                          minHeight: 90,
                          backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.02)',
                        }}
                        onPress={() => setBoardModalVisible(true)}
                        accessibilityRole="button"
                        accessibilityLabel={t('training.boardLabel')}
                      >
                        <MaterialCommunityIcons
                          name="surfing"
                          size={24}
                          color={SPORT_COLORS[sportType] || themeColors.primary}
                          style={{ marginBottom: 6 }}
                        />
                        <Text
                          style={{
                            fontSize: 10,
                            fontWeight: '600',
                            textTransform: 'uppercase',
                            marginBottom: 6,
                            textAlign: 'center',
                            color: themeColors.textSecondary,
                          }}
                        >
                          {t('training.boardLabel')}
                        </Text>
                        <Text
                          style={{
                            fontSize: 13,
                            fontWeight: '700',
                            textAlign: 'center',
                            color: board ? themeColors.textPrimary : themeColors.textSecondary,
                          }}
                          numberOfLines={1}
                        >
                          {board ? getOptionLabel(sportType, board, 'board') : t('common.select')}
                        </Text>
                      </TouchableOpacity>
                    ) : (
                      <View
                        style={{
                          flex: 1,
                          padding: 12,
                          borderRadius: 12,
                          borderWidth: 1,
                          borderColor: themeColors.border,
                          alignItems: 'center',
                          justifyContent: 'center',
                          minHeight: 90,
                          opacity: 0.5,
                          backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.02)',
                        }}
                      >
                        <MaterialCommunityIcons
                          name={
                            sportType === 'tennis'
                              ? 'tennis'
                              : sportType === 'padel'
                                ? 'tennis-ball'
                                : sportType === 'hiking'
                                  ? 'shoe-sneaker'
                                  : sportType === 'martial_arts'
                                    ? 'boxing-glove'
                                    : sportType === 'climbing'
                                      ? 'carabiner'
                                      : 'shoe-cleat'
                          }
                          size={24}
                          color={SPORT_COLORS[sportType] || themeColors.primary}
                          style={{ marginBottom: 6 }}
                        />
                        <Text
                          style={{
                            fontSize: 10,
                            fontWeight: '600',
                            textTransform: 'uppercase',
                            marginBottom: 6,
                            textAlign: 'center',
                            color: themeColors.textSecondary,
                          }}
                        >
                          {sportType === 'tennis'
                            ? t('training.racketLabel')
                            : sportType === 'padel'
                              ? t('training.palaLabel')
                              : sportType === 'hiking'
                                ? t('training.shoesLabel')
                                : sportType === 'martial_arts'
                                  ? t('training.materialLabel')
                                  : sportType === 'climbing'
                                    ? t('training.materialLabel')
                                    : t('training.bootsLabel')}
                        </Text>
                        <Text
                          style={{
                            fontSize: 13,
                            fontWeight: '700',
                            textAlign: 'center',
                            color: themeColors.textSecondary,
                          }}
                          numberOfLines={1}
                        >
                          {t('training.comingSoon')}
                        </Text>
                      </View>
                    )}
                  </View>
                </GlassCard>
              )}

              {structuredSport && !isWideLayout && (
                <View style={styles.compactSummary}>{renderTemplateSummary(sportType)}</View>
              )}

              {!structuredSport &&
                sportType !== 'football' &&
                sportType !== 'tennis' &&
                sportType !== 'padel' &&
                sportType !== 'hiking' &&
                sportType !== 'martial_arts' &&
                sportType !== 'climbing' &&
                sportType !== VOLLEYBALL_SPORT_TYPE &&
                sportType !== TRAIL_SPORT_TYPE &&
                sportType !== 'surf' &&
                sportType !== 'skiing' &&
                sportType !== 'snowboard' &&
                sportType !== GOLF_SPORT_TYPE &&
                !isWideLayout && <View style={styles.compactSummary}>{renderTemplateSummary(sportType)}</View>}

              {/* Block 3: Configuración */}
              {((hasTerrainOptions &&
                sportType !== 'football' &&
                sportType !== 'tennis' &&
                sportType !== 'padel' &&
                sportType !== 'hiking' &&
                sportType !== 'martial_arts' &&
                sportType !== 'climbing' &&
                sportType !== VOLLEYBALL_SPORT_TYPE &&
                sportType !== TRAIL_SPORT_TYPE &&
                sportType !== 'surf' &&
                sportType !== 'skiing' &&
                sportType !== 'snowboard' &&
                sportType !== GOLF_SPORT_TYPE) ||
                sportType === 'swimming') && (
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
                    onToggleRecurring={() => {
                      const nextRecurring = !isRecurring;
                      setIsRecurring(nextRecurring);
                      if (!nextRecurring) {
                        setRecurrenceWeeks('');
                        const isImportedDateDrivenTemplate =
                          existingTemplate?.source === 'imported' &&
                          existingTemplate.scheduled_day === null &&
                          !!existingTemplate.recurrence_start_date &&
                          !!existingTemplate.recurrence_end_date;
                        if (!isEditMode || !isImportedDateDrivenTemplate) {
                          setRecurrenceStartDate(null);
                          setStepProgressions([]);
                        }
                        setProgressionPicker(null);
                      } else if (!recurrenceWeeks) {
                        setRecurrenceWeeks('2');
                      }
                    }}
                    singleSelect={true}
                  />

                  {isRecurring && (
                    <>
                      {/* Start Date */}
                      <View style={styles.formRow}>
                        <View style={styles.recurrenceEndLabel}>
                          <Calendar size={16} color={themeColors.textSecondary} />
                          <Text style={[styles.rowLabel, { color: themeColors.textPrimary }]}>
                            {t('training.startDate')}
                          </Text>
                        </View>
                        {Platform.OS === 'web' ? (
                          <TextInput
                            style={[styles.rowInput, { color: themeColors.textPrimary }]}
                            value={recurrenceStartDate || ''}
                            onChangeText={setRecurrenceStartDate}
                            placeholder="YYYY-MM-DD"
                            placeholderTextColor={themeColors.textSecondary}
                            textAlign="right"
                          />
                        ) : (
                          <TouchableOpacity
                            style={styles.rowRightValue}
                            onPress={() => setShowRecurrenceStartPicker(true)}
                            accessibilityRole="button"
                            accessibilityLabel={t('training.startDate')}
                          >
                            <Text
                              style={[
                                styles.rowValueText,
                                { color: recurrenceStartDate ? themeColors.textPrimary : themeColors.textSecondary },
                              ]}
                            >
                              {recurrenceStartDate
                                ? format(new Date(`${recurrenceStartDate}T00:00:00`), 'dd/MM/yyyy')
                                : t('common.select')}
                            </Text>
                            <ChevronRight size={16} color={themeColors.textSecondary} style={{ marginLeft: 4 }} />
                          </TouchableOpacity>
                        )}
                      </View>

                      {/* Weeks Duration */}
                      <View style={[styles.formRow, { borderBottomWidth: 0 }]}>
                        <View style={styles.recurrenceEndLabel}>
                          <Clock size={16} color={themeColors.textSecondary} />
                          <Text style={[styles.rowLabel, { color: themeColors.textPrimary }]}>
                            {t('training.recurrenceWeeks')}
                          </Text>
                        </View>
                        <TextInput
                          style={[
                            styles.rowInput,
                            { color: themeColors.textPrimary, textAlign: 'right', flex: 1, paddingRight: 4 },
                          ]}
                          value={recurrenceWeeks}
                          onChangeText={val => {
                            const filtered = val.replace(/[^0-9]/g, '');
                            setRecurrenceWeeks(filtered);
                          }}
                          placeholder={t('training.indefinite') || 'Indefinida'}
                          placeholderTextColor={themeColors.textSecondary}
                          keyboardType="number-pad"
                        />
                      </View>

                      {/* Calculated End Date Summary */}
                      {recurrenceEndDate !== '' && (
                        <View style={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: 12 }}>
                          <Text style={{ fontSize: 13, color: themeColors.textSecondary, fontStyle: 'italic' }}>
                            {t('training.recurrenceEndDateCalculated', {
                              date: format(new Date(`${recurrenceEndDate}T00:00:00`), 'dd/MM/yyyy'),
                            })}
                          </Text>
                        </View>
                      )}
                      <View style={styles.lifecycleToggleRow}>
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.lifecycleToggleLabel, { color: themeColors.textPrimary }]}>
                            {t('training.autoDeleteExpiredTemplates')}
                          </Text>
                          <Text style={[styles.lifecycleToggleDescription, { color: themeColors.textSecondary }]}>
                            {t('training.autoDeleteExpiredTemplatesDesc')}
                          </Text>
                        </View>
                        <AlzanSwitch value={autoDeleteAfterEnd} onValueChange={setAutoDeleteAfterEnd} />
                      </View>
                    </>
                  )}
                  {!isRecurring && (
                    <>
                      <View style={styles.formRow}>
                        <View style={styles.recurrenceEndLabel}>
                          <Calendar size={16} color={themeColors.textSecondary} />
                          <Text style={[styles.rowLabel, { color: themeColors.textPrimary }]}>
                            {t('training.templateEndDate')}
                          </Text>
                        </View>
                        <TextInput
                          style={[styles.rowInput, { color: themeColors.textPrimary }]}
                          value={recurrenceEndDate}
                          onChangeText={setRecurrenceEndDate}
                          placeholder="YYYY-MM-DD"
                          placeholderTextColor={themeColors.textSecondary}
                          textAlign="right"
                        />
                      </View>
                      <View style={styles.lifecycleToggleRow}>
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.lifecycleToggleLabel, { color: themeColors.textPrimary }]}>
                            {t('training.autoDeleteExpiredTemplates')}
                          </Text>
                          <Text style={[styles.lifecycleToggleDescription, { color: themeColors.textSecondary }]}>
                            {t('training.autoDeleteExpiredTemplatesDesc')}
                          </Text>
                        </View>
                        <AlzanSwitch value={autoDeleteAfterEnd} onValueChange={setAutoDeleteAfterEnd} />
                      </View>
                    </>
                  )}
                </View>
              </GlassCard>

              {renderProgressionEditor()}
            </ScrollView>

            {isWideLayout && showSummary && (
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
                        : sportType === HYROX_SPORT_TYPE
                          ? t('constants.hyrox')
                          : t('constants.running')}
                    .
                  </Text>
                  {sportType === HYROX_SPORT_TYPE && (
                    <TouchableOpacity
                      style={[styles.fullFormatButton, { backgroundColor: themeColors.primary }]}
                      onPress={handleAddHyroxFullFormat}
                      accessibilityRole="button"
                      accessibilityLabel={t('training.hyroxAddFullFormat')}
                    >
                      <Zap size={18} color="#FFF" />
                      <Text style={styles.fullFormatButtonText}>{t('training.hyroxAddFullFormat')}</Text>
                    </TouchableOpacity>
                  )}
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

                {sportType === HYROX_SPORT_TYPE ? (
                  <TouchableOpacity
                    style={[styles.addRepButton, dynamicStyles.secondaryButton]}
                    onPress={handleAddHyroxFullFormat}
                    accessibilityRole="button"
                    accessibilityLabel={t('training.hyroxFullFormat')}
                  >
                    <Zap size={20} color={themeColors.primary} />
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    style={[styles.addRepButton, dynamicStyles.secondaryButton]}
                    onPress={handleAddGroup}
                    accessibilityRole="button"
                    accessibilityLabel={t('training.repetitions')}
                  >
                    <Repeat size={20} color={themeColors.primary} />
                  </TouchableOpacity>
                )}
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

        {renderProgressionPickerModal()}

        {showRecurrenceStartPicker && Platform.OS !== 'web' && (
          <DateTimePicker
            value={
              recurrenceStartDate
                ? new Date(`${recurrenceStartDate}T00:00:00`)
                : new Date(`${effectiveRecurrenceStartDate || format(new Date(), 'yyyy-MM-dd')}T00:00:00`)
            }
            mode="date"
            display="default"
            onChange={(_event, selectedDate) => {
              setShowRecurrenceStartPicker(false);
              if (selectedDate) {
                setRecurrenceStartDate(format(selectedDate, 'yyyy-MM-dd'));
              }
            }}
          />
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
                  const isSelected = trainingGoal === goal.key;

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
                          setTrainingGoal(goal.key);
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
                          {goal.title}
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
                {poolTypeOptions.map(opt => {
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
                {strokeOptions.map(opt => {
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

        {/* Contact Level Selector Modal */}
        <Modal
          animationType={isWideLayout ? 'fade' : 'slide'}
          transparent={true}
          visible={contactLevelModalVisible}
          onRequestClose={() => setContactLevelModalVisible(false)}
        >
          <Pressable
            style={[styles.modalOverlay, isWideLayout && styles.modalOverlayWide]}
            onPress={() => setContactLevelModalVisible(false)}
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
                {t('training.contactLevelLabel')}
              </Text>

              <ScrollView style={styles.goalsScroll} showsVerticalScrollIndicator={false}>
                {contactLevelOptions.map(opt => {
                  const isSelected = contactLevel === opt.option_key;
                  return (
                    <TouchableOpacity
                      key={opt.option_key}
                      style={[
                        styles.surfaceOptionRow,
                        isSelected && { backgroundColor: themeColors.primary + '15', borderColor: themeColors.primary },
                      ]}
                      onPress={() => {
                        setContactLevel(opt.option_key);
                        setContactLevelModalVisible(false);
                      }}
                    >
                      <Text
                        style={[
                          styles.surfaceOptionText,
                          { color: themeColors.textPrimary },
                          isSelected && { color: themeColors.primary },
                        ]}
                      >
                        {getOptionLabel(sportType, opt.option_key, 'contact_level')}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              <View style={styles.modalActionRow}>
                <TouchableOpacity
                  style={[styles.modalActionBtn, styles.cancelActionBtn, { borderColor: themeColors.border, flex: 1 }]}
                  onPress={() => setContactLevelModalVisible(false)}
                >
                  <Text style={[styles.cancelActionBtnText, { color: themeColors.textPrimary }]}>
                    {t('common.cancel')}
                  </Text>
                </TouchableOpacity>
              </View>
            </Pressable>
          </Pressable>
        </Modal>

        {/* Base Load Selector Modal */}
        <Modal
          animationType={isWideLayout ? 'fade' : 'slide'}
          transparent={true}
          visible={baseLoadModalVisible}
          onRequestClose={() => setBaseLoadModalVisible(false)}
        >
          <Pressable
            style={[styles.modalOverlay, isWideLayout && styles.modalOverlayWide]}
            onPress={() => setBaseLoadModalVisible(false)}
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
              <Text style={[styles.modalTitle, { color: themeColors.textPrimary }]}>{t('training.loadLabel')}</Text>

              <ScrollView style={styles.goalsScroll} showsVerticalScrollIndicator={false}>
                {baseLoadOptions.map(opt => {
                  const isSelected = baseLoad === opt.option_key;
                  return (
                    <TouchableOpacity
                      key={opt.option_key}
                      style={[
                        styles.surfaceOptionRow,
                        isSelected && { backgroundColor: themeColors.primary + '15', borderColor: themeColors.primary },
                      ]}
                      onPress={() => {
                        setBaseLoad(opt.option_key);
                        setBaseLoadModalVisible(false);
                      }}
                    >
                      <Text
                        style={[
                          styles.surfaceOptionText,
                          { color: themeColors.textPrimary },
                          isSelected && { color: themeColors.primary },
                        ]}
                      >
                        {getOptionLabel(sportType, opt.option_key, 'base_load')}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              <View style={styles.modalActionRow}>
                <TouchableOpacity
                  style={[styles.modalActionBtn, styles.cancelActionBtn, { borderColor: themeColors.border, flex: 1 }]}
                  onPress={() => setBaseLoadModalVisible(false)}
                >
                  <Text style={[styles.cancelActionBtnText, { color: themeColors.textPrimary }]}>
                    {t('common.cancel')}
                  </Text>
                </TouchableOpacity>
              </View>
            </Pressable>
          </Pressable>
        </Modal>

        {/* Climbing Grade Modal */}
        <Modal
          animationType={isWideLayout ? 'fade' : 'slide'}
          transparent={true}
          visible={climbingGradeModalVisible}
          onRequestClose={() => setClimbingGradeModalVisible(false)}
        >
          <Pressable
            style={[styles.modalOverlay, isWideLayout && styles.modalOverlayWide]}
            onPress={() => setClimbingGradeModalVisible(false)}
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
              <Text style={[styles.modalTitle, { color: themeColors.textPrimary }]}>{t('training.gradeLabel')}</Text>

              <ScrollView style={styles.goalsScroll} showsVerticalScrollIndicator={false}>
                {climbingGradeOptions.map(opt => {
                  const isSelected = climbingGrade === opt.option_key;
                  return (
                    <TouchableOpacity
                      key={opt.option_key}
                      style={[
                        styles.surfaceOptionRow,
                        isSelected && { backgroundColor: themeColors.primary + '15', borderColor: themeColors.primary },
                      ]}
                      onPress={() => {
                        setClimbingGrade(opt.option_key);
                        setClimbingGradeModalVisible(false);
                      }}
                    >
                      <Text
                        style={[
                          styles.surfaceOptionText,
                          { color: themeColors.textPrimary },
                          isSelected && { color: themeColors.primary },
                        ]}
                      >
                        {getOptionLabel(sportType, opt.option_key, 'climbing_grade')}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              <View style={styles.modalActionRow}>
                <TouchableOpacity
                  style={[styles.modalActionBtn, styles.cancelActionBtn, { borderColor: themeColors.border, flex: 1 }]}
                  onPress={() => setClimbingGradeModalVisible(false)}
                >
                  <Text style={[styles.cancelActionBtnText, { color: themeColors.textPrimary }]}>
                    {t('common.cancel')}
                  </Text>
                </TouchableOpacity>
              </View>
            </Pressable>
          </Pressable>
        </Modal>

        {/* Wetsuit Modal */}
        <Modal
          animationType={isWideLayout ? 'fade' : 'slide'}
          transparent={true}
          visible={wetsuitModalVisible}
          onRequestClose={() => setWetsuitModalVisible(false)}
        >
          <Pressable
            style={[styles.modalOverlay, isWideLayout && styles.modalOverlayWide]}
            onPress={() => setWetsuitModalVisible(false)}
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
              <Text style={[styles.modalTitle, { color: themeColors.textPrimary }]}>{t('training.wetsuitLabel')}</Text>

              <ScrollView style={styles.goalsScroll} showsVerticalScrollIndicator={false}>
                {wetsuitOptions.map(opt => {
                  const isSelected = wetsuit === opt.option_key;
                  return (
                    <TouchableOpacity
                      key={opt.option_key}
                      style={[
                        styles.surfaceOptionRow,
                        isSelected && { backgroundColor: themeColors.primary + '15', borderColor: themeColors.primary },
                      ]}
                      onPress={() => {
                        setWetsuit(opt.option_key);
                        setWetsuitModalVisible(false);
                      }}
                    >
                      <Text
                        style={[
                          styles.surfaceOptionText,
                          { color: themeColors.textPrimary },
                          isSelected && { color: themeColors.primary },
                        ]}
                      >
                        {getOptionLabel(sportType, opt.option_key, 'wetsuit')}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              <View style={styles.modalActionRow}>
                <TouchableOpacity
                  style={[styles.modalActionBtn, styles.cancelActionBtn, { borderColor: themeColors.border, flex: 1 }]}
                  onPress={() => setWetsuitModalVisible(false)}
                >
                  <Text style={[styles.cancelActionBtnText, { color: themeColors.textPrimary }]}>
                    {t('common.cancel')}
                  </Text>
                </TouchableOpacity>
              </View>
            </Pressable>
          </Pressable>
        </Modal>

        {/* Board Modal */}
        <Modal
          animationType={isWideLayout ? 'fade' : 'slide'}
          transparent={true}
          visible={boardModalVisible}
          onRequestClose={() => setBoardModalVisible(false)}
        >
          <Pressable
            style={[styles.modalOverlay, isWideLayout && styles.modalOverlayWide]}
            onPress={() => setBoardModalVisible(false)}
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
              <Text style={[styles.modalTitle, { color: themeColors.textPrimary }]}>{t('training.boardLabel')}</Text>

              <ScrollView style={styles.goalsScroll} showsVerticalScrollIndicator={false}>
                {boardOptions.map(opt => {
                  const isSelected = board === opt.option_key;
                  return (
                    <TouchableOpacity
                      key={opt.option_key}
                      style={[
                        styles.surfaceOptionRow,
                        isSelected && { backgroundColor: themeColors.primary + '15', borderColor: themeColors.primary },
                      ]}
                      onPress={() => {
                        setBoard(opt.option_key);
                        setBoardModalVisible(false);
                      }}
                    >
                      <Text
                        style={[
                          styles.surfaceOptionText,
                          { color: themeColors.textPrimary },
                          isSelected && { color: themeColors.primary },
                        ]}
                      >
                        {getOptionLabel(sportType, opt.option_key, 'board')}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              <View style={styles.modalActionRow}>
                <TouchableOpacity
                  style={[styles.modalActionBtn, styles.cancelActionBtn, { borderColor: themeColors.border, flex: 1 }]}
                  onPress={() => setBoardModalVisible(false)}
                >
                  <Text style={[styles.cancelActionBtnText, { color: themeColors.textPrimary }]}>
                    {t('common.cancel')}
                  </Text>
                </TouchableOpacity>
              </View>
            </Pressable>
          </Pressable>
        </Modal>

        {/* Ski Type Selector Modal */}
        <Modal
          animationType={isWideLayout ? 'fade' : 'slide'}
          transparent={true}
          visible={skiTypeModalVisible}
          onRequestClose={() => setSkiTypeModalVisible(false)}
        >
          <Pressable
            style={[styles.modalOverlay, isWideLayout && styles.modalOverlayWide]}
            onPress={() => setSkiTypeModalVisible(false)}
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
              <Text style={[styles.modalTitle, { color: themeColors.textPrimary }]}>{t('training.skiLabel')}</Text>

              <ScrollView style={styles.goalsScroll} showsVerticalScrollIndicator={false}>
                {skiTypeOptions.map(opt => {
                  const isSelected = skiType === opt.option_key;
                  return (
                    <TouchableOpacity
                      key={opt.option_key}
                      style={[
                        styles.surfaceOptionRow,
                        isSelected && { backgroundColor: themeColors.primary + '15', borderColor: themeColors.primary },
                      ]}
                      onPress={() => {
                        setSkiType(opt.option_key);
                        setSkiTypeModalVisible(false);
                      }}
                    >
                      <Text
                        style={[
                          styles.surfaceOptionText,
                          { color: themeColors.textPrimary },
                          isSelected && { color: themeColors.primary },
                        ]}
                      >
                        {getOptionLabel(sportType, opt.option_key, 'ski_type')}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              <View style={styles.modalActionRow}>
                <TouchableOpacity
                  style={[styles.modalActionBtn, styles.cancelActionBtn, { borderColor: themeColors.border, flex: 1 }]}
                  onPress={() => setSkiTypeModalVisible(false)}
                >
                  <Text style={[styles.cancelActionBtnText, { color: themeColors.textPrimary }]}>
                    {t('common.cancel')}
                  </Text>
                </TouchableOpacity>
              </View>
            </Pressable>
          </Pressable>
        </Modal>

        {/* Snowboard Type Selector Modal */}
        <Modal
          animationType={isWideLayout ? 'fade' : 'slide'}
          transparent={true}
          visible={snowboardTypeModalVisible}
          onRequestClose={() => setSnowboardTypeModalVisible(false)}
        >
          <Pressable
            style={[styles.modalOverlay, isWideLayout && styles.modalOverlayWide]}
            onPress={() => setSnowboardTypeModalVisible(false)}
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
                {t('training.snowboardLabel')}
              </Text>

              <ScrollView style={styles.goalsScroll} showsVerticalScrollIndicator={false}>
                {snowboardTypeOptions.map(opt => {
                  const isSelected = snowboardType === opt.option_key;
                  return (
                    <TouchableOpacity
                      key={opt.option_key}
                      style={[
                        styles.surfaceOptionRow,
                        isSelected && { backgroundColor: themeColors.primary + '15', borderColor: themeColors.primary },
                      ]}
                      onPress={() => {
                        setSnowboardType(opt.option_key);
                        setSnowboardTypeModalVisible(false);
                      }}
                    >
                      <Text
                        style={[
                          styles.surfaceOptionText,
                          { color: themeColors.textPrimary },
                          isSelected && { color: themeColors.primary },
                        ]}
                      >
                        {getOptionLabel(sportType, opt.option_key, 'snowboard_type')}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              <View style={styles.modalActionRow}>
                <TouchableOpacity
                  style={[styles.modalActionBtn, styles.cancelActionBtn, { borderColor: themeColors.border, flex: 1 }]}
                  onPress={() => setSnowboardTypeModalVisible(false)}
                >
                  <Text style={[styles.cancelActionBtnText, { color: themeColors.textPrimary }]}>
                    {t('common.cancel')}
                  </Text>
                </TouchableOpacity>
              </View>
            </Pressable>
          </Pressable>
        </Modal>

        {/* Golf Club Focus Selector Modal */}
        <Modal
          animationType={isWideLayout ? 'fade' : 'slide'}
          transparent={true}
          visible={golfClubFocusModalVisible}
          onRequestClose={() => setGolfClubFocusModalVisible(false)}
        >
          <Pressable
            style={[styles.modalOverlay, isWideLayout && styles.modalOverlayWide]}
            onPress={() => setGolfClubFocusModalVisible(false)}
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
                {t('training.golfClubFocusLabel')}
              </Text>

              <ScrollView style={styles.goalsScroll} showsVerticalScrollIndicator={false}>
                {golfClubFocusOptions.map(opt => {
                  const isSelected = golfClubFocus === opt.option_key;
                  return (
                    <TouchableOpacity
                      key={opt.option_key}
                      style={[
                        styles.surfaceOptionRow,
                        isSelected && { backgroundColor: themeColors.primary + '15', borderColor: themeColors.primary },
                      ]}
                      onPress={() => {
                        setGolfClubFocus(opt.option_key);
                        setGolfClubFocusModalVisible(false);
                      }}
                    >
                      <Text
                        style={[
                          styles.surfaceOptionText,
                          { color: themeColors.textPrimary },
                          isSelected && { color: themeColors.primary },
                        ]}
                      >
                        {getOptionLabel(sportType, opt.option_key, 'golf_club_focus')}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              <View style={styles.modalActionRow}>
                <TouchableOpacity
                  style={[styles.modalActionBtn, styles.cancelActionBtn, { borderColor: themeColors.border, flex: 1 }]}
                  onPress={() => setGolfClubFocusModalVisible(false)}
                >
                  <Text style={[styles.cancelActionBtnText, { color: themeColors.textPrimary }]}>
                    {t('common.cancel')}
                  </Text>
                </TouchableOpacity>
              </View>
            </Pressable>
          </Pressable>
        </Modal>

        {/* HYROX Station Focus Selector Modal */}
        <Modal
          animationType={isWideLayout ? 'fade' : 'slide'}
          transparent={true}
          visible={hyroxStationFocusModalVisible}
          onRequestClose={() => setHyroxStationFocusModalVisible(false)}
        >
          <Pressable
            style={[styles.modalOverlay, isWideLayout && styles.modalOverlayWide]}
            onPress={() => setHyroxStationFocusModalVisible(false)}
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
                {t('training.hyroxStationFocusLabel')}
              </Text>

              <ScrollView style={styles.goalsScroll} showsVerticalScrollIndicator={false}>
                {hyroxStationFocusOptions.map(opt => {
                  const isSelected = hyroxStationFocus === opt.option_key;
                  return (
                    <TouchableOpacity
                      key={opt.option_key}
                      style={[
                        styles.surfaceOptionRow,
                        isSelected && { backgroundColor: themeColors.primary + '15', borderColor: themeColors.primary },
                      ]}
                      onPress={() => {
                        setHyroxStationFocus(opt.option_key);
                        setHyroxStationFocusModalVisible(false);
                      }}
                    >
                      <Text
                        style={[
                          styles.surfaceOptionText,
                          { color: themeColors.textPrimary },
                          isSelected && { color: themeColors.primary },
                        ]}
                      >
                        {getOptionLabel(sportType, opt.option_key, 'hyrox_station_focus')}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              <View style={styles.modalActionRow}>
                <TouchableOpacity
                  style={[styles.modalActionBtn, styles.cancelActionBtn, { borderColor: themeColors.border, flex: 1 }]}
                  onPress={() => setHyroxStationFocusModalVisible(false)}
                >
                  <Text style={[styles.cancelActionBtnText, { color: themeColors.textPrimary }]}>
                    {t('common.cancel')}
                  </Text>
                </TouchableOpacity>
              </View>
            </Pressable>
          </Pressable>
        </Modal>

        {/* Slope Type Selector Modal */}
        <Modal
          animationType={isWideLayout ? 'fade' : 'slide'}
          transparent={true}
          visible={slopeTypeModalVisible}
          onRequestClose={() => setSlopeTypeModalVisible(false)}
        >
          <Pressable
            style={[styles.modalOverlay, isWideLayout && styles.modalOverlayWide]}
            onPress={() => setSlopeTypeModalVisible(false)}
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
              <Text style={[styles.modalTitle, { color: themeColors.textPrimary }]}>{t('training.slopeLabel')}</Text>

              <ScrollView style={styles.goalsScroll} showsVerticalScrollIndicator={false}>
                {slopeTypeOptions.map(opt => {
                  const isSelected = slopeType === opt.option_key;
                  return (
                    <TouchableOpacity
                      key={opt.option_key}
                      style={[
                        styles.surfaceOptionRow,
                        isSelected && { backgroundColor: themeColors.primary + '15', borderColor: themeColors.primary },
                      ]}
                      onPress={() => {
                        setSlopeType(opt.option_key);
                        setSlopeTypeModalVisible(false);
                      }}
                    >
                      <Text
                        style={[
                          styles.surfaceOptionText,
                          { color: themeColors.textPrimary },
                          isSelected && { color: themeColors.primary },
                        ]}
                      >
                        {getOptionLabel(sportType, opt.option_key, 'slope_type')}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              <View style={styles.modalActionRow}>
                <TouchableOpacity
                  style={[styles.modalActionBtn, styles.cancelActionBtn, { borderColor: themeColors.border, flex: 1 }]}
                  onPress={() => setSlopeTypeModalVisible(false)}
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
        {sportType === HYROX_SPORT_TYPE ? (
          <HyroxStepEditorModal
            visible={modalVisible}
            initialStep={editingStep as BuilderStep | null}
            stationOptions={hyroxStationFocusOptions}
            getStationLabel={key => getOptionLabel(HYROX_SPORT_TYPE, key, 'hyrox_station_focus')}
            onSave={handleSaveStep}
            onCancel={() => {
              setModalVisible(false);
              setActiveGroupId(null);
            }}
          />
        ) : (
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
        )}

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
  fullFormatButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.s,
    borderRadius: borderRadius.full,
    paddingVertical: spacing.m,
    paddingHorizontal: spacing.l,
    marginTop: spacing.l,
  },
  fullFormatButtonText: { ...typography.button, color: '#FFFFFF' },
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
  recurrenceEndLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  lifecycleToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.m,
    paddingHorizontal: spacing.m,
    paddingVertical: spacing.m,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(128,128,128,0.18)',
  },
  lifecycleToggleLabel: {
    fontSize: 14,
    fontWeight: '700',
  },
  lifecycleToggleDescription: {
    fontSize: 12,
    lineHeight: 16,
    marginTop: 3,
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
  progressionWeekCard: {
    borderWidth: 1,
    borderRadius: borderRadius.m,
    padding: spacing.m,
    marginBottom: spacing.m,
  },
  progressionWeekHeader: {
    marginBottom: spacing.s,
  },
  progressionWeekLabel: {
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  progressionWeekStepBlock: {
    marginTop: spacing.s,
    gap: spacing.xs,
  },
  progressionWeekStepHeader: {
    gap: 2,
  },
  progressionWeekStepTitle: {
    fontSize: 14,
    fontWeight: '800',
  },
  progressionWeekStepMeta: {
    fontSize: 12,
  },
  progressionWeekControls: {
    flex: 1,
    gap: spacing.xs,
  },
  progressionValueButton: {
    flex: 1,
    minHeight: 44,
    borderWidth: 1,
    borderRadius: borderRadius.m,
    paddingHorizontal: spacing.m,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.s,
  },
  progressionValueTextGroup: {
    flex: 1,
    gap: 2,
  },
  progressionValueLabel: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  progressionValueText: {
    fontSize: 14,
    fontWeight: '600',
  },
  progressionPickerLabel: {
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: spacing.m,
  },
  progressionPickerWheelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.m,
    minHeight: 158,
  },
  progressionPickerSeparator: {
    fontSize: 26,
    fontWeight: '800',
    marginBottom: 8,
  },
  progressionPickerUnit: {
    fontSize: 14,
    fontWeight: '700',
    minWidth: 28,
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
