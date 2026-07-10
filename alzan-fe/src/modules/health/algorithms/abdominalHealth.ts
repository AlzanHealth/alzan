import { MaleOrFemale } from '../../../types/requests.types';
import { AnthroMeasurements, CompositionInputKey } from './bodyComposition';

export type AbdominalRiskCategory = 'low' | 'very_low' | 'healthy' | 'increased_risk' | 'moderate_risk' | 'high_risk';
export type RecompositionStatus =
  | 'positive'
  | 'correct'
  | 'muscle_loss_risk'
  | 'abdomen_increased'
  | 'neutral'
  | 'insufficient_data';

interface CategoryResult<TCategory extends string> {
  category: TCategory;
  labelKey: string;
  color: string;
}

export interface AbdominalRangeSegment {
  to: number;
  color: string;
  labelKey: string;
}

export interface AbdominalRangeConfig {
  min: number;
  max: number;
  segments: AbdominalRangeSegment[];
}

export interface AbdominalMarkerResult<TCategory extends string = AbdominalRiskCategory> {
  value: number;
  ratio?: number;
  category: TCategory;
  labelKey: string;
  color: string;
  formula: string;
  inputsUsed: CompositionInputKey[];
}

export interface AdvancedAbdominalMarker {
  value: number;
  formula: string;
  inputsUsed: CompositionInputKey[];
}

export interface AbdominalHealthResult {
  waistToHeight: AbdominalMarkerResult | null;
  waistToHip: AbdominalMarkerResult | null;
  bri: AdvancedAbdominalMarker | null;
  absi: AdvancedAbdominalMarker | null;
  missingInputs: CompositionInputKey[];
}

export interface PersistedAbdominalHealthResult {
  waistToHeight: AbdominalMarkerResult | null;
  waistToHip: AbdominalMarkerResult | null;
}

export interface RecompositionSnapshot {
  weightKg?: number;
  abdomen?: number;
  chest?: number;
  arm?: number;
  thigh?: number;
}

export interface RecompositionTrend {
  status: RecompositionStatus;
  labelKey: string;
  recommendationKey: string;
  usedMeasurements: CompositionInputKey[];
  deltas: {
    weightKg?: number;
    abdomen?: number;
    chest?: number;
    arm?: number;
    thigh?: number;
  };
}

interface AbdominalHealthInput {
  heightCm?: number | null;
  weightKg?: number | null;
  sex?: MaleOrFemale | null;
  measurements?: AnthroMeasurements;
}

interface RecompositionInput {
  current?: RecompositionSnapshot | null;
  previous?: RecompositionSnapshot | null;
}

const round2 = (value: number): number => parseFloat(value.toFixed(2));
const round3 = (value: number): number => parseFloat(value.toFixed(3));

const isPositive = (value: number | null | undefined): value is number => typeof value === 'number' && value > 0;
const isValidMeasurement = (value: number | undefined, min: number, max: number): value is number =>
  typeof value === 'number' && value >= min && value <= max;

export const getWaistToHeightCategory = (ratio: number): CategoryResult<AbdominalRiskCategory> => {
  if (ratio < 0.4) {
    return { category: 'low', labelKey: 'health.abdominalCategoryLow', color: '#38BDF8' };
  }
  if (ratio < 0.5) {
    return { category: 'healthy', labelKey: 'health.abdominalCategoryHealthy', color: '#10B981' };
  }
  if (ratio < 0.6) {
    return { category: 'increased_risk', labelKey: 'health.abdominalCategoryIncreased', color: '#F59E0B' };
  }
  return { category: 'high_risk', labelKey: 'health.abdominalCategoryHigh', color: '#EF4444' };
};

export const getWaistToHeightRangeConfig = (): AbdominalRangeConfig => ({
  min: 0.35,
  max: 0.7,
  segments: [
    { to: 0.4, color: '#38BDF8', labelKey: 'health.abdominalCategoryLow' },
    { to: 0.5, color: '#10B981', labelKey: 'health.abdominalCategoryHealthy' },
    { to: 0.6, color: '#F59E0B', labelKey: 'health.abdominalCategoryIncreased' },
    { to: 0.7, color: '#EF4444', labelKey: 'health.abdominalCategoryHigh' },
  ],
});

