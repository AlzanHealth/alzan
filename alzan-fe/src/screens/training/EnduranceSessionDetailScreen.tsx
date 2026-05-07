import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Pressable,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  TouchableWithoutFeedback,
  ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { TrainingScreenNavigationProp, TrainingStackParamList } from '../../types/navigation.types';
import { GlassCard } from '../../components/GlassCard';
import { colors, spacing, typography, borderRadius } from '../../theme';
import { useTrainingStyles } from '../../hooks/useTrainingStyles';
import { SPORTS_CONFIG, formatDuration } from '../../constants/sports';
import { format } from 'date-fns';
import { useUserPreferences } from '../../hooks/useUserPreferences';
import { useSessionDetail, useUpdateWorkoutSet } from '../../hooks/useSessionDetail';
import { useEnduranceTemplateSteps } from '../../hooks/useEnduranceSessions';
import { useSessionLaps, type ActivityLap as SessionLap } from '../../hooks/useSessionLaps';
import { useSessionHeartRateZones } from '../../hooks/useSessionHeartRateZones';
import { useUnitConversion } from '../../hooks/useUnitConversion';
import {
  Clock,
  MapPin,
  Activity,
  Dumbbell,
  Award,
  Flame,
  Target,
  Gauge,
  Infinity as InfinityIcon,
  ChevronRight,
  Pencil,
  X,
  Route,
  Upload,
} from 'lucide-react-native';
import { Alert } from '../../components/common/Alert';
import { ActivitySession, EnduranceWorkoutStep } from '../../types/requests.types';
import { useTranslation } from 'react-i18next';
import { getPhaseLabel } from './helpers/phase.helper';
import { getDateFnsLocale } from '../../i18n/dateLocale';
import { useUploadPolyline } from '../../hooks/useActivityPolyline';
import { useApplyStrengthActivityImport } from '../../hooks/useStrengthActivityImport';
import { useSessionImportedStrengthSummary } from '../../hooks/useSessionImportedStrengthSummary';
import { Tooltip } from '../../components/common/Tooltip';
import { RouteMap } from '../../components/common/RouteMap';
import { STRENGTH_ACTIVITY_UNSUPPORTED_ERROR_TAG } from '../../services/strengthActivityImportService';

