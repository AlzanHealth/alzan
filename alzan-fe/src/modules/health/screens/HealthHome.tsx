import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Modal,
  ActivityIndicator,
  Platform,
  TextInput,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { HealthScreenNavigationProp, TabParamList } from '../../../types/navigation.types';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Scale, Ruler, Moon, Plus, BarChart2, ChevronRight, Activity, Download } from 'lucide-react-native';
import { colors, typography } from '../../../theme';

import { useHealthInsights } from '../hooks/useHealthInsights';
import { useQueryClient } from '@tanstack/react-query';
import { GlassCard } from '../../../components/GlassCard';
import { LinearGradient } from 'expo-linear-gradient';
import { useUnitConversion } from '../../../hooks/useUnitConversion';
import { useHealthStyles } from '../../../hooks/useHealthStyles';
import { useTranslation } from 'react-i18next';
import { getLocaleTag } from '../../../i18n/dateLocale';
import DateTimePicker from '@react-native-community/datetimepicker';
import { differenceInCalendarDays, format, subDays } from 'date-fns';
import { generateHealthPDF } from '../services/healthPdfExportService';
import type { WebExportWindow } from '../services/healthPdfExportService';
import { useAuth } from '../../../context/AuthContext';
import { Alert } from '../../../components/common/Alert';

const MAX_EXPORT_RANGE_DAYS = 92;

const getDefaultExportRange = () => {
  const end = new Date();
  return {
    start: subDays(end, 7),
    end,
  };
};

const getMinExportStartDate = (endDate: Date) => subDays(endDate, MAX_EXPORT_RANGE_DAYS);

