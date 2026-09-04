import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Modal,
  ActivityIndicator,
  TextInput,
  Platform,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Download, Trash2, Calendar, AlertTriangle, Upload, ArrowDown, ArrowUp } from 'lucide-react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { differenceInCalendarDays, format, subDays } from 'date-fns';
import { colors, spacing, typography, borderRadius } from '../../theme';
import { useTrainingStyles } from '../../hooks/useTrainingStyles';
import { AlzanSwitch } from '../../components/common/AlzanSwitch';
import { CalendarDatePickerModal } from '../../components/common/CalendarDatePickerModal';
import { useAuth } from '../../context/AuthContext';
import { useTrainingSettings } from '../../hooks/useTrainingSettings';
import { generateTrainingPDF } from '../../modules/training/services/trainingPdfExportService';
import type { WebExportWindow } from '../../modules/training/services/trainingPdfExportService';
import { supabase } from '../../lib/supabaseClient';
import { useQueryClient } from '@tanstack/react-query';
import { Alert } from '../../components/common/Alert';
import { useTranslation } from 'react-i18next';
import type { TrainingScreenNavigationProp } from '../../types/navigation.types';
import {
  normalizeEnduranceMetricPriority,
  type EnduranceMetricField,
} from '../../modules/training/helpers/enduranceMetricPriority.helper';

type TrainingSectionInfoKey = 'general' | 'data' | 'danger';

const MAX_EXPORT_RANGE_DAYS = 92;

const getDefaultExportRange = () => {
  const end = new Date();
  return {
    start: subDays(end, 7),
    end,
  };
};

const getMinExportStartDate = (endDate: Date) => {
  return subDays(endDate, MAX_EXPORT_RANGE_DAYS);
};

