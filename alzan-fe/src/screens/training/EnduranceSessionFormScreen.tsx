import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  ScrollView,
  TouchableOpacity,
  Platform,
  Modal,
  ActivityIndicator,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { TrainingScreenNavigationProp, TrainingStackParamList } from '../../types/navigation.types';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, spacing, typography, borderRadius } from '../../theme';
import { SimpleWheelPicker } from '../../components/SimpleWheelPicker';
import { useTrainingStyles } from '../../hooks/useTrainingStyles';
import { useEnduranceSessions } from '../../hooks/useEnduranceSessions';
import { useUserPreferences } from '../../hooks/useUserPreferences';
import { useUserProfile } from '../../hooks/useUserProfile';
import { useUnitConversion } from '../../hooks/useUnitConversion';
import { usePickPolyline } from '../../hooks/useActivityPolyline';
import { estimateCalories } from '../../utils/caloriesEstimator';
import { supabase } from '../../lib/supabaseClient';
import { format } from 'date-fns';
import { Route, Upload } from 'lucide-react-native';
import { useAuth } from '../../context/AuthContext';
import { useApplyStrengthActivityImport, usePickStrengthActivityImport } from '../../hooks/useStrengthActivityImport';
import { useSessionImportedStrengthSummary } from '../../hooks/useSessionImportedStrengthSummary';
import {
  ImportedStrengthActivitySummary,
  STRENGTH_ACTIVITY_UNSUPPORTED_ERROR_TAG,
} from '../../services/strengthActivityImportService';
import {
  type RouteImportDetails,
  type RouteImportDistanceSplitBucket,
  type RouteImportLap,
  type RouteImportSummary,
} from '../../services/mapService';

import { SPORTS_CONFIG } from '../../constants/sports';
import {
  ActivityHeartRateZoneInsert,
  ActivityLap,
  ActivityLapInsert,
  ActivitySessionInsert,
  ActivitySessionUpdate,
  EnduranceWorkoutStep,
  EnduranceWorkoutTemplate,
  SportType,
} from '../../types/requests.types';
import { Alert } from '../../components/common/Alert';
import { RouteMap } from '../../components/common/RouteMap';
import { useTranslation } from 'react-i18next';

export type PopulatedEnduranceWorkoutTemplate = EnduranceWorkoutTemplate & { steps: EnduranceWorkoutStep[] };

interface SplitTab {
  key: string;
  label: string;
  splitGroup: 'custom' | 'distance';
  splitDistanceM: number | null;
  laps: RouteImportLap[];
}

function getDistanceSplitBuckets(details: RouteImportDetails | null): RouteImportDistanceSplitBucket[] {
  if (!details) return [];

  if (details.distanceSplits.length > 0) {
    return details.distanceSplits
      .filter(bucket => bucket.laps.length > 0)
      .sort((a, b) => a.splitDistanceM - b.splitDistanceM);
  }

  const legacyBuckets: RouteImportDistanceSplitBucket[] = [];

  if (details.splits1k.length > 0) {
    legacyBuckets.push({ splitDistanceM: 1000, laps: details.splits1k });
  }
  if (details.splits5k.length > 0) {
    legacyBuckets.push({ splitDistanceM: 5000, laps: details.splits5k });
  }
  if (details.splits10k.length > 0) {
    legacyBuckets.push({ splitDistanceM: 10000, laps: details.splits10k });
  }

  return legacyBuckets.sort((a, b) => a.splitDistanceM - b.splitDistanceM);
}

function areCloseValues(a: number, b: number, tolerance: number): boolean {
  return Math.abs(a - b) <= tolerance;
}

function areEquivalentLaps(left: RouteImportLap[], right: RouteImportLap[]): boolean {
  if (left.length !== right.length || left.length === 0) return false;

  return left.every((leftLap, index) => {
    const rightLap = right[index];
    if (!rightLap) return false;

    const distanceMatches = areCloseValues(leftLap.distanceM, rightLap.distanceM, 10);

    const leftDuration = leftLap.durationSeconds;
    const rightDuration = rightLap.durationSeconds;
    const durationMatches =
      leftDuration == null && rightDuration == null
        ? true
        : leftDuration != null && rightDuration != null
          ? areCloseValues(leftDuration, rightDuration, 2)
          : false;

    return distanceMatches && durationMatches;
  });
}

function inferRegularAutoSplitDistance(customSplits: RouteImportLap[]): number | null {
  if (customSplits.length < 2) return null;

  const candidateDistances = [1000, 5000, 10000, 15000, 20000];
  const distances = customSplits
    .map(split => split.distanceM)
    .filter(distance => Number.isFinite(distance) && distance > 0);
  if (distances.length !== customSplits.length) return null;

  for (const candidate of candidateDistances) {
    let nearTarget = 0;
    let shortRemainders = 0;

    distances.forEach((distance, index) => {
      if (areCloseValues(distance, candidate, 120)) {
        nearTarget += 1;
        return;
      }

      const isLast = index === distances.length - 1;
      if (isLast && distance < candidate - 120 && distance > 0) {
        shortRemainders += 1;
      }
    });

    if (nearTarget >= distances.length - 1 && shortRemainders <= 1) {
      return candidate;
    }
  }

  return null;
}

const WEB_DATE_PARTIAL_REGEX = /^\d{0,4}(-\d{0,2})?(-\d{0,2})?$/;
const WEB_TIME_PARTIAL_REGEX = /^\d{0,2}(:\d{0,2})?$/;

