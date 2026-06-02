import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  PanResponder,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { SportIcon } from '../../../components/icons/SportIcon';
import {
  addMonths,
  addYears,
  addDays,
  endOfMonth,
  endOfWeek,
  endOfYear,
  format,
  isAfter,
  isBefore,
  isSameDay,
  isSameMonth,
  startOfDay,
  startOfMonth,
  startOfWeek,
  startOfYear,
  subDays,
} from 'date-fns';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ThemeColors } from '../../../context/ThemeContext';
import { useEnduranceSessions } from '../../../hooks/useEnduranceSessions';
import { useUnitConversion } from '../../../hooks/useUnitConversion';
import { getDateFnsLocale } from '../../../i18n/dateLocale';
import { SPORTS_CONFIG } from '../../../constants/sports';
import { borderRadius, colors, spacing, typography } from '../../../theme';
import { SPORT_COLORS } from '../../../theme/sportColors';
import { ActivitySession } from '../../../types/requests.types';

export type CalendarRangeMode = 'week' | 'month' | 'year' | 'last_30_days';

export interface ActivityCalendarViewState {
  mode: CalendarRangeMode;
  monthAnchorTimestamp: number;
  weekAnchorTimestamp?: number;
  yearAnchorTimestamp?: number;
}

interface ActivityCalendarViewProps {
  isDark: boolean;
  themeColors: ThemeColors;
  onOpenSession: (session: ActivitySession) => void;
  initialViewState?: ActivityCalendarViewState;
  onViewStateChange?: (state: ActivityCalendarViewState) => void;
  onOpenSportHistory: (payload: {
    sportType: SummarySportType;
    sportLabel: string;
    rangeStart: string;
    rangeEnd: string;
  }) => void;
}

interface CalendarRange {
  start: Date;
  end: Date;
}

interface SessionWithDate {
  session: ActivitySession;
  startDate: Date;
}

type SummarySportType = Exclude<ActivitySession['sport_type'], 'strength'> | 'gym' | 'volleyball' | 'trail' | 'golf';

type SportMiddleMetric = 'distance' | 'volume' | 'sets' | 'elevation' | 'calories';

interface SportSummaryCardData {
  sportType: SummarySportType;
  color: string;
  label: string;
  sessions: ActivitySession[];
  sessionCount: number;
  totalDurationSeconds: number;
  totalCalories: number;
  totalDistanceMeters: number;
  totalSets: number;
  totalVolumeKg: number;
  totalElevationGainMeters: number;
  middleMetricValue: string;
  middleMetricLabel: string;
}

const WEEK_STARTS_ON_MONDAY = 1 as const;
const MAX_COLORS_PER_DAY = 3;

const toDayKey = (date: Date): string => format(date, 'yyyy-MM-dd');

const normalizeSportTypeForColor = (sportType: ActivitySession['sport_type']): keyof typeof SPORT_COLORS => {
  if (sportType === 'strength') {
    return 'gym';
  }

  if (sportType in SPORT_COLORS) {
    return sportType as keyof typeof SPORT_COLORS;
  }

  return 'other';
};

const normalizeSportTypeForSummary = (sportType: ActivitySession['sport_type']): SummarySportType => {
  if (sportType === 'strength') {
    return 'gym';
  }

  if (sportType in SPORTS_CONFIG) {
    return sportType as SummarySportType;
  }

  return 'other';
};

const hasSessionRoute = (session: ActivitySession): boolean => {
  return typeof session.route_polyline === 'string' && session.route_polyline.trim().length > 0;
};

const getPreferredMiddleMetric = (sportType: SummarySportType): SportMiddleMetric => {
  if (sportType === 'gym') {
    return 'sets';
  }

  if (sportType === 'martial_arts' || sportType === 'climbing' || sportType === 'volleyball' || sportType === 'golf') {
    return 'calories';
  }

  if (
    sportType === 'running' ||
    sportType === 'cycling' ||
    sportType === 'swimming' ||
    sportType === 'hiking' ||
    sportType === 'trail' ||
    sportType === 'football' ||
    sportType === 'basketball' ||
    sportType === 'tennis' ||
    sportType === 'padel' ||
    sportType === 'skiing' ||
    sportType === 'snowboard'
  ) {
    return 'distance';
  }

  return 'sets';
};

const isDateInsideRange = (date: Date, range: CalendarRange): boolean => {
  return !isBefore(date, range.start) && !isAfter(date, range.end);
};

const buildWeekRows = (start: Date, end: Date): Date[][] => {
  const rows: Date[][] = [];
  let cursor = start;

  while (!isAfter(cursor, end)) {
    const week: Date[] = [];
    for (let dayIndex = 0; dayIndex < 7; dayIndex += 1) {
      week.push(cursor);
      cursor = addDays(cursor, 1);
    }
    rows.push(week);
  }

  return rows;
};

