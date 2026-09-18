import { differenceInCalendarDays, startOfDay } from 'date-fns';
import { parseSettingsPdfExportDateInput } from '../settings/settingsPdfExportRange';

type ExportRangeValidation =
  | { error: 'invalid' | 'future'; field: 'start' | 'end' }
  | { error: 'inverted' | 'tooLong' }
  | { error: null; startDate: Date; endDate: Date };

export const validateNutritionExportRange = (
  startInput: string,
  endInput: string,
  now = new Date(),
): ExportRangeValidation => {
  const startDate = parseSettingsPdfExportDateInput(startInput);
  const endDate = parseSettingsPdfExportDateInput(endInput);
  if (!startDate) return { error: 'invalid', field: 'start' };
  if (!endDate) return { error: 'invalid', field: 'end' };
  const today = startOfDay(now);
  if (startDate > today) return { error: 'future', field: 'start' };
  if (endDate > today) return { error: 'future', field: 'end' };
  const days = differenceInCalendarDays(endDate, startDate);
  if (days < 0) return { error: 'inverted' };
  if (days > 92) return { error: 'tooLong' };
  return { error: null, startDate, endDate };
};
