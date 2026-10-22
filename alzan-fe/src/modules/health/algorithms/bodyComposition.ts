/** Independent adult anthropometric estimates. Protocol eligibility is checked by the daily planner. */
import { MaleOrFemale } from '../../../types/requests.types';

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

/** BMI category */
export type BmiCategory = 'underweight' | 'normal' | 'overweight' | 'obese_1' | 'obese_2' | 'obese_3';

/** Body fat method used for calculation */

export type BodyFatMethod =
  | 'measured'
  | 'rfm'
  | 'bai'
  | 'cun_bae'
  | 'deurenberg'
  | 'stored'
  | 'whtr'
  | 'anthropometry_full'
  | 'bai_whtr_combined';

/** Muscle mass method used */
export type MuscleMethod = 'lee_et_al' | 'al_gindan' | 'stored' | 'anthropometric';

/** Body fat category */
export type BodyFatCategory = 'athletic' | 'fitness' | 'normal' | 'overweight' | 'obese';

/** Muscle category */
export type MuscleCategory = 'low' | 'normal' | 'fitness' | 'high' | 'very_high';

export type CompositionInputKey =
  | 'weight'
  | 'height'
  | 'age'
  | 'sex'
  | 'waist'
  | 'abdomen'
  | 'hips'
  | 'chest'
  | 'arm'
  | 'thigh'
  | 'storedBodyFat'
  | 'storedMuscleMass';

/** BMI Result */
export interface BmiResult {
  value: number;
  category: BmiCategory | null;
  adultCategoriesApplicable: boolean;
  categoryLabel: string;
}

/** Body Fat Result */
export interface BodyFatResult {
  percentage: number;
  category: BodyFatCategory | null;
  categoryLabel: string;
  method: BodyFatMethod;
  methodLabel: string;
  precisionLevel: 1 | 2 | 3;
  formulaUsed: string;
  inputsUsed: CompositionInputKey[];
}

/** Muscle Result */
export interface MuscleResult {
  percentage: number;
  massKg: number;
  category: MuscleCategory;
  categoryLabel: string;
  method: MuscleMethod;
  methodLabel: string;
  precisionLevel: 1 | 2 | 3;
  formulaUsed: string;
  inputsUsed: CompositionInputKey[];
}

/** Available measurements */
export interface AnthroMeasurements {
  waist?: number; // Iliac crest waist only; never substitute umbilical abdomen.
  armFlexed?: number; // Separate protocol; not an input for muscle estimates.
  hips?: number; // cadera
  abdomen?: number; // abdomen
  chest?: number; // pecho
  arm?: number; // brazo
  thigh?: number; // muslo
}

/** Input data for calculations */
export interface BodyCompositionInput {
  weightKg?: number | null;
  heightCm?: number | null;
  age?: number | null;
  sex?: MaleOrFemale | null;
  measurements?: AnthroMeasurements;
  loggedBodyFat?: number; // Medición directa
  loggedMuscleMass?: number; // Valor guardado
  loggedSource?: string;
}

/**
 * Data availability status for adaptive algorithms
 */
export interface BodyCompositionAvailableData {
  hasBasicData: boolean;
  hasAbdomen: boolean;
  hasHips: boolean;
  hasChest: boolean;
  hasArm: boolean;
  hasThigh: boolean;
  hasFullAnthropometry: boolean;
}

/** Complete body composition result */
export interface BodyCompositionResult {
  bmi: BmiResult | null;
  bodyFat: BodyFatResult | null;
  muscle: MuscleResult | null;
  fatMassKg: number | null;
  leanMassKg: number | null;
  muscleMassKg: number | null;
  residualMassKg: number | null;
  availableData: BodyCompositionAvailableData;
}

// ============================================================================
// CONSTANTS & HELPERS
// ============================================================================

const isPositiveFinite = (value: number | null | undefined): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0;

const clamp = (val: number, min: number, max: number): number => Math.max(min, Math.min(val, max));

const round1 = (val: number): number => parseFloat(val.toFixed(1));

const CUN_BAE_FORMULA =
  'CUN-BAE = -44.988 + 0.503 * age + 10.689 * female + 3.172 * BMI - 0.026 * BMI^2 + 0.181 * BMI * female - 0.02 * BMI * age - 0.005 * BMI^2 * female + 0.00021 * BMI^2 * age';