const formatHoursAndMinutes = (totalSeconds: number): string => {
  const totalMinutes = Math.round(totalSeconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}:${minutes.toString().padStart(2, '0')}`;
};

const getSessionDurationSeconds = (session: ActivitySession): number => {
  if (typeof session.duration_s === 'number' && session.duration_s > 0) {
    return session.duration_s;
  }

  const startMs = Date.parse(session.start_time);
  if (Number.isNaN(startMs)) {
    return 0;
  }

  const endMs = session.end_time ? Date.parse(session.end_time) : Date.now();
  if (Number.isNaN(endMs)) {
    return 0;
  }

  const diffSeconds = Math.floor((endMs - startMs) / 1000);
  return diffSeconds > 0 ? diffSeconds : 0;
};

const DayDots: React.FC<{
  colorsForDay: string[];
  isCompact?: boolean;
  dotFallbackColor: string;
}> = ({ colorsForDay, isCompact = false, dotFallbackColor }) => {
  const displayColors = colorsForDay.slice(0, MAX_COLORS_PER_DAY);

  if (displayColors.length === 0) {
    return (
      <View
        style={[
          styles.emptyDot,
          {
            width: isCompact ? 4 : 6,
            height: isCompact ? 4 : 6,
            borderRadius: isCompact ? 2 : 3,
            backgroundColor: dotFallbackColor,
          },
        ]}
      />
    );
  }

  if (displayColors.length === 1) {
    return (
      <View
        style={[
          styles.singleDot,
          {
            width: isCompact ? 6 : 12,
            height: isCompact ? 6 : 12,
            borderRadius: isCompact ? 3 : 6,
            backgroundColor: displayColors[0],
          },
        ]}
      />
    );
  }

  const stackedSize = isCompact ? 5 : 9;

  return (
    <View style={styles.stackDotsRow}>
      {displayColors.map((color, index) => (
        <View
          key={`${color}-${index}`}
          style={[
            styles.stackDot,
            {
              width: stackedSize,
              height: stackedSize,
              borderRadius: stackedSize / 2,
              backgroundColor: color,
              marginLeft: index === 0 ? 0 : isCompact ? -1 : -2,
              borderWidth: 1,
              borderColor: colors.background,
            },
          ]}
        />
      ))}
    </View>
  );
};

export const ActivityCalendarView: React.FC<ActivityCalendarViewProps> = ({
  isDark,
  themeColors,
  onOpenSession,
  initialViewState,
  onViewStateChange,
  onOpenSportHistory,
}) => {
  const { t } = useTranslation();
  const { convertDistanceToUi, convertWeightToUi } = useUnitConversion();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const now = new Date();
  const today = startOfDay(now);

  const [mode, setMode] = useState<CalendarRangeMode>(initialViewState?.mode ?? 'month');
  const [weekAnchorDate, setWeekAnchorDate] = useState<Date>(() =>
    initialViewState?.weekAnchorTimestamp ? new Date(initialViewState.weekAnchorTimestamp) : today,
  );
  const [monthAnchorDate, setMonthAnchorDate] = useState<Date>(() =>
    initialViewState?.monthAnchorTimestamp ? new Date(initialViewState.monthAnchorTimestamp) : today,
  );
  const [yearAnchorDate, setYearAnchorDate] = useState<Date>(() =>
    initialViewState?.yearAnchorTimestamp ? new Date(initialViewState.yearAnchorTimestamp) : today,
  );
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const [isDayModalVisible, setIsDayModalVisible] = useState(false);

  const isCompact = width < 390;

  const currentWeekRange = useMemo<CalendarRange>(
    () => ({
      start: startOfWeek(weekAnchorDate, { weekStartsOn: WEEK_STARTS_ON_MONDAY }),
      end: endOfWeek(weekAnchorDate, { weekStartsOn: WEEK_STARTS_ON_MONDAY }),
    }),
    [weekAnchorDate],
  );

  const currentMonthRange = useMemo<CalendarRange>(
    () => ({
      start: startOfMonth(monthAnchorDate),
      end: endOfMonth(monthAnchorDate),
    }),
    [monthAnchorDate],
  );

  const currentYearRange = useMemo<CalendarRange>(
    () => ({
      start: startOfYear(yearAnchorDate),
      end: endOfYear(yearAnchorDate),
    }),
    [yearAnchorDate],
  );

  const last30DaysRange = useMemo<CalendarRange>(
    () => ({
      start: startOfDay(subDays(today, 29)),
      end: today,
    }),
    [today],
  );

  const calendarFetchStartDate = isBefore(last30DaysRange.start, currentYearRange.start)
    ? last30DaysRange.start
    : currentYearRange.start;
  const calendarFetchStartDateFinal = useMemo(() => {
    const candidateStarts = [calendarFetchStartDate, currentMonthRange.start, currentWeekRange.start];
    return candidateStarts.reduce((minDate, date) => (isBefore(date, minDate) ? date : minDate), candidateStarts[0]);
  }, [calendarFetchStartDate, currentMonthRange.start, currentWeekRange.start]);

  useEffect(() => {
    if (!onViewStateChange) {
      return;
    }

    onViewStateChange({
      mode,
      monthAnchorTimestamp: startOfDay(monthAnchorDate).getTime(),
      weekAnchorTimestamp: startOfDay(weekAnchorDate).getTime(),
      yearAnchorTimestamp: startOfDay(yearAnchorDate).getTime(),
    });
  }, [mode, monthAnchorDate, weekAnchorDate, yearAnchorDate, onViewStateChange]);

  const { sessions, isLoading } = useEnduranceSessions({
    startDate: calendarFetchStartDateFinal.toISOString(),
    endDate: today.toISOString(),
  });

  const rangesByMode = useMemo<Record<CalendarRangeMode, CalendarRange>>(
    () => ({
      week: currentWeekRange,
      month: currentMonthRange,
      year: currentYearRange,
      last_30_days: last30DaysRange,
    }),
    [currentMonthRange, currentWeekRange, currentYearRange, last30DaysRange],
  );

  const modeOptions = useMemo(
    () => [
      { id: 'week' as const, label: t('training.weekTab') },
      { id: 'month' as const, label: t('training.monthTab') },
      { id: 'year' as const, label: t('training.yearTab') },
      { id: 'last_30_days' as const, label: t('training.last30DaysTab') },
    ],
    [t],
  );

  const weekdayLabels = useMemo(
    () => [
      t('training.weekdayMon'),
      t('training.weekdayTue'),
      t('training.weekdayWed'),
      t('training.weekdayThu'),
      t('training.weekdayFri'),
      t('training.weekdaySat'),
      t('training.weekdaySun'),
    ],
    [t],
  );

  const sessionsWithStartDate = useMemo<SessionWithDate[]>(
    () =>
      (sessions ?? []).map(session => ({
        session,
        startDate: startOfDay(new Date(session.start_time)),
      })),
    [sessions],
  );

  const colorsByDay = useMemo(() => {
    const map: Record<string, string[]> = {};

    sessionsWithStartDate.forEach(({ session, startDate }) => {
      const dayKey = toDayKey(startDate);
      const sportType = normalizeSportTypeForColor(session.sport_type);
      const sportColor = SPORT_COLORS[sportType] ?? SPORT_COLORS.other;

      if (!map[dayKey]) {
        map[dayKey] = [];
      }

      if (!map[dayKey].includes(sportColor)) {
        map[dayKey].push(sportColor);
      }
    });

    return map;
  }, [sessionsWithStartDate]);

  const sessionsByDay = useMemo(() => {
    const map: Record<string, ActivitySession[]> = {};

    sessionsWithStartDate.forEach(({ session, startDate }) => {
      const dayKey = toDayKey(startDate);
      if (!map[dayKey]) {
        map[dayKey] = [];
      }
      map[dayKey].push(session);
    });

    Object.keys(map).forEach(dayKey => {
      map[dayKey].sort((a, b) => Date.parse(b.start_time) - Date.parse(a.start_time));
    });

    return map;
  }, [sessionsWithStartDate]);

  const selectedRange = rangesByMode[mode];

  const sessionsInSelectedRange = useMemo(() => {
    return sessionsWithStartDate
      .filter(({ startDate }) => isDateInsideRange(startDate, selectedRange))
      .map(({ session }) => session);
  }, [selectedRange, sessionsWithStartDate]);

  const selectedRangeSummary = useMemo(() => {
    return sessionsInSelectedRange.reduce(
      (acc, session) => ({
        totalDurationSeconds: acc.totalDurationSeconds + getSessionDurationSeconds(session),
        totalDistanceMeters: acc.totalDistanceMeters + (session.distance_m ?? 0),
        totalCalories: acc.totalCalories + (session.calories_kcal ?? 0),
        totalActivities: acc.totalActivities + 1,
      }),
      {
        totalDurationSeconds: 0,
        totalDistanceMeters: 0,
        totalCalories: 0,
        totalActivities: 0,
      },
    );
  }, [sessionsInSelectedRange]);

  const shouldShowWeekdays = mode === 'week' || mode === 'last_30_days';
  const distanceSummary = convertDistanceToUi(selectedRangeSummary.totalDistanceMeters, 1);

  const sportSummaries = useMemo<SportSummaryCardData[]>(() => {
    const groupedBySport = new Map<
      SummarySportType,
      {
        sportType: SummarySportType;
        sessions: ActivitySession[];
        totalDurationSeconds: number;
        totalDistanceMeters: number;
        totalCalories: number;
        totalSets: number;
        totalVolumeKg: number;
        totalElevationGainMeters: number;
      }
    >();

    sessionsInSelectedRange.forEach(session => {
      const sportType = normalizeSportTypeForSummary(session.sport_type);
      const existingGroup = groupedBySport.get(sportType);

      if (existingGroup) {
        existingGroup.sessions.push(session);
        existingGroup.totalDurationSeconds += getSessionDurationSeconds(session);
        existingGroup.totalDistanceMeters += session.distance_m ?? 0;
        existingGroup.totalCalories += session.calories_kcal ?? 0;
        existingGroup.totalSets += session.total_sets ?? 0;
        existingGroup.totalVolumeKg += session.total_volume_kg ?? 0;
        existingGroup.totalElevationGainMeters += session.elev_gain_m ?? 0;
        return;
      }

      groupedBySport.set(sportType, {
        sportType,
        sessions: [session],
        totalDurationSeconds: getSessionDurationSeconds(session),
        totalDistanceMeters: session.distance_m ?? 0,
        totalCalories: session.calories_kcal ?? 0,
        totalSets: session.total_sets ?? 0,
        totalVolumeKg: session.total_volume_kg ?? 0,
        totalElevationGainMeters: session.elev_gain_m ?? 0,
      });
    });

    return Array.from(groupedBySport.values())
      .map(group => {
        const sortedSessions = [...group.sessions].sort((a, b) => Date.parse(b.start_time) - Date.parse(a.start_time));
        const preferredMiddleMetric = getPreferredMiddleMetric(group.sportType);
        const convertedDistance = convertDistanceToUi(group.totalDistanceMeters, 1);
        const convertedVolume = convertWeightToUi(group.totalVolumeKg);
        const sportConfig = SPORTS_CONFIG[group.sportType] ?? SPORTS_CONFIG.other;
        let middleMetricValue = group.totalSets.toLocaleString();
        let middleMetricLabel = t('training.setsAllCaps');

        if (preferredMiddleMetric === 'volume' && group.totalVolumeKg > 0) {
          middleMetricValue = Math.round(Number(convertedVolume.value)).toLocaleString();
          middleMetricLabel = `${t('training.volume')} ${convertedVolume.unit}`;
        } else if (preferredMiddleMetric === 'distance' && group.totalDistanceMeters > 0) {
          middleMetricValue = `${Number(convertedDistance.value).toLocaleString(undefined, {
            maximumFractionDigits: 1,
          })}`;
          middleMetricLabel = t('training.calendarDistanceWithUnit', { unit: convertedDistance.unit });
        } else if (preferredMiddleMetric === 'sets' && group.totalSets > 0) {
          middleMetricValue = group.totalSets.toLocaleString();
          middleMetricLabel = t('training.setsAllCaps');
        } else if (group.totalDistanceMeters > 0) {
          middleMetricValue = `${Number(convertedDistance.value).toLocaleString(undefined, {
            maximumFractionDigits: 1,
          })}`;
          middleMetricLabel = t('training.calendarDistanceWithUnit', { unit: convertedDistance.unit });
        } else if (group.totalVolumeKg > 0) {
          middleMetricValue = Math.round(Number(convertedVolume.value)).toLocaleString();
          middleMetricLabel = `${t('training.volume')} ${convertedVolume.unit}`;
        } else if (group.totalElevationGainMeters > 0) {
          middleMetricValue = Math.round(group.totalElevationGainMeters).toLocaleString();
          middleMetricLabel = t('training.elevationM');
        } else if (preferredMiddleMetric === 'calories' && group.totalCalories > 0) {
          middleMetricValue = Math.round(group.totalCalories).toLocaleString();
          middleMetricLabel = t('training.caloriesKcal');
        }
        const color = SPORT_COLORS[group.sportType] ?? SPORT_COLORS.other;

        return {
          sportType: group.sportType,
          color,
          label: group.sportType === 'gym' ? t('constants.strength') : t(sportConfig.label),
          sessions: sortedSessions,
          sessionCount: group.sessions.length,
          totalDurationSeconds: group.totalDurationSeconds,
          totalCalories: group.totalCalories,
          totalDistanceMeters: group.totalDistanceMeters,
          totalSets: group.totalSets,
          totalVolumeKg: group.totalVolumeKg,
          totalElevationGainMeters: group.totalElevationGainMeters,
          middleMetricValue,
          middleMetricLabel,
        };
      })
      .sort((a, b) => b.totalDurationSeconds - a.totalDurationSeconds);
  }, [convertDistanceToUi, convertWeightToUi, sessionsInSelectedRange, t]);

  const maxSportDuration = useMemo(() => {
    return sportSummaries.reduce((maxValue, summary) => {
      return summary.totalDurationSeconds > maxValue ? summary.totalDurationSeconds : maxValue;
    }, 0);
  }, [sportSummaries]);

  const selectedDaySessions = useMemo(() => {
    if (!selectedDay) {
      return [];
    }

    const dayKey = toDayKey(selectedDay);
    return sessionsByDay[dayKey] ?? [];
  }, [selectedDay, sessionsByDay]);

  const calendarTitle = useMemo(() => {
    switch (mode) {
      case 'week':
        return `${format(selectedRange.start, 'd/M/yyyy')} - ${format(selectedRange.end, 'd/M/yyyy')}`;
      case 'month':
        return format(monthAnchorDate, 'LLLL yyyy', { locale: getDateFnsLocale() });
      case 'year':
        return format(yearAnchorDate, 'yyyy');
      case 'last_30_days':
      default:
        return t('training.last30Days');
    }
  }, [mode, monthAnchorDate, selectedRange.end, selectedRange.start, t, yearAnchorDate]);

  const monthGridRows = useMemo(() => {
    const gridStart = startOfWeek(currentMonthRange.start, { weekStartsOn: WEEK_STARTS_ON_MONDAY });
    const gridEnd = endOfWeek(currentMonthRange.end, { weekStartsOn: WEEK_STARTS_ON_MONDAY });
    return buildWeekRows(gridStart, gridEnd);
  }, [currentMonthRange.end, currentMonthRange.start]);

  const weekGridRows = useMemo(() => {
    return buildWeekRows(currentWeekRange.start, currentWeekRange.end);
  }, [currentWeekRange.end, currentWeekRange.start]);

  const last30DaysGridRows = useMemo(() => {
    const gridStart = startOfWeek(last30DaysRange.start, { weekStartsOn: WEEK_STARTS_ON_MONDAY });
    const gridEnd = endOfWeek(last30DaysRange.end, { weekStartsOn: WEEK_STARTS_ON_MONDAY });
    return buildWeekRows(gridStart, gridEnd);
  }, [last30DaysRange.end, last30DaysRange.start]);

  const yearMonthStartDates = useMemo(() => {
    return Array.from({ length: 12 }, (_, monthIndex) => {
      const date = new Date(currentYearRange.start);
      date.setMonth(monthIndex);
      return startOfMonth(date);
    });
  }, [currentYearRange.start]);

  const handleYearMonthPress = (monthStartDate: Date) => {
    setMonthAnchorDate(monthStartDate);
    setMode('month');
  };

  const resetAnchorToCurrent = (targetMode: CalendarRangeMode) => {
    if (targetMode === 'week') {
      setWeekAnchorDate(today);
      return;
    }

    if (targetMode === 'month') {
      setMonthAnchorDate(today);
      return;
    }

    if (targetMode === 'year') {
      setYearAnchorDate(today);
    }
  };

  const handleModePress = (nextMode: CalendarRangeMode) => {
    resetAnchorToCurrent(nextMode);

    if (nextMode === mode) {
      setSelectedDay(null);
      setIsDayModalVisible(false);
      return;
    }

    setMode(nextMode);
  };

  const handleNavigateRange = useCallback(
    (direction: 'previous' | 'next') => {
      const step = direction === 'next' ? 1 : -1;

      if (mode === 'week') {
        setWeekAnchorDate(previous => addDays(previous, step * 7));
        return;
      }

      if (mode === 'month') {
        setMonthAnchorDate(previous => addMonths(previous, step));
        return;
      }

      if (mode === 'year') {
        setYearAnchorDate(previous => addYears(previous, step));
      }
    },
    [mode],
  );

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_, gestureState) => {
          if (mode !== 'week' && mode !== 'month' && mode !== 'year') {
            return false;
          }

          const absDx = Math.abs(gestureState.dx);
          const absDy = Math.abs(gestureState.dy);
          return absDx > 12 && absDx > absDy * 1.15;
        },
        onPanResponderRelease: (_, gestureState) => {
          if (mode !== 'week' && mode !== 'month' && mode !== 'year') {
            return;
          }

          const absDx = Math.abs(gestureState.dx);
          const absDy = Math.abs(gestureState.dy);

          if (absDx < 34 || absDx <= absDy) {
            return;
          }

          if (gestureState.dx > 0) {
            handleNavigateRange('previous');
            return;
          }

          handleNavigateRange('next');
        },
        onPanResponderTerminationRequest: () => true,
      }),
    [handleNavigateRange, mode],
  );

  const handleDayPress = (date: Date) => {
    setSelectedDay(startOfDay(date));
    setIsDayModalVisible(true);
  };

  const handleSportSummaryPress = (sportType: SummarySportType) => {
    const selectedSummary = sportSummaries.find(summary => summary.sportType === sportType);
    if (!selectedSummary) {
      return;
    }

    const rangeEnd = isAfter(selectedRange.end, today) ? today : selectedRange.end;

    onOpenSportHistory({
      sportType,
      sportLabel: selectedSummary.label,
      rangeStart: startOfDay(selectedRange.start).toISOString(),
      rangeEnd: startOfDay(rangeEnd).toISOString(),
    });
  };

  const renderHistorySessionCard = (session: ActivitySession) => {
    const colorKey = normalizeSportTypeForColor(session.sport_type);
    const color = SPORT_COLORS[colorKey] ?? SPORT_COLORS.other;
    const isStrength = session.sport_type === 'strength';
    const sessionConfig = SPORTS_CONFIG[session.sport_type] || SPORTS_CONFIG.other;
    const sessionTitle = session.name || (isStrength ? t('training.strengthWorkout') : t(sessionConfig.defaultTitle));
    const durationSeconds = getSessionDurationSeconds(session);
    const distanceObj = convertDistanceToUi(session.distance_m, 1);
    const distanceLabel =
      session.distance_m != null && session.distance_m > 0 ? `${distanceObj.value} ${distanceObj.unit}` : '-';
    const caloriesLabel = Math.round(session.calories_kcal ?? 0).toLocaleString();
    const startTimeLabel = format(new Date(session.start_time), 'HH:mm');
    const hasRoute = hasSessionRoute(session);

    return (
      <TouchableOpacity
        key={session.id}
        activeOpacity={0.85}
        onPress={() => {
          setIsDayModalVisible(false);
          onOpenSession(session);
        }}
        style={[
          styles.sessionCard,
          {
            borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)',
            backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#FFFFFF',
          },
        ]}
      >
        <View style={styles.sessionCardTop}>
          <View style={[styles.sessionColorDot, { backgroundColor: color }]} />
          <View style={styles.sessionHeaderInfo}>
            <Text style={[styles.sessionTitle, { color: themeColors.textPrimary }]}>{sessionTitle}</Text>
            <View style={styles.sessionMetaRow}>
              <Text style={[styles.sessionMeta, { color: themeColors.textSecondary }]}>{startTimeLabel}</Text>
              {hasRoute && (
                <View style={[styles.routeBadge, { backgroundColor: isDark ? `${color}30` : `${color}20` }]}>
                  <Text style={[styles.routeBadgeText, { color }]}>{t('training.routeAvailable')}</Text>
                </View>
              )}
            </View>
          </View>
        </View>

        <View style={styles.sessionMetricsRow}>
          <View style={styles.metricItem}>
            <Text style={[styles.metricValue, { color: themeColors.textPrimary }]}>
              {formatHoursAndMinutes(durationSeconds)}
            </Text>
            <Text style={[styles.metricLabel, { color: themeColors.textSecondary }]}>{t('training.duration')}</Text>
          </View>
          <View style={styles.metricItem}>
            <Text style={[styles.metricValue, { color: themeColors.textPrimary }]}>{distanceLabel}</Text>
            <Text style={[styles.metricLabel, { color: themeColors.textSecondary }]}>{t('training.distance')}</Text>
          </View>
          <View style={styles.metricItem}>
            <Text style={[styles.metricValue, { color: themeColors.textPrimary }]}>{caloriesLabel}</Text>
            <Text style={[styles.metricLabel, { color: themeColors.textSecondary }]}>{t('training.caloriesKcal')}</Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const renderDayCell = (date: Date, isVisible: boolean) => {
    const dayColors = isVisible ? (colorsByDay[toDayKey(date)] ?? []) : [];
    const isToday = isVisible && isSameDay(date, today);

    if (!isVisible) {
      return (
        <View key={date.toISOString()} style={styles.dayCell}>
          <Text style={[styles.dayNumber, { opacity: 0 }]}>{format(date, 'd')}</Text>
          <View style={styles.dayDotPlaceholder} />
        </View>
      );
    }

    return (
      <TouchableOpacity
        key={date.toISOString()}
        style={[
          styles.dayCell,
          isToday && {
            backgroundColor: isDark ? 'rgba(0,122,255,0.12)' : 'rgba(0,122,255,0.08)',
            borderRadius: borderRadius.m,
          },
        ]}
        onPress={() => handleDayPress(date)}
        activeOpacity={0.8}
      >
        <Text style={[styles.dayNumber, { color: isToday ? themeColors.primary : themeColors.textPrimary }]}>
          {format(date, 'd')}
        </Text>
        <DayDots colorsForDay={dayColors} dotFallbackColor={isDark ? 'rgba(255,255,255,0.28)' : 'rgba(0,0,0,0.18)'} />
      </TouchableOpacity>
    );
  };

  const renderMatrixByRows = (rows: Date[][], visiblePredicate: (date: Date) => boolean) => {
    return (
      <View style={styles.matrixContainer}>
        {rows.map((week, weekIndex) => (
          <View key={`week-${weekIndex}`} style={styles.weekRow}>
            {week.map(date => renderDayCell(date, visiblePredicate(date)))}
          </View>
        ))}
      </View>
    );
  };

  const renderYearGrid = () => {
    return (
      <View style={styles.yearGridContainer}>
        {yearMonthStartDates.map(monthStartDate => {
          const monthGridStart = startOfWeek(monthStartDate, { weekStartsOn: WEEK_STARTS_ON_MONDAY });
          const monthGridEnd = endOfWeek(endOfMonth(monthStartDate), { weekStartsOn: WEEK_STARTS_ON_MONDAY });
          const monthRows = buildWeekRows(monthGridStart, monthGridEnd);
          const monthDays = monthRows.flat();

          return (
            <TouchableOpacity
              key={monthStartDate.toISOString()}
              style={[
                styles.yearMonthBlock,
                isCompact && styles.yearMonthBlockCompact,
                {
                  borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)',
                  backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.7)',
                },
              ]}
              onPress={() => handleYearMonthPress(monthStartDate)}
              activeOpacity={0.85}
            >
              <Text style={[styles.yearMonthTitle, { color: themeColors.textSecondary }]}>
                {format(monthStartDate, 'LLLL', { locale: getDateFnsLocale() })}
              </Text>
              <View style={styles.yearMonthMatrix}>
                {monthDays.map(date => {
                  const isInMonth = isSameMonth(date, monthStartDate);
                  const dayColors = isInMonth ? (colorsByDay[toDayKey(date)] ?? []) : [];

                  return (
                    <View key={date.toISOString()} style={styles.yearDayCell}>
                      {isInMonth ? (
                        <DayDots
                          colorsForDay={dayColors}
                          isCompact
                          dotFallbackColor={isDark ? 'rgba(255,255,255,0.20)' : 'rgba(0,0,0,0.16)'}
                        />
                      ) : (
                        <View style={styles.yearDayPlaceholder} />
                      )}
                    </View>
                  );
                })}
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
    );
  };

  return (
    <>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.container,
          {
            paddingBottom: insets.bottom + (isCompact ? 200 : 180),
          },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.modeTabsRow}>
          {modeOptions.map(option => {
            const isActive = mode === option.id;
            return (
              <TouchableOpacity
                key={option.id}
                onPress={() => handleModePress(option.id)}
                style={[
                  styles.modeTabButton,
                  isCompact && styles.modeTabButtonCompact,
                  {
                    backgroundColor: isActive
                      ? themeColors.primary
                      : isDark
                        ? 'rgba(255,255,255,0.08)'
                        : 'rgba(0,0,0,0.04)',
                    borderColor: isDark ? 'rgba(255,255,255,0.16)' : 'rgba(0,0,0,0.08)',
                  },
                ]}
              >
                <Text
                  style={[
                    styles.modeTabText,
                    isCompact && styles.modeTabTextCompact,
                    {
                      color: isActive ? '#FFFFFF' : themeColors.textSecondary,
                    },
                  ]}
                >
                  {option.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={styles.titleRow}>
          {mode === 'week' || mode === 'month' || mode === 'year' ? (
            <TouchableOpacity
              style={styles.titleNavButton}
              onPress={() => handleNavigateRange('previous')}
              hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
            >
              <ChevronLeft size={18} color={themeColors.textSecondary} />
            </TouchableOpacity>
          ) : (
            <View style={styles.titleNavPlaceholder} />
          )}

          <View>
            <Text style={[styles.title, { color: themeColors.textPrimary }]}>{calendarTitle}</Text>
          </View>

          {mode === 'week' || mode === 'month' || mode === 'year' ? (
            <TouchableOpacity
              style={styles.titleNavButton}
              onPress={() => handleNavigateRange('next')}
              hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
            >
              <ChevronRight size={18} color={themeColors.textSecondary} />
            </TouchableOpacity>
          ) : (
            <View style={styles.titleNavPlaceholder} />
          )}
        </View>
        <Text style={[styles.exerciseCount, { color: themeColors.textSecondary }]}>
          {t('training.activityCount', { count: sessionsInSelectedRange.length })}
        </Text>

        {isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="small" color={themeColors.primary} />
          </View>
        ) : (
          <>
            <View
              style={[
                styles.calendarPanel,
                {
                  borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)',
                  backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.75)',
                },
              ]}
              {...panResponder.panHandlers}
            >
              {shouldShowWeekdays && (
                <View style={styles.weekdaysRow}>
                  {weekdayLabels.map(dayLabel => (
                    <Text
                      key={dayLabel}
                      style={[
                        styles.weekdayLabel,
                        isCompact && styles.weekdayLabelCompact,
                        {
                          color: themeColors.textSecondary,
                        },
                      ]}
                    >
                      {dayLabel}
                    </Text>
                  ))}
                </View>
              )}

              {mode === 'week' && renderMatrixByRows(weekGridRows, () => true)}
              {mode === 'month' && renderMatrixByRows(monthGridRows, date => isSameMonth(date, monthAnchorDate))}
              {mode === 'last_30_days' &&
                renderMatrixByRows(last30DaysGridRows, date => isDateInsideRange(date, last30DaysRange))}
              {mode === 'year' && renderYearGrid()}
            </View>
          </>
        )}

        <View
          style={[
            styles.summaryRow,
            isCompact && styles.summaryRowCompact,
            {
              borderTopColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)',
            },
          ]}
        >
          <View style={[styles.summaryItem, isCompact && styles.summaryItemCompact]}>
            <Text
              style={[styles.summaryValue, isCompact && styles.summaryValueCompact, { color: themeColors.textPrimary }]}
            >
              {formatHoursAndMinutes(selectedRangeSummary.totalDurationSeconds)}
            </Text>
            <Text style={[styles.summaryLabel, { color: themeColors.textSecondary }]}>
              {t('training.calendarDurationH')}
            </Text>
          </View>
          <View style={[styles.summaryItem, isCompact && styles.summaryItemCompact]}>
            <Text
              style={[styles.summaryValue, isCompact && styles.summaryValueCompact, { color: themeColors.textPrimary }]}
            >
              {Number(distanceSummary.value).toLocaleString(undefined, { maximumFractionDigits: 1 })}
            </Text>
            <Text style={[styles.summaryLabel, { color: themeColors.textSecondary }]}>
              {t('training.calendarDistanceWithUnit', { unit: distanceSummary.unit })}
            </Text>
          </View>
          <View style={[styles.summaryItem, isCompact && styles.summaryItemCompact]}>
            <Text
              style={[styles.summaryValue, isCompact && styles.summaryValueCompact, { color: themeColors.textPrimary }]}
            >
              {selectedRangeSummary.totalActivities.toLocaleString()}
            </Text>
            <Text style={[styles.summaryLabel, { color: themeColors.textSecondary }]}>{t('training.activities')}</Text>
          </View>
          <View style={[styles.summaryItem, isCompact && styles.summaryItemCompact]}>
            <Text
              style={[styles.summaryValue, isCompact && styles.summaryValueCompact, { color: themeColors.textPrimary }]}
            >
              {Math.round(selectedRangeSummary.totalCalories).toLocaleString()}
            </Text>
            <Text style={[styles.summaryLabel, { color: themeColors.textSecondary }]}>
              {t('training.calendarCaloriesKcal')}
            </Text>
          </View>
        </View>

        {sportSummaries.length > 0 && (
          <View style={styles.sportSummarySection}>
            <Text style={[styles.sportSummaryTitle, { color: themeColors.textPrimary }]}>
              {t('training.sportSummaryByType')}
            </Text>
            {sportSummaries.map(summary => {
              const sportKey = summary.sportType === 'gym' ? 'gym' : summary.sportType;
              const progress =
                maxSportDuration > 0 ? Math.max(8, (summary.totalDurationSeconds / maxSportDuration) * 100) : 8;

              return (
                <TouchableOpacity
                  key={summary.sportType}
                  activeOpacity={0.82}
                  onPress={() => handleSportSummaryPress(summary.sportType)}
                  style={[
                    styles.sportSummaryCard,
                    {
                      borderColor: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.06)',
                      backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#FFFFFF',
                    },
                  ]}
                >
                  {/* Left accent bar */}
                  <View style={[styles.sportAccentBar, { backgroundColor: summary.color }]} />

                  <View style={styles.sportCardContent}>
                    {/* Header: Icon + Name + Chevron */}
                    <View style={styles.sportSummaryHeader}>
                      <View style={styles.sportSummaryHeaderLeft}>
                        <View
                          style={[
                            styles.sportIconContainer,
                            {
                              backgroundColor: isDark ? `${summary.color}20` : `${summary.color}12`,
                            },
                          ]}
                        >
                          <SportIcon sport={sportKey} size={20} color={summary.color} />
                        </View>
                        <View style={styles.sportNameBlock}>
                          <Text style={[styles.sportSummaryName, { color: themeColors.textPrimary }]}>
                            {summary.label}
                          </Text>
                          <Text style={[styles.sportSummarySubtitle, { color: themeColors.textSecondary }]}>
                            {t('training.activityCount', { count: summary.sessionCount })}
                          </Text>
                        </View>
                      </View>
                      <ChevronRight size={18} color={themeColors.textSecondary} strokeWidth={2} />
                    </View>

                    {/* Progress bar */}
                    <View
                      style={[
                        styles.sportSummaryTrack,
                        {
                          backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)',
                        },
                      ]}
                    >
                      <View
                        style={[
                          styles.sportSummaryFill,
                          {
                            width: `${progress}%`,
                            backgroundColor: summary.color,
                          },
                        ]}
                      />
                    </View>

                    {/* Metrics row */}
                    <View style={styles.sportSummaryMetrics}>
                      <View style={styles.sportSummaryMetricItem}>
                        <Text style={[styles.sportSummaryMetricValue, { color: themeColors.textPrimary }]}>
                          {formatHoursAndMinutes(summary.totalDurationSeconds)}
                        </Text>
                        <Text style={[styles.sportSummaryMetricLabel, { color: themeColors.textSecondary }]}>
                          {t('training.calendarDurationH')}
                        </Text>
                      </View>
                      <View
                        style={[
                          styles.sportMetricDivider,
                          { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)' },
                        ]}
                      />
                      <View style={styles.sportSummaryMetricItem}>
                        <Text style={[styles.sportSummaryMetricValue, { color: themeColors.textPrimary }]}>
                          {summary.middleMetricValue}
                        </Text>
                        <Text style={[styles.sportSummaryMetricLabel, { color: themeColors.textSecondary }]}>
                          {summary.middleMetricLabel}
                        </Text>
                      </View>
                      <View
                        style={[
                          styles.sportMetricDivider,
                          { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)' },
                        ]}
                      />
                      <View style={styles.sportSummaryMetricItem}>
                        <Text style={[styles.sportSummaryMetricValue, { color: themeColors.textPrimary }]}>
                          {Math.round(summary.totalCalories).toLocaleString()}
                        </Text>
                        <Text style={[styles.sportSummaryMetricLabel, { color: themeColors.textSecondary }]}>
                          {t('training.calendarCaloriesKcal')}
                        </Text>
                      </View>
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </ScrollView>

      <Modal
        visible={isDayModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setIsDayModalVisible(false)}
      >
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setIsDayModalVisible(false)}>
          <TouchableOpacity
            activeOpacity={1}
            onPress={event => event.stopPropagation()}
            style={[styles.modalSheet, { backgroundColor: isDark ? themeColors.surfaceSolid : '#FFFFFF' }]}
          >
            <View style={styles.modalHeader}>
              <View>
                <Text style={[styles.modalTitle, { color: themeColors.textPrimary }]}>
                  {selectedDay ? format(selectedDay, 'd MMMM yyyy', { locale: getDateFnsLocale() }) : ''}
                </Text>
                <Text style={[styles.modalSubtitle, { color: themeColors.textSecondary }]}>
                  {t('training.activityCount', { count: selectedDaySessions.length })}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setIsDayModalVisible(false)}>
                <Text style={[styles.closeText, { color: themeColors.primary }]}>{t('training.close')}</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalScroll} contentContainerStyle={styles.modalContent}>
              {selectedDaySessions.length === 0 && (
                <View style={styles.emptyDayState}>
                  <Text style={[styles.emptyDayText, { color: themeColors.textSecondary }]}>
                    {t('training.noActivities')}
                  </Text>
                </View>
              )}

              {selectedDaySessions.map(renderHistorySessionCard)}
            </ScrollView>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
  },
  container: {
    paddingHorizontal: spacing.m,
    flexGrow: 1,
  },
  modeTabsRow: {
    flexDirection: 'row',
    gap: spacing.s,
    marginBottom: spacing.l,
    marginTop: spacing.xs,
  },
  modeTabButton: {
    paddingHorizontal: spacing.m,
    paddingVertical: spacing.xs + 2,
    borderRadius: borderRadius.full,
    borderWidth: 1,
  },
  modeTabButtonCompact: {
    paddingHorizontal: spacing.s + 2,
  },
  modeTabText: {
    ...typography.caption,
    fontWeight: '700',
    fontSize: 15,
  },
  modeTabTextCompact: {
    fontSize: 13,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  titleNavButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleNavPlaceholder: {
    width: 30,
    height: 30,
  },
  title: {
    ...typography.h2,
    fontWeight: '700',
    textTransform: 'capitalize',
  },
  exerciseCount: {
    ...typography.body,
    alignSelf: 'center',
    textAlign: 'center',
    marginBottom: spacing.m,
  },
  loadingContainer: {
    height: 240,
    alignItems: 'center',
    justifyContent: 'center',
  },
  weekdaysRow: {
    flexDirection: 'row',
    marginBottom: spacing.s,
  },
  weekdayLabel: {
    flex: 1,
    textAlign: 'center',
    ...typography.caption,
    fontSize: 13,
    fontWeight: '600',
  },
  weekdayLabelCompact: {
    fontSize: 12,
  },
  matrixContainer: {
    marginBottom: spacing.l,
  },
  weekRow: {
    flexDirection: 'row',
    marginBottom: spacing.s,
  },
  dayCell: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-start',
    minHeight: 42,
    paddingVertical: 2,
  },
  dayNumber: {
    ...typography.body,
    fontSize: 20,
    fontWeight: '700',
    marginBottom: spacing.xs,
  },
  emptyDot: {
    opacity: 0.75,
  },
  singleDot: {
    opacity: 0.95,
  },
  stackDotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stackDot: {
    opacity: 0.98,
  },
  dayDotPlaceholder: {
    height: 12,
  },
  yearGridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: spacing.l,
    marginBottom: spacing.l,
  },
  yearMonthBlock: {
    width: '31.5%',
    borderWidth: 1,
    borderRadius: borderRadius.m,
    padding: spacing.s,
  },
  yearMonthBlockCompact: {
    width: '48%',
  },
  yearMonthTitle: {
    ...typography.body,
    fontWeight: '600',
    marginBottom: spacing.xs,
    textTransform: 'capitalize',
  },
  yearMonthMatrix: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  yearDayCell: {
    width: '14.285%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 1,
    minHeight: 10,
  },
  yearDayPlaceholder: {
    width: 4,
    height: 4,
  },
  summaryRow: {
    flexDirection: 'row',
    borderTopWidth: 1,
    paddingTop: spacing.m,
    marginTop: spacing.s,
  },
  summaryRowCompact: {
    flexWrap: 'wrap',
    rowGap: spacing.m,
  },
  summaryItem: {
    flex: 1,
    alignItems: 'center',
  },
  summaryItemCompact: {
    minWidth: '50%',
    flexBasis: '50%',
  },
  summaryValue: {
    ...typography.h3,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  summaryValueCompact: {
    fontSize: 24,
  },
  summaryLabel: {
    ...typography.caption,
    marginTop: 2,
    textAlign: 'center',
  },
  sportSummarySection: {
    marginTop: spacing.l,
    gap: spacing.m,
  },
  sportSummaryTitle: {
    ...typography.h3,
    fontWeight: '700',
  },
  sportSummaryCard: {
    borderWidth: 1,
    borderRadius: borderRadius.l,
    overflow: 'hidden',
    flexDirection: 'row',
  },
  sportAccentBar: {
    width: 4,
  },
  sportCardContent: {
    flex: 1,
    padding: spacing.m,
    gap: spacing.s,
  },
  sportSummaryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.s,
  },
  sportSummaryHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s,
    flex: 1,
  },
  sportIconContainer: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sportNameBlock: {
    flex: 1,
  },
  sportSummaryName: {
    ...typography.body,
    fontWeight: '700',
    fontSize: 16,
  },
  sportSummarySubtitle: {
    ...typography.caption,
    fontSize: 12,
    marginTop: 1,
  },
  sportSummaryTrack: {
    height: 4,
    borderRadius: borderRadius.full,
    overflow: 'hidden',
  },
  sportSummaryFill: {
    height: '100%',
    borderRadius: borderRadius.full,
  },
  sportSummaryMetrics: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.xs,
  },
  sportSummaryMetricItem: {
    flex: 1,
    alignItems: 'center',
  },
  sportMetricDivider: {
    width: 1,
    height: 28,
    borderRadius: 0.5,
  },
  sportSummaryMetricValue: {
    ...typography.body,
    fontWeight: '700',
    fontSize: 15,
    fontVariant: ['tabular-nums'],
    textAlign: 'center',
  },
  sportSummaryMetricLabel: {
    ...typography.caption,
    fontSize: 11,
    marginTop: 2,
    textAlign: 'center',
  },
  calendarPanel: {
    borderWidth: 1,
    borderRadius: borderRadius.l,
    paddingHorizontal: spacing.s,
    paddingVertical: spacing.m,
    marginBottom: spacing.s,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    borderTopLeftRadius: borderRadius.l,
    borderTopRightRadius: borderRadius.l,
    maxHeight: '78%',
    paddingTop: spacing.l,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: spacing.l,
    marginBottom: spacing.m,
  },
  modalTitle: {
    ...typography.h3,
    fontWeight: '700',
    textTransform: 'capitalize',
  },
  modalSubtitle: {
    ...typography.body,
    marginTop: 2,
  },
  closeText: {
    ...typography.body,
    fontWeight: '700',
  },
  modalScroll: {
    flex: 1,
  },
  modalContent: {
    paddingHorizontal: spacing.l,
    paddingBottom: spacing.xl,
    gap: spacing.m,
  },
  emptyDayState: {
    paddingVertical: spacing.l,
    alignItems: 'center',
  },
  emptyDayText: {
    ...typography.body,
  },
  sessionCard: {
    borderWidth: 1,
    borderRadius: borderRadius.l,
    padding: spacing.m,
    gap: spacing.m,
  },
  sessionCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s,
  },
  sessionColorDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  sessionHeaderInfo: {
    flex: 1,
  },
  sessionTitle: {
    ...typography.body,
    fontWeight: '700',
    fontSize: 16,
  },
  sessionMeta: {
    ...typography.caption,
    marginTop: 2,
  },
  sessionMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s,
    marginTop: 2,
    flexWrap: 'wrap',
  },
  routeBadge: {
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.s,
    paddingVertical: 2,
  },
  routeBadgeText: {
    ...typography.caption,
    fontWeight: '700',
    fontSize: 11,
  },
  sessionMetricsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.s,
  },
  metricItem: {
    flex: 1,
  },
  metricValue: {
    ...typography.body,
    fontWeight: '700',
  },
  metricLabel: {
    ...typography.caption,
    marginTop: 2,
  },
});
