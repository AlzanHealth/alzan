import type { TrainingExerciseResolution } from './trainingPlanImportExerciseResolver';

export const isTrainingExerciseResolutionPending = (resolution: TrainingExerciseResolution): boolean =>
  resolution.selectedCandidate === null;

export const getTrainingExercisePendingCount = (resolutions: TrainingExerciseResolution[]): number =>
  resolutions.filter(isTrainingExerciseResolutionPending).length;

export const getVisibleTrainingExerciseResolutions = (
  resolutions: TrainingExerciseResolution[],
  showOnlyConflicts: boolean,
): TrainingExerciseResolution[] =>
  showOnlyConflicts ? resolutions.filter(isTrainingExerciseResolutionPending) : resolutions;
