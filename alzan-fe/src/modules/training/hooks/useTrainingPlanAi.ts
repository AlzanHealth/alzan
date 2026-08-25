import { useCallback, useEffect, useState } from 'react';
import { Platform } from 'react-native';
import * as Linking from 'expo-linking';
import { copyTextToClipboard } from '../../../utils/clipboard';
import {
  fetchTrainingExerciseAiCatalog,
  preloadTrainingExerciseAiCatalog,
} from '../services/trainingPlanAiCatalogService';
import { buildTrainingPlanAiPrompt, serializeTrainingExerciseAiClipboardCsv } from '../services/trainingPlanAiPrompt';
import {
  buildAiClipboardText,
  buildTrainingAiLaunchTarget,
  isAiCatalogReady,
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
  const [catalog, setCatalog] = useState<Awaited<ReturnType<typeof fetchTrainingExerciseAiCatalog>> | null>(null);
  const [isCatalogLoading, setIsCatalogLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    void preloadTrainingExerciseAiCatalog()
      .then(nextCatalog => {
        if (cancelled) return;
        setCatalog(nextCatalog);
      })
      .catch(() => {
        if (cancelled) return;
        setCatalog(null);
      })
      .finally(() => {
        if (!cancelled) setIsCatalogLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const launchWithAi = useCallback(
    async (provider: TrainingAiProvider): Promise<TrainingAiLaunchResult> => {
      const cachedCatalog = catalog;
      if (isLaunching || !isAiCatalogReady(cachedCatalog?.length ?? 0, isCatalogLoading) || !cachedCatalog) {
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
    [catalog, isCatalogLoading, isLaunching],
  );

  return { isLaunching, isCatalogLoading, launchWithAi };
};
