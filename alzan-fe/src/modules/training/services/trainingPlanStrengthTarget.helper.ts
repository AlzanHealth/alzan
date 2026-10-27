import { isTimeBasedGymExerciseType } from '../helpers/gymExerciseDefaults.helper';
import {
  getTrainingExerciseResolutionKey,
  type TrainingExerciseResolution,
} from './trainingPlanImportExerciseResolver';
import type { TrainingPlanImportDocument, TrainingPlanStrengthExercise } from './trainingPlanImportContract';

export type TrainingPlanStrengthTargetValues = {
  target_reps_min: number | null;
  target_reps_max: number | null;
};

export type TrainingPlanExerciseMetricIssue = {
  kind: 'timed_catalog_type_required' | 'timed_needs_duration' | 'reps_need_repetitions';
  exerciseName: string;
};

export const getTrainingPlanStrengthTargetValues = (
  exercise: TrainingPlanStrengthExercise,
  fallback: number | null,
): TrainingPlanStrengthTargetValues => {
  if (exercise.duration_s !== undefined) {
    return { target_reps_min: exercise.duration_s, target_reps_max: exercise.duration_s };
  }

  return {
    target_reps_min: exercise.reps_min ?? exercise.reps ?? fallback,
    target_reps_max: exercise.reps_max ?? exercise.reps ?? fallback,
  };
};

export const getTrainingPlanExerciseMetricError = (
  exercise: TrainingPlanStrengthExercise,
  exerciseTypeCode: string | null | undefined,
): TrainingPlanExerciseMetricIssue | null => {
  const exerciseName = exercise.exercise_name ?? exercise.exercise_id ?? 'El ejercicio seleccionado';
  if (!exerciseTypeCode && exercise.duration_s !== undefined) {
    return { kind: 'timed_catalog_type_required', exerciseName };
  }
  if (!exerciseTypeCode) return null;
  if (isTimeBasedGymExerciseType(exerciseTypeCode) && exercise.duration_s === undefined) {
    return { kind: 'timed_needs_duration', exerciseName };
  }
  if (!isTimeBasedGymExerciseType(exerciseTypeCode) && exercise.duration_s !== undefined) {
    return { kind: 'reps_need_repetitions', exerciseName };
  }
  return null;
};

export const getTrainingPlanExerciseMetricValidationErrors = (
  document: TrainingPlanImportDocument | null,
  resolutions: TrainingExerciseResolution[],
): Array<{ path: string; issue: TrainingPlanExerciseMetricIssue }> => {
  if (!document) return [];

  const resolutionsByKey = new Map(resolutions.map(resolution => [resolution.resolutionKey, resolution] as const));
  const errors: Array<{ path: string; issue: TrainingPlanExerciseMetricIssue }> = [];
  document.weeks.forEach((week, weekIndex) => {
    week.sessions.forEach((session, sessionIndex) => {
      if (session.sport !== 'strength') return;
      session.exercises?.forEach((exercise, exerciseIndex) => {
        const resolution = resolutionsByKey.get(getTrainingExerciseResolutionKey(exercise));
        const issue = getTrainingPlanExerciseMetricError(exercise, resolution?.selectedCandidate?.exercise_type);
        if (issue) {
          errors.push({
            path: `weeks[${weekIndex}].sessions[${sessionIndex}].exercises[${exerciseIndex}]`,
            issue,
          });
        }
      });
    });
  });
  return errors;
};
