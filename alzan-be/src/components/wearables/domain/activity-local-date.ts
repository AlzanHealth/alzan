export interface ActivityLocalDateInput {
  startTime: string | null;
  startedAtLocal?: string | null;
  timezone?: string | null;
}

const ISO_DATE_PREFIX = /^(\d{4}-\d{2}-\d{2})/;
const FIXED_OFFSET = /^([+-])(\d{2}):(\d{2})$/;

export function resolveActivityLocalDate(input: ActivityLocalDateInput): string | null {
  const explicitLocalDate = input.startedAtLocal?.match(ISO_DATE_PREFIX)?.[1];
  if (explicitLocalDate) return explicitLocalDate;
  if (!input.startTime) return null;
  const timestamp = Date.parse(input.startTime);
  if (!Number.isFinite(timestamp)) return null;

  const fixedOffset = input.timezone?.match(FIXED_OFFSET);
  if (fixedOffset) {
    const direction = fixedOffset[1] === '-' ? -1 : 1;
    const offsetMinutes = direction * (Number(fixedOffset[2]) * 60 + Number(fixedOffset[3]));
    return new Date(timestamp + offsetMinutes * 60_000).toISOString().slice(0, 10);
  }

  if (input.timezone) {
    try {
      const parts = new Intl.DateTimeFormat('en', {
        timeZone: input.timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).formatToParts(new Date(timestamp));
      const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
      if (values.year && values.month && values.day) return `${values.year}-${values.month}-${values.day}`;
    } catch {
      // Invalid legacy timezones fall back to the UTC calendar date.
    }
  }

  return new Date(timestamp).toISOString().slice(0, 10);
}
