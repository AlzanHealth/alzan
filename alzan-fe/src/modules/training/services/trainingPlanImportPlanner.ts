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
import { resolveTrainingImportMetadata } from '../helpers/trainingPlanImportMetadata.helper';

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

export const getImportedSessionMetadata = (
  session: Pick<TrainingPlanSession, 'sport' | 'workout_goal' | 'modality'>,
): { workoutGoal: string | null; modality: string | null } => {
  const result = resolveTrainingImportMetadata(session.sport, session.workout_goal, session.modality);
  if (!result.ok) {
    throw new Error(`Invalid imported session metadata: ${result.invalidFields.join(', ')}`);
  }
  return { workoutGoal: result.workoutGoal, modality: result.modality };
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
 * Imported plans are always date-driven. Calendar entries come exclusively
 * from the explicit session dates in the JSON, even when every occurrence of
 * a template happens to fall on the same weekday. Weekly recurrence is only
 * enabled later when the user explicitly edits the template.
 */
export const getImportedTemplateScheduledDay = (_family: ImportedTemplateFamily): null => null;