export const EnduranceSessionFormScreen = () => {
  const { t } = useTranslation();
  const { styles: dynamicStyles, colors: themeColors, isDark } = useTrainingStyles();
  const navigation = useNavigation<TrainingScreenNavigationProp>();
  const route = useRoute<RouteProp<TrainingStackParamList, 'EnduranceSessionForm'>>();
  const { user } = useAuth();

  // Params
  const params = route.params || {};
  const { template, templateId, gymSessionData, date: initialDateStr, sportType: paramSportType } = params; // initialDateStr can be YYYY-MM-DD or ISO
  const isGymMode = !!gymSessionData;
  const isSportLocked = !!paramSportType; // Lock sport selector if sportType is provided

  // Hooks
  const { createSession, updateSession } = useEnduranceSessions();
  const { preferences, toDisplayDistance, toDbDistanceFromDisplay } = useUserPreferences();
  const { data: userProfile } = useUserProfile();
  const { convertWeightToUi, convertSpeedToUi } = useUnitConversion();
  const pickStrengthActivityImport = usePickStrengthActivityImport();
  const applyStrengthActivityImport = useApplyStrengthActivityImport();

  // Internal state for fetched template
  const [fetchedTemplate, setFetchedTemplate] = useState<PopulatedEnduranceWorkoutTemplate | null>(null);

  // Track if initial values have been set (to prevent re-filling on re-renders)
  const hasInitializedRef = React.useRef(false);

  // Fetch Template if ID provided but no object, OR if template provided but steps missing
  useEffect(() => {
    const loadTemplate = async () => {
      if (templateId && !template) {
        // Fetch template AND steps
        const { data, error } = await supabase
          .from('endurance_workout_templates')
          .select('*, steps:endurance_workout_steps(*)')
          .eq('id', templateId)
          .single();

        if (data && !error) {
          setFetchedTemplate(data);
        }
      } else if (template && !template.steps && template.id) {
        // Template passed but steps missing (e.g. from list view that didn't join steps)
        const { data, error } = await supabase
          .from('endurance_workout_steps')
          .select('*')
          .eq('template_id', template.id);

        if (data && !error) {
          setFetchedTemplate({ ...template, steps: data }); // augment template with steps
        }
      }
    };
    loadTemplate();
  }, [templateId, template]);

  // Manual weight state for fallback
  const [manualWeight, setManualWeight] = useState('');

  // Update manual weight when profile loads (only if not already set)
  useEffect(() => {
    if (userProfile?.weight_kg && !manualWeight) {
      setManualWeight(userProfile.weight_kg.toString());
    }
  }, [userProfile]);

  const activeTemplate = fetchedTemplate || template;

  // Determine initial sport type (prioritize param, then gym mode, then template, then default)
  const initialSport = paramSportType || (isGymMode ? 'gym' : activeTemplate?.sport_type || 'running');

  // Determine initial name based on context
  const getInitialName = () => {
    if (gymSessionData?.name) return gymSessionData.name;
    if (activeTemplate?.base_name) return activeTemplate.base_name;
    // If coming from ActivityTypeSelector (paramSportType), auto-fill with "Entrenamiento de [Sport]"
    if (paramSportType) {
      const sportConfig = SPORTS_CONFIG[paramSportType];
      return `${t('training.workout')} ${t(sportConfig?.label) || paramSportType}`;
    }
    return '';
  };

  // Form State
  const [sportType, setSportType] = useState<string>(initialSport);
  const [name, setName] = useState(getInitialName());
  const [distance, setDistance] = useState('');
  const [durationHours, setDurationHours] = useState('');
  const [durationMinutes, setDurationMinutes] = useState('');
  const [durationSeconds, setDurationSeconds] = useState('');
  const [hr, setHr] = useState('');
  const [elevation, setElevation] = useState('');
  const [calories, setCalories] = useState('');
  const [isCaloriesLockedFromRouteImport, setIsCaloriesLockedFromRouteImport] = useState(false);
  // calories is just for display if we wanted manual override, but here we use calculated
  const [, setCalculatedCalories] = useState<number | null>(null);
  const [pace, setPace] = useState(''); // Calculated pace/rhythm (value only)
  const [isEditingPace, setIsEditingPace] = useState(false);
  const [rpe, setRpe] = useState('');
  const [vo2Max, setVo2Max] = useState('');
  const [totalSteps, setTotalSteps] = useState('');
  const [recoveryTimeHours, setRecoveryTimeHours] = useState('');
  const [elevationLoss, setElevationLoss] = useState('');

  // Initialize date from param if available, otherwise today (LOCAL TIME)
  const [date, setDate] = useState(initialDateStr ? initialDateStr.split('T')[0] : format(new Date(), 'yyyy-MM-dd'));
  const [time, setTime] = useState(new Date().toTimeString().slice(0, 5));
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [showDurationPicker, setShowDurationPicker] = useState(false);
  const [routePolyline, setRoutePolyline] = useState<string | null>(null);
  const [routeDetails, setRouteDetails] = useState<RouteImportDetails | null>(null);
  const [selectedSplitTabKey, setSelectedSplitTabKey] = useState<string | null>(null);
  const [pendingStrengthImport, setPendingStrengthImport] = useState<ImportedStrengthActivitySummary | null>(null);
  const [hasAppliedStrengthImport, setHasAppliedStrengthImport] = useState(false);
  const { data: importedStrengthSummary } = useSessionImportedStrengthSummary(gymSessionData?.sessionId);

  useEffect(() => {
    if (importedStrengthSummary) {
      setHasAppliedStrengthImport(true);
    }
  }, [importedStrengthSummary]);

  // Resolve derived state
  const currentConfig = SPORTS_CONFIG[sportType] || SPORTS_CONFIG.other;

  // --- EFFECTS ---

  // 1. Initialize from Template or Gym Data via Effects (ONLY ONCE)
  useEffect(() => {
    // Skip if already initialized (prevents overwriting user input)
    if (hasInitializedRef.current) return;

    if (gymSessionData) {
      // Gym Pre-fill
      setName(gymSessionData.name);
      setDistance('');
      if (gymSessionData.durationSeconds) {
        const totalSecs = gymSessionData.durationSeconds;
        setDurationHours(Math.floor(totalSecs / 3600).toString());
        setDurationMinutes(Math.floor((totalSecs % 3600) / 60).toString());
        setDurationSeconds((totalSecs % 60).toString());
      } else if (gymSessionData.startTime && gymSessionData.endTime) {
        const start = new Date(gymSessionData.startTime).getTime();
        const end = new Date(gymSessionData.endTime).getTime();
        const diffMin = Math.round((end - start) / 1000 / 60);
        if (diffMin > 0) {
          setDurationHours(Math.floor(diffMin / 60).toString());
          setDurationMinutes((diffMin % 60).toString());
          // Seconds usually 0 for this estimation or we could parse precisely if needed, but diffMin is rounded
          setDurationSeconds('0');
        }
      } else if (gymSessionData.setsCount) {
        const totalMin = Math.round(gymSessionData.setsCount * 1.5);
        setDurationHours(Math.floor(totalMin / 60).toString());
        setDurationMinutes((totalMin % 60).toString());
        setDurationSeconds('0');
      }

      // Set date/time from gymSession's startTime (preserve original date for past workouts)
      if (gymSessionData.startTime) {
        const sessionDate = new Date(gymSessionData.startTime);
        setDate(sessionDate.toISOString().split('T')[0]);
        setTime(sessionDate.toTimeString().slice(0, 5));
      }

      hasInitializedRef.current = true;
    } else if (activeTemplate) {
      // Template Pre-fill
      if (activeTemplate.sport_type) {
        setSportType(activeTemplate.sport_type);
      }
      if (activeTemplate.base_name) {
        setName(activeTemplate.base_name);
      }
      if (activeTemplate.total_distance_m) {
        const distDisplay = toDisplayDistance(activeTemplate.total_distance_m);
        setDistance(distDisplay.toString());
      }
      if (activeTemplate.total_duration_s) {
        const totalSecs = activeTemplate.total_duration_s;
        setDurationHours(Math.floor(totalSecs / 3600).toString());
        setDurationMinutes(Math.floor((totalSecs % 3600) / 60).toString());
        setDurationSeconds((totalSecs % 60).toString());
      }

      // RPE Pre-fill from steps
      if (activeTemplate.steps && Array.isArray(activeTemplate.steps)) {
        // Filter steps with RPE targets
        const rpeSteps = activeTemplate.steps.filter(s => s.target_type === 'rpe' && s.target_min);
        if (rpeSteps.length > 0) {
          const totalRpe = rpeSteps.reduce((sum: number, s) => sum + (s.target_min || 0), 0);
          const avgRpe = Math.round(totalRpe / rpeSteps.length);
          setRpe(avgRpe.toString());
        }
      }

      hasInitializedRef.current = true;
    }
  }, [gymSessionData, activeTemplate, toDisplayDistance]);

  // Helper for safe number parsing (handles commas and dots)
  const safeParseFloat = (str: string) => {
    if (!str) return 0;
    return parseFloat(str.replace(/,/g, '.').trim());
  };

  const normalizeWebDateInput = React.useCallback(
    (raw: string) => {
      const cleaned = raw.replace(/[^\d-]/g, '').slice(0, 10);
      return WEB_DATE_PARTIAL_REGEX.test(cleaned) ? cleaned : date;
    },
    [date],
  );

  const normalizeWebTimeInput = React.useCallback(
    (raw: string) => {
      const cleaned = raw.replace(/[^\d:]/g, '').slice(0, 5);
      return WEB_TIME_PARTIAL_REGEX.test(cleaned) ? cleaned : time;
    },
    [time],
  );

  const isValidLocalDate = React.useCallback((value: string) => {
    const match = value.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (!match) return false;

    const year = Number.parseInt(match[1], 10);
    const month = Number.parseInt(match[2], 10);
    const day = Number.parseInt(match[3], 10);

    if (month < 1 || month > 12 || day < 1 || day > 31) return false;

    const candidate = new Date(year, month - 1, day);
    return candidate.getFullYear() === year && candidate.getMonth() === month - 1 && candidate.getDate() === day;
  }, []);

  const isValidLocalTime = React.useCallback((value: string) => {
    const match = value.match(/^(\d{1,2}):(\d{1,2})$/);
    if (!match) return false;

    const hours = Number.parseInt(match[1], 10);
    const minutes = Number.parseInt(match[2], 10);
    return hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59;
  }, []);

  const formatDateForStorage = React.useCallback((value: string) => {
    const match = value.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (!match) return value;
    return `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
  }, []);

  const formatTimeForStorage = React.useCallback((value: string) => {
    const match = value.match(/^(\d{1,2}):(\d{1,2})$/);
    if (!match) return value;
    return `${match[1].padStart(2, '0')}:${match[2].padStart(2, '0')}`;
  }, []);

  const formatNumberForInput = React.useCallback((value: number, decimals: number) => {
    return Number.parseFloat(value.toFixed(decimals)).toString();
  }, []);

  const applyRouteSummaryToForm = React.useCallback(
    (summary: RouteImportSummary) => {
      if (summary.distanceM != null && summary.distanceM > 0) {
        const distanceInDisplayUnit = toDisplayDistance(summary.distanceM);
        setDistance(formatNumberForInput(distanceInDisplayUnit, 2));
      }

      if (summary.durationSeconds != null && summary.durationSeconds > 0) {
        const totalSeconds = Math.max(0, Math.round(summary.durationSeconds));
        setDurationHours(Math.floor(totalSeconds / 3600).toString());
        setDurationMinutes(Math.floor((totalSeconds % 3600) / 60).toString());
        setDurationSeconds((totalSeconds % 60).toString());
      }

      if (summary.elevationGainM != null && summary.elevationGainM > 0) {
        setElevation(formatNumberForInput(summary.elevationGainM, 0));
      }

      if (summary.elevationLossM != null && summary.elevationLossM > 0) {
        setElevationLoss(formatNumberForInput(summary.elevationLossM, 0));
      }

      if (summary.avgHeartRate != null && summary.avgHeartRate > 0) {
        setHr(Math.round(summary.avgHeartRate).toString());
      }

      if (summary.caloriesKcal != null && summary.caloriesKcal > 0) {
        setCalories(Math.round(summary.caloriesKcal).toString());
        setIsCaloriesLockedFromRouteImport(true);
      } else {
        setIsCaloriesLockedFromRouteImport(false);
      }

      if (summary.vo2Max != null && summary.vo2Max > 0) {
        setVo2Max(formatNumberForInput(summary.vo2Max, 1));
      }

      if (summary.totalSteps != null && summary.totalSteps > 0) {
        setTotalSteps(Math.round(summary.totalSteps).toString());
      }

      if (summary.recoveryTimeSeconds != null && summary.recoveryTimeSeconds > 0) {
        const recoveryHours = summary.recoveryTimeSeconds / 3600;
        setRecoveryTimeHours(formatNumberForInput(recoveryHours, 1));
      }
    },
    [formatNumberForInput, toDisplayDistance],
  );

  const formatSplitDistance = React.useCallback(
    (distanceM: number) => {
      const convertedDistance = toDisplayDistance(distanceM);
      const decimals = convertedDistance >= 10 ? 1 : 2;
      return `${formatNumberForInput(convertedDistance, decimals)} ${preferences.distance_unit}`;
    },
    [formatNumberForInput, preferences.distance_unit, toDisplayDistance],
  );

  const formatSplitDuration = React.useCallback((durationSeconds: number | null) => {
    if (durationSeconds == null || durationSeconds <= 0) return '--';
    const minutes = Math.floor(durationSeconds / 60);
    const seconds = durationSeconds - minutes * 60;
    return `${minutes.toString().padStart(2, '0')}:${seconds.toFixed(1).padStart(4, '0')}`;
  }, []);

  const formatSplitPace = React.useCallback(
    (lap: RouteImportLap) => {
      if (lap.avgPaceSecondsPerKm == null || lap.avgPaceSecondsPerKm <= 0) return '-';
      const speedMps = 1000 / lap.avgPaceSecondsPerKm;
      if (!Number.isFinite(speedMps) || speedMps <= 0) return '-';
      return convertSpeedToUi(speedMps, sportType as SportType).label;
    },
    [convertSpeedToUi, sportType],
  );

  const calculateAgeFromDateOfBirth = React.useCallback((dateOfBirth: string | null | undefined): number | null => {
    if (!dateOfBirth) return null;

    const dob = new Date(dateOfBirth);
    if (Number.isNaN(dob.getTime())) return null;

    const today = new Date();
    let ageYears = today.getFullYear() - dob.getFullYear();
    const monthDiff = today.getMonth() - dob.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
      ageYears -= 1;
    }

    return ageYears > 0 ? ageYears : null;
  }, []);

  const estimateMaxHeartRateFromAge = React.useCallback((age: number | null): number | null => {
    if (age == null || age <= 0) return null;
    const estimated = 220 - age;
    return Number.isFinite(estimated) && estimated > 0 ? estimated : null;
  }, []);

  const estimatedMaxHeartRate = React.useMemo(() => {
    const age = userProfile?.age ?? calculateAgeFromDateOfBirth(userProfile?.date_of_birth);
    return estimateMaxHeartRateFromAge(age ?? null);
  }, [calculateAgeFromDateOfBirth, estimateMaxHeartRateFromAge, userProfile?.age, userProfile?.date_of_birth]);

  const pickPolyline = usePickPolyline({
    estimatedMaxHeartRate,
    onRoutePicked: parsedRoute => {
      setRoutePolyline(parsedRoute.polyline);
      applyRouteSummaryToForm(parsedRoute.summary);
      setRouteDetails(parsedRoute.details);
      setSelectedSplitTabKey(null);
    },
  });

  const resolveEstimatedMaxHeartRateForRoute = React.useCallback(async (): Promise<number | null> => {
    if (estimatedMaxHeartRate != null) {
      return estimatedMaxHeartRate;
    }

    if (!user?.id) return null;

    const { data, error } = await supabase.from('users').select('date_of_birth').eq('id', user.id).single();
    if (error) {
      console.error('[EnduranceSessionForm] Failed to fetch age fallback for HR zones:', error);
      return null;
    }

    const fetchedAge = calculateAgeFromDateOfBirth(data?.date_of_birth ?? null);
    return estimateMaxHeartRateFromAge(fetchedAge);
  }, [calculateAgeFromDateOfBirth, estimateMaxHeartRateFromAge, estimatedMaxHeartRate, user?.id]);

  const handlePickRouteFile = React.useCallback(async () => {
    const maxHeartRate = await resolveEstimatedMaxHeartRateForRoute();
    pickPolyline.mutate({ estimatedMaxHeartRate: maxHeartRate });
  }, [pickPolyline, resolveEstimatedMaxHeartRateForRoute]);

  const formatSplitDistanceBucketLabel = React.useCallback((splitDistanceM: number) => {
    const distanceKm = splitDistanceM / 1000;
    const labelValue = Number.isInteger(distanceKm) ? distanceKm.toString() : distanceKm.toFixed(1);
    return `${labelValue} km`;
  }, []);

  const distanceSplitBuckets = React.useMemo(() => getDistanceSplitBuckets(routeDetails), [routeDetails]);

  const splitTabs = React.useMemo<SplitTab[]>(() => {
    const tabs: SplitTab[] = [];
    const customSplits = routeDetails?.customSplits ?? [];
    const customSplitLooksRegular = customSplits.every(
      split => split.lapType === 'auto' || split.lapType === 'distance' || split.lapType === 'unknown',
    );
    const inferredRegularCustomDistance = inferRegularAutoSplitDistance(customSplits);
    const customMatchesRegularBucket =
      customSplitLooksRegular &&
      inferredRegularCustomDistance != null &&
      distanceSplitBuckets.some(bucket => areCloseValues(bucket.splitDistanceM, inferredRegularCustomDistance, 10));
    const customDuplicatesDistanceBucket =
      customSplits.length > 0 && distanceSplitBuckets.some(bucket => areEquivalentLaps(customSplits, bucket.laps));
    const shouldShowCustom = customSplits.length > 0 && !customDuplicatesDistanceBucket && !customMatchesRegularBucket;

    if (shouldShowCustom) {
      tabs.push({
        key: 'custom',
        label: t('training.splitCustom'),
        splitGroup: 'custom',
        splitDistanceM: null,
        laps: customSplits,
      });
    }

    for (const bucket of distanceSplitBuckets) {
      tabs.push({
        key: `distance-${bucket.splitDistanceM}`,
        label: formatSplitDistanceBucketLabel(bucket.splitDistanceM),
        splitGroup: 'distance',
        splitDistanceM: bucket.splitDistanceM,
        laps: bucket.laps,
      });
    }

    if (tabs.length === 0 && customSplits.length > 0) {
      tabs.push({
        key: 'custom',
        label: t('training.splitCustom'),
        splitGroup: 'custom',
        splitDistanceM: null,
        laps: customSplits,
      });
    }

    return tabs;
  }, [distanceSplitBuckets, formatSplitDistanceBucketLabel, routeDetails?.customSplits, t]);

  useEffect(() => {
    if (splitTabs.length === 0) {
      if (selectedSplitTabKey !== null) {
        setSelectedSplitTabKey(null);
      }
      return;
    }

    const hasSelectedTab = selectedSplitTabKey != null && splitTabs.some(tab => tab.key === selectedSplitTabKey);
    if (!hasSelectedTab) {
      setSelectedSplitTabKey(splitTabs[0].key);
    }
  }, [selectedSplitTabKey, splitTabs]);

  const activeSplitTab = splitTabs.find(tab => tab.key === selectedSplitTabKey) ?? splitTabs[0] ?? null;
  const activeSplits = activeSplitTab?.laps ?? [];
  const activeSplitPaceValues = activeSplits
    .map(split => split.avgPaceSecondsPerKm)
    .filter((value): value is number => value != null && Number.isFinite(value) && value > 0);
  const fastestPace = activeSplitPaceValues.length > 0 ? Math.min(...activeSplitPaceValues) : null;
  const slowestPace = activeSplitPaceValues.length > 0 ? Math.max(...activeSplitPaceValues) : null;

  const resolvePaceCellBackground = React.useCallback(
    (lap: RouteImportLap) => {
      if (lap.avgPaceSecondsPerKm == null || fastestPace == null || slowestPace == null) {
        return 'transparent';
      }

      const interpolate = (start: number, end: number, progress: number) => {
        return Math.round(start + (end - start) * progress);
      };

      const blendColor = (
        start: { r: number; g: number; b: number; a: number },
        end: { r: number; g: number; b: number; a: number },
        progress: number,
      ) => {
        const p = Math.max(0, Math.min(1, progress));
        return `rgba(${interpolate(start.r, end.r, p)}, ${interpolate(start.g, end.g, p)}, ${interpolate(start.b, end.b, p)}, ${(
          start.a +
          (end.a - start.a) * p
        ).toFixed(3)})`;
      };

      const range = slowestPace - fastestPace;
      if (range <= 0) {
        return isDark ? 'rgba(90,200,250,0.24)' : 'rgba(90,200,250,0.16)';
      }

      const ratio = (lap.avgPaceSecondsPerKm - fastestPace) / range;
      const clampedRatio = Math.max(0, Math.min(1, ratio));

      if (isDark) {
        const fast = { r: 90, g: 200, b: 250, a: 0.24 };
        const mid = { r: 255, g: 255, b: 255, a: 0.07 };
        const slow = { r: 255, g: 160, b: 180, a: 0.22 };

        return clampedRatio <= 0.5
          ? blendColor(fast, mid, clampedRatio / 0.5)
          : blendColor(mid, slow, (clampedRatio - 0.5) / 0.5);
      }

      const fast = { r: 90, g: 200, b: 250, a: 0.16 };
      const mid = { r: 0, g: 0, b: 0, a: 0.04 };
      const slow = { r: 255, g: 160, b: 180, a: 0.15 };

      return clampedRatio <= 0.5
        ? blendColor(fast, mid, clampedRatio / 0.5)
        : blendColor(mid, slow, (clampedRatio - 0.5) / 0.5);
    },
    [fastestPace, isDark, slowestPace],
  );

  const zoneColorById: Record<1 | 2 | 3 | 4 | 5, string> = {
    5: '#FF3B30',
    4: '#FF9500',
    3: '#FFCC00',
    2: '#34C759',
    1: '#5AC8FA',
  };

  // 2. Real-time Calorie Estimation & Pace Calculation
  useEffect(() => {
    const totalDurationMin =
      (durationHours ? parseInt(durationHours) * 60 : 0) +
      (durationMinutes ? parseInt(durationMinutes) : 0) +
      (durationSeconds ? parseInt(durationSeconds) / 60 : 0);

    // --- Pace Calculation (Independent of weight) ---
    const dist = distance
      ? preferences.distance_unit === 'km'
        ? safeParseFloat(distance)
        : safeParseFloat(distance) * 1.60934
      : 0;

    if (dist > 0 && totalDurationMin > 0 && !isEditingPace) {
      if (sportType === 'running') {
        // min/km
        const minPerKm = totalDurationMin / dist;
        const mins = Math.floor(minPerKm);
        const secs = Math.round((minPerKm - mins) * 60);
        setPace(`${mins}:${secs.toString().padStart(2, '0')}`);
      } else if (sportType === 'cycling') {
        // km/h
        const kmh = (dist / totalDurationMin) * 60;
        setPace(`${kmh.toFixed(1)}`);
      } else if (sportType === 'swimming') {
        // min/100m
        const distMeters = dist * 1000;
        const minPer100m = (totalDurationMin / distMeters) * 100;
        const mins = Math.floor(minPer100m);
        const secs = Math.round((minPer100m - mins) * 60);
        setPace(`${mins}:${secs.toString().padStart(2, '0')}`);
      } else {
        // Default for all other sports (hiking, padel, etc): min/km
        const minPerKm = totalDurationMin / dist;
        const mins = Math.floor(minPerKm);
        const secs = Math.round((minPerKm - mins) * 60);
        setPace(`${mins}:${secs.toString().padStart(2, '0')}`);
      }
    } else if (!isEditingPace && (dist <= 0 || totalDurationMin <= 0)) {
      setPace('');
    }

    // --- Calorie Calculation (Depends on weight) ---

    // Use profile weight, or fallback to 70kg for calculation
    const weightToUse = userProfile?.weight_kg || 70; // Fallback to 70kg if not available

    // Skip early return if no weight - use fallback instead

    // If duration is explicitly 0, calories should be 0
    if (totalDurationMin === 0) {
      setCalculatedCalories(0);
      setCalories('0');
      return;
    }

    // If distance is 0 for sports that require distance, calories should be 0
    // Skip this check for gym/strength since they don't use distance
    if (currentConfig?.fields.distance && dist === 0 && sportType !== 'gym') {
      setCalculatedCalories(0);
      setCalories('0');
      return;
    }

    const input = {
      deporte: sportType as SportType,
      distancia_km: distance
        ? preferences.distance_unit === 'km'
          ? safeParseFloat(distance)
          : safeParseFloat(distance) * 1.60934
        : null,
      duracion_min: totalDurationMin > 0 ? totalDurationMin : null,
      desnivel_m: elevation ? safeParseFloat(elevation) : null,
      rpe: rpe ? parseInt(rpe) : 5, // Default to 5 for calc if empty, or handle in util
      peso_kg: weightToUse,
      sexo: userProfile?.sex || 'male', // Default to male for calcs if missing,
    };

    if (sportType === 'gym' && hasAppliedStrengthImport) {
      return;
    }

    const result = estimateCalories(input);
    setCalculatedCalories(result.kcal);

    if (isCaloriesLockedFromRouteImport) {
      return;
    }

    // Auto-update calories input
    if (result.kcal && result.kcal > 0) {
      setCalories(Math.round(result.kcal).toString());
    } else {
      setCalories('');
    }
  }, [
    distance,
    durationHours,
    durationMinutes,
    durationSeconds,
    elevation,
    rpe,
    sportType,
    userProfile,
    preferences.distance_unit,
    manualWeight,
    isEditingPace,
    isCaloriesLockedFromRouteImport,
    hasAppliedStrengthImport,
  ]);

  // Handle manual pace editing
  const handlePaceBlur = () => {
    setIsEditingPace(false);
    if (!pace || !distance) return;

    const dist = preferences.distance_unit === 'km' ? safeParseFloat(distance) : safeParseFloat(distance) * 1.60934;
    if (dist <= 0) return;

    let totalMin = 0;

    if (sportType === 'running' || sportType === 'swimming') {
      // Parse mm:ss format
      const parts = pace.split(':');
      if (parts.length === 2) {
        const mins = parseInt(parts[0]) || 0;
        const secs = parseInt(parts[1]) || 0;
        const paceVal = mins + secs / 60;

        if (sportType === 'running') {
          // paceVal is min/km
          totalMin = paceVal * dist;
        } else {
          // paceVal is min/100m
          // Dist in 100m units
          const dist100m = (dist * 1000) / 100;
          totalMin = paceVal * dist100m;
        }
      } else {
        // Try parsing as simple number (min)
        const val = safeParseFloat(pace);
        if (val > 0) {
          if (sportType === 'running') totalMin = val * dist;
          else totalMin = val * ((dist * 1000) / 100);
        }
      }
    } else {
      // Cycling / Others: km/h
      const speedKmh = safeParseFloat(pace);
      if (speedKmh > 0) {
        const hours = dist / speedKmh;
        totalMin = hours * 60;
      }
    }

    if (totalMin > 0) {
      const totalSecs = Math.round(totalMin * 60);
      setDurationHours(Math.floor(totalSecs / 3600).toString());
      setDurationMinutes(Math.floor((totalSecs % 3600) / 60).toString());
      setDurationSeconds((totalSecs % 60).toString());
    }
  };

  const persistParsedRouteDetails = React.useCallback(
    async (sessionId: string) => {
      if (!sessionId || !routeDetails) return;

      const distanceBuckets = getDistanceSplitBuckets(routeDetails);
      const tabsToPersist =
        splitTabs.length > 0
          ? splitTabs
          : routeDetails.customSplits.length > 0
            ? [
                {
                  key: 'custom',
                  label: t('training.splitCustom'),
                  splitGroup: 'custom' as const,
                  splitDistanceM: null,
                  laps: routeDetails.customSplits,
                },
              ]
            : distanceBuckets.length > 0
              ? distanceBuckets.map(bucket => ({
                  key: `distance-${bucket.splitDistanceM}`,
                  label: formatSplitDistanceBucketLabel(bucket.splitDistanceM),
                  splitGroup: 'distance' as const,
                  splitDistanceM: bucket.splitDistanceM,
                  laps: bucket.laps,
                }))
              : [];

      const lapRows: ActivityLapInsert[] = tabsToPersist.flatMap((tab, tabIndex) =>
        tab.laps.map(lap => ({
          session_id: sessionId,
          user_id: user?.id ?? null,
          lap_index: lap.lapIndex,
          lap_type: lap.lapType,
          split_group: tab.splitGroup,
          split_group_order: tabIndex,
          split_distance_m: tab.splitDistanceM != null ? Math.round(tab.splitDistanceM) : null,
          distance_m: lap.distanceM,
          duration_s: lap.durationSeconds != null ? Math.round(lap.durationSeconds) : null,
          avg_heart_rate: lap.avgHeartRate != null ? Math.round(lap.avgHeartRate) : null,
          max_heart_rate: lap.maxHeartRate != null ? Math.round(lap.maxHeartRate) : null,
          avg_pace_s_per_km: lap.avgPaceSecondsPerKm != null ? Math.round(lap.avgPaceSecondsPerKm) : null,
          start_offset_s: lap.startOffsetSeconds != null ? Math.round(lap.startOffsetSeconds) : null,
          end_offset_s: lap.endOffsetSeconds != null ? Math.round(lap.endOffsetSeconds) : null,
        })),
      );
      const zoneRows: ActivityHeartRateZoneInsert[] = routeDetails.heartRateZones.map(zone => ({
        session_id: sessionId,
        zone: zone.zone,
        duration_s: Math.max(0, Math.round(zone.durationSeconds)),
        percentage: Number.parseFloat(Math.max(0, Math.min(100, zone.percentage)).toFixed(2)),
      }));

      if (lapRows.length === 0 && zoneRows.length === 0) return;

      if (lapRows.length > 0) {
        const { data: previousLaps, error: previousLapsError } = await supabase
          .from('activity_laps')
          .select('*')
          .eq('session_id', sessionId);
        if (previousLapsError) {
          throw previousLapsError;
        }

        const safePreviousLaps = previousLaps ?? [];
        const restorePreviousLaps = async () => {
          const { error: clearLapsError } = await supabase.from('activity_laps').delete().eq('session_id', sessionId);
          if (clearLapsError) throw clearLapsError;

          if (safePreviousLaps.length === 0) return;

          const previousLapRows: ActivityLapInsert[] = safePreviousLaps.map((lap: ActivityLap) => ({
            id: lap.id,
            session_id: lap.session_id,
            user_id: lap.user_id,
            lap_index: lap.lap_index,
            lap_type: lap.lap_type,
            distance_m: lap.distance_m,
            duration_s: lap.duration_s,
            avg_heart_rate: lap.avg_heart_rate,
            max_heart_rate: lap.max_heart_rate,
            avg_pace_s_per_km: lap.avg_pace_s_per_km,
            split_group: lap.split_group,
            split_group_order: lap.split_group_order,
            split_distance_m: lap.split_distance_m,
            start_offset_s: lap.start_offset_s,
            end_offset_s: lap.end_offset_s,
          }));

          const { error: restoreLapsError } = await supabase.from('activity_laps').insert(previousLapRows);
          if (restoreLapsError) throw restoreLapsError;
        };

        try {
          const { error: deleteLapsError } = await supabase.from('activity_laps').delete().eq('session_id', sessionId);
          if (deleteLapsError) throw deleteLapsError;

          const { error: insertLapsError } = await supabase.from('activity_laps').insert(lapRows);
          if (insertLapsError) throw insertLapsError;
        } catch (lapPersistError) {
          try {
            await restorePreviousLaps();
          } catch (restoreError) {
            void restoreError;
          }

          throw lapPersistError;
        }
      }

      if (zoneRows.length > 0) {
        try {
          const { error: deleteZonesError } = await supabase
            .from('activity_heart_rate_zones')
            .delete()
            .eq('session_id', sessionId);
          if (deleteZonesError) throw deleteZonesError;

          const { error: insertZonesError } = await supabase.from('activity_heart_rate_zones').insert(zoneRows);
          if (insertZonesError) throw insertZonesError;
        } catch (zonePersistError) {
          void zonePersistError;
        }
      }
    },
    [formatSplitDistanceBucketLabel, routeDetails, splitTabs, t, user?.id],
  );

  const handleSave = async () => {
    // --- VALIDATION ---

    // 1. Gym Mode specific
    if (sportType === 'gym') {
      // "Omitir" enables saving without validation or specific fields
    } else {
      // 2. Endurance Sports Logic
      const isEndurance = ['running', 'cycling', 'swimming'].includes(sportType);
      const hasDist = !!distance && safeParseFloat(distance) > 0;
      const totalDurationMin =
        (durationHours ? parseInt(durationHours) * 60 : 0) +
        (durationMinutes ? parseInt(durationMinutes) : 0) +
        (durationSeconds ? parseInt(durationSeconds) / 60 : 0);
      const hasDur = totalDurationMin > 0;

      if (isEndurance) {
        if (!hasDist && !hasDur) {
          Alert.alert(t('training.missingDataTitle'), t('training.needTimeOrDistance'));
          return;
        }
      } else {
        // Others: Duration mandatory
        if (!hasDur) {
          Alert.alert(t('training.missingDataTitle'), t('training.durationRequiredForSport'));
          return;
        }
      }
    }

    if (!name && !isGymMode) {
      Alert.alert(t('common.error'), t('training.sessionNameRequired'));
      return;
    }

    const normalizedDate = formatDateForStorage(date);
    const normalizedTime = formatTimeForStorage(time);

    if (!isValidLocalDate(normalizedDate)) {
      Alert.alert(t('common.error'), t('settings.invalidDateFormatYmd'));
      return;
    }

    if (!isValidLocalTime(normalizedTime)) {
      Alert.alert(t('common.error'), t('settings.invalidInputFormat'));
      return;
    }

    let persistedSessionId: string | null = null;
    let wasSessionCreated = false;
    try {
      const startDateTime = new Date(`${normalizedDate}T${normalizedTime}:00`).toISOString();

      // Prepare payload
      const totalDurationMin =
        (durationHours ? parseInt(durationHours) * 60 : 0) +
        (durationMinutes ? parseInt(durationMinutes) : 0) +
        (durationSeconds ? parseInt(durationSeconds) / 60 : 0);
      const durationInSeconds = Math.round(totalDurationMin * 60);
      // Ensure end_time is set. If duration is calculated, use it. Otherwise, if we are saving, the session is finished.
      // For Gym Sessions, use the passed endTime or current time.
      let endTime =
        durationInSeconds > 0
          ? new Date(new Date(startDateTime).getTime() + durationInSeconds * 1000).toISOString()
          : null;

      if (!endTime) {
        // Determine a valid end time so the session is marked as completed (not null)
        // If we have gym data with an end time (from the timer), use it.
        if (gymSessionData?.endTime) {
          endTime = gymSessionData.endTime;
        } else {
          // Fallback to current time aka "Now"
          endTime = new Date().toISOString();
        }
      }

      const payload: ActivitySessionInsert | ActivitySessionUpdate = {
        sport_type: (sportType === 'gym' ? 'strength' : sportType) as SportType,
        name: name || (isGymMode ? t('constants.gymTitle') : t('alzan.activity')),
        start_time: startDateTime,
        end_time: endTime, // Critical to mark session as finished
        rpe: rpe ? parseInt(rpe) : null,
        duration_s: durationInSeconds || null,

        calories_kcal: calories ? parseInt(calories) : null, // Use input value
        // ✅ FIX #4: Add timezone fields
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        started_at_local: `${normalizedDate}T${normalizedTime}:00`,
        ended_at_local: endTime ? new Date(endTime).toISOString().slice(0, 19) : null,
      };

      // Preserve imported metadata for gym sessions when a file was already applied.
      if (sportType !== 'gym' || !hasAppliedStrengthImport) {
        payload.source = 'manual';
        payload.provider = 'manual';
        payload.provider_activity_id = null;
        payload.imported_at = null;
      }

      if (sportType !== 'gym') {
        const distVal = safeParseFloat(distance);
        const elevVal = safeParseFloat(elevation);
        const elevLossVal = safeParseFloat(elevationLoss);
        const hrVal = hr ? parseInt(hr) : null;
        const vo2Val = vo2Max ? safeParseFloat(vo2Max) : null;
        const totalStepsVal = totalSteps ? parseInt(totalSteps, 10) : null;
        const recoveryTimeHoursVal = recoveryTimeHours ? safeParseFloat(recoveryTimeHours) : null;

        payload.distance_m = distance ? toDbDistanceFromDisplay(distVal) : null;
        payload.elev_gain_m = elevation ? elevVal : null;
        payload.elev_loss_m = elevationLoss ? elevLossVal : null;
        payload.avg_heart_rate = hrVal;
        payload.vo2_max = vo2Val && Number.isFinite(vo2Val) ? vo2Val : null;
        payload.total_steps = totalStepsVal && Number.isFinite(totalStepsVal) ? totalStepsVal : null;
        payload.recovery_time_s =
          recoveryTimeHoursVal && Number.isFinite(recoveryTimeHoursVal)
            ? Math.round(Math.max(0, recoveryTimeHoursVal) * 3600)
            : null;
        payload.route_polyline = routePolyline;

        // ✅ FIX #5: Calculate avg_speed
        if (payload.distance_m && durationInSeconds > 0) {
          payload.avg_speed_m_per_s = payload.distance_m / durationInSeconds;
        }
      }

      // ✅ FIX #1: Calculate gym totals
      if (gymSessionData?.sessionId) {
        const { data: sets } = await supabase
          .from('workout_sets')
          .select('reps, weight_kg')
          .eq('session_id', gymSessionData.sessionId);

        payload.total_sets = sets?.length || 0;
        payload.total_reps = sets?.reduce((sum, s) => sum + s.reps, 0) || 0;
        payload.total_volume_kg = sets?.reduce((sum, s) => sum + s.weight_kg * s.reps, 0) || 0;
      }

      // Add template ID linkage if from template
      if (activeTemplate?.id) {
        if (sportType === 'gym' || sportType === 'strength') {
          // Gym templates use workout_template_id (FK to workout_templates)
          payload.workout_template_id = activeTemplate.id;
        } else {
          // Endurance templates use endurance_template_id (FK to endurance_workout_templates)
          payload.endurance_template_id = activeTemplate.id;
        }
      }

      // If gym session with existing sessionId, UPDATE instead of creating
      if (gymSessionData?.sessionId) {
        await updateSession.mutateAsync({ sessionId: gymSessionData.sessionId, updates: payload });
        persistedSessionId = gymSessionData.sessionId;
      } else {
        const createdSession = await createSession.mutateAsync(payload as ActivitySessionInsert);
        persistedSessionId = createdSession?.id ?? null;
        wasSessionCreated = true;
      }

      if (sportType !== 'gym' && persistedSessionId) {
        await persistParsedRouteDetails(persistedSessionId);
      }

      // Navigate to TrainingHome after successful save
      navigation.navigate('TrainingHome');
    } catch (_error) {
      if (wasSessionCreated && persistedSessionId) {
        const { error: rollbackError } = await supabase.from('activity_sessions').delete().eq('id', persistedSessionId);
        void rollbackError;
      }

      Alert.alert(t('common.error'), t('training.saveSessionError'));
    }
  };

  const handlePickStrengthActivityFile = () => {
    pickStrengthActivityImport.mutate(undefined, {
      onSuccess: summary => setPendingStrengthImport(summary),
      onError: (error: Error) => {
        if (error.message === 'CANCELLED') return;
        const message =
          error.message === STRENGTH_ACTIVITY_UNSUPPORTED_ERROR_TAG
            ? t('training.strengthActivityUnsupportedError')
            : t('training.strengthActivityParseError');
        Alert.alert(t('training.uploadActivityFile'), message);
      },
    });
  };

  const handleApplyStrengthActivityImport = () => {
    if (!gymSessionData?.sessionId || !pendingStrengthImport) return;

    applyStrengthActivityImport.mutate(
      { sessionId: gymSessionData.sessionId, summary: pendingStrengthImport },
      {
        onSuccess: () => {
          if (pendingStrengthImport.durationSeconds != null) {
            const total = Math.max(0, pendingStrengthImport.durationSeconds);
            const hours = Math.floor(total / 3600);
            const minutes = Math.floor((total % 3600) / 60);
            const seconds = Math.floor(total % 60);
            setDurationHours(String(hours));
            setDurationMinutes(String(minutes));
            setDurationSeconds(String(seconds));
          }
          if (pendingStrengthImport.caloriesKcal != null) {
            setCalories(String(Math.round(pendingStrengthImport.caloriesKcal)));
            setIsCaloriesLockedFromRouteImport(true);
          }
          setHasAppliedStrengthImport(true);
          setPendingStrengthImport(null);
          Alert.alert(t('training.uploadActivityFile'), t('training.importedFileApplied'));
        },
        onError: () => {
          Alert.alert(t('training.uploadActivityFile'), t('training.importActivityFileError'));
        },
      },
    );
  };

  const importedMetricsRows = importedStrengthSummary
    ? [
        {
          label: t('training.duration'),
          value: `${durationHours || '0'}:${(durationMinutes || '0').padStart(2, '0')}:${(durationSeconds || '0').padStart(2, '0')}`,
        },
        {
          label: t('nutrition.kcal'),
          value:
            importedStrengthSummary.caloriesKcal != null
              ? `${Math.round(importedStrengthSummary.caloriesKcal)} ${t('nutrition.kcal')}`
              : '-',
        },
        {
          label: t('training.avgHeartRate'),
          value:
            importedStrengthSummary.avgHeartRate != null
              ? `${Math.round(importedStrengthSummary.avgHeartRate)} ${t('health.unitBpm')}`
              : '-',
        },
        {
          label: t('training.maxHeartRate'),
          value:
            importedStrengthSummary.maxHeartRate != null
              ? `${Math.round(importedStrengthSummary.maxHeartRate)} ${t('health.unitBpm')}`
              : '-',
        },
        {
          label: t('training.minHeartRate'),
          value:
            importedStrengthSummary.minHeartRate != null
              ? `${Math.round(importedStrengthSummary.minHeartRate)} ${t('health.unitBpm')}`
              : '-',
        },
        {
          label: t('training.tssHr'),
          value: importedStrengthSummary.tss != null ? `${Math.round(importedStrengthSummary.tss)}` : '-',
        },
        {
          label: t('training.epoc'),
          value: importedStrengthSummary.epoc != null ? `${Math.round(importedStrengthSummary.epoc)}` : '-',
        },
        {
          label: t('training.pte'),
          value:
            importedStrengthSummary.pte != null ? importedStrengthSummary.pte.toFixed(1).replace('.', ',') : '-',
        },
        {
          label: t('training.recoveryTime'),
          value:
            importedStrengthSummary.recoveryTimeSeconds != null
              ? `${Math.floor(importedStrengthSummary.recoveryTimeSeconds / 60)}:${Math.floor(importedStrengthSummary.recoveryTimeSeconds % 60)
                  .toString()
                  .padStart(2, '0')}`
              : '-',
        },
      ]
    : [];

  const renderGymContent = () => (
    <View style={styles.gymContainer}>
      <View style={[styles.gymSummaryCard, dynamicStyles.card]}>
        <Text style={[styles.gymSummaryTitle, dynamicStyles.title]}>{t('training.sessionSummary')}</Text>
        <View style={styles.gymStatsRow}>
          <View style={styles.gymStatItem}>
            <Text style={[styles.gymStatValue, { color: themeColors.primary }]}>
              {gymSessionData?.exercisesCount || 0}
            </Text>
            <Text style={[styles.gymStatLabel, dynamicStyles.sublabel]}>{t('training.exercises')}</Text>
          </View>
          <View style={styles.gymStatItem}>
            <Text style={[styles.gymStatValue, { color: themeColors.primary }]}>{gymSessionData?.setsCount || 0}</Text>
            <Text style={[styles.gymStatLabel, dynamicStyles.sublabel]}>{t('training.sets')}</Text>
          </View>
          {(gymSessionData?.volumeLoad || 0) > 0 && (
            <View style={styles.gymStatItem}>
              <Text style={[styles.gymStatValue, { color: themeColors.primary }]}>
                {gymSessionData?.volumeLoad ? convertWeightToUi(gymSessionData.volumeLoad).value : 0}
                {gymSessionData?.volumeLoad ? convertWeightToUi(gymSessionData.volumeLoad).unit : ''}
              </Text>
              <Text style={[styles.gymStatLabel, dynamicStyles.sublabel]}>{t('training.volume')}</Text>
            </View>
          )}
        </View>
      </View>

      <View style={styles.formGroup}>
        <TouchableOpacity
          style={[
            styles.routeUploadButton,
            dynamicStyles.input,
            {
              opacity:
                pickStrengthActivityImport.isPending || applyStrengthActivityImport.isPending || !gymSessionData?.sessionId
                  ? 0.6
                  : 1,
            },
          ]}
          onPress={handlePickStrengthActivityFile}
          disabled={
            pickStrengthActivityImport.isPending || applyStrengthActivityImport.isPending || !gymSessionData?.sessionId
          }
        >
          {pickStrengthActivityImport.isPending || applyStrengthActivityImport.isPending ? (
            <ActivityIndicator size="small" color={themeColors.primary} />
          ) : (
            <Upload size={16} color={themeColors.primary} />
          )}
          <Text style={[styles.routeUploadButtonText, { color: themeColors.primary }]}>
            {t('training.uploadActivityFile')}
          </Text>
        </TouchableOpacity>
      </View>

      {importedMetricsRows.length > 0 && (
        <View style={[styles.gymSummaryCard, dynamicStyles.card]}>
          {importedMetricsRows.map((row, index) => (
            <View
              key={`${row.label}-${index}`}
              style={[
                styles.importedRow,
                index !== importedMetricsRows.length - 1 && {
                  borderBottomWidth: StyleSheet.hairlineWidth,
                  borderBottomColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)',
                },
              ]}
            >
              <Text style={[styles.gymStatLabel, dynamicStyles.sublabel]}>{row.label}</Text>
              <Text style={[styles.importedRowValue, { color: themeColors.textPrimary }]}>{row.value}</Text>
            </View>
          ))}
        </View>
      )}

      <View style={styles.formGroup}>
        <Text style={[styles.label, dynamicStyles.sublabel]}>{t('training.duration')}</Text>
        <TouchableOpacity
          style={[
            styles.input,
            dynamicStyles.input,
            { flexDirection: 'row', justifyContent: 'center', alignItems: 'center' },
          ]}
          onPress={() => setShowDurationPicker(true)}
        >
          <Text style={{ fontSize: 16, fontWeight: '600', color: themeColors.textPrimary }}>
            {durationHours || '0'}h : {durationMinutes || '0'}
            {t('training.minutesColon')}
            {durationSeconds || '0'}s
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.formGroup}>
        <Text style={styles.label}>{t('training.caloriesKcal')}</Text>
        <TextInput
          style={[styles.input, dynamicStyles.input, { color: themeColors.textPrimary }]}
          keyboardType="numeric"
          placeholder="0"
          placeholderTextColor={themeColors.textSecondary}
          value={calories}
          onChangeText={value => {
            setIsCaloriesLockedFromRouteImport(false);
            setCalories(value);
          }}
        />
      </View>

      <View style={styles.formGroup}>
        <Text style={[styles.label, dynamicStyles.sublabel]}>{t('training.perceivedEffortRpe')}</Text>
        <TextInput
          style={[styles.input, dynamicStyles.input, { color: themeColors.textPrimary }]}
          keyboardType="numeric"
          placeholder="5"
          placeholderTextColor={themeColors.textSecondary}
          value={rpe}
          onChangeText={setRpe}
        />
      </View>

      <View style={styles.helperContainer}>
        <Text style={[styles.helperText, { color: themeColors.textSecondary }]}>
          {t('training.saveSuccessMessage')}
        </Text>
      </View>
    </View>
  );

  return (
    <LinearGradient
      colors={[themeColors.gradientStart || themeColors.background, themeColors.gradientEnd || themeColors.background]}
      style={styles.container}
    >
      <SafeAreaView style={styles.safeArea}>
        <View style={[styles.header, { borderBottomColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)' }]}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Text style={[styles.cancelText, { color: themeColors.danger }]}>
              {isGymMode ? t('common.skip') : t('common.cancel')}
            </Text>
          </TouchableOpacity>
          <Text style={[styles.title, dynamicStyles.title]}>
            {isGymMode ? t('training.finishWorkout') : t('training.registerActivity')}
          </Text>
          <TouchableOpacity onPress={() => handleSave()}>
            <Text style={[styles.saveText, { color: themeColors.primary }]}>{t('common.save')}</Text>
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {isGymMode ? (
            renderGymContent()
          ) : (
            <>
              {/* SPORT SELECTOR - Hidden when locked */}
              {!isSportLocked && (
                <View style={styles.formGroup}>
                  <Text style={[styles.label, dynamicStyles.sublabel]}>{t('training.sport')}</Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.sportSelector}
                  >
                    {Object.values(SPORTS_CONFIG).map(config => {
                      const isSelected = sportType === config.id;
                      const isLocked = !!activeTemplate; // Lock when template provided
                      const Icon = config.icon;

                      return (
                        <TouchableOpacity
                          key={config.id}
                          style={[
                            styles.sportChip,
                            isSelected && { backgroundColor: themeColors.primary },
                            !isSelected && dynamicStyles.glassCard,
                            isLocked && !isSelected && { opacity: 0.4 },
                          ]}
                          disabled={isLocked}
                          onPress={() => {
                            setSportType(config.id);
                            // Only auto-set name if it was empty or default
                            if (!name || (currentConfig && name === currentConfig.defaultTitle)) {
                              setName(t(config.defaultTitle));
                            }
                          }}
                        >
                          <Icon
                            size={16}
                            color={isSelected ? '#FFFFFF' : themeColors.textSecondary}
                            sport={config.id}
                          />
                          <Text
                            style={[
                              styles.sportChipText,
                              isSelected && styles.sportChipTextActive,
                              !isSelected && { color: themeColors.textSecondary },
                            ]}
                          >
                            {t(config.label)}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                </View>
              )}

              <View style={styles.formGroup}>
                <Text style={[styles.label, dynamicStyles.sublabel]}>{t('training.name')}</Text>
                <TextInput
                  style={[styles.input, dynamicStyles.input, { color: themeColors.textPrimary }]}
                  placeholder={t(currentConfig?.defaultTitle) || t('alzan.activity')}
                  placeholderTextColor={themeColors.textSecondary}
                  value={name}
                  onChangeText={setName}
                />
              </View>

              <View style={styles.row}>
                {currentConfig?.fields.distance && (
                  <View style={[styles.formGroup, { flex: 1, marginRight: spacing.s }]}>
                    <Text style={[styles.label, dynamicStyles.sublabel]}>
                      {t('training.distanceParen')}
                      {preferences.distance_unit})
                    </Text>
                    <TextInput
                      style={[styles.input, dynamicStyles.input, { color: themeColors.textPrimary }]}
                      keyboardType="numeric"
                      placeholder="0.0"
                      placeholderTextColor={themeColors.textSecondary}
                      value={distance}
                      onChangeText={setDistance}
                    />
                  </View>
                )}
                {currentConfig?.fields.duration && (
                  <View
                    style={[styles.formGroup, { flex: 1, marginLeft: currentConfig.fields.distance ? spacing.s : 0 }]}
                  >
                    <Text style={[styles.label, dynamicStyles.sublabel]}>{t('training.duration')}</Text>
                    <TouchableOpacity
                      style={[
                        styles.input,
                        dynamicStyles.input,
                        { flexDirection: 'row', justifyContent: 'center', alignItems: 'center' },
                      ]}
                      onPress={() => setShowDurationPicker(true)}
                    >
                      <Text style={{ fontSize: 16, fontWeight: '600', color: themeColors.textPrimary }}>
                        {durationHours || '0'}h : {durationMinutes || '0'}
                        {t('training.minutesColon')}
                        {durationSeconds || '0'}s
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>

              {/* Pace/Rhythm Row */}
              {(currentConfig?.fields.distance || currentConfig?.fields.duration) && (
                <View style={styles.row}>
                  <View style={[styles.formGroup, { flex: 1 }]}>
                    <Text style={styles.label}>{t('training.pace')}</Text>
                    <View
                      style={[
                        styles.input,
                        dynamicStyles.input,
                        {
                          flexDirection: 'row',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          paddingRight: 16,
                        },
                      ]}
                    >
                      <TextInput
                        style={{
                          flex: 1,
                          color: themeColors.textPrimary,
                          fontSize: 16,
                          fontWeight: '600',
                          height: '100%',
                        }}
                        value={pace}
                        onChangeText={setPace}
                        onFocus={() => setIsEditingPace(true)}
                        onBlur={handlePaceBlur}
                        placeholder="-"
                        placeholderTextColor={themeColors.textSecondary}
                        keyboardType="numeric"
                      />
                      <Text style={{ color: themeColors.textSecondary, fontSize: 14 }}>
                        {currentConfig?.units.speed || ''}
                      </Text>
                    </View>
                  </View>
                </View>
              )}

              <View style={styles.row}>
                {currentConfig?.fields.calories && (
                  <View style={[styles.formGroup, { flex: 1, marginRight: spacing.s }]}>
                    <Text style={styles.label}>{t('training.caloriesKcal')}</Text>
                    <TextInput
                      style={[styles.input, dynamicStyles.input, { color: themeColors.textPrimary }]}
                      keyboardType="numeric"
                      placeholder="0"
                      placeholderTextColor={themeColors.textSecondary}
                      value={calories}
                      onChangeText={value => {
                        setIsCaloriesLockedFromRouteImport(false);
                        setCalories(value);
                      }}
                    />
                  </View>
                )}
                {currentConfig?.fields.calories && (
                  <View style={[styles.formGroup, { flex: 1, marginLeft: spacing.s }]}>
                    <Text style={styles.label}>{t('training.recoveryTime')}</Text>
                    <View
                      style={[
                        styles.input,
                        dynamicStyles.input,
                        {
                          flexDirection: 'row',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          paddingRight: 16,
                        },
                      ]}
                    >
                      <TextInput
                        style={{
                          flex: 1,
                          color: themeColors.textPrimary,
                          fontSize: 16,
                          fontWeight: '600',
                          height: '100%',
                        }}
                        keyboardType="numeric"
                        placeholder="0.0"
                        placeholderTextColor={themeColors.textSecondary}
                        value={recoveryTimeHours}
                        onChangeText={setRecoveryTimeHours}
                      />
                      <Text style={{ color: themeColors.textSecondary, fontSize: 14 }}>{t('training.hours')}</Text>
                    </View>
                  </View>
                )}
              </View>

              <View style={styles.row}>
                {currentConfig?.fields.heartRate && (
                  <View style={[styles.formGroup, { flex: 1, marginRight: spacing.s }]}>
                    <Text style={styles.label}>{t('training.avgHeartRate')}</Text>
                    <TextInput
                      style={[styles.input, dynamicStyles.input, { color: themeColors.textPrimary }]}
                      keyboardType="numeric"
                      placeholder="0"
                      placeholderTextColor={themeColors.textSecondary}
                      value={hr}
                      onChangeText={setHr}
                    />
                  </View>
                )}
                {currentConfig?.fields.rpe && (
                  <View
                    style={[styles.formGroup, { flex: 1, marginLeft: currentConfig.fields.heartRate ? spacing.s : 0 }]}
                  >
                    <Text style={styles.label}>{t('training.effortRpe')}</Text>
                    <TextInput
                      style={[styles.input, dynamicStyles.input, { color: themeColors.textPrimary }]}
                      keyboardType="numeric"
                      placeholder={t('training.repsPlaceholder')}
                      placeholderTextColor={themeColors.textSecondary}
                      value={rpe}
                      onChangeText={setRpe}
                    />
                  </View>
                )}
              </View>

              <View style={styles.row}>
                <View style={[styles.formGroup, { flex: 1, marginRight: spacing.s }]}>
                  <Text style={[styles.label, dynamicStyles.sublabel]}>{t('training.date')}</Text>
                  {Platform.OS === 'web' ? (
                    <TextInput
                      style={[styles.input, dynamicStyles.input, { color: themeColors.textPrimary }]}
                      value={date}
                      onChangeText={value => setDate(normalizeWebDateInput(value))}
                      onBlur={() => setDate(formatDateForStorage(date))}
                      placeholder="YYYY-MM-DD"
                      placeholderTextColor={themeColors.textSecondary}
                      autoCapitalize="none"
                      autoCorrect={false}
                    />
                  ) : (
                    <TouchableOpacity
                      style={[styles.input, dynamicStyles.input]}
                      onPress={() => setShowDatePicker(true)}
                    >
                      <Text style={{ color: themeColors.textPrimary }}>{date}</Text>
                    </TouchableOpacity>
                  )}
                </View>
                <View style={[styles.formGroup, { flex: 1, marginLeft: spacing.s }]}>
                  <Text style={[styles.label, dynamicStyles.sublabel]}>{t('training.hour')}</Text>
                  {Platform.OS === 'web' ? (
                    <TextInput
                      style={[styles.input, dynamicStyles.input, { color: themeColors.textPrimary }]}
                      value={time}
                      onChangeText={value => setTime(normalizeWebTimeInput(value))}
                      onBlur={() => setTime(formatTimeForStorage(time))}
                      placeholder="HH:MM"
                      placeholderTextColor={themeColors.textSecondary}
                      autoCapitalize="none"
                      autoCorrect={false}
                    />
                  ) : (
                    <TouchableOpacity
                      style={[styles.input, dynamicStyles.input]}
                      onPress={() => setShowTimePicker(true)}
                    >
                      <Text style={{ color: themeColors.textPrimary }}>{time}</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>

              <View style={styles.row}>
                <View style={[styles.formGroup, { flex: 1, marginRight: spacing.s }]}>
                  <Text style={styles.label}>{t('training.vo2Max')}</Text>
                  <TextInput
                    style={[styles.input, dynamicStyles.input, { color: themeColors.textPrimary }]}
                    keyboardType="numeric"
                    placeholder="0.0"
                    placeholderTextColor={themeColors.textSecondary}
                    value={vo2Max}
                    onChangeText={setVo2Max}
                  />
                </View>
                <View style={[styles.formGroup, { flex: 1, marginLeft: spacing.s }]}>
                  <Text style={styles.label}>{t('training.totalSteps')}</Text>
                  <TextInput
                    style={[styles.input, dynamicStyles.input, { color: themeColors.textPrimary }]}
                    keyboardType="numeric"
                    placeholder="0"
                    placeholderTextColor={themeColors.textSecondary}
                    value={totalSteps}
                    onChangeText={setTotalSteps}
                  />
                </View>
              </View>

              <View style={styles.row}>
                {currentConfig?.fields.elevation && (
                  <View style={[styles.formGroup, { flex: 1, marginRight: spacing.s }]}>
                    <Text style={styles.label}>{t('training.elevationM')}</Text>
                    <TextInput
                      style={[styles.input, dynamicStyles.input, { color: themeColors.textPrimary }]}
                      keyboardType="numeric"
                      placeholder="0"
                      placeholderTextColor={themeColors.textSecondary}
                      value={elevation}
                      onChangeText={setElevation}
                    />
                  </View>
                )}
                {currentConfig?.fields.elevation && (
                  <View style={[styles.formGroup, { flex: 1, marginLeft: spacing.s }]}>
                    <Text style={styles.label}>{t('training.elevationLossM')}</Text>
                    <TextInput
                      style={[styles.input, dynamicStyles.input, { color: themeColors.textPrimary }]}
                      keyboardType="numeric"
                      placeholder="0"
                      placeholderTextColor={themeColors.textSecondary}
                      value={elevationLoss}
                      onChangeText={setElevationLoss}
                    />
                  </View>
                )}
              </View>

              {sportType !== 'gym' && (
                <View style={styles.formGroup}>
                  <Text style={[styles.label, dynamicStyles.sublabel]}>{t('training.routeMap')}</Text>
                  <TouchableOpacity
                    style={[styles.routeUploadButton, dynamicStyles.input]}
                    onPress={() => {
                      if (routePolyline) {
                        Alert.alert(t('training.replaceRouteTitle'), t('training.replaceRouteMessage'), [
                          { text: t('training.close'), style: 'cancel' },
                          { text: t('training.confirm'), onPress: () => void handlePickRouteFile() },
                        ]);
                      } else {
                        void handlePickRouteFile();
                      }
                    }}
                    disabled={pickPolyline.isPending}
                  >
                    {routePolyline ? (
                      <Route size={16} color={themeColors.primary} />
                    ) : (
                      <Upload size={16} color={themeColors.primary} />
                    )}
                    <Text style={[styles.routeUploadButtonText, { color: themeColors.primary }]}>
                      {routePolyline ? t('training.replaceRoute') : t('training.uploadRoute')}
                    </Text>
                  </TouchableOpacity>

                  {routePolyline && (
                    <View style={styles.routeMapPreview}>
                      <RouteMap
                        polyline={routePolyline}
                        strokeColor={themeColors.primary}
                        height={200}
                        isDark={isDark}
                      />
                    </View>
                  )}

                  {routeDetails?.heartRateZones && routeDetails.heartRateZones.length > 0 && (
                    <View style={[styles.routeInsightsCard, dynamicStyles.glassCard]}>
                      <Text style={[styles.routeInsightsTitle, { color: themeColors.textPrimary }]}>
                        {t('training.heartRateZones')}
                      </Text>
                      {routeDetails.heartRateZones.map(zone => (
                        <View key={`hr-zone-${zone.zone}`} style={styles.zoneRow}>
                          <Text style={[styles.zoneIndex, { color: zoneColorById[zone.zone] }]}>{zone.zone}</Text>
                          <View
                            style={[
                              styles.zoneTrack,
                              { backgroundColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)' },
                            ]}
                          >
                            <View
                              style={[
                                styles.zoneFill,
                                {
                                  width: `${Math.max(0, Math.min(100, zone.percentage))}%`,
                                  backgroundColor: zoneColorById[zone.zone],
                                },
                              ]}
                            />
                          </View>
                          <Text style={[styles.zoneMetric, { color: themeColors.textPrimary }]}>
                            {Math.round(zone.percentage)}%
                          </Text>
                          <Text style={[styles.zoneMetric, { color: themeColors.textSecondary }]}>
                            {formatSplitDuration(zone.durationSeconds)}
                          </Text>
                        </View>
                      ))}
                    </View>
                  )}

                  {splitTabs.length > 0 && activeSplits.length > 0 && (
                    <View style={[styles.routeInsightsCard, dynamicStyles.glassCard]}>
                      <Text style={[styles.routeInsightsTitle, { color: themeColors.textPrimary }]}>
                        {t('training.partials')}
                      </Text>

                      <View style={styles.splitTabsRow}>
                        {splitTabs.map(tab => {
                          const isActive = activeSplitTab?.key === tab.key;
                          return (
                            <TouchableOpacity
                              key={tab.key}
                              onPress={() => setSelectedSplitTabKey(tab.key)}
                              style={[
                                styles.splitTab,
                                {
                                  backgroundColor: isActive
                                    ? themeColors.primary
                                    : isDark
                                      ? 'rgba(255,255,255,0.08)'
                                      : 'rgba(0,0,0,0.05)',
                                },
                              ]}
                            >
                              <Text
                                style={[
                                  styles.splitTabText,
                                  { color: isActive ? '#FFFFFF' : themeColors.textSecondary },
                                ]}
                              >
                                {tab.label}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>

                      <View style={styles.splitLegendRow}>
                        <Text style={[styles.splitLegendText, { color: themeColors.textSecondary }]}>
                          {t('training.splitFast')}
                        </Text>
                        <LinearGradient
                          colors={
                            isDark
                              ? ['rgba(90,200,250,0.25)', 'rgba(255,255,255,0.05)', 'rgba(255,160,180,0.24)']
                              : ['rgba(90,200,250,0.16)', 'rgba(0,0,0,0.03)', 'rgba(255,160,180,0.16)']
                          }
                          style={styles.splitLegendGradient}
                          start={{ x: 0, y: 0.5 }}
                          end={{ x: 1, y: 0.5 }}
                        />
                        <Text style={[styles.splitLegendText, { color: themeColors.textSecondary }]}>
                          {t('training.splitSlow')}
                        </Text>
                      </View>

                      <View
                        style={[
                          styles.splitsHeaderRow,
                          { borderBottomColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)' },
                        ]}
                      >
                        <Text style={[styles.splitsHeaderCell, { width: 28, color: themeColors.textSecondary }]}>
                          #
                        </Text>
                        <Text style={[styles.splitsHeaderCell, { flex: 1, color: themeColors.textSecondary }]}>
                          {t('settings.distance')}
                        </Text>
                        <Text style={[styles.splitsHeaderCell, { flex: 1, color: themeColors.textSecondary }]}>
                          {t('training.duration')}
                        </Text>
                        <Text style={[styles.splitsHeaderCell, { flex: 1.1, color: themeColors.textSecondary }]}>
                          {t('training.pace')}
                        </Text>
                        <Text
                          style={[
                            styles.splitsHeaderCell,
                            { width: 64, textAlign: 'right', color: themeColors.textSecondary },
                          ]}
                        >
                          {t('training.avgHeartRate')}
                        </Text>
                      </View>

                      {activeSplits.map((lap, index) => (
                        <View
                          key={`split-${activeSplitTab?.key ?? 'none'}-${lap.lapIndex}-${index}`}
                          style={[
                            styles.splitRow,
                            {
                              borderBottomColor:
                                index === activeSplits.length - 1
                                  ? 'transparent'
                                  : isDark
                                    ? 'rgba(255,255,255,0.08)'
                                    : 'rgba(0,0,0,0.06)',
                            },
                          ]}
                        >
                          <Text style={[styles.splitCell, { width: 28, color: themeColors.textSecondary }]}>
                            {lap.lapIndex}
                          </Text>
                          <Text style={[styles.splitCell, { flex: 1, color: themeColors.textPrimary }]}>
                            {formatSplitDistance(lap.distanceM)}
                          </Text>
                          <Text style={[styles.splitCell, { flex: 1, color: themeColors.textPrimary }]}>
                            {formatSplitDuration(lap.durationSeconds)}
                          </Text>
                          <View
                            style={[
                              styles.paceCell,
                              {
                                flex: 1.1,
                                backgroundColor: resolvePaceCellBackground(lap),
                              },
                            ]}
                          >
                            <Text style={[styles.splitCell, { color: themeColors.textPrimary }]}>
                              {formatSplitPace(lap)}
                            </Text>
                          </View>
                          <Text
                            style={[
                              styles.splitCell,
                              { width: 64, textAlign: 'right', color: themeColors.textPrimary },
                            ]}
                          >
                            {lap.avgHeartRate != null ? `${Math.round(lap.avgHeartRate)} ${t('health.unitBpm')}` : '-'}
                          </Text>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              )}
            </>
          )}

          {pendingStrengthImport && (
            <Modal
              animationType="fade"
              transparent={true}
              visible={!!pendingStrengthImport}
              onRequestClose={() => setPendingStrengthImport(null)}
            >
              <View style={styles.importModalOverlay}>
                <View style={[styles.importModalCard, dynamicStyles.card]}>
                  <Text style={[styles.importModalTitle, dynamicStyles.title]}>{t('training.importedActivityPreview')}</Text>
                  <View style={styles.importPreviewRow}>
                    <Text style={[styles.label, dynamicStyles.sublabel]}>{t('training.duration')}</Text>
                    <Text style={[styles.importPreviewValue, { color: themeColors.textPrimary }]}>
                      {pendingStrengthImport.durationSeconds != null
                        ? `${Math.floor(pendingStrengthImport.durationSeconds / 3600)}h ${Math.floor((pendingStrengthImport.durationSeconds % 3600) / 60)}min :${Math.floor(pendingStrengthImport.durationSeconds % 60)}s`
                        : '-'}
                    </Text>
                  </View>
                  <View style={styles.importPreviewRow}>
                    <Text style={[styles.label, dynamicStyles.sublabel]}>{t('training.caloriesKcal')}</Text>
                    <Text style={[styles.importPreviewValue, { color: themeColors.textPrimary }]}>
                      {pendingStrengthImport.caloriesKcal != null
                        ? `${Math.round(pendingStrengthImport.caloriesKcal)}`
                        : '-'}
                    </Text>
                  </View>
                  <View style={styles.importModalActions}>
                    <TouchableOpacity
                      style={[styles.importModalButton, styles.importModalCancel]}
                      onPress={() => setPendingStrengthImport(null)}
                    >
                      <Text style={[styles.importModalCancelText, { color: themeColors.textSecondary }]}>
                        {t('common.cancel')}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.importModalButton, styles.importModalApply]}
                      onPress={handleApplyStrengthActivityImport}
                      disabled={applyStrengthActivityImport.isPending}
                    >
                      <Text style={styles.importModalApplyText}>
                        {applyStrengthActivityImport.isPending ? '...' : t('training.applyImportedActivity')}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            </Modal>
          )}

          {/* --- SHARED MODALS (Duration, Date, Time) --- */}

          {/* Duration Picker Modal */}
          {showDurationPicker && (
            <Modal
              animationType="slide"
              transparent={true}
              visible={showDurationPicker}
              onRequestClose={() => setShowDurationPicker(false)}
            >
              <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' }}>
                <View
                  style={{
                    backgroundColor: isDark ? themeColors.surfaceSolid : colors.background,
                    paddingBottom: 30,
                    borderTopLeftRadius: 20,
                    borderTopRightRadius: 20,
                  }}
                >
                  <View
                    style={{
                      flexDirection: 'row',
                      justifyContent: 'flex-end',
                      padding: 16,
                      borderBottomWidth: 1,
                      borderBottomColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)',
                    }}
                  >
                    <TouchableOpacity onPress={() => setShowDurationPicker(false)}>
                      <Text style={{ color: themeColors.primary, fontWeight: '600', fontSize: 16 }}>
                        {t('common.done')}
                      </Text>
                    </TouchableOpacity>
                  </View>
                  <View
                    style={{
                      flexDirection: 'row',
                      justifyContent: 'center',
                      alignItems: 'center',
                      paddingVertical: 20,
                    }}
                  >
                    <View style={{ alignItems: 'center' }}>
                      <Text style={{ color: themeColors.textSecondary, fontSize: 12, marginBottom: 8 }}>
                        {t('training.hours')}
                      </Text>
                      <SimpleWheelPicker
                        items={Array.from({ length: 24 }, (_, i) => i.toString())}
                        selectedValue={durationHours || '0'}
                        onValueChange={val => setDurationHours(val)}
                        width={80}
                        height={150}
                      />
                    </View>
                    <Text
                      style={{
                        fontSize: 28,
                        fontWeight: 'bold',
                        color: themeColors.textPrimary,
                        marginHorizontal: 8,
                      }}
                    >
                      :
                    </Text>
                    <View style={{ alignItems: 'center' }}>
                      <Text style={{ color: themeColors.textSecondary, fontSize: 12, marginBottom: 8 }}>
                        {t('training.minutes')}
                      </Text>
                      <SimpleWheelPicker
                        items={Array.from({ length: 60 }, (_, i) => i.toString())}
                        selectedValue={durationMinutes || '0'}
                        onValueChange={val => setDurationMinutes(val)}
                        width={80}
                        height={150}
                      />
                    </View>
                    <Text
                      style={{
                        fontSize: 28,
                        fontWeight: 'bold',
                        color: themeColors.textPrimary,
                        marginHorizontal: 8,
                      }}
                    >
                      :
                    </Text>
                    <View style={{ alignItems: 'center' }}>
                      <Text style={{ color: themeColors.textSecondary, fontSize: 12, marginBottom: 8 }}>
                        {t('training.seconds')}
                      </Text>
                      <SimpleWheelPicker
                        items={Array.from({ length: 60 }, (_, i) => i.toString())}
                        selectedValue={durationSeconds || '0'}
                        onValueChange={val => setDurationSeconds(val)}
                        width={80}
                        height={150}
                      />
                    </View>
                  </View>
                </View>
              </View>
            </Modal>
          )}

          {/* Date Picker Handling */}
          {showDatePicker &&
            (Platform.OS === 'ios' ? (
              <Modal
                animationType="slide"
                transparent={true}
                visible={showDatePicker}
                onRequestClose={() => setShowDatePicker(false)}
              >
                <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' }}>
                  <View
                    style={{
                      backgroundColor: isDark ? themeColors.surfaceSolid : colors.background,
                      paddingBottom: 30,
                      borderTopLeftRadius: 20,
                      borderTopRightRadius: 20,
                    }}
                  >
                    <View
                      style={{
                        flexDirection: 'row',
                        justifyContent: 'flex-end',
                        padding: 16,
                        borderBottomWidth: 1,
                        borderBottomColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)',
                      }}
                    >
                      <TouchableOpacity onPress={() => setShowDatePicker(false)}>
                        <Text style={{ color: themeColors.primary, fontWeight: '600', fontSize: 16 }}>
                          {t('common.done')}
                        </Text>
                      </TouchableOpacity>
                    </View>
                    <DateTimePicker
                      value={new Date(date)}
                      mode="date"
                      display="inline"
                      onChange={(event, selectedDate) => {
                        if (selectedDate) setDate(selectedDate.toISOString().split('T')[0]);
                      }}
                      textColor={themeColors.textPrimary}
                      style={{ height: 320, width: '100%' }} // Ensure size for calendar
                      themeVariant={isDark ? 'dark' : 'light'}
                    />
                  </View>
                </View>
              </Modal>
            ) : (
              <DateTimePicker
                value={new Date(date)}
                mode="date"
                display="default"
                onChange={(event, selectedDate) => {
                  setShowDatePicker(false);
                  if (selectedDate) setDate(selectedDate.toISOString().split('T')[0]);
                }}
              />
            ))}

          {/* Time Picker Handling */}
          {showTimePicker &&
            (Platform.OS === 'ios' ? (
              <Modal
                animationType="slide"
                transparent={true}
                visible={showTimePicker}
                onRequestClose={() => setShowTimePicker(false)}
              >
                <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' }}>
                  <View
                    style={{
                      backgroundColor: isDark ? themeColors.surfaceSolid : colors.background,
                      paddingBottom: 30,
                      borderTopLeftRadius: 20,
                      borderTopRightRadius: 20,
                    }}
                  >
                    <View
                      style={{
                        flexDirection: 'row',
                        justifyContent: 'flex-end',
                        padding: 16,
                        borderBottomWidth: 1,
                        borderBottomColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)',
                      }}
                    >
                      <TouchableOpacity onPress={() => setShowTimePicker(false)}>
                        <Text style={{ color: themeColors.primary, fontWeight: '600', fontSize: 16 }}>
                          {t('common.done')}
                        </Text>
                      </TouchableOpacity>
                    </View>
                    <DateTimePicker
                      value={(() => {
                        const [hours, minutes] = time.split(':');
                        const d = new Date();
                        d.setHours(parseInt(hours), parseInt(minutes));
                        return d;
                      })()}
                      mode="time"
                      display="spinner"
                      onChange={(event, selectedDate) => {
                        if (selectedDate) setTime(selectedDate.toTimeString().slice(0, 5));
                      }}
                      textColor={themeColors.textPrimary}
                    />
                  </View>
                </View>
              </Modal>
            ) : (
              <DateTimePicker
                value={(() => {
                  const [hours, minutes] = time.split(':');
                  const d = new Date();
                  d.setHours(parseInt(hours), parseInt(minutes));
                  return d;
                })()}
                mode="time"
                display="default"
                onChange={(event, selectedDate) => {
                  setShowTimePicker(false);
                  if (selectedDate) setTime(selectedDate.toTimeString().slice(0, 5));
                }}
              />
            ))}
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    // backgroundColor: colors.background, // Removed for gradient
  },
  safeArea: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.m,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.05)',
  },
  cancelText: {
    ...typography.body,
    color: colors.danger,
  },
  title: {
    ...typography.h3,
  },
  saveText: {
    ...typography.body,
    fontWeight: 'bold',
    color: colors.primary,
  },
  content: {
    padding: spacing.m,
    paddingBottom: 120,
  },
  formGroup: {
    marginBottom: spacing.m,
  },
  label: {
    ...typography.caption,
    fontWeight: '600',
    marginBottom: 4,
    marginLeft: 4,
  },
  durationSubLabel: {
    ...typography.caption,
    fontSize: 12,
    color: colors.textSecondary,
    marginBottom: 4,
    marginLeft: 4,
  },
  input: {
    borderRadius: borderRadius.m,
    padding: spacing.m,
    fontSize: 16,
  },
  sportSelector: {
    gap: spacing.s,
    paddingBottom: spacing.s,
  },
  sportChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.05)',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: borderRadius.full,
    gap: 6,
  },
  sportChipActive: {
    backgroundColor: colors.primary,
  },
  sportChipText: {
    ...typography.caption,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  sportChipTextActive: {
    color: '#FFFFFF',
  },
  row: {
    flexDirection: 'row',
  },
  // Gym Specific Styles
  gymContainer: {
    gap: spacing.m,
  },
  gymSummaryCard: {
    borderRadius: borderRadius.m,
    padding: spacing.m,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.05)',
  },
  gymSummaryTitle: {
    ...typography.body,
    fontWeight: '600',
    marginBottom: spacing.m,
    color: colors.textPrimary,
  },
  gymStatsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  gymStatItem: {
    alignItems: 'center',
  },
  gymStatValue: {
    ...typography.h3,
    marginBottom: 2,
  },
  gymStatLabel: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  importedRow: {
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  importedRowValue: {
    ...typography.body,
    fontWeight: '700',
    marginLeft: spacing.m,
    textAlign: 'right',
  },
  helperContainer: {
    alignItems: 'center',
    padding: spacing.m,
    marginTop: spacing.s,
  },
  helperText: {
    ...typography.caption,
    fontSize: 12,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
  },
  routeUploadButton: {
    borderRadius: borderRadius.m,
    paddingHorizontal: spacing.m,
    paddingVertical: spacing.m,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  routeUploadButtonText: {
    ...typography.caption,
    fontWeight: '700',
  },
  routeMapPreview: {
    marginTop: spacing.s,
  },
  routeInsightsCard: {
    marginTop: spacing.m,
    borderRadius: borderRadius.l,
    padding: spacing.m,
  },
  routeInsightsTitle: {
    ...typography.body,
    fontWeight: '700',
    marginBottom: spacing.s,
  },
  zoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.s,
  },
  zoneIndex: {
    ...typography.body,
    width: 18,
    fontWeight: '800',
    textAlign: 'center',
    marginRight: spacing.s,
  },
  zoneTrack: {
    flex: 1,
    height: 8,
    borderRadius: borderRadius.full,
    overflow: 'hidden',
  },
  zoneFill: {
    height: '100%',
    borderRadius: borderRadius.full,
  },
  zoneMetric: {
    ...typography.caption,
    width: 52,
    textAlign: 'right',
    marginLeft: spacing.s,
  },
  splitTabsRow: {
    flexDirection: 'row',
    gap: spacing.s,
    marginBottom: spacing.s,
    flexWrap: 'wrap',
  },
  splitTab: {
    borderRadius: borderRadius.full,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  splitTabText: {
    ...typography.caption,
    fontWeight: '700',
  },
  splitLegendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.s,
  },
  splitLegendText: {
    ...typography.caption,
    fontWeight: '600',
    width: 56,
  },
  splitLegendGradient: {
    flex: 1,
    height: 10,
    borderRadius: borderRadius.full,
    marginHorizontal: spacing.s,
  },
  splitsHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    paddingBottom: spacing.s,
  },
  splitsHeaderCell: {
    ...typography.caption,
    fontWeight: '700',
    paddingHorizontal: 2,
  },
  splitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.s,
    borderBottomWidth: 1,
  },
  splitCell: {
    ...typography.caption,
    fontSize: 12,
    paddingHorizontal: 2,
  },
  paceCell: {
    borderRadius: borderRadius.s,
    paddingVertical: 6,
    paddingHorizontal: 6,
  },
  importModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    padding: spacing.l,
  },
  importModalCard: {
    borderRadius: borderRadius.l,
    padding: spacing.m,
  },
  importModalTitle: {
    ...typography.h3,
    marginBottom: spacing.m,
    textAlign: 'center',
  },
  importPreviewRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.s,
  },
  importPreviewValue: {
    ...typography.body,
    fontWeight: '700',
  },
  importModalActions: {
    marginTop: spacing.s,
    flexDirection: 'row',
    gap: spacing.s,
  },
  importModalButton: {
    flex: 1,
    height: 42,
    borderRadius: borderRadius.m,
    alignItems: 'center',
    justifyContent: 'center',
  },
  importModalCancel: {
    backgroundColor: 'rgba(127,127,127,0.18)',
  },
  importModalApply: {
    backgroundColor: colors.primary,
  },
  importModalCancelText: {
    ...typography.body,
    fontWeight: '600',
  },
  importModalApplyText: {
    ...typography.body,
    color: '#fff',
    fontWeight: '700',
  },
});