export const EnduranceSessionDetailScreen = () => {
  const { t } = useTranslation();
  const { styles: dynamicStyles, colors: themeColors, isDark } = useTrainingStyles();
  const navigation = useNavigation<TrainingScreenNavigationProp>();
  const route = useRoute<RouteProp<TrainingStackParamList, 'EnduranceSessionDetail'>>();
  const { session: initialSession } = route.params || {};
  const [session, setSession] = useState<ActivitySession | undefined>(initialSession);
  const { preferences, toDisplayWeight } = useUserPreferences();
  const { convertDistanceToUi, convertSpeedToUi } = useUnitConversion();
  const updateSet = useUpdateWorkoutSet();
  const applyStrengthActivityImport = useApplyStrengthActivityImport();

  // State for editing sets (gym only)
  const [editingSet, setEditingSet] = useState<{
    id: string;
    set_number: number;
    reps: number;
    weight_kg: number;
  } | null>(null);
  const [editReps, setEditReps] = useState('');
  const [editWeight, setEditWeight] = useState('');

  const [routePolyline, setRoutePolyline] = useState<string | null>(session?.route_polyline ?? null);
  const [selectedSplitTabKey, setSelectedSplitTabKey] = useState<string | null>(null);

  // Controls parent ScrollView scrolling — disabled while the user interacts with the map.
  const [mapScrollEnabled, setMapScrollEnabled] = useState(true);
  const handleMapInteractionStart = useCallback(() => setMapScrollEnabled(false), []);
  const handleMapInteractionEnd = useCallback(() => setMapScrollEnabled(true), []);

  // Route upload mutation
  const uploadPolyline = useUploadPolyline({
    onPolylineUploaded: polyline => setRoutePolyline(polyline),
  });

  // Fetch workout sets for gym sessions
  const { data: sessionDetail } = useSessionDetail(session?.sport_type === 'strength' ? session?.id : undefined);
  const exerciseGroups = sessionDetail?.exerciseGroups || [];
  const supersetLinks = sessionDetail?.supersetLinks || [];

  // Fetch data for endurance template steps (use endurance_template_id for non-gym)
  const { data: templateSteps } = useEnduranceTemplateSteps(session?.endurance_template_id);

  // Fetch laps
  const { data: laps } = useSessionLaps(session?.id);
  const { data: heartRateZones } = useSessionHeartRateZones(session?.id);
  const { data: importedStrengthSummary } = useSessionImportedStrengthSummary(session?.id);

  const formatSplitDistanceBucketLabel = useCallback((splitDistanceM: number) => {
    const distanceKm = splitDistanceM / 1000;
    const labelValue = Number.isInteger(distanceKm) ? distanceKm.toString() : distanceKm.toFixed(1);
    return `${labelValue} km`;
  }, []);

  const splitTabs = useMemo<
    Array<{
      key: string;
      label: string;
      laps: SessionLap[];
    }>
  >(() => {
    if (!laps || laps.length === 0) return [];

    const grouped = new Map<
      string,
      {
        splitGroup: 'legacy' | 'custom' | 'distance';
        splitDistanceM: number | null;
        splitGroupOrder: number;
        laps: SessionLap[];
      }
    >();

    laps.forEach(lap => {
      const splitGroup = lap.split_group ?? 'legacy';
      const splitDistanceM = lap.split_distance_m ?? null;
      const splitGroupOrder = lap.split_group_order ?? 0;
      const groupKey = `${splitGroupOrder}-${splitGroup}-${splitDistanceM ?? 'none'}`;
      const current = grouped.get(groupKey);

      if (current) {
        current.laps.push(lap);
        return;
      }

      grouped.set(groupKey, {
        splitGroup,
        splitDistanceM,
        splitGroupOrder,
        laps: [lap],
      });
    });

    return Array.from(grouped.entries())
      .sort((left, right) => {
        const leftGroup = left[1];
        const rightGroup = right[1];

        if (leftGroup.splitGroupOrder !== rightGroup.splitGroupOrder) {
          return leftGroup.splitGroupOrder - rightGroup.splitGroupOrder;
        }

        return (leftGroup.splitDistanceM ?? 0) - (rightGroup.splitDistanceM ?? 0);
      })
      .map(([groupKey, group]) => ({
        key: groupKey,
        label:
          group.splitGroup === 'distance' && group.splitDistanceM != null && group.splitDistanceM > 0
            ? formatSplitDistanceBucketLabel(group.splitDistanceM)
            : t('training.splitCustom'),
        laps: [...group.laps].sort((left, right) => left.lap_index - right.lap_index),
      }));
  }, [formatSplitDistanceBucketLabel, laps, t]);

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
    .map(split => split.avg_pace_s_per_km)
    .filter((value): value is number => value != null && Number.isFinite(value) && value > 0);
  const fastestPace = activeSplitPaceValues.length > 0 ? Math.min(...activeSplitPaceValues) : null;
  const slowestPace = activeSplitPaceValues.length > 0 ? Math.max(...activeSplitPaceValues) : null;

  const resolvePaceCellBackground = useCallback(
    (lap: SessionLap) => {
      if (lap.avg_pace_s_per_km == null || fastestPace == null || slowestPace == null) {
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

      const ratio = (lap.avg_pace_s_per_km - fastestPace) / range;
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

  const formatSplitDistance = useCallback(
    (distanceM: number | null) => {
      if (distanceM == null || distanceM <= 0) return '-';
      const convertedDistance = convertDistanceToUi(distanceM, 2);
      const numericValue = Number(convertedDistance.value);
      const decimals = numericValue >= 10 ? 1 : 2;
      return `${numericValue.toFixed(decimals)} ${convertedDistance.unit}`;
    },
    [convertDistanceToUi],
  );

  const formatSplitDuration = useCallback((durationSeconds: number | null) => {
    if (durationSeconds == null || durationSeconds <= 0) return '--';
    const minutes = Math.floor(durationSeconds / 60);
    const seconds = durationSeconds - minutes * 60;
    return `${minutes.toString().padStart(2, '0')}:${seconds.toFixed(1).padStart(4, '0')}`;
  }, []);

  const formatSplitPace = useCallback(
    (lap: SessionLap) => {
      if (lap.avg_pace_s_per_km == null || lap.avg_pace_s_per_km <= 0) return '-';
      const speedMps = 1000 / lap.avg_pace_s_per_km;
      if (!Number.isFinite(speedMps) || speedMps <= 0) return '-';
      return convertSpeedToUi(speedMps, session?.sport_type ?? 'other').label;
    },
    [convertSpeedToUi, session?.sport_type],
  );

  const formatMaybeDuration = useCallback(
    (durationSeconds: number | null | undefined) =>
      durationSeconds != null && durationSeconds > 0 ? formatDuration(durationSeconds) : '-',
    [],
  );

  const handlePickStrengthActivityFile = useCallback(() => {
    if (!session) return;

    applyStrengthActivityImport.mutate(
      {
        sessionId: session.id,
      },
      {
        onSuccess: summary => {
          setSession(current => {
            if (!current) return current;
            return {
              ...current,
              provider: summary.provider === 'unknown' ? 'other' : summary.provider,
              imported_at: new Date().toISOString(),
              start_time: summary.startedAt ?? current.start_time,
              end_time: summary.endedAt ?? current.end_time,
              duration_s: summary.durationSeconds ?? current.duration_s,
              calories_kcal: summary.caloriesKcal ?? current.calories_kcal,
              avg_heart_rate: summary.avgHeartRate ?? current.avg_heart_rate,
              max_heart_rate: summary.maxHeartRate ?? current.max_heart_rate,
              min_heart_rate: summary.minHeartRate ?? current.min_heart_rate,
              tss_hr: summary.tss ?? current.tss_hr,
              epoc: summary.epoc ?? current.epoc,
              pte: summary.pte ?? current.pte,
              total_steps: summary.totalSteps ?? current.total_steps,
              recovery_time_s: summary.recoveryTimeSeconds ?? current.recovery_time_s,
            };
          });
          Alert.alert(t('training.uploadActivityFile'), t('training.importedFileApplied'));
        },
        onError: (error: Error) => {
          if (error.message === 'CANCELLED') return;
          const message =
            error.message === STRENGTH_ACTIVITY_UNSUPPORTED_ERROR_TAG
              ? t('training.strengthActivityUnsupportedError')
              : error.message === 'STRENGTH_ACTIVITY_PARSE_ERROR'
                ? t('training.strengthActivityParseError')
                : t('training.importActivityFileError');
          Alert.alert(t('training.uploadActivityFile'), message);
        },
      },
    );
  }, [applyStrengthActivityImport, session, t]);

  if (!session) return null;

  const config = SPORTS_CONFIG[session.sport_type] || SPORTS_CONFIG.other;
  // Explicitly use Dumbbell for gym/strength sessions, otherwise use config icon
  const isGymSession = session.sport_type === 'strength';
  const Icon = isGymSession ? Dumbbell : config.icon;
  const zoneColorById: Record<1 | 2 | 3 | 4 | 5, string> = {
    5: '#FF3B30',
    4: '#FF9500',
    3: '#FFCC00',
    2: '#34C759',
    1: '#5AC8FA',
  };
  const resolveZoneColor = (zone: number): string => {
    if (zone >= 5) return zoneColorById[5];
    if (zone === 4) return zoneColorById[4];
    if (zone === 3) return zoneColorById[3];
    if (zone === 2) return zoneColorById[2];
    return zoneColorById[1];
  };

  // Helper to format step target (handles null values)
  const formatStepTarget = (step: EnduranceWorkoutStep) => {
    // If no target type or it's 'none', don't show target
    if (!step.target_type || step.target_type === 'none') return null;

    const min = step.target_min;
    const max = step.target_max;

    // If both values are null, don't show
    if (min == null && max == null) return null;

    // Format based on target type
    if (step.target_type === 'heart_rate_zone') {
      // It's a zone number, not a BPM range
      return `${t('training.hrZone')} ${max || min}`;
    }
    if (step.target_type === 'heart_rate') {
      // Detect if values are small (1-5) = zones, or larger = BPM
      const value = max ?? min;
      if (value && value <= 5) {
        return `${t('training.hrZone')} ${value}`;
      }
      if (min != null && max != null) {
        if (min === max) return `${t('health.heartRate')}: ${min} bpm`;
        return `${t('health.heartRate')}: ${min}-${max} bpm`;
      }
      if (min != null) return `${t('health.heartRate')}: >${min} bpm`;
      if (max != null) return `${t('health.heartRate')}: <${max} bpm`;
    }
    if (step.target_type === 'pace') {
      // Format pace. DB stores pace in seconds/km usually?
      // Or steps might store plain seconds. Assuming seconds/km if it's running.
      // convertSpeedToUi expects m/s.
      // s/km -> m/s: 1000 / s

      const toLabel = (paceSeconds: number) => {
        const speedMps = 1000 / paceSeconds;
        if (!isFinite(speedMps)) return '-';
        return convertSpeedToUi(speedMps, session.sport_type).label;
      };

      if (min != null && max != null) {
        if (min === max) {
          return `${t('training.pace')}: ${toLabel(min)}`;
        }
        return `${t('training.pace')}: ${toLabel(min)}-${toLabel(max)}`;
      }
      if (min != null) return `${t('training.pace')}: <${toLabel(min)}`;
      if (max != null) return `${t('training.pace')}: >${toLabel(max)}`;
    }
    if (step.target_type === 'power') {
      if (min != null && max != null) {
        if (min === max) return `${t('training.power')}: ${min}W`;
        return `${t('training.power')}: ${min}-${max}W`;
      }
      if (min != null) return `${t('training.power')}: >${min}W`;
      if (max != null) return `${t('training.power')}: <${max}W`;
    }
    if (step.target_type === 'rpe') {
      if (min != null && max != null) {
        if (min === max) return `RPE: ${min}`;
        return `RPE: ${min}-${max}`;
      }
      if (min != null || max != null) return `RPE: ${min || max}`;
    }
    return null;
  };

  const formatStepDuration = (step: EnduranceWorkoutStep) => {
    if (step.duration_type === 'distance' && step.distance_m) {
      const { value, unit } = convertDistanceToUi(step.distance_m, 2);
      return `${value} ${unit}`;
    }
    if (step.duration_type === 'time' && step.duration_s) {
      return formatDuration(step.duration_s);
    }
    // For group steps, don't show duration
    if (step.is_group) return null;
    return t('training.openEnded');
  };

  const getPhaseColor = (phase: string) => {
    switch (phase) {
      case 'warmup':
        return themeColors.success;
      case 'cooldown':
        return themeColors.accent;
      case 'main':
      case 'interval':
      case 'work':
        return themeColors.danger;
      case 'recovery':
      case 'rest':
        return themeColors.textSecondary;
      default:
        return themeColors.primary;
    }
  };

  // Prep main stats
  const distObj = convertDistanceToUi(session.distance_m, 2);
  // Calculate Speed/Pace
  let speedMps = 0;
  if (session.avg_speed_m_per_s) {
    speedMps = session.avg_speed_m_per_s;
  } else if (session.distance_m && session.duration_s && session.duration_s > 0) {
    speedMps = session.distance_m / session.duration_s;
  }
  if (speedMps > 0) {
    //paceLabel = convertSpeedToUi(speedMps, session.sport_type as SportType).value.toString(); // Wait, value is number. Label is string.
    // Actually stat card logic below expects the value to be the main big text, and label small.
    // convertSpeedToUi returns { value, unit, label }.
    // Example: value: 5.30 (min.sec?), unit: 'min/km', label: '5:30 min/km'
    // But for running pace we want "5:30" as value and "min/km" as label.
    // The hook returns value as decimal minutes for pace? Let's check hook.
    // Hook for pace: value is decimal minutes (5.5). Label is formatted "5:30 min/km".
    // I should stick to the label for the full text or format manually here?
    // Existing UI splits value and label.
    // Let's use `label` split or just use the whole label in value?
    // Reuse convertSpeedToUi return fully.
  }
  const speedObj = convertSpeedToUi(speedMps, session.sport_type);

  const exerciseIndexById = new Map<string, number>();
  exerciseGroups.forEach((group, index) => {
    exerciseIndexById.set(group.exercise_id, index);
  });

  const supersetConnectorIndexes = new Set<number>();
  supersetLinks.forEach(link => {
    const fromIndex = exerciseIndexById.get(link.from_exercise_id);
    const toIndex = exerciseIndexById.get(link.to_exercise_id);
    if (fromIndex === undefined || toIndex === undefined) return;
    if (toIndex === fromIndex + 1) {
      supersetConnectorIndexes.add(fromIndex);
    }
  });

  const recoveryHours =
    session.recovery_time_s != null && session.recovery_time_s > 0
      ? Math.round((session.recovery_time_s / 3600) * 10) / 10
      : null;

  const secondaryMetrics: Array<{ key: string; label: string; value: string }> = [];
  if (!isGymSession) {
    if (session.avg_heart_rate != null) {
      secondaryMetrics.push({
        key: 'avg-heart-rate',
        label: t('health.heartRate'),
        value: `${session.avg_heart_rate}${t('health.unitBpm')}`,
      });
    }
    if (session.elev_gain_m != null) {
      secondaryMetrics.push({
        key: 'elevation-gain',
        label: t('training.elevationM'),
        value: `${Math.round(session.elev_gain_m)} m`,
      });
    }
    if (session.elev_loss_m != null) {
      secondaryMetrics.push({
        key: 'elevation-loss',
        label: t('training.elevationLossM'),
        value: `${Math.round(session.elev_loss_m)} m`,
      });
    }
    if (session.rpe != null) {
      secondaryMetrics.push({
        key: 'rpe',
        label: t('training.effortRpe'),
        value: `${Math.round(session.rpe)}/10`,
      });
    }
    if (session.vo2_max != null) {
      secondaryMetrics.push({
        key: 'vo2',
        label: t('training.vo2Max'),
        value: `${session.vo2_max.toFixed(1)}`,
      });
    }
    if (session.total_steps != null) {
      secondaryMetrics.push({
        key: 'steps',
        label: t('training.totalSteps'),
        value: `${session.total_steps}`,
      });
    }
    if (recoveryHours != null) {
      secondaryMetrics.push({
        key: 'recovery',
        label: t('training.recoveryTime'),
        value: `${recoveryHours} h`,
      });
    }
  }

  const handleImportedMetricInfoPress = useCallback(
    (metricKey: string) => {
      const infoByMetric: Record<string, { title: string; description: string }> = {
        duration: {
          title: t('training.durationInfoTitle'),
          description: t('training.durationInfoDescription'),
        },
        calories: {
          title: t('training.caloriesInfoTitle'),
          description: t('training.caloriesInfoDescription'),
        },
        'avg-heart-rate': {
          title: t('training.avgHeartRateInfoTitle'),
          description: t('training.avgHeartRateInfoDescription'),
        },
        'max-heart-rate': {
          title: t('training.maxHeartRateInfoTitle'),
          description: t('training.maxHeartRateInfoDescription'),
        },
        'min-heart-rate': {
          title: t('training.minHeartRateInfoTitle'),
          description: t('training.minHeartRateInfoDescription'),
        },
        tss: {
          title: t('training.tssInfoTitle'),
          description: t('training.tssInfoDescription'),
        },
        epoc: {
          title: t('training.epocInfoTitle'),
          description: t('training.epocInfoDescription'),
        },
        pte: {
          title: t('training.pteInfoTitle'),
          description: t('training.pteInfoDescription'),
        },
        recovery: {
          title: t('training.recoveryTimeInfoTitle'),
          description: t('training.recoveryTimeInfoDescription'),
        },
      };

      const info = infoByMetric[metricKey];
      if (!info) return;
      Alert.alert(info.title, info.description);
    },
    [t],
  );

  const importedAvgHr = importedStrengthSummary?.avgHeartRate ?? session.avg_heart_rate;
  const importedMaxHr = importedStrengthSummary?.maxHeartRate ?? session.max_heart_rate;
  const importedMinHr = importedStrengthSummary?.minHeartRate ?? session.min_heart_rate ?? null;
  const importedCalories = importedStrengthSummary?.caloriesKcal ?? session.calories_kcal;
  const importedRecoverySeconds = importedStrengthSummary?.recoveryTimeSeconds ?? session.recovery_time_s;
  const importedEpoc = importedStrengthSummary?.epoc ?? session.epoc ?? null;
  const importedPte = importedStrengthSummary?.pte ?? session.pte ?? null;
  const suuntoTrainingLoadPeak = importedStrengthSummary?.trainingLoadPeak ?? null;
  const importedTssRaw = importedStrengthSummary?.tss ?? session.tss_hr ?? null;
  const importedProvider = importedStrengthSummary?.provider ?? null;
  const importedTss =
    importedProvider === 'suunto' &&
    suuntoTrainingLoadPeak != null &&
    importedTssRaw != null &&
    importedTssRaw > 0 &&
    importedTssRaw <= 10
      ? Math.round(suuntoTrainingLoadPeak * 13.6)
      : importedTssRaw;

  const strengthImportedMetrics: Array<{ key: string; label: string; value: string; hasInfo?: boolean }> = [];
  if (isGymSession && session.imported_at) {
    const numberWithUnitOrDash = (value: number | null | undefined, unit: string) =>
      value != null ? `${Math.round(value)} ${unit}` : '-';

    strengthImportedMetrics.push(
      {
        key: 'duration',
        label: t('training.duration'),
        value: session.duration_s != null ? formatMaybeDuration(session.duration_s) : '-',
        hasInfo: true,
      },
      {
        key: 'calories',
        label: t('nutrition.kcal'),
        value: numberWithUnitOrDash(importedCalories, t('nutrition.kcal')),
        hasInfo: true,
      },
      {
        key: 'avg-heart-rate',
        label: t('training.avgHeartRate'),
        value: numberWithUnitOrDash(importedAvgHr, t('health.unitBpm')),
        hasInfo: true,
      },
      {
        key: 'max-heart-rate',
        label: t('training.maxHeartRate'),
        value: numberWithUnitOrDash(importedMaxHr, t('health.unitBpm')),
        hasInfo: true,
      },
      {
        key: 'min-heart-rate',
        label: t('training.minHeartRate'),
        value: numberWithUnitOrDash(importedMinHr, t('health.unitBpm')),
        hasInfo: true,
      },
      {
        key: 'tss',
        label: t('training.tssHr'),
        value: importedTss != null ? `${Math.round(importedTss)}` : '-',
        hasInfo: true,
      },
      {
        key: 'epoc',
        label: t('training.epoc'),
        value: importedEpoc != null ? `${Math.round(importedEpoc)}` : '-',
        hasInfo: true,
      },
      {
        key: 'pte',
        label: t('training.pte'),
        value: importedPte != null ? importedPte.toFixed(1).replace('.', ',') : '-',
        hasInfo: true,
      },
      {
        key: 'recovery',
        label: t('training.recoveryTime'),
        value:
          importedRecoverySeconds != null && importedRecoverySeconds >= 0
            ? formatMaybeDuration(importedRecoverySeconds)
            : '-',
        hasInfo: true,
      },
    );
  }

  const renderProgrammedWorkoutSection = () => {
    if (!templateSteps || templateSteps.length === 0) return null;

    const topLevelSteps = templateSteps.filter(s => !s.parent_step_id);
    const getChildren = (parentId: string) => templateSteps.filter(s => s.parent_step_id === parentId);

    const renderStep = (step: EnduranceWorkoutStep, isChild = false) => {
      const duration = formatStepDuration(step);
      const target = formatStepTarget(step);
      const children = getChildren(step.id);
      const isGroup = step.is_group || children.length > 0;

      const label = isGroup ? t('training.repCaps') : t(getPhaseLabel(step.phase_type));
      const phaseColor = isGroup ? themeColors.primary : getPhaseColor(step.phase_type);

      return (
        <View key={step.id} style={[styles.stepRow, isChild && styles.childStepRow]}>
          <View
            style={[
              styles.phaseIndicator,
              { backgroundColor: phaseColor },
              isChild && { height: 'auto', minHeight: 24 },
            ]}
          />
          <View style={styles.stepContent}>
            <View style={styles.stepHeader}>
              <Text style={[styles.stepPhase, { color: phaseColor }, isChild && { fontSize: 12 }]}>{label}</Text>
              {step.repetitions! > 1 && (
                <View style={styles.repBadge}>
                  <Text style={styles.repText}>{step.repetitions}x</Text>
                </View>
              )}
            </View>
            {(duration || target) && (
              <View style={styles.stepDetails}>
                {duration && (
                  <View style={styles.stepDetailItem}>
                    <Clock size={isChild ? 12 : 14} color={themeColors.textSecondary} />
                    <Text style={[styles.stepDetailText, dynamicStyles.sublabel, isChild && { fontSize: 12 }]}>
                      {duration}
                    </Text>
                  </View>
                )}
                {target && (
                  <View style={styles.stepDetailItem}>
                    <Target size={isChild ? 12 : 14} color={themeColors.textSecondary} />
                    <Text style={[styles.stepDetailText, dynamicStyles.sublabel, isChild && { fontSize: 12 }]}>
                      {target}
                    </Text>
                  </View>
                )}
              </View>
            )}
            {children.length > 0 && (
              <View style={styles.childStepsContainer}>{children.map(child => renderStep(child, true))}</View>
            )}
          </View>
        </View>
      );
    };

    return (
      <View style={styles.sectionContainer}>
        <Text style={[styles.sectionTitle, dynamicStyles.sectionTitle]}>{t('training.scheduledWorkout')}</Text>
        <GlassCard style={[styles.stepsCard, dynamicStyles.glassCard]}>
          {topLevelSteps.map((step, index) => (
            <View
              key={step.id}
              style={
                index !== topLevelSteps.length - 1
                  ? [
                      styles.stepBorder,
                      {
                        borderBottomColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)',
                      },
                    ]
                  : undefined
              }
            >
              {renderStep(step)}
            </View>
          ))}
        </GlassCard>
      </View>
    );
  };

  return (
    <LinearGradient colors={dynamicStyles.gradientColors} style={{ flex: 1 }}>
      <SafeAreaView style={[styles.container, dynamicStyles.container]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <Text style={[styles.backText, { color: themeColors.primary }]}>{t('common.back')}</Text>
          </TouchableOpacity>
          <Text style={[styles.title, dynamicStyles.headerTitle]}>{t('training.detail')}</Text>
          {/* Small upload icon — route files for endurance, activity files for strength */}
          {!isGymSession ? (
            <Tooltip text={routePolyline ? t('training.replaceRoute') : t('training.uploadRoute')} placement="bottom">
              {tipProps => (
                <Pressable
                  {...tipProps}
                  style={[styles.headerRouteButton, { backgroundColor: themeColors.primary + '18' }]}
                  onPress={() => {
                    if (routePolyline) {
                      Alert.alert(t('training.replaceRouteTitle'), t('training.replaceRouteMessage'), [
                        { text: t('training.close'), style: 'cancel' },
                        {
                          text: t('training.confirm'),
                          onPress: () => uploadPolyline.mutate({ sessionId: session.id }),
                        },
                      ]);
                    } else {
                      uploadPolyline.mutate({ sessionId: session.id });
                    }
                  }}
                  disabled={uploadPolyline.isPending}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  {uploadPolyline.isPending ? (
                    <ActivityIndicator size="small" color={themeColors.primary} />
                  ) : routePolyline ? (
                    <Route size={16} color={themeColors.primary} />
                  ) : (
                    <Upload size={16} color={themeColors.primary} />
                  )}
                </Pressable>
              )}
            </Tooltip>
          ) : (
            <Tooltip
              text={session.imported_at ? t('training.replaceActivityFile') : t('training.uploadActivityFile')}
              placement="bottom"
            >
              {tipProps => (
                <Pressable
                  {...tipProps}
                  style={[styles.headerRouteButton, { backgroundColor: themeColors.primary + '18' }]}
                  onPress={() => {
                    if (session.imported_at) {
                      Alert.alert(t('training.replaceActivityFile'), t('training.replaceActivityFileMessage'), [
                        { text: t('training.close'), style: 'cancel' },
                        {
                          text: t('training.confirm'),
                          onPress: handlePickStrengthActivityFile,
                        },
                      ]);
                    } else {
                      handlePickStrengthActivityFile();
                    }
                  }}
                  disabled={applyStrengthActivityImport.isPending}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  {applyStrengthActivityImport.isPending ? (
                    <ActivityIndicator size="small" color={themeColors.primary} />
                  ) : (
                    <Upload size={16} color={themeColors.primary} />
                  )}
                </Pressable>
              )}
            </Tooltip>
          )}
        </View>

        <ScrollView scrollEnabled={mapScrollEnabled} contentContainerStyle={[styles.content, { paddingBottom: 100 }]}>
          <View style={styles.mainHeader}>
            <View style={[styles.iconContainer, dynamicStyles.iconContainer]}>
              <Icon size={32} color={themeColors.primary} sport={session.sport_type} />
            </View>
            <Text style={[styles.activityName, dynamicStyles.title]}>{session.name || t(config.defaultTitle)}</Text>
            <Text style={[styles.date, dynamicStyles.subtitle]}>
              {format(new Date(session.start_time), 'EEEE d MMMM, yyyy \u00B7 HH:mm', {
                locale: getDateFnsLocale(),
              })}
            </Text>
          </View>

          {/* Route Map — shown only for endurance sessions with a polyline */}
          {!isGymSession && routePolyline && (
            <View style={{ marginTop: 8, marginBottom: 24 }}>
              <RouteMap
                polyline={routePolyline}
                strokeColor={themeColors.primary}
                height={200}
                isDark={isDark}
                onInteractionStart={handleMapInteractionStart}
                onInteractionEnd={handleMapInteractionEnd}
              />
            </View>
          )}

          {/* Stats Grid - Using explicit rows for reliable layout */}
          <View style={styles.statsContainer}>
            {isGymSession ? (
              <>
                {/* Gym Session: Row 1 - Tiempo + Calorías */}
                <View style={styles.statsRow}>
                  <View style={{ flex: 1 }}>
                    <GlassCard style={[styles.statCard, dynamicStyles.glassCard]}>
                      <Clock size={20} color={'#FF9500'} />
                      <Text style={[styles.statValue, dynamicStyles.title]} numberOfLines={1}>
                        {formatDuration(session.duration_s || 0)}
                      </Text>
                      <Text style={[styles.statLabel, dynamicStyles.sublabel]} numberOfLines={1}>
                        {t('training.time')}
                      </Text>
                    </GlassCard>
                  </View>
                  {config.fields.calories && session.calories_kcal !== null && (
                    <View style={{ flex: 1 }}>
                      <GlassCard style={[styles.statCard, dynamicStyles.glassCard]}>
                        <Flame size={20} color={themeColors.danger} />
                        <Text style={[styles.statValue, dynamicStyles.title]} numberOfLines={1}>
                          {session.calories_kcal}
                        </Text>
                        <Text style={[styles.statLabel, dynamicStyles.sublabel]} numberOfLines={1}>
                          {t('nutrition.kcal')}
                        </Text>
                      </GlassCard>
                    </View>
                  )}
                </View>

                {/* Gym Session: Row 2 - Ejercicios + Esfuerzo */}
                <View style={styles.statsRow}>
                  <View style={{ flex: 1 }}>
                    <GlassCard style={[styles.statCard, dynamicStyles.glassCard]}>
                      <Dumbbell size={20} color={themeColors.primary} />
                      <Text style={[styles.statValue, dynamicStyles.title]} numberOfLines={1}>
                        {exerciseGroups.length || 0}
                      </Text>
                      <Text style={[styles.statLabel, dynamicStyles.sublabel]} numberOfLines={1}>
                        {t('training.exercises')}
                      </Text>
                    </GlassCard>
                  </View>
                  {config.fields.rpe && session.rpe !== null && (
                    <View style={{ flex: 1 }}>
                      <GlassCard style={[styles.statCard, dynamicStyles.glassCard]}>
                        <Gauge size={20} color={themeColors.textPrimary} />
                        <Text style={[styles.statValue, dynamicStyles.title]} numberOfLines={1}>
                          {session.rpe}/10
                        </Text>
                        <Text style={[styles.statLabel, dynamicStyles.sublabel]} numberOfLines={1}>
                          {t('training.effort')}
                        </Text>
                      </GlassCard>
                    </View>
                  )}
                </View>
              </>
            ) : (
              <>
                {/* Endurance Session: Row 1 - Distance + Duration */}
                <View style={styles.statsRow}>
                  {config.fields.distance && (
                    <View style={{ flex: 1 }}>
                      <GlassCard style={[styles.statCard, dynamicStyles.glassCard]}>
                        <MapPin size={20} color={themeColors.secondary} />
                        <Text style={[styles.statValue, dynamicStyles.title]} numberOfLines={1}>
                          {distObj.value}
                        </Text>
                        <Text style={[styles.statLabel, dynamicStyles.sublabel]} numberOfLines={1}>
                          {distObj.unit}
                        </Text>
                      </GlassCard>
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <GlassCard style={[styles.statCard, dynamicStyles.glassCard]}>
                      <Clock size={20} color={'#FF9500'} />
                      <Text style={[styles.statValue, dynamicStyles.title]} numberOfLines={1}>
                        {formatDuration(session.duration_s || 0)}
                      </Text>
                      <Text style={[styles.statLabel, dynamicStyles.sublabel]} numberOfLines={1}>
                        {t('training.time')}
                      </Text>
                    </GlassCard>
                  </View>
                </View>

                {/* Endurance Session: Row 2 - Speed/Pace + Calories */}
                <View style={styles.statsRow}>
                  {config.units.speed && (
                    <View style={{ flex: 1 }}>
                      <GlassCard style={[styles.statCard, dynamicStyles.glassCard]}>
                        <Activity size={20} color={themeColors.success} />
                        <Text style={[styles.statValue, dynamicStyles.title]} numberOfLines={1}>
                          {speedObj.label.split(' ')[0]}
                        </Text>
                        <Text style={[styles.statLabel, dynamicStyles.sublabel]} numberOfLines={1}>
                          {speedObj.unit}
                        </Text>
                      </GlassCard>
                    </View>
                  )}
                  {config.fields.calories && session.calories_kcal !== null && (
                    <View style={{ flex: 1 }}>
                      <GlassCard style={[styles.statCard, dynamicStyles.glassCard]}>
                        <Flame size={20} color={themeColors.danger} />
                        <Text style={[styles.statValue, dynamicStyles.title]} numberOfLines={1}>
                          {session.calories_kcal}
                        </Text>
                        <Text style={[styles.statLabel, dynamicStyles.sublabel]} numberOfLines={1}>
                          {t('nutrition.kcal')}
                        </Text>
                      </GlassCard>
                    </View>
                  )}
                </View>
              </>
            )}
          </View>

          {!isGymSession && secondaryMetrics.length > 0 && (
            <View style={styles.sectionContainer}>
              <Text style={[styles.sectionTitle, dynamicStyles.sectionTitle]}>{t('training.additionalMetrics')}</Text>
              <GlassCard style={[styles.secondaryMetricsCard, dynamicStyles.glassCard]}>
                {secondaryMetrics.map((metric, index) => (
                  <View
                    key={metric.key}
                    style={[
                      styles.secondaryMetricRow,
                      index !== secondaryMetrics.length - 1 && {
                        borderBottomWidth: StyleSheet.hairlineWidth,
                        borderBottomColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)',
                      },
                    ]}
                  >
                    <Text style={[styles.secondaryMetricLabel, dynamicStyles.sublabel]}>{metric.label}</Text>
                    <Text style={[styles.secondaryMetricValue, dynamicStyles.title]}>{metric.value}</Text>
                  </View>
                ))}
              </GlassCard>
            </View>
          )}

          {/* Gym Exercises Section */}
          {isGymSession && exerciseGroups.length > 0 && (
            <View style={styles.exercisesSection}>
              <Text style={[styles.sectionTitle, dynamicStyles.sectionTitle]}>{t('training.exercises')}</Text>
              {exerciseGroups.map((group, index) => {
                const connectorActive = supersetConnectorIndexes.has(index);
                const isInSuperset = supersetConnectorIndexes.has(index - 1) || connectorActive;

                return (
                  <React.Fragment key={group.exercise_id}>
                    <GlassCard
                      style={[
                        styles.exerciseCard,
                        dynamicStyles.glassCard,
                        isInSuperset && {
                          borderColor: themeColors.primary + '8C',
                          backgroundColor: themeColors.primary + '10',
                        },
                      ]}
                    >
                      <View
                        style={[
                          styles.exerciseHeader,
                          {
                            borderBottomColor: isInSuperset
                              ? themeColors.primary + '55'
                              : isDark
                                ? 'rgba(255,255,255,0.1)'
                                : 'rgba(0,0,0,0.05)',
                          },
                        ]}
                      >
                        <View
                          style={[
                            styles.exerciseIconBadge,
                            { backgroundColor: isInSuperset ? `${themeColors.primary}22` : `${themeColors.primary}15` },
                          ]}
                        >
                          {isInSuperset ? (
                            <InfinityIcon size={16} color={themeColors.primary} />
                          ) : (
                            <Dumbbell size={16} color={themeColors.primary} />
                          )}
                        </View>
                        <TouchableOpacity
                          style={styles.exerciseInfoButton}
                          onPress={() => navigation.navigate('ExerciseDetail', { exerciseId: group.exercise_id })}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                          <View style={styles.exerciseInfoTextWrap}>
                            <Text style={[styles.exerciseName, dynamicStyles.title]}>{group.exercise_name}</Text>
                            <Text style={[styles.exerciseProgressHint, dynamicStyles.sublabel]}>
                              {t('training.tapToSeeProgress')}
                            </Text>
                          </View>
                          <ChevronRight size={14} color={themeColors.textSecondary} />
                        </TouchableOpacity>
                      </View>

                      <View style={styles.setsContainer}>
                        {/* Table header */}
                        <View style={styles.setHeaderRow}>
                          <Text style={[styles.setHeaderLabel, dynamicStyles.sublabel, { width: 62 }]} />
                          <Text style={[styles.setHeaderLabel, dynamicStyles.sublabel, { flex: 1 }]}>
                            {t('training.repsColon').toUpperCase()}
                          </Text>
                          <Text style={[styles.setHeaderLabel, dynamicStyles.sublabel, { flex: 1 }]}>
                            {preferences.weight_unit.toUpperCase()}
                          </Text>
                          <View style={{ width: 30 }} />
                        </View>
                        {group.sets.map(set => (
                          <View
                            key={set.id}
                            style={[
                              styles.setRow,
                              set.is_warmup && {
                                backgroundColor: `${themeColors.warning}12`,
                                borderRadius: 10,
                              },
                              { borderBottomColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)' },
                            ]}
                          >
                            <View style={styles.setIndexCell}>
                              <Text
                                style={[
                                  styles.setNumber,
                                  dynamicStyles.sublabel,
                                  set.is_warmup && { color: themeColors.warning, fontWeight: '700' },
                                ]}
                              >
                                {set.set_number}
                              </Text>
                              {set.is_warmup && (
                                <View
                                  style={[
                                    styles.warmupSetBadge,
                                    {
                                      backgroundColor: `${themeColors.warning}1F`,
                                      borderColor: `${themeColors.warning}55`,
                                    },
                                  ]}
                                >
                                  <Text style={[styles.warmupSetBadgeText, { color: themeColors.warning }]}>W</Text>
                                </View>
                              )}
                            </View>
                            <Text style={[styles.setCellValue, dynamicStyles.title, { flex: 1 }]}>{set.reps}</Text>
                            <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}>
                              <Text style={[styles.setCellValue, dynamicStyles.title]}>
                                {toDisplayWeight(set.weight_kg)}
                              </Text>
                              {set.is_pr && (
                                <View style={styles.prBadge}>
                                  <Award size={10} color="#FF9500" />
                                </View>
                              )}
                            </View>
                            <TouchableOpacity
                              style={styles.editSetButton}
                              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                              onPress={() => {
                                setEditingSet(set);
                                setEditReps(String(set.reps));
                                setEditWeight(String(toDisplayWeight(set.weight_kg)));
                              }}
                            >
                              <Pencil size={13} color={themeColors.textSecondary} />
                            </TouchableOpacity>
                          </View>
                        ))}
                      </View>
                    </GlassCard>

                    {index < exerciseGroups.length - 1 && (
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
          )}

          {isGymSession && strengthImportedMetrics.length > 0 && (
            <View style={styles.sectionContainer}>
              <Text style={[styles.sectionTitle, dynamicStyles.sectionTitle]}>
                {t('training.importedActivityData')}
              </Text>
              <GlassCard style={[styles.secondaryMetricsCard, dynamicStyles.glassCard]}>
                {strengthImportedMetrics.map((metric, index) => (
                  <View
                    key={metric.key}
                    style={[
                      styles.secondaryMetricRow,
                      index !== strengthImportedMetrics.length - 1 && {
                        borderBottomWidth: StyleSheet.hairlineWidth,
                        borderBottomColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)',
                      },
                    ]}
                  >
                    {metric.hasInfo ? (
                      <Pressable onPress={() => handleImportedMetricInfoPress(metric.key)} hitSlop={8}>
                        <Text style={[styles.secondaryMetricLabel, dynamicStyles.sublabel]}>{metric.label}</Text>
                      </Pressable>
                    ) : (
                      <Text style={[styles.secondaryMetricLabel, dynamicStyles.sublabel]}>{metric.label}</Text>
                    )}
                    <Text style={[styles.secondaryMetricValue, dynamicStyles.title]}>{metric.value}</Text>
                  </View>
                ))}
              </GlassCard>
            </View>
          )}

          {/* Heart Rate Zones */}
          {heartRateZones && heartRateZones.length > 0 && (
            <View style={styles.sectionContainer}>
              <Text style={[styles.sectionTitle, dynamicStyles.sectionTitle]}>{t('training.heartRateZones')}</Text>
              <GlassCard style={[styles.lapsCard, dynamicStyles.glassCard]}>
                {heartRateZones.map(zone => (
                  <View key={`hr-zone-${zone.zone}`} style={styles.zoneRow}>
                    <Text style={[styles.zoneIndex, { color: resolveZoneColor(zone.zone) }]}>{zone.zone}</Text>
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
                            backgroundColor: resolveZoneColor(zone.zone),
                          },
                        ]}
                      />
                    </View>
                    <Text style={[styles.zoneMetric, { color: themeColors.textPrimary }]}>
                      {Math.round(zone.percentage)}%
                    </Text>
                    <Text style={[styles.zoneMetric, { color: themeColors.textSecondary }]}>
                      {formatDuration(zone.duration_s)}
                    </Text>
                  </View>
                ))}
              </GlassCard>
            </View>
          )}

          {/* Laps Section */}
          {splitTabs.length > 0 && activeSplits.length > 0 && (
            <View style={styles.sectionContainer}>
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
                          style={[styles.splitTabText, { color: isActive ? '#FFFFFF' : themeColors.textSecondary }]}
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
                  <Text style={[styles.splitsHeaderCell, { width: 28, color: themeColors.textSecondary }]}>#</Text>
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
                    key={`split-${activeSplitTab?.key ?? 'none'}-${lap.lap_index}-${index}`}
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
                      {lap.lap_index}
                    </Text>
                    <Text style={[styles.splitCell, { flex: 1, color: themeColors.textPrimary }]}>
                      {formatSplitDistance(lap.distance_m)}
                    </Text>
                    <Text style={[styles.splitCell, { flex: 1, color: themeColors.textPrimary }]}>
                      {formatSplitDuration(lap.duration_s)}
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
                      <Text style={[styles.splitCell, { color: themeColors.textPrimary }]}>{formatSplitPace(lap)}</Text>
                    </View>
                    <Text style={[styles.splitCell, { width: 64, textAlign: 'right', color: themeColors.textPrimary }]}>
                      {lap.avg_heart_rate != null ? `${Math.round(lap.avg_heart_rate)} ${t('health.unitBpm')}` : '-'}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* Keep programmed workout at the very bottom of the detail screen */}
          {renderProgrammedWorkoutSection()}
        </ScrollView>
      </SafeAreaView>

      {/* Edit Set Modal — exact WeightLogModal pattern */}
      <Modal visible={!!editingSet} transparent animationType="fade" onRequestClose={() => setEditingSet(null)}>
        <View style={styles.modalContainer}>
          <BlurView intensity={40} style={StyleSheet.absoluteFill} tint={isDark ? 'dark' : 'light'} />

          <TouchableWithoutFeedback onPress={() => setEditingSet(null)}>
            <View style={styles.modalBackdrop} />
          </TouchableWithoutFeedback>

          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalKeyboard}>
            <View
              style={[
                styles.modalCard,
                {
                  backgroundColor: isDark ? '#1C1C1E' : '#FFFFFF',
                  shadowColor: isDark ? 'rgba(0,0,0,0.5)' : 'rgba(0,0,0,0.15)',
                },
              ]}
            >
              <TouchableOpacity
                onPress={() => setEditingSet(null)}
                style={[
                  styles.modalCloseButton,
                  { backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)' },
                ]}
              >
                <X size={20} color={themeColors.textSecondary} />
              </TouchableOpacity>

              <Text style={[styles.modalLabel, { color: themeColors.textSecondary }]}>
                {t('training.seriesSingular').toUpperCase()} {editingSet?.set_number}
              </Text>

              <View style={styles.modalInputsRow}>
                <View style={styles.modalInputGroup}>
                  <TextInput
                    style={[styles.modalBigInput, { color: themeColors.textPrimary }]}
                    keyboardType="number-pad"
                    value={editReps}
                    onChangeText={setEditReps}
                    selectTextOnFocus
                    autoFocus
                  />
                  <Text style={[styles.modalInputUnit, { color: themeColors.textSecondary }]}>
                    {t('training.repsColon').toLowerCase()}
                  </Text>
                </View>
                <View style={styles.modalInputGroup}>
                  <TextInput
                    style={[styles.modalBigInput, { color: themeColors.textPrimary }]}
                    keyboardType="decimal-pad"
                    value={editWeight}
                    onChangeText={setEditWeight}
                    selectTextOnFocus
                  />
                  <Text style={[styles.modalInputUnit, { color: themeColors.textSecondary }]}>
                    {preferences.weight_unit}
                  </Text>
                </View>
              </View>

              <TouchableOpacity
                style={[
                  styles.modalSaveButton,
                  { backgroundColor: themeColors.primary, shadowColor: themeColors.primary },
                  updateSet.isPending && styles.modalSaveDisabled,
                ]}
                onPress={() => {
                  if (!editingSet) return;
                  const reps = parseInt(editReps, 10);
                  const displayWeight = parseFloat(editWeight);
                  const weight_kg = preferences.weight_unit === 'lb' ? displayWeight / 2.20462 : displayWeight;
                  if (!isNaN(reps) && !isNaN(weight_kg)) {
                    updateSet.mutate(
                      { setId: editingSet.id, reps, weight_kg },
                      { onSuccess: () => setEditingSet(null) },
                    );
                  }
                }}
                disabled={updateSet.isPending}
              >
                <Text style={styles.modalSaveText}>{updateSet.isPending ? '...' : t('common.save')}</Text>
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.l,
    paddingVertical: spacing.m,
  },
  backButton: {
    padding: spacing.s,
  },
  backText: {
    ...typography.body,
    fontWeight: '600',
    color: colors.primary,
  },
  title: {
    ...typography.h3,
    color: colors.textPrimary,
  },
  content: {
    padding: spacing.m,
  },
  mainHeader: {
    alignItems: 'center',
    marginBottom: spacing.l,
  },
  iconContainer: {
    backgroundColor: colors.surface,
    padding: spacing.l,
    borderRadius: borderRadius.full,
    marginBottom: spacing.s,
  },
  activityName: {
    ...typography.h2,
    color: colors.textPrimary,
    marginBottom: 4,
  },
  date: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  statsContainer: {
    gap: spacing.m,
    marginBottom: spacing.m,
    alignItems: 'center',
  },
  statsRow: {
    flexDirection: 'row',
    gap: spacing.m,
    width: '100%',
    justifyContent: 'center',
  },
  statCard: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.l,
    paddingHorizontal: spacing.m,
    borderRadius: borderRadius.l,
    gap: spacing.xs,
  },
  statContent: {
    alignItems: 'center',
    gap: 2,
  },
  statValue: {
    ...typography.h3,
    fontWeight: 'bold',
    marginTop: spacing.xs,
    textAlign: 'center',
  },
  statLabel: {
    ...typography.caption,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  secondaryMetricsCard: {
    paddingHorizontal: spacing.m,
    paddingVertical: spacing.xs,
  },
  secondaryMetricRow: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  secondaryMetricLabel: {
    ...typography.body,
    fontSize: 13,
    flex: 1,
  },
  secondaryMetricValue: {
    ...typography.body,
    fontWeight: '700',
    marginLeft: spacing.m,
    textAlign: 'right',
  },
  // Section Common
  sectionContainer: {
    marginTop: spacing.l,
  },
  sectionTitle: {
    ...typography.h3,
    color: colors.textPrimary,
    marginBottom: spacing.m,
  },
  // Programmed Steps
  stepsCard: {
    padding: spacing.m,
  },
  stepRow: {
    flexDirection: 'row',
    paddingVertical: spacing.m,
  },
  stepBorder: {
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.05)',
  },
  childStepRow: {
    paddingVertical: spacing.s,
    paddingLeft: spacing.s,
  },
  childStepsContainer: {
    marginTop: spacing.s,
    paddingLeft: spacing.s,
    borderLeftWidth: 2,
    borderLeftColor: 'rgba(0,0,0,0.05)',
  },
  phaseIndicator: {
    width: 4,
    borderRadius: 2,
    marginRight: spacing.m,
    height: '100%',
  },
  stepContent: {
    flex: 1,
    gap: 4,
  },
  stepHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  stepPhase: {
    fontSize: 14,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  repBadge: {
    backgroundColor: colors.surfaceHighlight,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  repText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  stepDetails: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.l,
    marginTop: 4,
  },
  stepDetailItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  stepDetailText: {
    ...typography.body,
    color: colors.textSecondary,
  },
  // Gym Exercises Section
  exercisesSection: {
    marginTop: spacing.l,
  },
  exerciseCard: {
    marginBottom: spacing.m,
    padding: spacing.m,
  },
  exerciseHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.m,
    marginBottom: spacing.m,
    paddingBottom: spacing.s,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.05)',
  },
  exerciseIconBadge: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: `${colors.primary}15`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  exerciseInfoButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s,
  },
  exerciseInfoTextWrap: {
    flex: 1,
  },
  exerciseName: {
    ...typography.body,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  exerciseProgressHint: {
    ...typography.caption,
    fontSize: 11,
    marginTop: 2,
  },
  setsContainer: {
    gap: 0,
  },
  setHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.xs,
  },
  setHeaderLabel: {
    ...typography.caption,
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.8,
  },
  setRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.s + 2,
    paddingHorizontal: spacing.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  setIndexCell: {
    width: 62,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  setNumber: {
    ...typography.caption,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  warmupSetBadge: {
    borderWidth: 1,
    borderRadius: 999,
    minWidth: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  warmupSetBadgeText: {
    ...typography.caption,
    fontSize: 10,
    fontWeight: '700',
  },
  setCellValue: {
    ...typography.body,
    fontWeight: '700',
  },
  prBadge: {
    marginLeft: 6,
    backgroundColor: '#FF950015',
    padding: 3,
    borderRadius: 6,
  },
  editSetButton: {
    width: 30,
    alignItems: 'center',
    opacity: 0.5,
  },
  // Modal styles — matching WeightLogModal
  modalContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  modalKeyboard: {
    width: '100%',
    alignItems: 'center',
    paddingHorizontal: spacing.l,
  },
  modalCard: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 28,
    paddingHorizontal: spacing.xl,
    paddingTop: 40,
    paddingBottom: spacing.xl,
    alignItems: 'center',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 10,
  },
  modalCloseButton: {
    position: 'absolute',
    top: spacing.m,
    right: spacing.m,
    padding: spacing.xs,
    borderRadius: 12,
  },
  modalLabel: {
    ...typography.caption,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.5,
    marginBottom: spacing.l,
    textTransform: 'uppercase',
  },
  modalInputsRow: {
    flexDirection: 'row',
    gap: spacing.xl,
    marginBottom: spacing.xl + spacing.m,
    width: '100%',
  },
  modalInputGroup: {
    flex: 1,
    alignItems: 'center',
  },
  modalBigInput: {
    fontSize: 48,
    fontWeight: '700',
    width: '100%',
    textAlign: 'center',
    padding: 0,
    includeFontPadding: false,
  },
  modalInputUnit: {
    fontSize: 14,
    fontWeight: '500',
    marginTop: 4,
  },
  modalSaveButton: {
    width: '100%',
    paddingVertical: 16,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  modalSaveDisabled: {
    opacity: 0.5,
    shadowOpacity: 0,
  },
  modalSaveText: {
    ...typography.h4,
    color: '#FFFFFF',
    fontWeight: '700',
  },
  importPreviewCard: {
    width: '100%',
    maxWidth: 400,
    borderRadius: 28,
    paddingHorizontal: spacing.xl,
    paddingTop: 40,
    paddingBottom: spacing.xl,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 10,
  },
  importPreviewTitle: {
    ...typography.h3,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: spacing.l,
  },
  importPreviewRows: {
    marginBottom: spacing.l,
  },
  importPreviewRow: {
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.m,
  },
  supersetConnectorRow: {
    alignItems: 'center',
    marginTop: 0,
    marginBottom: spacing.m,
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
  // Laps Section
  lapsCard: {
    marginBottom: spacing.m,
    padding: spacing.m,
  },
  zoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s,
    marginBottom: spacing.s,
  },
  zoneIndex: {
    width: 20,
    ...typography.body,
    fontWeight: '700',
  },
  zoneTrack: {
    flex: 1,
    height: 10,
    borderRadius: 999,
    overflow: 'hidden',
  },
  zoneFill: {
    height: '100%',
    borderRadius: 999,
  },
  zoneMetric: {
    width: 54,
    textAlign: 'right',
    ...typography.caption,
    fontWeight: '600',
  },
  routeInsightsCard: {
    marginBottom: spacing.m,
    padding: spacing.m,
  },
  routeInsightsTitle: {
    ...typography.h3,
    fontWeight: '700',
    marginBottom: spacing.s,
  },
  splitTabsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: spacing.s,
    gap: spacing.s,
  },
  splitTab: {
    paddingHorizontal: spacing.m,
    paddingVertical: spacing.xs + 2,
    borderRadius: borderRadius.full,
  },
  splitTabText: {
    ...typography.caption,
    fontWeight: '700',
    fontSize: 13,
  },
  splitLegendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s,
    marginBottom: spacing.s,
  },
  splitLegendText: {
    ...typography.caption,
    fontWeight: '600',
    minWidth: 42,
  },
  splitLegendGradient: {
    flex: 1,
    height: 10,
    borderRadius: borderRadius.full,
  },
  splitsHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: spacing.s,
    marginBottom: spacing.s,
    borderBottomWidth: 1,
  },
  splitsHeaderCell: {
    ...typography.caption,
    fontWeight: '700',
    fontSize: 11,
    textTransform: 'uppercase',
  },
  splitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.s,
    borderBottomWidth: 1,
    gap: spacing.xs,
  },
  splitCell: {
    ...typography.body,
    fontSize: 13,
    fontWeight: '600',
  },
  paceCell: {
    borderRadius: borderRadius.s,
    paddingHorizontal: spacing.s,
    paddingVertical: spacing.xs,
  },
  // Route map
  routeCard: {
    marginBottom: spacing.m,
    padding: spacing.m,
    alignItems: 'center',
  },
  routeSvgContainer: {
    width: '100%',
    alignItems: 'center',
    overflow: 'hidden',
    borderRadius: 12,
  },
  uploadRouteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.s,
    marginHorizontal: spacing.m,
    marginBottom: spacing.l,
    paddingVertical: spacing.m,
    borderRadius: 14,
    borderWidth: 1.5,
  },
  uploadRouteText: {
    ...typography.body,
    fontWeight: '600',
    fontSize: 14,
  },
  // Small header button for route upload
  headerRouteButton: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
