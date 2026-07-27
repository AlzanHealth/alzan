import { useCallback, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { useAuth } from '../../../context/AuthContext';
import { searchIngredients } from '../../../services/ingredientsService';
import { parseMenuImportJson, type MenuImportValidationError } from '../services/menuImportContract';
import {
  createSupabaseMenuImportAdapter,
  executeMenuImport,
  fetchMenuImportCalendarSnapshot,
  MenuImportSnapshotStaleError,
} from '../services/menuImportPersistence';
import {
  buildMenuImportPreview,
  isMenuImportPreviewReady,
  resolveMenuImportIngredients,
  selectMenuImportIngredient,
  setMenuImportConflictDecision,
  type MenuImportConflictDecision,
  type MenuImportIngredientProgress,
  type MenuImportPreview,
} from '../services/menuImportPlanner';
import { isMenuImportOperationBlocked } from '../services/menuImportOperationGuard';

const NUTRITION_QUERY_KEYS = ['mealLogs', 'mealItems', 'dayNutrition', 'personalFoodTrends', 'shoppingList'] as const;

export type MenuImportFailureKind = 'generic';

export type MenuImportResult =
  | { ok: true; firstDate: string }
  | { ok: false; kind: MenuImportFailureKind | 'busy' | 'stale' };

export type MenuImportAnalysisResult = 'invalid' | 'error' | 'success';

export type MenuImportAnalysisProgress = MenuImportIngredientProgress & {
  phase: 'ingredients' | 'preparing';
  percentage: number;
};

export function useMenuImport() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const adapter = useMemo(() => createSupabaseMenuImportAdapter(), []);
  const importInFlightRef = useRef(false);
  const analyzeInFlightRef = useRef(false);
  const rawJsonRef = useRef('');

  const [rawJson, setRawJsonState] = useState('');
  const [validationErrors, setValidationErrors] = useState<MenuImportValidationError[]>([]);
  const [preview, setPreview] = useState<MenuImportPreview | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState<MenuImportAnalysisProgress | null>(null);
  const [requiresReanalysis, setRequiresReanalysis] = useState(false);

  const refreshNutritionQueries = useCallback(async () => {
    await Promise.allSettled(
      NUTRITION_QUERY_KEYS.map(queryKey => queryClient.invalidateQueries({ queryKey: [queryKey] })),
    );
  }, [queryClient]);

  const setRawJson = useCallback((value: string) => {
    rawJsonRef.current = value;
    setRawJsonState(value);
    setValidationErrors([]);
    setRequiresReanalysis(true);
  }, []);

  const analyze = useCallback(async (): Promise<MenuImportAnalysisResult> => {
    if (analyzeInFlightRef.current || importInFlightRef.current) {
      return 'error';
    }

    const sourceText = rawJsonRef.current;
    const parsed = parseMenuImportJson(sourceText);
    if (!parsed.ok) {
      setValidationErrors(parsed.errors);
      setRequiresReanalysis(true);
      return 'invalid';
    }
    if (!user) {
      setRequiresReanalysis(true);
      return 'error';
    }

    analyzeInFlightRef.current = true;
    setIsAnalyzing(true);
    setAnalysisProgress({ completed: 0, total: 0, phase: 'ingredients', percentage: 0 });
    setValidationErrors([]);

    try {
      const dates = Array.from(new Set(parsed.value.days.map(day => day.date))).sort();
      const [resolutions, calendarSnapshot] = await Promise.all([
        resolveMenuImportIngredients(
          parsed.value,
          async ingredientName => {
            const results = await searchIngredients(ingredientName, undefined, 5);

            return results.map(result => ({
              id: result.id,
              name: result.name,
              kcal_100: Number(result.kcal_100 ?? 0),
              protein_g_100: Number(result.protein_g_100 ?? 0),
              carbs_g_100: Number(result.carbs_g_100 ?? 0),
              fat_g_100: Number(result.fat_g_100 ?? 0),
            }));
          },
          {
            onProgress: progress => {
              setAnalysisProgress({
                ...progress,
                phase: 'ingredients',
                percentage: progress.total === 0 ? 0 : Math.round((progress.completed / progress.total) * 90),
              });
            },
          },
        ),
        fetchMenuImportCalendarSnapshot(dates),
      ]);

      setAnalysisProgress({
        completed: resolutions.length,
        total: resolutions.length,
        phase: 'preparing',
        percentage: 95,
      });
      const nextPreview = buildMenuImportPreview(parsed.value, resolutions, calendarSnapshot.logs, calendarSnapshot);

      setPreview(nextPreview);
      setRequiresReanalysis(rawJsonRef.current !== sourceText);
      return 'success';
    } catch {
      setRequiresReanalysis(true);
      return 'error';
    } finally {
      analyzeInFlightRef.current = false;
      setIsAnalyzing(false);
      setAnalysisProgress(null);
    }
  }, [user]);

  const selectIngredient = useCallback((ingredientKey: string, ingredientId: string) => {
    setPreview(current =>
      current === null ? current : selectMenuImportIngredient(current, ingredientKey, ingredientId),
    );
  }, []);

  const setConflictDecision = useCallback((mealKey: string, decision: MenuImportConflictDecision) => {
    setPreview(current => (current === null ? current : setMenuImportConflictDecision(current, mealKey, decision)));
  }, []);

  const hasMealToImport =
    preview?.meals.some(meal => meal.conflict === null || meal.conflict.decision !== 'ignore') ?? false;
  const canImport =
    preview !== null &&
    isMenuImportPreviewReady(preview) &&
    hasMealToImport &&
    !requiresReanalysis &&
    !isAnalyzing &&
    !isImporting;

  const importMenu = useCallback(async (): Promise<MenuImportResult> => {
    if (isMenuImportOperationBlocked(importInFlightRef.current, analyzeInFlightRef.current)) {
      return { ok: false, kind: 'busy' };
    }

    const currentPreview = preview;
    const ready =
      currentPreview !== null &&
      isMenuImportPreviewReady(currentPreview) &&
      currentPreview.meals.some(meal => meal.conflict === null || meal.conflict.decision !== 'ignore') &&
      !requiresReanalysis &&
      !isAnalyzing;

    if (!ready || !user) {
      return { ok: false, kind: 'generic' };
    }

    importInFlightRef.current = true;
    setIsImporting(true);

    try {
      const result = await executeMenuImport(user.id, currentPreview, adapter);
      await refreshNutritionQueries();
      return { ok: true, firstDate: result.firstDate };
    } catch (error: unknown) {
      if (error instanceof MenuImportSnapshotStaleError) {
        setRequiresReanalysis(true);
        return { ok: false, kind: 'stale' };
      }
      return { ok: false, kind: 'generic' };
    } finally {
      importInFlightRef.current = false;
      setIsImporting(false);
    }
  }, [adapter, isAnalyzing, preview, refreshNutritionQueries, requiresReanalysis, user]);

  return {
    rawJson,
    setRawJson,
    validationErrors,
    preview,
    isAnalyzing,
    analysisProgress,
    isImporting,
    isLoading: isAnalyzing || isImporting,
    requiresReanalysis,
    canImport,
    analyze,
    importMenu,
    selectIngredient,
    setConflictDecision,
  };
}
