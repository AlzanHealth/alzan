import { addDays, format, isValid, parseISO, startOfDay } from 'date-fns';

export type CopyTargetValidation = { ok: true } | { ok: false; reason: 'invalid_date' | 'same_date' };

export type CopyTargetInput = {
  sourceDate: string;
  targetDate: string;
};

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const isValidIsoDate = (value: string): boolean => {
  if (!ISO_DATE_PATTERN.test(value)) return false;
  const parsed = parseISO(value);
  return isValid(parsed) && format(parsed, 'yyyy-MM-dd') === value;
};

export const getDefaultCopyTargetDate = (referenceDate: Date = new Date()): string =>
  format(addDays(startOfDay(referenceDate), 1), 'yyyy-MM-dd');

export const validateCopyTargetDate = (input: CopyTargetInput): CopyTargetValidation => {
  if (!isValidIsoDate(input.sourceDate) || !isValidIsoDate(input.targetDate)) {
    return { ok: false, reason: 'invalid_date' };
  }

  if (input.sourceDate === input.targetDate) {
    return { ok: false, reason: 'same_date' };
  }

  return { ok: true };
};
