export type PaceInputError = 'invalid-format' | 'seconds-out-of-range' | 'non-positive';

export type PaceInputResult =
  | {
      ok: true;
      totalSeconds: number;
      normalized: string;
    }
  | {
      ok: false;
      reason: PaceInputError;
    };

const invalidFormat = (): PaceInputResult => ({ ok: false, reason: 'invalid-format' });

/**
 * Parses a pace as minutes and seconds.
 *
 * Decimal-looking input is deliberately treated as sexagesimal shorthand:
 * 3,5 means 3:50 and 3,05 means 3:05. This avoids interpreting a value
 * entered with the decimal comma keyboard as a mathematical decimal pace.
 */
export const parsePaceInput = (rawValue: string): PaceInputResult => {
  const value = rawValue.trim();
  if (!value) return invalidFormat();

  let minutesText: string;
  let secondsText: string;

  if (value.includes(':')) {
    if (!/^\d+:\d{1,2}$/.test(value)) return invalidFormat();
    [minutesText, secondsText] = value.split(':');
  } else {
    const match = /^(\d+)(?:[,.](\d{1,2}))?$/.exec(value);
    if (!match) return invalidFormat();
    minutesText = match[1];
    const decimalSeconds = match[2];
    secondsText = decimalSeconds ? (decimalSeconds.length === 1 ? `${decimalSeconds}0` : decimalSeconds) : '00';
  }

  const minutes = Number.parseInt(minutesText, 10);
  const seconds = Number.parseInt(secondsText, 10);
  if (!Number.isSafeInteger(minutes) || !Number.isSafeInteger(seconds)) return invalidFormat();
  if (seconds > 59) return { ok: false, reason: 'seconds-out-of-range' };

  const totalSeconds = minutes * 60 + seconds;
  if (!Number.isSafeInteger(totalSeconds)) return invalidFormat();
  if (totalSeconds <= 0) return { ok: false, reason: 'non-positive' };

  return {
    ok: true,
    totalSeconds,
    normalized: `${minutes}:${seconds.toString().padStart(2, '0')}`,
  };
};
