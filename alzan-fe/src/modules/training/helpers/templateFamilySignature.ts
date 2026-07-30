export type TemplateFamilyMatchKind = 'exact' | 'possible' | 'none';

export type EnduranceSignatureStep = {
  phaseType: string;
  durationType: string;
  isGroup?: boolean | null;
  repetitions?: number | null;
  parentPath?: string | null;
  hyroxStepType?: string | null;
  children?: EnduranceSignatureStep[];
};

export type EnduranceSignatureInput = {
  sportType: string;
  workoutGoal?: string | null;
  modality?: string | null;
  steps: EnduranceSignatureStep[];
};

export type GymSignatureExercise = {
  exerciseId?: string | null;
  exerciseName?: string | null;
  orderIndex: number;
  isWarmup?: boolean | null;
  supersetNextExerciseId?: string | null;
};

export type GymSignatureInput = {
  workoutGoal?: string | null;
  modality?: string | null;
  exercises: GymSignatureExercise[];
};

export type TemplateFamilyMatch = {
  kind: TemplateFamilyMatchKind;
  reason: 'explicit_key' | 'signature' | 'no_match' | 'key_conflict';
};

const normalizeToken = (value: string | null | undefined): string =>
  (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();

export const normalizeTemplateKey = (value: string | null | undefined): string =>
  normalizeToken(value)
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_');

const hashSignatureWithSeed = (value: string, seed: number): string => {
  let hash = seed;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
};

export const buildTemplateFamilyStorageKey = (structuralSignature: string): string =>
  `signature_${hashSignatureWithSeed(structuralSignature, 2166136261)}${hashSignatureWithSeed(
    structuralSignature,
    2654435769,
  )}`;

const normalizeNullableToken = (value: string | null | undefined): string => normalizeToken(value) || '-';

const serializeEnduranceStep = (step: EnduranceSignatureStep, path: string): unknown => ({
  path,
  phase: normalizeNullableToken(step.phaseType),
  duration: normalizeNullableToken(step.durationType),
  group: Boolean(step.isGroup),
  // Repetitions in an interval group are explicitly progression-friendly.
  // Repetitions are a progression value for interval work, even when the
  // imported JSON represents the interval as a flat step instead of a group.
  repetitions: normalizeToken(step.phaseType) === 'interval' ? '*' : (step.repetitions ?? 1),
  hyrox: normalizeNullableToken(step.hyroxStepType),
  children: (step.children ?? []).map((child, index) => serializeEnduranceStep(child, `${path}.${index + 1}`)),
});

export const buildEnduranceTemplateFamilySignature = (input: EnduranceSignatureInput): string =>
  JSON.stringify({
    sport: normalizeNullableToken(input.sportType),
    goal: normalizeNullableToken(input.workoutGoal),
    modality: normalizeNullableToken(input.modality),
    steps: input.steps.map((step, index) => serializeEnduranceStep(step, `${index + 1}`)),
  });

export const buildGymTemplateFamilySignature = (input: GymSignatureInput): string =>
  JSON.stringify({
    sport: 'strength',
    goal: normalizeNullableToken(input.workoutGoal),
    modality: normalizeNullableToken(input.modality),
    exercises: [...input.exercises]
      .sort((left, right) => left.orderIndex - right.orderIndex)
      .map(exercise => ({
        order: exercise.orderIndex,
        exercise: normalizeTemplateKey(exercise.exerciseId || exercise.exerciseName),
        warmup: Boolean(exercise.isWarmup),
        superset: normalizeTemplateKey(exercise.supersetNextExerciseId),
      })),
  });

export const classifyTemplateFamilyMatch = ({
  explicitKey,
  candidateKey,
  signature,
  candidateSignature,
}: {
  explicitKey?: string | null;
  candidateKey?: string | null;
  signature?: string | null;
  candidateSignature?: string | null;
}): TemplateFamilyMatch => {
  const normalizedExplicitKey = normalizeTemplateKey(explicitKey);
  const normalizedCandidateKey = normalizeTemplateKey(candidateKey);

  if (normalizedExplicitKey && normalizedCandidateKey) {
    return normalizedExplicitKey === normalizedCandidateKey
      ? { kind: 'exact', reason: 'explicit_key' }
      : { kind: 'none', reason: 'key_conflict' };
  }

  if (signature && candidateSignature && signature === candidateSignature) {
    return { kind: 'exact', reason: 'signature' };
  }

  return { kind: 'none', reason: 'no_match' };
};
