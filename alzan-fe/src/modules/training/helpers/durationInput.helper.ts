import { parseLocalizedDecimal } from '../../../utils/numericInput';

/**
 * Parses a duration entered by a user.
 *
 * A plain number represents minutes, so `15` means `15:00`, while `M:SS`
 * and `H:MM:SS` keep their explicit sexagesimal meaning.
 */
export function parseDurationInput(rawValue: string): number | null {
  const value = rawValue.trim();
  if (!value) return null;

  if (value.includes(':')) {
    const parts = value.split(':');
    if (parts.length !== 2 && parts.length !== 3) return null;

    const numbers = parts.map(part => Number.parseInt(part, 10));
    if (numbers.some(number => !Number.isSafeInteger(number) || number < 0)) return null;

    if (parts.length === 2) {
      const [minutes, seconds] = numbers;
      if (seconds > 59) return null;
      return minutes * 60 + seconds;
    }

    const [hours, minutes, seconds] = numbers;
    if (minutes > 59 || seconds > 59) return null;
    return hours * 3600 + minutes * 60 + seconds;
  }

  const minutes = parseLocalizedDecimal(value);
  if (minutes == null || minutes < 0 || !Number.isFinite(minutes)) return null;
  return Math.max(0, Math.round(minutes * 60));
}
