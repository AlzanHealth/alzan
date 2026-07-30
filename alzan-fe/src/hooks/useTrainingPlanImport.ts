import { useCallback, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  parseTrainingPlanJson,
  type TrainingPlanImportDocument,
  type TrainingPlanValidationError,
} from '../modules/training/services/trainingPlanImportContract';
import {
  importTrainingPlan,
  preflightTrainingPlanExercises,
} from '../modules/training/services/trainingPlanImportService';
import { analyzeTrainingPlanJson } from '../modules/training/services/trainingPlanImportAnalysis';
import { useAuth } from '../context/AuthContext';
import { useTrainingSettings } from './useTrainingSettings';
import {
  logTrainingPlanImport,
  logTrainingPlanImportError,
} from '../modules/training/services/trainingPlanImportLogger';
import { invalidateTrainingCalendar } from '../lib/trainingQueryKeys';

export const useTrainingPlanImport = () => {
  const { user } = useAuth();
  const { settings } = useTrainingSettings();
  const queryClient = useQueryClient();
  const analyzeInFlightRef = useRef(false);
  const importInFlightRef = useRef(false);
  const [rawJson, setRawJson] = useState('');
  const rawJsonRef = useRef('');
  const [analyzedDocument, setAnalyzedDocument] = useState<TrainingPlanImportDocument | null>(null);
  const [analysisErrors, setAnalysisErrors] = useState<TrainingPlanValidationError[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState(0);
  const [isImporting, setIsImporting] = useState(false);

  const parsed = useMemo(() => (rawJson.trim() ? parseTrainingPlanJson(rawJson) : null), [rawJson]);
  const validationErrors = analysisErrors.length > 0 ? analysisErrors : parsed && !parsed.ok ? parsed.errors : [];
  const document = analyzedDocument;

  const updateRawJson = useCallback((value: string) => {
    rawJsonRef.current = value;
    setRawJson(value);
    setAnalyzedDocument(null);
    setAnalysisErrors([]);
  }, []);

  const analyze = useCallback(async () => {
    if (analyzeInFlightRef.current || importInFlightRef.current) return 'error';
    logTrainingPlanImport('analyze:start', {
      rawLength: rawJson.length,
      parsed: Boolean(parsed?.ok),
      validationErrors: parsed && !parsed.ok ? parsed.errors.length : 0,
    });
    const sourceText = rawJson;
    analyzeInFlightRef.current = true;
    setIsAnalyzing(true);
    try {
      setAnalysisProgress(12);
      await new Promise(resolve => setTimeout(resolve, 80));
      setAnalysisProgress(42);
      const result = await analyzeTrainingPlanJson(sourceText, preflightTrainingPlanExercises);
      setAnalysisProgress(88);
      if (rawJsonRef.current !== sourceText) {
        setAnalyzedDocument(null);
        setAnalysisErrors([]);
        return 'error';
      }
      if (result.ok) {
        setAnalyzedDocument(result.value);
        setAnalysisErrors([]);
      } else {
        setAnalyzedDocument(null);
        setAnalysisErrors(result.errors);
      }
      setAnalysisProgress(100);
      logTrainingPlanImport('analyze:complete', {
        result: result.ok ? 'ok' : 'error',
        validationErrors: result.ok ? 0 : result.errors.length,
      });
      return result.ok ? 'ok' : 'error';
    } finally {
      analyzeInFlightRef.current = false;
      setIsAnalyzing(false);
    }
  }, [parsed, rawJson]);

  const importPlan = useCallback(async () => {
    if (!user || !document || importInFlightRef.current || analyzeInFlightRef.current)
      return { ok: false as const, kind: 'busy' as const };
    logTrainingPlanImport('import:start', {
      planName: document.plan_name,
      weeks: document.weeks.length,
      sessions: document.weeks.reduce((count, week) => count + week.sessions.length, 0),
      autoDeleteExpiredTemplates: settings.autoDeleteExpiredTemplates,
    });
    importInFlightRef.current = true;
    setIsImporting(true);
    try {
      const result = await importTrainingPlan(user.id, document, {
        autoDeleteExpiredTemplates: settings.autoDeleteExpiredTemplates,
      });
      invalidateTrainingCalendar(queryClient);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['gymRoutines'] }),
        queryClient.invalidateQueries({ queryKey: ['enduranceTemplates'] }),
      ]);
      logTrainingPlanImport('import:complete', result);
      return { ok: true as const, ...result };
    } catch (error) {
      logTrainingPlanImportError('import:failed', error, { planName: document.plan_name });
      return { ok: false as const, kind: 'error' as const, error };
    } finally {
      importInFlightRef.current = false;
      setIsImporting(false);
    }
  }, [document, queryClient, settings.autoDeleteExpiredTemplates, user]);

  return {
    rawJson,
    setRawJson: updateRawJson,
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
