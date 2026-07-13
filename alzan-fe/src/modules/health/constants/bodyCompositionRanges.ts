/**
 * Reference ranges used consistently by detail and statistics views.
 * BMI uses WHO classification. Body-fat and muscle tables are product reference
 * ranges and must be presented as orientative, not diagnostic.
 */

// ============================================================================
// TYPES
// ============================================================================

export type RangeCategory = {
  label: string;
  labelEs: string;
  min: number;
  max: number;
  color: string;
};

export type AgeGroup = '18-20' | '21-25' | '26-30' | '31-35' | '36-40' | '41-45' | '46-50' | '51-55' | '56-60' | '61+';
export type MuscleAgeGroup = '18-39' | '40-59' | '60-80';

export const RANGE_PROVENANCE = {
  bmi: 'WHO BMI classification',
  bodyFat: 'Orientative age- and sex-specific product reference ranges',
  muscle: 'Orientative age- and sex-specific product reference ranges',
} as const;

// ============================================================================
// 1. BMI RANGES (WHO Classification)
// ============================================================================

export const BMI_RANGES: RangeCategory[] = [
  { label: 'Underweight', labelEs: 'Bajo peso', min: 0, max: 18.49, color: '#7EC8FF' },
  { label: 'Normal', labelEs: 'Normal', min: 18.5, max: 24.99, color: '#4CAF50' },
  { label: 'Overweight', labelEs: 'Sobrepeso', min: 25, max: 29.99, color: '#FFA726' },
  { label: 'Obese', labelEs: 'Obesidad', min: 30, max: 60, color: '#EF5350' },
];

export const BMI_BAR_CONFIG = {
  min: 10,
  max: 40,
  cutoffLabels: [18.5, 25, 30],
};

// ============================================================================
// 2. BODY FAT RANGES (Age & Sex Specific)
// ============================================================================

const BODY_FAT_COLORS = {
  veryLow: '#5856D6', // Purple (undesirable)
  low: '#4DA3FF', // Blue
  normal: '#34C759', // Green (optimal)
  high: '#FF9500', // Orange
  veryHigh: '#FF3B30', // Red
};

export type BodyFatAgeGroup = '20-39' | '40-59' | '60-79';

// Male Body Fat Ranges by Age
export const BODY_FAT_MALE: Record<BodyFatAgeGroup, RangeCategory[]> = {
  '20-39': [
    { label: 'Very Low', labelEs: 'Muy bajo', min: 0, max: 4.9, color: BODY_FAT_COLORS.veryLow },
    { label: 'Low', labelEs: 'Bajo', min: 5.0, max: 7.9, color: BODY_FAT_COLORS.low },
    { label: 'Normal', labelEs: 'Normal', min: 8.0, max: 19.9, color: BODY_FAT_COLORS.normal },
    { label: 'High', labelEs: 'Alto', min: 20.0, max: 24.9, color: BODY_FAT_COLORS.high },
    { label: 'Very High', labelEs: 'Muy alto', min: 25.0, max: 60, color: BODY_FAT_COLORS.veryHigh },
  ],
  '40-59': [
    { label: 'Very Low', labelEs: 'Muy bajo', min: 0, max: 7.9, color: BODY_FAT_COLORS.veryLow },
    { label: 'Low', labelEs: 'Bajo', min: 8.0, max: 10.9, color: BODY_FAT_COLORS.low },
    { label: 'Normal', labelEs: 'Normal', min: 11.0, max: 21.9, color: BODY_FAT_COLORS.normal },
    { label: 'High', labelEs: 'Alto', min: 22.0, max: 27.9, color: BODY_FAT_COLORS.high },
    { label: 'Very High', labelEs: 'Muy alto', min: 28.0, max: 60, color: BODY_FAT_COLORS.veryHigh },
  ],
  '60-79': [
    { label: 'Very Low', labelEs: 'Muy bajo', min: 0, max: 9.9, color: BODY_FAT_COLORS.veryLow },
    { label: 'Low', labelEs: 'Bajo', min: 10.0, max: 12.9, color: BODY_FAT_COLORS.low },
    { label: 'Normal', labelEs: 'Normal', min: 13.0, max: 24.9, color: BODY_FAT_COLORS.normal },
    { label: 'High', labelEs: 'Alto', min: 25.0, max: 29.9, color: BODY_FAT_COLORS.high },
    { label: 'Very High', labelEs: 'Muy alto', min: 30.0, max: 60, color: BODY_FAT_COLORS.veryHigh },
  ],
};

