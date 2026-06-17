import React from 'react';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/AuthContext';
import { Alert } from '../../components/common/Alert';
import { formatLocalizedDate } from '../../i18n/dateLocale';
import type { WebExportWindow } from '../../modules/health/services/healthPdfExportService';
import { useHomeSettings } from '../../hooks/settings/useHomeSettings';
import { generateCombinedSettingsPDF } from './settingsCombinedPdfExportService';
import {
  formatSettingsPdfExportDate,
  getDefaultSettingsPdfExportRange,
  getSettingsPdfExportRangeError,
  loadSettingsPdfExportRange,
  parseSettingsPdfExportDateInput,
  saveSettingsPdfExportRange,
} from './settingsPdfExportRange';
import type { SettingsPdfExportRange } from './settingsPdfExportRange';

const openWebExportWindow = (): WebExportWindow | null => {
  if (Platform.OS !== 'web') return null;

  const maybeGlobal: { open?: (url?: string, target?: string) => WebExportWindow | null } = globalThis;
  if (typeof maybeGlobal.open !== 'function') return null;
  return maybeGlobal.open('', '_blank');
};

const formatRangeDisplayDate = (date: Date): string =>
  formatLocalizedDate(date, {
    en: 'MMM d, yyyy',
    es: 'd MMM yyyy',
  });

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error && error.message.trim()) return error.message;
  if (typeof error === 'string' && error.trim()) return error;
  return '';
};

const joinLabels = (labels: string[]) => labels.join(', ');

export const useSettingsCombinedPdfExport = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { homePdfSectionOrder } = useHomeSettings();
  const defaultRange = React.useMemo(getDefaultSettingsPdfExportRange, []);

  const [isModalVisible, setIsModalVisible] = React.useState(false);
  const [startDate, setStartDate] = React.useState<Date>(defaultRange.startDate);
  const [endDate, setEndDate] = React.useState<Date>(defaultRange.endDate);
  const [startInput, setStartInput] = React.useState(() => formatSettingsPdfExportDate(defaultRange.startDate));
  const [endInput, setEndInput] = React.useState(() => formatSettingsPdfExportDate(defaultRange.endDate));
  const [isExporting, setIsExporting] = React.useState(false);

  const applyRange = React.useCallback((range: SettingsPdfExportRange) => {
    setStartDate(range.startDate);
    setEndDate(range.endDate);
    setStartInput(formatSettingsPdfExportDate(range.startDate));
    setEndInput(formatSettingsPdfExportDate(range.endDate));
  }, []);

  React.useEffect(() => {
    let isActive = true;
    loadSettingsPdfExportRange(AsyncStorage).then(range => {
      if (isActive) applyRange(range);
    });
    return () => {
      isActive = false;
    };
  }, [applyRange]);

  React.useEffect(() => {
    if (!isModalVisible) return;
    setStartInput(formatSettingsPdfExportDate(startDate));
    setEndInput(formatSettingsPdfExportDate(endDate));
  }, [endDate, isModalVisible, startDate]);

  const rangeError = React.useMemo(() => getSettingsPdfExportRangeError({ startDate, endDate }), [endDate, startDate]);

  const rangeErrorMessage = React.useMemo(() => {
    if (!rangeError) return null;
    if (rangeError.type === 'inverted') return t('nutrition.invalidDatesMessage');
    return t('nutrition.exportRangeMinStartMessage', {
      date: formatSettingsPdfExportDate(rangeError.minStartDate),
    });
  }, [rangeError, t]);

  const lastRangeLabel = React.useMemo(
    () =>
      t('settings.lastPdfRange', {
        start: formatRangeDisplayDate(startDate),
        end: formatRangeDisplayDate(endDate),
      }),
    [endDate, startDate, t],
  );

  const openModal = React.useCallback(() => {
    setIsModalVisible(true);
    void loadSettingsPdfExportRange(AsyncStorage).then(applyRange);
  }, [applyRange]);

  const closeModal = React.useCallback(() => {
    if (isExporting) return;
    setIsModalVisible(false);
  }, [isExporting]);

  const exportCombinedPdf = React.useCallback(async () => {
    if (!user || rangeErrorMessage) return;

    const exportStartDate = formatSettingsPdfExportDate(startDate);
    const exportEndDate = formatSettingsPdfExportDate(endDate);
    const webPrintWindow = Platform.OS === 'web' ? openWebExportWindow() : null;

    const displayName =
      typeof user.user_metadata?.display_name === 'string' ? user.user_metadata.display_name : undefined;

    setIsModalVisible(false);
    setIsExporting(true);

    try {
      try {
        await saveSettingsPdfExportRange(AsyncStorage, { startDate, endDate });
      } catch (error: unknown) {
        console.warn('[SettingsCombinedPdfExport] Could not save export range:', error);
      }

      const result = await generateCombinedSettingsPDF({
        startDate: exportStartDate,
        endDate: exportEndDate,
        user: {
          id: user.id,
          display_name: displayName,
          email: user.email,
        },
        sectionOrder: homePdfSectionOrder,
        webPrintWindow,
      });

      const notes = [
        result.noDataLabels.length > 0
          ? t('settings.exportCombinedPdfNoDataNote', { items: joinLabels(result.noDataLabels) })
          : null,
        result.failedLabels.length > 0
          ? t('settings.exportCombinedPdfFailedNote', { items: joinLabels(result.failedLabels) })
          : null,
      ].filter((note): note is string => typeof note === 'string' && note.length > 0);

      if (notes.length > 0) {
        Alert.alert(
          t('settings.exportCombinedPdfFinishedWithNotesTitle'),
          t('settings.exportCombinedPdfFinishedWithNotesMessage', {
            count: result.exportedLabels.length,
            notes: notes.join('\n'),
          }),
        );
        return;
      }

      Alert.alert(
        t('common.done'),
        t('settings.exportCombinedPdfDoneMessage', {
          count: result.exportedLabels.length,
        }),
      );
    } catch (error: unknown) {
      webPrintWindow?.close?.();
      const message = getErrorMessage(error) || t('settings.combinedPdfGenerateFailed');
      Alert.alert(t('common.error'), message);
    } finally {
      setIsExporting(false);
    }
  }, [endDate, homePdfSectionOrder, rangeErrorMessage, startDate, t, user]);

  return {
    isModalVisible,
    isExporting,
    startDate,
    endDate,
    startInput,
    endInput,
    rangeErrorMessage,
    lastRangeLabel,
    isExportDisabled: isExporting || !!rangeErrorMessage || !user,
    openModal,
    closeModal,
    exportCombinedPdf,
    setStartDate,
    setEndDate,
    setStartInput,
    setEndInput,
    parseDateInput: parseSettingsPdfExportDateInput,
  };
};

export type SettingsCombinedPdfExportController = ReturnType<typeof useSettingsCombinedPdfExport>;
