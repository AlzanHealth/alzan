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
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Download, Trash2, Calendar, AlertTriangle } from 'lucide-react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { startOfWeek, format } from 'date-fns';
import { colors, spacing, typography, borderRadius } from '../../theme';
import { useTrainingStyles } from '../../hooks/useTrainingStyles';
import { AlzanSwitch } from '../../components/common/AlzanSwitch';
import { useAuth } from '../../context/AuthContext';
import { useTrainingSettings } from '../../hooks/useTrainingSettings';
import { generateTrainingPDF } from '../../modules/training/services/trainingPdfExportService';
import type { WebExportWindow } from '../../modules/training/services/trainingPdfExportService';
import { supabase } from '../../lib/supabaseClient';
import { useQueryClient } from '@tanstack/react-query';
import { Alert } from '../../components/common/Alert';
import { useTranslation } from 'react-i18next';

const TrainingSettingsScreen = () => {
  const { t } = useTranslation();
  const { styles: dynamicStyles, colors: themeColors, isDark } = useTrainingStyles();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { settings, toggleSetting, isLoading: isLoadingSettings } = useTrainingSettings();

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
  const [exportStart, setExportStart] = useState<Date>(startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [exportEnd, setExportEnd] = useState<Date>(new Date());
  const [exportStartInput, setExportStartInput] = useState(
    format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd'),
  );
  const [exportEndInput, setExportEndInput] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [isExporting, setIsExporting] = useState(false);

  // Delete State
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showDeleteRangeMode, setShowDeleteRangeMode] = useState(false);
  const [deleteStart, setDeleteStart] = useState(new Date());
  const [deleteEnd, setDeleteEnd] = useState(new Date());
  const [isDeleting, setIsDeleting] = useState(false);

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
            <Text style={[styles.sectionTitle, dynamicStyles.sublabel]}>{t('training.generalAllCaps')}</Text>
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
            </View>
          </View>

          {/* 2. Data Export */}
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, dynamicStyles.sublabel]}>{t('nutrition.dataAllCaps')}</Text>
            <View style={[styles.card, dynamicStyles.card]}>
              <TouchableOpacity style={styles.actionRow} onPress={() => setShowExportModal(true)} activeOpacity={0.7}>
                <Download size={20} color={themeColors.primary} />
                <Text style={[styles.actionText, { color: themeColors.primary }]}>
                  {t('training.exportWorkoutHistory')}
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* 3. Danger Zone */}
          <View style={[styles.section, { marginBottom: spacing.xl * 2 }]}>
            <Text style={[styles.sectionTitle, dynamicStyles.sublabel]}>{t('training.dangerZoneCaps')}</Text>
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
                        setExportStart(parsed);
                        if (parsed > exportEnd) {
                          setExportEnd(parsed);
                          setExportEndInput(format(parsed, 'yyyy-MM-dd'));
                        }
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
                          setExportStart(d);
                          if (d > exportEnd) setExportEnd(d);
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
                        if (!parsed || parsed < exportStart) return;
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
                      minimumDate={exportStart}
                      maximumDate={new Date()}
                      themeVariant={isDark ? 'dark' : 'light'}
                      onChange={(e, d) => d && setExportEnd(d)}
                    />
                  )}
                </View>
              </View>

              <View style={styles.modalButtons}>
                <TouchableOpacity onPress={() => setShowExportModal(false)} style={styles.modalBtnCancel}>
                  <Text style={[styles.modalBtnTextCancel, dynamicStyles.subtitle]}>{t('common.cancel')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleExport}
                  style={[
                    styles.modalBtnConfirm,
                    { backgroundColor: themeColors.primary },
                    isExporting && { opacity: 0.7 },
                  ]}
                  disabled={isExporting}
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

                  <Text style={[styles.label, dynamicStyles.label]}>{t('training.until')}</Text>
                  <DateTimePicker
                    value={deleteEnd}
                    mode="date"
                    display="default"
                    minimumDate={deleteStart}
                    themeVariant={isDark ? 'dark' : 'light'}
                    onChange={(e, d) => d && setDeleteEnd(d)}
                  />

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
