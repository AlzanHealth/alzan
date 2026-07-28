type ImportLogDetails = Record<string, unknown>;

const DEBUG_ENABLED = typeof __DEV__ !== 'undefined' ? __DEV__ : true;

const getErrorDetails = (error: unknown): ImportLogDetails => {
  if (error instanceof Error) return { name: error.name, message: error.message };
  if (typeof error === 'string') return { message: error };
  if (typeof error === 'object' && error !== null) {
    const candidate = error as {
      code?: unknown;
      details?: unknown;
      hint?: unknown;
      message?: unknown;
    };
    return {
      ...(typeof candidate.code === 'string' ? { code: candidate.code } : {}),
      ...(typeof candidate.message === 'string' ? { message: candidate.message } : {}),
      ...(typeof candidate.details === 'string' ? { details: candidate.details } : {}),
      ...(typeof candidate.hint === 'string' ? { hint: candidate.hint } : {}),
    };
  }
  return { message: 'Unknown error' };
};

export const logTrainingPlanImport = (event: string, details: ImportLogDetails = {}): void => {
  if (!DEBUG_ENABLED) return;
  console.info(`[trainingPlanImport] ${event}`, JSON.stringify(details));
};

export const logTrainingPlanImportError = (event: string, error: unknown, details: ImportLogDetails = {}): void => {
  if (!DEBUG_ENABLED) return;
  console.error(`[trainingPlanImport] ${event}`, JSON.stringify({ ...details, error: getErrorDetails(error) }));
};
