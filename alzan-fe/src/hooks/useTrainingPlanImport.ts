import { useCallback, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  parseTrainingPlanJson,
  TrainingPlanImportDocument,
} from '../modules/training/services/trainingPlanImportContract';
import { importTrainingPlan } from '../modules/training/services/trainingPlanImportService';
import { useAuth } from '../context/AuthContext';
import { useTrainingSettings } from './useTrainingSettings';

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
    setIsAnalyzing(true);
    setAnalysisProgress(12);
    await new Promise(resolve => setTimeout(resolve, 80));
    setAnalysisProgress(68);
    await new Promise(resolve => setTimeout(resolve, 100));
    setAnalysisProgress(100);
    setIsAnalyzing(false);
    return document ? 'ok' : 'error';
  }, [document]);

  const importPlan = useCallback(async () => {
    if (!user || !document || isImporting) return { ok: false as const, kind: 'busy' as const };
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
      return { ok: true as const, ...result };
    } catch (error) {
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
