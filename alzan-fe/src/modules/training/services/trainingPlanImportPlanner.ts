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

const toEnduranceSignatureStep = (step: TrainingPlanRunningStep): EnduranceSignatureStep => ({
  phaseType: step.phase_type,
  durationType: step.duration_type,
  isGroup: Boolean(step.children?.length),
  repetitions: step.repetitions ?? 1,
  children: step.children?.map(toEnduranceSignatureStep),
});

const sessionSignature = (session: TrainingPlanSession): string => {
  if (session.sport === 'running') {
    return buildEnduranceTemplateFamilySignature({
      sportType: 'running',
      workoutGoal: session.workout_goal,
      modality: session.modality,
      steps: (session.running_steps ?? []).map(toEnduranceSignatureStep),
    });
  }
  const exercises: GymSignatureExercise[] = (session.exercises ?? []).map(exercise => ({
    exerciseId: exercise.exercise_id,
    exerciseName: exercise.exercise_name,
    orderIndex: exercise.order_index,
    isWarmup: exercise.is_warmup,
  }));
  return buildGymTemplateFamilySignature({ workoutGoal: session.workout_goal, modality: session.modality, exercises });
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
  return `${session.sport}:${explicit || `signature_${stableHash(sessionSignature(session))}`}`;
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
      grouped.set(familyKey, {
        familyKey,
        sport: session.sport,
        name: session.name,
        workoutGoal: session.workout_goal ?? null,
        modality: session.modality ?? null,
        sessions: [session],
        signature: sessionSignature(session),
      });
    }
  }
  return [...grouped.values()];
};
