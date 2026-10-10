export type HeartRateZone = { zone: 1 | 2 | 3 | 4 | 5; min: number; max: number };
export type HeartRateZoneMethod = 'tanaka' | 'karvonen' | 'manual' | 'measured';
export type HeartRateZoneProfile = {
  maxHeartRate: number;
  restingHeartRate?: number;
  restingHeartRateSampleCount?: number;
  zones: HeartRateZone[];
  method: HeartRateZoneMethod;
  source: 'age_estimate' | 'user_entered' | 'measured_thresholds';
  updatedAt: string;
};

export type HeartRateZoneValidationError = 'incomplete' | 'invalid' | 'overlap' | 'gap';
export type RestingHeartRateBaseline = { bpm: number; sampleCount: number };
export type HeartRateSessionEvidence = { sessionId: string; values: number[]; maxHeartRate?: number | null };
export type HeartRateTrainingEvidence = {
  sessionCount: number;
  observedPeak: number | null;
  repeatablePeak: number | null;
  qualifiesForReview: boolean;
};

export const HEART_RATE_ZONE_COLORS = ['#53C8F5', '#35C96F', '#FFD34F', '#FF8C5B', '#F04452'] as const;

export const HEART_RATE_ZONE_DESCRIPTIONS = [
  { key: 'recovery', percent: 'under60' },
  { key: 'aerobic', percent: '60to70' },
  { key: 'tempo', percent: '70to80' },
  { key: 'threshold', percent: '80to90' },
  { key: 'vo2', percent: '90to100' },
] as const;

const HEART_RATE_ZONE_DESCRIPTION_KEYS = [
  'training.heartRateZoneRecovery',
  'training.heartRateZoneAerobic',
  'training.heartRateZoneTempo',
  'training.heartRateZoneThreshold',
  'training.heartRateZoneVo2',
] as const;

const HEART_RATE_ZONE_PERCENT_KEYS = [
  'training.heartRateZonePercentUnder60',
  'training.heartRateZonePercent60to70',
  'training.heartRateZonePercent70to80',
  'training.heartRateZonePercent80to90',
  'training.heartRateZonePercent90to100',
] as const;
const HEART_RATE_RESERVE_ZONE_PERCENT_KEYS = [
  'training.heartRateReservePercent50to60',
  'training.heartRateZonePercent60to70',
  'training.heartRateZonePercent70to80',
  'training.heartRateZonePercent80to90',
  'training.heartRateZonePercent90to100',
] as const;

export const getHeartRateZoneDescriptionKey = (zone: HeartRateZone['zone']) => {
  return HEART_RATE_ZONE_DESCRIPTION_KEYS[zone - 1];
};

export const getHeartRateZonePercentKey = (zone: HeartRateZone['zone']) => {
  return HEART_RATE_ZONE_PERCENT_KEYS[zone - 1];
};

export const getHeartRateReserveZonePercentKey = (zone: HeartRateZone['zone']) => {
  return HEART_RATE_RESERVE_ZONE_PERCENT_KEYS[zone - 1];
};

export const parseHeartRateInput = (value: string): number | null => {
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const parsed = Number(trimmed);
  return Number.isSafeInteger(parsed) ? parsed : null;
};

export const calculateRestingHeartRateBaseline = (readings: number[]): RestingHeartRateBaseline | null => {
  const validReadings = readings.filter(value => Number.isInteger(value) && value >= 30 && value <= 150).slice(0, 7);
  if (validReadings.length === 0) return null;
  const sortedReadings = validReadings.slice().sort((left, right) => left - right);
  const middle = Math.floor(sortedReadings.length / 2);
  const bpm =
    sortedReadings.length % 2 === 0
      ? Math.round((sortedReadings[middle - 1] + sortedReadings[middle]) / 2)
      : sortedReadings[middle];
  return { bpm, sampleCount: validReadings.length };
};

/**
 * Summarizes recent exercise HR as observational evidence, never as a physiological max.
 * A session peak is considered sustained only when at least 3 samples sit within 5 bpm of it;
 * a qualifying peak must recur within 5 bpm on a separate session.
 */
export const analyzeRecentHeartRateSessions = (
  sessions: HeartRateSessionEvidence[],
  configuredMaximum?: number,
): HeartRateTrainingEvidence => {
  const sessionPeaks = sessions
    .map(session => {
      const values = session.values.filter(value => Number.isInteger(value) && value >= 40 && value <= 250);
      const peak = values.length > 0 ? Math.max(...values) : null;
      const summary = session.maxHeartRate;
      return {
        sessionId: session.sessionId,
        peak:
          peak ??
          (Number.isInteger(summary) && Number(summary) >= 40 && Number(summary) <= 250 ? Number(summary) : null),
        sustained: peak !== null && values.filter(value => value >= peak - 5).length >= 3,
      };
    })
    .filter((session): session is { sessionId: string; peak: number; sustained: boolean } => session.peak !== null);
  const sortedPeaks = sessionPeaks.map(session => session.peak).sort((a, b) => b - a);
  const observedPeak = sortedPeaks[0] ?? null;
  const repeatablePeak =
    sessionPeaks.find(
      candidate =>
        candidate.sustained &&
        sessionPeaks.some(
          other =>
            other.sustained && other.sessionId !== candidate.sessionId && Math.abs(candidate.peak - other.peak) <= 5,
        ),
    )?.peak ?? null;
  const sustainedSessionCount = sessionPeaks.filter(session => session.sustained).length;
  const qualifiesForReview =
    configuredMaximum !== undefined &&
    repeatablePeak !== null &&
    sustainedSessionCount >= 2 &&
    repeatablePeak > configuredMaximum + 5;
  return { sessionCount: sessionPeaks.length, observedPeak, repeatablePeak, qualifiesForReview };
};

