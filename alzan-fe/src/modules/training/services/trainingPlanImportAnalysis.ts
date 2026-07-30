import {
  parseTrainingPlanJson,
  type TrainingPlanImportDocument,
  type TrainingPlanParseResult,
} from './trainingPlanImportContract';

export type TrainingPlanPreflight = (document: TrainingPlanImportDocument) => Promise<void>;

export const analyzeTrainingPlanJson = async (
  rawText: string,
  preflight: TrainingPlanPreflight,
): Promise<TrainingPlanParseResult> => {
  const parsed = parseTrainingPlanJson(rawText);
  if (!parsed.ok) return parsed;

  try {
    await preflight(parsed.value);
    return parsed;
  } catch (error) {
    return {
      ok: false,
      errors: [
        {
          code: 'invalid_session_shape',
          path: 'weeks',
          message: error instanceof Error ? error.message : 'Training plan preflight failed',
        },
      ],
    };
  }
};
