import {
  buildEnduranceTemplateFamilySignature,
  buildGymTemplateFamilySignature,
  normalizeTemplateKey,
} from '../helpers/templateFamilySignature';
import type { EnduranceSignatureStep, GymSignatureExercise } from '../helpers/templateFamilySignature';
import type {
  TrainingPlanImportDocument,
  TrainingPlanSession,
  TrainingPlanRunningStep,
} from './trainingPlanImportContract';

export type ImportedTemplateFamily = {
  familyKey: string;
  sport: TrainingPlanSession['sport'];
  name: string;
  workoutGoal: string | null;
  modality: string | null;
  sessions: TrainingPlanSession[];
  signature: string;
};

export type ImportedTemplateCandidate = {
  id: string;
  template_family_key: string | null;
  source: string | null;
  recurrence_start_date: string | null;
  recurrence_end_date: string | null;
};

const IMPORTED_GOAL_ALIASES: Record<TrainingPlanSession['sport'], Record<string, string>> = {
  running: {
    easy_run: 'endurance',
    resistencia: 'endurance',
    intervals: 'speed',
    interval: 'speed',
    velocidad: 'speed',
    tempo: 'tempo_threshold',
    threshold: 'tempo_threshold',
    tempo_umbral: 'tempo_threshold',
    long: 'long_run',
    tirada_larga: 'long_run',
    recuperacion: 'recovery',
    prueba: 'test',
  },
  strength: {
    gym: 'strength',
    hipertrofia: 'hypertrophy',
    fuerza: 'strength',
    resistencia_muscular: 'muscular_endurance',
    tecnica: 'technique',
    movilidad: 'mobility',
    recuperacion: 'recovery',
  },
};

const normalizeImportedToken = (value: string): string =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[\s/-]+/g, '_');

export const getImportedSessionMetadata = (
  session: Pick<TrainingPlanSession, 'sport' | 'workout_goal' | 'modality'>,
): { workoutGoal: string | null; modality: string | null } => {
  const goalToken = session.workout_goal ? normalizeImportedToken(session.workout_goal) : '';
  const workoutGoal = goalToken ? IMPORTED_GOAL_ALIASES[session.sport][goalToken] || goalToken : null;
  const modalityToken = session.modality ? normalizeImportedToken(session.modality) : '';
  const modalityAliases: Record<string, string> = {
    exterior: 'outdoor',
    aire_libre: 'outdoor',
    cinta: 'treadmill',
    gimnasio: 'gym',
    peso_libre: 'free_weights',
    maquinas: 'machines',
    calistenia: 'calisthenics',
    movilidad: 'mobility',
  };
  const modality = modalityToken
    ? modalityAliases[modalityToken] || session.modality!.trim()
    : session.sport === 'running'
      ? 'outdoor'
      : 'gym';

  return { workoutGoal, modality };
};

export const findReusableImportedTemplate = (
  candidates: ImportedTemplateCandidate[],
  familyKey: string,
  range: { start: string; end: string },
): ImportedTemplateCandidate | undefined =>
  candidates.find(
    candidate =>
      candidate.source === 'imported' &&
      candidate.template_family_key === familyKey &&
      candidate.recurrence_start_date === range.start &&
      candidate.recurrence_end_date === range.end,
  );

const toEnduranceSignatureStep = (step: TrainingPlanRunningStep): EnduranceSignatureStep => ({
  phaseType: step.phase_type,
  durationType: step.duration_type,
  isGroup: Boolean(step.children?.length),
  repetitions: step.repetitions ?? 1,
  children: step.children?.map(toEnduranceSignatureStep),
});

export const getTrainingPlanSessionSignature = (session: TrainingPlanSession): string => {
  const metadata = getImportedSessionMetadata(session);
  if (session.sport === 'running') {
    return buildEnduranceTemplateFamilySignature({
      sportType: 'running',
      workoutGoal: metadata.workoutGoal,
      modality: metadata.modality,
      steps: (session.running_steps ?? []).map(toEnduranceSignatureStep),
    });
  }
  const exercises: GymSignatureExercise[] = (session.exercises ?? []).map(exercise => ({
    exerciseId: exercise.exercise_id,
    exerciseName: exercise.exercise_name,
    orderIndex: exercise.order_index,
    isWarmup: exercise.is_warmup,
  }));
  return buildGymTemplateFamilySignature({ workoutGoal: metadata.workoutGoal, modality: metadata.modality, exercises });
};

const stableHash = (value: string): string => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
};

export const getImportedTemplateFamilyKey = (session: TrainingPlanSession): string => {
  const explicit = normalizeTemplateKey(session.template_key);
  return `${session.sport}:${explicit || `signature_${stableHash(getTrainingPlanSessionSignature(session))}`}`;
};

export const groupTrainingPlanSessions = (document: TrainingPlanImportDocument): ImportedTemplateFamily[] => {
  const grouped = new Map<string, ImportedTemplateFamily>();
  for (const week of document.weeks) {
    for (const session of week.sessions) {
      const familyKey = getImportedTemplateFamilyKey(session);
      const current = grouped.get(familyKey);
      if (current) {
        current.sessions.push(session);
        continue;
      }
      const metadata = getImportedSessionMetadata(session);
      grouped.set(familyKey, {
        familyKey,
        sport: session.sport,
        name: session.name,
        workoutGoal: metadata.workoutGoal,
        modality: metadata.modality,
        sessions: [session],
        signature: getTrainingPlanSessionSignature(session),
      });
    }
  }
  return [...grouped.values()];
};

/**
 * Templates currently support one recurring weekday. Only expose it when the
 * imported sessions in the family are consistent; mixed weekdays remain
 * date-driven and must not generate invented calendar entries.
 */
export const getImportedTemplateScheduledDay = (family: ImportedTemplateFamily): number | null => {
  const days = new Set(family.sessions.map(session => new Date(`${session.date}T00:00:00.000Z`).getUTCDay()));
  return days.size === 1 ? [...days][0] : null;
};