export const HealthHome = () => {
  const { t } = useTranslation();
  const navigation = useNavigation<HealthScreenNavigationProp>();
  const { user } = useAuth();
  const { latestWeight, weightDelta, avgSleepMinutes, bodyComposition, latestSleep } = useHealthInsights();

  const { convertWeightToUi } = useUnitConversion();
  const { styles: dynamicStyles, colors: themeColors, isDark } = useHealthStyles();

  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = React.useState(false);
  const [showExportModal, setShowExportModal] = React.useState(false);
  const [exportStart, setExportStart] = React.useState<Date>(() => getDefaultExportRange().start);
  const [exportEnd, setExportEnd] = React.useState<Date>(() => getDefaultExportRange().end);
  const [exportStartInput, setExportStartInput] = React.useState(() =>
    format(getDefaultExportRange().start, 'yyyy-MM-dd'),
  );
  const [exportEndInput, setExportEndInput] = React.useState(() => format(getDefaultExportRange().end, 'yyyy-MM-dd'));
  const [isExporting, setIsExporting] = React.useState(false);
  const scrollViewRef = React.useRef<ScrollView>(null);

  const onRefresh = React.useCallback(async () => {
    setRefreshing(true);
    await queryClient.invalidateQueries({ queryKey: ['healthInsights'] });
    setRefreshing(false);
  }, [queryClient]);

  React.useEffect(() => {
    const parent = navigation.getParent<BottomTabNavigationProp<TabParamList>>();
    if (parent) {
      const unsubscribe = parent.addListener('tabPress', () => {
        requestAnimationFrame(() => {
          scrollViewRef.current?.scrollTo({ y: 0, animated: true });
        });
      });
      return unsubscribe;
    }
  }, [navigation]);

  React.useEffect(() => {
    if (!showExportModal) return;
    setExportStartInput(format(exportStart, 'yyyy-MM-dd'));
    setExportEndInput(format(exportEnd, 'yyyy-MM-dd'));
  }, [showExportModal, exportStart, exportEnd]);

  const exportMinStartDate = getMinExportStartDate(exportEnd);
  const exportRangeDays = differenceInCalendarDays(exportEnd, exportStart);
  const exportRangeErrorMessage =
    exportRangeDays < 0
      ? t('nutrition.invalidDatesMessage')
      : exportRangeDays > MAX_EXPORT_RANGE_DAYS
        ? t('nutrition.exportRangeMinStartMessage', { date: format(exportMinStartDate, 'yyyy-MM-dd') })
        : null;
  const isExportDisabled = isExporting || !!exportRangeErrorMessage;

  const parseWebDateInput = (value: string): Date | null => {
    const normalized = value.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return null;
    const parsed = new Date(`${normalized}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) return null;
    return format(parsed, 'yyyy-MM-dd') === normalized ? parsed : null;
  };

  const getErrorMessage = (error: unknown): string => {
    if (error instanceof Error && error.message.trim()) return error.message;
    if (typeof error === 'string' && error.trim()) return error;
    return t('health.pdfGenerateRetry');
  };

  const openExportModal = () => {
    const defaultRange = getDefaultExportRange();
    setExportStart(defaultRange.start);
    setExportEnd(defaultRange.end);
    setExportStartInput(format(defaultRange.start, 'yyyy-MM-dd'));
    setExportEndInput(format(defaultRange.end, 'yyyy-MM-dd'));
    setShowExportModal(true);
  };

  const handleExport = async () => {
    if (!user || exportRangeErrorMessage) return;

    const exportStartDate = format(exportStart, 'yyyy-MM-dd');
    const exportEndDate = format(exportEnd, 'yyyy-MM-dd');
    const webPrintWindow: WebExportWindow | null =
      Platform.OS === 'web'
        ? ((
            globalThis as {
              open?: (url?: string, target?: string) => WebExportWindow | null;
            }
          ).open?.('', '_blank') ?? null)
        : null;

    setShowExportModal(false);

    try {
      setIsExporting(true);
      await generateHealthPDF({
        startDate: exportStartDate,
        endDate: exportEndDate,
        user: {
          id: user.id,
          display_name: user.user_metadata?.display_name,
          email: user.email,
        },
        webPrintWindow,
      });
    } catch (error: unknown) {
      const message = getErrorMessage(error);
      const isNoDataError =
        message.includes(t('health.pdfNoRecordsInRange')) ||
        message.includes('No records') ||
        message.includes('No hay registros');
      if (!isNoDataError) {
        console.error('Health export error:', message);
      }
      Alert.alert(t('common.error'), isNoDataError ? t('health.pdfNoRecordsInRange') : message);
    } finally {
      setIsExporting(false);
    }
  };

  const getBmiLabel = (cat: string) => {
    switch (cat) {
      case 'underweight':
        return 'Peso inf.';
      case 'normal':
        return 'Normal';
      case 'overweight':
        return 'Sobrepeso';
      case 'obese':
        return 'Obesidad';
      default:
        return '';
    }
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString(getLocaleTag(), { day: 'numeric', month: 'short' });
  };

  return (
    <LinearGradient colors={dynamicStyles.gradientColors} style={styles.container}>
      <SafeAreaView style={{ flex: 1, paddingBottom: 0 }}>
        {/* Top Bar - EXACT COPY FROM NUTRITION */}
        <View style={styles.topBar}>
          <Text style={[styles.headerTitle, dynamicStyles.headerTitle]}>{t('health.summary')}</Text>
          <View style={styles.topActions}>
            <TouchableOpacity
              onPress={openExportModal}
              style={[styles.headerIconButton, dynamicStyles.iconContainer]}
              accessibilityRole="button"
              accessibilityLabel={t('health.exportHealthHistory')}
            >
              {isExporting ? (
                <ActivityIndicator size="small" color={themeColors.primary} />
              ) : (
                <Download size={20} color={themeColors.primary} />
              )}
            </TouchableOpacity>
            <TouchableOpacity onPress={() => navigation.navigate('HealthStatistics')}>
              <BarChart2 size={24} color={themeColors.textPrimary} />
            </TouchableOpacity>
          </View>
        </View>

        <ScrollView
          ref={scrollViewRef}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
          {/* 1. Main Weight Card (Clickable -> Stats) */}
          <Text style={[styles.sectionTitle, dynamicStyles.sectionTitle]}>{t('settings.weight')}</Text>
          <GlassCard style={[styles.weightCard, dynamicStyles.glassCard]}>
            <TouchableOpacity
              onPress={() => navigation.navigate('HealthStatistics', { defaultRange: '1M' })}
              activeOpacity={0.7}
            >
              <View style={styles.weightHeader}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Scale size={20} color={themeColors.primary} style={{ marginRight: 8 }} />
                  <Text style={[styles.cardTitle, dynamicStyles.title]}>{t('health.currentWeight')}</Text>
                </View>

                {/* Add Button explicitly requested */}
                <TouchableOpacity
                  onPress={e => {
                    e.stopPropagation(); // Prevent navigating to stats
                    navigation.navigate('WeightAdd');
                  }}
                  style={[styles.addWeightButton, dynamicStyles.iconContainer]}
                >
                  <Plus size={20} color={themeColors.primary} />
                </TouchableOpacity>
              </View>

              <Text style={[styles.cardDate, dynamicStyles.subtitle]}>{formatDate(latestWeight?.measured_at)}</Text>

              <View style={styles.weightContent}>
                <Text style={[styles.bigValue, dynamicStyles.title]}>
                  {latestWeight?.weight_kg ? convertWeightToUi(latestWeight.weight_kg).value : '--'}
                </Text>
                <Text style={[styles.unit, dynamicStyles.subtitle]}>
                  {latestWeight?.weight_kg ? convertWeightToUi(latestWeight.weight_kg).unit : t('health.unitKg')}
                </Text>

                {latestWeight && weightDelta && weightDelta.change !== 0 && (
                  <View style={styles.deltaInline}>
                    <Text style={[styles.deltaValue, { color: weightDelta.change <= 0 ? '#10B981' : '#EF4444' }]}>
                      {weightDelta.change > 0 ? '+' : '-'}
                      {convertWeightToUi(Math.abs(weightDelta.change)).value}
                    </Text>
                  </View>
                )}
              </View>

              {weightDelta && (
                <Text style={[styles.comparisonText, dynamicStyles.subtitle]}>
                  {t('health.vs')}
                  {formatDate(weightDelta.previousDate)}
                </Text>
              )}
            </TouchableOpacity>
          </GlassCard>

          {/* 2. Body Composition List (BMI & Fat) -> Leading to Details with RangeBar */}
          <Text style={[styles.sectionTitle, dynamicStyles.sectionTitle]}>{t('health.bodyComposition')}</Text>

          {/* BMI Item */}
          <GlassCard style={[styles.listItemCard, dynamicStyles.glassCard]}>
            <TouchableOpacity
              onPress={() => navigation.navigate('BodyCompositionDetail')}
              activeOpacity={0.7}
              style={styles.listItemRow}
            >
              <View style={styles.listItemLeft}>
                <View style={[styles.iconBox, { backgroundColor: '#3B82F6' }]}>
                  <Text style={styles.iconBoxText}>{t('health.imc')}</Text>
                </View>
                <View>
                  <Text style={[styles.listItemTitle, dynamicStyles.title]}>{t('health.imc')}</Text>
                  <Text style={[styles.listItemSubtitle, dynamicStyles.subtitle]}>
                    {bodyComposition.bmi ? getBmiLabel(bodyComposition.bmi.category) : t('health.noData')}
                  </Text>
                </View>
              </View>
              <View style={styles.listItemRight}>
                <Text style={[styles.listItemValue, dynamicStyles.title]}>{bodyComposition.bmi?.value || '--'}</Text>
                <ChevronRight size={20} color={themeColors.textSecondary} />
              </View>
            </TouchableOpacity>
          </GlassCard>

          {/* Body Fat Item */}
          <GlassCard style={[styles.listItemCard, dynamicStyles.glassCard]}>
            <TouchableOpacity
              onPress={() => navigation.navigate('BodyCompositionDetail')}
              activeOpacity={0.7}
              style={styles.listItemRow}
            >
              <View style={styles.listItemLeft}>
                <Activity size={24} color={themeColors.secondary} style={{ marginRight: 12 }} />
                <View>
                  <Text style={[styles.listItemTitle, dynamicStyles.title]}>{t('health.bodyFat')}</Text>
                  <Text style={[styles.listItemSubtitle, dynamicStyles.subtitle]}>
                    {bodyComposition.bodyFat?.categoryLabel || '--'}
                  </Text>
                </View>
              </View>
              <View style={styles.listItemRight}>
                <Text style={[styles.listItemValue, dynamicStyles.title]}>
                  {bodyComposition.bodyFat?.percentage ? `${bodyComposition.bodyFat.percentage}%` : '--'}
                </Text>
                <ChevronRight size={20} color={themeColors.textSecondary} />
              </View>
            </TouchableOpacity>
          </GlassCard>

          {/* 3. Measurements */}
          <Text style={[styles.sectionTitle, dynamicStyles.sectionTitle]}>{t('health.measurements')}</Text>
          <GlassCard style={[styles.listItemCard, dynamicStyles.glassCard]}>
            {/* Just a summary link to measurements */}
            <TouchableOpacity
              onPress={() => navigation.navigate('MeasurementAdd')} // Or MeasurementList
              style={styles.listItemRow}
            >
              <View style={styles.listItemLeft}>
                <Ruler size={24} color={themeColors.accent} style={{ marginRight: 12 }} />
                <Text style={[styles.listItemTitle, dynamicStyles.title]}>{t('health.registerMeasurements')}</Text>
              </View>
              <ChevronRight size={20} color={themeColors.textSecondary} />
            </TouchableOpacity>
          </GlassCard>

          {/* 4. Sleep Section */}
          <Text style={[styles.sectionTitle, dynamicStyles.sectionTitle]}>{t('settings.sleep')}</Text>
          <GlassCard style={[styles.sleepCard, dynamicStyles.glassCard]}>
            <TouchableOpacity onPress={() => navigation.navigate('SleepList')} activeOpacity={0.7}>
              <View style={styles.weightHeader}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Moon size={20} color="#8B5CF6" style={{ marginRight: 8 }} />
                  <Text style={[styles.cardTitle, dynamicStyles.title]}>{t('health.lastNight')}</Text>
                </View>
                <TouchableOpacity
                  onPress={e => {
                    e.stopPropagation();
                    navigation.navigate('SleepAdd');
                  }}
                  style={[styles.addWeightButton, dynamicStyles.iconContainer]}
                >
                  <Plus size={20} color="#8B5CF6" />
                </TouchableOpacity>
              </View>

              {latestSleep ? (
                <>
                  <Text style={[styles.cardDate, dynamicStyles.subtitle]}>{formatDate(latestSleep.date)}</Text>
                  <View style={styles.weightContent}>
                    <Text style={[styles.bigValue, dynamicStyles.title]}>
                      {latestSleep.duration_min
                        ? `${Math.floor(latestSleep.duration_min / 60)}h ${latestSleep.duration_min % 60}m`
                        : '--'}
                    </Text>
                  </View>
                  {latestSleep.quality_score && (
                    <View style={styles.sleepQualityRow}>
                      <Text style={[styles.qualityLabel, dynamicStyles.subtitle]}>{t('health.quality')}</Text>
                      <View style={styles.qualityStars}>
                        {[1, 2, 3, 4, 5].map(star => (
                          <View
                            key={star}
                            style={[
                              styles.qualityStar,
                              {
                                backgroundColor:
                                  star <= latestSleep.quality_score!
                                    ? '#8B5CF6'
                                    : isDark
                                      ? 'rgba(255,255,255,0.1)'
                                      : 'rgba(0,0,0,0.1)',
                              },
                            ]}
                          />
                        ))}
                      </View>
                    </View>
                  )}
                  {avgSleepMinutes > 0 && (
                    <Text style={[styles.comparisonText, dynamicStyles.subtitle]}>
                      {t('health.averageLabel')}
                      {Math.floor(avgSleepMinutes / 60)}h {Math.round(avgSleepMinutes % 60)}m
                    </Text>
                  )}
                </>
              ) : (
                <View style={styles.emptyStateContainer}>
                  <Text style={[styles.emptyStateText, dynamicStyles.subtitle]}>{t('health.noSleepRecords')}</Text>
                  <Text style={[styles.emptyStateHint, dynamicStyles.subtitle]}>{t('health.addFirstSleepRecord')}</Text>
                </View>
              )}
            </TouchableOpacity>
          </GlassCard>
          <Text style={[styles.recommendationText, dynamicStyles.subtitle]}>{t('health.autoCompCalcDisclaimer')}</Text>

          {/* Shortcuts Floating or Bottom? User didn't specify but removed from prominent view to focus on Weight */}
        </ScrollView>

        <Modal visible={showExportModal} animationType="fade" transparent>
          <View style={styles.modalOverlay}>
            <View
              style={[styles.modalContent, dynamicStyles.modalContent, Platform.OS === 'web' && styles.webModalContent]}
            >
              <Text style={[styles.modalTitle, dynamicStyles.title]}>{t('health.exportHealthHistory')}</Text>
              <Text style={[styles.modalSubtitle, dynamicStyles.subtitle]}>{t('health.generatePdfHistory')}</Text>

              <View style={styles.exportDateRow}>
                <View style={styles.exportDateField}>
                  <Text style={[styles.label, dynamicStyles.sublabel]}>{t('nutrition.startDate')}</Text>
                  {Platform.OS === 'web' ? (
                    <TextInput
                      style={[styles.webDateInput, dynamicStyles.input]}
                      value={exportStartInput}
                      onChangeText={value => {
                        setExportStartInput(value);
                        const parsed = parseWebDateInput(value);
                        if (!parsed || parsed > new Date()) return;
                        setExportStart(parsed);
                      }}
                      onBlur={() => {
                        if (!parseWebDateInput(exportStartInput)) {
                          setExportStartInput(format(exportStart, 'yyyy-MM-dd'));
                        }
                      }}
                      placeholder="YYYY-MM-DD"
                      placeholderTextColor={themeColors.textSecondary}
                      autoCapitalize="none"
                      autoCorrect={false}
                    />
                  ) : (
                    <DateTimePicker
                      value={exportStart}
                      mode="date"
                      display="default"
                      maximumDate={new Date()}
                      themeVariant={isDark ? 'dark' : 'light'}
                      onChange={(_, date) => {
                        if (date) setExportStart(date);
                      }}
                    />
                  )}
                </View>

                <View style={styles.exportDateField}>
                  <Text style={[styles.label, dynamicStyles.sublabel]}>{t('nutrition.endDate')}</Text>
                  {Platform.OS === 'web' ? (
                    <TextInput
                      style={[styles.webDateInput, dynamicStyles.input]}
                      value={exportEndInput}
                      onChangeText={value => {
                        setExportEndInput(value);
                        const parsed = parseWebDateInput(value);
                        if (!parsed || parsed > new Date()) return;
                        setExportEnd(parsed);
                      }}
                      onBlur={() => {
                        if (!parseWebDateInput(exportEndInput)) {
                          setExportEndInput(format(exportEnd, 'yyyy-MM-dd'));
                        }
                      }}
                      placeholder="YYYY-MM-DD"
                      placeholderTextColor={themeColors.textSecondary}
                      autoCapitalize="none"
                      autoCorrect={false}
                    />
                  ) : (
                    <DateTimePicker
                      value={exportEnd}
                      mode="date"
                      display="default"
                      maximumDate={new Date()}
                      themeVariant={isDark ? 'dark' : 'light'}
                      onChange={(_, date) => {
                        if (date) setExportEnd(date);
                      }}
                    />
                  )}
                </View>
              </View>

              {exportRangeErrorMessage ? (
                <Text style={[styles.exportRangeError, { color: themeColors.danger }]}>{exportRangeErrorMessage}</Text>
              ) : null}

              <View style={styles.modalButtons}>
                <TouchableOpacity onPress={() => setShowExportModal(false)} style={styles.modalBtnCancel}>
                  <Text style={[styles.modalBtnTextCancel, dynamicStyles.subtitle]}>{t('common.cancel')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleExport}
                  style={[
                    styles.modalBtnConfirm,
                    { backgroundColor: themeColors.primary },
                    isExportDisabled && { opacity: 0.45 },
                  ]}
                  disabled={isExportDisabled}
                >
                  {isExporting ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Text style={styles.modalBtnTextConfirm}>{t('training.exportPdf')}</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </SafeAreaView>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    position: 'relative',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  topActions: {
    position: 'absolute',
    right: 16,
    top: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerIconButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 100,
  },
  content: {
    padding: 20,
    paddingTop: 0,
    paddingBottom: 130,
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 12,
    marginTop: 16,
  },
  weightCard: {
    padding: 24,
    marginBottom: 16,
    borderRadius: 24,
    backgroundColor: colors.surface,
  },
  weightHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  addWeightButton: {
    padding: 8,
    backgroundColor: colors.background,
    borderRadius: 20,
    marginLeft: 8,
  },
  weightContent: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: 8,
  },
  weightDeltaContainer: {
    marginLeft: 12,
    justifyContent: 'center',
  },
  deltaBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.05)', // Fallback
  },
  deltaText: {
    fontSize: 16,
    fontWeight: '700',
  },
  comparisonText: {
    ...typography.caption,
    color: colors.textSecondary,
    fontStyle: 'italic',
  },
  listItemCard: {
    padding: 0, // List items might have internal padding
    marginBottom: 12,
    borderRadius: 16,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  listItemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
  },
  listItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  listItemTitle: {
    ...typography.body,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  listItemSubtitle: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  listItemRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  listItemValue: {
    ...typography.h4,
    color: colors.textPrimary,
    marginRight: 8,
  },
  editButton: {
    fontSize: 16,
    color: colors.primary,
    fontWeight: '600',
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  cardDate: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  bigValue: {
    fontSize: 48,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  unit: {
    fontSize: 20,
    color: colors.textSecondary,
    marginLeft: 4,
    fontWeight: '600',
  },
  iconBox: {
    width: 32,
    height: 20,
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  iconBoxText: {
    fontSize: 10,
    color: '#FFF',
    fontWeight: '800',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 12,
  },
  halfCard: {
    flex: 1,
  },
  deltaInline: {
    marginLeft: 12,
    justifyContent: 'center',
  },
  deltaValue: {
    fontSize: 18,
    fontWeight: '600',
    letterSpacing: -0.5,
  },
  // Sleep section styles
  sleepCard: {
    padding: 24,
    marginBottom: 16,
    borderRadius: 24,
    backgroundColor: colors.surface,
  },
  sleepQualityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    gap: 8,
  },
  qualityLabel: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  qualityStars: {
    flexDirection: 'row',
    gap: 4,
  },
  qualityStar: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  emptyStateContainer: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  emptyStateText: {
    ...typography.body,
    color: colors.textSecondary,
    marginBottom: 4,
  },
  emptyStateHint: {
    ...typography.caption,
    color: colors.textSecondary,
    opacity: 0.7,
  },
  recommendationText: {
    ...typography.caption,
    fontSize: 12,
    textAlign: 'center',
    marginTop: 16,
    marginHorizontal: 8,
    opacity: 0.7,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: 24,
  },
  modalContent: {
    borderRadius: 24,
    padding: 24,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  webModalContent: {
    maxWidth: 560,
    width: '100%',
    alignSelf: 'center',
  },
  modalTitle: {
    ...typography.h2,
    textAlign: 'center',
    marginBottom: 8,
  },
  modalSubtitle: {
    ...typography.caption,
    textAlign: 'center',
    marginBottom: 20,
  },
  exportDateRow: {
    flexDirection: 'row',
    gap: 14,
    marginBottom: 12,
  },
  exportDateField: {
    flex: 1,
  },
  label: {
    ...typography.caption,
    fontWeight: '700',
    marginBottom: 8,
  },
  webDateInput: {
    minHeight: 54,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    fontSize: 16,
    fontWeight: '600',
  },
  exportRangeError: {
    ...typography.caption,
    fontWeight: '700',
    marginTop: 2,
    marginBottom: 14,
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 16,
    marginTop: 18,
  },
  modalBtnCancel: {
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  modalBtnConfirm: {
    minWidth: 132,
    minHeight: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  modalBtnTextCancel: {
    ...typography.button,
  },
  modalBtnTextConfirm: {
    ...typography.button,
    color: colors.white,
  },
});