// Female Body Fat Ranges by Age
export const BODY_FAT_FEMALE: Record<BodyFatAgeGroup, RangeCategory[]> = {
  '20-39': [
    { label: 'Very Low', labelEs: 'Muy bajo', min: 0, max: 16.9, color: BODY_FAT_COLORS.veryLow },
    { label: 'Low', labelEs: 'Bajo', min: 17.0, max: 20.9, color: BODY_FAT_COLORS.low },
    { label: 'Normal', labelEs: 'Normal', min: 21.0, max: 32.9, color: BODY_FAT_COLORS.normal },
    { label: 'High', labelEs: 'Alto', min: 33.0, max: 38.9, color: BODY_FAT_COLORS.high },
    { label: 'Very High', labelEs: 'Muy alto', min: 39.0, max: 60, color: BODY_FAT_COLORS.veryHigh },
  ],
  '40-59': [
    { label: 'Very Low', labelEs: 'Muy bajo', min: 0, max: 18.9, color: BODY_FAT_COLORS.veryLow },
    { label: 'Low', labelEs: 'Bajo', min: 19.0, max: 22.9, color: BODY_FAT_COLORS.low },
    { label: 'Normal', labelEs: 'Normal', min: 23.0, max: 33.9, color: BODY_FAT_COLORS.normal },
    { label: 'High', labelEs: 'Alto', min: 34.0, max: 39.9, color: BODY_FAT_COLORS.high },
    { label: 'Very High', labelEs: 'Muy alto', min: 40.0, max: 60, color: BODY_FAT_COLORS.veryHigh },
  ],
  '60-79': [
    { label: 'Very Low', labelEs: 'Muy bajo', min: 0, max: 19.9, color: BODY_FAT_COLORS.veryLow },
    { label: 'Low', labelEs: 'Bajo', min: 20.0, max: 23.9, color: BODY_FAT_COLORS.low },
    { label: 'Normal', labelEs: 'Normal', min: 24.0, max: 35.9, color: BODY_FAT_COLORS.normal },
    { label: 'High', labelEs: 'Alto', min: 36.0, max: 41.9, color: BODY_FAT_COLORS.high },
    { label: 'Very High', labelEs: 'Muy alto', min: 42.0, max: 60, color: BODY_FAT_COLORS.veryHigh },
  ],
};

export const BODY_FAT_BAR_CONFIG = {
  min: 5,
  max: 45,
};

// ============================================================================
// 3. MUSCLE MASS RANGES (Omron Healthcare)
// ============================================================================

const MUSCLE_COLORS = {
  veryLow: '#B00020', // Dark Red (worst)
  low: '#FF3B30', // Red
  normal: '#34C759', // Green
  high: '#0A84FF', // Blue (good)
  veryHigh: '#5856D6', // Purple (best)
};

// Male Muscle Mass Ranges by Age
export const MUSCLE_MALE: Record<MuscleAgeGroup, RangeCategory[]> = {
  '18-39': [
    { label: 'Very Low', labelEs: 'Muy bajo', min: 0, max: 31.0, color: MUSCLE_COLORS.veryLow },
    { label: 'Low', labelEs: 'Bajo', min: 31.1, max: 33.2, color: MUSCLE_COLORS.low },
    { label: 'Normal', labelEs: 'Normal', min: 33.3, max: 39.3, color: MUSCLE_COLORS.normal },
    { label: 'High', labelEs: 'Alto', min: 39.4, max: 44.0, color: MUSCLE_COLORS.high },
    { label: 'Very High', labelEs: 'Muy alto', min: 44.1, max: 70, color: MUSCLE_COLORS.veryHigh },
  ],
  '40-59': [
    { label: 'Very Low', labelEs: 'Muy bajo', min: 0, max: 30.8, color: MUSCLE_COLORS.veryLow },
    { label: 'Low', labelEs: 'Bajo', min: 30.9, max: 33.0, color: MUSCLE_COLORS.low },
    { label: 'Normal', labelEs: 'Normal', min: 33.1, max: 39.1, color: MUSCLE_COLORS.normal },
    { label: 'High', labelEs: 'Alto', min: 39.2, max: 43.8, color: MUSCLE_COLORS.high },
    { label: 'Very High', labelEs: 'Muy alto', min: 43.9, max: 70, color: MUSCLE_COLORS.veryHigh },
  ],
  '60-80': [
    { label: 'Very Low', labelEs: 'Muy bajo', min: 0, max: 30.6, color: MUSCLE_COLORS.veryLow },
    { label: 'Low', labelEs: 'Bajo', min: 30.7, max: 32.8, color: MUSCLE_COLORS.low },
    { label: 'Normal', labelEs: 'Normal', min: 32.9, max: 38.9, color: MUSCLE_COLORS.normal },
    { label: 'High', labelEs: 'Alto', min: 39.0, max: 43.6, color: MUSCLE_COLORS.high },
    { label: 'Very High', labelEs: 'Muy alto', min: 43.7, max: 70, color: MUSCLE_COLORS.veryHigh },
  ],
};

