import { useCallback, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  parseTrainingPlanJson,
  TrainingPlanImportDocument,
} from '../modules/training/services/trainingPlanImportContract';
import { importTrainingPlan } from '../modules/training/services/trainingPlanImportService';
import { useAuth } from '../context/AuthContext';
import { useTrainingSettings } from './useTrainingSettings';
import {
  logTrainingPlanImport,
  logTrainingPlanImportError,
} from '../modules/training/services/trainingPlanImportLogger';

export const useTrainingPlanImport = () => {
  const { user } = useAuth();
  const { settings } = useTrainingSettings();
  const queryClient = useQueryClient();
  const [rawJson, setRawJson] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState(0);
  const [isImporting, setIsImporting] = useState(false);

  const parsed = useMemo(() => (rawJson.trim() ? parseTrainingPlanJson(rawJson) : null), [rawJson]);
  const validationErrors = parsed && !parsed.ok ? parsed.errors : [];
  const document: TrainingPlanImportDocument | null = parsed?.ok ? parsed.value : null;

  const analyze = useCallback(async () => {
    logTrainingPlanImport('analyze:start', {
      rawLength: rawJson.length,
      parsed: Boolean(document),
      validationErrors: validationErrors.length,
    });
    setIsAnalyzing(true);
    setAnalysisProgress(12);
    await new Promise(resolve => setTimeout(resolve, 80));
    setAnalysisProgress(68);
    await new Promise(resolve => setTimeout(resolve, 100));
    setAnalysisProgress(100);
    setIsAnalyzing(false);
    logTrainingPlanImport('analyze:complete', {
      result: document ? 'ok' : 'error',
      validationErrors: validationErrors.length,
    });
    return document ? 'ok' : 'error';
  }, [document, rawJson.length, validationErrors.length]);

  const importPlan = useCallback(async () => {
    if (!user || !document || isImporting) return { ok: false as const, kind: 'busy' as const };
    logTrainingPlanImport('import:start', {
      planName: document.plan_name,
      weeks: document.weeks.length,
      sessions: document.weeks.reduce((count, week) => count + week.sessions.length, 0),
      autoDeleteExpiredTemplates: settings.autoDeleteExpiredTemplates,
    });
    setIsImporting(true);
    try {
      const result = await importTrainingPlan(user.id, document, {
        autoDeleteExpiredTemplates: settings.autoDeleteExpiredTemplates,
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['gymRoutines'] }),
        queryClient.invalidateQueries({ queryKey: ['enduranceTemplates'] }),
        queryClient.invalidateQueries({ queryKey: ['dailyPlans'] }),
        queryClient.invalidateQueries({ queryKey: ['weeklyPlans'] }),
      ]);
      logTrainingPlanImport('import:complete', result);
      return { ok: true as const, ...result };
    } catch (error) {
      logTrainingPlanImportError('import:failed', error, { planName: document.plan_name });
      return { ok: false as const, kind: 'error' as const, error };
    } finally {
      setIsImporting(false);
    }
  }, [document, isImporting, queryClient, settings.autoDeleteExpiredTemplates, user]);

  return {
    rawJson,
    setRawJson,
    validationErrors,
    document,
    isAnalyzing,
    analysisProgress,
    isImporting,
    canImport: !!document && !isAnalyzing && !isImporting,
    analyze,
    importPlan,
  };
};
