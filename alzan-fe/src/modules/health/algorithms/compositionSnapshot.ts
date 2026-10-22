import {
  BodyCompositionResult,
  BodyFatMethod,
  CompositionInputKey,
  MuscleMethod,
  getBodyFatCategory,
  getMuscleCategory,
} from './bodyComposition';

type PersistedComposition = {
  calculation_status?: string;
  bodyfat_percent: number | null;
  bodyfat_method: string | null;
  bodyfat_precision_level: number | null;
  bodyfat_formula: string | null;
  bodyfat_inputs: unknown;
  muscle_mass_kg: number | null;
  muscle_percent: number | null;
  muscle_method: string | null;
  muscle_precision_level: number | null;
  muscle_formula: string | null;
  muscle_inputs: unknown;
  weight_kg_used: number | null;
};

export type ComparableCompositionMetric = {
  value: number;
  method: string;
  precisionLevel: number;
};

type CompositionHistoryRow = {
  calculation_status?: string;
  calculated_for_date: string;
  bmi: number | null;
  bodyfat_percent: number | null;
  bodyfat_method: string | null;
  bodyfat_precision_level: number | null;
  muscle_percent: number | null;
  muscle_method: string | null;
  muscle_precision_level: number | null;
};

export type CompositionDeltas = {
  bmi: number | null;
  bodyFat: number | null;
  muscle: number | null;
  bodyFatMethodChanged: boolean;
  muscleMethodChanged: boolean;
};

const inputKeys: CompositionInputKey[] = [
  'weight',
  'height',
  'age',
  'sex',
  'waist',
  'abdomen',
  'hips',
  'chest',
  'arm',
  'thigh',
  'storedBodyFat',
  'storedMuscleMass',
];

const bodyFatMethodLabels: Record<BodyFatMethod, string> = {
  measured: 'Medición importada/externa',
  rfm: 'RFM (Woolcott & Bergman 2018)',
  bai: 'BAI (Fallback con cadera)',
  cun_bae: 'CUN-BAE (Gómez-Ambrosi et al. 2012)',
  deurenberg: 'Deurenberg (1991)',
  stored: 'Valor guardado',
  whtr: 'WHtR',
  anthropometry_full: 'Antropometría avanzada',
  bai_whtr_combined: 'BAI + WHtR',
};

const muscleMethodLabels: Record<MuscleMethod, string> = {
  lee_et_al: 'Lee et al. (2000)',
  al_gindan: 'Al-Gindan et al. (2014)',
  stored: 'Valor guardado',
  anthropometric: 'Antropometría',
};

const parseInputs = (value: unknown): CompositionInputKey[] =>
  Array.isArray(value)
    ? value.filter((input): input is CompositionInputKey => inputKeys.includes(input as CompositionInputKey))
    : [];

const isBodyFatMethod = (value: string | null): value is BodyFatMethod =>
  value !== null && Object.hasOwn(bodyFatMethodLabels, value);

const isMuscleMethod = (value: string | null): value is MuscleMethod =>
  value !== null && Object.hasOwn(muscleMethodLabels, value);

const normalizePrecision = (value: number | null): 1 | 2 | 3 => (value === 2 || value === 3 ? value : 1);

const round1 = (value: number): number => Number(value.toFixed(1));

