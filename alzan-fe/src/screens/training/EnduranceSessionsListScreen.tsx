import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Modal,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { TrainingScreenNavigationProp } from '../../types/navigation.types';
import { GlassCard } from '../../components/GlassCard';
import { colors, spacing, typography, borderRadius } from '../../theme';
import { useTrainingStyles } from '../../hooks/useTrainingStyles';
import { LinearGradient } from 'expo-linear-gradient';
import { SPORT_COLORS } from '../../theme/sportColors';
import { useEnduranceSessions } from '../../hooks/useEnduranceSessions';
import { Activity, Calendar, Trash2, Dumbbell, Filter, X, Route } from 'lucide-react-native';
import { RouteMap } from '../../components/common/RouteMap';
import { format, subDays, subMonths, startOfDay } from 'date-fns';
import { SPORTS_CONFIG, formatDuration } from '../../constants/sports';
import { useUnitConversion } from '../../hooks/useUnitConversion';
import DateTimePicker from '@react-native-community/datetimepicker';
import { ActivitySession } from '../../types/requests.types';
import { ThemeColors } from '../../context/ThemeContext';
import { useTranslation } from 'react-i18next';
import { getDateFnsLocale } from '../../i18n/dateLocale';
import { Alert } from '../../components/common/Alert';
import { ActivityCalendarView, type ActivityCalendarViewState } from './components/ActivityCalendarView';
import { useSportCatalog } from '../../hooks/useSportCatalog';

type FilterPreset = 'all' | 'week' | 'month' | 'three_months' | 'custom';

interface DateFilter {
  preset: FilterPreset;
  startDate?: string;
  endDate?: string;
}

type ActivityView = 'calendar' | 'history';
type HistorySportFilter = 'all' | 'gym' | ActivitySession['sport_type'] | 'volleyball' | 'trail' | 'golf' | 'hyrox';
const HISTORY_PAGE_SIZE = 10;

interface HistorySummaryTotals {
  totalDurationSeconds: number;
  totalDistanceMeters: number;
  totalCalories: number;
  totalActivities: number;
  totalSets: number;
  totalVolumeKg: number;
  totalElevationGainMeters: number;
}

