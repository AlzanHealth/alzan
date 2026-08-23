import type { TextInputProps } from 'react-native';

type NumericInputProps = Pick<TextInputProps, 'keyboardType' | 'inputMode'>;

export const DECIMAL_INPUT_PROPS: NumericInputProps = {
  keyboardType: 'decimal-pad',
  inputMode: 'decimal',
};

export const INTEGER_INPUT_PROPS: NumericInputProps = {
  keyboardType: 'number-pad',
  inputMode: 'numeric',
};

export const TIME_INPUT_PROPS: NumericInputProps = {
  keyboardType: 'numbers-and-punctuation',
};

export const parseLocalizedDecimal = (value: string): number | null => {
  const trimmed = value.trim();
  if (!/^[+-]?(?:\d+(?:[.,]\d*)?|[.,]\d+)$/.test(trimmed)) return null;
  const normalized = trimmed.replace(',', '.');
  if (!normalized) return null;

  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : null;
};