// Female Muscle Mass Ranges by Age
export const MUSCLE_FEMALE: Record<MuscleAgeGroup, RangeCategory[]> = {
  '18-39': [
    { label: 'Very Low', labelEs: 'Muy bajo', min: 0, max: 22.0, color: MUSCLE_COLORS.veryLow },
    { label: 'Low', labelEs: 'Bajo', min: 22.1, max: 24.2, color: MUSCLE_COLORS.low },
    { label: 'Normal', labelEs: 'Normal', min: 24.3, max: 30.3, color: MUSCLE_COLORS.normal },
    { label: 'High', labelEs: 'Alto', min: 30.4, max: 35.3, color: MUSCLE_COLORS.high },
    { label: 'Very High', labelEs: 'Muy alto', min: 35.4, max: 70, color: MUSCLE_COLORS.veryHigh },
  ],
  '40-59': [
    { label: 'Very Low', labelEs: 'Muy bajo', min: 0, max: 21.8, color: MUSCLE_COLORS.veryLow },
    { label: 'Low', labelEs: 'Bajo', min: 21.9, max: 24.0, color: MUSCLE_COLORS.low },
    { label: 'Normal', labelEs: 'Normal', min: 24.1, max: 30.1, color: MUSCLE_COLORS.normal },
    { label: 'High', labelEs: 'Alto', min: 30.2, max: 35.1, color: MUSCLE_COLORS.high },
    { label: 'Very High', labelEs: 'Muy alto', min: 35.2, max: 70, color: MUSCLE_COLORS.veryHigh },
  ],
  '60-80': [
    { label: 'Very Low', labelEs: 'Muy bajo', min: 0, max: 21.6, color: MUSCLE_COLORS.veryLow },
    { label: 'Low', labelEs: 'Bajo', min: 21.7, max: 23.8, color: MUSCLE_COLORS.low },
    { label: 'Normal', labelEs: 'Normal', min: 23.9, max: 29.9, color: MUSCLE_COLORS.normal },
    { label: 'High', labelEs: 'Alto', min: 30.0, max: 34.9, color: MUSCLE_COLORS.high },
    { label: 'Very High', labelEs: 'Muy alto', min: 35.0, max: 70, color: MUSCLE_COLORS.veryHigh },
  ],
};

export const MUSCLE_BAR_CONFIG = {
  maleMin: 25,
  maleMax: 55,
  femaleMin: 18,
  femaleMax: 45,
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get the age group for body fat ranges
 */
export function getBodyFatAgeGroup(age: number): BodyFatAgeGroup {
  if (age < 40) return '20-39';
  if (age < 60) return '40-59';
  return '60-79';
}

/**
 * Get the age group for muscle mass ranges
 */
export function getMuscleAgeGroup(age: number): MuscleAgeGroup {
  if (age <= 39) return '18-39';
  if (age <= 59) return '40-59';
  return '60-80';
}

/**
 * Get body fat ranges for a specific age and sex
 */
export function getBodyFatRanges(age: number, isFemale: boolean): RangeCategory[] {
  const ageGroup = getBodyFatAgeGroup(age);
  return isFemale ? BODY_FAT_FEMALE[ageGroup] : BODY_FAT_MALE[ageGroup];
}

/**
 * Get muscle mass ranges for a specific age and sex
 */
export function getMuscleRanges(age: number, isFemale: boolean): RangeCategory[] {
  const ageGroup = getMuscleAgeGroup(age);
  return isFemale ? MUSCLE_FEMALE[ageGroup] : MUSCLE_MALE[ageGroup];
}

/**
 * Find which category a value falls into
 */
export function findCategory(value: number, ranges: RangeCategory[]): RangeCategory | undefined {
  return ranges.find(r => value >= r.min && value <= r.max);
}

/**
 * Convert RangeCategory[] to RangeBar segments format
 */
export function toBarSegments(
  ranges: RangeCategory[],
  useSpanish = true,
): { to: number; color: string; label: string }[] {
  return ranges.map(r => ({
    to: r.max,
    color: r.color,
    label: useSpanish ? r.labelEs : r.label,
  }));
}