const TrainingSettingsScreen = () => {
  const { t } = useTranslation();
  const navigation = useNavigation<TrainingScreenNavigationProp>();
  const { styles: dynamicStyles, colors: themeColors, isDark } = useTrainingStyles();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const {
    settings,
    toggleSetting,
    setAutoDeleteExpiredTemplates,
    isLoading: isLoadingSettings,
    isSavingAutoDelete,
    setMetricPriority,
    isSavingMetricPriority,
  } = useTrainingSettings();

  const metricPriorityLabels: Record<EnduranceMetricField, string> = {
    intensity: t('training.metricPriorityIntensity'),
    duration: t('training.metricPriorityDuration'),
    distance: t('training.metricPriorityDistance'),
  };

  const moveMetricPriority = (index: number, offset: -1 | 1) => {
    const targetIndex = index + offset;
    if (targetIndex < 0 || targetIndex >= settings.metricPriority.length) return;
    const nextPriority = [...settings.metricPriority];
    const [moved] = nextPriority.splice(index, 1);
    nextPriority.splice(targetIndex, 0, moved);
    void setMetricPriority(normalizeEnduranceMetricPriority(nextPriority));
  };

  // Toggle Row Component
  const ToggleRow = ({
    label,
    value,
    onValueChange,
    description,
    disabled,
  }: {
    label: string;
    value: boolean;
    onValueChange: (val: boolean) => void;
    description?: string;
    disabled?: boolean;
  }) => (
    <View style={styles.toggleRow}>
      <View style={{ flex: 1 }}>
        <Text style={[styles.toggleLabel, dynamicStyles.label]}>{label}</Text>
        {description && <Text style={[styles.toggleDesc, dynamicStyles.sublabel]}>{description}</Text>}
      </View>
      {disabled ? (
        <ActivityIndicator size="small" color={themeColors.primary} />
      ) : (
        <AlzanSwitch value={value} onValueChange={onValueChange} disabled={disabled} />
      )}
    </View>
  );

  // Export State
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportStart, setExportStart] = useState<Date>(() => getDefaultExportRange().start);
  const [exportEnd, setExportEnd] = useState<Date>(() => getDefaultExportRange().end);
  const [exportStartInput, setExportStartInput] = useState(() => format(getDefaultExportRange().start, 'yyyy-MM-dd'));
  const [exportEndInput, setExportEndInput] = useState(() => format(getDefaultExportRange().end, 'yyyy-MM-dd'));
  const [isExporting, setIsExporting] = useState(false);

  // Delete State
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showDeleteRangeMode, setShowDeleteRangeMode] = useState(false);
  const [deleteStart, setDeleteStart] = useState(new Date());
  const [deleteEnd, setDeleteEnd] = useState(new Date());
  const [activeDeleteDatePicker, setActiveDeleteDatePicker] = useState<'start' | 'end' | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [activeSectionInfo, setActiveSectionInfo] = useState<TrainingSectionInfoKey | null>(null);

  const sectionInfoTextKeys = {
    general: {
      titleKey: 'training.generalInfoModalTitle',
      bodyKey: 'training.generalInfoModalBody',
    },
    data: {
      titleKey: 'training.dataInfoModalTitle',
      bodyKey: 'training.dataInfoModalBody',
    },
    danger: {
      titleKey: 'training.dangerInfoModalTitle',
      bodyKey: 'training.dangerInfoModalBody',
    },
  } as const satisfies Record<TrainingSectionInfoKey, { titleKey: string; bodyKey: string }>;

  const renderSectionTitle = (label: string, key: TrainingSectionInfoKey) => (
    <TouchableOpacity activeOpacity={0.8} onPress={() => setActiveSectionInfo(key)}>
      <Text style={[styles.sectionTitle, dynamicStyles.sublabel]}>{label}</Text>
    </TouchableOpacity>
  );

  const parseWebDateInput = (value: string): Date | null => {
    const normalized = value.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return null;
    const parsed = new Date(`${normalized}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) return null;
    return format(parsed, 'yyyy-MM-dd') === normalized ? parsed : null;
  };

  useEffect(() => {
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

  const getErrorMessage = (error: unknown): string => {
    if (error instanceof Error && error.message.trim()) return error.message;
    if (typeof error === 'string' && error.trim()) return error;

    if (typeof error === 'object' && error !== null) {
      const maybeError = error as {
        message?: unknown;
        details?: unknown;
        hint?: unknown;
        code?: unknown;
      };
      const parts = [maybeError.message, maybeError.details, maybeError.hint, maybeError.code]
        .filter(part => typeof part === 'string' && part.trim())
        .map(part => String(part));

      if (parts.length > 0) {
        return parts.join(' · ');
      }
    }

    return t('nutrition.unknownError');
  };

  const handleExport = async () => {
    if (!user) return;
    if (exportRangeErrorMessage) return;
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

    // Close the modal immediately after pressing export (UX requirement).
    setShowExportModal(false);

    try {
      setIsExporting(true);
      await generateTrainingPDF({
        startDate: exportStartDate,
        endDate: exportEndDate,
        user: {
          id: user?.id || '',
          display_name: user?.user_metadata?.display_name || t('training.pdfAthleteFallback'),
          email: user?.email,
        },
        webPrintWindow,
      });
    } catch (error: unknown) {
      const message = getErrorMessage(error);
      // Only show  don't log expected "no data" errors
      const isNoDataError =
        message.includes(t('training.pdfNoWorkoutsInRange')) ||
        message.includes('No hay entrenamientos') ||
        message.includes('No workouts');
      if (!isNoDataError) {
        console.error('Export error:', message);
      }
      const errorMessage = isNoDataError
        ? t('training.noDataToExportRange')
        : Platform.OS === 'web'
          ? `${t('training.pdfGenerateRetry')}\n${message}`
          : t('training.pdfGenerateRetry');
      Alert.alert(t('training.noticeTitle'), errorMessage);
    } finally {
      setIsExporting(false);
    }
  };

  const applyExportStartDate = (nextStart: Date) => {
    setExportStart(nextStart);
  };

  const applyExportEndDate = (nextEnd: Date) => {
    setExportEnd(nextEnd);
  };

  const openExportModal = () => {
    const defaultRange = getDefaultExportRange();
    setExportStart(defaultRange.start);
    setExportEnd(defaultRange.end);
    setExportStartInput(format(defaultRange.start, 'yyyy-MM-dd'));
    setExportEndInput(format(defaultRange.end, 'yyyy-MM-dd'));
    setShowExportModal(true);
  };

  const handleDeletePlans = async (type: 'all' | 'range') => {
    if (!user) return;

    const confirmMessage =
      type === 'all'
        ? t('training.deleteAllCalendarConfirm')
        : t('training.deleteRangeCalendarConfirm', {
            start: format(deleteStart, 'dd/MM/yyyy'),
            end: format(deleteEnd, 'dd/MM/yyyy'),
          });

    Alert.alert(t('training.confirmDeleteTitle'), confirmMessage, [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: async () => {
          try {
            setIsDeleting(true);
            let query = supabase.from('workout_plans').delete().eq('user_id', user.id);

            if (type === 'range') {
              query = query
                .gte('planned_date', format(deleteStart, 'yyyy-MM-dd'))
                .lte('planned_date', format(deleteEnd, 'yyyy-MM-dd'));
            }

            const { error } = await query;
            if (error) throw error;

            queryClient.invalidateQueries({ queryKey: ['dailyPlans'] });
            queryClient.invalidateQueries({ queryKey: ['weekDots'] });

            setShowDeleteModal(false);
            setShowDeleteRangeMode(false);
            Alert.alert(t('common.done'), t('training.workoutsDeletedSuccess'));
          } catch (err: unknown) {
            const message = err instanceof Error ? err.message : t('nutrition.unknownError');
            console.error('Delete error:', message);
            Alert.alert(t('common.error'), t('training.workoutsDeleteError'));
          } finally {
            setIsDeleting(false);
          }
        },
      },
    ]);
  };

  return (
    <LinearGradient colors={dynamicStyles.gradientColors} style={{ flex: 1 }}>
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* 1. General Settings */}
          <View style={styles.section}>
            {renderSectionTitle(t('training.generalAllCaps'), 'general')}
            <View style={[styles.card, dynamicStyles.card]}>
              <ToggleRow
                label={t('training.autoTimer')}
                description={t('training.autoRestDesc')}
                value={settings.autoTimer}
                onValueChange={() => toggleSetting('autoTimer')}
                disabled={isLoadingSettings}
              />
              <View style={[styles.separator, dynamicStyles.divider]} />
              <ToggleRow
                label={t('training.autoPlay')}
                description={t('training.autoPlayDesc')}
                value={settings.autoPlayEnabled}
                onValueChange={() => toggleSetting('autoPlayEnabled')}
                disabled={isLoadingSettings}
              />
              <View style={[styles.separator, dynamicStyles.divider]} />
              <ToggleRow
                label={t('training.sound')}
                description={t('training.soundAlertDesc')}
                value={settings.soundEnabled}
                onValueChange={() => toggleSetting('soundEnabled')}
                disabled={isLoadingSettings}
              />
              <View style={[styles.separator, dynamicStyles.divider]} />
              <ToggleRow
                label={t('training.vibration')}
                description={t('training.restVibrateDesc')}
                value={settings.hapticsEnabled}
                onValueChange={() => toggleSetting('hapticsEnabled')}
                disabled={isLoadingSettings}
              />
              <View style={[styles.separator, dynamicStyles.divider]} />
              <ToggleRow
                label={t('training.autoDeleteExpiredTemplates')}
                description={t('training.autoDeleteExpiredTemplatesDesc')}
                value={settings.autoDeleteExpiredTemplates}
                onValueChange={value => void setAutoDeleteExpiredTemplates(value)}
                disabled={isLoadingSettings || isSavingAutoDelete}
              />
              <View style={[styles.separator, dynamicStyles.divider]} />
              <View style={styles.priorityContainer}>
                <Text style={[styles.toggleLabel, dynamicStyles.label]}>{t('training.metricPriorityTitle')}</Text>
                <Text style={[styles.toggleDesc, dynamicStyles.sublabel]}>
                  {t('training.metricPriorityDescription')}
                </Text>
                <View style={styles.priorityList}>
                  {settings.metricPriority.map((field, index) => (
                    <View key={field} style={[styles.priorityRow, { borderColor: themeColors.border }]}>
                      <Text style={[styles.priorityIndex, { color: themeColors.primary }]}>{index + 1}</Text>
                      <Text style={[styles.priorityLabel, dynamicStyles.label]}>{metricPriorityLabels[field]}</Text>
                      <TouchableOpacity
                        accessibilityRole="button"
                        accessibilityLabel={t('training.movePriorityUp')}
                        disabled={index === 0 || isSavingMetricPriority}
                        onPress={() => moveMetricPriority(index, -1)}
                        style={styles.priorityButton}
                      >
                        <ArrowUp size={18} color={index === 0 ? themeColors.textSecondary : themeColors.primary} />
                      </TouchableOpacity>
                      <TouchableOpacity
                        accessibilityRole="button"
                        accessibilityLabel={t('training.movePriorityDown')}
                        disabled={index === settings.metricPriority.length - 1 || isSavingMetricPriority}
                        onPress={() => moveMetricPriority(index, 1)}
                        style={styles.priorityButton}
                      >
                        <ArrowDown
                          size={18}
                          color={
                            index === settings.metricPriority.length - 1
                              ? themeColors.textSecondary
                              : themeColors.primary
                          }
                        />
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              </View>
            </View>
          </View>

          {/* 2. Data Export */}
          <View style={styles.section}>
            {renderSectionTitle(t('nutrition.dataAllCaps'), 'data')}
            <View style={[styles.card, dynamicStyles.card]}>
              <TouchableOpacity
                style={styles.actionRow}
                onPress={() => navigation.navigate('Training', { screen: 'TrainingPlanImport' })}
                activeOpacity={0.7}
              >
                <Upload size={20} color={themeColors.primary} />
                <Text style={[styles.actionText, { color: themeColors.primary }]}>
                  {t('training.importTrainingPlan')}
                </Text>
              </TouchableOpacity>
              <View style={[styles.separator, dynamicStyles.divider]} />
              <TouchableOpacity style={styles.actionRow} onPress={openExportModal} activeOpacity={0.7}>
                <Download size={20} color={themeColors.primary} />
                <Text style={[styles.actionText, { color: themeColors.primary }]}>
                  {t('training.exportWorkoutHistory')}
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* 3. Danger Zone */}
          <View style={[styles.section, { marginBottom: spacing.xl * 2 }]}>
            {renderSectionTitle(t('training.dangerZoneCaps'), 'danger')}
            <TouchableOpacity
              style={[styles.dangerCard, dynamicStyles.dangerButton, { borderColor: themeColors.danger + '30' }]}
              onPress={() => setShowDeleteModal(true)}
              activeOpacity={0.7}
            >
              <Trash2 size={20} color={themeColors.danger} />
              <Text style={[styles.dangerText, { color: themeColors.danger }]}>
                {t('training.deleteWorkoutsFromCalendar')}
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>

        {/* Section Info Modal */}
        <Modal visible={activeSectionInfo !== null} animationType="fade" transparent>
          <View style={styles.modalOverlay}>
            <View style={[styles.modalContent, dynamicStyles.modalContent]}>
              {activeSectionInfo && (
                <>
                  <Text style={[styles.modalTitle, dynamicStyles.title]}>
                    {t(sectionInfoTextKeys[activeSectionInfo].titleKey)}
                  </Text>
                  <Text style={[styles.sectionInfoBody, dynamicStyles.subtitle]}>
                    {t(sectionInfoTextKeys[activeSectionInfo].bodyKey)}
                  </Text>
                </>
              )}
              <View style={styles.modalButtons}>
                <TouchableOpacity onPress={() => setActiveSectionInfo(null)} style={styles.modalBtnConfirm}>
                  <Text style={styles.modalBtnTextConfirm}>{t('common.gotIt')}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* Export Modal */}
        <Modal visible={showExportModal} animationType="fade" transparent>
          <View style={styles.modalOverlay}>
            <View
              style={[styles.modalContent, dynamicStyles.modalContent, Platform.OS === 'web' && styles.webModalContent]}
            >
              <Text style={[styles.modalTitle, dynamicStyles.title]}>{t('training.exportWorkouts')}</Text>
              <Text style={[styles.modalSubtitle, dynamicStyles.subtitle]}>{t('training.generatePdfHistory')}</Text>

              <View style={styles.exportDateRow}>
                <View style={styles.exportDateField}>
                  <Text style={[styles.label, dynamicStyles.label]}>{t('nutrition.startDate')}</Text>
                  {Platform.OS === 'web' ? (
                    <TextInput
                      style={[styles.webDateInput, dynamicStyles.input, { color: themeColors.textPrimary }]}
                      value={exportStartInput}
                      onChangeText={value => {
                        setExportStartInput(value);
                        const parsed = parseWebDateInput(value);
                        if (!parsed) return;
                        if (parsed > new Date()) return;
                        applyExportStartDate(parsed);
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
                      onChange={(e, d) => {
                        if (d) {
                          applyExportStartDate(d);
                        }
                      }}
                    />
                  )}
                </View>

                <View style={styles.exportDateField}>
                  <Text style={[styles.label, dynamicStyles.label]}>{t('nutrition.endDate')}</Text>
                  {Platform.OS === 'web' ? (
                    <TextInput
                      style={[styles.webDateInput, dynamicStyles.input, { color: themeColors.textPrimary }]}
                      value={exportEndInput}
                      onChangeText={value => {
                        setExportEndInput(value);
                        const parsed = parseWebDateInput(value);
                        if (!parsed || parsed > new Date()) return;
                        applyExportEndDate(parsed);
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
                      onChange={(e, d) => d && applyExportEndDate(d)}
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

        {/* Delete Modal */}
        <Modal visible={showDeleteModal} animationType="slide" transparent>
          <View style={styles.modalOverlay}>
            <View style={[styles.modalContent, dynamicStyles.modalContent]}>
              <View style={{ alignItems: 'center', marginBottom: spacing.m }}>
                <AlertTriangle size={48} color={themeColors.danger} />
              </View>
              <Text style={[styles.modalTitle, dynamicStyles.title]}>{t('training.deleteWorkouts')}</Text>
              <Text style={[styles.modalSubtitle, dynamicStyles.subtitle]}>
                {t('training.deleteScheduledWorkoutsWarning')}
              </Text>

              {!showDeleteRangeMode ? (
                <>
                  <TouchableOpacity
                    style={[styles.deleteOption, dynamicStyles.secondaryButton]}
                    onPress={() => setShowDeleteRangeMode(true)}
                  >
                    <Calendar size={20} color={themeColors.textPrimary} />
                    <Text style={[styles.deleteOptionText, dynamicStyles.label]}>
                      {t('training.deleteByDateRange')}
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.deleteOption,
                      styles.deleteOptionDanger,
                      {
                        backgroundColor: themeColors.danger + '15',
                        borderColor: themeColors.danger + '30',
                      },
                    ]}
                    onPress={() => handleDeletePlans('all')}
                  >
                    <Trash2 size={20} color={themeColors.danger} />
                    <Text style={[styles.deleteOptionText, { color: themeColors.danger }]}>
                      {t('training.deleteAll')}
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity style={styles.cancelButton} onPress={() => setShowDeleteModal(false)}>
                    <Text style={[styles.cancelButtonText, dynamicStyles.subtitle]}>{t('common.cancel')}</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <>
                  <Text style={[styles.label, dynamicStyles.label]}>{t('training.from')}</Text>
                  {Platform.OS === 'web' ? (
                    <TouchableOpacity
                      style={[styles.webDateInput, dynamicStyles.input, { justifyContent: 'center' }]}
                      onPress={() => setActiveDeleteDatePicker('start')}
                      accessibilityRole="button"
                    >
                      <Text style={{ color: themeColors.textPrimary }}>{format(deleteStart, 'dd/MM/yyyy')}</Text>
                    </TouchableOpacity>
                  ) : (
                    <DateTimePicker
                      value={deleteStart}
                      mode="date"
                      display="default"
                      themeVariant={isDark ? 'dark' : 'light'}
                      onChange={(e, d) => {
                        if (d) {
                          setDeleteStart(d);
                          if (d > deleteEnd) setDeleteEnd(d);
                        }
                      }}
                    />
                  )}

                  <Text style={[styles.label, dynamicStyles.label]}>{t('training.until')}</Text>
                  {Platform.OS === 'web' ? (
                    <TouchableOpacity
                      style={[styles.webDateInput, dynamicStyles.input, { justifyContent: 'center' }]}
                      onPress={() => setActiveDeleteDatePicker('end')}
                      accessibilityRole="button"
                    >
                      <Text style={{ color: themeColors.textPrimary }}>{format(deleteEnd, 'dd/MM/yyyy')}</Text>
                    </TouchableOpacity>
                  ) : (
                    <DateTimePicker
                      value={deleteEnd}
                      mode="date"
                      display="default"
                      minimumDate={deleteStart}
                      themeVariant={isDark ? 'dark' : 'light'}
                      onChange={(e, d) => d && setDeleteEnd(d)}
                    />
                  )}

                  <View style={styles.modalButtons}>
                    <TouchableOpacity onPress={() => setShowDeleteRangeMode(false)} style={styles.modalBtnCancel}>
                      <Text style={[styles.modalBtnTextCancel, dynamicStyles.subtitle]}>{t('common.back')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => handleDeletePlans('range')}
                      style={[
                        styles.modalBtnDanger,
                        { backgroundColor: themeColors.danger },
                        isDeleting && { opacity: 0.7 },
                      ]}
                      disabled={isDeleting}
                    >
                      {isDeleting ? (
                        <ActivityIndicator size="small" color="#FFFFFF" />
                      ) : (
                        <Text style={styles.modalBtnTextConfirm}>{t('common.delete')}</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                </>
              )}
            </View>
          </View>
        </Modal>

        {Platform.OS === 'web' && activeDeleteDatePicker ? (
          <CalendarDatePickerModal
            visible
            value={activeDeleteDatePicker === 'start' ? deleteStart : deleteEnd}
            title={activeDeleteDatePicker === 'start' ? t('training.from') : t('training.until')}
            minimumDate={activeDeleteDatePicker === 'end' ? deleteStart : undefined}
            onCancel={() => setActiveDeleteDatePicker(null)}
            onConfirm={date => {
              if (activeDeleteDatePicker === 'start') {
                setDeleteStart(date);
                if (date > deleteEnd) setDeleteEnd(date);
              } else {
                setDeleteEnd(date);
              }
              setActiveDeleteDatePicker(null);
            }}
          />
        ) : null}
      </SafeAreaView>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: spacing.m,
    paddingBottom: 120,
  },
  section: {
    marginBottom: spacing.l,
  },
  sectionTitle: {
    ...typography.caption,
    fontWeight: '600',
    marginBottom: spacing.s,
    marginLeft: spacing.xs,
    letterSpacing: 0.5,
  },
  card: {
    borderRadius: borderRadius.m,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    marginLeft: spacing.m,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.m,
  },
  toggleLabel: {
    ...typography.body,
    fontWeight: '500',
  },
  toggleDesc: {
    ...typography.caption,
    marginTop: 2,
  },
  priorityContainer: {
    padding: spacing.m,
  },
  priorityList: {
    marginTop: spacing.s,
    gap: spacing.xs,
  },
  priorityRow: {
    minHeight: 48,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: borderRadius.s,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: spacing.s,
  },
  priorityIndex: {
    width: 24,
    fontWeight: '700',
  },
  priorityLabel: {
    ...typography.body,
    flex: 1,
  },
  priorityButton: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.m,
    gap: spacing.m,
  },
  actionText: {
    ...typography.body,
    fontWeight: '500',
  },
  dangerCard: {
    borderRadius: borderRadius.m,
    padding: spacing.m,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.m,
    borderWidth: 1,
  },
  dangerText: {
    ...typography.body,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: spacing.l,
  },
  modalContent: {
    borderRadius: borderRadius.l,
    padding: spacing.l,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 10,
  },
  webModalContent: {
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
  },
  modalTitle: {
    ...typography.h3,
    textAlign: 'center',
    marginBottom: spacing.xs,
    fontWeight: '700',
  },
  modalSubtitle: {
    ...typography.body,
    textAlign: 'center',
    marginBottom: spacing.l,
  },
  sectionInfoBody: {
    ...typography.body,
    textAlign: 'left',
    lineHeight: 22,
    marginTop: spacing.s,
    marginBottom: spacing.s,
  },
  label: {
    ...typography.caption,
    fontWeight: '600',
    marginTop: spacing.m,
    marginBottom: spacing.xs,
  },
  exportDateRow: {
    flexDirection: 'row',
    gap: spacing.m,
    marginBottom: spacing.s,
  },
  exportDateField: {
    flex: 1,
  },
  webDateInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.s,
    paddingVertical: spacing.s,
    paddingHorizontal: spacing.m,
    fontSize: 16,
  },
  exportRangeError: {
    ...typography.caption,
    fontWeight: '600',
    marginTop: spacing.xs,
    lineHeight: 18,
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: spacing.xl,
    gap: spacing.m,
  },
  modalBtnCancel: {
    padding: spacing.s,
    paddingHorizontal: spacing.m,
  },
  modalBtnTextCancel: {
    fontWeight: '600',
  },
  modalBtnConfirm: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.s,
    paddingHorizontal: spacing.l,
    borderRadius: borderRadius.s,
  },
  modalBtnDanger: {
    backgroundColor: colors.danger,
    paddingVertical: spacing.s,
    paddingHorizontal: spacing.l,
    borderRadius: borderRadius.s,
  },
  modalBtnTextConfirm: {
    color: colors.white,
    fontWeight: '600',
  },
  deleteOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.m,
    borderRadius: borderRadius.s,
    marginBottom: spacing.s,
    gap: spacing.m,
  },
  deleteOptionDanger: {
    borderWidth: 1,
  },
  deleteOptionText: {
    ...typography.body,
    fontWeight: '500',
  },
  cancelButton: {
    marginTop: spacing.m,
    padding: spacing.m,
    alignItems: 'center',
  },
  cancelButtonText: {
    fontWeight: '600',
  },
});

export default TrainingSettingsScreen;