const RFM_MALE_FORMULA = 'RFM = 64 - 20 * (heightCm / waistCm)';
const RFM_FEMALE_FORMULA = 'RFM = 76 - 20 * (heightCm / waistCm)';
const BAI_FORMULA = 'BAI = (hipsCm / heightM^1.5) - 18';
const LEE_FORMULA = 'SMM = 0.244 * weightKg + 7.8 * heightM - 0.098 * age + 6.6 * male - 3.3';
const AL_GINDAN_MALE_FORMULA = 'SMM = 39.5 + 0.665 * weightKg - 0.185 * abdomenCm - 0.418 * hipsCm - 0.08 * age';
const AL_GINDAN_FEMALE_FORMULA = 'SMM = 2.89 + 0.255 * weightKg - 0.175 * hipsCm - 0.038 * age + 0.118 * heightCm';
const STORED_FORMULA = 'Stored value; original calculation method is not persisted.';

// ============================================================================
// VALIDATION RANGES
// ============================================================================
const MEASUREMENT_RANGES = {
  waist: { min: 40, max: 200, label: 'Cintura' },
  hips: { min: 50, max: 200, label: 'Cadera' },
  abdomen: { min: 40, max: 200, label: 'Abdomen' },
  chest: { min: 60, max: 200, label: 'Pecho' },
  thigh: { min: 30, max: 140, label: 'Muslo' },
  arm: { min: 15, max: 80, label: 'Brazo' },
};

const validateMeasurement = (value: number | undefined, range: { min: number; max: number; label: string }) => {
  if (!isPositiveFinite(value)) return undefined;
  if (value < range.min || value > range.max) {
    return undefined;
  }
  return value;
};

/** Use the same accepted ranges before selecting the newest measurement and before calculating. */
export const isValidCompositionMeasurement = (type: keyof AnthroMeasurements, value: number): boolean => {
  const range = type === 'armFlexed' ? MEASUREMENT_RANGES.arm : MEASUREMENT_RANGES[type];
  return validateMeasurement(value, range) !== undefined;
};

// ============================================================================
// BMI CALCULATIONS
// ============================================================================

/**
 * Calculate BMI with sex-specific category interpretation
 */
export const calculateBMI = (weightKg: number, heightCm: number, age: number | null = 20): BmiResult | null => {
  if (!isPositiveFinite(weightKg) || !isPositiveFinite(heightCm)) return null;

  const heightM = heightCm / 100;
  const bmi = weightKg / (heightM * heightM);
  if (!Number.isFinite(bmi)) return null;

  let category: BmiCategory;
  let categoryLabel: string;

  if (bmi < 18.5) {
    category = 'underweight';
    categoryLabel = 'Bajo peso';
  } else if (bmi < 25) {
    category = 'normal';
    categoryLabel = 'Normal';
  } else if (bmi < 30) {
    category = 'overweight';
    categoryLabel = 'Sobrepeso';
  } else if (bmi < 35) {
    category = 'obese_1';
    categoryLabel = 'Obesidad I';
  } else if (bmi < 40) {
    category = 'obese_2';
    categoryLabel = 'Obesidad II';
  } else {
    category = 'obese_3';
    categoryLabel = 'Obesidad III';
  }

  const adultCategoriesApplicable = isPositiveFinite(age) && age >= 20;
  return {
    value: round1(bmi),
    category: adultCategoriesApplicable ? category : null,
    categoryLabel: adultCategoriesApplicable ? categoryLabel : '',
    adultCategoriesApplicable,
  };
};

// ============================================================================
// BODY FAT CALCULATIONS
// ============================================================================

/**
 * RFM (Relative Fat Mass)
 * BF% = 64 - 20 * (height / iliac crest waist) + 12 * sex
 * sex: 0 = male, 1 = female
 * height and iliac crest waist in the same units (cm)
 */
export const calculateBodyFatRFM = (heightCm: number, waistCm: number, sex: MaleOrFemale): number => {
  if (!isPositiveFinite(heightCm) || !isPositiveFinite(waistCm)) return 0;

  const sexFactor = sex === 'female' ? 1 : 0;
  const rfm = 64 - 20 * (heightCm / waistCm) + 12 * sexFactor;

  return rfm;
};

/**
 * Body Adiposity Index (BAI) - Uses Hips and Height
 * Useful when Abdomen is not available but Hips is.
 * Formula: (Hips_cm / (Height_m ^ 1.5)) - 18
 */
export const calculateBodyFatBAI = (heightCm: number, hipsCm: number): number => {
  if (!hipsCm || hipsCm <= 0 || !heightCm || heightCm <= 0) return 0;

  const heightM = heightCm / 100;
  const bai = hipsCm / Math.pow(heightM, 1.5) - 18;

  return bai;
};

