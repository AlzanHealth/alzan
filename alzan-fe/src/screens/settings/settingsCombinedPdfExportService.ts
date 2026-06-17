import { Platform } from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import { format } from 'date-fns';
import i18n from '../../i18n';
import { getDateFnsLocale } from '../../i18n/dateLocale';
import { TranslationKey } from '../../i18n/locales/en';
import { generateHealthPDF } from '../../modules/health/services/healthPdfExportService';
import type { WebExportWindow } from '../../modules/health/services/healthPdfExportService';
import { generateDietPDF } from '../../modules/nutrition/services/pdfExportService';
import { generateTrainingPDF } from '../../modules/training/services/trainingPdfExportService';
import { createCombinedPdfHtml, createStatusSectionHtml } from './settingsCombinedPdfHtml';

type CombinedPdfUser = {
  id: string;
  display_name?: string | null;
  email?: string;
};

type CombinedPdfExportOptions = {
  startDate: string;
  endDate: string;
  user: CombinedPdfUser;
  webPrintWindow?: WebExportWindow | null;
};

type CombinedPdfReportKey = 'health' | 'training' | 'nutrition';

type CombinedPdfReportTask = {
  key: CombinedPdfReportKey;
  label: string;
  run: () => Promise<string | void>;
};

export type CombinedPdfExportResult = {
  exportedLabels: string[];
  noDataLabels: string[];
  failedLabels: string[];
};

const t = (key: TranslationKey) => String(i18n.t(key));
const isEnglish = () => i18n.language?.startsWith('en');
const getPdfDatePattern = () => (isEnglish() ? 'MMMM d, yyyy' : 'd MMMM yyyy');

const openWebExportWindow = (): WebExportWindow | null => {
  if (Platform.OS !== 'web') return null;

  const maybeGlobal: { open?: (url?: string, target?: string) => WebExportWindow | null } = globalThis;
  if (typeof maybeGlobal.open !== 'function') return null;
  return maybeGlobal.open('', '_blank');
};

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error && error.message.trim()) return error.message;
  if (typeof error === 'string' && error.trim()) return error;
  return '';
};

const isNoDataMessage = (key: CombinedPdfReportKey, message: string): boolean => {
  switch (key) {
    case 'health':
      return (
        message.includes(t('health.pdfNoRecordsInRange')) ||
        message.includes('No health records') ||
        message.includes('No hay registros de salud')
      );
    case 'training':
      return (
        message.includes(t('training.pdfNoWorkoutsInRange')) ||
        message.includes('No workouts') ||
        message.includes('No hay entrenamientos')
      );
    case 'nutrition':
      return (
        message.includes(t('nutrition.pdfNoRecordsInRange')) ||
        message.includes('No records') ||
        message.includes('No hay registros')
      );
  }
};

const sanitizeFileName = (value: string): string => value.replace(/[\\/:*?"<>|]/g, '-');

export const generateCombinedSettingsPDF = async ({
  startDate,
  endDate,
  user,
  webPrintWindow,
}: CombinedPdfExportOptions): Promise<CombinedPdfExportResult> => {
  const displayName =
    typeof user.display_name === 'string' && user.display_name.trim() ? user.display_name.trim() : undefined;
  const dateLocale = getDateFnsLocale();
  const datePattern = getPdfDatePattern();

  const tasks: CombinedPdfReportTask[] = [
    {
      key: 'health',
      label: t('tabs.health'),
      run: () =>
        generateHealthPDF({
          startDate,
          endDate,
          user: {
            id: user.id,
            display_name: displayName,
            email: user.email,
          },
          returnHtml: true,
        }),
    },
    {
      key: 'training',
      label: t('settings.workout'),
      run: () =>
        generateTrainingPDF({
          startDate,
          endDate,
          user: {
            id: user.id,
            display_name: displayName || t('training.pdfAthleteFallback'),
            email: user.email,
          },
          returnHtml: true,
        }),
    },
    {
      key: 'nutrition',
      label: t('tabs.nutrition'),
      run: () =>
        generateDietPDF({
          startDate,
          endDate,
          user: {
            id: user.id,
            display_name: displayName || user.email,
            email: user.email,
          },
          returnHtml: true,
        }),
    },
  ];

  const sections: Array<{ label: string; html: string }> = [];
  const exportedLabels: string[] = [];
  const noDataLabels: string[] = [];
  const failedLabels: string[] = [];

  for (const task of tasks) {
    try {
      const html = await task.run();
      if (typeof html === 'string' && html.trim()) {
        sections.push({ label: task.label, html });
        exportedLabels.push(task.label);
      }
    } catch (error: unknown) {
      const message = getErrorMessage(error);
      if (isNoDataMessage(task.key, message)) {
        noDataLabels.push(task.label);
        sections.push({
          label: task.label,
          html: createStatusSectionHtml(task.label, t('settings.combinedPdfNoDataSectionMessage')),
        });
      } else {
        failedLabels.push(task.label);
        console.error('[SettingsCombinedPdfExport] Section failed:', task.key, message || error);
        sections.push({
          label: task.label,
          html: createStatusSectionHtml(task.label, t('settings.combinedPdfFailedSectionMessage')),
        });
      }
    }
  }

  if (exportedLabels.length === 0) {
    if (failedLabels.length > 0) throw new Error(t('settings.combinedPdfGenerateFailed'));
    throw new Error(t('settings.combinedPdfNoDataMessage'));
  }

  const html = createCombinedPdfHtml({
    sections,
    footer: `${t('training.pdfGeneratedBy')} - ${format(new Date(), datePattern, { locale: dateLocale })}`,
  });
  const rawFileName = `${t('settings.combinedPdfFilePrefix')}_${startDate}_${endDate}.pdf`;
  const fileName = sanitizeFileName(rawFileName);

  if (Platform.OS === 'web') {
    const targetWindow = webPrintWindow ?? openWebExportWindow();
    if (!targetWindow) throw new Error(t('health.pdfWebOpenBlocked'));

    targetWindow.document.open();
    targetWindow.document.write(`
      ${html}
      <script>
        window.addEventListener('load', function () {
          setTimeout(function () {
            window.focus();
            window.print();
          }, 120);
        });
      </script>
    `);
    targetWindow.document.close();
    return { exportedLabels, noDataLabels, failedLabels };
  }

  const { uri } = await Print.printToFileAsync({ html, base64: false });
  const baseDirectory = FileSystem.documentDirectory || FileSystem.cacheDirectory;
  if (!baseDirectory) throw new Error(t('health.pdfGenerateRetry'));

  const newUri = `${baseDirectory}${fileName}`;
  await FileSystem.moveAsync({ from: uri, to: newUri });

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(newUri, {
      UTI: '.pdf',
      mimeType: 'application/pdf',
      dialogTitle: t('settings.exportCombinedPdf'),
    });
    return { exportedLabels, noDataLabels, failedLabels };
  }

  await Print.printAsync({ html });
  return { exportedLabels, noDataLabels, failedLabels };
};