const normalizeCustomRange = (startDate: Date, endDate: Date): { start: Date; end: Date } => {
  const normalizedStart = startOfDay(startDate);
  const normalizedEnd = startOfDay(endDate);

  if (normalizedStart.getTime() <= normalizedEnd.getTime()) {
    return { start: normalizedStart, end: normalizedEnd };
  }

  return { start: normalizedEnd, end: normalizedStart };
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

const hasSessionRoute = (session: ActivitySession): boolean => {
  return typeof session.route_polyline === 'string' && session.route_polyline.trim().length > 0;
};

const formatHoursAndMinutes = (totalSeconds: number): string => {
  const totalMinutes = Math.round(totalSeconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}:${minutes.toString().padStart(2, '0')}`;
};

// Helper component for filter options
const FilterOption: React.FC<{
  label: string;
  isActive: boolean;
  onPress: () => void;
  isDark: boolean;
  themeColors: ThemeColors;
}> = ({ label, isActive, onPress, isDark, themeColors }) => (
  <TouchableOpacity
    style={[
      styles.filterOption,
      { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : colors.surfaceHighlight },
      isActive && {
        borderColor: themeColors.primary,
        backgroundColor: isDark ? 'rgba(0,122,255,0.15)' : `${colors.primary}15`,
      },
    ]}
    onPress={onPress}
  >
    <Text style={[styles.filterOptionText, { color: isActive ? themeColors.primary : themeColors.textPrimary }]}>
      {label}
    </Text>
    {isActive && <View style={[styles.filterOptionCheck, { backgroundColor: themeColors.primary }]} />}
  </TouchableOpacity>
);

export const EnduranceSessionsListScreen = () => {
  const { t } = useTranslation();
  const { styles: dynamicStyles, colors: themeColors, isDark } = useTrainingStyles();
  const navigation = useNavigation<TrainingScreenNavigationProp>();
  const { convertDistanceToUi, convertSpeedToUi, convertWeightToUi } = useUnitConversion();
  const { getOptionLabel } = useSportCatalog();

  // Date filter state
  const [dateFilter, setDateFilter] = useState<DateFilter>({ preset: 'all' });
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [showStartDatePicker, setShowStartDatePicker] = useState(false);
  const [showEndDatePicker, setShowEndDatePicker] = useState(false);
  const [customStartDate, setCustomStartDate] = useState(new Date());
  const [customEndDate, setCustomEndDate] = useState(new Date());
  const [activeView, setActiveView] = useState<ActivityView>('calendar');
  const [historySportFilter, setHistorySportFilter] = useState<HistorySportFilter>('all');
  const [historySportLabel, setHistorySportLabel] = useState<string>('');
  const [isCalendarDrilldownActive, setIsCalendarDrilldownActive] = useState(false);
  const [historyVisibleLimit, setHistoryVisibleLimit] = useState(HISTORY_PAGE_SIZE);
  const [calendarViewState, setCalendarViewState] = useState<ActivityCalendarViewState>(() => ({
    mode: 'month',
    monthAnchorTimestamp: startOfDay(new Date()).getTime(),
  }));
  const isHistoryView = activeView === 'history';

  const updateCustomStartDate = (nextStartDate: Date) => {
    const normalizedStart = startOfDay(nextStartDate);
    setCustomStartDate(normalizedStart);
    setCustomEndDate(previousEndDate => {
      const normalizedEnd = startOfDay(previousEndDate);
      return normalizedStart.getTime() > normalizedEnd.getTime() ? normalizedStart : normalizedEnd;
    });
  };

  const updateCustomEndDate = (nextEndDate: Date) => {
    const normalizedEnd = startOfDay(nextEndDate);
    setCustomEndDate(normalizedEnd);
    setCustomStartDate(previousStartDate => {
      const normalizedStart = startOfDay(previousStartDate);
      return normalizedEnd.getTime() < normalizedStart.getTime() ? normalizedEnd : normalizedStart;
    });
  };

  // Calculate date range based on preset
  const getDateRange = (preset: FilterPreset): { startDate?: string; endDate?: string } => {
    // Use startOfDay because the hook adds +1 day to include the entire end date
    const today = startOfDay(new Date());

    switch (preset) {
      case 'week':
        return {
          startDate: startOfDay(subDays(today, 6)).toISOString(),
          endDate: today.toISOString(),
        };
      case 'month':
        return {
          startDate: startOfDay(subMonths(today, 1)).toISOString(),
          endDate: today.toISOString(),
        };
      case 'three_months':
        return {
          startDate: startOfDay(subMonths(today, 3)).toISOString(),
          endDate: today.toISOString(),
        };
      case 'custom': {
        const normalizedRange = normalizeCustomRange(customStartDate, customEndDate);
        return {
          startDate: normalizedRange.start.toISOString(),
          endDate: normalizedRange.end.toISOString(),
        };
      }
      case 'all':
      default:
        return {};
    }
  };

  const currentDateRange = getDateRange(dateFilter.preset);
  const historyQueryOptions = useMemo(
    () => ({
      ...currentDateRange,
      sportType: isHistoryView ? historySportFilter : ('all' as const),
      limit: isHistoryView ? historyVisibleLimit : undefined,
      enabled: isHistoryView,
    }),
    [currentDateRange.endDate, currentDateRange.startDate, historySportFilter, historyVisibleLimit, isHistoryView],
  );
  const { sessions, isLoading, isFetching, hasMore, deleteSession } = useEnduranceSessions(historyQueryOptions);

  useEffect(() => {
    if (!isHistoryView) return;
    setHistoryVisibleLimit(HISTORY_PAGE_SIZE);
  }, [currentDateRange.endDate, currentDateRange.startDate, historySportFilter, isHistoryView]);

  const getSportFilterLabel = (sport: HistorySportFilter): string => {
    if (sport === 'all') {
      return t('training.all');
    }

    if (sport === 'gym' || sport === 'strength') {
      return t('constants.strength');
    }

    const sportConfig = SPORTS_CONFIG[sport];
    if (sportConfig) {
      return t(sportConfig.label);
    }

    return t('constants.other');
  };

  const sportFilterOptions = useMemo(
    () => [
      { id: 'all' as const, label: t('training.all') },
      { id: 'running' as const, label: t('constants.running') },
      { id: 'cycling' as const, label: t('constants.cycling') },
      { id: 'swimming' as const, label: t('constants.swimming') },
      { id: 'hiking' as const, label: t('constants.hiking') },
      { id: 'trail' as const, label: t('constants.trail') },
      { id: 'football' as const, label: t('constants.football') },
      { id: 'basketball' as const, label: t('constants.basketball') },
      { id: 'tennis' as const, label: t('constants.tennis') },
      { id: 'padel' as const, label: t('constants.padel') },
      { id: 'skiing' as const, label: t('constants.skiing') },
      { id: 'snowboard' as const, label: t('constants.snowboard') },
      { id: 'golf' as const, label: t('constants.golf') },
      { id: 'hyrox' as const, label: t('constants.hyrox') },
      { id: 'gym' as const, label: t('constants.strength') },
      { id: 'other' as const, label: t('constants.other') },
    ],
    [t],
  );

  const sessionsForHistory = useMemo(() => {
    if (!sessions) {
      return [];
    }

    if (historySportFilter === 'all') {
      return sessions;
    }

    if (historySportFilter === 'gym') {
      return sessions.filter(session => session.sport_type === 'gym' || session.sport_type === 'strength');
    }

    return sessions.filter(session => session.sport_type === historySportFilter);
  }, [historySportFilter, sessions]);

  const applyFilter = (preset: FilterPreset) => {
    setDateFilter({ preset });
    setShowFilterModal(false);
  };

  const applySportFilter = (sport: HistorySportFilter) => {
    setHistorySportFilter(sport);
    setHistorySportLabel(sport === 'all' ? '' : getSportFilterLabel(sport));
    setShowFilterModal(false);
  };

  const clearHistoryFilters = () => {
    applyFilter('all');
    setHistorySportFilter('all');
    setHistorySportLabel('');
  };

  const applyCustomFilter = () => {
    const normalizedRange = normalizeCustomRange(customStartDate, customEndDate);
    setCustomStartDate(normalizedRange.start);
    setCustomEndDate(normalizedRange.end);
    setDateFilter({ preset: 'custom' });
    setShowFilterModal(false);
  };

  const getFilterLabel = (): string => {
    switch (dateFilter.preset) {
      case 'week':
        return t('training.lastWeek');
      case 'month':
        return t('training.lastMonth');
      case 'three_months':
        return t('training.last3Months');
      case 'custom':
        return `${format(customStartDate, 'd MMM', { locale: getDateFnsLocale() })} - ${format(customEndDate, 'd MMM', {
          locale: getDateFnsLocale(),
        })}`;
      case 'all':
      default:
        return t('training.all');
    }
  };

  const handleDelete = (id: string) => {
    Alert.alert(t('training.deleteActivityTitle'), t('training.deleteActivityMessage'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: () => deleteSession.mutate(id),
      },
    ]);
  };

  const handlePressSession = (session: ActivitySession) => {
    if (!session.end_time && session.sport_type === 'strength') {
      // Resume active gym workout
      navigation.navigate('ActiveWorkout', { sessionId: session.id });
    } else {
      // View details (works for finished gym too if we have a detail screen, or fallback)
      // Currently assuming EnduranceSessionDetail can show generic session info
      navigation.navigate('EnduranceSessionDetail', { session });
    }
  };

  const handleChangeView = (view: ActivityView) => {
    setActiveView(view);

    if (view === 'calendar') {
      setIsCalendarDrilldownActive(false);
      setShowFilterModal(false);
      setShowStartDatePicker(false);
      setShowEndDatePicker(false);
    }
  };

  const handleOpenSportHistoryFromCalendar = (payload: {
    sportType: HistorySportFilter;
    sportLabel: string;
    rangeStart: string;
    rangeEnd: string;
  }) => {
    setCustomStartDate(startOfDay(new Date(payload.rangeStart)));
    setCustomEndDate(startOfDay(new Date(payload.rangeEnd)));
    setDateFilter({ preset: 'custom' });
    setHistorySportFilter(payload.sportType);
    setHistorySportLabel(payload.sportLabel);
    setIsCalendarDrilldownActive(true);
    setActiveView('history');
  };

  const handleBackPress = () => {
    if (isHistoryView && isCalendarDrilldownActive) {
      handleChangeView('calendar');
      return;
    }

    navigation.goBack();
  };

  const hasAnyHistoryFilter = dateFilter.preset !== 'all' || historySportFilter !== 'all';
  const historyFilterLabel = [dateFilter.preset !== 'all' ? getFilterLabel() : '', historySportLabel]
    .filter(Boolean)
    .join(' • ');

  const historySummaryTotals = useMemo<HistorySummaryTotals>(() => {
    return sessionsForHistory.reduce(
      (acc, session) => ({
        totalDurationSeconds: acc.totalDurationSeconds + getSessionDurationSeconds(session),
        totalDistanceMeters: acc.totalDistanceMeters + (session.distance_m ?? 0),
        totalCalories: acc.totalCalories + (session.calories_kcal ?? 0),
        totalActivities: acc.totalActivities + 1,
        totalSets: acc.totalSets + (session.total_sets ?? 0),
        totalVolumeKg: acc.totalVolumeKg + (session.total_volume_kg ?? 0),
        totalElevationGainMeters: acc.totalElevationGainMeters + (session.elev_gain_m ?? 0),
      }),
      {
        totalDurationSeconds: 0,
        totalDistanceMeters: 0,
        totalCalories: 0,
        totalActivities: 0,
        totalSets: 0,
        totalVolumeKg: 0,
        totalElevationGainMeters: 0,
      },
    );
  }, [sessionsForHistory]);

  const historyMiddleMetric = useMemo(() => {
    const distance = convertDistanceToUi(historySummaryTotals.totalDistanceMeters, 1);
    const volume = convertWeightToUi(historySummaryTotals.totalVolumeKg);

    if ((historySportFilter === 'gym' || historySportFilter === 'strength') && historySummaryTotals.totalSets > 0) {
      return {
        value: historySummaryTotals.totalSets.toLocaleString(),
        label: t('training.setsAllCaps'),
      };
    }

    if ((historySportFilter === 'gym' || historySportFilter === 'strength') && historySummaryTotals.totalVolumeKg > 0) {
      return {
        value: Math.round(Number(volume.value)).toLocaleString(),
        label: `${t('training.volume')} ${volume.unit}`,
      };
    }

    if (historySummaryTotals.totalDistanceMeters > 0) {
      return {
        value: Number(distance.value).toLocaleString(undefined, { maximumFractionDigits: 1 }),
        label: t('training.calendarDistanceWithUnit', { unit: distance.unit }),
      };
    }

    if (historySummaryTotals.totalVolumeKg > 0) {
      return {
        value: Math.round(Number(volume.value)).toLocaleString(),
        label: `${t('training.volume')} ${volume.unit}`,
      };
    }

    if (historySummaryTotals.totalSets > 0) {
      return {
        value: historySummaryTotals.totalSets.toLocaleString(),
        label: t('training.setsAllCaps'),
      };
    }

    if (historySummaryTotals.totalElevationGainMeters > 0) {
      return {
        value: Math.round(historySummaryTotals.totalElevationGainMeters).toLocaleString(),
        label: t('training.elevationM'),
      };
    }

    return {
      value: '0',
      label: t('training.setsAllCaps'),
    };
  }, [convertDistanceToUi, convertWeightToUi, historySportFilter, historySummaryTotals, t]);

  return (
    <LinearGradient colors={dynamicStyles.gradientColors} style={{ flex: 1 }}>
      <SafeAreaView style={[styles.container, dynamicStyles.container]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={handleBackPress} style={styles.backButton}>
            <Text style={[styles.backText, { color: themeColors.primary }]}>{t('common.back')}</Text>
          </TouchableOpacity>
          <Text style={[styles.title, dynamicStyles.headerTitle]}>{t('training.activityHistory')}</Text>
          {isHistoryView ? (
            <TouchableOpacity onPress={() => setShowFilterModal(true)} style={styles.filterButton}>
              <Filter size={24} color={themeColors.primary} />
              {hasAnyHistoryFilter && (
                <View style={[styles.filterActiveDot, { backgroundColor: themeColors.primary }]} />
              )}
            </TouchableOpacity>
          ) : (
            <View style={styles.filterButtonPlaceholder} />
          )}
        </View>

        <View
          style={[
            styles.activityTabsContainer,
            {
              backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)',
            },
          ]}
        >
          <TouchableOpacity
            style={[
              styles.activityTabButton,
              activeView === 'calendar' && {
                backgroundColor: isDark ? 'rgba(0,122,255,0.25)' : 'rgba(0,122,255,0.12)',
              },
            ]}
            onPress={() => handleChangeView('calendar')}
          >
            <Text
              style={[
                styles.activityTabText,
                { color: activeView === 'calendar' ? themeColors.primary : themeColors.textSecondary },
              ]}
            >
              {t('training.calendarTab')}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.activityTabButton,
              activeView === 'history' && {
                backgroundColor: isDark ? 'rgba(0,122,255,0.25)' : 'rgba(0,122,255,0.12)',
              },
            ]}
            onPress={() => handleChangeView('history')}
          >
            <Text
              style={[
                styles.activityTabText,
                { color: activeView === 'history' ? themeColors.primary : themeColors.textSecondary },
              ]}
            >
              {t('training.historyTab')}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Filter Indicator Banner */}
        {isHistoryView && hasAnyHistoryFilter && (
          <View
            style={[
              styles.filterBanner,
              {
                backgroundColor: isDark ? 'rgba(0, 122, 255, 0.15)' : 'rgba(0, 122, 255, 0.08)',
                borderWidth: 1,
                borderColor: isDark ? 'rgba(0, 122, 255, 0.3)' : 'rgba(0, 122, 255, 0.2)',
              },
            ]}
          >
            <View style={styles.filterBannerContent}>
              <Filter size={16} color={themeColors.primary} strokeWidth={2.5} />
              <Text style={[styles.filterBannerText, { color: themeColors.primary }]}>
                {historyFilterLabel || getFilterLabel()}
              </Text>
            </View>
            <TouchableOpacity
              onPress={clearHistoryFilters}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              style={styles.filterCloseButton}
            >
              <X size={18} color={themeColors.primary} strokeWidth={2.5} />
            </TouchableOpacity>
          </View>
        )}

        {isHistoryView ? (
          <>
            {/* Filter Modal */}
            <Modal
              visible={showFilterModal}
              transparent
              animationType="slide"
              onRequestClose={() => setShowFilterModal(false)}
            >
              <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowFilterModal(false)}>
                <TouchableOpacity activeOpacity={1} onPress={e => e.stopPropagation()}>
                  <GlassCard style={[styles.filterModal, dynamicStyles.modalContent]}>
                    <View style={styles.modalHeader}>
                      <Text style={[styles.modalTitle, dynamicStyles.title]}>{t('training.filterByDate')}</Text>
                      <TouchableOpacity onPress={() => setShowFilterModal(false)}>
                        <X size={24} color={themeColors.textPrimary} />
                      </TouchableOpacity>
                    </View>

                    <ScrollView
                      style={styles.filterOptionsScroll}
                      contentContainerStyle={styles.filterOptions}
                      showsVerticalScrollIndicator={false}
                    >
                      <FilterOption
                        label={t('training.all')}
                        isActive={dateFilter.preset === 'all'}
                        onPress={() => applyFilter('all')}
                        isDark={isDark}
                        themeColors={themeColors}
                      />
                      <FilterOption
                        label={t('training.lastWeek')}
                        isActive={dateFilter.preset === 'week'}
                        onPress={() => applyFilter('week')}
                        isDark={isDark}
                        themeColors={themeColors}
                      />
                      <FilterOption
                        label={t('training.lastMonth')}
                        isActive={dateFilter.preset === 'month'}
                        onPress={() => applyFilter('month')}
                        isDark={isDark}
                        themeColors={themeColors}
                      />
                      <FilterOption
                        label={t('training.last3Months')}
                        isActive={dateFilter.preset === 'three_months'}
                        onPress={() => applyFilter('three_months')}
                        isDark={isDark}
                        themeColors={themeColors}
                      />

                      <View style={styles.divider} />

                      <Text style={styles.customLabel}>{t('training.filterBySport')}</Text>
                      <View style={styles.sportFilterGrid}>
                        {sportFilterOptions.map(option => (
                          <FilterOption
                            key={option.id}
                            label={option.label}
                            isActive={historySportFilter === option.id}
                            onPress={() => applySportFilter(option.id)}
                            isDark={isDark}
                            themeColors={themeColors}
                          />
                        ))}
                      </View>

                      <View style={styles.divider} />

                      <Text style={styles.customLabel}>{t('training.customRange')}</Text>
                      <View style={styles.customDateRow}>
                        <TouchableOpacity
                          style={[
                            styles.datePickerButton,
                            dynamicStyles.secondaryButton,
                            showStartDatePicker &&
                              Platform.OS === 'ios' && {
                                borderColor: themeColors.primary,
                                backgroundColor: isDark ? 'rgba(255,255,255,0.15)' : '#fff',
                              },
                          ]}
                          onPress={() => {
                            if (Platform.OS === 'ios') {
                              setShowStartDatePicker(!showStartDatePicker);
                              setShowEndDatePicker(false);
                            } else {
                              setShowStartDatePicker(true);
                            }
                          }}
                        >
                          <Calendar
                            size={16}
                            color={
                              showStartDatePicker && Platform.OS === 'ios'
                                ? themeColors.primary
                                : themeColors.textSecondary
                            }
                          />
                          <Text
                            style={[
                              styles.datePickerText,
                              {
                                color:
                                  showStartDatePicker && Platform.OS === 'ios'
                                    ? themeColors.primary
                                    : themeColors.textPrimary,
                              },
                            ]}
                          >
                            {format(customStartDate, 'd MMM yyyy', { locale: getDateFnsLocale() })}
                          </Text>
                        </TouchableOpacity>
                        <Text style={[styles.dateRangeSeparator, { color: themeColors.textSecondary }]}>-</Text>
                        <TouchableOpacity
                          style={[
                            styles.datePickerButton,
                            dynamicStyles.secondaryButton,
                            showEndDatePicker &&
                              Platform.OS === 'ios' && {
                                borderColor: themeColors.primary,
                                backgroundColor: isDark ? 'rgba(255,255,255,0.15)' : '#fff',
                              },
                          ]}
                          onPress={() => {
                            if (Platform.OS === 'ios') {
                              setShowEndDatePicker(!showEndDatePicker);
                              setShowStartDatePicker(false);
                            } else {
                              setShowEndDatePicker(true);
                            }
                          }}
                        >
                          <Calendar
                            size={16}
                            color={
                              showEndDatePicker && Platform.OS === 'ios'
                                ? themeColors.primary
                                : themeColors.textSecondary
                            }
                          />
                          <Text
                            style={[
                              styles.datePickerText,
                              {
                                color:
                                  showEndDatePicker && Platform.OS === 'ios'
                                    ? themeColors.primary
                                    : themeColors.textPrimary,
                              },
                            ]}
                          >
                            {format(customEndDate, 'd MMM yyyy', { locale: getDateFnsLocale() })}
                          </Text>
                        </TouchableOpacity>
                      </View>

                      {/* iOS Inline Picker */}
                      {Platform.OS === 'ios' && showStartDatePicker && (
                        <View
                          style={[
                            styles.inlinePickerContainer,
                            { backgroundColor: isDark ? themeColors.surfaceSolid : '#fff' },
                          ]}
                        >
                          <DateTimePicker
                            value={customStartDate}
                            mode="date"
                            display="inline"
                            maximumDate={new Date()}
                            onChange={(event, selectedDate) => {
                              if (selectedDate) {
                                updateCustomStartDate(selectedDate);
                              }
                            }}
                            themeVariant={isDark ? 'dark' : 'light'}
                          />
                        </View>
                      )}
                      {Platform.OS === 'ios' && showEndDatePicker && (
                        <View
                          style={[
                            styles.inlinePickerContainer,
                            { backgroundColor: isDark ? themeColors.surfaceSolid : '#fff' },
                          ]}
                        >
                          <DateTimePicker
                            value={customEndDate}
                            mode="date"
                            display="inline"
                            minimumDate={customStartDate}
                            maximumDate={new Date()}
                            onChange={(event, selectedDate) => {
                              if (selectedDate) {
                                updateCustomEndDate(selectedDate);
                              }
                            }}
                            themeVariant={isDark ? 'dark' : 'light'}
                          />
                        </View>
                      )}

                      <TouchableOpacity
                        style={[styles.applyCustomBtn, dynamicStyles.primaryButton]}
                        onPress={applyCustomFilter}
                      >
                        <Text style={styles.applyCustomBtnText}>{t('training.apply')}</Text>
                      </TouchableOpacity>
                    </ScrollView>
                  </GlassCard>
                </TouchableOpacity>
              </TouchableOpacity>
            </Modal>

            {/* Android Date Pickers (Popup) */}
            {Platform.OS === 'android' && showStartDatePicker && (
              <DateTimePicker
                value={customStartDate}
                mode="date"
                display="default"
                maximumDate={new Date()}
                onChange={(event, selectedDate) => {
                  setShowStartDatePicker(false);
                  if (event.type === 'set' && selectedDate) {
                    updateCustomStartDate(selectedDate);
                  }
                }}
              />
            )}
            {Platform.OS === 'android' && showEndDatePicker && (
              <DateTimePicker
                value={customEndDate}
                mode="date"
                display="default"
                minimumDate={customStartDate}
                maximumDate={new Date()}
                onChange={(event, selectedDate) => {
                  setShowEndDatePicker(false);
                  if (event.type === 'set' && selectedDate) {
                    updateCustomEndDate(selectedDate);
                  }
                }}
              />
            )}

            <ScrollView
              contentContainerStyle={styles.content}
              refreshControl={<RefreshControl refreshing={isLoading} tintColor={themeColors.primary} />}
            >
              {sessionsForHistory.length > 0 && (
                <View
                  style={[
                    styles.historySummaryCard,
                    {
                      borderColor: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.06)',
                      backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.8)',
                    },
                  ]}
                >
                  <View style={styles.historySummaryHeader}>
                    <Text style={[styles.historySummaryTitle, dynamicStyles.title]}>
                      {historySportFilter === 'all'
                        ? t('training.activitiesSummary')
                        : `${historySportLabel || getSportFilterLabel(historySportFilter)}`}
                    </Text>
                    <Text style={[styles.historySummarySubtitle, dynamicStyles.subtitle]}>{getFilterLabel()}</Text>
                  </View>

                  <View style={styles.historySummaryMetrics}>
                    <View style={styles.historySummaryMetricItem}>
                      <Text style={[styles.historySummaryMetricValue, dynamicStyles.title]}>
                        {formatHoursAndMinutes(historySummaryTotals.totalDurationSeconds)}
                      </Text>
                      <Text style={[styles.historySummaryMetricLabel, dynamicStyles.sublabel]}>
                        {t('training.calendarDurationH')}
                      </Text>
                    </View>
                    <View style={styles.historySummaryMetricItem}>
                      <Text style={[styles.historySummaryMetricValue, dynamicStyles.title]}>
                        {historyMiddleMetric.value}
                      </Text>
                      <Text style={[styles.historySummaryMetricLabel, dynamicStyles.sublabel]}>
                        {historyMiddleMetric.label}
                      </Text>
                    </View>
                    <View style={styles.historySummaryMetricItem}>
                      <Text style={[styles.historySummaryMetricValue, dynamicStyles.title]}>
                        {historySummaryTotals.totalActivities.toLocaleString()}
                      </Text>
                      <Text style={[styles.historySummaryMetricLabel, dynamicStyles.sublabel]}>
                        {t('training.activities')}
                      </Text>
                    </View>
                    <View style={styles.historySummaryMetricItem}>
                      <Text style={[styles.historySummaryMetricValue, dynamicStyles.title]}>
                        {Math.round(historySummaryTotals.totalCalories).toLocaleString()}
                      </Text>
                      <Text style={[styles.historySummaryMetricLabel, dynamicStyles.sublabel]}>
                        {t('training.calendarCaloriesKcal')}
                      </Text>
                    </View>
                  </View>
                </View>
              )}

              {sessionsForHistory.length === 0 && !isLoading && (
                <View style={styles.emptyState}>
                  <Activity size={48} color={themeColors.textSecondary} style={{ opacity: 0.5 }} />
                  <Text style={[styles.emptyTitle, dynamicStyles.title]}>{t('training.noActivities')}</Text>
                  <Text style={[styles.emptyText, dynamicStyles.subtitle]}>{t('training.registerFirstActivity')}</Text>
                </View>
              )}

              {/* List of Sessions */}
              {sessionsForHistory.map(session => {
                const isGym = session.sport_type === 'strength';
                const config = SPORTS_CONFIG[session.sport_type] || SPORTS_CONFIG.other;
                const Icon = isGym ? Dumbbell : config.icon;
                const isActive = !session.end_time;
                const sportColor = isGym
                  ? themeColors.primary
                  : SPORT_COLORS[session.sport_type] || themeColors.textSecondary;
                const hasRoute = hasSessionRoute(session);

                // Distance
                const distObj = convertDistanceToUi(session.distance_m, 2);
                const distanceDisplay = distObj.value;
                const distanceUnit = distObj.unit;

                // Pace
                let paceLabel = '-';
                if (!isGym) {
                  let speedMps = 0;
                  if (session.avg_speed_m_per_s) {
                    speedMps = session.avg_speed_m_per_s;
                  } else if (session.distance_m && session.duration_s && session.duration_s > 0) {
                    speedMps = session.distance_m / session.duration_s;
                  }

                  if (speedMps > 0) {
                    const { label } = convertSpeedToUi(speedMps, session.sport_type);
                    paceLabel = label;
                  }
                }

                // Build metrics array dynamically
                const metrics: Array<{ value: string; label: string; unit?: string }> = [];

                if (isActive || (session.duration_s != null && session.duration_s > 0)) {
                  metrics.push({
                    value: session.duration_s ? formatDuration(session.duration_s) : '--:--',
                    label: t('training.timeAllCaps'),
                  });
                }

                if (!isGym && session.distance_m != null && session.distance_m > 0) {
                  metrics.push({
                    value: String(distanceDisplay),
                    label: t('training.distanceParenAllCaps'),
                    unit: distanceUnit,
                  });
                }

                if (!isGym && paceLabel !== '-') {
                  metrics.push({
                    value: paceLabel,
                    label: t('training.paceAllCaps'),
                  });
                }

                if (isGym) {
                  if (session.total_sets != null && session.total_sets > 0) {
                    metrics.push({
                      value: String(session.total_sets),
                      label: t('training.setsAllCaps'),
                    });
                  }
                  if (typeof session.calories_kcal === 'number' && session.calories_kcal > 0) {
                    metrics.push({
                      value: String(Math.round(session.calories_kcal)),
                      label: t('training.caloriesKcal'),
                    });
                  }
                }

                return (
                  <TouchableOpacity
                    key={session.id}
                    activeOpacity={0.82}
                    onPress={() => handlePressSession(session)}
                    style={[
                      styles.card,
                      {
                        borderColor: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.06)',
                        backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#FFFFFF',
                      },
                    ]}
                  >
                    {/* Left accent bar */}
                    <View style={[styles.cardAccentBar, { backgroundColor: sportColor }]} />

                    <View style={styles.cardInner}>
                      {/* Header */}
                      <View style={styles.cardHeader}>
                        <View style={styles.headerLeft}>
                          <View style={[styles.iconBadge, { backgroundColor: sportColor }]}>
                            <Icon size={16} color="#FFF" sport={session.sport_type} />
                          </View>
                          <View style={styles.headerInfo}>
                            <Text style={[styles.sessionTitle, { color: themeColors.textPrimary }]} numberOfLines={1}>
                              {session.name || (isGym ? t('training.strengthWorkout') : t(config.defaultTitle))}
                            </Text>
                            <View style={styles.sessionSubRow}>
                              {isActive && (
                                <View
                                  style={[
                                    styles.activeBadge,
                                    {
                                      backgroundColor: isDark ? 'rgba(52, 199, 89, 0.2)' : 'rgba(52, 199, 89, 0.15)',
                                    },
                                  ]}
                                >
                                  <View style={[styles.activeDot, { backgroundColor: themeColors.success }]} />
                                  <Text style={[styles.activeBadgeText, { color: themeColors.success }]}>
                                    {t('training.inProgress')}
                                  </Text>
                                </View>
                              )}
                              <Text style={[styles.dateText, { color: themeColors.textSecondary }]}>
                                {session.start_time
                                  ? format(new Date(session.start_time), 'd MMM HH:mm', {
                                      locale: getDateFnsLocale(),
                                    })
                                  : ''}
                              </Text>
                              {session.sport_subtype && (
                                <View
                                  style={[
                                    styles.subtypeBadge,
                                    { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.04)' },
                                  ]}
                                >
                                  <Text style={[styles.subtypeBadgeText, { color: themeColors.textSecondary }]}>
                                    {getOptionLabel(session.sport_type, session.sport_subtype, 'modality')}
                                  </Text>
                                </View>
                              )}
                              {session.base_load && (
                                <View
                                  style={[
                                    styles.subtypeBadge,
                                    { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.04)' },
                                  ]}
                                >
                                  <Text style={[styles.subtypeBadgeText, { color: themeColors.textSecondary }]}>
                                    {getOptionLabel(session.sport_type, session.base_load, 'base_load')}
                                  </Text>
                                </View>
                              )}
                              {session.contact_level && (
                                <View
                                  style={[
                                    styles.subtypeBadge,
                                    {
                                      backgroundColor: isDark ? 'rgba(214,75,127,0.16)' : 'rgba(214,75,127,0.1)',
                                    },
                                  ]}
                                >
                                  <Text style={[styles.subtypeBadgeText, { color: SPORT_COLORS.martial_arts }]}>
                                    {getOptionLabel(session.sport_type, session.contact_level, 'contact_level')}
                                  </Text>
                                </View>
                              )}
                              {'golf_club_focus' in session && typeof session.golf_club_focus === 'string' && (
                                <View
                                  style={[
                                    styles.subtypeBadge,
                                    { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.04)' },
                                  ]}
                                >
                                  <Text style={[styles.subtypeBadgeText, { color: themeColors.textSecondary }]}>
                                    {getOptionLabel(session.sport_type, session.golf_club_focus, 'golf_club_focus')}
                                  </Text>
                                </View>
                              )}
                              {'hyrox_station_focus' in session && typeof session.hyrox_station_focus === 'string' && (
                                <View
                                  style={[
                                    styles.subtypeBadge,
                                    { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.04)' },
                                  ]}
                                >
                                  <Text style={[styles.subtypeBadgeText, { color: themeColors.textSecondary }]}>
                                    {getOptionLabel(
                                      session.sport_type,
                                      session.hyrox_station_focus,
                                      'hyrox_station_focus',
                                    )}
                                  </Text>
                                </View>
                              )}
                              {hasRoute && (
                                <View
                                  style={[
                                    styles.routeBadge,
                                    { backgroundColor: isDark ? `${sportColor}25` : `${sportColor}15` },
                                  ]}
                                >
                                  <Route size={10} color={sportColor} strokeWidth={2.5} />
                                </View>
                              )}
                            </View>
                          </View>
                        </View>

                        <TouchableOpacity
                          style={styles.deleteBtn}
                          onPress={event => {
                            event.stopPropagation();
                            handleDelete(session.id);
                          }}
                          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                        >
                          <Trash2 size={16} color={themeColors.textSecondary} />
                        </TouchableOpacity>
                      </View>

                      {/* Map preview */}
                      {hasRoute && (
                        <View style={styles.mapPreviewContainer}>
                          <RouteMap
                            polyline={session.route_polyline}
                            height={100}
                            strokeColor={sportColor}
                            isDark={isDark}
                            isInteractive={false}
                            style={styles.mapPreview}
                          />
                        </View>
                      )}

                      {/* Metrics row */}
                      {metrics.length > 0 && (
                        <View style={styles.metricsRow}>
                          {metrics.map((metric, index) => (
                            <React.Fragment key={metric.label}>
                              {index > 0 && (
                                <View
                                  style={[
                                    styles.metricDivider,
                                    {
                                      backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
                                    },
                                  ]}
                                />
                              )}
                              <View style={styles.metricItem}>
                                <Text style={[styles.metricValue, { color: themeColors.textPrimary }]}>
                                  {metric.value}
                                  {metric.unit ? (
                                    <Text style={[styles.metricUnit, { color: themeColors.textSecondary }]}>
                                      {' '}
                                      {metric.unit}
                                    </Text>
                                  ) : null}
                                </Text>
                                <Text style={[styles.metricLabel, { color: themeColors.textSecondary }]}>
                                  {metric.label}
                                </Text>
                              </View>
                            </React.Fragment>
                          ))}
                        </View>
                      )}
                    </View>
                  </TouchableOpacity>
                );
              })}

              {hasMore && sessionsForHistory.length > 0 && (
                <TouchableOpacity
                  style={[
                    styles.loadMoreButton,
                    {
                      borderColor: isDark ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.08)',
                      backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.75)',
                    },
                  ]}
                  onPress={() => setHistoryVisibleLimit(previous => previous + HISTORY_PAGE_SIZE)}
                  disabled={isFetching}
                >
                  {isFetching ? (
                    <ActivityIndicator size="small" color={themeColors.primary} />
                  ) : (
                    <Text style={[styles.loadMoreButtonText, { color: themeColors.primary }]}>
                      {t('common.loadMore')}
                    </Text>
                  )}
                </TouchableOpacity>
              )}
            </ScrollView>
          </>
        ) : (
          <ActivityCalendarView
            isDark={isDark}
            themeColors={themeColors}
            onOpenSession={handlePressSession}
            initialViewState={calendarViewState}
            onViewStateChange={setCalendarViewState}
            onOpenSportHistory={handleOpenSportHistoryFromCalendar}
          />
        )}
      </SafeAreaView>
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
  addButton: {
    padding: spacing.s,
    backgroundColor: colors.surfaceHighlight,
    borderRadius: borderRadius.full,
  },
  content: {
    padding: spacing.m,
    paddingBottom: 100,
  },
  emptyState: {
    alignItems: 'center',
    marginTop: 60,
    gap: spacing.m,
  },
  emptyTitle: {
    ...typography.h3,
    color: colors.textPrimary,
  },
  emptyText: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    paddingHorizontal: spacing.l,
  },
  loadMoreButton: {
    marginTop: spacing.s,
    marginBottom: spacing.l,
    borderWidth: 1,
    borderRadius: borderRadius.m,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadMoreButtonText: {
    ...typography.body,
    fontWeight: '600',
  },
  card: {
    marginBottom: spacing.m,
    borderRadius: borderRadius.l,
    overflow: 'hidden',
    flexDirection: 'row',
    borderWidth: 1,
  },
  cardAccentBar: {
    width: 4,
  },
  cardInner: {
    flex: 1,
    padding: spacing.m,
    gap: spacing.s,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s + 2,
    flex: 1,
  },
  headerInfo: {
    flex: 1,
  },
  iconBadge: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sessionTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  sessionSubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
    flexWrap: 'wrap',
  },
  dateText: {
    fontSize: 12,
    fontWeight: '500',
  },
  activeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  activeDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  activeBadgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  subtypeBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  subtypeBadgeText: {
    fontSize: 10,
    fontWeight: '600',
  },
  routeBadge: {
    width: 20,
    height: 20,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mapPreviewContainer: {
    borderRadius: borderRadius.m,
    overflow: 'hidden',
  },
  mapPreview: {
    borderRadius: borderRadius.m,
  },
  metricsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  metricItem: {
    flex: 1,
    alignItems: 'center',
  },
  metricDivider: {
    width: 1,
    height: 28,
    borderRadius: 0.5,
  },
  metricValue: {
    fontSize: 15,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    textAlign: 'center',
  },
  metricUnit: {
    fontSize: 11,
    fontWeight: '500',
  },
  metricLabel: {
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    marginTop: 2,
    textAlign: 'center',
  },
  deleteBtn: {
    padding: spacing.xs,
    opacity: 0.5,
  },
  // Filter Button
  filterButton: {
    padding: spacing.s,
    position: 'relative',
  },
  filterButtonPlaceholder: {
    width: 40,
    height: 40,
  },
  filterActiveDot: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.primary,
  },
  // Filter Banner
  filterBanner: {
    marginHorizontal: spacing.m,
    marginBottom: spacing.m,
    paddingVertical: spacing.s + 2,
    paddingHorizontal: spacing.m,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: borderRadius.full,
  },
  historySummaryCard: {
    marginHorizontal: spacing.m,
    marginBottom: spacing.m,
    borderRadius: borderRadius.l,
    borderWidth: 1,
    padding: spacing.m,
    gap: spacing.s,
  },
  historySummaryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  historySummaryTitle: {
    ...typography.body,
    fontWeight: '700',
    fontSize: 16,
  },
  historySummarySubtitle: {
    ...typography.caption,
    fontWeight: '600',
  },
  historySummaryMetrics: {
    flexDirection: 'row',
    alignItems: 'stretch',
    justifyContent: 'space-between',
    gap: spacing.s,
  },
  historySummaryMetricItem: {
    flex: 1,
    alignItems: 'center',
  },
  historySummaryMetricValue: {
    ...typography.h3,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    textAlign: 'center',
  },
  historySummaryMetricLabel: {
    ...typography.caption,
    textAlign: 'center',
    marginTop: 2,
  },
  filterBannerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s,
  },
  filterBannerText: {
    ...typography.body,
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  filterCloseButton: {
    padding: 4,
    marginRight: -4,
  },
  // Filter Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  filterModal: {
    borderTopLeftRadius: borderRadius.l,
    borderTopRightRadius: borderRadius.l,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    padding: spacing.l,
    paddingBottom: spacing.l + 20,
    minHeight: 400,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.l,
  },
  modalTitle: {
    ...typography.h3,
    color: colors.textPrimary,
  },
  filterOptions: {
    gap: spacing.s,
  },
  filterOptionsScroll: {
    maxHeight: 560,
  },
  sportFilterGrid: {
    gap: spacing.s,
  },
  filterOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.m,
    backgroundColor: colors.surfaceHighlight,
    borderRadius: borderRadius.m,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  filterOptionActive: {
    borderColor: colors.primary,
    backgroundColor: `${colors.primary}15`,
  },
  filterOptionText: {
    ...typography.body,
    color: colors.textPrimary,
    fontWeight: '500',
  },
  filterOptionTextActive: {
    color: colors.primary,
    fontWeight: '700',
  },
  filterOptionCheck: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.primary,
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(0,0,0,0.1)',
    marginVertical: spacing.m,
  },
  customLabel: {
    ...typography.caption,
    color: colors.textSecondary,
    fontWeight: '600',
    textTransform: 'uppercase',
    marginTop: spacing.s,
    marginBottom: spacing.xs,
  },
  customDateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s,
    marginBottom: spacing.m,
  },
  datePickerButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s,
    padding: spacing.m,
    backgroundColor: colors.surfaceHighlight,
    borderRadius: borderRadius.m,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  datePickerButtonActive: {
    borderColor: colors.primary,
    backgroundColor: '#fff',
  },
  datePickerText: {
    ...typography.body,
    color: colors.textPrimary,
    fontWeight: '500',
  },
  datePickerTextActive: {
    color: colors.primary,
    fontWeight: '600',
  },
  dateRangeSeparator: {
    ...typography.body,
    color: colors.textSecondary,
  },
  inlinePickerContainer: {
    marginBottom: spacing.m,
    // Optional: wrap in a card look or just spacing
    backgroundColor: Platform.OS === 'ios' ? '#fff' : 'transparent',
    borderRadius: borderRadius.m,
    overflow: 'hidden',
  },
  applyCustomBtn: {
    backgroundColor: colors.primary,
    padding: spacing.m,
    borderRadius: borderRadius.m,
    alignItems: 'center',
  },
  applyCustomBtnText: {
    ...typography.button,
    color: '#FFFFFF',
    fontWeight: '700',
  },
  activityTabsContainer: {
    flexDirection: 'row',
    marginHorizontal: spacing.m,
    marginBottom: spacing.m,
    borderRadius: borderRadius.full,
    padding: 4,
  },
  activityTabButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.s,
    borderRadius: borderRadius.full,
  },
  activityTabText: {
    ...typography.body,
    fontWeight: '700',
    fontSize: 14,
  },
});
