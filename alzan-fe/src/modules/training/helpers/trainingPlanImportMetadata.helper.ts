export type TrainingImportSport = 'running' | 'strength';

export type TrainingImportMetadataField = 'workout_goal' | 'modality';

export type TrainingImportMetadataResult =
  | { ok: true; workoutGoal: string | null; modality: string }
  | { ok: false; invalidFields: TrainingImportMetadataField[] };

const normalizeToken = (value: string): string =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

const GOAL_ALIASES: Record<TrainingImportSport, Record<string, string>> = {
  running: {
    endurance: 'endurance',
    easy: 'endurance',
    easy_run: 'endurance',
    rodaje: 'endurance',
    rodaje_suave: 'endurance',
    resistencia: 'endurance',
    speed: 'speed',
    interval: 'speed',
    intervals: 'speed',
    intervalos: 'speed',
    series: 'speed',
    velocidad: 'speed',
    tempo_threshold: 'tempo_threshold',
    tempo: 'tempo_threshold',
    threshold: 'tempo_threshold',
    tempo_umbral: 'tempo_threshold',
    umbral: 'tempo_threshold',
    long_run: 'long_run',
    long: 'long_run',
    tirada_larga: 'long_run',
    recovery: 'recovery',
    recuperacion: 'recovery',
    regenerativo: 'recovery',
    test: 'test',
    prueba: 'test',
  },
  strength: {
    hypertrophy: 'hypertrophy',
    hipertrofia: 'hypertrophy',
    strength: 'strength',
    fuerza: 'strength',
    gym: 'strength',
    muscular_endurance: 'muscular_endurance',
    resistencia_muscular: 'muscular_endurance',
    technique: 'technique',
    tecnica: 'technique',
    mobility: 'mobility',
    movilidad: 'mobility',
    recovery: 'recovery',
    recuperacion: 'recovery',
  },
};

const MODALITY_ALIASES: Record<TrainingImportSport, Record<string, string>> = {
  running: {
    outdoor: 'outdoor',
    exterior: 'outdoor',
    aire_libre: 'outdoor',
    treadmill: 'treadmill',
    cinta: 'treadmill',
    cinta_de_correr: 'treadmill',
  },
  strength: {
    gym: 'gym',
    gimnasio: 'gym',
    free_weights: 'free_weights',
    free_weight: 'free_weights',
    peso_libre: 'free_weights',
    pesos_libres: 'free_weights',
    machines: 'machines',
    machine: 'machines',
    maquinas: 'machines',
    calisthenics: 'calisthenics',
    calistenia: 'calisthenics',
    core: 'core',
    mobility: 'mobility',
    movilidad: 'mobility',
  },
};

const DEFAULT_MODALITY: Record<TrainingImportSport, string> = {
  running: 'outdoor',
  strength: 'gym',
};

export const resolveTrainingImportMetadata = (
  sport: TrainingImportSport,
  workoutGoal?: string,
  modality?: string,
): TrainingImportMetadataResult => {
  const invalidFields: TrainingImportMetadataField[] = [];
  const normalizedGoal = workoutGoal ? normalizeToken(workoutGoal) : '';
  const normalizedModality = modality ? normalizeToken(modality) : '';
  const canonicalGoal = normalizedGoal ? GOAL_ALIASES[sport][normalizedGoal] : null;
  const canonicalModality = normalizedModality ? MODALITY_ALIASES[sport][normalizedModality] : DEFAULT_MODALITY[sport];

  if (normalizedGoal && !canonicalGoal) invalidFields.push('workout_goal');
  if (normalizedModality && !canonicalModality) invalidFields.push('modality');

  if (invalidFields.length > 0) return { ok: false, invalidFields };
  return { ok: true, workoutGoal: canonicalGoal ?? null, modality: canonicalModality };
};
