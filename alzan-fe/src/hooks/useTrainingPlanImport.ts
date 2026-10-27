import { useCallback, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  parseTrainingPlanJson,
  type TrainingPlanImportDocument,
  type TrainingPlanValidationError,
} from '../modules/training/services/trainingPlanImportContract';
import {
  importTrainingPlan,
  resolveTrainingPlanExerciseResolutions,
  searchTrainingPlanExerciseCandidates,
  type TrainingPlanImportProgress,
} from '../modules/training/services/trainingPlanImportService';
import { getTrainingPlanExerciseMetricValidationErrors } from '../modules/training/services/trainingPlanStrengthTarget.helper';
import {
  areTrainingPlanExerciseResolutionsReady,
  selectTrainingPlanExerciseCandidate,
  type TrainingExerciseResolution,
} from '../modules/training/services/trainingPlanImportExerciseResolver';
import { analyzeTrainingPlanJson } from '../modules/training/services/trainingPlanImportAnalysis';
import { useAuth } from '../context/AuthContext';
import { useTrainingSettings } from './useTrainingSettings';
import {
  logTrainingPlanImport,
  logTrainingPlanImportError,
} from '../modules/training/services/trainingPlanImportLogger';
import { invalidateTrainingCalendar } from '../lib/trainingQueryKeys';

export const useTrainingPlanImport = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { settings } = useTrainingSettings();
  const queryClient = useQueryClient();
  const analyzeInFlightRef = useRef(false);
  const importInFlightRef = useRef(false);
  const [rawJson, setRawJson] = useState('');
  const rawJsonRef = useRef('');
  const [analyzedDocument, setAnalyzedDocument] = useState<TrainingPlanImportDocument | null>(null);
  const [analysisErrors, setAnalysisErrors] = useState<TrainingPlanValidationError[]>([]);
  const [exerciseResolutions, setExerciseResolutions] = useState<TrainingExerciseResolution[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState(0);
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState<TrainingPlanImportProgress | null>(null);

  const parsed = useMemo(() => (rawJson.trim() ? parseTrainingPlanJson(rawJson) : null), [rawJson]);
  const document = analyzedDocument;
  const exerciseMetricErrors = useMemo(
    () => getTrainingPlanExerciseMetricValidationErrors(document, exerciseResolutions),
    [document, exerciseResolutions],
  );
  const baseValidationErrors = analysisErrors.length > 0 ? analysisErrors : parsed && !parsed.ok ? parsed.errors : [];
  const validationErrors = [
    ...baseValidationErrors,
    ...exerciseMetricErrors.map(error => ({
      code: 'invalid_session_shape' as const,
      path: error.path,
      message: t(
        error.issue.kind === 'timed_catalog_type_required'
          ? 'training.trainingPlanTimedCatalogTypeRequired'
          : error.issue.kind === 'timed_needs_duration'
            ? 'training.trainingPlanTimedNeedsDuration'
            : 'training.trainingPlanRepsNeedRepetitions',
        { exercise: error.issue.exerciseName },
      ),
    })),
  ];

  const updateRawJson = useCallback((value: string) => {
    rawJsonRef.current = value;
    setRawJson(value);
    setAnalyzedDocument(null);
    setAnalysisErrors([]);
    setExerciseResolutions([]);
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
      let nextExerciseResolutions: TrainingExerciseResolution[] = [];
      const result = await analyzeTrainingPlanJson(sourceText, async trainingDocument => {
        nextExerciseResolutions = await resolveTrainingPlanExerciseResolutions(trainingDocument);
      });
      setAnalysisProgress(88);
      if (rawJsonRef.current !== sourceText) {
        setAnalyzedDocument(null);
        setAnalysisErrors([]);
        return 'error';
      }
      if (result.ok) {
        setAnalyzedDocument(result.value);
        setAnalysisErrors([]);
        setExerciseResolutions(nextExerciseResolutions);
      } else {
        setAnalyzedDocument(null);
        setAnalysisErrors(result.errors);
        setExerciseResolutions([]);
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

  const selectExerciseCandidate = useCallback((resolutionKey: string, candidateId: string) => {
    setExerciseResolutions(current => selectTrainingPlanExerciseCandidate(current, resolutionKey, candidateId));
  }, []);

  const searchExerciseCandidates = useCallback(async (resolutionKey: string, query: string) => {
    const candidates = await searchTrainingPlanExerciseCandidates(query);
    setExerciseResolutions(current =>
      current.map(resolution =>
        resolution.resolutionKey === resolutionKey
          ? { ...resolution, candidates, selectedCandidate: null }
          : resolution,
      ),
    );
  }, []);

  const importPlan = useCallback(async () => {
    if (!user || !document || importInFlightRef.current || analyzeInFlightRef.current)
      return { ok: false as const, kind: 'busy' as const };
    if (exerciseMetricErrors.length > 0) return { ok: false as const, kind: 'invalid-exercise-metric' as const };
    if (!areTrainingPlanExerciseResolutionsReady(exerciseResolutions)) {
      return { ok: false as const, kind: 'unresolved-exercises' as const };
    }
    logTrainingPlanImport('import:start', {
      planName: document.plan_name,
      weeks: document.weeks.length,
      sessions: document.weeks.reduce((count, week) => count + week.sessions.length, 0),
      autoDeleteExpiredTemplates: settings.autoDeleteExpiredTemplates,
    });
    importInFlightRef.current = true;
    setIsImporting(true);
    setImportProgress({ phase: 'preparing', percentage: 0 });
    try {
      const result = await importTrainingPlan(user.id, document, {
        autoDeleteExpiredTemplates: settings.autoDeleteExpiredTemplates,
        exerciseResolutions,
        onProgress: setImportProgress,
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
      setImportProgress(null);
    }
  }, [document, exerciseMetricErrors, exerciseResolutions, queryClient, settings.autoDeleteExpiredTemplates, user]);

  const exerciseResolutionReady = areTrainingPlanExerciseResolutionsReady(exerciseResolutions);

  return {
    rawJson,
    setRawJson: updateRawJson,
    validationErrors,
    document,
    isAnalyzing,
    analysisProgress,
    isImporting,
    importProgress,
    canImport:
      !!document && exerciseResolutionReady && exerciseMetricErrors.length === 0 && !isAnalyzing && !isImporting,
    exerciseResolutions,
    selectExerciseCandidate,
    searchExerciseCandidates,
    analyze,
    importPlan,
  };
};