/**
 * CUN-BAE (Clínica Universidad de Navarra - Body Adiposity Estimator)
 * Best option when only BMI, Age, and Sex are available.
 * Formula: -44.988 + 0.503*age + 10.689*sex_female + 3.172*bmi - 0.026*bmi^2 + 0.181*bmi*sex_female - 0.02*bmi*age - 0.005*bmi^2*sex_female + 0.00021*bmi^2*age
 * sex_female: 1 = female, 0 = male
 */
export const calculateBodyFatCUNBAE = (bmi: number, age: number, sex: MaleOrFemale): number => {
  const isFemale = sex === 'female' ? 1 : 0;

  const bf =
    -44.988 +
    0.503 * age +
    10.689 * isFemale +
    3.172 * bmi -
    0.026 * Math.pow(bmi, 2) +
    0.181 * bmi * isFemale -
    0.02 * bmi * age -
    0.005 * Math.pow(bmi, 2) * isFemale +
    0.00021 * Math.pow(bmi, 2) * age;

  return bf;
};

// ============================================================================
// BODY FAT CATEGORY DETERMINATION
// ============================================================================

export const getBodyFatCategory = (bf: number, sex: MaleOrFemale): { category: BodyFatCategory; label: string } => {
  if (sex === 'male') {
    if (bf < 13) return { category: 'athletic', label: 'Atlético' };
    if (bf < 17) return { category: 'fitness', label: 'Fitness' };
    if (bf < 24) return { category: 'normal', label: 'Normal' };
    if (bf < 31) return { category: 'overweight', label: 'Sobrepeso' };
    return { category: 'obese', label: 'Obesidad' };
  } else {
    if (bf < 20) return { category: 'athletic', label: 'Atlética' };
    if (bf < 24) return { category: 'fitness', label: 'Fitness' };
    if (bf < 31) return { category: 'normal', label: 'Normal' };
    if (bf < 38) return { category: 'overweight', label: 'Sobrepeso' };
    return { category: 'obese', label: 'Obesidad' };
  }
};

// ============================================================================
// MUSCLE MASS CALCULATIONS
// ============================================================================

/**
 * Lee et al. formula (Basic)
 * SMM = 0.244 * weight + 7.80 * height(m) - 0.098 * age + 6.6 * sex - 3.3
 * sex: 1 = male, 0 = female
 */
export const calculateMuscleMassLee = (weightKg: number, heightCm: number, age: number, sex: MaleOrFemale): number => {
  const heightM = heightCm / 100;
  const sexFactor = sex === 'male' ? 1 : 0;

  const smm = 0.244 * weightKg + 7.8 * heightM - 0.098 * age + 6.6 * sexFactor - 3.3;

  return clamp(smm, 10, 80);
};

/**
 * Al-Gindan et al. (2014) - MRI Validated
 * Men: SM = 39.5 + 0.665 * weight - 0.185 * abdomen - 0.418 * hips - 0.08 * age
 * Women: SM = 2.89 + 0.255 * weight - 0.175 * hips - 0.038 * age + 0.118 * height
 */
export const calculateMuscleMassAlGindan = (
  weightKg: number,
  heightCm: number,
  age: number,
  sex: MaleOrFemale,
  abdomenCm: number,
  hipsCm: number,
): number => {
  let smm: number;

  if (sex === 'male') {
    smm = 39.5 + 0.665 * weightKg - 0.185 * abdomenCm - 0.418 * hipsCm - 0.08 * age;
  } else {
    // Note: Formula uses height in cm according to usual anthropometric formulas of this type,
    // but verifying context: "0.118 * altura" -> likely cm given the coefficient size.
    smm = 2.89 + 0.255 * weightKg - 0.175 * hipsCm - 0.038 * age + 0.118 * heightCm;
  }

  return clamp(smm, 10, 80);
};

// ============================================================================
// MUSCLE CATEGORY DETERMINATION
// ============================================================================

export const getMuscleCategory = (
  musclePercent: number,
  sex: MaleOrFemale,
): { category: MuscleCategory; label: string } => {
  if (sex === 'male') {
    if (musclePercent < 38) return { category: 'low', label: 'Bajo' };
    if (musclePercent < 42) return { category: 'normal', label: 'Normal' };
    if (musclePercent < 48) return { category: 'fitness', label: 'Fitness' };
    if (musclePercent < 55) return { category: 'high', label: 'Alto' };
    return { category: 'very_high', label: 'Muy Alto' };
  } else {
    if (musclePercent < 30) return { category: 'low', label: 'Bajo' };
    if (musclePercent < 35) return { category: 'normal', label: 'Normal' };
    if (musclePercent < 42) return { category: 'fitness', label: 'Fitness' };
    if (musclePercent < 50) return { category: 'high', label: 'Alto' };
    return { category: 'very_high', label: 'Muy Alto' };
  }
};