export const getWaistToHipCategory = (ratio: number, sex: MaleOrFemale): CategoryResult<AbdominalRiskCategory> => {
  if (sex === 'female') {
    if (ratio < 0.8) return { category: 'healthy', labelKey: 'health.abdominalCategoryHealthy', color: '#10B981' };
    if (ratio < 0.85) {
      return { category: 'increased_risk', labelKey: 'health.abdominalCategoryIncreased', color: '#F59E0B' };
    }
    return { category: 'high_risk', labelKey: 'health.abdominalCategoryHigh', color: '#EF4444' };
  }

  if (ratio < 0.9) return { category: 'healthy', labelKey: 'health.abdominalCategoryHealthy', color: '#10B981' };
  if (ratio < 1) {
    return { category: 'increased_risk', labelKey: 'health.abdominalCategoryIncreased', color: '#F59E0B' };
  }
  return { category: 'high_risk', labelKey: 'health.abdominalCategoryHigh', color: '#EF4444' };
};

export const getWaistToHipRangeConfig = (sex: MaleOrFemale): AbdominalRangeConfig => {
  if (sex === 'female') {
    return {
      min: 0.65,
      max: 0.95,
      segments: [
        { to: 0.8, color: '#10B981', labelKey: 'health.abdominalCategoryHealthy' },
        { to: 0.85, color: '#F59E0B', labelKey: 'health.abdominalCategoryIncreased' },
        { to: 0.95, color: '#EF4444', labelKey: 'health.abdominalCategoryHigh' },
      ],
    };
  }

  return {
    min: 0.75,
    max: 1.1,
    segments: [
      { to: 0.9, color: '#10B981', labelKey: 'health.abdominalCategoryHealthy' },
      { to: 1, color: '#F59E0B', labelKey: 'health.abdominalCategoryIncreased' },
      { to: 1.1, color: '#EF4444', labelKey: 'health.abdominalCategoryHigh' },
    ],
  };
};

export const calculateBri = (heightCm: number, abdomenCm: number): number | null => {
  if (!isPositive(heightCm) || !isPositive(abdomenCm)) return null;

  const halfHeight = 0.5 * heightCm;
  const waistRadius = abdomenCm / (2 * Math.PI);
  const inner = 1 - Math.pow(waistRadius / halfHeight, 2);

  if (inner <= 0) return null;
  return round2(364.2 - 365.5 * Math.sqrt(inner));
};

export const calculateAbsi = (weightKg: number, heightCm: number, abdomenCm: number): number | null => {
  if (!isPositive(weightKg) || !isPositive(heightCm) || !isPositive(abdomenCm)) return null;

  const heightM = heightCm / 100;
  const waistM = abdomenCm / 100;
  const bmi = weightKg / Math.pow(heightM, 2);

  return round3(waistM / (Math.pow(bmi, 2 / 3) * Math.sqrt(heightM)));
};

export const calculateAbdominalHealth = ({
  heightCm,
  weightKg,
  sex,
  measurements = {},
}: AbdominalHealthInput): AbdominalHealthResult => {
  const abdomen = isValidMeasurement(measurements.abdomen, 40, 200) ? measurements.abdomen : undefined;
  const hips = isValidMeasurement(measurements.hips, 50, 200) ? measurements.hips : undefined;
  const missingInputs: CompositionInputKey[] = [];

  if (!isPositive(heightCm)) missingInputs.push('height');
  if (!isPositive(abdomen)) missingInputs.push('abdomen');

  const waistToHeight =
    isPositive(heightCm) && isPositive(abdomen)
      ? (() => {
          const ratio = round2(abdomen / heightCm);
          const category = getWaistToHeightCategory(ratio);
          return {
            value: ratio,
            ratio,
            ...category,
            formula: 'waistToHeight = abdomen / height',
            inputsUsed: ['height', 'abdomen'] as CompositionInputKey[],
          };
        })()
      : null;

  const waistToHip =
    isPositive(abdomen) && isPositive(hips) && (sex === 'male' || sex === 'female')
      ? (() => {
          const ratio = round2(abdomen / hips);
          const category = getWaistToHipCategory(ratio, sex);
          return {
            value: ratio,
            ratio,
            ...category,
            formula: 'waistToHip = abdomen / hips',
            inputsUsed: ['abdomen', 'hips', 'sex'] as CompositionInputKey[],
          };
        })()
      : null;

  const briValue = isPositive(heightCm) && isPositive(abdomen) ? calculateBri(heightCm, abdomen) : null;
  const absiValue =
    isPositive(weightKg) && isPositive(heightCm) && isPositive(abdomen)
      ? calculateAbsi(weightKg, heightCm, abdomen)
      : null;

  return {
    waistToHeight,
    waistToHip,
    bri:
      briValue !== null
        ? {
            value: briValue,
            formula: 'BRI = 364.2 - 365.5 * sqrt(1 - (abdomen/(2*pi)/(0.5*height))^2)',
            inputsUsed: ['height', 'abdomen'],
          }
        : null,
    absi:
      absiValue !== null
        ? {
            value: absiValue,
            formula: 'ABSI = abdomenM / (BMI^(2/3) * heightM^(1/2))',
            inputsUsed: ['weight', 'height', 'abdomen'],
          }
        : null,
    missingInputs,
  };
};