export const mergePersistedCompositionResult = (
  persisted: PersistedComposition,
  fallback: BodyCompositionResult,
  sex?: 'male' | 'female' | null,
): BodyCompositionResult => {
  if (persisted.calculation_status === 'stale') return fallback;
  const persistedBodyFatCategory =
    persisted.bodyfat_percent === null || !sex ? null : getBodyFatCategory(persisted.bodyfat_percent, sex);
  const persistedMuscleCategory =
    persisted.muscle_percent === null || !sex ? null : getMuscleCategory(persisted.muscle_percent, sex);
  const bodyFatMethod = isBodyFatMethod(persisted.bodyfat_method) ? persisted.bodyfat_method : 'stored';
  const muscleMethod = isMuscleMethod(persisted.muscle_method) ? persisted.muscle_method : 'stored';
  const bodyFat =
    persisted.bodyfat_percent !== null
      ? {
          percentage: persisted.bodyfat_percent,
          category: persistedBodyFatCategory?.category ?? null,
          categoryLabel: persistedBodyFatCategory?.label ?? '',
          method: bodyFatMethod,
          methodLabel: bodyFatMethodLabels[bodyFatMethod],
          precisionLevel: normalizePrecision(persisted.bodyfat_precision_level),
          formulaUsed: persisted.bodyfat_formula ?? 'Stored value; original calculation method is not persisted.',
          inputsUsed: parseInputs(persisted.bodyfat_inputs),
        }
      : null;
  const muscle =
    persisted.muscle_mass_kg !== null && persisted.muscle_percent !== null && persistedMuscleCategory
      ? {
          percentage: persisted.muscle_percent,
          massKg: persisted.muscle_mass_kg,
          category: persistedMuscleCategory.category,
          categoryLabel: persistedMuscleCategory.label,
          method: muscleMethod,
          methodLabel: muscleMethodLabels[muscleMethod],
          precisionLevel: normalizePrecision(persisted.muscle_precision_level),
          formulaUsed: persisted.muscle_formula ?? 'Stored value; original calculation method is not persisted.',
          inputsUsed: parseInputs(persisted.muscle_inputs),
        }
      : null;
  const weightKg =
    persisted.weight_kg_used !== null && Number.isFinite(persisted.weight_kg_used) && persisted.weight_kg_used > 0
      ? persisted.weight_kg_used
      : null;
  const fatMassKg = bodyFat && weightKg !== null ? round1(weightKg * (bodyFat.percentage / 100)) : null;
  const leanMassKg = fatMassKg !== null && weightKg !== null ? round1(weightKg - fatMassKg) : null;
  const muscleMassKg = muscle?.massKg ?? null;
  const residualMassKg =
    leanMassKg !== null && muscleMassKg !== null ? round1(Math.max(0, leanMassKg - muscleMassKg)) : null;

  return { ...fallback, bodyFat, muscle, fatMassKg, leanMassKg, muscleMassKg, residualMassKg };
};

export const buildComparableCompositionDelta = (
  current: ComparableCompositionMetric | null,
  previous: ComparableCompositionMetric | null,
): number | null => {
  if (!current || !previous) return null;
  if (current.method !== previous.method || current.precisionLevel !== previous.precisionLevel) return null;
  const delta = round1(current.value - previous.value);
  return Math.abs(delta) >= 0.1 ? delta : null;
};

const toComparableMetric = (
  value: number | null,
  method: string | null,
  precisionLevel: number | null,
): ComparableCompositionMetric | null =>
  value === null || method === null || precisionLevel === null ? null : { value, method, precisionLevel };

export const buildCompositionDeltas = (logs: CompositionHistoryRow[]): CompositionDeltas => {
  const [current, previous] = logs.filter(log => !log.calculation_status || log.calculation_status === 'complete');
  if (!current || !previous) {
    return { bmi: null, bodyFat: null, muscle: null, bodyFatMethodChanged: false, muscleMethodChanged: false };
  }
  const currentBodyFat = toComparableMetric(
    current.bodyfat_percent,
    current.bodyfat_method,
    current.bodyfat_precision_level,
  );
  const previousBodyFat = toComparableMetric(
    previous.bodyfat_percent,
    previous.bodyfat_method,
    previous.bodyfat_precision_level,
  );
  const currentMuscle = toComparableMetric(
    current.muscle_percent,
    current.muscle_method,
    current.muscle_precision_level,
  );
  const previousMuscle = toComparableMetric(
    previous.muscle_percent,
    previous.muscle_method,
    previous.muscle_precision_level,
  );
  const bodyFatMethodChanged =
    !!currentBodyFat && !!previousBodyFat && currentBodyFat.method !== previousBodyFat.method;
  const muscleMethodChanged = !!currentMuscle && !!previousMuscle && currentMuscle.method !== previousMuscle.method;
  const bmi =
    current.bmi === null || previous.bmi === null
      ? null
      : buildComparableCompositionDelta(
          { value: current.bmi, method: 'bmi', precisionLevel: 1 },
          { value: previous.bmi, method: 'bmi', precisionLevel: 1 },
        );

  return {
    bmi,
    bodyFat: buildComparableCompositionDelta(currentBodyFat, previousBodyFat),
    muscle: buildComparableCompositionDelta(currentMuscle, previousMuscle),
    bodyFatMethodChanged,
    muscleMethodChanged,
  };
};