// ============================================================================
// MAIN ADAPTIVE CALCULATION FUNCTION
// ============================================================================

/**
 * Main function that calculates all body composition metrics
 * Automatically selects the most accurate algorithm based on available data
 */
export const calculateBodyComposition = (input: BodyCompositionInput): BodyCompositionResult => {
  const { weightKg, heightCm, age, sex, measurements = {} } = input;

  const waist = validateMeasurement(measurements.waist, MEASUREMENT_RANGES.waist);
  const abdomen = validateMeasurement(measurements.abdomen, MEASUREMENT_RANGES.abdomen);
  const hips = validateMeasurement(measurements.hips, MEASUREMENT_RANGES.hips);
  const chest = validateMeasurement(measurements.chest, MEASUREMENT_RANGES.chest);
  const arm = validateMeasurement(measurements.arm, MEASUREMENT_RANGES.arm);
  const thigh = validateMeasurement(measurements.thigh, MEASUREMENT_RANGES.thigh);
  const hasBmiData = isPositiveFinite(weightKg) && isPositiveFinite(heightCm);
  const hasSex = sex === 'male' || sex === 'female';
  const isAdult = isPositiveFinite(age) && age >= 20;
  const hasCompositionData = hasBmiData && isAdult && hasSex;
  const availableData = {
    hasBasicData: hasBmiData,
    hasAbdomen: !!abdomen,
    hasHips: !!hips,
    hasChest: !!chest,
    hasArm: !!arm,
    hasThigh: !!thigh,
    hasFullAnthropometry: !!(abdomen && hips),
  };
  const bmi = hasBmiData ? calculateBMI(weightKg, heightCm, age ?? null) : null;
  let bodyFat: BodyFatResult | null = null;
  const describeBodyFat = (
    percentage: number,
    method: BodyFatMethod,
    methodLabel: string,
    precisionLevel: 1 | 2 | 3,
    formulaUsed: string,
    inputsUsed: CompositionInputKey[],
  ): BodyFatResult | null => {
    if (!Number.isFinite(percentage) || percentage <= 0 || percentage >= 100) return null;
    const classification = hasSex ? getBodyFatCategory(percentage, sex) : null;
    return {
      percentage: round1(percentage),
      category: classification?.category ?? null,
      categoryLabel: classification?.label ?? '',
      method,
      methodLabel,
      precisionLevel,
      formulaUsed,
      inputsUsed,
    };
  };
  // Direct observations remain available independently of anthropometric inputs.
  if (isPositiveFinite(input.loggedBodyFat) && input.loggedBodyFat < 100) {
    const imported = !!input.loggedSource && input.loggedSource !== 'manual';
    bodyFat = describeBodyFat(
      input.loggedBodyFat,
      imported ? 'measured' : 'stored',
      imported ? 'Medición importada/externa' : 'Valor guardado',
      imported ? 3 : 1,
      STORED_FORMULA,
      ['storedBodyFat'],
    );
  } else if (isPositiveFinite(heightCm) && isAdult) {
    if (waist && hasSex) {
      bodyFat = describeBodyFat(
        calculateBodyFatRFM(heightCm, waist, sex),
        'rfm',
        'RFM (Woolcott & Bergman 2018)',
        3,
        sex === 'male' ? RFM_MALE_FORMULA : RFM_FEMALE_FORMULA,
        ['height', 'sex', 'waist'],
      );
    }
    if (!bodyFat && hasCompositionData) {
      const rawBmi = weightKg / (heightCm / 100) ** 2;
      bodyFat = describeBodyFat(
        calculateBodyFatCUNBAE(rawBmi, age, sex),
        'cun_bae',
        'CUN-BAE (Gómez-Ambrosi et al. 2012)',
        2,
        CUN_BAE_FORMULA,
        ['weight', 'height', 'age', 'sex'],
      );
    }
    if (!bodyFat && hips) {
      bodyFat = describeBodyFat(
        calculateBodyFatBAI(heightCm, hips),
        'bai',
        'BAI (Fallback con cadera)',
        1,
        BAI_FORMULA,
        ['height', 'hips'],
      );
    }
  }

  // =========================================================================
  // 3. CALCULATE MASS BREAKDOWN
  // =========================================================================
  let fatMassKg: number | null = null;
  let leanMassKg: number | null = null;

  if (bodyFat && isPositiveFinite(weightKg)) {
    fatMassKg = round1(weightKg * (bodyFat.percentage / 100));
    leanMassKg = round1(weightKg - fatMassKg);
  }

  // =========================================================================
  // 4. CALCULATE MUSCLE MASS
  // Scenario A: Lee et al.
  // Scenario B: Al-Gindan et al. (Requires Abdomen/Hips)
  // =========================================================================
  let muscle: MuscleResult | null = null;
  let muscleMassKg: number | null = null;

  // Use Al-Gindan only when both app-supported key measurements are available.
  const canUseAlGindan = !!(abdomen && hips);

  if (hasCompositionData && isPositiveFinite(input.loggedMuscleMass)) {
    // PRIORITY 0: Use logged/stored muscle mass if available
    const musclePercent = round1((input.loggedMuscleMass / weightKg) * 100);
    const { category, label } = getMuscleCategory(musclePercent, sex);

    muscleMassKg = round1(input.loggedMuscleMass);
    muscle = {
      percentage: musclePercent,
      massKg: muscleMassKg,
      category,
      categoryLabel: label,
      method: 'stored',
      methodLabel: 'Valor guardado',
      precisionLevel: 1,
      formulaUsed: STORED_FORMULA,
      inputsUsed: ['storedMuscleMass'],
    };
  } else if (hasCompositionData && canUseAlGindan) {
    // Scenario B3: Al-Gindan et al.
    const abdomenVal = abdomen || 0;
    const hipVal = hips!; // guaranteed by check above

    const smm = calculateMuscleMassAlGindan(weightKg, heightCm, age, sex, abdomenVal, hipVal);
    const musclePercent = round1((smm / weightKg) * 100);
    const { category, label } = getMuscleCategory(musclePercent, sex);
    muscleMassKg = round1(smm);
    muscle = {
      percentage: musclePercent,
      massKg: muscleMassKg,
      category,
      categoryLabel: label,
      method: 'al_gindan',
      methodLabel: 'Al-Gindan et al. (2014)',
      precisionLevel: 3,
      formulaUsed: sex === 'male' ? AL_GINDAN_MALE_FORMULA : AL_GINDAN_FEMALE_FORMULA,
      inputsUsed:
        sex === 'male' ? ['weight', 'age', 'sex', 'abdomen', 'hips'] : ['weight', 'height', 'age', 'sex', 'hips'],
    };
  } else if (hasCompositionData) {
    // Scenario A3: Lee et al. (Basic Fallback)
    const smm = calculateMuscleMassLee(weightKg, heightCm, age, sex);
    const musclePercent = round1((smm / weightKg) * 100);
    const { category, label } = getMuscleCategory(musclePercent, sex);
    muscleMassKg = round1(smm);
    muscle = {
      percentage: musclePercent,
      massKg: muscleMassKg,
      category,
      categoryLabel: label,
      method: 'lee_et_al',
      methodLabel: 'Lee et al. (2000)',
      precisionLevel: 2,
      formulaUsed: LEE_FORMULA,
      inputsUsed: ['weight', 'height', 'age', 'sex'],
    };
  }

  // Calculate Residual (Bone, Water, Organs)
  let residualMassKg: number | null = null;
  if (leanMassKg !== null && muscleMassKg !== null) {
    residualMassKg = round1(Math.max(0, leanMassKg - muscleMassKg));
  }

  return {
    bmi,
    bodyFat,
    muscle,
    fatMassKg,
    leanMassKg,
    muscleMassKg,
    residualMassKg,
    availableData,
  };
};

// ============================================================================
// UTILITY EXPORTS
// ============================================================================

export const hasEnoughDataForBmi = (weightKg?: number, heightCm?: number): boolean =>
  isPositiveFinite(weightKg) && isPositiveFinite(heightCm);

export const hasEnoughDataForBodyFat = (
  weightKg?: number,
  heightCm?: number,
  age?: number | null,
  sex?: string | null,
  hipCm?: number,
  loggedBodyFat?: number | null,
  waistCm?: number,
): boolean => {
  if (isPositiveFinite(loggedBodyFat) && loggedBodyFat < 100) return true;
  if (!isPositiveFinite(heightCm) || !isPositiveFinite(age) || age < 20) return false;
  const hasSex = sex === 'male' || sex === 'female';
  return !!(
    (hasSex && validateMeasurement(waistCm, MEASUREMENT_RANGES.waist)) ||
    (isPositiveFinite(weightKg) && isPositiveFinite(age) && hasSex) ||
    validateMeasurement(hipCm, MEASUREMENT_RANGES.hips)
  );
};
