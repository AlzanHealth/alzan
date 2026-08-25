import {
  buildTrainingAiLaunchTarget,
  type TrainingAiLaunchResult,
  type TrainingAiProvider,
} from '../../training/services/trainingPlanAiProvider';

export type MenuImportAiProvider = TrainingAiProvider;
export type MenuImportAiLaunchResult = TrainingAiLaunchResult;

export const buildMenuImportAiLaunchTarget = buildTrainingAiLaunchTarget;
