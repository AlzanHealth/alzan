import React from 'react';
import { Platform } from 'react-native';
import { differenceInCalendarDays, format, subDays } from 'date-fns';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../../context/AuthContext';
import { Alert } from '../../../components/common/Alert';
import { generateHealthPDF, WebExportWindow } from '../services/healthPdfExportService';

const MAX_EXPORT_RANGE_DAYS = 92;

const getDefaultExportRange = () => {
  const end = new Date();
  return {
    start: subDays(end, 7),
    end,
  };
};

const getMinExportStartDate = (endDate: Date) => subDays(endDate, MAX_EXPORT_RANGE_DAYS);

export const parseHealthExportWebDateInput = (value: string): Date | null => {
  const normalized = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return null;

  const parsed = new Date(`${normalized}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return null;

  return format(parsed, 'yyyy-MM-dd') === normalized ? parsed : null;
};

export const useHealthPdfExport = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const defaultRange = React.useMemo(getDefaultExportRange, []);

  const [isModalVisible, setIsModalVisible] = React.useState(false);
  const [startDate, setStartDate] = React.useState<Date>(defaultRange.start);
  const [endDate, setEndDate] = React.useState<Date>(defaultRange.end);
  const [startInput, setStartInput] = React.useState(() => format(defaultRange.start, 'yyyy-MM-dd'));
  const [endInput, setEndInput] = React.useState(() => format(defaultRange.end, 'yyyy-MM-dd'));
  const [isExporting, setIsExporting] = React.useState(false);

  React.useEffect(() => {
    if (!isModalVisible) return;

    setStartInput(format(startDate, 'yyyy-MM-dd'));
    setEndInput(format(endDate, 'yyyy-MM-dd'));
  }, [endDate, isModalVisible, startDate]);

  const minStartDate = React.useMemo(() => getMinExportStartDate(endDate), [endDate]);
  const rangeDays = differenceInCalendarDays(endDate, startDate);
  const rangeErrorMessage =
    rangeDays < 0
      ? t('nutrition.invalidDatesMessage')
      : rangeDays > MAX_EXPORT_RANGE_DAYS
        ? t('nutrition.exportRangeMinStartMessage', { date: format(minStartDate, 'yyyy-MM-dd') })
        : null;

  const openModal = React.useCallback(() => {
    const nextDefaultRange = getDefaultExportRange();
    setStartDate(nextDefaultRange.start);
    setEndDate(nextDefaultRange.end);
    setStartInput(format(nextDefaultRange.start, 'yyyy-MM-dd'));
    setEndInput(format(nextDefaultRange.end, 'yyyy-MM-dd'));
    setIsModalVisible(true);
  }, []);

  const closeModal = React.useCallback(() => {
    if (isExporting) return;
    setIsModalVisible(false);
  }, [isExporting]);

  const getErrorMessage = React.useCallback(
    (error: unknown): string => {
      if (error instanceof Error && error.message.trim()) return error.message;
      if (typeof error === 'string' && error.trim()) return error;
      return t('health.pdfGenerateRetry');
    },
    [t],
  );

  const exportPdf = React.useCallback(async () => {
    if (!user || rangeErrorMessage) return;

    const exportStartDate = format(startDate, 'yyyy-MM-dd');
    const exportEndDate = format(endDate, 'yyyy-MM-dd');
    const webPrintWindow: WebExportWindow | null =
      Platform.OS === 'web'
        ? ((
            globalThis as {
              open?: (url?: string, target?: string) => WebExportWindow | null;
            }
          ).open?.('', '_blank') ?? null)
        : null;

    setIsModalVisible(false);

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
  }, [endDate, getErrorMessage, rangeErrorMessage, startDate, t, user]);

  return {
    isModalVisible,
    isExporting,
    startDate,
    endDate,
    startInput,
    endInput,
    rangeErrorMessage,
    isExportDisabled: isExporting || !!rangeErrorMessage,
    openModal,
    closeModal,
    exportPdf,
    setStartDate,
    setEndDate,
    setStartInput,
    setEndInput,
  };
};

export type HealthPdfExportController = ReturnType<typeof useHealthPdfExport>;