export const calculatePersistedAbdominalHealth = (input: AbdominalHealthInput): PersistedAbdominalHealthResult => {
  const result = calculateAbdominalHealth(input);
  return {
    waistToHeight: result.waistToHeight,
    waistToHip: result.waistToHip,
  };
};

const delta = (current?: number, previous?: number): number | undefined => {
  if (!isPositive(current) || !isPositive(previous)) return undefined;
  return round2(current - previous);
};

export const calculateRecompositionTrend = ({ current, previous }: RecompositionInput): RecompositionTrend => {
  const emptyTrend: RecompositionTrend = {
    status: 'insufficient_data',
    labelKey: 'health.recompositionInsufficient',
    recommendationKey: 'health.recompositionNeedPrevious',
    usedMeasurements: [],
    deltas: {},
  };

  if (!current || !previous) return emptyTrend;

  const deltas = {
    weightKg: delta(current.weightKg, previous.weightKg),
    abdomen: delta(current.abdomen, previous.abdomen),
    chest: delta(current.chest, previous.chest),
    arm: delta(current.arm, previous.arm),
    thigh: delta(current.thigh, previous.thigh),
  };

  if (deltas.abdomen === undefined) return emptyTrend;

  const usedMeasurements = (Object.entries(deltas) as [keyof typeof deltas, number | undefined][])
    .filter(([, value]) => value !== undefined)
    .map(([key]) => (key === 'weightKg' ? 'weight' : key));
  const abdomenDown = deltas.abdomen <= -0.5;
  const abdomenUp = deltas.abdomen >= 0.5;
  const weightDown = deltas.weightKg !== undefined && deltas.weightKg <= -0.3;
  const perimeterDeltas = [deltas.chest, deltas.arm, deltas.thigh].filter(
    (value): value is number => value !== undefined,
  );
  const hasPerimeterData = perimeterDeltas.length > 0;
  const perimetersMaintained = hasPerimeterData && perimeterDeltas.every(value => value >= -1);
  const perimetersDropped = hasPerimeterData && perimeterDeltas.some(value => value <= -1.5);

  if (weightDown && perimetersDropped) {
    return {
      status: 'muscle_loss_risk',
      labelKey: 'health.recompositionMuscleLossRisk',
      recommendationKey: 'health.recompositionMuscleLossRiskAdvice',
      usedMeasurements,
      deltas,
    };
  }

  if (abdomenDown && perimetersMaintained) {
    return {
      status: 'positive',
      labelKey: 'health.recompositionPositive',
      recommendationKey: 'health.recompositionPositiveAdvice',
      usedMeasurements,
      deltas,
    };
  }

  if (weightDown && abdomenDown) {
    return {
      status: 'correct',
      labelKey: 'health.recompositionCorrect',
      recommendationKey: 'health.recompositionCorrectAdvice',
      usedMeasurements,
      deltas,
    };
  }

  if (abdomenUp) {
    return {
      status: 'abdomen_increased',
      labelKey: 'health.recompositionAbdomenIncreased',
      recommendationKey: 'health.recompositionAbdomenIncreasedAdvice',
      usedMeasurements,
      deltas,
    };
  }

  return {
    status: 'neutral',
    labelKey: 'health.recompositionNeutral',
    recommendationKey: 'health.recompositionNeutralAdvice',
    usedMeasurements,
    deltas,
  };
};