export const getAgeOnDate = (dateOfBirth: string | null | undefined, referenceDate: Date): number | null => {
  if (!dateOfBirth || !/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth)) return null;
  const [year, month, day] = dateOfBirth.split('-').map(Number);
  const birthDate = new Date(year, month - 1, day);
  if (
    birthDate.getFullYear() !== year ||
    birthDate.getMonth() !== month - 1 ||
    birthDate.getDate() !== day ||
    birthDate > referenceDate
  ) {
    return null;
  }
  let age = referenceDate.getFullYear() - year;
  if (
    referenceDate.getMonth() < month - 1 ||
    (referenceDate.getMonth() === month - 1 && referenceDate.getDate() < day)
  ) {
    age -= 1;
  }
  return age;
};

export const calculateHeartRateZones = (age: number) => {
  if (!Number.isInteger(age) || age < 18 || age > 81) return null;
  const maxHeartRate = Math.round(208 - 0.7 * age);
  return calculateZonesFromMaxHeartRate(maxHeartRate);
};

export const calculateZonesFromMaxHeartRate = (maxHeartRate: number) => {
  if (!Number.isInteger(maxHeartRate) || maxHeartRate < 60 || maxHeartRate > 250) return null;
  const lowerBounds = [0, 0.6, 0.7, 0.8, 0.9];
  const upperBounds = [0.6, 0.7, 0.8, 0.9, 1];
  const zones = lowerBounds.map((lower, index) => ({
    zone: (index + 1) as HeartRateZone['zone'],
    min: index === 0 ? 0 : Math.round(maxHeartRate * lower) + 1,
    max: index === 4 ? maxHeartRate : Math.round(maxHeartRate * upperBounds[index]),
  }));
  return { maxHeartRate, zones };
};

export const calculateHeartRateZonesFromReserve = (maxHeartRate: number, restingHeartRate: number) => {
  if (
    !Number.isInteger(maxHeartRate) ||
    !Number.isInteger(restingHeartRate) ||
    maxHeartRate < 60 ||
    maxHeartRate > 250 ||
    restingHeartRate < 30 ||
    restingHeartRate >= maxHeartRate
  ) {
    return null;
  }
  const reserve = maxHeartRate - restingHeartRate;
  const bounds = [0.5, 0.6, 0.7, 0.8, 0.9, 1];
  const zones = bounds.slice(0, 5).map((lower, index) => ({
    zone: (index + 1) as HeartRateZone['zone'],
    min: Math.max(restingHeartRate + 1, Math.round(restingHeartRate + reserve * lower)),
    max: Math.round(restingHeartRate + reserve * bounds[index + 1]),
  }));
  zones[1].min = zones[0].max + 1;
  zones[2].min = zones[1].max + 1;
  zones[3].min = zones[2].max + 1;
  zones[4].min = zones[3].max + 1;
  return validateHeartRateZones(zones) ? null : { maxHeartRate, restingHeartRate, zones };
};

export const validateHeartRateZones = (zones: HeartRateZone[]): HeartRateZoneValidationError | null => {
  if (zones.length !== 5) return 'incomplete';
  if (zones.some(zone => zone.max === 0)) return 'incomplete';
  for (let index = 0; index < zones.length; index += 1) {
    const current = zones[index];
    if (
      current.zone !== index + 1 ||
      !Number.isInteger(current.min) ||
      !Number.isInteger(current.max) ||
      current.min < 0 ||
      current.max > 250 ||
      current.max <= current.min
    ) {
      return 'invalid';
    }
    if (index > 0) {
      const previous = zones[index - 1];
      if (current.min <= previous.max) return 'overlap';
      if (current.min !== previous.max + 1) return 'gap';
    }
  }
  return null;
};

export const parseHeartRateZoneProfile = (value: unknown): HeartRateZoneProfile | null => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const candidate = value as Partial<HeartRateZoneProfile>;
  if (
    typeof candidate.maxHeartRate !== 'number' ||
    !Number.isInteger(candidate.maxHeartRate) ||
    candidate.maxHeartRate < 60 ||
    candidate.maxHeartRate > 250 ||
    !Array.isArray(candidate.zones) ||
    validateHeartRateZones(candidate.zones) ||
    !['tanaka', 'karvonen', 'manual', 'measured'].includes(String(candidate.method)) ||
    !['age_estimate', 'user_entered', 'measured_thresholds'].includes(String(candidate.source)) ||
    typeof candidate.updatedAt !== 'string' ||
    (candidate.restingHeartRate !== undefined &&
      (!Number.isInteger(candidate.restingHeartRate) ||
        candidate.restingHeartRate < 30 ||
        candidate.restingHeartRate >= candidate.maxHeartRate)) ||
    (candidate.restingHeartRateSampleCount !== undefined &&
      (!Number.isInteger(candidate.restingHeartRateSampleCount) ||
        candidate.restingHeartRateSampleCount < 1 ||
        candidate.restingHeartRateSampleCount > 7)) ||
    (candidate.method === 'karvonen' && candidate.restingHeartRate === undefined) ||
    Number(candidate.zones[4]?.max) !== candidate.maxHeartRate
  ) {
    return null;
  }
  return candidate as HeartRateZoneProfile;
};
