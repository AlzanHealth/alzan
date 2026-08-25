import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import * as Linking from 'expo-linking';
import { copyTextToClipboard } from '../../../utils/clipboard';
import { preloadTrainingExerciseAiCatalog } from '../services/trainingPlanAiCatalogService';
import { TrainingExerciseAiCatalogTimeoutError } from '../services/trainingPlanAiCatalog';
import { buildTrainingPlanAiPrompt, serializeTrainingExerciseAiClipboardCsv } from '../services/trainingPlanAiPrompt';
import type { TrainingExerciseAiCatalogRow } from '../services/trainingPlanAiPrompt';
import {
  buildAiClipboardText,
  buildTrainingAiLaunchTarget,
  type TrainingAiLaunchResult,
  type TrainingAiProvider,
} from '../services/trainingPlanAiProvider';

const openTrainingAiTarget = async (url: string, reservedWindow: Window | null): Promise<void> => {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    // The complete URL is opened synchronously from the user gesture below.
    // Navigating an about:blank popup after awaiting the clipboard is
    // unreliable on Safari/iOS.
    if (!reservedWindow || reservedWindow.closed) throw new Error('Unable to open AI provider in a new window');
    return;
  }

  const canOpen = await Linking.canOpenURL(url);
  if (!canOpen) throw new Error('Unable to open AI provider');
  await Linking.openURL(url);
};

export const useTrainingPlanAi = () => {
  const [isLaunching, setIsLaunching] = useState(false);
  const [catalog, setCatalog] = useState<TrainingExerciseAiCatalogRow[] | null>(null);
  const [catalogStatus, setCatalogStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [catalogErrorKind, setCatalogErrorKind] = useState<'timeout' | 'load' | null>(null);
  const catalogRequestVersionRef = useRef(0);

  const loadCatalog = useCallback(async (): Promise<void> => {
    const requestVersion = catalogRequestVersionRef.current + 1;
    catalogRequestVersionRef.current = requestVersion;
    setCatalogStatus('loading');
    setCatalogErrorKind(null);

    try {
      const nextCatalog = await preloadTrainingExerciseAiCatalog();
      if (catalogRequestVersionRef.current !== requestVersion) return;
      setCatalog(nextCatalog);
      setCatalogStatus('ready');
    } catch (error) {
      if (catalogRequestVersionRef.current !== requestVersion) return;
      setCatalog(null);
      setCatalogErrorKind(error instanceof TrainingExerciseAiCatalogTimeoutError ? 'timeout' : 'load');
      setCatalogStatus('error');
    }
  }, []);

  useEffect(() => {
    void loadCatalog();

    return () => {
      catalogRequestVersionRef.current += 1;
    };
  }, [loadCatalog]);

  const retryCatalog = useCallback((): void => {
    void loadCatalog();
  }, [loadCatalog]);

  const launchWithAi = useCallback(
    async (provider: TrainingAiProvider): Promise<TrainingAiLaunchResult> => {
      const cachedCatalog = catalog;
      if (isLaunching || catalogStatus !== 'ready' || !cachedCatalog || cachedCatalog.length === 0) {
        return { ok: false, kind: isLaunching ? 'open-error' : 'catalog-error' };
      }

      const prompt = buildTrainingPlanAiPrompt(cachedCatalog);
      const target = buildTrainingAiLaunchTarget(provider, prompt);
      const reservedWindow =
        Platform.OS === 'web' && typeof window !== 'undefined' ? window.open(target.url, '_blank') : null;

      setIsLaunching(true);
      try {
        try {
          const exerciseCsv = serializeTrainingExerciseAiClipboardCsv(cachedCatalog);
          await copyTextToClipboard(buildAiClipboardText(target, prompt, exerciseCsv));
        } catch {
          reservedWindow?.close();
          return { ok: false, kind: 'clipboard-error' };
        }

        try {
          await openTrainingAiTarget(target.url, reservedWindow);
        } catch {
          reservedWindow?.close();
          return { ok: false, kind: 'open-error' };
        }

        return { ok: true, provider, mode: target.mode };
      } finally {
        setIsLaunching(false);
      }
    },
    [catalog, catalogStatus, isLaunching],
  );

  return { catalogStatus, catalogErrorKind, retryCatalog, isLaunching, launchWithAi };
};
