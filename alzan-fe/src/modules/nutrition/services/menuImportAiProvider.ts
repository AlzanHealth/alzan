import {
  buildAiClipboardText,
  buildTrainingAiLaunchTarget,
  isAiCatalogReady,
  type TrainingAiLaunchResult,
  type TrainingAiProvider,
} from '../../training/services/trainingPlanAiProvider';

export { isAiCatalogReady };

export type MenuImportAiProvider = TrainingAiProvider;
export type MenuImportAiLaunchResult = TrainingAiLaunchResult;

export const buildMenuImportAiLaunchTarget = buildTrainingAiLaunchTarget;
export const buildMenuImportAiClipboardText = buildAiClipboardText;
